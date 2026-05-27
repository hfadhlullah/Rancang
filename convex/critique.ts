import { v } from "convex/values";
import { action, query, internalMutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { llm } from "./lib/llm/index";
import { PlanSchema } from "./lib/planSchema";
import { nanoid } from "nanoid";
import { z } from "zod";

const CRITIQUE_SYSTEM_PROMPT = `You are an expert residential architect reviewing a floor plan.
Your task: provide specific, actionable critique anchored to the plan geometry.

Return ONLY valid JSON matching this schema exactly:
{
  "summary": "string — 2–3 sentence overall assessment",
  "overallScore": number (0–100, higher = better),
  "items": [
    {
      "id": "string",
      "severity": "critical" | "major" | "minor" | "info",
      "category": "circulation" | "dimensions" | "natural_light" | "ventilation" | "adjacency" | "accessibility" | "structure" | "general",
      "title": "string — short title",
      "description": "string — what you observed, with measurements",
      "suggestion": "string — specific actionable fix",
      "metric": "string — optional measurement supporting finding",
      "target": {
        "type": "room" | "wall" | "opening" | "plan",
        "id": "string — the element ID from the plan, or 'plan' for overall",
        "label": "string — human-readable name"
      }
    }
  ]
}

Rules:
- Maximum 8 items. Prioritize critical and major.
- Every item MUST reference a specific element ID from the plan JSON.
- Include metric values (m², m widths) when calculable.
- No vague feedback. Every suggestion must be concrete and measurable.`;

function buildUserMessage(planJson: string, requirements: string): string {
  return `REQUIREMENTS BRIEF:\n${requirements}\n\nFLOOR PLAN JSON:\n${planJson}\n\nAnalyse the plan against the brief. Return critique JSON only.`;
}

const CritiqueItemSchema = z.object({
  id: z.string(),
  severity: z.enum(["critical", "major", "minor", "info"]),
  category: z.enum([
    "circulation", "dimensions", "natural_light", "ventilation",
    "adjacency", "accessibility", "structure", "general",
  ]),
  title: z.string(),
  description: z.string(),
  suggestion: z.string(),
  metric: z.string().optional(),
  target: z.object({
    type: z.enum(["room", "wall", "opening", "plan"]),
    id: z.string(),
    label: z.string(),
  }),
});

const CritiqueResultSchema = z.object({
  summary: z.string(),
  overallScore: z.number().optional(),
  items: z.array(CritiqueItemSchema),
});

export const saveInternal = internalMutation({
  args: {
    projectId: v.id("projects"),
    ownerId: v.string(),
    planJson: v.string(),
    result: v.string(),
  },
  handler: async (ctx, { projectId, ownerId, planJson, result }) => {
    return await ctx.db.insert("critiques", {
      projectId,
      ownerId,
      planJson,
      result,
      createdAt: Date.now(),
    });
  },
});

export const run = action({
  args: {
    projectId: v.id("projects"),
    planJson: v.string(),
    requirementsBrief: v.string(),
  },
  handler: async (ctx, { projectId, planJson, requirementsBrief }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const ownerId = userId;
    const planParsed = PlanSchema.safeParse(JSON.parse(planJson));
    if (!planParsed.success) throw new Error("Invalid plan JSON");

    const messages = [
      { role: "system" as const, content: CRITIQUE_SYSTEM_PROMPT },
      { role: "user" as const, content: buildUserMessage(planJson, requirementsBrief) },
    ];

    let raw = await llm.complete(messages, { responseFormat: "json", temperature: 0.3 });
    let parsed = CritiqueResultSchema.safeParse(JSON.parse(raw));

    if (!parsed.success) {
      const retryMessages = [
        ...messages,
        { role: "assistant" as const, content: raw },
        { role: "user" as const, content: "Your response did not match the required JSON schema. Return ONLY valid JSON, no markdown." },
      ];
      raw = await llm.complete(retryMessages, { responseFormat: "json", temperature: 0.1 });
      parsed = CritiqueResultSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) throw new Error("Critique parse failed after retry");
    }

    const result = {
      id: nanoid(),
      planId: projectId,
      projectId,
      createdAt: Date.now(),
      ...parsed.data,
    };

    await ctx.runMutation(internal.critique.saveInternal, {
      projectId,
      ownerId,
      planJson,
      result: JSON.stringify(result),
    });

    return result;
  },
});

export const list = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("critiques")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .order("desc")
      .collect();
  },
});
