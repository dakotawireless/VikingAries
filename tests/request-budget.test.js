import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import {
  withRequestBudget,
  budgetedFetch,
  remainingRequests,
  resolveBoundSecret,
  MAX_AGENT_ROUNDS,
  MAX_AGENT_TOOLS,
  MAX_AGENT_COST_USD,
  AUTO_CONTINUE_ROUNDS,
  AUTO_CONTINUE_TOOLS,
  AUTO_CONTINUE_COST_USD,
  AUTO_CONTINUE_REQUEST_RESERVE,
} from '../worker/request-budget.js';

const requestLimit = withRequestBudget(() => remainingRequests());

test('production safety ceilings stay intentionally small', () => {
  assert.equal(MAX_AGENT_ROUNDS, 8);
  assert.equal(MAX_AGENT_TOOLS, 20);
  assert.equal(MAX_AGENT_COST_USD, 0.50);
  assert.equal(requestLimit, 44);
  assert.equal(AUTO_CONTINUE_ROUNDS, 7);
  assert.equal(AUTO_CONTINUE_TOOLS, 18);
  assert.equal(AUTO_CONTINUE_COST_USD, 0.42);
  assert.equal(AUTO_CONTINUE_REQUEST_RESERVE, 12);
  assert.ok(AUTO_CONTINUE_ROUNDS < MAX_AGENT_ROUNDS);
  assert.ok(AUTO_CONTINUE_TOOLS < MAX_AGENT_TOOLS);
});

test('hard limit isolates simultaneous requests', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.equal(init.redirect, 'manual');
    return Response.json({});
  });
  await Promise.all([1,2].map(() => withRequestBudget(async () => {
    await Promise.all(Array.from({ length: requestLimit }, () => budgetedFetch('https://test')));
    assert.equal(remainingRequests(), 0);
    await assert.rejects(budgetedFetch('https://test'), /request budget/);
  })));
});

test('secret lookup is cached within a request without consuming agent work budget', async () => {
  let reads = 0;
  const secret = { get: async () => { reads++; return 'test'; } };
  for (let i = 0; i < 2; i++) await withRequestBudget(async () => {
    assert.deepEqual(await Promise.all([resolveBoundSecret(secret), resolveBoundSecret(secret)]), ['test','test']);
    assert.equal(remainingRequests(), requestLimit);
  });
  assert.equal(reads, 2);
});

for (const mode of ['reads', 'writes', 'rounds', 'store-failure', 'summary-failure']) {
  test(`${mode}: bounded execution preserves receipts, usage and normal response shape`, async (t) => {
    let agentRequests = 0, models = 0, successfulModels = 0, writes = 0, stored = 0;
    const finalInputs = [];
    t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
      if (String(url).includes('/jobs/control')) return Response.json({status:'running',deadlineAt:Date.now()+480000});
      if (String(url).includes('api.openai.com') || String(url).includes('api.github.com')) {
        agentRequests++;
        assert.ok(agentRequests <= requestLimit, 'exceeded external agent-work cap');
      }
      if (String(url).includes('api.openai.com')) {
        models++;
        const body = JSON.parse(init.body);
        if (body.tool_choice === 'none') {
          finalInputs.push(body.input);
          if (mode === "summary-failure") throw new Error("AI unavailable");
          successfulModels++;
          return Response.json({ id: `r${models}`, output_text: 'Completed this batch; more remains.', usage: { input_tokens: 1, output_tokens: 1 } });
        }
        successfulModels++;
        return Response.json({ id: `r${models}`, usage: { input_tokens: 1, output_tokens: 1 }, output:
          Array.from({length: mode === 'rounds' ? 1 : MAX_AGENT_TOOLS + 10}, (_, i) => ({
            type: 'function_call', call_id: `c${models}-${i}`,
            name: mode === 'writes' ? 'github_write_file' : 'github_read_file',
            arguments: JSON.stringify({ path: `file${i}.js`, content: 'new', message: 'Update' }),
          })) });
      }
      if (String(url).includes('api.github.com')) {
        if (init.method === 'PUT') {
          writes++;
          return Response.json({ content: { path: 'file.js' }, commit: { sha: `commit${writes}` } });
        }
        return Response.json({ type: 'file', path: 'file.js', sha: 'old', encoding: 'base64', content: 'b2xk' });
      }
      if (String(url).includes('/usage/record')) {
        stored++;
        return mode === 'store-failure' ? Response.json({}, { status: 503 }) : Response.json({ ok: true, id: 'stored' });
      }
      if (String(url).endsWith('/state')) return Response.json({ entries: [] });
      throw new Error(`Unexpected URL ${url}`);
    });
    const result = await worker.fetch(new Request('https://test/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-VA-Internal-Job-Secret': 'secret' },
      body: JSON.stringify({ jobId: 'budget-test', project: { id: 'viking-aries' }, thread: { id: 'thread' }, messages: [{ role: 'user', content: 'Do a large task' }] }),
    }), { OPENAI_API_KEY: 'test', GITHUB_TOKEN: 'test', VA_USAGE_INGEST_SECRET: 'secret' });
    const body = await result.json();
    assert.equal(result.status, 200);
    assert.equal(body.executionStatus, 'paused');
    assert.equal(body.continuationRequired, true);
    assert.match(body.text, /continue automatically|automatic continuation/i);
    assert.ok(models <= MAX_AGENT_ROUNDS + 1);
    assert.equal(stored, successfulModels);
    assert.equal(body.usage.requests, stored);
    assert.equal(body.actionReceipts.length, writes);
    assert.equal(body.usageRecorded, mode !== 'store-failure');
    if (mode === 'writes') assert.ok(writes > 0 && writes <= AUTO_CONTINUE_TOOLS);
    if (mode !== 'rounds' && mode !== 'summary-failure') {
      assert.ok(finalInputs.some((input) =>
        Array.isArray(input) &&
        input.some((item) => {
          try { return JSON.parse(item.output).deferred === true; } catch { return false; }
        })
      ));
    }
  });
}

test('normal multi-file app task finishes despite progress and checkpoint bookkeeping', async (t) => {
  let modelCalls = 0;
  let writes = 0;
  let bookkeepingRequests = 0;

  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    const target = String(url);
    if (target.includes('/jobs/control')) {
      return Response.json({ status: 'running', deadlineAt: Date.now() + 240000 });
    }
    if (target.includes('/usage/record')) {
      bookkeepingRequests++;
      return Response.json({ ok: true, id: `usage-${bookkeepingRequests}` });
    }
    if (target.includes('/state')) {
      bookkeepingRequests++;
      return init.method === 'PUT'
        ? Response.json({ ok: true })
        : Response.json({ entries: [] });
    }
    if (target.includes('api.github.com')) {
      if (init.method === 'PUT') {
        writes++;
        return Response.json({
          content: { path: writes === 1 ? 'src/App.jsx' : 'src/chat-layout-overrides.css' },
          commit: { sha: `commit-${writes}` },
        });
      }
      return Response.json({
        type: 'file',
        path: 'src/App.jsx',
        sha: 'old-sha',
        encoding: 'base64',
        content: 'b2xk',
      });
    }
    if (target.includes('api.openai.com')) {
      modelCalls++;
      if (modelCalls === 1) {
        return Response.json({
          id: 'round-1',
          usage: { input_tokens: 10, output_tokens: 10 },
          output: ['src/App.jsx','src/chat-layout-overrides.css','src/styles.css','src/main.jsx'].map((path, index) => ({
            type: 'function_call',
            call_id: `read-${index}`,
            name: 'github_read_file',
            arguments: JSON.stringify({ path }),
          })),
        });
      }
      if (modelCalls === 2) {
        return Response.json({
          id: 'round-2',
          usage: { input_tokens: 10, output_tokens: 10 },
          output: [
            {
              type: 'function_call',
              call_id: 'write-app',
              name: 'github_write_file',
              arguments: JSON.stringify({ path: 'src/App.jsx', content: 'updated app', message: 'Update chat scroll' }),
            },
            {
              type: 'function_call',
              call_id: 'write-css',
              name: 'github_write_file',
              arguments: JSON.stringify({ path: 'src/chat-layout-overrides.css', content: 'updated css', message: 'Restore latest button' }),
            },
          ],
        });
      }
      return Response.json({
        id: 'round-3',
        output_text: 'Completed the shared chat UX update.',
        usage: { input_tokens: 10, output_tokens: 10 },
      });
    }
    throw new Error(`Unexpected URL ${url}`);
  });

  const result = await worker.fetch(new Request('https://test/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-VA-Internal-Job-Secret': 'secret' },
    body: JSON.stringify({
      jobId: 'normal-multifile-task',
      project: { id: 'viking-aries' },
      thread: { id: 'thread' },
      messages: [{ role: 'user', content: 'Make the shared chat auto-scroll and restore the Scroll to Bottom button globally.' }],
    }),
  }), {
    OPENAI_API_KEY: 'test',
    GITHUB_TOKEN: 'test',
    VA_USAGE_INGEST_SECRET: 'secret',
  });

  const body = await result.json();
  assert.equal(result.status, 200);
  assert.equal(body.executionStatus, undefined);
  assert.equal(body.continuationRequired, undefined);
  assert.equal(modelCalls, 3);
  assert.equal(writes, 2);
  assert.equal(body.actionReceipts.length, 2);
  assert.ok(bookkeepingRequests >= 6, 'test should exercise substantial internal bookkeeping');
  assert.match(body.text, /Completed the shared chat UX update/);
});

test('cost ceiling stops the run without an extra recovery model call', async (t) => {
  let modelCalls = 0;
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    if (String(url).includes('/jobs/control')) {
      return Response.json({ status: 'running', deadlineAt: Date.now() + 240000 });
    }
    if (String(url).endsWith('/state')) return Response.json({ entries: [] });
    if (String(url).includes('/usage/record')) return Response.json({ ok: true, id: 'stored' });
    if (String(url).includes('api.openai.com')) {
      modelCalls++;
      return Response.json({
        id: 'expensive',
        output_text: 'This response alone crossed the run ceiling.',
        usage: { input_tokens: 100000, output_tokens: 10000, total_tokens: 110000 },
      });
    }
    throw new Error(`Unexpected URL ${url}`);
  });

  const result = await worker.fetch(new Request('https://test/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-VA-Internal-Job-Secret': 'secret' },
    body: JSON.stringify({
      jobId: 'cost-ceiling-test',
      model: 'gpt-5.6-sol',
      project: { id: 'viking-aries' },
      thread: { id: 'thread' },
      messages: [{ role: 'user', content: 'Large task' }],
    }),
  }), { OPENAI_API_KEY: 'test', VA_USAGE_INGEST_SECRET: 'secret' });

  const body = await result.json();
  assert.equal(result.status, 200);
  assert.equal(body.executionStatus, 'paused');
  assert.match(body.text, /AI slice cost checkpoint reached/);
  assert.equal(modelCalls, 1);
  assert.ok(body.usage.estimatedCostUsd >= AUTO_CONTINUE_COST_USD);
});

test('failed network attempts consume budget', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline'); });
  await withRequestBudget(async () => {
    await assert.rejects(budgetedFetch('https://test'), /offline/);
    assert.equal(remainingRequests(), requestLimit - 1);
  });
});
