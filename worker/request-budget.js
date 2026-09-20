import { AsyncLocalStorage } from "node:async_hooks";

const requests = new AsyncLocalStorage();
export const MAX_AGENT_ROUNDS = 8;
export const MAX_AGENT_TOOLS = 20;
// Leave room below the Free plan's 50 subrequests for runtime overhead.
const MAX_SUBREQUESTS = 44;

export class RequestBudgetExceeded extends Error {
  constructor() {
    super("This execution batch reached its request budget.");
  }
}

export function withRequestBudget(callback) {
  return requests.run({ used: 0, secrets: new Map() }, callback);
}

export function remainingRequests() {
  const state = requests.getStore();
  return state ? MAX_SUBREQUESTS - state.used : Infinity;
}

function consume() {
  const state = requests.getStore();
  if (!state) return;
  if (state.used >= MAX_SUBREQUESTS) throw new RequestBudgetExceeded();
  state.used += 1;
}

export async function budgetedFetch(input, init) {
  consume();
  // Redirect hops also count in Workers; never let them bypass accounting.
  return globalThis.fetch(input, requests.getStore() ? { ...init, redirect: "error" } : init);
}

export async function resolveBoundSecret(binding) {
  const state = requests.getStore();
  if (!state) return binding.get();
  if (!state.secrets.has(binding)) {
    consume();
    state.secrets.set(binding, Promise.resolve().then(() => binding.get()));
  }
  return state.secrets.get(binding);
}
