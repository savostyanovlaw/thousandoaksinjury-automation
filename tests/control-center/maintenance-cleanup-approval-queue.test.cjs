const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {createSqliteD1}=require('./sqlite-d1.cjs');

// Regression: the maintenance endpoint verifies its own GitHub Actions OIDC
// bearer token (requireGithubActionsAuth with MAINTENANCE_AUDIENCE), but
// _middleware.js gates every /api/* route behind a browser session cookie
// FIRST, before the route handler ever runs -- exactly like the two ingest
// routes. The ingest routes have an explicit exemption in _middleware.js;
// this one shipped without one, so a real, valid, correctly-scoped OIDC
// token was rejected with a generic 401 from the cookie gate before
// requireGithubActionsAuth ever got a chance to verify it. Confirmed live in
// production: the Control Center Maintenance workflow's OIDC-authenticated
// call to /api/control/maintenance/cleanup-approval-queue failed with
// `curl: (22) ... 401` despite obtaining a real, valid OIDC token.
async function m(){return import(pathToFileURL(process.cwd()+'/control-center/functions/api/control/maintenance/cleanup-approval-queue.js'));}
async function middleware(){return import(pathToFileURL(process.cwd()+'/control-center/functions/_middleware.js'));}
async function fixtures(){return import(pathToFileURL(process.cwd()+'/control-center/lib/github-oidc.testkit.js'));}
async function approvalStore(){return import(pathToFileURL(process.cwd()+'/control-center/lib/approval-store.js'));}

const NOW=new Date().toISOString();

test('middleware exempts the maintenance cleanup-approval-queue route from browser session auth',async()=>{
  const {onRequest}=await middleware();
  const request=new Request('https://slc-ai-control.pages.dev/api/control/maintenance/cleanup-approval-queue',{method:'POST'});
  let calledNext=false;
  const response=await onRequest({request,env:{},data:{},next:async()=>{calledNext=true; return new Response('ok');}});
  assert.equal(calledNext,true,'the maintenance route must reach its own handler, not the cookie-auth gate');
  assert.equal(await response.text(),'ok');
});

test('onRequestPost fails closed without a valid GitHub OIDC bearer token',async()=>{
  const {onRequestPost}=await m();
  const request=new Request('https://slc-ai-control.pages.dev/api/control/maintenance/cleanup-approval-queue',{method:'POST',body:'{}'});
  const response=await onRequestPost({request,env:{CONTROL_DB:createSqliteD1()}});
  assert.equal(response.status,401);
});

test('onRequestPost runs the full cleanup with a real GitHub-shaped OIDC token scoped to the maintenance audience',async()=>{
  const {signTestToken,buildRemoteJwksDocument}=await fixtures();
  const {ensureControlSchema,insertApproval}=await approvalStore();
  const {privateKey,kid,document}=await buildRemoteJwksDocument();
  const originalFetch=global.fetch;
  global.fetch=async(url)=>{
    if(String(url).includes('token.actions.githubusercontent.com')) return new Response(JSON.stringify(document),{status:200,headers:{'content-type':'application/json'}});
    throw new Error(`unexpected fetch: ${url}`);
  };
  try{
    const {onRequestPost}=await m();
    const db=createSqliteD1();
    await ensureControlSchema(db);
    await insertApproval(db,{id:'ap-legacy',agentId:'retired-agent',action:'REVIEW_RESULT',targetType:'workflow_run',targetId:'1',targetRevision:'1',payloadHash:'h',createdAt:NOW});
    const token=await signTestToken(privateKey,kid,{audience:'slc-ai-control-maintenance',claims:{run_id:'88888',workflow:'Control Center Maintenance'}});
    const request=new Request('https://slc-ai-control.pages.dev/api/control/maintenance/cleanup-approval-queue',{method:'POST',headers:{authorization:`Bearer ${token}`},body:'{}'});
    const response=await onRequestPost({request,env:{CONTROL_DB:db,GITHUB_TOKEN:'x'}});
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.total,1);
    assert.equal(body.results[0].classification,'INVALID_LEGACY_APPROVAL');
    assert.equal(body.results[0].transitioned,true);

    // An ingest-scoped token (wrong audience) must never authorize a
    // maintenance action -- least privilege across the two OIDC audiences.
    const ingestToken=await signTestToken(privateKey,kid,{audience:'slc-ai-control-ingest',claims:{run_id:'88889',workflow:'Technical SEO Watchdog'}});
    const wrongAudienceRequest=new Request('https://slc-ai-control.pages.dev/api/control/maintenance/cleanup-approval-queue',{method:'POST',headers:{authorization:`Bearer ${ingestToken}`},body:'{}'});
    const wrongAudienceResponse=await onRequestPost({request:wrongAudienceRequest,env:{CONTROL_DB:db,GITHUB_TOKEN:'x'}});
    assert.equal(wrongAudienceResponse.status,401);

    // Regression: the maintenance workflow loops this endpoint across a
    // large queue, accumulating which target_ids an earlier call already
    // fetched successfully so a later call's limited subrequest budget can
    // reach approvals nothing has checked yet instead of re-confirming the
    // same early ones every time (see queue-cleanup.js). The endpoint must
    // actually read skipFetchTargetIds out of the request body and pass it
    // through. Reuses this test's own already-verified key/kid rather than
    // minting a fresh one: jose's createRemoteJWKSet caches the JWKS
    // response and, within its cooldown window, will not re-fetch for an
    // unknown kid, so a second freshly-generated key pair in the same test
    // file fails verification even with global.fetch mocked to serve it.
    await insertApproval(db,{id:'ap-skipped',agentId:'ctr-optimizer',action:'REVIEW_RESULT',targetType:'workflow_run',targetId:'900400',targetRevision:'900400',payloadHash:'h',createdAt:NOW});
    const skipToken=await signTestToken(privateKey,kid,{audience:'slc-ai-control-maintenance',claims:{run_id:'88890',workflow:'Control Center Maintenance'}});
    const skipRequest=new Request('https://slc-ai-control.pages.dev/api/control/maintenance/cleanup-approval-queue',{method:'POST',headers:{authorization:`Bearer ${skipToken}`},body:JSON.stringify({skipFetchTargetIds:['900400']})});
    const skipResponse=await onRequestPost({request:skipRequest,env:{CONTROL_DB:db,GITHUB_TOKEN:'x'}});
    assert.equal(skipResponse.status,200);
    const skipBody=await skipResponse.json();
    const skippedRow=skipBody.results.find(r=>r.targetId==='900400');
    assert.equal(skippedRow.fetchDiagnostic,'skipped-already-checked-this-run','a real GitHub fetch was never attempted for this target -- proves skipFetchTargetIds reached cleanupApprovalQueue');
  }finally{
    global.fetch=originalFetch;
  }
});
