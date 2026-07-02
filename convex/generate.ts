import { v } from "convex/values";
import { action } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { buildLLMFromSettings } from "./lib/llm/index";
import { internal } from "./_generated/api";
import { Plan, DEFAULT_PLAN } from "../src/lib/types/plan";
import { recalcRoomAreas, ROOM_COLORS } from "../src/lib/canvas/planUtils";

function extractJson(text: string): string {
  // Strip markdown code fences
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  // Find first { ... } block
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) return text.slice(start, end + 1);
  return text;
}

const ROOM_TYPES = [
  "bedroom", "bathroom", "kitchen", "living", "dining",
  "corridor", "storage", "garage", "outdoor", "other",
] as const;

const GEN_SYSTEM_PROMPT = `You are an architectural layout generator. Given a short description of a residential project, design a complete, buildable 2D floor plan.

Rules:
- All coordinates and sizes are in METERS. Use a rectilinear layout (walls horizontal or vertical).
- Every room is a closed polygon whose vertexIds trace existing vertices in order (3+ vertices).
- Walls between adjacent rooms must be shared (reuse the same wall, don't draw two overlapping walls).
- Every room needs at least one door: interior doors connect to corridor/hallway/other room; exterior doors connect to outside.
- Exterior-facing walls should have windows for bedrooms, living, dining, kitchen.
- Use realistic room sizes: bedroom 9–16m², bathroom 3–6m², kitchen 8–14m², living 16–30m², foyer 4–8m², carport 15–25m².
- Wall thickness 0.2m for exterior/load-bearing, 0.1m for interior partitions.
- Door width ~0.9m height ~2.1m. Window width 0.9–1.8m height ~1.2m.
- "position" on an opening is 0–1 along the wall from startId vertex to endId vertex.

Multi-floor handling:
- This tool generates ONE floor plan at a time (ground floor).
- If "2 floors" is requested: generate the GROUND FLOOR only. Include a "staircase" room (type: "corridor", ~4–6m²) with a door connecting to the main corridor. Label it "Staircase".
- Rooms that go on floor 2 (extra bedrooms, bathrooms) still appear on the ground floor plan for layout reference — the user will handle floor 2 separately.

Garden/courtyard inside:
- "Garden inside", "inner garden", or "courtyard" means an open-air space ENCLOSED by walls inside the building footprint.
- Place it as a room with type "outdoor", surrounded by interior walls on all sides, with at least one door connecting it to the adjacent room.
- Size it generously (16–40m²).

Carport:
- type: "garage", no windows, one wide door (width 3.0–4.0m) on the exterior wall, adjacent to the street/front of the house.

Foyer/entrance:
- type: "corridor", placed at the front entrance, connected to the main living area and staircase (if multi-floor).

Total floor area guidance:
- If a total m² is given, make the sum of all room areas approximately match it.
- For a 160m² ground floor: outer footprint ~10×16m or 12×14m is appropriate.

Multi-floor vertex coordinates:
- Each floor uses the SAME x/y coordinate space (same footprint).
- Differentiate floors with the "floor" field (0 = ground, 1 = first floor, etc.).
- Upper floors share the same outer wall coordinates as ground floor but have their own set of vertices/walls/rooms.
- Include a stairwell opening between floors (a "staircase" room on each floor at same x/y position).

Return ONLY valid JSON (no markdown fences, no comments) matching this schema exactly:
{
  "floors": number,
  "vertices": [{"id": "string", "x": number, "y": number, "floor": number}],
  "walls": [{"id": "string", "startId": "string", "endId": "string", "thickness": number, "floor": number}],
  "openings": [{"id": "string", "wallId": "string", "type": "door"|"window", "position": number, "width": number, "height": number, "swingDirection": "left"|"right", "floor": number}],
  "rooms": [{"id": "string", "name": "string", "type": "bedroom"|"bathroom"|"kitchen"|"living"|"dining"|"corridor"|"storage"|"garage"|"outdoor"|"other", "vertexIds": ["string"], "floor": number}]
}

Critical: ALL walls must be strictly horizontal (same y) or strictly vertical (same x). NO diagonal walls ever. If two rooms share a wall, share the exact same wall id — never duplicate/overlap walls.
Use short local ids (e.g. "v1", "w1", "o1", "r1") — they only need to be unique within this response.`;

const GenVertexSchema = z.object({ id: z.string(), x: z.number(), y: z.number(), floor: z.number().default(0) });
const GenWallSchema = z.object({
  id: z.string(),
  startId: z.string(),
  endId: z.string(),
  thickness: z.number().optional(),
  floor: z.number().default(0),
});
const GenOpeningSchema = z.object({
  id: z.string(),
  wallId: z.string(),
  type: z.enum(["door", "window"]),
  position: z.number().min(0).max(1),
  width: z.number(),
  height: z.number(),
  swingDirection: z.enum(["left", "right"]).optional(),
  floor: z.number().default(0),
});
const GenRoomSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(ROOM_TYPES),
  vertexIds: z.array(z.string()).min(3),
  floor: z.number().default(0),
});
const GeneratedPlanSchema = z.object({
  floors: z.number().default(1),
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
    vertices[id] = { id, x: v.x * ppm, y: v.y * ppm, floor: v.floor ?? 0 };
  }

  const wallIdMap = new Map<string, string>();
  const walls: Plan["walls"] = {};
  for (const w of gen.walls) {
    const startId = vertexIdMap.get(w.startId);
    const endId = vertexIdMap.get(w.endId);
    if (!startId || !endId || startId === endId) continue;
    // Filter diagonal walls — only allow orthogonal (horizontal or vertical)
    const sv = vertices[startId];
    const ev = vertices[endId];
    const dx = Math.abs(sv.x - ev.x);
    const dy = Math.abs(sv.y - ev.y);
    if (dx > 8 && dy > 8) continue; // both dims > ~0.16m = diagonal, skip
    const id = nanoid();
    wallIdMap.set(w.id, id);
    walls[id] = { id, startId, endId, thickness: w.thickness ?? 0.2, floor: w.floor ?? 0 };
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
      floor: o.floor ?? 0,
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
      floor: r.floor ?? 0,
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
      floors: gen.floors ?? 1,
    },
  };

  return recalcRoomAreas(plan);
}

const ChatMessageSchema = v.object({
  role: v.union(v.literal("user"), v.literal("assistant")),
  content: v.string(),
});

export const generate = action({
  args: {
    prompt: v.string(),
    currentPlanJson: v.optional(v.string()),
    chatHistory: v.optional(v.array(ChatMessageSchema)),
  },
  handler: async (ctx, { prompt, currentPlanJson, chatHistory }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const settings = await ctx.runQuery(internal.settings.getSettingsInternal, { userId });
    const llm = buildLLMFromSettings(settings);

    const current = currentPlanJson ? (JSON.parse(currentPlanJson) as Plan) : DEFAULT_PLAN;
    const ppm = current.metadata?.pixelsPerMeter ?? DEFAULT_PLAN.metadata.pixelsPerMeter;
    const wallHeight = current.metadata?.wallHeight ?? DEFAULT_PLAN.metadata.wallHeight;

    const isIteration = chatHistory && chatHistory.length > 0;

    // Build a single user message. For iterations, include the current plan JSON + prior requests.
    // We never put plan JSON in assistant history turns (causes context blowup + prose output).
    const previousRequests = chatHistory
      ? chatHistory.filter((m) => m.role === "user").map((m, i) => `${i + 1}. ${m.content}`).join("\n")
      : "";

    const userContent = isIteration
      ? `CURRENT FLOOR PLAN JSON (already generated):\n${currentPlanJson ?? "{}"}\n\nPREVIOUS MODIFICATION REQUESTS ALREADY APPLIED:\n${previousRequests}\n\nNEW MODIFICATION REQUEST:\n${prompt}\n\nApply the new modification to the current plan. Keep all rooms, walls, and openings that are NOT affected by this change. Return ONLY the complete updated plan JSON.`
      : `PROJECT DESCRIPTION:\n${prompt}\n\nFollow all rules above exactly. Include ALL requested rooms (foyer, carport, garden, staircase if multi-floor). Generate the floor plan JSON now.`;

    const messages = [
      { role: "system" as const, content: GEN_SYSTEM_PROMPT },
      { role: "user" as const, content: userContent },
    ];

    function tryParse(text: string) {
      try {
        return GeneratedPlanSchema.safeParse(JSON.parse(extractJson(text)));
      } catch {
        return { success: false as const, error: null };
      }
    }

    const genOpts = { responseFormat: "json" as const, temperature: 0.4, maxTokens: 8192 };
    let raw = await llm.complete(messages, genOpts);
    let parsed = tryParse(raw);

    if (!parsed.success) {
      const retryMessages = [
        ...messages,
        { role: "assistant" as const, content: raw },
        {
          role: "user" as const,
          content: "Your response was not valid JSON. Return ONLY a valid JSON object matching the schema exactly. No YAML, no markdown, no comments, no extra text.",
        },
      ];
      raw = await llm.complete(retryMessages, { ...genOpts, temperature: 0.1 });
      parsed = tryParse(raw);
      if (!parsed.success) throw new Error("Plan generation failed to produce a valid layout");
    }

    const plan = buildPlanFromGenerated(parsed.data, ppm, wallHeight);
    // Return plan + the raw JSON so caller can add it to chat history as assistant turn
    return { plan, planJson: JSON.stringify(parsed.data) };
  },
});
