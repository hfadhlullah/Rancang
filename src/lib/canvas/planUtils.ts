import { Plan, Room, Vertex } from "@/lib/types/plan";
import { polygonArea, Point } from "./geometry";

/** Recalculate area for all rooms. Returns updated plan. */
export function recalcRoomAreas(plan: Plan): Plan {
  const rooms = { ...plan.rooms };
  for (const roomId in rooms) {
    const room = rooms[roomId];
    const pts: Point[] = room.vertexIds
      .map((id) => plan.vertices[id])
      .filter(Boolean)
      .map((v) => ({ x: v.x, y: v.y }));
    if (pts.length >= 3) {
      const ppm = plan.metadata.pixelsPerMeter;
      const areaPx2 = polygonArea(pts);
      rooms[roomId] = { ...room, area: areaPx2 / (ppm * ppm) };
    }
  }
  return { ...plan, rooms };
}

/** Find wall closest to point. Returns wallId + t position (0–1) + distance, or null. */
export function findClosestWall(
  plan: Plan,
  px: number,
  py: number,
  maxDistPx: number
): { wallId: string; t: number; dist: number; projX: number; projY: number } | null {
  let best: { wallId: string; t: number; dist: number; projX: number; projY: number } | null = null;

  for (const wall of Object.values(plan.walls)) {
    const sv = plan.vertices[wall.startId];
    const ev = plan.vertices[wall.endId];
    if (!sv || !ev) continue;

    const dx = ev.x - sv.x;
    const dy = ev.y - sv.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 0.001) continue;

    const t = Math.max(0, Math.min(1, ((px - sv.x) * dx + (py - sv.y) * dy) / lenSq));
    const projX = sv.x + t * dx;
    const projY = sv.y + t * dy;
    const dist = Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);

    if (dist <= maxDistPx && (!best || dist < best.dist)) {
      best = { wallId: wall.id, t, dist, projX, projY };
    }
  }
  return best;
}

/** Room colors by type */
export const ROOM_COLORS: Record<string, string> = {
  bedroom: "#dbeafe",
  bathroom: "#d1fae5",
  kitchen: "#fef3c7",
  living: "#ede9fe",
  dining: "#fce7f3",
  corridor: "#f1f5f9",
  storage: "#f5f5f4",
  garage: "#e5e7eb",
  outdoor: "#dcfce7",
  other: "#f9fafb",
};
