import { v } from "convex/values";
import { action } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { llm } from "./lib/llm/index";
import { Plan, DEFAULT_PLAN } from "../src/lib/types/plan";
import { recalcRoomAreas, ROOM_COLORS } from "../src/lib/canvas/planUtils";

const ROOM_TYPES = [
  "bedroom", "bathroom", "kitchen", "living", "dining",
  "corridor", "storage", "garage", "outdoor", "other",
] as const;

const GEN_SYSTEM_PROMPT = `You are an architectural layout generator. Given a short description of a residential project, design a complete, buildable 2D floor plan.

Rules:
- All coordinates and sizes are in METERS. Use a rectilinear layout (walls horizontal or vertical) unless the brief calls for something else.
- Every room is a closed polygon whose vertexIds trace existing vertices in order (3+ vertices).
- Walls between adjacent rooms must be shared (reuse the same wall, don't draw two overlapping walls).
- Every room needs at least one door: interior doors connect it to a corridor/hallway/another room, exterior doors connect it to the outside.
- Exterior-facing walls should have windows for bedrooms, living, dining, kitchen (skip windows for bathroom/storage/garage if not sensible).
- Use realistic room sizes (e.g. bedroom 9–16m², bathroom 3–6m², kitchen 8–14m², living 16–30m²).
- Wall thickness 0.2m for exterior/load-bearing, 0.1m acceptable for interior partitions.
- Door width ~0.9m height ~2.1m. Window width 0.9–1.8m height ~1.2m.
- "position" on an opening is 0–1 along the wall from its startId vertex to endId vertex.

Return ONLY valid JSON (no markdown fences, no comments) matching this schema exactly:
{
  "vertices": [{"id": "string", "x": number, "y": number}],
  "walls": [{"id": "string", "startId": "string", "endId": "string", "thickness": number}],
  "openings": [{"id": "string", "wallId": "string", "type": "door"|"window", "position": number, "width": number, "height": number, "swingDirection": "left"|"right"}],
  "rooms": [{"id": "string", "name": "string", "type": "bedroom"|"bathroom"|"kitchen"|"living"|"dining"|"corridor"|"storage"|"garage"|"outdoor"|"other", "vertexIds": ["string"]}]
}

Use short local ids (e.g. "v1", "w1", "o1", "r1") — they only need to be unique within this response.`;

const GenVertexSchema = z.object({ id: z.string(), x: z.number(), y: z.number() });
const GenWallSchema = z.object({
  id: z.string(),
  startId: z.string(),
  endId: z.string(),
  thickness: z.number().optional(),
});
const GenOpeningSchema = z.object({
  id: z.string(),
  wallId: z.string(),
  type: z.enum(["door", "window"]),
  position: z.number().min(0).max(1),
  width: z.number(),
  height: z.number(),
  swingDirection: z.enum(["left", "right"]).optional(),
});
const GenRoomSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(ROOM_TYPES),
  vertexIds: z.array(z.string()).min(3),
});
const GeneratedPlanSchema = z.object({
  vertices: z.array(GenVertexSchema).min(3),
  walls: z.array(GenWallSchema).min(3),
  openings: z.array(GenOpeningSchema).default([]),
  rooms: z.array(GenRoomSchema).min(1),
});
type GeneratedPlan = z.infer<typeof GeneratedPlanSchema>;

function buildPlanFromGenerated(gen: GeneratedPlan, ppm: number, wallHeight: number): Plan {
  const vertexIdMap = new Map<string, string>();
  const vertices: Plan["vertices"] = {};
  for (const v of gen.vertices) {
    const id = nanoid();
    vertexIdMap.set(v.id, id);
    vertices[id] = { id, x: v.x * ppm, y: v.y * ppm };
  }

  const wallIdMap = new Map<string, string>();
  const walls: Plan["walls"] = {};
  for (const w of gen.walls) {
    const startId = vertexIdMap.get(w.startId);
    const endId = vertexIdMap.get(w.endId);
    if (!startId || !endId || startId === endId) continue;
    const id = nanoid();
    wallIdMap.set(w.id, id);
    walls[id] = { id, startId, endId, thickness: w.thickness ?? 0.2 };
  }

  const openings: Plan["openings"] = {};
  for (const o of gen.openings) {
    const wallId = wallIdMap.get(o.wallId);
    if (!wallId) continue;
    const id = nanoid();
    openings[id] = {
      id,
      wallId,
      type: o.type,
      position: Math.min(1, Math.max(0, o.position)),
      width: o.width,
      height: o.height,
      swingDirection: o.type === "door" ? o.swingDirection ?? "left" : undefined,
    };
  }

  const rooms: Plan["rooms"] = {};
  for (const r of gen.rooms) {
    const vertexIds = r.vertexIds
      .map((vid) => vertexIdMap.get(vid))
      .filter((x): x is string => !!x);
    if (vertexIds.length < 3) continue;
    const id = nanoid();
    rooms[id] = {
      id,
      name: r.name,
      type: r.type,
      vertexIds,
      color: ROOM_COLORS[r.type] ?? ROOM_COLORS.other,
    };
  }

  const xs = Object.values(vertices).map((v) => v.x / ppm);
  const ys = Object.values(vertices).map((v) => v.y / ppm);
  const maxX = xs.length ? Math.max(...xs) : 20;
  const maxY = ys.length ? Math.max(...ys) : 15;

  const plan: Plan = {
    vertices,
    walls,
    openings,
    rooms,
    metadata: {
      width: Math.max(20, Math.ceil(maxX + 4)),
      height: Math.max(15, Math.ceil(maxY + 4)),
      pixelsPerMeter: ppm,
      wallHeight,
    },
  };

  return recalcRoomAreas(plan);
}

export const generate = action({
  args: {
    prompt: v.string(),
    currentPlanJson: v.optional(v.string()),
  },
  handler: async (ctx, { prompt, currentPlanJson }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const current = currentPlanJson ? (JSON.parse(currentPlanJson) as Plan) : DEFAULT_PLAN;
    const ppm = current.metadata?.pixelsPerMeter ?? DEFAULT_PLAN.metadata.pixelsPerMeter;
    const wallHeight = current.metadata?.wallHeight ?? DEFAULT_PLAN.metadata.wallHeight;

    const messages = [
      { role: "system" as const, content: GEN_SYSTEM_PROMPT },
      { role: "user" as const, content: `PROJECT DESCRIPTION:\n${prompt}\n\nGenerate the floor plan JSON now.` },
    ];

    let raw = await llm.complete(messages, { responseFormat: "json", temperature: 0.4 });
    let parsed = GeneratedPlanSchema.safeParse(JSON.parse(raw));

    if (!parsed.success) {
      const retryMessages = [
        ...messages,
        { role: "assistant" as const, content: raw },
        {
          role: "user" as const,
          content: "Your response did not match the required JSON schema. Return ONLY valid JSON, no markdown, no comments.",
        },
      ];
      raw = await llm.complete(retryMessages, { responseFormat: "json", temperature: 0.1 });
      parsed = GeneratedPlanSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) throw new Error("Plan generation failed to produce a valid layout");
    }

    return buildPlanFromGenerated(parsed.data, ppm, wallHeight);
  },
});
