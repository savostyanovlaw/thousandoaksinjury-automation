const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {createSqliteD1}=require('./sqlite-d1.cjs');

async function stateModule(){return import(pathToFileURL(process.cwd()+'/control-center/functions/api/control/state.js'));}
async function authModule(){return import(pathToFileURL(process.cwd()+'/control-center/lib/auth.js'));}
async function approvalStore(){return import(pathToFileURL(process.cwd()+'/control-center/lib/approval-store.js'));}

const RUN_ID=555000111;
const JOB_ID=42;

function markerLine(payload){
  const encoded=Buffer.from(JSON.stringify(payload),'utf-8').toString('base64');
  return `2026-09-21T10:00:00Z SLC_REVIEW_JSON_B64=${encoded}`;
}

// Simulates exactly the production race PR #116 tried (and failed) to fix:
// the push-ingest call from INSIDE the producing job already created the
// PENDING approval, but its own first auto-remediation attempt found no
// marker in the job's log yet (the job had not finished writing it out).
// By the time a dashboard load reconciles the same run, the job is done and
// its log is stable -- this is the scenario this fix targets.
function mockFetch({logHasMarkerYet}){
  return async(url)=>{
    const u=String(url);
    if(u.includes('/actions/workflows/technical-seo-watchdog.yml/runs')){
      return new Response(JSON.stringify({workflow_runs:[{
        id:RUN_ID,status:'completed',conclusion:'success',
        created_at:'2026-09-21T05:00:00Z',html_url:'https://example.invalid/run'
      }]}),{status:200,headers:{'content-type':'application/json'}});
    }
    if(u===`https://api.github.com/repos/savostyanovlaw/thousandoaksinjury-automation/actions/runs/${RUN_ID}`){
      return new Response(JSON.stringify({id:RUN_ID,name:'Technical SEO Watchdog',status:'completed',conclusion:'success',created_at:'2026-09-21T05:00:00Z',updated_at:'2026-09-21T05:05:00Z',html_url:'https://example.invalid/run',head_sha:'abc',event:'schedule'}),{status:200,headers:{'content-type':'application/json'}});
    }
    if(u.includes(`/actions/runs/${RUN_ID}/artifacts`)){
      return new Response(JSON.stringify({artifacts:[]}),{status:200,headers:{'content-type':'application/json'}});
    }
    if(u.includes(`/actions/runs/${RUN_ID}/jobs`)){
      return new Response(JSON.stringify({jobs:[{id:JOB_ID}]}),{status:200,headers:{'content-type':'application/json'}});
    }
    if(u.includes(`/actions/jobs/${JOB_ID}/logs`)){
      const log=logHasMarkerYet
        ? 'setup output\n'+markerLine({findings:[{findingType:'robots-sitemap',summary:'missing sitemap',recommendedAction:'add it'}]})+'\n'
        : 'this job is still running -- the notify step just called us, nothing else has been written to the log yet\n';
      return new Response(log,{status:200,headers:{'content-type':'text/plain'}});
    }
    if(u.includes('/actions/workflows/')) return new Response(JSON.stringify({workflow_runs:[]}),{status:200,headers:{'content-type':'application/json'}});
    if(u.includes('/issues')) return new Response('[]',{status:200,headers:{'content-type':'application/json'}});
    if(u.includes('/pulls')) return new Response('[]',{status:200,headers:{'content-type':'application/json'}});
    return new Response('{}',{status:200,headers:{'content-type':'application/json'}});
  };
}

test('a REVIEW_RESULT approval already created by push-ingest (whose first auto-remediation attempt lost the log-finalization race) is retried and auto-approved on a later dashboard load',async()=>{
  const {onRequestGet}=await stateModule();
  const {createSessionToken}=await authModule();
  const {ensureControlSchema,insertApproval,getApproval}=await approvalStore();
  const db=createSqliteD1();
  await ensureControlSchema(db);
  // Mirrors exactly what ingest/review-result.js's ensureRunReviewApproval
  // already did: the approval row exists, PENDING, before this dashboard
  // load ever runs -- so `ensureRunReviewApproval` inside onRequestGet will
  // return null (not a "genuinely new" row) for this run.
  await insertApproval(db,{
    id:'ap-race',agentId:'technical-seo-watchdog',action:'REVIEW_RESULT',targetType:'workflow_run',
    targetId:String(RUN_ID),targetRevision:String(RUN_ID),payloadHash:'x',createdAt:'2026-09-21T05:00:00Z'
  });
  const env={AUTHORIZED_EMAIL:'savostyanovlaw@gmail.com',CONTROL_AUTH_PASSWORD:'example-password-long-enough-2026',CONTROL_DB:db,GITHUB_TOKEN:'ghp_test'};
  const token=await createSessionToken(env,'savostyanovlaw@gmail.com');
  const request=new Request('https://slc-ai-control.pages.dev/api/control/state',{headers:{cookie:`slc_session=${token}`}});
  const originalFetch=global.fetch;
  try{
    // The job has since finished and its log is now complete and stable --
    // exactly the state a real run is in by the time an owner next loads
    // the dashboard, well after the run itself completed.
    global.fetch=mockFetch({logHasMarkerYet:true});
    const response=await onRequestGet({request,env,data:{}});
    assert.equal(response.status,200);
    const approval=await getApproval(db,'ap-race');
    assert.equal(approval.status,'APPROVED','the existing PENDING approval must be retried and auto-approved once the report is genuinely fully green, not left stuck forever');
  }finally{
    global.fetch=originalFetch;
  }
});

test('a still-PENDING REVIEW_RESULT approval whose report is not fully green is retried harmlessly and stays PENDING',async()=>{
  const {onRequestGet}=await stateModule();
  const {createSessionToken}=await authModule();
  const {ensureControlSchema,insertApproval,getApproval}=await approvalStore();
  const db=createSqliteD1();
  await ensureControlSchema(db);
  await insertApproval(db,{
    id:'ap-not-green',agentId:'technical-seo-watchdog',action:'REVIEW_RESULT',targetType:'workflow_run',
    targetId:String(RUN_ID),targetRevision:String(RUN_ID),payloadHash:'x',createdAt:'2026-09-21T05:00:00Z'
  });
  const env={AUTHORIZED_EMAIL:'savostyanovlaw@gmail.com',CONTROL_AUTH_PASSWORD:'example-password-long-enough-2026',CONTROL_DB:db,GITHUB_TOKEN:'ghp_test'};
  const token=await createSessionToken(env,'savostyanovlaw@gmail.com');
  const request=new Request('https://slc-ai-control.pages.dev/api/control/state',{headers:{cookie:`slc_session=${token}`}});
  const originalFetch=global.fetch;
  try{
    // No marker in the log at all (still no reviewResult) -- the retry must
    // never fabricate a decision and must leave the approval exactly as it
    // was, for ordinary owner review.
    global.fetch=mockFetch({logHasMarkerYet:false});
    const response=await onRequestGet({request,env,data:{}});
    assert.equal(response.status,200);
    const approval=await getApproval(db,'ap-not-green');
    assert.equal(approval.status,'PENDING');
  }finally{
    global.fetch=originalFetch;
  }
});
