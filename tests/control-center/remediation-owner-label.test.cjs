const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');

async function state(){return import(pathToFileURL(process.cwd()+'/control-center/functions/api/control/state.js'));}

test('remediationOwnerLabel maps every real status to one clear owner-facing label',async()=>{
  const {remediationOwnerLabel}=await state();
  assert.equal(remediationOwnerLabel({status:'VERIFIED',autonomy:'GREEN'}),'Automatically Fixed');
  assert.equal(remediationOwnerLabel({status:'ROLLED_BACK',autonomy:'GREEN'}),'Failed - Needs Attention');
  assert.equal(remediationOwnerLabel({status:'FAILED',autonomy:'GREEN'}),'Failed - Needs Attention');
  assert.equal(remediationOwnerLabel({status:'ESCALATED',autonomy:'GREEN'}),'Failed - Needs Attention');
  assert.equal(remediationOwnerLabel({status:'MERGED',autonomy:'GREEN'}),'Recovery In Progress');
  assert.equal(remediationOwnerLabel({status:'DISPATCHED',autonomy:'GREEN'}),'Recovery In Progress');
  assert.equal(remediationOwnerLabel({status:'QUEUED',autonomy:'GREEN'}),'Recovery In Progress');
  assert.equal(remediationOwnerLabel({status:'BLOCKED',autonomy:'YELLOW'}),'Needs Attention');
  assert.equal(remediationOwnerLabel({status:'DISPATCHED',autonomy:'YELLOW'}),'Prepared - Awaiting Review');
});

test('a stuck MERGED remediation job is surfaced in state.stuckRemediationJobs and in the owner attention feed',async()=>{
  const {loadOptionalControlState}=await state();
  const stuck=[{id:'job1',sourceAgentId:'technical-seo-watchdog',findingType:'robots-sitemap',status:'MERGED',updatedAt:'2026-01-01T00:00:00Z'}];
  const result=await loadOptionalControlState({loadApprovals:async()=>[],loadAudit:async()=>[],loadStuckRemediation:async()=>stuck});
  assert.deepEqual(result.stuckRemediationJobs,stuck);
  const fs=require('node:fs'); const s=fs.readFileSync('control-center/functions/api/control/state.js','utf8');
  assert.match(s,/state\.stuckRemediationJobs=optional\.stuckRemediationJobs/);
  assert.match(s,/did not report a final result/);
});

test('a failed loadStuckRemediation source degrades gracefully',async()=>{
  const {loadOptionalControlState}=await state();
  const result=await loadOptionalControlState({loadApprovals:async()=>[],loadAudit:async()=>[],loadStuckRemediation:async()=>{throw new Error('d1 unavailable')}});
  assert.deepEqual(result.stuckRemediationJobs,[]);
  assert.equal(result.degraded,true);
  assert.ok(result.degradedSources.includes('stuckRemediationJobs'));
});
