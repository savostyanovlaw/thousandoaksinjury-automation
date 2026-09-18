import test from 'node:test';
import assert from 'node:assert/strict';
import { execute } from '../../scripts/agent_orchestrator_bridge.mjs';

const artifact={artifact_id:'10565927645',revision:'sha256:78d85f565f22520515d0cdf3f3ead1b13c67ced018c13ac80e97b101633da2c2',agent_id:'content-creator',payload:{mode:'DRAFT_ONLY'}};

test('live artifact cannot execute without approval',()=>{
  assert.throws(()=>execute(artifact,null,()=>true),/Approval required/);
});
test('exact approved live artifact executes once only',()=>{
  const approval={status:'APPROVED',artifactId:artifact.artifact_id,targetRevision:artifact.revision,consumedAt:null};
  let calls=0;
  assert.equal(execute(artifact,approval,()=>{calls++; return 'SAFE_EXECUTED'}),'SAFE_EXECUTED');
  assert.equal(calls,1);
  assert.equal(approval.consumedAt,'consumed');
  assert.throws(()=>execute(artifact,approval,()=>{calls++;}),/already consumed/);
  assert.equal(calls,1);
});
test('wrong artifact or revision is blocked',()=>{
  assert.throws(()=>execute(artifact,{status:'APPROVED',artifactId:'wrong',targetRevision:artifact.revision,consumedAt:null},()=>true),/artifact mismatch/);
  assert.throws(()=>execute(artifact,{status:'APPROVED',artifactId:artifact.artifact_id,targetRevision:'wrong',consumedAt:null},()=>true),/Stale approval target/);
});
