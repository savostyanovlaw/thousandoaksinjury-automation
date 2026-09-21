const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
async function m(){return import(pathToFileURL(process.cwd()+'/control-center/functions/api/control/ingest/review-result.js'));}
async function middleware(){return import(pathToFileURL(process.cwd()+'/control-center/functions/_middleware.js'));}
async function fixtures(){return import(pathToFileURL(process.cwd()+'/control-center/lib/github-oidc.testkit.js'));}

function fakeDb(){
  const rows=[];
  return {
    rows,
    prepare(sql){
      return {
        // D1's PreparedStatement supports .run()/.first() directly (used by
        // schema DDL, which has no parameters) as well as via .bind(...).
        async run(){ return {meta:{changes:1}}; },
        async first(){ return null; },
        bind(...args){
          return {
            async run(){
              if(sql.startsWith('INSERT INTO approvals')) rows.push({id:args[0],agentId:args[1],action:args[2],targetType:args[3],targetId:args[4],targetRevision:args[5],payloadHash:args[6],status:'PENDING',createdAt:args[7]});
              return {meta:{changes:1}};
            },
            async first(){
              const [agentId,targetId]=args;
              return rows.find(r=>r.agentId===agentId && r.targetId===String(targetId)) || null;
            }
          };
        }
      };
    }
  };
}

const agents=[{id:'technical-seo-watchdog',deployed:true,commands:[{name:'RUN_NOW',autonomy:'GREEN'}]}];

test('ingest creates exactly one persistent review-result approval per run id',async()=>{
  const {ingestReviewResult}=await m();
  const db=fakeDb();
  const first=await ingestReviewResult({agents,db,body:{agentId:'technical-seo-watchdog',runId:'999'}});
  assert.ok(first);
  assert.equal(first.targetType,'workflow_run');
  assert.equal(first.targetId,'999');
  assert.equal(db.rows.length,1);
  const second=await ingestReviewResult({agents,db,body:{agentId:'technical-seo-watchdog',runId:'999'}});
  assert.equal(second,null);
  assert.equal(db.rows.length,1);
});

test('ingest rejects an unknown or undeployed agent',async()=>{
  const {ingestReviewResult}=await m();
  const db=fakeDb();
  await assert.rejects(()=>ingestReviewResult({agents,db,body:{agentId:'not-real',runId:'1'}}),/Unknown or undeployed/);
});

test('middleware exempts the ingest route from browser session auth',async()=>{
  const {onRequest}=await middleware();
  const request=new Request('https://slc-ai-control.pages.dev/api/control/ingest/review-result',{method:'POST'});
  let calledNext=false;
  const response=await onRequest({request,env:{},data:{},next:async()=>{calledNext=true; return new Response('ok');}});
  assert.equal(calledNext,true);
  assert.equal(await response.text(),'ok');
});

test('onRequestPost fails closed without a valid GitHub OIDC bearer token',async()=>{
  const {onRequestPost}=await m();
  const request=new Request('https://slc-ai-control.pages.dev/api/control/ingest/review-result',{method:'POST',body:JSON.stringify({agentId:'technical-seo-watchdog',runId:'1'})});
  const response=await onRequestPost({request,env:{CONTROL_DB:fakeDb()}});
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
    const token=await signTestToken(privateKey,kid,{claims:{run_id:'55555',workflow:'Technical SEO Watchdog'}});
    const db=fakeDb();
    const request=new Request('https://slc-ai-control.pages.dev/api/control/ingest/review-result',{method:'POST',headers:{authorization:`Bearer ${token}`},body:JSON.stringify({agentId:'technical-seo-watchdog',runId:'55555'})});
    const response=await onRequestPost({request,env:{CONTROL_DB:db}});
    assert.equal(response.status,201);
    const body=await response.json();
    assert.equal(body.ok,true);
    assert.equal(body.created,true);
    assert.equal(db.rows.length,1);

    // A token cannot be replayed to ingest a *different* run id than the
    // one GitHub actually minted it for.
    const mismatched=new Request('https://slc-ai-control.pages.dev/api/control/ingest/review-result',{method:'POST',headers:{authorization:`Bearer ${token}`},body:JSON.stringify({agentId:'technical-seo-watchdog',runId:'99999'})});
    const mismatchedResponse=await onRequestPost({request:mismatched,env:{CONTROL_DB:db}});
    assert.equal(mismatchedResponse.status,400);
    assert.equal(db.rows.length,1);
  }finally{
    global.fetch=originalFetch;
  }
});
