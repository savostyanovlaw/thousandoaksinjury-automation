const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
async function m(){return import(pathToFileURL(process.cwd()+'/control-center/functions/api/control/ingest/review-result.js'));}
async function middleware(){return import(pathToFileURL(process.cwd()+'/control-center/functions/_middleware.js'));}

function fakeDb(){
  const rows=[];
  return {
    rows,
    prepare(sql){
      return {
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

test('onRequestPost fails closed without a valid ingest token',async()=>{
  const {onRequestPost}=await m();
  const request=new Request('https://slc-ai-control.pages.dev/api/control/ingest/review-result',{method:'POST',body:JSON.stringify({agentId:'technical-seo-watchdog',runId:'1'})});
  const response=await onRequestPost({request,env:{CONTROL_DB:fakeDb()}});
  assert.equal(response.status,401);
});
