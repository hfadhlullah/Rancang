import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const list = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("snapshots")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    label: v.string(),
    planJson: v.string(),
  },
  handler: async (ctx, { projectId, label, planJson }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const project = await ctx.db.get(projectId);
    if (!project || project.ownerId !== userId) throw new Error("Not found");
    const id = await ctx.db.insert("snapshots", {
      projectId,
      ownerId: userId,
      label,
      planJson,
      createdAt: Date.now(),
    });
    await ctx.db.patch(projectId, { latestSnapshotLabel: label });
    return id;
  },
});
