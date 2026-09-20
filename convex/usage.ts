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
  args: {
    startAt: v.number(),
    endAt: v.number(),
    periodLabel: v.string(),
  },
  handler: async (ctx, { startAt, endAt, periodLabel }) => {
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const rows = await ctx.db
      .query("apiUsage")
      .withIndex("by_createdAt", (q) => q.gte("createdAt", startAt).lt("createdAt", endAt))
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
    const projectMap = new Map();
    const providerMap = new Map();

    for (const row of rows) {
      add(totals, row);
      if (row.createdAt >= todayStart.getTime()) add(today, row);
      const provider = row.provider || "OpenAI";
      const modelKey = `${provider}:${row.model}`;
      const modelCurrent = modelMap.get(modelKey) || { provider, model: row.model, ...blank() };
      add(modelCurrent, row);
      modelMap.set(modelKey, modelCurrent);
      const projectCurrent = projectMap.get(row.projectId) || {
        projectId: row.projectId,
        projectName: row.projectName || row.projectId,
        ...blank(),
      };
      add(projectCurrent, row);
      projectMap.set(row.projectId, projectCurrent);
      const providerCurrent = providerMap.get(provider) || { provider, ...blank() };
      add(providerCurrent, row);
      providerMap.set(provider, providerCurrent);
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
