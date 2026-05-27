import { z } from "zod";

export const VertexSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
});

export const WallSchema = z.object({
  id: z.string(),
  startId: z.string(),
  endId: z.string(),
  thickness: z.number().default(0.2),
});

export const OpeningSchema = z.object({
  id: z.string(),
  wallId: z.string(),
  type: z.enum(["door", "window"]),
  position: z.number().min(0).max(1),
  width: z.number(),
  height: z.number(),
  swingDirection: z.enum(["left", "right"]).optional(),
});

export const RoomSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum([
    "bedroom",
    "bathroom",
    "kitchen",
    "living",
    "dining",
    "corridor",
    "storage",
    "garage",
    "outdoor",
    "other",
  ]),
  vertexIds: z.array(z.string()),
  area: z.number().optional(),
  color: z.string().optional(),
});

export const PlanMetadataSchema = z.object({
  width: z.number(),
  height: z.number(),
  pixelsPerMeter: z.number(),
  wallHeight: z.number(),
  northAngle: z.number().optional(),
});

export const PlanSchema = z.object({
  vertices: z.record(VertexSchema),
  walls: z.record(WallSchema),
  openings: z.record(OpeningSchema),
  rooms: z.record(RoomSchema),
  metadata: PlanMetadataSchema,
});

export type PlanSchemaType = z.infer<typeof PlanSchema>;
