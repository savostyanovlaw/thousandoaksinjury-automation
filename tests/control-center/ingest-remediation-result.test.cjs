const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {createSqliteD1}=require('./sqlite-d1.cjs');

async function m(){return import(pathToFileURL(process.cwd()+'/control-center/functions/api/control/ingest/remediation-result.js'));}
async function middleware(){return import(pathToFileURL(process.cwd()+'/control-center/functions/_middleware.js'));}
async function fixtures(){return import(pathToFileURL(process.cwd()+'/control-center/lib/github-oidc.testkit.js'));}
async function remediationStore(){return import(pathToFileURL(process.cwd()+'/control-center/lib/remediation-store.js'));}

async function seedJob(db,overrides={}){
  const {ensureRemediationSchema,createRemediationJob}=await remediationStore();
  await ensureRemediationSchema(db);
  const job={id:'job-1',sourceAgentId:'technical-seo-watchdog',sourceRunId:'999',ownerApprovalId:'ap1',findingType:'robots-sitemap',summary:'s',recommendedAction:'a',rawFinding:{},remediationAgentId:'technical-seo-fixer',autonomy:'GREEN',createdAt:new Date().toISOString(),...overrides};
  await createRemediationJob(db,job);
  await (await remediationStore()).updateRemediationJob(db,job.id,'MERGED');
  return job;
}

test('ingestRemediationResult updates the job to a terminal status and records evidence',async()=>{
  const {ingestRemediationResult}=await m();
  const {getRemediationJob}=await remediationStore();
  const db=createSqliteD1();
  await seedJob(db);
  const job=await ingestRemediationResult({db,body:{jobId:'job-1',runId:'555',status:'VERIFIED',prNumber:42,mergedSha:'abc123',error:null}});
  assert.equal(job.id,'job-1');
  const row=await getRemediationJob(db,'job-1');
  assert.equal(row.status,'VERIFIED');
  assert.equal(row.pullRequestNumber,42);
  assert.equal(row.pullRequestRevision,'abc123');
  assert.ok(row.verifiedAt);
  assert.equal(row.attemptCount,1);
});

test('ingestRemediationResult rejects an unsupported status',async()=>{
  const {ingestRemediationResult}=await m();
  const db=createSqliteD1();
  await seedJob(db,{id:'job-2'});
  await assert.rejects(()=>ingestRemediationResult({db,body:{jobId:'job-2',runId:'555',status:'BOGUS'}}),/Unsupported remediation result status/);
});

test('ingestRemediationResult rejects an unknown job id',async()=>{
  const {ingestRemediationResult}=await m();
  const db=createSqliteD1();
  await assert.rejects(()=>ingestRemediationResult({db,body:{jobId:'does-not-exist',runId:'555',status:'VERIFIED'}}),/not found/);
});

test('a rolled-back result is recorded with its error text',async()=>{
  const {ingestRemediationResult}=await m();
  const {getRemediationJob}=await remediationStore();
  const db=createSqliteD1();
  await seedJob(db,{id:'job-3'});
  await ingestRemediationResult({db,body:{jobId:'job-3',runId:'555',status:'ROLLED_BACK',error:'verification failed after 5 attempts'}});
  const row=await getRemediationJob(db,'job-3');
  assert.equal(row.status,'ROLLED_BACK');
  assert.equal(row.lastError,'verification failed after 5 attempts');
  assert.equal(row.verifiedAt,null,'a rolled-back job must not be marked verified');
});

test('middleware exempts the remediation-result route from browser session auth',async()=>{
  const {onRequest}=await middleware();
  const request=new Request('https://slc-ai-control.pages.dev/api/control/ingest/remediation-result',{method:'POST'});
  let calledNext=false;
  const response=await onRequest({request,env:{},data:{},next:async()=>{calledNext=true; return new Response('ok');}});
  assert.equal(calledNext,true);
  assert.equal(await response.text(),'ok');
});

test('onRequestPost fails closed without a valid GitHub OIDC bearer token',async()=>{
  const {onRequestPost}=await m();
  const request=new Request('https://slc-ai-control.pages.dev/api/control/ingest/remediation-result',{method:'POST',body:JSON.stringify({jobId:'job-1',runId:'1',status:'VERIFIED'})});
  const response=await onRequestPost({request,env:{CONTROL_DB:createSqliteD1()}});
  assert.equal(response.status,401);
});

test('onRequestPost ingests through the full default code path with a real GitHub-shaped OIDC token, and ties the token to its own run id',async()=>{
  const {signTestToken,buildRemoteJwksDocument}=await fixtures();
  const {privateKey,kid,document}=await buildRemoteJwksDocument();
  const originalFetch=global.fetch;
  global.fetch=async(url)=>{
    if(String(url).includes('token.actions.githubusercontent.com')) return new Response(JSON.stringify(document),{status:200,headers:{'content-type':'application/json'}});
    throw new Error(`unexpected fetch: ${url}`);
  };
  try{
    const {onRequestPost}=await m();
    const db=createSqliteD1();
    await seedJob(db,{id:'job-live'});
    const token=await signTestToken(privateKey,kid,{claims:{run_id:'77777',workflow:'Remediation Preparer'}});
    const request=new Request('https://slc-ai-control.pages.dev/api/control/ingest/remediation-result',{method:'POST',headers:{authorization:`Bearer ${token}`},body:JSON.stringify({jobId:'job-live',runId:'77777',status:'VERIFIED',prNumber:7,mergedSha:'deadbeef'})});
    const response=await onRequestPost({request,env:{CONTROL_DB:db}});
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.ok,true);
    assert.equal(body.status,'VERIFIED');

    // A token cannot be replayed to report the outcome of a *different* run.
    const mismatched=new Request('https://slc-ai-control.pages.dev/api/control/ingest/remediation-result',{method:'POST',headers:{authorization:`Bearer ${token}`},body:JSON.stringify({jobId:'job-live',runId:'99999',status:'VERIFIED'})});
    const mismatchedResponse=await onRequestPost({request:mismatched,env:{CONTROL_DB:db}});
    assert.equal(mismatchedResponse.status,400);
  }finally{
    global.fetch=originalFetch;
  }
});
