import { Plan, Room, RoomType } from "@/lib/types/plan";
import { nanoid } from "nanoid";

const AUTO_COLORS = [
  "#dbeafe", "#dcfce7", "#fef9c3", "#fce7f3", "#ede9fe",
  "#ffedd5", "#cffafe", "#f0fdf4", "#fdf4ff", "#fff7ed",
];

/**
 * Scan all vertices and split any wall whose body contains a vertex that isn't
 * its own endpoint (T-junction repair). Also snaps the vertex onto the wall line
 * to eliminate floating-point gaps. Runs to fixpoint.
 */
/** Merge wall endpoints that are within SNAP_PX of each other into a single vertex. */
function mergeCloseVertices(plan: Plan): Plan {
  const SNAP_PX = 3; // only merge truly coincident vertices (float drift), not legitimately close ones
  let result = plan;
  let dirty = true;

  while (dirty) {
    dirty = false;
    const verts = Object.values(result.vertices);
    for (let i = 0; i < verts.length; i++) {
      for (let j = i + 1; j < verts.length; j++) {
        const a = verts[i], b = verts[j];
        if ((a.floor ?? 0) !== (b.floor ?? 0)) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y) > SNAP_PX) continue;

        // Keep a, redirect all wall references from b to a
        const newWalls = { ...result.walls };
        for (const [wid, wall] of Object.entries(newWalls)) {
          const newStart = wall.startId === b.id ? a.id : wall.startId;
          const newEnd = wall.endId === b.id ? a.id : wall.endId;
          if (newStart === newEnd) { delete newWalls[wid]; continue; } // self-loop → drop
          if (newStart !== wall.startId || newEnd !== wall.endId) {
            newWalls[wid] = { ...wall, startId: newStart, endId: newEnd };
          }
        }
        const newVertices = { ...result.vertices };
        delete newVertices[b.id];
        const newOpenings = { ...result.openings };
        for (const [oid, o] of Object.entries(newOpenings)) {
          if (o.wallId && !newWalls[o.wallId]) delete newOpenings[oid];
        }
        result = { ...result, vertices: newVertices, walls: newWalls, openings: newOpenings };
        dirty = true;
        break;
      }
      if (dirty) break;
    }
  }
  return result;
}

function repairTJunctions(plan: Plan): Plan {
  const TOLERANCE = 15; // px — match VERTEX_SNAP_PX so off-grid walls are still caught
  let result = plan;
  let dirty = true;

  while (dirty) {
    dirty = false;
    const verts = Object.values(result.vertices);
    const walls = Object.values(result.walls);

    outer:
    for (const vertex of verts) {
      const vFloor = vertex.floor ?? 0;
      for (const wall of walls) {
        if ((wall.floor ?? 0) !== vFloor) continue;
        if (wall.startId === vertex.id || wall.endId === vertex.id) continue;

        const sv = result.vertices[wall.startId];
        const ev = result.vertices[wall.endId];
        if (!sv || !ev) continue;

        const dx = ev.x - sv.x, dy = ev.y - sv.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq < 1) continue;

        const t = ((vertex.x - sv.x) * dx + (vertex.y - sv.y) * dy) / lenSq;
        if (t <= 0.01 || t >= 0.99) continue;

        const cx = sv.x + t * dx, cy = sv.y + t * dy;
        if (Math.hypot(vertex.x - cx, vertex.y - cy) > TOLERANCE) continue;

        // Snap vertex exactly onto wall line, then split the wall
        const snappedVertex = { ...vertex, x: cx, y: cy };
        const newVertices = { ...result.vertices, [vertex.id]: snappedVertex };

        const newWalls = { ...result.walls };
        delete newWalls[wall.id];
        const w1 = nanoid(), w2 = nanoid();
        newWalls[w1] = { ...wall, id: w1, endId: vertex.id };
        newWalls[w2] = { ...wall, id: w2, startId: vertex.id };

        const newOpenings = { ...result.openings };
        for (const [oid, o] of Object.entries(newOpenings)) {
          if (o.wallId !== wall.id) continue;
          if (o.position < t) {
            newOpenings[oid] = { ...o, wallId: w1, position: o.position / t };
          } else {
            newOpenings[oid] = { ...o, wallId: w2, position: (o.position - t) / (1 - t) };
          }
        }

        result = { ...result, vertices: newVertices, walls: newWalls, openings: newOpenings };
        dirty = true;
        break outer;
      }
    }
  }

  return result;
}

function detectPolygonsForFloor(
  vertices: Plan["vertices"],
  walls: Plan["walls"],
  floor: number
): string[][] {
  const floorWalls = Object.values(walls).filter(
    (w) => (w.floor ?? 0) === floor
  );
  if (floorWalls.length === 0) return [];

  const adj = new Map<string, Set<string>>();
  for (const wall of floorWalls) {
    if (!vertices[wall.startId] || !vertices[wall.endId]) continue;
    if (!adj.has(wall.startId)) adj.set(wall.startId, new Set());
    if (!adj.has(wall.endId)) adj.set(wall.endId, new Set());
    adj.get(wall.startId)!.add(wall.endId);
    adj.get(wall.endId)!.add(wall.startId);
  }

  const sortedNeighbors = new Map<string, string[]>();
  for (const [vid, neighbors] of adj.entries()) {
    const v = vertices[vid];
    if (!v) continue;
    sortedNeighbors.set(
      vid,
      [...neighbors].sort((a, b) => {
        const va = vertices[a], vb = vertices[b];
        if (!va || !vb) return 0;
        return (
          Math.atan2(va.y - v.y, va.x - v.x) -
          Math.atan2(vb.y - v.y, vb.x - v.x)
        );
      })
    );
  }

  function nextHalfEdge(u: string, v: string): string | null {
    const neighbors = sortedNeighbors.get(v);
    if (!neighbors || neighbors.length === 0) return null;
    const idx = neighbors.indexOf(u);
    if (idx === -1) return null;
    return neighbors[(idx - 1 + neighbors.length) % neighbors.length];
  }

  const visited = new Set<string>();
  const faces: string[][] = [];

  for (const wall of floorWalls) {
    for (const [u, v] of [
      [wall.startId, wall.endId],
      [wall.endId, wall.startId],
    ] as [string, string][]) {
      if (!vertices[u] || !vertices[v]) continue;
      if (visited.has(`${u}>${v}`)) continue;

      const face: string[] = [];
      let cu = u, cv = v, iters = 0;

      do {
        visited.add(`${cu}>${cv}`);
        face.push(cu);
        const next = nextHalfEdge(cu, cv);
        if (!next) { face.length = 0; break; }
        cu = cv;
        cv = next;
      } while ((cu !== u || cv !== v) && ++iters < 500);

      if (cu === u && cv === v && face.length >= 3) {
        faces.push(face);
      }
    }
  }

  function signedArea(vids: string[]): number {
    let a = 0;
    for (let i = 0; i < vids.length; i++) {
      const p = vertices[vids[i]];
      const q = vertices[vids[(i + 1) % vids.length]];
      if (!p || !q) continue;
      a += p.x * q.y - q.x * p.y;
    }
    return a / 2;
  }

  // Inner faces = CW winding in Y-down canvas = positive shoelace area
  return faces.filter((f) => signedArea(f) > 0);
}

function computeAreaM2(
  vids: string[],
  vertices: Plan["vertices"],
  ppm: number
): number {
  let a = 0;
  for (let i = 0; i < vids.length; i++) {
    const p = vertices[vids[i]];
    const q = vertices[vids[(i + 1) % vids.length]];
    if (!p || !q) continue;
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a / 2) / (ppm * ppm);
}

/**
 * Re-derive plan.rooms from the current wall graph.
 * Also repairs T-junctions before detection and returns the full updated plan.
 * Preserves existing room properties (name, type, color) when vertex set matches.
 */
export function reconcileAutoRooms(plan: Plan): Plan {
  // 1. Merge near-duplicate vertices (broken elbows)
  // 2. Repair T-junctions (snap endpoints onto wall bodies + split)
  const merged = mergeCloseVertices(plan);
  const repaired = repairTJunctions(merged);
  const ppm = repaired.metadata.pixelsPerMeter ?? 50;

  const floors = new Set<number>();
  Object.values(repaired.walls).forEach((w) => floors.add(w.floor ?? 0));

  const detected: Array<{ floor: number; vids: string[] }> = [];
  for (const floor of floors) {
    detectPolygonsForFloor(repaired.vertices, repaired.walls, floor).forEach((vids) =>
      detected.push({ floor, vids })
    );
  }

  const existingBySig = new Map<string, Room>();
  for (const room of Object.values(repaired.rooms)) {
    existingBySig.set([...room.vertexIds].sort().join(","), room);
  }

  const newRooms: Plan["rooms"] = {};
  let autoCount = 0;

  for (const { floor, vids } of detected) {
    const sig = [...vids].sort().join(",");
    const existing = existingBySig.get(sig);
    const area = computeAreaM2(vids, repaired.vertices, ppm);

    if (existing) {
      newRooms[existing.id] = { ...existing, vertexIds: vids, floor, area };
      existingBySig.delete(sig);
    } else {
      autoCount++;
      const id = nanoid();
      const name = `Room ${Object.values(repaired.rooms).length + autoCount}`;
      newRooms[id] = {
        id,
        name,
        type: "other" as RoomType,
        vertexIds: vids,
        floor,
        area,
        color: AUTO_COLORS[autoCount % AUTO_COLORS.length],
      };
    }
  }

  return { ...repaired, rooms: newRooms };
}
