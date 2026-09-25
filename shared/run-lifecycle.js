// Persisted states retain the existing wire format for old clients.
export const TERMINAL = new Set(['completed', 'failed', 'canceled', 'cancelled', 'timed_out', 'paused']);
export const RUN_LIMIT_MS = 4 * 60 * 1000;
export const LEASE_MS = 60 * 1000;
export const QUEUE_LIMIT_MS = 30 * 60 * 1000;

// A durable job may span several bounded Worker invocations. These are job-level
// guardrails, separate from the per-invocation request/tool/cost ceilings.
export const DEFAULT_JOB_MAX_CONTINUATIONS = 6;
export const DEFAULT_JOB_MAX_COST_USD = 3.00;
export const DEFAULT_JOB_MAX_ELAPSED_MS = 30 * 60 * 1000;

export function jobContinuationLimitReason(job, {
  nextContinuationCount,
  nextCumulativeCostUsd,
  now = Date.now(),
} = {}) {
  const maxContinuations = Number(job?.maxContinuations ?? DEFAULT_JOB_MAX_CONTINUATIONS);
  const maxCostUsd = Number(job?.maxJobCostUsd ?? DEFAULT_JOB_MAX_COST_USD);
  const maxElapsedMs = Number(job?.maxJobElapsedMs ?? DEFAULT_JOB_MAX_ELAPSED_MS);
  const startedAt = Number(job?.jobStartedAt || job?.createdAt || now);
  const continuationCount = Number(
    nextContinuationCount ?? job?.continuationCount ?? 0
  );
  const cumulativeCostUsd = Number(
    nextCumulativeCostUsd ?? job?.cumulativeCostUsd ?? 0
  );

  if (Number.isFinite(maxContinuations) && continuationCount > maxContinuations) {
    return `Automatic continuation limit reached (${maxContinuations}).`;
  }
  if (Number.isFinite(maxCostUsd) && cumulativeCostUsd > maxCostUsd + 1e-9) {
    return `Job AI cost limit reached (${maxCostUsd.toFixed(2)}).`;
  }
  if (Number.isFinite(maxElapsedMs) && now - startedAt > maxElapsedMs) {
    return `Job elapsed-time limit reached (${Math.round(maxElapsedMs / 60000)} minutes).`;
  }
  return null;
}
export function expiryReason(job, now) {
  if (job.status === 'queued' && Number(job.lifecycleVersion || 0) < 2) return 'Legacy queued request interrupted; not replayed.';
  if (job.status === 'queued' && now - job.createdAt >= QUEUE_LIMIT_MS) return 'Queue deadline exceeded; request was not replayed.';
  if (job.status !== 'running') return null;
  if (now >= (job.deadlineAt || (job.startedAt || job.updatedAt) + RUN_LIMIT_MS)) return 'Execution deadline exceeded. Inspect completed actions before continuing.';
  if (now - job.updatedAt >= LEASE_MS) return 'Execution heartbeat expired. Request was not replayed.';
  return null;
}
