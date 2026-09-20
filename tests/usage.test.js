import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.js";
import { openAIUsageForResponse } from "../worker/usage.js";

const usage = { input_tokens: 1000, input_tokens_details: { cached_tokens: 200, cache_write_tokens: 100 },
  output_tokens: 100, output_tokens_details: { reasoning_tokens: 50 }, total_tokens: 1100 };
const response = (id, extra = {}) => ({ id, usage, output_text: "Done.", ...extra });

test("cached and cache-write tokens use separate rates; reasoning is not charged twice", () => {
  const result = openAIUsageForResponse("gpt-5.6-luna", response("a"));
  assert.equal(result.totalTokens, 1100);
  assert.equal(result.reasoningTokens, 50);
  assert.ok(Math.abs(result.estimatedCostUsd - 0.000289) < 1e-12);
});
test("all supported models and long-context boundary", () => {
  for (const [model, input, output] of [
    ["gpt-5.6-luna", .2, 1.2], ["gpt-5.6-terra", 2, 12], ["gpt-5.6-sol", 4, 20],
  ]) {
    for (const tokens of [272000, 272001]) {
      const result = openAIUsageForResponse(model, { usage: { input_tokens: tokens, output_tokens: 100 } });
      const expected = (tokens * input * (tokens > 272000 ? 2 : 1) + 100 * output * (tokens > 272000 ? 1.5 : 1)) / 1e6;
      assert.equal(result.estimatedCostUsd, expected);
    }
  }
});

async function runChat(t, responses, { failStore = false, secret = "test-secret" } = {}) {
  const records = [];
  const order = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    if (String(url).includes("/usage/record")) {
      order.push("record");
      records.push(JSON.parse(init.body));
      if (failStore) return Response.json({ error: "unavailable" }, { status: 503 });
      return Response.json({ ok: true, id: "stored" });
    }
    assert.equal(String(url), "https://api.openai.com/v1/responses");
    order.push("model");
    const next = responses.shift();
    if (next instanceof Error) throw next;
    assert.ok(next, "unexpected extra model call");
    return Response.json(next);
  });
  const result = await worker.fetch(new Request("https://va.test/api/chat", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project: { id: "test-project", name: "Test project" },
      thread: { id: "test-thread" }, messages: [{ role: "user", content: "Test" }] }),
  }), { OPENAI_API_KEY: "test-only", VA_USAGE_INGEST_SECRET: secret });
  return { status: result.status, body: await result.json(), records, order };
}
const toolResponse = (id) => response(id, {
  output_text: "", output: [{ type: "function_call", name: "test_tool", call_id: "call", arguments: "{}" }],
});

test("each tool-loop response is recorded once before the next model call", async (t) => {
  const result = await runChat(t, [toolResponse("a"), response("b")]);
  assert.deepEqual(result.order, ["model", "record", "model", "record"]);
  assert.deepEqual(result.records.map((r) => r.responseId), ["a", "b"]);
  assert.equal(result.body.usage.requests, 2);
  assert.equal(result.body.usage.totalTokens, 2200);
  assert.equal(result.body.usageRecorded, true);
  assert.equal(result.records[0].projectId, "test-project");
  assert.equal(result.records[0].threadId, "test-thread");
});
test("a later network failure preserves earlier billable usage", async (t) => {
  const result = await runChat(t, [toolResponse("a"), new Error("network failed")]);
  assert.equal(result.status, 502);
  assert.equal(result.records.length, 1);
  assert.equal(result.body.usage.requests, 1);
});
test("incomplete response with no text is still recorded", async (t) => {
  const result = await runChat(t, [response("a", { output_text: "", status: "incomplete" })]);
  assert.equal(result.status, 502);
  assert.equal(result.records.length, 1);
});
test("storage failure warns visibly without breaking chat", async (t) => {
  const result = await runChat(t, [response("a")], { failStore: true });
  assert.equal(result.status, 200);
  assert.equal(result.body.usageRecorded, false);
  assert.match(result.body.text, /Done\..*API Counter warning/);
});
test("missing ingestion secret warns without inventing stored totals", async (t) => {
  const result = await runChat(t, [response("a")], { secret: "" });
  assert.equal(result.records.length, 0);
  assert.equal(result.body.usageRecorded, false);
  assert.match(result.body.text, /API Counter warning/);
});
test("missing provider usage is not recorded as a zero-cost call", async (t) => {
  const result = await runChat(t, [response("a", { usage: undefined })]);
  assert.equal(result.records.length, 0);
  assert.equal(result.body.usageRecorded, false);
});
test("a failed initial request does not fabricate token usage", async (t) => {
  const result = await runChat(t, [new Error("network failed")]);
  assert.equal(result.status, 502);
  assert.equal(result.records.length, 0);
  assert.equal(result.body.usage.requests, 0);
});
test("usage endpoint remains owner protected", async () => {
  const result = await worker.fetch(new Request("https://va.test/api/usage"), {});
  assert.equal(result.status, 401);
});


test("all-time summary includes records older than 365 days; normal ranges stay bounded", async () => {
  const { readFile } = await import("node:fs/promises");
  const { runInNewContext } = await import("node:vm");
  const source = (await readFile(new URL("../convex/usage.ts", import.meta.url), "utf8"))
    .replace(/^import .*;$/gm, "").replace(/export const /g, "var ");
  const validator = new Proxy(() => null, { get: () => () => null });
  const sandbox = { internalMutation: (x) => x, internalQuery: (x) => x, v: validator };
  runInNewContext(source, sandbox);
  const old = Date.now() - 400 * 86400000;
  let cutoff;
  const rows = [old, Date.now()].map((createdAt, i) => ({
    _id: String(i), projectId: "test", projectName: "Test", provider: "OpenAI",
    model: "gpt-5.6-luna", createdAt, ...openAIUsageForResponse("gpt-5.6-luna", response(String(i))),
  }));
  const query = {
    withIndex: (_name, filter) => { filter({ gte: (_field, value) => { cutoff = value; } }); return query; },
    collect: async () => rows.filter((row) => row.createdAt >= cutoff),
  };
  const ctx = { db: { query: () => query } };
  const all = await sandbox.usageSummary.handler(ctx, { days: 0 });
  assert.equal(all.totals.requests, 2);
  assert.equal(all.days, 0);
  const month = await sandbox.usageSummary.handler(ctx, { days: 30 });
  assert.equal(month.totals.requests, 1);
  assert.equal(month.today.requests, 1);
});
