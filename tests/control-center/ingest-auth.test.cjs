const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
async function m(){return import(pathToFileURL(process.cwd()+'/control-center/lib/auth.js'));}

test('requireIngestToken fails closed when no token is configured',async()=>{
  const {requireIngestToken}=await m();
  const context={request:{headers:new Headers({'x-control-ingest-token':'anything'})}};
  await assert.rejects(()=>requireIngestToken(context,{}),/token not configured/);
});

test('requireIngestToken rejects a wrong or missing token',async()=>{
  const {requireIngestToken}=await m();
  const env={CONTROL_INGEST_TOKEN:'a-long-enough-shared-secret-value'};
  await assert.rejects(()=>requireIngestToken({request:{headers:new Headers()}},env),/Unauthorized/);
  await assert.rejects(()=>requireIngestToken({request:{headers:new Headers({'x-control-ingest-token':'wrong'})}},env),/Unauthorized/);
});

test('requireIngestToken accepts the exact configured token',async()=>{
  const {requireIngestToken}=await m();
  const env={CONTROL_INGEST_TOKEN:'a-long-enough-shared-secret-value'};
  const context={request:{headers:new Headers({'x-control-ingest-token':'a-long-enough-shared-secret-value'})}};
  assert.equal(await requireIngestToken(context,env),true);
});
