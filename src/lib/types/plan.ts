// Core Plan JSON schema — single source of truth for 2D canvas, 3D viewer, and AI critique.

export type VertexId = string;
export type WallId = string;
export type RoomId = string;
export type OpeningId = string;

export interface Vertex {
  id: VertexId;
  x: number; // meters
  y: number; // meters
  floor?: number; // 0-indexed, default 0
}

export interface Wall {
  id: WallId;
  startId: VertexId;
  endId: VertexId;
  thickness: number; // meters, default 0.2
  floor?: number; // 0-indexed, default 0
}

export type OpeningType = "door" | "window";

export interface Opening {
  id: OpeningId;
  wallId: WallId;
  type: OpeningType;
  /** 0–1 position along the wall (0 = start vertex, 1 = end vertex) */
  position: number;
  width: number;  // meters
  height: number; // meters
  /** For doors: which side the door swings (relative to wall direction) */
  swingDirection?: "left" | "right";
  floor?: number; // 0-indexed, default 0
}

export type RoomType =
  | "bedroom"
  | "bathroom"
  | "kitchen"
  | "living"
  | "dining"
  | "corridor"
  | "storage"
  | "garage"
  | "outdoor"
  | "other";

export interface Room {
  id: RoomId;
  name: string;
  type: RoomType;
  /** Ordered vertex IDs forming the room polygon (closed loop) */
  vertexIds: VertexId[];
  /** Computed area in m² — recalculated on save, not edited directly */
  area?: number;
  color?: string; // hex, for canvas fill
  floor?: number; // 0-indexed, default 0
}

export interface PlanMetadata {
  /** Canvas width in meters */
  width: number;
  /** Canvas height in meters */
  height: number;
  /** Pixels per meter — used for canvas rendering */
  pixelsPerMeter: number;
  /** Default wall height for 3D extrusion, meters */
  wallHeight: number;
  /** North direction in degrees (0 = up) */
  northAngle?: number;
  /** Total number of floors, default 1 */
  floors?: number;
}

export interface Plan {
  vertices: Record<VertexId, Vertex>;
  walls: Record<WallId, Wall>;
  openings: Record<OpeningId, Opening>;
  rooms: Record<RoomId, Room>;
  metadata: PlanMetadata;
}

export const DEFAULT_PLAN: Plan = {
  vertices: {},
  walls: {},
  openings: {},
  rooms: {},
  metadata: {
    width: 20,
    height: 15,
    pixelsPerMeter: 50,
    wallHeight: 2.7,
  },
};

// Zod schema (lazy import to avoid bundle bloat in non-validating paths)
// Full Zod validation lives in convex/lib/planSchema.ts
