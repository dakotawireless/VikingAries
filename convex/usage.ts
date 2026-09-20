import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const recordUsage = internalMutation({
  args: {
    projectId: v.string(),
    projectName: v.string(),
    threadId: v.optional(v.string()),
    provider: v.string(),
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
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("apiUsage", args);
  },
});

export const usageSummary = internalQuery({
  args: { days: v.number() },
  handler: async (ctx, { days }) => {
    const now = Date.now();
    const start = now - Math.max(1, Math.min(365, days)) * 86400000;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const rows = await ctx.db
      .query("apiUsage")
      .withIndex("by_createdAt", (q) => q.gte("createdAt", start))
      .collect();

    const blank = () => ({
      requests: 0,
      inputTokens: 0,
      cachedTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
    });

    const add = (target, row) => {
      target.requests += row.requests;
      target.inputTokens += row.inputTokens;
      target.cachedTokens += row.cachedTokens;
      target.cacheWriteTokens += row.cacheWriteTokens;
      target.outputTokens += row.outputTokens;
      target.reasoningTokens += row.reasoningTokens;
      target.totalTokens += row.totalTokens;
      target.estimatedCostUsd += row.estimatedCostUsd;
    };

    const totals = blank();
    const today = blank();
    const modelMap = new Map();

    for (const row of rows) {
      add(totals, row);
      if (row.createdAt >= todayStart.getTime()) add(today, row);
      const current = modelMap.get(row.model) || { model: row.model, ...blank() };
      add(current, row);
      modelMap.set(row.model, current);
    }

    const recent = [...rows]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 25)
      .map((row) => ({
        id: row._id,
        projectId: row.projectId,
        projectName: row.projectName,
        model: row.model,
        responseId: row.responseId,
        requests: row.requests,
        totalTokens: row.totalTokens,
        estimatedCostUsd: row.estimatedCostUsd,
        createdAt: row.createdAt,
      }));

    return {
      generatedAt: now,
      days,
      totals,
      today,
      byModel: [...modelMap.values()].sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd),
      recent,
    };
  },
});
