const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');

async function endpoint(){
  return import(pathToFileURL(process.cwd()+'/control-center/functions/api/control/diagnostics/github.js'));
}

test('GitHub diagnostics endpoint fails closed without a native session',async()=>{
  const {onRequestGet}=await endpoint();
  const context={
    request:new Request('https://x/api/control/diagnostics/github'),
    data:{},
    env:{AUTHORIZED_EMAIL:'savostyanovlaw@gmail.com',GITHUB_TOKEN:'x'}
  };
  const res=await onRequestGet(context);
  assert.equal(res.status,401);
});

test('GitHub diagnostics response contains only safe status fields',async()=>{
  const {safeDiagnostic}=await endpoint();
  assert.deepEqual(safeDiagnostic({configured:true,authStatus:200,repoStatus:200,workflowStatus:403,token:'never'}),{
    configured:true,
    authStatus:200,
    repoStatus:200,
    workflowStatus:403
  });
});
