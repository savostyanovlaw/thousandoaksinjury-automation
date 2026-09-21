const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');

async function stateModule(){return import(pathToFileURL(process.cwd()+'/control-center/functions/api/control/state.js'));}
async function authModule(){return import(pathToFileURL(process.cwd()+'/control-center/lib/auth.js'));}

// A schema-aware fake D1 supporting exactly the tables/queries GET
// /api/control/state touches, so the REAL ensureRunReviewApproval /
// ensureControlSchema / ensureRemediationSchema code runs against it
// unmodified -- this is the exact reconciliation path a dashboard load
// exercises in production.
function fakeDb(){
  const approvals=[];
  const ready={approvals:false,audit_events:false,command_idempotency:false,remediation_jobs:false};
  return {
    approvals,
    prepare(sql){
      const trimmed=sql.trim();
      const exec=(args)=>{
        if(/^CREATE TABLE IF NOT EXISTS approvals/i.test(trimmed)){ ready.approvals=true; return {meta:{changes:0}}; }
        if(/^CREATE TABLE IF NOT EXISTS audit_events/i.test(trimmed)){ ready.audit_events=true; return {meta:{changes:0}}; }
        if(/^CREATE TABLE IF NOT EXISTS command_idempotency/i.test(trimmed)){ ready.command_idempotency=true; return {meta:{changes:0}}; }
        if(/^CREATE TABLE IF NOT EXISTS remediation_jobs/i.test(trimmed)){ ready.remediation_jobs=true; return {meta:{changes:0}}; }
        if(/^CREATE INDEX/i.test(trimmed)) return {meta:{changes:0}};
        if(/^INSERT INTO approvals/i.test(trimmed)){
          approvals.push({id:args[0],agentId:args[1],action:args[2],targetType:args[3],targetId:args[4],targetRevision:args[5],payloadHash:args[6],status:'PENDING',createdAt:args[7]});
          return {meta:{changes:1}};
        }
        if(/^INSERT INTO audit_events/i.test(trimmed)) return {meta:{changes:1}};
        return {meta:{changes:0}};
      };
      const first=(args)=>{
        if(/^SELECT id FROM approvals WHERE agent_id = \? AND action = 'REVIEW_RESULT'/i.test(trimmed)){
          const [agentId,targetId]=args;
          const existing=approvals.find(a=>a.agentId===agentId && a.targetId===String(targetId));
          return existing?{id:existing.id}:null;
        }
        return null;
      };
      const all=()=>{
        if(/^SELECT .* FROM approvals WHERE status = 'PENDING'/i.test(trimmed)) return {results:approvals.filter(a=>a.status==='PENDING')};
        return {results:[]};
      };
      return {
        async run(){ return exec([]); },
        async first(){ return first([]); },
        async all(){ return all(); },
        bind(...args){ return {run:()=>exec(args),first:()=>first(args),all:()=>all()}; }
      };
    }
  };
}

const SUCCESSFUL_RUN_ID=987654321;

function mockFetch(){
  return async(url)=>{
    const u=String(url);
    if(u.includes('/actions/workflows/technical-seo-watchdog.yml/runs')){
      return new Response(JSON.stringify({workflow_runs:[{
        id:SUCCESSFUL_RUN_ID,status:'completed',conclusion:'success',
        created_at:'2026-09-21T05:00:00Z',html_url:'https://example.invalid/run'
      }]}),{status:200,headers:{'content-type':'application/json'}});
    }
    // Every other registered agent's workflow-state lookup, plus issues/pulls
    // listings and credential diagnostics: return a harmless empty
    // success so the rest of the dashboard build degrades to "no data"
    // instead of failing the whole request.
    if(u.includes('/actions/workflows/')) return new Response(JSON.stringify({workflow_runs:[]}),{status:200,headers:{'content-type':'application/json'}});
    if(u.includes('/issues')) return new Response('[]',{status:200,headers:{'content-type':'application/json'}});
    if(u.includes('/pulls')) return new Response('[]',{status:200,headers:{'content-type':'application/json'}});
    return new Response('{}',{status:200,headers:{'content-type':'application/json'}});
  };
}

test('a workflow run whose push-based ingest never happened is still recovered into Needs Approval purely by the dashboard-load fallback', async()=>{
  const {onRequestGet}=await stateModule();
  const {createSessionToken}=await authModule();
  const db=fakeDb();
  const env={AUTHORIZED_EMAIL:'savostyanovlaw@gmail.com',CONTROL_AUTH_PASSWORD:'example-password-long-enough-2026',CONTROL_DB:db,GITHUB_TOKEN:'ghp_test'};
  const token=await createSessionToken(env,'savostyanovlaw@gmail.com');
  const request=new Request('https://slc-ai-control.pages.dev/api/control/state',{headers:{cookie:`slc_session=${token}`}});
  const originalFetch=global.fetch;
  global.fetch=mockFetch();
  try{
    // Simulate: the OIDC push-ingest step failed or never ran (network
    // blip, missing CONTROL_CENTER_URL, whatever) -- this test never calls
    // POST /api/control/ingest/review-result at all. The ONLY thing that
    // happened is that the real workflow itself completed successfully on
    // GitHub, which is all the fallback path has to work with.
    const response=await onRequestGet({request,env,data:{}});
    assert.equal(response.status,200);
    const body=await response.json();
    const created=body.approvals.find(a=>a.agentId==='technical-seo-watchdog' && a.targetId===String(SUCCESSFUL_RUN_ID));
    assert.ok(created,'the successful run must be recovered into a PENDING approval without the push path ever firing');
    assert.equal(db.approvals.filter(a=>a.agentId==='technical-seo-watchdog').length,1);

    // A second dashboard load (the owner just refreshing, or the next
    // scheduled poll) must not create a duplicate for the same run.
    const secondRequest=new Request('https://slc-ai-control.pages.dev/api/control/state',{headers:{cookie:`slc_session=${token}`}});
    const secondResponse=await onRequestGet({request:secondRequest,env,data:{}});
    assert.equal(secondResponse.status,200);
    assert.equal(db.approvals.filter(a=>a.agentId==='technical-seo-watchdog').length,1,'a repeated reconciliation must not create a duplicate approval for the same run');
  }finally{
    global.fetch=originalFetch;
  }
});
