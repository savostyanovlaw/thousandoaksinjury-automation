const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {createSqliteD1}=require('./sqlite-d1.cjs');

async function autonomy(){return import(pathToFileURL(process.cwd()+'/control-center/lib/autonomy.js'));}
async function ingestModule(){return import(pathToFileURL(process.cwd()+'/control-center/functions/api/control/ingest/review-result.js'));}
async function stateModule(){return import(pathToFileURL(process.cwd()+'/control-center/functions/api/control/state.js'));}
async function authModule(){return import(pathToFileURL(process.cwd()+'/control-center/lib/auth.js'));}
async function approvalStore(){return import(pathToFileURL(process.cwd()+'/control-center/lib/approval-store.js'));}
async function auditLib(){return import(pathToFileURL(process.cwd()+'/control-center/lib/audit.js'));}
async function fixtures(){return import(pathToFileURL(process.cwd()+'/control-center/lib/github-oidc.testkit.js'));}

// -- isNoActionReview: the pure classifier both paths share --------------

test('isNoActionReview: a HEALTHY zero-finding health-check report is no-action',async()=>{
  const {isNoActionReview}=await autonomy();
  assert.equal(isNoActionReview({healthy:true,findingCount:0}),true);
  assert.equal(isNoActionReview({status:'HEALTHY',findingCount:0}),true);
});

test('isNoActionReview: an approvalState:NOT_REQUIRED report is no-action regardless of its status field',async()=>{
  const {isNoActionReview}=await autonomy();
  // content_refresher.py's NEEDS_RESEARCH/AUTO_ARCHIVE branch: not "HEALTHY",
  // but explicitly declares no review is needed via approvalState.
  assert.equal(isNoActionReview({status:'NEEDS_RESEARCH',findingCount:0,approvalState:'NOT_REQUIRED'}),true);
  assert.equal(isNoActionReview({status:'NEEDS_LOCALIZATION',approvalState:'NOT_REQUIRED'}),true);
});

test('isNoActionReview: a content artifact requiring review is never auto-archived merely for having zero findings',async()=>{
  const {isNoActionReview}=await autonomy();
  // Video Engine always sets approvalState:'PENDING', even with no findings array at all.
  assert.equal(isNoActionReview({approvalState:'PENDING',topic:'dog bites'}),false);
  // Russian robot's actionable (READY_FOR_REVIEW) case: approvalState:'PENDING'.
  assert.equal(isNoActionReview({status:'READY_FOR_REVIEW',approvalState:'PENDING'}),false);
  // Content Refresher's actionable case has real findings, but even a
  // hypothetical zero-finding PENDING case must never auto-archive.
  assert.equal(isNoActionReview({status:'REVIEW',approvalState:'PENDING',findingCount:0}),false);
});

test('isNoActionReview: an explicit requiresAttorneyReview:true blocks auto-archive even when healthy',async()=>{
  const {isNoActionReview}=await autonomy();
  assert.equal(isNoActionReview({status:'HEALTHY',findingCount:0,requiresAttorneyReview:true}),false);
});

test('isNoActionReview: an actionable finding still requires review',async()=>{
  const {isNoActionReview}=await autonomy();
  assert.equal(isNoActionReview({healthy:false,findingCount:1,findings:[{findingType:'robots-sitemap'}]}),false);
  assert.equal(isNoActionReview({status:'OPPORTUNITIES FOUND',findingCount:3}),false);
});

test('isNoActionReview: a legacy body/report with none of these fields is never auto-archived',async()=>{
  const {isNoActionReview}=await autonomy();
  assert.equal(isNoActionReview({}),false);
  assert.equal(isNoActionReview(null),false);
  assert.equal(isNoActionReview(undefined),false);
});

// -- Push ingestion (control-center/functions/api/control/ingest/review-result.js) --

const agents=[{id:'technical-seo-watchdog',deployed:true,commands:[{name:'RUN_NOW',autonomy:'GREEN'}]}];

// github-oidc.js caches its remote JWKS resolver at module scope (a real
// GitHub-issuer optimization, cooldown-limited against refetching for an
// unrecognized kid). Every postIngest call in this file must therefore
// reuse the SAME signing key/kid -- generating a fresh one per call would
// hit that cooldown after the first request and spuriously 401.
let sharedJwksFixture=null;
async function jwksFixture(){
  if(!sharedJwksFixture){
    const {buildRemoteJwksDocument}=await fixtures();
    sharedJwksFixture=await buildRemoteJwksDocument();
  }
  return sharedJwksFixture;
}

async function postIngest({body,db}){
  const {onRequestPost}=await ingestModule();
  const {signTestToken}=await fixtures();
  const {privateKey,kid,document}=await jwksFixture();
  const originalFetch=global.fetch;
  global.fetch=async(url)=>{
    if(String(url).includes('token.actions.githubusercontent.com')) return new Response(JSON.stringify(document),{status:200,headers:{'content-type':'application/json'}});
    throw new Error(`unexpected fetch: ${url}`);
  };
  try{
    const token=await signTestToken(privateKey,kid,{claims:{run_id:String(body.runId),workflow:'Technical SEO Watchdog'}});
    const request=new Request('https://slc-ai-control.pages.dev/api/control/ingest/review-result',{method:'POST',headers:{authorization:`Bearer ${token}`},body:JSON.stringify(body)});
    return await onRequestPost({request,env:{CONTROL_DB:db}});
  }finally{
    global.fetch=originalFetch;
  }
}

test('push ingestion: a HEALTHY zero-finding result is auto-archived, never creates a PENDING approval',async()=>{
  const db=createSqliteD1();
  const {listPendingApprovals}=await approvalStore();
  const {listAuditEvents}=await auditLib();
  const response=await postIngest({db,body:{agentId:'technical-seo-watchdog',runId:'70001',healthy:true,findingCount:0}});
  assert.equal(response.status,201);
  const responseBody=await response.json();
  assert.equal(responseBody.ok,true);
  assert.equal(responseBody.created,false);
  assert.equal(responseBody.autoArchived,true);
  assert.deepEqual(await listPendingApprovals(db),[]);
  const events=await listAuditEvents(db);
  assert.equal(events.length,1);
  assert.equal(events[0].result,'auto-archived-no-action');
  assert.equal(events[0].targetId,'70001');
});

test('push ingestion: a genuinely actionable finding still enters the normal approval path',async()=>{
  const db=createSqliteD1();
  const {listPendingApprovals}=await approvalStore();
  const response=await postIngest({db,body:{agentId:'technical-seo-watchdog',runId:'70002',healthy:false,findingCount:1}});
  assert.equal(response.status,201);
  const responseBody=await response.json();
  assert.equal(responseBody.created,true);
  const pending=await listPendingApprovals(db);
  assert.equal(pending.length,1);
  assert.equal(pending[0].targetId,'70002');
});

test('push ingestion: a legacy call with no review-summary fields behaves exactly as before (never auto-archived)',async()=>{
  const db=createSqliteD1();
  const {listPendingApprovals}=await approvalStore();
  const response=await postIngest({db,body:{agentId:'technical-seo-watchdog',runId:'70003'}});
  assert.equal(response.status,201);
  const responseBody=await response.json();
  assert.equal(responseBody.created,true);
  assert.equal((await listPendingApprovals(db)).length,1);
});

test('push ingestion: a content artifact declaring approvalState:PENDING with zero findings is never auto-archived',async()=>{
  const db=createSqliteD1();
  const {listPendingApprovals}=await approvalStore();
  const response=await postIngest({db,body:{agentId:'technical-seo-watchdog',runId:'70004',approvalState:'PENDING',findingCount:0}});
  assert.equal(response.status,201);
  const responseBody=await response.json();
  assert.equal(responseBody.created,true);
  assert.equal((await listPendingApprovals(db)).length,1);
});

test('push ingestion: repeated ingestion of the same auto-archived run is idempotent (one audit row, ever)',async()=>{
  const db=createSqliteD1();
  const {listAuditEvents}=await auditLib();
  await postIngest({db,body:{agentId:'technical-seo-watchdog',runId:'70005',healthy:true,findingCount:0}});
  const second=await postIngest({db,body:{agentId:'technical-seo-watchdog',runId:'70005',healthy:true,findingCount:0}});
  assert.equal(second.status,201);
  const secondBody=await second.json();
  assert.equal(secondBody.autoArchived,true);
  const events=(await listAuditEvents(db)).filter(e=>e.targetId==='70005');
  assert.equal(events.length,1,'a duplicate ingest call for an already-archived run must never write a second audit row');
});

// -- Dashboard/state reconciliation (control-center/functions/api/control/state.js) --

const SUCCESSFUL_RUN_ID=70100;

function mockDashboardFetch({reviewResult}){
  return async(url)=>{
    const u=String(url);
    if(u.includes('/actions/workflows/technical-seo-watchdog.yml/runs')){
      return new Response(JSON.stringify({workflow_runs:[{
        id:SUCCESSFUL_RUN_ID,status:'completed',conclusion:'success',
        created_at:'2026-09-21T05:00:00Z',html_url:'https://example.invalid/run'
      }]}),{status:200,headers:{'content-type':'application/json'}});
    }
    if(u===`https://api.github.com/repos/savostyanovlaw/thousandoaksinjury-automation/actions/runs/${SUCCESSFUL_RUN_ID}`){
      return new Response(JSON.stringify({id:SUCCESSFUL_RUN_ID,name:'Technical SEO Watchdog',status:'completed',conclusion:'success',created_at:'2026-09-21T05:00:00Z',updated_at:'2026-09-21T05:05:00Z',html_url:'https://example.invalid/run',head_sha:'abc',event:'schedule'}),{status:200,headers:{'content-type':'application/json'}});
    }
    if(u.includes(`/actions/runs/${SUCCESSFUL_RUN_ID}/artifacts`)){
      return new Response(JSON.stringify({artifacts:[]}),{status:200,headers:{'content-type':'application/json'}});
    }
    if(u.includes(`/actions/runs/${SUCCESSFUL_RUN_ID}/jobs`)){
      return new Response(JSON.stringify({jobs:[{id:1}]}),{status:200,headers:{'content-type':'application/json'}});
    }
    if(u.includes('/actions/jobs/1/logs')){
      const encoded=Buffer.from(JSON.stringify(reviewResult),'utf-8').toString('base64');
      return new Response(`2026-09-21T05:04:00Z SLC_REVIEW_JSON_B64=${encoded}\n`,{status:200,headers:{'content-type':'text/plain'}});
    }
    if(u.includes('/actions/workflows/')) return new Response(JSON.stringify({workflow_runs:[]}),{status:200,headers:{'content-type':'application/json'}});
    if(u.includes('/issues')) return new Response('[]',{status:200,headers:{'content-type':'application/json'}});
    if(u.includes('/pulls')) return new Response('[]',{status:200,headers:{'content-type':'application/json'}});
    return new Response('{}',{status:200,headers:{'content-type':'application/json'}});
  };
}

async function loadDashboard({reviewResult}){
  const {onRequestGet}=await stateModule();
  const {createSessionToken}=await authModule();
  const db=createSqliteD1();
  const {ensureControlSchema}=await approvalStore();
  await ensureControlSchema(db);
  const env={AUTHORIZED_EMAIL:'savostyanovlaw@gmail.com',CONTROL_AUTH_PASSWORD:'example-password-long-enough-2026',CONTROL_DB:db,GITHUB_TOKEN:'ghp_test'};
  const token=await createSessionToken(env,'savostyanovlaw@gmail.com');
  const originalFetch=global.fetch;
  global.fetch=mockDashboardFetch({reviewResult});
  try{
    const request=()=>new Request('https://slc-ai-control.pages.dev/api/control/state',{headers:{cookie:`slc_session=${token}`}});
    const first=await onRequestGet({request:request(),env,data:{}});
    const second=await onRequestGet({request:request(),env,data:{}});
    return {db,first,second};
  }finally{
    global.fetch=originalFetch;
  }
}

test('dashboard reconciliation: a HEALTHY zero-finding run never reaches Needs Approval, and stays absent after a second load',async()=>{
  const {db,first,second}=await loadDashboard({reviewResult:{healthy:true,findings:[],findingCount:0}});
  assert.equal(first.status,200);
  const firstBody=await first.json();
  assert.equal(firstBody.approvals.find(a=>String(a.targetId)===String(SUCCESSFUL_RUN_ID)),undefined);
  assert.equal(second.status,200);
  const secondBody=await second.json();
  assert.equal(secondBody.approvals.find(a=>String(a.targetId)===String(SUCCESSFUL_RUN_ID)),undefined);
  const {listPendingApprovals}=await approvalStore();
  assert.deepEqual(await listPendingApprovals(db),[]);
});

test('dashboard reconciliation: the no-action result is retained/audited exactly once across repeated loads',async()=>{
  const {db}=await loadDashboard({reviewResult:{healthy:true,findings:[],findingCount:0}});
  const {listAuditEvents}=await auditLib();
  const events=(await listAuditEvents(db)).filter(e=>String(e.targetId)===String(SUCCESSFUL_RUN_ID) && e.result==='auto-archived-no-action');
  assert.equal(events.length,1,'two dashboard loads for the same still-latest no-action run must write exactly one audit row');
});

test('dashboard reconciliation: an actionable finding still enters Needs Approval',async()=>{
  // A non-GREEN finding type: this must reach the normal owner-reviewed
  // queue rather than exercising the unrelated GREEN auto-remediation path
  // (which would auto-approve it, making it disappear from Needs Approval
  // for a reason that has nothing to do with the no-action archive logic
  // under test here).
  const {db,first}=await loadDashboard({reviewResult:{healthy:false,findings:[{findingType:'canonical'}],findingCount:1}});
  const body=await first.json();
  const approval=body.approvals.find(a=>String(a.targetId)===String(SUCCESSFUL_RUN_ID));
  assert.ok(approval,'a real finding must still create a normal owner-reviewed approval');
  const {listPendingApprovals}=await approvalStore();
  assert.equal((await listPendingApprovals(db)).length,1);
});

test('dashboard reconciliation: a content artifact requiring review with zero findings is not accidentally auto-archived',async()=>{
  const {db,first}=await loadDashboard({reviewResult:{agent:'video-engine',approvalState:'PENDING',topic:'dog bites'}});
  const body=await first.json();
  const approval=body.approvals.find(a=>String(a.targetId)===String(SUCCESSFUL_RUN_ID));
  assert.ok(approval,'a reviewable artifact must never be auto-archived merely for having no findings array');
  const {listPendingApprovals}=await approvalStore();
  assert.equal((await listPendingApprovals(db)).length,1);
});
