import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { withRequestBudget, budgetedFetch, remainingRequests, resolveBoundSecret, MAX_AGENT_ROUNDS, MAX_AGENT_TOOLS, MAX_AGENT_COST_USD } from '../worker/request-budget.js';

const requestLimit = withRequestBudget(() => remainingRequests());

test('production safety ceilings stay intentionally small', () => {
  assert.equal(MAX_AGENT_ROUNDS, 8);
  assert.equal(MAX_AGENT_TOOLS, 20);
  assert.equal(MAX_AGENT_COST_USD, 0.50);
  assert.equal(requestLimit, 44);
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

test('secret lookup is cached only within its request and charged once', async () => {
  let reads = 0;
  const secret = { get: async () => { reads++; return 'test'; } };
  for (let i = 0; i < 2; i++) await withRequestBudget(async () => {
    assert.deepEqual(await Promise.all([resolveBoundSecret(secret), resolveBoundSecret(secret)]), ['test','test']);
    assert.equal(remainingRequests(), requestLimit - 1);
  });
  assert.equal(reads, 2);
});

for (const mode of ['reads', 'writes', 'rounds', 'store-failure', 'summary-failure']) {
  test(`${mode}: bounded execution preserves receipts, usage and normal response shape`, async (t) => {
    let requests = 0, models = 0, successfulModels = 0, writes = 0, stored = 0;
    const finalInputs = [];
    t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
      if (String(url).includes('/jobs/control')) return Response.json({status:'running',deadlineAt:Date.now()+480000});
      requests++;
      assert.ok(requests <= requestLimit, 'exceeded request-wide cap');
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
    assert.match(body.text, /Send continue/);
    assert.ok(models <= MAX_AGENT_ROUNDS + 1);
    assert.equal(stored, successfulModels);
    assert.equal(body.usage.requests, stored);
    assert.equal(body.actionReceipts.length, writes);
    assert.equal(body.usageRecorded, mode !== 'store-failure');
    if (mode === 'writes') assert.ok(writes > 0 && writes <= MAX_AGENT_TOOLS);
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
  assert.match(body.text, /AI cost ceiling reached/);
  assert.equal(modelCalls, 1);
  assert.ok(body.usage.estimatedCostUsd >= MAX_AGENT_COST_USD);
});

test('failed network attempts consume budget', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline'); });
  await withRequestBudget(async () => {
    await assert.rejects(budgetedFetch('https://test'), /offline/);
    assert.equal(remainingRequests(), requestLimit - 1);
  });
});
