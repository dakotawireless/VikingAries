const PREFIX = "viking-aries";
const POLL_MS = 1200;
const PULL_MS = 5000;

function isSharedKey(key) {
  return (
    typeof key === "string" &&
    key.startsWith(PREFIX) &&
    key !== "viking-aries:active-project" &&
    key !== "viking-aries:active-workspace" &&
    !key.startsWith("viking-aries:progress:") &&
    !key.startsWith("viking-aries:audit:")
  );
}

function snapshotLocal() {
  const values = new Map();
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!isSharedKey(key)) continue;
    values.set(key, window.localStorage.getItem(key) ?? "");
  }
  return values;
}

async function requestState(url = "/api/state", options = {}) {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Shared Viking Aries state could not be synchronized.");
  }
  return payload;
}

async function pushValue(key, value, updatedAt) {
  return requestState("/api/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value, updatedAt }),
  });
}

async function deleteValue(key, updatedAt) {
  return requestState(
    `/api/state?key=${encodeURIComponent(key)}&updatedAt=${encodeURIComponent(updatedAt)}`,
    { method: "DELETE" }
  );
}

export async function startSharedStorageSync() {
  const knownServerTime = new Map();
  let localSnapshot = snapshotLocal();
  let stopped = false;
  let scanTimer = null;
  let pullTimer = null;

  const applyRemote = (entries) => {
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (!isSharedKey(entry?.key) || typeof entry?.value !== "string") continue;
      const updatedAt = Number(entry.updatedAt || 0);
      const known = Number(knownServerTime.get(entry.key) || 0);
      if (updatedAt < known) continue;

      knownServerTime.set(entry.key, updatedAt);

      if (entry.deleted) {
        localSnapshot.delete(entry.key);
        if (window.localStorage.getItem(entry.key) !== null) {
          window.localStorage.removeItem(entry.key);
        }
        continue;
      }

      localSnapshot.set(entry.key, entry.value);
      if (window.localStorage.getItem(entry.key) !== entry.value) {
        window.localStorage.setItem(entry.key, entry.value);
      }
    }
  };

  const bootstrap = async () => {
    const remote = await requestState();
    const remoteEntries = Array.isArray(remote.entries) ? remote.entries : [];
    const remoteKeys = new Set(remoteEntries.map((entry) => entry.key));

    // Server values are authoritative when they already exist.
    applyRemote(remoteEntries);

    // First migration: any browser-only Viking Aries state that is not yet in
    // Convex is uploaded rather than discarded.
    const currentLocal = snapshotLocal();
    for (const [key, value] of currentLocal.entries()) {
      if (remoteKeys.has(key)) continue;
      const updatedAt = Date.now();
      const result = await pushValue(key, value, updatedAt);
      knownServerTime.set(key, Number(result.updatedAt || updatedAt));
      localSnapshot.set(key, value);
    }

    localSnapshot = snapshotLocal();
  };

  const scanLocalChanges = async () => {
    if (stopped) return;
    const current = snapshotLocal();
    const writes = [];

    for (const [key, value] of current.entries()) {
      if (localSnapshot.get(key) === value) continue;
      const updatedAt = Date.now();
      localSnapshot.set(key, value);
      writes.push(
        pushValue(key, value, updatedAt)
          .then((result) => knownServerTime.set(key, Number(result.updatedAt || updatedAt)))
          .catch(() => {})
      );
    }

    for (const key of [...localSnapshot.keys()]) {
      if (current.has(key)) continue;
      const updatedAt = Date.now();
      localSnapshot.delete(key);
      writes.push(
        deleteValue(key, updatedAt)
          .then((result) => knownServerTime.set(key, Number(result.updatedAt || updatedAt)))
          .catch(() => {})
      );
    }

    if (writes.length) await Promise.all(writes);
  };

  const pullRemoteChanges = async () => {
    if (stopped) return;
    try {
      const remote = await requestState();
      applyRemote(remote.entries);
    } catch {
      // A temporary network failure should not make the local app unusable.
    }
  };

  await bootstrap();

  scanTimer = window.setInterval(scanLocalChanges, POLL_MS);
  pullTimer = window.setInterval(pullRemoteChanges, PULL_MS);

  return () => {
    stopped = true;
    if (scanTimer) window.clearInterval(scanTimer);
    if (pullTimer) window.clearInterval(pullTimer);
  };
}
