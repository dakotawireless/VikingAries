import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.js";

const usage = { input_tokens: 5, output_tokens: 5, total_tokens: 10 };

function common(target, init = {}) {
  if (target.includes("/jobs/control")) return Response.json({ status: "running", deadlineAt: Date.now() + 240000 });
  if (target.includes("/usage/record")) return Response.json({ ok: true, id: "usage" });
  if (target.endsWith("/state")) return init.method === "PUT" ? Response.json({ ok: true }) : Response.json({ entries: [] });
  return null;
}

async function runChat(message, mockFetch) {
  const original = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    const response = await worker.fetch(new Request("https://test/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-VA-Internal-Job-Secret": "secret" },
      body: JSON.stringify({
        jobId: "cross-project-test",
        project: { id: "dw-pos", name: "Dakota Wireless POS" },
        thread: { id: "thread-cross-project" },
        messages: [{ role: "user", content: message }],
      }),
    }), {
      OPENAI_API_KEY: "test",
      GITHUB_TOKEN: "test",
      VA_USAGE_INGEST_SECRET: "secret",
    });
    return { response, body: await response.json() };
  } finally {
    globalThis.fetch = original;
  }
}

test("owner chat can read another registered project repository", async () => {
  let modelCall = 0;
  let readTimekeeper = false;
  const { response, body } = await runChat(
    "Compare the Timekeeper index.html with Dakota Wireless POS. Do not make changes.",
    async (url, init = {}) => {
      const target = String(url);
      const internal = common(target, init);
      if (internal) return internal;
      if (target.includes("api.openai.com")) {
        modelCall++;
        if (modelCall === 1) return Response.json({
          id: "r1", usage,
          output: [{
            type: "function_call", call_id: "read",
            name: "owner_project_read_file",
            arguments: JSON.stringify({ projectId: "timekeeper", path: "index.html" }),
          }],
        });
        return Response.json({ id: "r2", usage, output_text: "Compared without changing either project." });
      }
      if (target.includes("api.github.com")) {
        assert.match(target, /dakotawireless\/TimeKeeper-App/);
        readTimekeeper = true;
        return Response.json({
          type: "file", path: "index.html", sha: "tk", size: 20, encoding: "base64",
          content: Buffer.from("<html>Timekeeper</html>").toString("base64"),
        });
      }
      throw new Error(`Unexpected URL ${target}`);
    }
  );
  assert.equal(response.status, 200);
  assert.equal(readTimekeeper, true);
  assert.match(body.text, /Compared/);
});

test("cross-project write is rejected without explicit authorization", async () => {
  let modelCall = 0;
  let githubWrites = 0;
  let sawBlock = false;
  const { response, body } = await runChat(
    "Compare Timekeeper with Dakota Wireless POS. Do not make changes.",
    async (url, init = {}) => {
      const target = String(url);
      const internal = common(target, init);
      if (internal) return internal;
      if (target.includes("api.openai.com")) {
        modelCall++;
        const req = JSON.parse(init.body);
        if (modelCall === 1) return Response.json({
          id: "r1", usage,
          output: [{
            type: "function_call", call_id: "write",
            name: "owner_project_write_file",
            arguments: JSON.stringify({
              projectId: "timekeeper", path: "blocked.txt", content: "no", message: "Blocked write",
            }),
          }],
        });
        sawBlock = JSON.stringify(req.input || []).includes("Cross-project write blocked");
        return Response.json({ id: "r2", usage, output_text: "Stayed read-only." });
      }
      if (target.includes("api.github.com")) {
        if (init.method === "PUT") githubWrites++;
        return Response.json({ message: "Not Found" }, { status: 404 });
      }
      throw new Error(`Unexpected URL ${target}`);
    }
  );
  assert.equal(response.status, 200);
  assert.equal(githubWrites, 0);
  assert.equal(sawBlock, true);
  assert.match(body.text, /read-only/);
});

test("POS can reuse Timekeeper Bear Paw media directly as a favicon asset", async () => {
  let modelCall = 0;
  let writePayload = null;
  const bear = Uint8Array.from([137,80,78,71,13,10,26,10,1,2,3,4]);

  const { response, body } = await runChat(
    "Use the Bear Paw from Timekeeper Files & Media as the Dakota Wireless POS favicon and commit it.",
    async (url, init = {}) => {
      const target = String(url);
      const internal = common(target, init);
      if (internal) return internal;

      if (target.includes("api.openai.com")) {
        modelCall++;
        if (modelCall === 1) return Response.json({
          id: "r1", usage,
          output: [{
            type: "function_call", call_id: "search",
            name: "files_media_search_files",
            arguments: JSON.stringify({ query: "Bear Paw", projectId: "all" }),
          }],
        });
        if (modelCall === 2) return Response.json({
          id: "r2", usage,
          output: [{
            type: "function_call", call_id: "copy",
            name: "files_media_copy_file_to_project_repository",
            arguments: JSON.stringify({
              sourceProjectId: "timekeeper",
              fileId: "bear-file-id",
              destinationProjectId: "dw-pos",
              destinationPath: "public/Bear Paw.png",
              message: "Use Bear Paw as POS favicon asset",
            }),
          }],
        });
        return Response.json({ id: "r3", usage, output_text: "Bear Paw asset copied into the POS repository." });
      }

      if (target.includes("flippant-mandrill-487.convex.site/files/list")) {
        const projectId = new URL(target).searchParams.get("projectId");
        return Response.json({
          ok: true,
          files: projectId === "timekeeper"
            ? [{ id: "bear-file-id", name: "Bear Paw.png", type: "image/png", size: bear.length, uploadedAt: 1 }]
            : [],
        });
      }

      if (target.includes("flippant-mandrill-487.convex.site/files/raw")) {
        return new Response(bear, { headers: { "Content-Type": "image/png", "Content-Length": String(bear.length) } });
      }

      if (target.includes("api.github.com")) {
        assert.match(target, /dakotawireless\/Dakota-Wireless-POS---New/);
        if (init.method === "PUT") {
          writePayload = JSON.parse(init.body);
          return Response.json({
            content: { path: "public/Bear Paw.png", sha: "asset-sha" },
            commit: { sha: "favicon-commit", html_url: "https://github.test/commit/favicon-commit" },
          });
        }
        return Response.json({ message: "Not Found" }, { status: 404 });
      }

      throw new Error(`Unexpected URL ${target}`);
    }
  );

  assert.equal(response.status, 200);
  assert.ok(writePayload);
  assert.equal(writePayload.branch, "main");
  assert.deepEqual(Buffer.from(writePayload.content, "base64"), Buffer.from(bear));
  assert.match(body.text, /copied into the POS repository/);
  assert.equal(body.actionReceipts.some((receipt) => receipt.commitSha === "favicon-commit"), true);
});
