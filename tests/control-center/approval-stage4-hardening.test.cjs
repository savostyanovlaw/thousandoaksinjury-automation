const test = require('node:test');
const assert = require('node:assert/strict');

async function approvals(){ return import('../../control-center/lib/approvals.js'); }

test('RED approval binds the complete immutable target payload', async () => {
  const { targetHash, verifyApprovalHash } = await approvals();
  const target = {agentId:'content-creator',action:'MERGE_PR',targetType:'pull_request',targetId:'42',targetRevision:'abc123'};
  const record = {...target,payloadHash:await targetHash(target),status:'APPROVED',consumedAt:null};
  assert.equal(await verifyApprovalHash(record,target),true);
  await assert.rejects(() => verifyApprovalHash(record,{...target,targetId:'43'}),/Stale approval payload/);
});

test('RED approval rejects a changed revision', async () => {
  const { targetHash, verifyApprovalHash } = await approvals();
  const target = {agentId:'content-creator',action:'MERGE_PR',targetType:'pull_request',targetId:'42',targetRevision:'abc123'};
  const record = {...target,payloadHash:await targetHash(target),status:'APPROVED',consumedAt:null};
  await assert.rejects(() => verifyApprovalHash(record,{...target,targetRevision:'def456'}),/Stale approval/);
});

test('RED approval is single-use', async () => {
  const { targetHash, verifyApprovalHash } = await approvals();
  const target = {agentId:'content-creator',action:'MERGE_PR',targetType:'pull_request',targetId:'42',targetRevision:'abc123'};
  const record = {...target,payloadHash:await targetHash(target),status:'APPROVED',consumedAt:'2026-09-15T00:00:00Z'};
  await assert.rejects(() => verifyApprovalHash(record,target),/already consumed/);
});

test('RED approval rejects a non-approved decision state', async () => {
  const { targetHash, verifyApprovalHash } = await approvals();
  const target = {agentId:'content-creator',action:'MERGE_PR',targetType:'pull_request',targetId:'42',targetRevision:'abc123'};
  const record = {...target,payloadHash:await targetHash(target),status:'REJECTED',consumedAt:null};
  await assert.rejects(() => verifyApprovalHash(record,target),/not approved/);
});
