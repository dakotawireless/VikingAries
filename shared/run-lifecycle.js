// Persisted states retain the existing wire format for old clients.
export const TERMINAL = new Set(['completed', 'failed', 'canceled', 'cancelled', 'timed_out']);
export const RUN_LIMIT_MS = 8 * 60 * 1000;
export const LEASE_MS = 60 * 1000;
export const QUEUE_LIMIT_MS = 30 * 60 * 1000;
export function expiryReason(job, now) {
  if (job.status === 'queued' && job.lifecycleVersion !== 2) return 'Legacy queued request interrupted; not replayed.';
  if (job.status === 'queued' && now - job.createdAt >= QUEUE_LIMIT_MS) return 'Queue deadline exceeded; request was not replayed.';
  if (job.status !== 'running') return null;
  if (now >= (job.deadlineAt || (job.startedAt || job.updatedAt) + RUN_LIMIT_MS)) return 'Execution deadline exceeded. Inspect completed actions before continuing.';
  if (now - job.updatedAt >= LEASE_MS) return 'Execution heartbeat expired. Request was not replayed.';
  return null;
}
