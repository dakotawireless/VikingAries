import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  sharedState: defineTable({
    key: v.string(),
    value: v.string(),
    deleted: v.optional(v.boolean()),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  aiJobs: defineTable({
    jobId: v.string(),
    projectId: v.string(),
    projectName: v.string(),
    threadId: v.string(),
    threadTitle: v.string(),
    requestJson: v.string(),
    userMessageId: v.optional(v.string()),
    userMessageContent: v.optional(v.string()),
    status: v.string(),
    resultText: v.optional(v.string()),
    error: v.optional(v.string()),
    model: v.optional(v.string()),
    responseId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    startedAt: v.optional(v.number()),
    heartbeatAt: v.optional(v.number()),
    cancelRequestedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index("by_jobId", ["jobId"])
    .index("by_project_updatedAt", ["projectId", "updatedAt"])
    .index("by_project_thread_updatedAt", ["projectId", "threadId", "updatedAt"])
    .index("by_thread_updatedAt", ["threadId", "updatedAt"]),

  projectFiles: defineTable({
    projectId: v.string(),
    name: v.string(),
    type: v.string(),
    size: v.number(),
    storageId: v.id("_storage"),
    uploadedAt: v.number(),
  })
    .index("by_project_uploadedAt", ["projectId", "uploadedAt"]),

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
