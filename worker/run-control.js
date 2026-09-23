import { AsyncLocalStorage } from 'node:async_hooks';
const runs = new AsyncLocalStorage();
export const currentRunSignal = () => runs.getStore()?.signal;

// Each runner claims once in the database. All provider/tool requests inherit
// this signal; loss of the control plane fails closed instead of doing more work.
export async function withRunControl({ heartbeat, deadlineAt, intervalMs = 2000 }, work) {
  const controller = new AbortController();
  let timer;
  let pending;
  let closed = false;
  const check = async () => {
    try {
      const state = await heartbeat();
      if (state.status !== 'running') throw new Error(`Execution stopped: ${state.status}`);
    } catch (error) {
      controller.abort(error);
    }
  };
  const tick = () => {
    pending = check().finally(() => {
      if (!closed && !controller.signal.aborted) timer = setTimeout(tick, intervalMs);
    });
  };
  const deadline = setTimeout(() => controller.abort(new Error('Execution deadline exceeded')), Math.max(0, deadlineAt - Date.now()));
  try {
    await check();
    controller.signal.throwIfAborted();
    timer = setTimeout(tick, intervalMs);
    return await runs.run({ signal: controller.signal }, () => work(controller.signal));
  } finally {
    closed = true;
    clearTimeout(timer);
    clearTimeout(deadline);
    if (pending) await pending;
  }
}
