import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const get = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db
      .query("requirements")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .first();
  },
});

export const upsert = mutation({
  args: {
    projectId: v.id("projects"),
    brief: v.string(),
    rooms: v.optional(v.string()),
    constraints: v.optional(v.string()),
  },
  handler: async (ctx, { projectId, brief, rooms, constraints }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const existing = await ctx.db
      .query("requirements")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { brief, rooms, constraints, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("requirements", {
      projectId,
      ownerId: userId,
      brief,
      rooms,
      constraints,
      updatedAt: now,
    });
  },
});
