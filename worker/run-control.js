import { AsyncLocalStorage } from "node:async_hooks";

const runs = new AsyncLocalStorage();

export const currentRunSignal = () => runs.getStore()?.signal;
export const currentRunDeadlineAt = () => runs.getStore()?.deadlineAt || Infinity;
export const currentRunRecoveryAt = () => runs.getStore()?.recoveryAt || Infinity;
export const currentRunRecoveryState = () => runs.getStore()?.recoveryState || null;
export const currentRunIsRecovering = () => Boolean(runs.getStore()?.recovering);

export function beginRunRecoveryMode() {
  const state = runs.getStore();
  if (state) state.recovering = true;
}

export function updateRunRecoveryState(patch) {
  const state = runs.getStore();
  if (!state) return null;
  Object.assign(state.recoveryState, patch, { updatedAt: Date.now() });
  return state.recoveryState;
}

// Keep the watchdog, but reserve the end of every run for a tools-disabled
// recovery pass. The hard signal still aborts every provider/tool request at the
// absolute deadline; callers use recoveryAt to stop starting broad tool work.
export async function withRunControl(
  { heartbeat, deadlineAt, intervalMs = 2000, recoveryReserveMs = 45000 },
  work
) {
  const controller = new AbortController();
  let timer;
  let pending;
  let closed = false;
  const recoveryAt = Math.max(Date.now(), deadlineAt - recoveryReserveMs);
  const recoveryState = {
    runId: null,
    startedAt: Date.now(),
    deadlineAt,
    recoveryAt,
    toolRounds: 0,
    toolExecutions: 0,
    completedOperations: [],
    writes: [],
    lastSuccessfulOperation: null,
    finalOperation: null,
    stopReason: null,
    model: null,
    provider: "OpenAI",
  };

  const check = async () => {
    try {
      const state = await heartbeat();
      if (state.status !== "running") {
        const error = new Error(`Execution stopped: ${state.status}`);
        error.runStopStatus = state.status;
        throw error;
      }
    } catch (error) {
      controller.abort(error);
    }
  };

  const tick = () => {
    pending = check().finally(() => {
      if (!closed && !controller.signal.aborted) timer = setTimeout(tick, intervalMs);
    });
  };

  const deadline = setTimeout(
    () => {
      const error = new Error("Execution deadline exceeded");
      error.runStopStatus = "timed_out";
      controller.abort(error);
    },
    Math.max(0, deadlineAt - Date.now())
  );

  try {
    await check();
    controller.signal.throwIfAborted();
    timer = setTimeout(tick, intervalMs);
    return await runs.run(
      { signal: controller.signal, deadlineAt, recoveryAt, recoveryState },
      () => work(controller.signal)
    );
  } finally {
    closed = true;
    clearTimeout(timer);
    clearTimeout(deadline);
    if (pending) await pending;
  }
}
