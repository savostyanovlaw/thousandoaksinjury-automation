const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {createSqliteD1}=require('./sqlite-d1.cjs');

async function queueCleanup(){return import(pathToFileURL(process.cwd()+'/control-center/lib/queue-cleanup.js'));}
async function approvalStore(){return import(pathToFileURL(process.cwd()+'/control-center/lib/approval-store.js'));}
async function auditLib(){return import(pathToFileURL(process.cwd()+'/control-center/lib/audit.js'));}

const AGENTS=[{id:'competitor-monitor'},{id:'internal-link-builder'},{id:'ctr-optimizer'},{id:'content-creator'}];

async function seedApproval(db,{id,agentId,action='REVIEW_RESULT',targetType='workflow_run',targetId,createdAt}){
  const {insertApproval}=await approvalStore();
  await insertApproval(db,{id,agentId,action,targetType,targetId,targetRevision:targetId,payloadHash:`hash-${id}`,createdAt});
}

// -- Pure classifier -------------------------------------------------------

test('classifyPendingApproval: unknown agent is INVALID_LEGACY_APPROVAL',async()=>{
  const {classifyPendingApproval,CLASSIFICATIONS}=await queueCleanup();
  const c=classifyPendingApproval({approval:{action:'REVIEW_RESULT',targetType:'workflow_run'},agentKnown:false});
  assert.equal(c,CLASSIFICATIONS.INVALID_LEGACY);
});

test('classifyPendingApproval: a run already carrying an authoritative auto-archived-no-action audit is AUTO_ARCHIVE_NO_ACTION',async()=>{
  const {classifyPendingApproval,CLASSIFICATIONS}=await queueCleanup();
  const c=classifyPendingApproval({approval:{action:'REVIEW_RESULT',targetType:'workflow_run'},agentKnown:true,alreadyAutoArchived:true});
  assert.equal(c,CLASSIFICATIONS.AUTO_ARCHIVE);
});

test('classifyPendingApproval: a duplicate of an earlier approval for the same exact target is STALE_DUPLICATE',async()=>{
  const {classifyPendingApproval,CLASSIFICATIONS}=await queueCleanup();
  const c=classifyPendingApproval({approval:{action:'REVIEW_RESULT',targetType:'workflow_run'},agentKnown:true,isDuplicate:true});
  assert.equal(c,CLASSIFICATIONS.STALE_DUPLICATE);
});

test('classifyPendingApproval: a real read-only-monitor payload with zero findings and no reviewable artifact is AUTO_ARCHIVE_NO_ACTION',async()=>{
  const {classifyPendingApproval,CLASSIFICATIONS}=await queueCleanup();
  // The exact real competitor_monitor.py shape: no explicit status/healthy field.
  const c=classifyPendingApproval({approval:{action:'REVIEW_RESULT',targetType:'workflow_run'},agentKnown:true,reviewResult:{mode:'MONITOR_ONLY',publishAllowed:false,findings:[]}});
  assert.equal(c,CLASSIFICATIONS.AUTO_ARCHIVE);
});

test('classifyPendingApproval: real findings/proposals stay GENUINE_OWNER_DECISION',async()=>{
  const {classifyPendingApproval,CLASSIFICATIONS}=await queueCleanup();
  const c=classifyPendingApproval({approval:{action:'REVIEW_RESULT',targetType:'workflow_run'},agentKnown:true,reviewResult:{mode:'PROPOSAL_ONLY',publishAllowed:false,findingCount:5}});
  assert.equal(c,CLASSIFICATIONS.GENUINE);
});

test('classifyPendingApproval: an e2e_fixture_marker finding is TEST_FIXTURE',async()=>{
  const {classifyPendingApproval,CLASSIFICATIONS}=await queueCleanup();
  const c=classifyPendingApproval({approval:{action:'REVIEW_RESULT',targetType:'workflow_run'},agentKnown:true,reviewResult:{findings:[{findingType:'e2e_fixture_marker'}]}});
  assert.equal(c,CLASSIFICATIONS.TEST_FIXTURE);
});

test('classifyPendingApproval: a blocked video_job is BLOCKED_CONFIGURATION_REQUIRING_OWNER_ACTION, not transitioned away',async()=>{
  const {classifyPendingApproval,CLASSIFICATIONS}=await queueCleanup();
  const c=classifyPendingApproval({approval:{action:'PUBLISH_VIDEO',targetType:'video_job'},agentKnown:true,videoJobStatus:'BLOCKED_HEYGEN_CONFIGURATION'});
  assert.equal(c,CLASSIFICATIONS.BLOCKED_CONFIG);
});

test('classifyPendingApproval: a real content artifact review with no reviewResult fetched yet stays GENUINE (never guessed)',async()=>{
  const {classifyPendingApproval,CLASSIFICATIONS}=await queueCleanup();
  const c=classifyPendingApproval({approval:{action:'REVIEW_RESULT',targetType:'workflow_run'},agentKnown:true,reviewResult:undefined});
  assert.equal(c,CLASSIFICATIONS.GENUINE);
});

test('classifyPendingApproval: a non-REVIEW_RESULT/workflow_run approval (e.g. MERGE_PR) is always GENUINE',async()=>{
  const {classifyPendingApproval,CLASSIFICATIONS}=await queueCleanup();
  const c=classifyPendingApproval({approval:{action:'MERGE_PR',targetType:'pull_request'},agentKnown:true});
  assert.equal(c,CLASSIFICATIONS.GENUINE);
});

// -- cleanupApprovalQueue orchestration ------------------------------------

function fakeGithub(reviewByRunId){
  return {async getWorkflowRunReview(runId){ return {reviewResult:reviewByRunId[String(runId)]}; }};
}

// Test G: an existing stale PENDING approval whose run already has an
// authoritative auto-archived-no-action audit record is transitioned out.
test('cleanupApprovalQueue: a stale PENDING approval contradicted by an authoritative no-action audit is transitioned out of Needs Approval',async()=>{
  const db=createSqliteD1();
  const {ensureControlSchema,listPendingApprovals}=await approvalStore();
  const {writeAudit}=await auditLib();
  const {cleanupApprovalQueue,CLASSIFICATIONS}=await queueCleanup();
  await ensureControlSchema(db);
  await seedApproval(db,{id:'ap-1',agentId:'competitor-monitor',targetId:'900001',createdAt:'2026-09-23T00:00:00Z'});
  await writeAudit(db,{timestamp:'2026-09-23T00:00:01Z',actor:'github-actions:competitor-monitor',agentId:'competitor-monitor',action:'REVIEW_RESULT',targetType:'workflow_run',targetId:'900001',targetRevision:'900001',autonomy:'GREEN',result:'auto-archived-no-action'});
  const result=await cleanupApprovalQueue({db,github:fakeGithub({}),agents:AGENTS,listPendingApprovals,getVideoJobStatus:async()=>undefined});
  assert.equal(result.summary[CLASSIFICATIONS.AUTO_ARCHIVE],1);
  assert.deepEqual(await listPendingApprovals(db),[]);
});

// Test H: cleanup rerun is idempotent.
test('cleanupApprovalQueue: running it twice does not change already-clean state',async()=>{
  const db=createSqliteD1();
  const {ensureControlSchema,listPendingApprovals}=await approvalStore();
  const {writeAudit,listAuditEvents}=await auditLib();
  const {cleanupApprovalQueue}=await queueCleanup();
  await ensureControlSchema(db);
  await seedApproval(db,{id:'ap-2',agentId:'competitor-monitor',targetId:'900002',createdAt:'2026-09-23T00:00:00Z'});
  await writeAudit(db,{timestamp:'2026-09-23T00:00:01Z',actor:'github-actions:competitor-monitor',agentId:'competitor-monitor',action:'REVIEW_RESULT',targetType:'workflow_run',targetId:'900002',targetRevision:'900002',autonomy:'GREEN',result:'auto-archived-no-action'});
  const first=await cleanupApprovalQueue({db,github:fakeGithub({}),agents:AGENTS,listPendingApprovals,getVideoJobStatus:async()=>undefined});
  assert.equal(first.results[0].transitioned,true);
  const second=await cleanupApprovalQueue({db,github:fakeGithub({}),agents:AGENTS,listPendingApprovals,getVideoJobStatus:async()=>undefined});
  assert.equal(second.total,0,'nothing left in PENDING for the second run to even consider');
  const cleanupEvents=(await listAuditEvents(db,100)).filter(e=>e.result.startsWith('cleanup-'));
  assert.equal(cleanupEvents.length,1,'exactly one cleanup audit row, ever, for this run');
});

// Test K: duplicate approvals for the same logical run/revision collapse to
// one canonical actionable approval.
test('cleanupApprovalQueue: a duplicate approval for the exact same target keeps only the earliest as canonical',async()=>{
  const db=createSqliteD1();
  const {ensureControlSchema,listPendingApprovals,getApproval}=await approvalStore();
  const {cleanupApprovalQueue,CLASSIFICATIONS}=await queueCleanup();
  await ensureControlSchema(db);
  // Two rows for the exact same (agent, targetType, targetId) -- structurally
  // prevented by ensureRunReviewApproval's own guard in real ingest, but a
  // defensive check against a schema-migration-era anomaly.
  await seedApproval(db,{id:'ap-old',agentId:'ctr-optimizer',targetId:'900003',createdAt:'2026-09-23T00:00:00Z'});
  await seedApproval(db,{id:'ap-new',agentId:'ctr-optimizer',targetId:'900003',createdAt:'2026-09-23T00:05:00Z'});
  const result=await cleanupApprovalQueue({db,github:fakeGithub({}),agents:AGENTS,listPendingApprovals,getVideoJobStatus:async()=>undefined});
  const byId=Object.fromEntries(result.results.map(r=>[r.approvalId,r]));
  assert.equal(byId['ap-old'].classification,CLASSIFICATIONS.GENUINE);
  assert.equal(byId['ap-new'].classification,CLASSIFICATIONS.STALE_DUPLICATE);
  assert.equal((await getApproval(db,'ap-old')).status,'PENDING');
  assert.equal((await getApproval(db,'ap-new')).status,'REJECTED');
});

// Test L: a test/E2E fixture approval is transitioned out, never visible in
// production Needs Approval.
test('cleanupApprovalQueue: an E2E fixture approval is classified TEST_FIXTURE and transitioned out',async()=>{
  const db=createSqliteD1();
  const {ensureControlSchema,listPendingApprovals}=await approvalStore();
  const {cleanupApprovalQueue,CLASSIFICATIONS}=await queueCleanup();
  await ensureControlSchema(db);
  await seedApproval(db,{id:'ap-fixture',agentId:'internal-link-builder',targetId:'900004',createdAt:'2026-09-23T00:00:00Z'});
  const result=await cleanupApprovalQueue({db,github:fakeGithub({'900004':{findings:[{findingType:'e2e_fixture_marker'}]}}),agents:AGENTS,listPendingApprovals,getVideoJobStatus:async()=>undefined});
  assert.equal(result.summary[CLASSIFICATIONS.TEST_FIXTURE],1);
  assert.deepEqual(await listPendingApprovals(db),[]);
});

// A genuine, real content artifact/finding must survive cleanup untouched.
test('cleanupApprovalQueue: a genuine actionable finding is left PENDING and untouched',async()=>{
  const db=createSqliteD1();
  const {ensureControlSchema,listPendingApprovals}=await approvalStore();
  const {cleanupApprovalQueue,CLASSIFICATIONS}=await queueCleanup();
  await ensureControlSchema(db);
  await seedApproval(db,{id:'ap-genuine',agentId:'ctr-optimizer',targetId:'900005',createdAt:'2026-09-23T00:00:00Z'});
  const result=await cleanupApprovalQueue({db,github:fakeGithub({'900005':{mode:'PROPOSAL_ONLY',publishAllowed:false,findingCount:3}}),agents:AGENTS,listPendingApprovals,getVideoJobStatus:async()=>undefined});
  assert.equal(result.summary[CLASSIFICATIONS.GENUINE],1);
  const pending=await listPendingApprovals(db);
  assert.equal(pending.length,1);
  assert.equal(pending[0].id,'ap-genuine');
});

// Regression: a live production maintenance run classified content-refresher
// run 35827038792 as GENUINE_OWNER_DECISION twice in a row despite its real,
// independently-fetched job log carrying approvalState:"NOT_REQUIRED" -- a
// case isNoActionReview() already handles correctly in isolation. Diagnosing
// this from production alone (no exception, no log output) was impossible,
// so each result row now records whether a live review fetch was attempted
// and what it found: 'found' (a reviewResult came back, whatever it says),
// 'no-marker-found' (the fetch succeeded but no SLC_REVIEW_JSON_B64 marker
// was ever found in any of the run's job logs), or 'error:<message>' (the
// fetch itself threw). This never changes classification -- it is purely
// visibility into which of those three cases produced a given GENUINE.
test('cleanupApprovalQueue: a result row records whether a live review fetch was attempted and what it found',async()=>{
  const db=createSqliteD1();
  const {ensureControlSchema,listPendingApprovals}=await approvalStore();
  const {cleanupApprovalQueue}=await queueCleanup();
  await ensureControlSchema(db);
  await seedApproval(db,{id:'ap-found',agentId:'ctr-optimizer',targetId:'900100',createdAt:'2026-09-23T00:00:00Z'});
  await seedApproval(db,{id:'ap-no-marker',agentId:'ctr-optimizer',targetId:'900101',createdAt:'2026-09-23T00:00:00Z'});
  await seedApproval(db,{id:'ap-error',agentId:'ctr-optimizer',targetId:'900102',createdAt:'2026-09-23T00:00:00Z'});
  const github={async getWorkflowRunReview(runId){
    if(String(runId)==='900100') return {reviewResult:{findingCount:2}};
    if(String(runId)==='900101') return {reviewResult:null};
    throw new Error('GitHub 502');
  }};
  const result=await cleanupApprovalQueue({db,github,agents:AGENTS,listPendingApprovals,getVideoJobStatus:async()=>undefined});
  const byId=Object.fromEntries(result.results.map(r=>[r.approvalId,r]));
  assert.equal(byId['ap-found'].fetchDiagnostic,'found');
  assert.equal(byId['ap-no-marker'].fetchDiagnostic,'no-marker-found');
  assert.equal(byId['ap-error'].fetchDiagnostic,'error:GitHub 502');
  assert.equal((await listPendingApprovals(db)).length,3,'a diagnostic field never changes any classification outcome');
});

// Regression: the real root cause of the production incident above wasn't
// the classification logic at all -- it was Cloudflare Workers' hard cap on
// outbound subrequests per invocation. This loop processes every PENDING
// approval in ONE invocation; getWorkflowRunReview's real-time-ingest
// defaults (4 retry attempts, plus an artifacts fetch this classifier never
// uses) multiply the subrequest cost per approval several times over, so a
// queue of just a few dozen items exhausted the budget partway through and
// every approval after that point got "Too many subrequests by single
// Worker invocation" from getWorkflowRunReview, caught by the per-approval
// try/catch, and silently fell back to GENUINE_OWNER_DECISION -- with a 200
// response and no visible error anywhere. This locks in that the batch path
// always asks for the cheap variant.
test('cleanupApprovalQueue: calls getWorkflowRunReview with maxAttempts:1 and fetchArtifacts:false to conserve the batch invocation\'s subrequest budget',async()=>{
  const db=createSqliteD1();
  const {ensureControlSchema,listPendingApprovals}=await approvalStore();
  const {cleanupApprovalQueue}=await queueCleanup();
  await ensureControlSchema(db);
  await seedApproval(db,{id:'ap-budget',agentId:'ctr-optimizer',targetId:'900200',createdAt:'2026-09-23T00:00:00Z'});
  const calls=[];
  const github={async getWorkflowRunReview(runId,options){ calls.push({runId,options}); return {reviewResult:{findingCount:1}}; }};
  await cleanupApprovalQueue({db,github,agents:AGENTS,listPendingApprovals,getVideoJobStatus:async()=>undefined});
  assert.equal(calls.length,1);
  assert.equal(String(calls[0].runId),'900200');
  assert.deepEqual(calls[0].options,{maxAttempts:1,fetchArtifacts:false});
});

// An unknown/legacy agent's approval is cleaned up too.
test('cleanupApprovalQueue: an approval for an agent no longer in the registry is INVALID_LEGACY_APPROVAL and transitioned out',async()=>{
  const db=createSqliteD1();
  const {ensureControlSchema,listPendingApprovals}=await approvalStore();
  const {cleanupApprovalQueue,CLASSIFICATIONS}=await queueCleanup();
  await ensureControlSchema(db);
  await seedApproval(db,{id:'ap-legacy',agentId:'retired-agent',targetId:'900006',createdAt:'2026-09-23T00:00:00Z'});
  const result=await cleanupApprovalQueue({db,github:fakeGithub({}),agents:AGENTS,listPendingApprovals,getVideoJobStatus:async()=>undefined});
  assert.equal(result.summary[CLASSIFICATIONS.INVALID_LEGACY],1);
  assert.deepEqual(await listPendingApprovals(db),[]);
});

// Content Creator's real draft must never be swept up by cleanup.
test('cleanupApprovalQueue: a genuine Content Creator draft is never touched',async()=>{
  const db=createSqliteD1();
  const {ensureControlSchema,listPendingApprovals}=await approvalStore();
  const {cleanupApprovalQueue,CLASSIFICATIONS}=await queueCleanup();
  await ensureControlSchema(db);
  await seedApproval(db,{id:'ap-draft',agentId:'content-creator',targetId:'900007',createdAt:'2026-09-23T00:00:00Z'});
  const result=await cleanupApprovalQueue({db,github:fakeGithub({'900007':{mode:'DRAFT_ONLY',requiresAttorneyReview:true,draft:'# Real draft body'}}),agents:AGENTS,listPendingApprovals,getVideoJobStatus:async()=>undefined});
  assert.equal(result.summary[CLASSIFICATIONS.GENUINE],1);
  assert.equal((await listPendingApprovals(db)).length,1);
});

// fetchReviewResults:false (the cheap, always-on dashboard-load pass) must
// still catch the audit-contradiction and duplicate/legacy cases without
// ever calling GitHub.
test('cleanupApprovalQueue: the cheap pass (fetchReviewResults:false) never calls GitHub, but still catches an audited contradiction',async()=>{
  const db=createSqliteD1();
  const {ensureControlSchema,listPendingApprovals}=await approvalStore();
  const {writeAudit}=await auditLib();
  const {cleanupApprovalQueue,CLASSIFICATIONS}=await queueCleanup();
  await ensureControlSchema(db);
  await seedApproval(db,{id:'ap-cheap',agentId:'internal-link-builder',targetId:'900008',createdAt:'2026-09-23T00:00:00Z'});
  await writeAudit(db,{timestamp:'2026-09-23T00:00:01Z',actor:'github-actions:internal-link-builder',agentId:'internal-link-builder',action:'REVIEW_RESULT',targetType:'workflow_run',targetId:'900008',targetRevision:'900008',autonomy:'GREEN',result:'auto-archived-no-action'});
  let githubCalled=false;
  const github={async getWorkflowRunReview(){ githubCalled=true; return {reviewResult:{}}; }};
  const result=await cleanupApprovalQueue({db,github,agents:AGENTS,fetchReviewResults:false,listPendingApprovals,getVideoJobStatus:async()=>undefined});
  assert.equal(githubCalled,false,'the cheap pass must never re-fetch a run\'s review data');
  assert.equal(result.summary[CLASSIFICATIONS.AUTO_ARCHIVE],1);
  assert.deepEqual(await listPendingApprovals(db),[]);
});

test('cleanupApprovalQueue: the cheap pass leaves a genuine, not-yet-classified approval PENDING (never guesses without GitHub data)',async()=>{
  const db=createSqliteD1();
  const {ensureControlSchema,listPendingApprovals}=await approvalStore();
  const {cleanupApprovalQueue,CLASSIFICATIONS}=await queueCleanup();
  await ensureControlSchema(db);
  await seedApproval(db,{id:'ap-cheap-genuine',agentId:'ctr-optimizer',targetId:'900009',createdAt:'2026-09-23T00:00:00Z'});
  const result=await cleanupApprovalQueue({db,github:fakeGithub({}),agents:AGENTS,fetchReviewResults:false,listPendingApprovals,getVideoJobStatus:async()=>undefined});
  assert.equal(result.summary[CLASSIFICATIONS.GENUINE],1);
  assert.equal((await listPendingApprovals(db)).length,1);
});
