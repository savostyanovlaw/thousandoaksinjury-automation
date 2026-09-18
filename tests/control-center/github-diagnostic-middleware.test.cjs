const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');

async function middleware(){return import(pathToFileURL(process.cwd()+'/control-center/functions/_middleware.js'));}

test('temporary GitHub diagnostic route returns only safe status fields without a session',async()=>{
  const originalFetch=global.fetch;
  const responses=[200,200,403];
  let i=0;
  global.fetch=async()=>new Response('{}',{status:responses[i++]});
  try{
    const {onRequest}=await middleware();
    const context={
      request:new Request('https://slc-ai-control.pages.dev/auth/github-diagnostic'),
      env:{GITHUB_TOKEN:'super-secret'},
      data:{},
      next:async()=>{throw new Error('must not call next')}
    };
    const res=await onRequest(context);
    assert.equal(res.status,200);
    const body=await res.json();
    assert.equal(body.configured,true); assert.equal(body.authStatus,200); assert.equal(body.repoStatus,200); assert.equal(body.workflowStatus,403); assert.equal(body.permissionHeader,''); assert.equal(body.credentialPresent,true); assert.equal(body.credentialLength,'super-secret'.length); assert.equal(body.credentialType,'unknown'); assert.match(body.credentialFingerprint,/^[0-9a-f]{12}$/);
    assert.equal(JSON.stringify(body).includes('super-secret'),false);
    assert.equal(res.headers.get('cache-control'),'no-store');
  }finally{
    global.fetch=originalFetch;
  }
});
