export interface Point { x: number; y: number }

export function distance(a: Point, b: Point): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

export function snapToGrid(p: Point, gridPx: number): Point {
  return {
    x: Math.round(p.x / gridPx) * gridPx,
    y: Math.round(p.y / gridPx) * gridPx,
  };
}

/** Snap to nearest vertex within threshold. Returns snapped point + vertex id, or null. */
export function snapToVertex(
  p: Point,
  vertices: Array<{ id: string; x: number; y: number }>,
  thresholdPx: number
): { point: Point; vertexId: string } | null {
  let best: { point: Point; vertexId: string; dist: number } | null = null;
  for (const v of vertices) {
    const d = distance(p, v);
    if (d < thresholdPx && (!best || d < best.dist)) {
      best = { point: { x: v.x, y: v.y }, vertexId: v.id, dist: d };
    }
  }
  return best ? { point: best.point, vertexId: best.vertexId } : null;
}

/** Wall rectangle corners given two endpoints and thickness (all in px) */
export function wallRect(
  ax: number, ay: number,
  bx: number, by: number,
  thickness: number
): [Point, Point, Point, Point] {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.001) return [{ x: ax, y: ay }, { x: ax, y: ay }, { x: ax, y: ay }, { x: ax, y: ay }];
  const nx = (-dy / len) * (thickness / 2);
  const ny = (dx / len) * (thickness / 2);
  return [
    { x: ax + nx, y: ay + ny },
    { x: bx + nx, y: by + ny },
    { x: bx - nx, y: by - ny },
    { x: ax - nx, y: ay - ny },
  ];
}

/** Area of polygon via shoelace */
export function polygonArea(points: Point[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

/** Position along a wall (t in 0–1) */
export function positionOnWall(ax: number, ay: number, bx: number, by: number, t: number): Point {
  return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
}

/** Snap to ortho (horizontal or vertical lock) */
export function snapOrtho(origin: Point, cursor: Point): Point {
  const dx = Math.abs(cursor.x - origin.x);
  const dy = Math.abs(cursor.y - origin.y);
  if (dx > dy) return { x: cursor.x, y: origin.y };
  return { x: origin.x, y: cursor.y };
}
