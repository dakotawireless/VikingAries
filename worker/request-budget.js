import { AsyncLocalStorage } from "node:async_hooks";
import {
  currentRunSignal,
  currentRunRecoveryAt,
  currentRunIsRecovering,
} from "./run-control.js";

const requests = new AsyncLocalStorage();
export const MAX_AGENT_ROUNDS = 32;
export const MAX_AGENT_TOOLS = 120;
// Viking Aries runs on Workers Paid. Keep an internal safety guard well below the platform ceiling.
const MAX_SUBREQUESTS = 2500;

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

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECT_HOPS = 5;

function redirectUrl(input, location) {
  const base = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  return new URL(location, base).toString();
}

function redirectedInit(init, status, fromUrl, toUrl) {
  const next = { ...(init || {}), redirect: "manual" };
  const method = String(next.method || "GET").toUpperCase();

  // Match normal fetch redirect semantics for POST on 301/302 and all 303s.
  if (status === 303 || ((status === 301 || status === 302) && method === "POST")) {
    next.method = "GET";
    delete next.body;
  }

  // Never forward credentials to a different origin.
  try {
    if (new URL(fromUrl).origin !== new URL(toUrl).origin) {
      const headers = new Headers(next.headers || {});
      headers.delete("authorization");
      headers.delete("cookie");
      headers.delete("proxy-authorization");
      next.headers = headers;
    }
  } catch {
    // URL parsing failures will be surfaced by fetch itself.
  }

  return next;
}

export async function budgetedFetch(input, init) {
  const signal = currentRunSignal();
  if (signal) {
    signal.throwIfAborted();
    const signals = [signal];
    if (init?.signal) signals.push(init.signal);
    if (!currentRunIsRecovering()) {
      const recoveryMs = currentRunRecoveryAt() - Date.now();
      if (recoveryMs <= 0) {
        const error = new Error("Recovery window reached");
        error.name = "RecoveryWindowReached";
        throw error;
      }
      signals.push(AbortSignal.timeout(Math.max(1, recoveryMs)));
    }
    init = { ...init, signal: signals.length === 1 ? signals[0] : AbortSignal.any(signals) };
  }
  const state = requests.getStore();
  if (!state) return globalThis.fetch(input, init);

  let currentInput = input;
  let currentInit = { ...(init || {}), redirect: "manual" };

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
    consume();
    const response = await globalThis.fetch(currentInput, currentInit);

    if (!REDIRECT_STATUSES.has(response.status)) return response;

    const location = response.headers.get("location");
    if (!location) return response;
    if (hop === MAX_REDIRECT_HOPS) {
      throw new Error("External request exceeded the redirect limit.");
    }

    const fromUrl =
      typeof currentInput === "string"
        ? currentInput
        : currentInput instanceof URL
          ? currentInput.toString()
          : currentInput.url;
    const nextUrl = redirectUrl(currentInput, location);
    currentInit = redirectedInit(currentInit, response.status, fromUrl, nextUrl);
    currentInput = nextUrl;
  }

  throw new Error("External request exceeded the redirect limit.");
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
