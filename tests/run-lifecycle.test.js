import test from 'node:test';
import assert from 'node:assert/strict';
import {
  expiryReason,
  RUN_LIMIT_MS,
  LEASE_MS,
  TERMINAL,
  DEFAULT_JOB_MAX_CONTINUATIONS,
  DEFAULT_JOB_MAX_COST_USD,
  DEFAULT_JOB_MAX_ELAPSED_MS,
  jobContinuationLimitReason,
} from '../shared/run-lifecycle.js';
import { withRunControl } from '../worker/run-control.js';
import { budgetedFetch, withRequestBudget } from '../worker/request-budget.js';
import worker from '../worker/index.js';

test('watchdog expires legacy queue, lost heartbeat and absolute deadline only', () => {
  const now = Date.now();
  assert.match(expiryReason({status:'queued',createdAt:now}, now), /not replayed/);
  assert.equal(expiryReason({status:'queued',lifecycleVersion:2,createdAt:now}, now), null);
  assert.equal(expiryReason({status:'queued',lifecycleVersion:3,createdAt:now}, now), null);
  assert.match(expiryReason({status:'running',updatedAt:now-LEASE_MS,startedAt:now-LEASE_MS},now), /heartbeat/);
  assert.match(expiryReason({status:'running',updatedAt:now,startedAt:now-RUN_LIMIT_MS},now), /deadline/);
  for (const status of TERMINAL) assert.equal(expiryReason({status,updatedAt:0},now),null);
});

for (const mode of ['canceled', 'timed_out', 'control-outage']) {
  test(`${mode} aborts an in-flight provider request and prevents subsequent tool/API calls`, async t => {
    let heartbeats=0, calls=0;
    t.mock.method(globalThis, 'fetch', async (_url, {signal}) => {
      calls++;
      return new Promise((_resolve,reject) => {
        signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
      });
    });
    await withRunControl({intervalMs:5,deadlineAt:Date.now()+1000,heartbeat:async()=>{
      if (++heartbeats === 1) return {status:'running'};
      if (mode==='control-outage') throw Error('offline');
      return {status:mode};
    }},()=>withRequestBudget(async()=>{
      await assert.rejects(budgetedFetch('https://api.openai.com/v1/responses'));
      await assert.rejects(budgetedFetch('https://api.github.com/repos/test/contents/file',{method:'PUT'}));
    }));
    assert.equal(calls,1);
    const count=heartbeats;
    await new Promise(r=>setTimeout(r,20));
    assert.equal(heartbeats,count,'heartbeat stopped after finalization');
  });
}

test('deadline aborts even when the server still reports running', async () => {
  await withRunControl({heartbeat:async()=>({status:'running'}),deadlineAt:Date.now()+10},async signal=>{
    await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));
    assert.match(signal.reason.message,/deadline/);
  });
});

test('duplicate runner delivery performs no model call', async t=>{
  let calls=0;
  t.mock.method(globalThis,'fetch',async url=>{
    calls++;
    assert.match(String(url),/jobs\/control/);
    return Response.json({status:'duplicate'});
  });
  const result=await worker.fetch(new Request('https://va.test/api/chat',{
    method:'POST',headers:{'X-VA-Internal-Job-Secret':'test'},body:JSON.stringify({jobId:'duplicate'})
  }),{VA_USAGE_INGEST_SECRET:'test'});
  assert.equal(result.status,409);
  assert.equal(calls,1);
});

test('old browser direct requests cannot bypass durable execution',async()=>{
  const result=await worker.fetch(new Request('https://va.test/api/chat',{method:'POST',body:'{}'}),{VA_USAGE_INGEST_SECRET:'test'});
  assert.equal(result.status,409);
});


test('durable job continuation guardrails are separate from per-run expiry', () => {
  const now = Date.now();
  const job = {
    createdAt: now,
    jobStartedAt: now,
    continuationCount: 0,
    cumulativeCostUsd: 0,
  };
  assert.equal(DEFAULT_JOB_MAX_CONTINUATIONS, 6);
  assert.equal(DEFAULT_JOB_MAX_COST_USD, 3);
  assert.equal(DEFAULT_JOB_MAX_ELAPSED_MS, 30 * 60 * 1000);
  assert.equal(jobContinuationLimitReason(job, {
    nextContinuationCount: DEFAULT_JOB_MAX_CONTINUATIONS,
    nextCumulativeCostUsd: DEFAULT_JOB_MAX_COST_USD,
    now: now + 1000,
  }), null);
  assert.match(jobContinuationLimitReason(job, {
    nextContinuationCount: DEFAULT_JOB_MAX_CONTINUATIONS + 1,
    nextCumulativeCostUsd: 0,
    now,
  }), /continuation limit/i);
  assert.match(jobContinuationLimitReason(job, {
    nextContinuationCount: 1,
    nextCumulativeCostUsd: DEFAULT_JOB_MAX_COST_USD + 0.01,
    now,
  }), /cost limit/i);
  assert.match(jobContinuationLimitReason(job, {
    nextContinuationCount: 1,
    nextCumulativeCostUsd: 0,
    now: now + DEFAULT_JOB_MAX_ELAPSED_MS + 1,
  }), /elapsed-time limit/i);
});
