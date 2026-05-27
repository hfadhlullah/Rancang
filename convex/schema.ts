import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

  projects: defineTable({
    ownerId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    /** Serialized Plan JSON */
    planJson: v.optional(v.string()),
    /** Latest snapshot label */
    latestSnapshotLabel: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_updated", ["ownerId", "updatedAt"]),

  snapshots: defineTable({
    projectId: v.id("projects"),
    ownerId: v.string(),
    label: v.string(),
    planJson: v.string(),
    createdAt: v.number(),
  }).index("by_project", ["projectId"]),

  critiques: defineTable({
    projectId: v.id("projects"),
    ownerId: v.string(),
    planJson: v.string(), // plan at time of critique
    result: v.string(),   // serialized CritiqueResult JSON
    createdAt: v.number(),
  }).index("by_project", ["projectId"]),

  requirements: defineTable({
    projectId: v.id("projects"),
    ownerId: v.string(),
    /** e.g. "3-bedroom family home, 200m², north-facing plot" */
    brief: v.string(),
    rooms: v.optional(v.string()),       // JSON array of {name, type, minArea}
    constraints: v.optional(v.string()), // freeform text
    updatedAt: v.number(),
  }).index("by_project", ["projectId"]),
});
