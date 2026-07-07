// Geometry helpers for the cinematic tour — derive centroid / bounds / entrance
// for each room from its vertex loop. Rooms store only `vertexIds` (plan.ts:51),
// so center/bbox must be computed. All output is in "scene meters" space, i.e.
// the same space Viewer3D renders in (planToMeters applied to raw vertex coords).

import { Plan, Room, Opening } from "@/lib/types/plan";
import { planToMeters } from "@/components/viewer/Viewer3D";

export interface Vec2 {
  x: number;
  z: number; // scene Z = plan Y
}

export interface RoomGeometry {
  roomId: string;
  name: string;
  type: string;
  floor: number;
  /** Polygon in scene-meters (x, z) */
  poly: Vec2[];
  centroid: Vec2;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Half-diagonal of bounds — used to size orbit radius / crane height */
  radius: number;
  area: number;
  /** Best-guess entrance point (a door opening on a room wall), else null */
  entrance: Vec2 | null;
}

function polyArea(poly: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.z - q.x * p.z;
  }
  return Math.abs(a) / 2;
}

/** Area-weighted polygon centroid (falls back to vertex average for degenerate polys). */
function polyCentroid(poly: Vec2[]): Vec2 {
  let cx = 0, cz = 0, signedA = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const cross = p.x * q.z - q.x * p.z;
    signedA += cross;
    cx += (p.x + q.x) * cross;
    cz += (p.z + q.z) * cross;
  }
  if (Math.abs(signedA) < 1e-6) {
    const n = poly.length;
    return {
      x: poly.reduce((s, p) => s + p.x, 0) / n,
      z: poly.reduce((s, p) => s + p.z, 0) / n,
    };
  }
  signedA *= 0.5;
  return { x: cx / (6 * signedA), z: cz / (6 * signedA) };
}

/** Midpoint (scene-meters) of an opening on a wall, or null if wall/verts missing. */
function openingPoint(plan: Plan, op: Opening): Vec2 | null {
  const wall = plan.walls[op.wallId];
  if (!wall) return null;
  const s = plan.vertices[wall.startId];
  const e = plan.vertices[wall.endId];
  if (!s || !e) return null;
  const sx = planToMeters(s.x), sz = planToMeters(s.y);
  const ex = planToMeters(e.x), ez = planToMeters(e.y);
  return {
    x: sx + (ex - sx) * op.position,
    z: sz + (ez - sz) * op.position,
  };
}

/** Which door opening (if any) sits on an edge of this room's polygon. */
function findEntrance(plan: Plan, room: Room): Vec2 | null {
  const roomVertSet = new Set(room.vertexIds);
  const doors = Object.values(plan.openings).filter((o) => o.type === "door");
  for (const door of doors) {
    const wall = plan.walls[door.wallId];
    if (!wall) continue;
    // Wall belongs to this room if both its endpoints are room vertices.
    if (roomVertSet.has(wall.startId) && roomVertSet.has(wall.endId)) {
      const p = openingPoint(plan, door);
      if (p) return p;
    }
  }
  // Fallback: nearest door to the room centroid.
  return null;
}

export function computeRoomGeometry(plan: Plan, room: Room): RoomGeometry | null {
  const verts = room.vertexIds.map((id) => plan.vertices[id]).filter(Boolean);
  if (verts.length < 3) return null;
  const poly: Vec2[] = verts.map((v) => ({ x: planToMeters(v.x), z: planToMeters(v.y) }));

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  const centroid = polyCentroid(poly);
  const w = maxX - minX, d = maxZ - minZ;
  const radius = Math.sqrt(w * w + d * d) / 2;

  return {
    roomId: room.id,
    name: room.name,
    type: room.type,
    floor: room.floor ?? 0,
    poly,
    centroid,
    bounds: { minX, maxX, minZ, maxZ },
    radius: Math.max(radius, 1),
    area: polyArea(poly),
    entrance: findEntrance(plan, room),
  };
}

/** All room geometries, largest-area first (a sensible default tour order:
 * big living spaces open the reel). */
export function allRoomGeometries(plan: Plan): RoomGeometry[] {
  return Object.values(plan.rooms)
    .map((r) => computeRoomGeometry(plan, r))
    .filter((g): g is RoomGeometry => g !== null)
    .sort((a, b) => b.area - a.area);
}

/** Straight-line distance between two scene points. */
export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
