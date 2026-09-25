import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const httpSource = fs.readFileSync(new URL("../convex/http.ts", import.meta.url), "utf8");

test("typing indicator requires backend-confirmed running state", () => {
  assert.match(
    appSource,
    /confirmedRunningJobIds\.includes\(message\.jobId\)/
  );
  assert.match(
    appSource,
    /\{sending && hasUnansweredRunningJob && \(/
  );
  assert.match(
    appSource,
    /setConfirmedRunningJobIds\(\[\]\);[\s\S]*setStatusText\(error\.message \|\| "Background job sync needs attention"\)/
  );
});

test("job list polling does not run global reconciliation", () => {
  const start = httpSource.indexOf('path: "/jobs/list"');
  const end = httpSource.indexOf('path: "/jobs/control"', start);
  assert.ok(start >= 0 && end > start, "jobs/list route should exist");
  const block = httpSource.slice(start, end);
  assert.doesNotMatch(block, /reconcileJobs/);
  assert.match(block, /listProjectJobs/);
});

test("job list failures are explicit service-unavailable responses", () => {
  const start = httpSource.indexOf('path: "/jobs/list"');
  const end = httpSource.indexOf('path: "/jobs/control"', start);
  const block = httpSource.slice(start, end);
  assert.match(block, /status: 503/);
  assert.match(block, /Could not list AI jobs/);
});
