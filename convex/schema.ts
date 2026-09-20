import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  sharedState: defineTable({
    key: v.string(),
    value: v.string(),
    deleted: v.optional(v.boolean()),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  apiUsage: defineTable({
    projectId: v.string(),
    projectName: v.string(),
    threadId: v.optional(v.string()),
    provider: v.optional(v.string()),
    model: v.string(),
    responseId: v.optional(v.string()),
    requests: v.number(),
    inputTokens: v.number(),
    cachedTokens: v.number(),
    cacheWriteTokens: v.number(),
    outputTokens: v.number(),
    reasoningTokens: v.number(),
    totalTokens: v.number(),
    estimatedCostUsd: v.number(),
    createdAt: v.number(),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_project_createdAt", ["projectId", "createdAt"])
    .index("by_model_createdAt", ["model", "createdAt"]),
});
