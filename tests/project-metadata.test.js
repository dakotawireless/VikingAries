import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.js";

const PROD_URL = "https://dakota-wireless-pos---new.erik-f2c.workers.dev";

test("AI can update Dakota Wireless POS metadata without changing provider mappings", async (t) => {
  let modelCalls = 0;
  let metadataWrite = null;
  let providerWriteCalls = 0;

  t.mock.method(globalThis, "fetch", async (url, init = {}) => {
    const target = String(url);

    if (target.includes("/jobs/control")) {
      return Response.json({ status: "running", deadlineAt: Date.now() + 240000 });
    }

    if (target.includes("/usage/record")) {
      return Response.json({ ok: true, id: "usage" });
    }

    if (target.includes("flippant-mandrill-487.convex.site/state")) {
      if (init.method === "PUT") {
        const payload = JSON.parse(init.body || "{}");
        if (payload.key === "viking-aries:project-metadata:dw-pos") metadataWrite = payload;
        return Response.json({ ok: true, updatedAt: payload.updatedAt || Date.now() });
      }
      return Response.json({ entries: [] });
    }

    if (target.includes("api.openai.com")) {
      modelCalls++;
      if (modelCalls === 1) {
        return Response.json({
          id: "metadata-round",
          usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
          output: [{
            type: "function_call",
            call_id: "update-pos-metadata",
            name: "owner_project_update_metadata",
            arguments: JSON.stringify({
              projectId: "dw-pos",
              deploymentUrl: PROD_URL,
              status: "Active",
              navigationLinks: [
                { id: "open-app", label: "Open App", path: "/" },
                { id: "transaction", label: "Transactions", path: "/transaction" },
              ],
            }),
          }],
        });
      }

      return Response.json({
        id: "final",
        usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
        output_text: "Updated Dakota Wireless POS project metadata only.",
      });
    }

    if (
      target.includes("api.github.com") ||
      target.includes("api.cloudflare.com") ||
      target.includes("api.convex.dev")
    ) {
      providerWriteCalls++;
      throw new Error("Provider mutation should not be called by a metadata-only update.");
    }

    throw new Error(`Unexpected URL ${target}`);
  });

  const response = await worker.fetch(new Request("https://test/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-VA-Internal-Job-Secret": "secret",
    },
    body: JSON.stringify({
      jobId: "metadata-test",
      project: {
        id: "dw-pos",
        name: "Dakota Wireless POS",
        repository: "dakotawireless/Dakota-Wireless-POS---New",
        defaultBranch: "main",
        deploymentUrl: PROD_URL,
        cloudflareWorker: "dakota-wireless-pos---new",
        backend: "Convex",
        backendDeployment: "energized-crane-577",
        backendUrl: "https://energized-crane-577.convex.cloud",
        status: "Active",
      },
      thread: { id: "metadata-thread" },
      messages: [{
        role: "user",
        content: "Update Dakota Wireless POS project metadata to use the current production URL and transaction sidebar link. Do not change the repository, Cloudflare worker, Convex deployment, credentials, routing, or application code.",
      }],
    }),
  }), {
    OPENAI_API_KEY: "test",
    VA_USAGE_INGEST_SECRET: "secret",
  });

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(providerWriteCalls, 0);
  assert.ok(metadataWrite, "expected a durable project metadata state write");

  const saved = JSON.parse(metadataWrite.value);
  assert.equal(saved.deploymentUrl, PROD_URL);
  assert.equal(saved.status, "Active");
  assert.deepEqual(saved.navigationLinks, [
    { id: "open-app", label: "Open App", path: "/" },
    { id: "transaction", label: "Transactions", path: "/transaction" },
  ]);

  assert.match(body.text, /metadata only/i);
  const receipt = body.actionReceipts.find((item) => item.action === "project_metadata_update");
  assert.ok(receipt, "expected a verified metadata update receipt");
  assert.equal(receipt.projectId, "dw-pos");
  assert.deepEqual(receipt.changedFields.sort(), ["deploymentUrl", "navigationLinks", "status"].sort());
});

test("cross-project metadata write remains blocked without explicit authorization", async (t) => {
  let modelCalls = 0;
  let metadataWrites = 0;
  let sawBlockedOutput = false;

  t.mock.method(globalThis, "fetch", async (url, init = {}) => {
    const target = String(url);

    if (target.includes("/jobs/control")) {
      return Response.json({ status: "running", deadlineAt: Date.now() + 240000 });
    }
    if (target.includes("/usage/record")) {
      return Response.json({ ok: true, id: "usage" });
    }
    if (target.includes("flippant-mandrill-487.convex.site/state")) {
      if (init.method === "PUT") {
        const payload = JSON.parse(init.body || "{}");
        if (payload.key === "viking-aries:project-metadata:timekeeper") metadataWrites++;
        return Response.json({ ok: true, updatedAt: payload.updatedAt || Date.now() });
      }
      return Response.json({ entries: [] });
    }

    if (target.includes("api.openai.com")) {
      modelCalls++;
      const requestBody = JSON.parse(init.body);
      if (modelCalls === 1) {
        return Response.json({
          id: "attempt",
          usage: { input_tokens: 5, output_tokens: 5, total_tokens: 10 },
          output: [{
            type: "function_call",
            call_id: "bad-metadata-write",
            name: "owner_project_update_metadata",
            arguments: JSON.stringify({
              projectId: "timekeeper",
              deploymentUrl: "https://should-not-change.example",
            }),
          }],
        });
      }
      sawBlockedOutput = JSON.stringify(requestBody.input || []).includes("Project metadata update blocked");
      return Response.json({
        id: "final",
        usage: { input_tokens: 5, output_tokens: 5, total_tokens: 10 },
        output_text: "No cross-project metadata was changed.",
      });
    }

    throw new Error(`Unexpected URL ${target}`);
  });

  const response = await worker.fetch(new Request("https://test/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-VA-Internal-Job-Secret": "secret",
    },
    body: JSON.stringify({
      jobId: "metadata-block-test",
      project: { id: "dw-pos", name: "Dakota Wireless POS" },
      thread: { id: "metadata-block-thread" },
      messages: [{
        role: "user",
        content: "Compare Timekeeper metadata with Dakota Wireless POS. Do not change anything.",
      }],
    }),
  }), {
    OPENAI_API_KEY: "test",
    VA_USAGE_INGEST_SECRET: "secret",
  });

  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(metadataWrites, 0);
  assert.equal(sawBlockedOutput, true);
  assert.match(body.text, /No cross-project metadata was changed/);
});
