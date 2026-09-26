import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const workerSource = fs.readFileSync(new URL("../worker/index.js", import.meta.url), "utf8");
const jobsSource = fs.readFileSync(new URL("../convex/jobs.ts", import.meta.url), "utf8");
const lifecycleSource = fs.readFileSync(new URL("../shared/run-lifecycle.js", import.meta.url), "utf8");

test("durable jobs allow more slices without raising total cost or elapsed-time caps", () => {
  assert.match(lifecycleSource, /DEFAULT_JOB_MAX_CONTINUATIONS = 12/);
  assert.match(lifecycleSource, /DEFAULT_JOB_MAX_COST_USD = 3\.00/);
  assert.match(lifecycleSource, /DEFAULT_JOB_MAX_ELAPSED_MS = 30 \* 60 \* 1000/);
});

test("continuation handoff includes completed operations and verified writes", () => {
  assert.match(workerSource, /completedOperations: \(state\.completedOperations \|\| \[\]\)\.slice\(-40\)/);
  assert.match(workerSource, /writes: \(state\.writes \|\| \[\]\)\.slice\(-20\)/);
  assert.match(workerSource, /checkpointOperations/);
  assert.match(workerSource, /checkpointWrites/);
  assert.match(workerSource, /storedCheckpoint/);
  assert.match(workerSource, /suppliedCheckpoint/);
});

test("Convex durable checkpoint persists structured progress across slices", () => {
  assert.match(jobsSource, /completedOperations: Array\.isArray\(diagnostics\?\.completedOperations\)/);
  assert.match(jobsSource, /writes: Array\.isArray\(diagnostics\?\.writes\)/);
  assert.match(jobsSource, /diagnostics\.completedOperations\.slice\(-40\)/);
  assert.match(jobsSource, /diagnostics\.writes\.slice\(-20\)/);
});
