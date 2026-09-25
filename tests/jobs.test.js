import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,next){
  return next(/\/_generated\/(server|api)$/.test(specifier)?specifier+'.js':specifier,context);
}});
const jobs = await import('../convex/jobs.ts');

function database(initial=[]) {
  const rows=structuredClone(initial), scheduled=[];
  const ctx={db:{
    query(){let selected=[...rows];const q={
      withIndex(_name,fn){fn({eq(field,value){selected=selected.filter(r=>r[field]===value);return this;}});return q;},
      order(){selected.sort((a,b)=>b.updatedAt-a.updatedAt);return q;},
      collect:async()=>selected, take:async n=>selected.slice(0,n), unique:async()=>selected[0]||null, first:async()=>selected[0]||null,
    };return q;},
    insert:async(_table,row)=>{rows.push({...row,_id:String(rows.length)});},
    patch:async(id,fields)=>Object.assign(rows.find(r=>r._id===id),fields),
  },scheduler:{runAfter:async(...args)=>scheduled.push(args)}};
  return {ctx,rows,scheduled};
}
const queued=()=>({_id:'a',jobId:'a',projectId:'p',threadId:'t',createdAt:Date.now(),updatedAt:Date.now(),status:'queued',lifecycleVersion:2});
const call=(name,ctx,args)=>jobs[name]._handler(ctx,args);

test('one claim and one runner per job; terminal cancel cannot be overwritten',async()=>{
 const {ctx,rows}=database([queued()]);
 assert.ok(await call('claimNextThreadJob',ctx,{projectId:'p',threadId:'t'}));
 assert.equal(await call('claimNextThreadJob',ctx,{projectId:'p',threadId:'t'}),null);
 assert.equal((await call('controlJob',ctx,{jobId:'a',claim:true})).status,'running');
 assert.equal((await call('controlJob',ctx,{jobId:'a',claim:true})).status,'duplicate');
 await call('cancelThreadJobs',ctx,{projectId:'p',threadId:'t'});
 assert.equal((await call('controlJob',ctx,{jobId:'a'})).status,'canceled');
 assert.equal(await call('completeJob',ctx,{jobId:'a',resultText:'late',completedAt:Date.now()}),false);
 assert.equal(await call('failJob',ctx,{jobId:'a',error:'late',completedAt:Date.now()}),false);
 assert.equal(rows[0].status,'canceled');
});
test('watchdog clears abandoned runs without replaying historical queued requests',async()=>{
 const old={...queued(),status:'running',startedAt:Date.now()-120000,updatedAt:Date.now()-120000};
 const legacy={...queued(),_id:'b',jobId:'b',lifecycleVersion:undefined};
 const {ctx,rows}=database([old,legacy]);
 await call('reconcileJobs',ctx,{});
 assert.deepEqual(rows.map(r=>r.status),['timed_out','timed_out']);
 assert.equal(await call('claimNextThreadJob',ctx,{projectId:'p',threadId:'t'}),null);
 assert.equal(await call('completeJob',ctx,{jobId:'a',resultText:'late',completedAt:Date.now()}),false);
});
test('duplicate submission by job or message ID schedules only once',async()=>{
 const {ctx,rows,scheduled}=database();
 const args={jobId:'a',projectId:'p',threadId:'t',projectName:'P',threadTitle:'T',requestJson:'{}',userMessageId:'u',createdAt:Date.now()};
 await call('createJob',ctx,args);
 assert.equal((await call('createJob',ctx,args)).duplicate,true);
 assert.equal((await call('createJob',ctx,{...args,jobId:'b'})).duplicate,true);
 assert.equal(rows.length,1);assert.equal(scheduled.length,1);
 assert.equal(rows[0].lifecycleVersion,3);
 assert.equal(rows[0].continuationCount,0);
 assert.equal(rows[0].cumulativeCostUsd,0);
 assert.match(rows[0].workBranch,/^aries\/task\//);
 assert.equal(rows[0].maxContinuations,6);
 assert.equal(rows[0].maxJobCostUsd,3);
});
test('successful completion schedules next job atomically and cannot later fail',async()=>{
 const {ctx,rows,scheduled}=database([{...queued(),status:'running'}]);
 assert.equal(await call('completeJob',ctx,{jobId:'a',resultText:'done',completedAt:Date.now()}),true);
 assert.equal(rows[0].status,'completed'); assert.equal(scheduled.length,1);
 assert.equal(await call('failJob',ctx,{jobId:'a',error:'late',completedAt:Date.now()}),false);
});
test('job list includes active jobs outside recent completed history',async()=>{
 const history=Array.from({length:120},(_,i)=>({...queued(),_id:String(i),jobId:String(i),status:'completed',updatedAt:Date.now()+i}));
 const {ctx}=database([...history,{...queued(),_id:'active',jobId:'active'}]);
 assert.ok((await call('listProjectJobs',ctx,{projectId:'p',limit:100})).some(r=>r.jobId==='active'));
});

test('interrupted finalization preserves the recovery response and diagnostics',async()=>{
 const now=Date.now();
 const {ctx,rows,scheduled}=database([{...queued(),status:'running',startedAt:now,deadlineAt:now+60000}]);
 const result=await call('finalizeInterruptedJob',ctx,{
   jobId:'a',
   status:'paused',
   resultText:'## Stop reason\nJob-level guardrail reached.\n\n## Next best action\nReview is required before further work.',
   stopReason:'Execution/tool budget reached',
   diagnosticsJson:JSON.stringify({toolRounds:8,toolExecutions:20,writesOccurred:true}),
   completedAt:now+100,
 });
 assert.equal(result,true);
 assert.equal(rows[0].status,'paused');
 assert.match(rows[0].resultText,/## Stop reason/);
 assert.equal(rows[0].stopReason,'Execution/tool budget reached');
 assert.match(rows[0].diagnosticsJson,/"toolExecutions":20/);
 assert.equal(scheduled.length,1);
});


test('paused execution slice automatically requeues the same durable job', async () => {
  const now=Date.now();
  const row={
    ...queued(),
    status:'running',
    lifecycleVersion:3,
    jobStartedAt:now-1000,
    continuationCount:0,
    cumulativeCostUsd:0,
    maxContinuations:6,
    maxJobCostUsd:3,
    maxJobElapsedMs:30*60*1000,
    workBranch:'aries/task/a',
    startedAt:now,
    deadlineAt:now+60000,
    runnerClaimed:true,
  };
  const {ctx,rows,scheduled}=database([row]);
  const result=await call('continueJobSlice',ctx,{
    jobId:'a',
    resultText:'checkpoint',
    stopReason:'Execution/tool budget reached',
    diagnosticsJson:'{}',
    checkpointJson:'{"step":1}',
    sliceCostUsd:0.31,
    completedAt:now+100,
  });
  assert.equal(result.continued,true);
  assert.equal(rows[0].status,'queued');
  assert.equal(rows[0].continuationCount,1);
  assert.equal(rows[0].cumulativeCostUsd,0.31);
  assert.equal(rows[0].checkpointJson,'{"step":1}');
  assert.equal(rows[0].runnerClaimed,false);
  assert.equal(rows[0].completedAt,undefined);
  assert.equal(scheduled.length,1);
  assert.equal(scheduled[0][0],150);
});

test('validation polling requeues without consuming substantive continuation quota', async () => {
  const now=Date.now();
  const {ctx,rows,scheduled}=database([{
    ...queued(),
    status:'running',
    lifecycleVersion:3,
    jobStartedAt:now-1000,
    continuationCount:2,
    cumulativeCostUsd:0.5,
    maxContinuations:6,
    maxJobCostUsd:3,
    maxJobElapsedMs:30*60*1000,
    workBranch:'aries/task/a',
    startedAt:now,
    deadlineAt:now+60000,
  }]);
  const result=await call('continueJobSlice',ctx,{
    jobId:'a',
    resultText:'waiting for CI',
    stopReason:'Task branch validation pending',
    diagnosticsJson:'{}',
    checkpointJson:'{"validation":"pending"}',
    sliceCostUsd:0,
    completedAt:now+100,
  });
  assert.equal(result.continued,true);
  assert.equal(rows[0].status,'queued');
  assert.equal(rows[0].continuationCount,2);
  assert.equal(rows[0].cumulativeCostUsd,0.5);
  assert.equal(scheduled[0][0],10000);
});

test('job-level guardrail turns automatic continuation into a reviewable pause', async () => {
  const now=Date.now();
  const {ctx,rows,scheduled}=database([{
    ...queued(),
    status:'running',
    lifecycleVersion:3,
    jobStartedAt:now-1000,
    continuationCount:6,
    cumulativeCostUsd:1,
    maxContinuations:6,
    maxJobCostUsd:3,
    maxJobElapsedMs:30*60*1000,
    startedAt:now,
    deadlineAt:now+60000,
  }]);
  const result=await call('continueJobSlice',ctx,{
    jobId:'a',
    resultText:'slice checkpoint',
    stopReason:'Execution/tool budget reached',
    sliceCostUsd:0.1,
    completedAt:now+100,
  });
  assert.equal(result.continued,false);
  assert.equal(rows[0].status,'paused');
  assert.equal(rows[0].continuationCount,7);
  assert.match(rows[0].error,/continuation limit/i);
  assert.match(rows[0].resultText,/guardrail/i);
  assert.equal(scheduled.length,1);
});
