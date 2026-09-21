const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {createSqliteD1}=require('./sqlite-d1.cjs');

async function autoRemediate(){return import(pathToFileURL(process.cwd()+'/control-center/lib/auto-remediate.js'));}
async function approvalStore(){return import(pathToFileURL(process.cwd()+'/control-center/lib/approval-store.js'));}

async function seedPendingApproval(db,{id='ap1',agentId='technical-seo-watchdog',targetId='999'}={}){
  const {ensureControlSchema,insertApproval}=await approvalStore();
  await ensureControlSchema(db);
  const row={id,agentId,action:'REVIEW_RESULT',targetType:'workflow_run',targetId,targetRevision:targetId,payloadHash:'x',createdAt:new Date().toISOString()};
  await insertApproval(db,row);
  return row;
}

function fakeGithub({findings,dispatched}){
  return {
    getWorkflowRunReview: async()=>({reviewResult:{findings}}),
    dispatchRemediation: async(job)=>{ dispatched.push(job); return {ok:true}; }
  };
}

test('a fully-GREEN report auto-approves and dispatches remediation without any human decision',async()=>{
  const {maybeAutoRemediateGreenReport}=await autoRemediate();
  const {getApproval}=await approvalStore();
  const db=createSqliteD1();
  const approvalRow=await seedPendingApproval(db);
  const dispatched=[];
  const github=fakeGithub({findings:[{findingType:'robots-sitemap',summary:'missing sitemap',recommendedAction:'add it'}],dispatched});
  const outcome=await maybeAutoRemediateGreenReport({approvalRow,db,github});
  assert.equal(outcome.attempted,true);
  assert.equal(outcome.result.reviewAccepted,true);
  const approval=await getApproval(db,approvalRow.id);
  assert.equal(approval.status,'APPROVED','the approval must be auto-approved, not left PENDING');
  assert.equal(dispatched.length,1);
  assert.equal(dispatched[0].autonomy,'GREEN');
});

test('a mixed report (one GREEN, one non-GREEN finding) is left PENDING for the owner',async()=>{
  const {maybeAutoRemediateGreenReport}=await autoRemediate();
  const {getApproval}=await approvalStore();
  const db=createSqliteD1();
  const approvalRow=await seedPendingApproval(db,{id:'ap-mixed'});
  const dispatched=[];
  const github=fakeGithub({findings:[
    {findingType:'robots-sitemap',summary:'x',recommendedAction:'y'},
    {findingType:'canonical',summary:'x',recommendedAction:'y'}
  ],dispatched});
  const outcome=await maybeAutoRemediateGreenReport({approvalRow,db,github});
  assert.equal(outcome.attempted,false);
  const approval=await getApproval(db,approvalRow.id);
  assert.equal(approval.status,'PENDING','a mixed report must never auto-execute any part of itself');
  assert.equal(dispatched.length,0);
});

test('a report with no actionable findings is left PENDING (never auto-approved as green)',async()=>{
  const {maybeAutoRemediateGreenReport}=await autoRemediate();
  const {getApproval}=await approvalStore();
  const db=createSqliteD1();
  const approvalRow=await seedPendingApproval(db,{id:'ap-empty'});
  const github=fakeGithub({findings:[],dispatched:[]});
  const outcome=await maybeAutoRemediateGreenReport({approvalRow,db,github});
  assert.equal(outcome.attempted,false);
  const approval=await getApproval(db,approvalRow.id);
  assert.equal(approval.status,'PENDING');
});

test('exceeding the bounded failure cooldown stops auto-remediation and leaves the approval for owner review',async()=>{
  const {maybeAutoRemediateGreenReport}=await autoRemediate();
  const {getApproval}=await approvalStore();
  const {ensureRemediationSchema,createRemediationJob,updateRemediationJob}=await import(pathToFileURL(process.cwd()+'/control-center/lib/remediation-store.js'));
  const db=createSqliteD1();
  await ensureRemediationSchema(db);
  const approvalRow=await seedPendingApproval(db,{id:'ap-cooldown'});
  // Two prior FAILED attempts for this exact finding, within the cooldown window.
  for(let i=0;i<2;i++){
    const job={id:crypto.randomUUID(),sourceAgentId:'technical-seo-watchdog',sourceRunId:'1',ownerApprovalId:'prior',findingType:'robots-sitemap',summary:'s',recommendedAction:'a',rawFinding:{},remediationAgentId:'technical-seo-fixer',autonomy:'GREEN',createdAt:new Date().toISOString()};
    await createRemediationJob(db,job);
    await updateRemediationJob(db,job.id,'FAILED');
  }
  const dispatched=[];
  const github=fakeGithub({findings:[{findingType:'robots-sitemap',summary:'x',recommendedAction:'y'}],dispatched});
  const outcome=await maybeAutoRemediateGreenReport({approvalRow,db,github});
  assert.equal(outcome.attempted,false);
  assert.match(outcome.reason,/failed 2 time/);
  const approval=await getApproval(db,approvalRow.id);
  assert.equal(approval.status,'PENDING','exhausted auto-retries must escalate to a normal owner-reviewed approval, not keep retrying');
  assert.equal(dispatched.length,0);
});

test('an already in-flight job for the same finding stops a second automatic attempt',async()=>{
  const {maybeAutoRemediateGreenReport}=await autoRemediate();
  const {getApproval}=await approvalStore();
  const {ensureRemediationSchema,createRemediationJob,updateRemediationJob}=await import(pathToFileURL(process.cwd()+'/control-center/lib/remediation-store.js'));
  const db=createSqliteD1();
  await ensureRemediationSchema(db);
  const approvalRow=await seedPendingApproval(db,{id:'ap-inflight'});
  const job={id:crypto.randomUUID(),sourceAgentId:'technical-seo-watchdog',sourceRunId:'1',ownerApprovalId:'prior',findingType:'robots-sitemap',summary:'s',recommendedAction:'a',rawFinding:{},remediationAgentId:'technical-seo-fixer',autonomy:'GREEN',createdAt:new Date().toISOString()};
  await createRemediationJob(db,job);
  await updateRemediationJob(db,job.id,'DISPATCHED');
  const dispatched=[];
  const github=fakeGithub({findings:[{findingType:'robots-sitemap',summary:'x',recommendedAction:'y'}],dispatched});
  const outcome=await maybeAutoRemediateGreenReport({approvalRow,db,github});
  assert.equal(outcome.attempted,false);
  assert.match(outcome.reason,/already in flight/);
  const approval=await getApproval(db,approvalRow.id);
  assert.equal(approval.status,'PENDING');
  assert.equal(dispatched.length,0);
});

test('a getWorkflowRunReview failure never crashes the caller and leaves the approval PENDING',async()=>{
  const {maybeAutoRemediateGreenReport}=await autoRemediate();
  const {getApproval}=await approvalStore();
  const db=createSqliteD1();
  const approvalRow=await seedPendingApproval(db,{id:'ap-error'});
  const github={getWorkflowRunReview:async()=>{throw new Error('GitHub 503')}};
  const outcome=await maybeAutoRemediateGreenReport({approvalRow,db,github});
  assert.equal(outcome.attempted,false);
  const approval=await getApproval(db,approvalRow.id);
  assert.equal(approval.status,'PENDING');
});
