const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {createSqliteD1}=require('./sqlite-d1.cjs');

async function stateModule(){return import(pathToFileURL(process.cwd()+'/control-center/functions/api/control/state.js'));}
async function authModule(){return import(pathToFileURL(process.cwd()+'/control-center/lib/auth.js'));}
async function approvalStore(){return import(pathToFileURL(process.cwd()+'/control-center/lib/approval-store.js'));}
async function auditLib(){return import(pathToFileURL(process.cwd()+'/control-center/lib/audit.js'));}

const RUN_ID=800100;

// The exact production incident: internal-link-builder run 35871693125 and
// competitor-monitor run 35871682269 were both correctly ingested as
// auto-archived-no-action (a real audit_events row exists for each), yet
// both reappeared in the live Needs Approval dashboard. Root cause: this
// same dashboard-load reconciliation loop re-read each run's own job log
// fresh on every request and re-derived a classification using its own
// separate, less-capable inline check that never even consulted the
// existing audit record -- so a real read-only-monitor payload with no
// explicit healthy/status field (competitor_monitor.py, internal_link_
// builder.py) was misclassified as actionable on every single reload,
// recreating the approval it had just correctly archived.
//
// This mocks a run whose review payload, if freshly re-derived, is a
// generic legacy shape with no findings signal at all -- deliberately
// NOT one isNoActionReview would even classify as no-action on its own --
// to prove the fix is the audit-record short-circuit itself, not merely
// that isNoActionReview got smarter.
function mockFetchWithReview({reviewResult}){
  return async(url)=>{
    const u=String(url);
    if(u.includes('/actions/workflows/internal-link-builder.yml/runs')){
      return new Response(JSON.stringify({workflow_runs:[{id:RUN_ID,status:'completed',conclusion:'success',created_at:'2026-09-23T05:00:00Z',html_url:'https://example.invalid/run'}]}),{status:200,headers:{'content-type':'application/json'}});
    }
    if(u===`https://api.github.com/repos/savostyanovlaw/thousandoaksinjury-automation/actions/runs/${RUN_ID}`){
      return new Response(JSON.stringify({id:RUN_ID,name:'Internal Link Builder',status:'completed',conclusion:'success',created_at:'2026-09-23T05:00:00Z',updated_at:'2026-09-23T05:05:00Z',html_url:'https://example.invalid/run',head_sha:'abc',event:'schedule'}),{status:200,headers:{'content-type':'application/json'}});
    }
    if(u.includes(`/actions/runs/${RUN_ID}/artifacts`)) return new Response(JSON.stringify({artifacts:[]}),{status:200,headers:{'content-type':'application/json'}});
    if(u.includes(`/actions/runs/${RUN_ID}/jobs`)) return new Response(JSON.stringify({jobs:[{id:1}]}),{status:200,headers:{'content-type':'application/json'}});
    if(u.includes('/actions/jobs/1/logs')){
      const encoded=Buffer.from(JSON.stringify(reviewResult),'utf-8').toString('base64');
      return new Response(`2026-09-23T05:04:00Z SLC_REVIEW_JSON_B64=${encoded}\n`,{status:200,headers:{'content-type':'text/plain'}});
    }
    if(u.includes('/actions/workflows/')) return new Response(JSON.stringify({workflow_runs:[]}),{status:200,headers:{'content-type':'application/json'}});
    if(u.includes('/issues')) return new Response('[]',{status:200,headers:{'content-type':'application/json'}});
    if(u.includes('/pulls')) return new Response('[]',{status:200,headers:{'content-type':'application/json'}});
    return new Response('{}',{status:200,headers:{'content-type':'application/json'}});
  };
}

async function loadDashboardWithPriorAudit({reviewResult,priorAuditResult}){
  const {onRequestGet}=await stateModule();
  const {createSessionToken}=await authModule();
  const {ensureControlSchema}=await approvalStore();
  const {writeAudit}=await auditLib();
  const db=createSqliteD1();
  await ensureControlSchema(db);
  if(priorAuditResult){
    await writeAudit(db,{timestamp:'2026-09-23T05:04:30Z',actor:'github-actions:internal-link-builder',agentId:'internal-link-builder',action:'REVIEW_RESULT',targetType:'workflow_run',targetId:String(RUN_ID),targetRevision:String(RUN_ID),autonomy:'GREEN',result:priorAuditResult});
  }
  const env={AUTHORIZED_EMAIL:'savostyanovlaw@gmail.com',CONTROL_AUTH_PASSWORD:'example-password-long-enough-2026',CONTROL_DB:db,GITHUB_TOKEN:'ghp_test'};
  const token=await createSessionToken(env,'savostyanovlaw@gmail.com');
  const originalFetch=global.fetch;
  global.fetch=mockFetchWithReview({reviewResult});
  try{
    const request=()=>new Request('https://slc-ai-control.pages.dev/api/control/state',{headers:{cookie:`slc_session=${token}`}});
    const first=await onRequestGet({request:request(),env,data:{}});
    const second=await onRequestGet({request:request(),env,data:{}});
    return {db,first,second};
  }finally{
    global.fetch=originalFetch;
  }
}

// Test A / C: a run already authoritatively classified as auto-archived-
// no-action must never have dashboard reconciliation recreate a PENDING
// approval for it, regardless of what a fresh re-read of its own job log
// would independently conclude.
test('dashboard reconciliation: a run already marked auto-archived-no-action by an authoritative audit record is never re-derived into a PENDING approval',async()=>{
  const {db,first,second}=await loadDashboardWithPriorAudit({
    reviewResult:{mode:'MONITOR_ONLY',publishAllowed:false,findings:[]},
    priorAuditResult:'auto-archived-no-action',
  });
  assert.equal(first.status,200);
  const firstBody=await first.json();
  assert.equal(firstBody.approvals.find(a=>String(a.targetId)===String(RUN_ID)),undefined);
  const secondBody=await second.json();
  assert.equal(secondBody.approvals.find(a=>String(a.targetId)===String(RUN_ID)),undefined);
  const {listPendingApprovals}=await approvalStore();
  assert.deepEqual(await listPendingApprovals(db),[]);
});

// Test C, from the other direction: a run authoritatively ingested (result
// 'ingested', not just no-action) must not have the fallback path recreate
// a SECOND approval for it even once the original approval is no longer
// PENDING (e.g. already decided by the owner) -- the audit record alone,
// not merely the current existence of a PENDING row, is what must suppress
// re-derivation.
test('dashboard reconciliation: a run already ingested (and since decided) is never re-derived into a fresh duplicate approval',async()=>{
  const {db}=await loadDashboardWithPriorAudit({
    reviewResult:{mode:'PROPOSAL_ONLY',publishAllowed:false,findingCount:3}, // would be actionable if re-derived
    priorAuditResult:'ingested',
  });
  const {listPendingApprovals}=await approvalStore();
  assert.deepEqual(await listPendingApprovals(db),[],'the audit record alone must suppress fallback re-derivation, independent of any current PENDING row');
});

// Test D: a genuine read-only monitor snapshot with zero findings and no
// audit record yet (first-ever ingest miss) is still correctly archived on
// first fallback discovery -- using the SAME classifier as the
// authoritative path, not a separate, narrower one.
test('dashboard reconciliation: a first-time-seen read-only monitor snapshot with zero findings is archived, never made PENDING',async()=>{
  const {db,first}=await loadDashboardWithPriorAudit({reviewResult:{mode:'MONITOR_ONLY',publishAllowed:false,findings:[]}});
  const body=await first.json();
  assert.equal(body.approvals.find(a=>String(a.targetId)===String(RUN_ID)),undefined);
  const {listPendingApprovals}=await approvalStore();
  assert.deepEqual(await listPendingApprovals(db),[]);
});

// Test E: a genuinely actionable finding, freshly discovered via fallback
// (no prior audit at all), still correctly reaches Needs Approval.
test('dashboard reconciliation: a genuinely actionable finding freshly discovered via fallback still reaches Needs Approval',async()=>{
  const {db,first}=await loadDashboardWithPriorAudit({reviewResult:{mode:'PROPOSAL_ONLY',publishAllowed:false,findingCount:2,proposals:[{field:'title'},{field:'meta'}]}});
  const body=await first.json();
  assert.ok(body.approvals.find(a=>String(a.targetId)===String(RUN_ID)),'a real finding must still create a normal owner-reviewed approval');
  const {listPendingApprovals}=await approvalStore();
  assert.equal((await listPendingApprovals(db)).length,1);
});

// Test F: a zero-finding but genuine content artifact (e.g. a script/draft)
// must remain PENDING even with no prior audit record.
test('dashboard reconciliation: a zero-finding report carrying a real reviewable artifact stays PENDING',async()=>{
  const {db,first}=await loadDashboardWithPriorAudit({reviewResult:{mode:'DRAFT_ONLY',requiresAttorneyReview:true,draft:'# A real draft body'}});
  const body=await first.json();
  assert.ok(body.approvals.find(a=>String(a.targetId)===String(RUN_ID)),'a real content artifact must never be auto-archived merely for having no findings array');
  const {listPendingApprovals}=await approvalStore();
  assert.equal((await listPendingApprovals(db)).length,1);
});
