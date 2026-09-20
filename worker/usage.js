// Standard USD rates verified 2026-09-20: https://developers.openai.com/api/docs/pricing
const OPENAI_PRICING = {
  "gpt-5.6-luna": { input: 0.20, cached: 0.02, cacheWrite: 0.25, output: 1.20 },
  "gpt-5.6-terra": { input: 2.00, cached: 0.20, cacheWrite: 2.50, output: 12.00 },
  "gpt-5.6-sol": { input: 4.00, cached: 0.40, cacheWrite: 5.00, output: 20.00 },
};

export function openAIUsageForResponse(model, payload) {
  const usage = payload?.usage || {};
  const inputTokens = Number(usage.input_tokens || 0);
  const cachedTokens = Number(usage.input_tokens_details?.cached_tokens || 0);
  const cacheWriteTokens = Number(usage.input_tokens_details?.cache_write_tokens || 0);
  const outputTokens = Number(usage.output_tokens || 0);
  const reasoningTokens = Number(usage.output_tokens_details?.reasoning_tokens || 0);
  const ordinaryInputTokens = Math.max(0, inputTokens - cachedTokens - cacheWriteTokens);
  const rates = OPENAI_PRICING[model] || OPENAI_PRICING["gpt-5.6-luna"];
  const largePromptMultiplier = inputTokens > 272000 ? 2 : 1;
  const largeOutputMultiplier = inputTokens > 272000 ? 1.5 : 1;
  const estimatedCostUsd =
    ((ordinaryInputTokens * rates.input * largePromptMultiplier) +
      (cachedTokens * rates.cached * largePromptMultiplier) +
      (cacheWriteTokens * rates.cacheWrite * largePromptMultiplier) +
      (outputTokens * rates.output * largeOutputMultiplier)) / 1000000;

  return {
    requests: 1,
    inputTokens,
    cachedTokens,
    cacheWriteTokens,
    outputTokens,
    reasoningTokens,
    totalTokens: Number(usage.total_tokens || inputTokens + outputTokens),
    estimatedCostUsd,
  };
}

export function addUsageTotals(current, next) {
  return {
    requests: Number(current.requests || 0) + Number(next.requests || 0),
    inputTokens: Number(current.inputTokens || 0) + Number(next.inputTokens || 0),
    cachedTokens: Number(current.cachedTokens || 0) + Number(next.cachedTokens || 0),
    cacheWriteTokens: Number(current.cacheWriteTokens || 0) + Number(next.cacheWriteTokens || 0),
    outputTokens: Number(current.outputTokens || 0) + Number(next.outputTokens || 0),
    reasoningTokens: Number(current.reasoningTokens || 0) + Number(next.reasoningTokens || 0),
    totalTokens: Number(current.totalTokens || 0) + Number(next.totalTokens || 0),
    estimatedCostUsd: Number(current.estimatedCostUsd || 0) + Number(next.estimatedCostUsd || 0),
  };
}

