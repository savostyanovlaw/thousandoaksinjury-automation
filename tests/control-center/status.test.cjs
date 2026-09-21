const test=require('node:test'); const assert=require('node:assert/strict'); const path=require('node:path'); const {pathToFileURL}=require('node:url');
async function get(){return import(pathToFileURL(process.cwd()+'/control-center/lib/status.js'));}
test('status precedence is deterministic',async()=>{const {deriveAgentStatus}=await get(); assert.equal(deriveAgentStatus({deployed:true,disabled:false,pendingApproval:true,running:true,currentFailure:true,lastSuccess:true}),'WAITING APPROVAL'); assert.equal(deriveAgentStatus({deployed:true,running:true,currentFailure:true}),'RUNNING'); assert.equal(deriveAgentStatus({deployed:true,currentFailure:true}),'NEEDS ATTENTION'); assert.equal(deriveAgentStatus({deployed:true,lastSuccess:true}),'HEALTHY');});
test('not deployed and disabled are explicit',async()=>{const {deriveAgentStatus}=await get(); assert.equal(deriveAgentStatus({deployed:false}),'NOT DEPLOYED'); assert.equal(deriveAgentStatus({deployed:true,disabled:true}),'DISABLED');});
test('superseded historical failure does not make current state red',async()=>{const {deriveAgentStatus}=await get(); assert.equal(deriveAgentStatus({deployed:true,lastSuccess:true,historicalFailure:true,currentFailure:false}),'HEALTHY');});
test('an event-driven agent that has never run is WAITING FOR INPUT, not NEEDS ATTENTION',async()=>{
  const {deriveAgentStatus}=await get();
  assert.equal(deriveAgentStatus({deployed:true,eventDriven:true}),'WAITING FOR INPUT');
});
test('a scheduled agent that has never run is still NEEDS ATTENTION',async()=>{
  const {deriveAgentStatus}=await get();
  assert.equal(deriveAgentStatus({deployed:true,eventDriven:false}),'NEEDS ATTENTION');
});
test('event-driven never overrides a real failure, running state, or pending approval',async()=>{
  const {deriveAgentStatus}=await get();
  assert.equal(deriveAgentStatus({deployed:true,eventDriven:true,currentFailure:true}),'NEEDS ATTENTION');
  assert.equal(deriveAgentStatus({deployed:true,eventDriven:true,running:true}),'RUNNING');
  assert.equal(deriveAgentStatus({deployed:true,eventDriven:true,pendingApproval:true}),'WAITING APPROVAL');
  assert.equal(deriveAgentStatus({deployed:true,eventDriven:true,lastSuccess:true}),'HEALTHY');
});
