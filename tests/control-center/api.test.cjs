const test=require('node:test'); const assert=require('node:assert/strict'); const {pathToFileURL}=require('node:url');
async function state(){return import(pathToFileURL(process.cwd()+'/control-center/functions/api/control/state.js'));}
function ctx(extra={}){return {request:new Request('https://x/api/control/state'),data:{},env:{AUTHORIZED_EMAIL:'savostyanovlaw@gmail.com',GITHUB_TOKEN:'x'},...extra};}
test('state endpoint fails closed without native session',async()=>{const {onRequestGet}=await state(); const res=await onRequestGet(ctx()); assert.equal(res.status,401);});

test('optional D1 state degrades to empty data instead of failing the dashboard',async()=>{
  const {loadOptionalControlState}=await state();
  assert.equal(typeof loadOptionalControlState,'function');
  const result=await loadOptionalControlState({
    loadApprovals:async()=>{throw new Error('d1 unavailable')},
    loadAudit:async()=>{throw new Error('d1 unavailable')}
  });
  assert.deepEqual(result.pendingApprovals,[]);
  assert.deepEqual(result.auditEvents,[]);
  assert.equal(result.degraded,true);
  assert.deepEqual(result.degradedSources,['approvals','audit']);
});
