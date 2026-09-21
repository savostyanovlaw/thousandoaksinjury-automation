const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');

// A faithful-enough fake D1 that actually enforces "no such table" until the
// matching CREATE TABLE IF NOT EXISTS has run, so these tests fail the way
// production genuinely failed (confirmed live: the Control Center's real D1
// database currently has zero tables) unless each route handler calls
// ensureControlSchema itself instead of assuming schema.sql was already run
// by hand.
function schemaAwareFakeDb(){
  const ready={approvals:false,audit_events:false,command_idempotency:false};
  const approvalRows=[];
  function tableFor(sql){
    if(/\bapprovals\b/i.test(sql)) return 'approvals';
    if(/\baudit_events\b/i.test(sql)) return 'audit_events';
    if(/\bcommand_idempotency\b/i.test(sql)) return 'command_idempotency';
    return null;
  }
  function requireReady(sql){
    const t=tableFor(sql);
    if(t && !ready[t]) throw new Error(`D1_ERROR: no such table: ${t}`);
  }
  return {
    ready,approvalRows,
    prepare(sql){
      const trimmed=sql.trim();
      if(/^CREATE TABLE IF NOT EXISTS/i.test(trimmed)){
        const t=tableFor(trimmed);
        return {async run(){ if(t) ready[t]=true; return {meta:{changes:0}}; }};
      }
      requireReady(trimmed);
      const bound=(args)=>({
        async run(){
          if(/^INSERT INTO approvals/i.test(trimmed)){
            approvalRows.push({id:args[0],agentId:args[1],action:args[2],targetType:args[3],targetId:args[4],targetRevision:args[5],payloadHash:args[6],status:'PENDING',createdAt:args[7]});
          }
          return {meta:{changes:1}};
        },
        async first(){ return null; },
        async all(){
          if(/^SELECT .* FROM approvals WHERE status = 'PENDING'/i.test(trimmed)) return {results:approvalRows.filter(r=>r.status==='PENDING')};
          return {results:[]};
        }
      });
      return {
        bind(...args){ return bound(args); },
        async run(){ return bound([]).run(); },
        async first(){ return bound([]).first(); },
        async all(){ return bound([]).all(); }
      };
    }
  };
}

test('GET /api/control/state does not 500 against a D1 database with no schema yet',async()=>{
  const mod=await import(pathToFileURL(process.cwd()+'/control-center/functions/api/control/state.js'));
  const authMod=await import(pathToFileURL(process.cwd()+'/control-center/lib/auth.js'));
  const {createSessionToken}=authMod;
  const env={AUTHORIZED_EMAIL:'savostyanovlaw@gmail.com',CONTROL_AUTH_PASSWORD:'example-password-long-enough-2026',CONTROL_DB:schemaAwareFakeDb(),GITHUB_TOKEN:''};
  const token=await createSessionToken(env,'savostyanovlaw@gmail.com');
  const request=new Request('https://slc-ai-control.pages.dev/api/control/state',{headers:{cookie:`slc_session=${token}`}});
  const originalFetch=global.fetch;
  global.fetch=async()=>new Response('{"message":"no network in this test"}',{status:503});
  try{
    const response=await mod.onRequestGet({request,env,data:{}});
    assert.equal(response.status,200,`expected 200, got ${response.status}: ${await response.clone().text()}`);
    const body=await response.json();
    assert.ok(Array.isArray(body.approvals));
  }finally{
    global.fetch=originalFetch;
  }
});

test('GET and POST /api/control/approvals do not fail against a D1 database with no schema yet',async()=>{
  const mod=await import(pathToFileURL(process.cwd()+'/control-center/functions/api/control/approvals.js'));
  const authMod=await import(pathToFileURL(process.cwd()+'/control-center/lib/auth.js'));
  const {createSessionToken}=authMod;
  const db=schemaAwareFakeDb();
  const env={AUTHORIZED_EMAIL:'savostyanovlaw@gmail.com',CONTROL_AUTH_PASSWORD:'example-password-long-enough-2026',CONTROL_DB:db};
  const token=await createSessionToken(env,'savostyanovlaw@gmail.com');
  const getRequest=new Request('https://slc-ai-control.pages.dev/api/control/approvals',{headers:{cookie:`slc_session=${token}`}});
  const getResponse=await mod.onRequestGet({request:getRequest,env,data:{}});
  assert.equal(getResponse.status,200,`expected 200, got ${getResponse.status}: ${await getResponse.clone().text()}`);

  // No agent currently registers a RED capability (agent-registry.js), so
  // this legitimately rejects with a business-logic 400, not a schema
  // crash -- the point of this assertion is that it never sees "no such
  // table" once ensureControlSchema runs first.
  const postRequest=new Request('https://slc-ai-control.pages.dev/api/control/approvals',{
    method:'POST',
    headers:{cookie:`slc_session=${token}`,origin:'https://slc-ai-control.pages.dev','content-type':'application/json'},
    body:JSON.stringify({agentId:'content-creator',action:'MERGE_PR',targetType:'pull_request',targetId:'17',targetRevision:'abc'})
  });
  const postResponse=await mod.onRequestPost({request:postRequest,env,data:{}});
  const postBody=await postResponse.clone().json();
  assert.doesNotMatch(postBody.error||'',/no such table/i);
  assert.equal(postBody.error,'Action is not a registered RED capability');
});

test('every approval route handler calls ensureControlSchema before touching CONTROL_DB',()=>{
  const files=[
    'control-center/functions/api/control/state.js',
    'control-center/functions/api/control/approvals.js',
    'control-center/functions/api/control/approvals/[id].js',
    'control-center/functions/api/control/approvals/[id]/review.js'
  ];
  for(const file of files){
    const src=fs.readFileSync(file,'utf8');
    assert.match(src,/ensureControlSchema/,`${file} does not self-heal missing schema via ensureControlSchema`);
  }
});
