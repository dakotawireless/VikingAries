import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const jobsSource = fs.readFileSync(new URL("../convex/jobs.ts", import.meta.url), "utf8");
const schemaSource = fs.readFileSync(new URL("../convex/schema.ts", import.meta.url), "utf8");

function between(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(start >= 0 && end > start, `Expected source block ${startNeedle}`);
  return source.slice(start, end);
}

test("job summaries never store heavyweight execution payloads", () => {
  const table = between(schemaSource, "aiJobSummaries: defineTable", "projectFiles: defineTable");
  assert.doesNotMatch(table, /requestJson/);
  assert.doesNotMatch(table, /checkpointJson/);
  assert.doesNotMatch(table, /diagnosticsJson/);
  assert.match(table, /by_project_updatedAt/);
  assert.match(table, /by_project_thread_status/);
  assert.match(table, /by_status/);
});

test("UI job polling reads only lightweight summaries", () => {
  const block = between(jobsSource, "export const listProjectJobs", "export const listPriorThreadJobs");
  assert.match(block, /query\("aiJobSummaries"\)/);
  assert.doesNotMatch(block, /query\("aiJobs"\)/);
  assert.doesNotMatch(block, /requestJson/);
});

test("queue selection and Stop scan summaries, then fetch at most an exact payload by jobId", () => {
  const claim = between(jobsSource, "export const claimNextThreadJob", "export const cancelThreadJobs");
  const cancel = between(jobsSource, "export const cancelThreadJobs", "export const completeJob");
  assert.match(claim, /query\("aiJobSummaries"\)/);
  assert.match(claim, /getFullJobById/);
  assert.doesNotMatch(claim, /query\("aiJobs"\)[\s\S]*collect/);
  assert.match(cancel, /query\("aiJobSummaries"\)/);
  assert.match(cancel, /getFullJobById/);
});

test("summary text is bounded so many historical jobs cannot recreate the 16 MB polling failure", () => {
  assert.match(jobsSource, /userMessageContent: clipSummaryText\(job\.userMessageContent, 24000\)/);
  assert.match(jobsSource, /resultText: clipSummaryText\(job\.resultText, 120000\)/);
  assert.match(jobsSource, /error: clipSummaryText\(job\.error, 24000\)/);
  assert.match(jobsSource, /stopReason: clipSummaryText\(job\.stopReason, 24000\)/);
});

test("legacy oversized aiJobs are not queue barriers for newly summarized jobs", () => {
  const create = between(jobsSource, "export const createJob", "export const listProjectJobs");
  assert.match(create, /query\("aiJobSummaries"\)/);
  assert.doesNotMatch(create, /withIndex\("by_project_thread_status"[\s\S]*query\("aiJobs"\)/);
});
