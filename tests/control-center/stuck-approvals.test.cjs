const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');

async function approvalStore(){return import(pathToFileURL(process.cwd()+'/control-center/lib/approval-store.js'));}

function fakeDb(rows){
  return {
    prepare(sql){
      return {
        bind(cutoff){
          return {
            async all(){
              const results=rows.filter(r=>r.status==='APPROVED' && r.action==='MERGE_PR' && !r.consumed_at && r.decided_at<cutoff)
                .map(r=>({id:r.id,agentId:r.agent_id,action:r.action,targetType:r.target_type,targetId:r.target_id,targetRevision:r.target_revision,status:r.status,createdAt:r.created_at,decidedAt:r.decided_at,decidedBy:r.decided_by}));
              return {results};
            }
          };
        }
      };
    }
  };
}

const oldTs='2020-01-01T00:00:00.000Z';

test('a MERGE_PR approved-but-unconsumed longer than the threshold is reported as stuck',async()=>{
  const {listStuckApprovals}=await approvalStore();
  const db=fakeDb([{id:'a1',agent_id:'content-creator',action:'MERGE_PR',target_type:'pull_request',target_id:'1',target_revision:'x',status:'APPROVED',consumed_at:null,created_at:oldTs,decided_at:oldTs,decided_by:'owner@example.com'}]);
  const result=await listStuckApprovals(db,15);
  assert.equal(result.length,1);
  assert.equal(result[0].id,'a1');
});

test('a successfully consumed MERGE_PR approval is never reported as stuck',async()=>{
  const {listStuckApprovals}=await approvalStore();
  const db=fakeDb([{id:'a2',agent_id:'content-creator',action:'MERGE_PR',target_type:'pull_request',target_id:'2',target_revision:'x',status:'APPROVED',consumed_at:oldTs,created_at:oldTs,decided_at:oldTs,decided_by:'owner@example.com'}]);
  const result=await listStuckApprovals(db,15);
  assert.equal(result.length,0);
});

test('a REVIEW_RESULT approval is never reported as stuck, even though it never sets consumed_at by design',async()=>{
  const {listStuckApprovals}=await approvalStore();
  const db=fakeDb([{id:'a3',agent_id:'technical-seo-watchdog',action:'REVIEW_RESULT',target_type:'workflow_run',target_id:'3',target_revision:'3',status:'APPROVED',consumed_at:null,created_at:oldTs,decided_at:oldTs,decided_by:'owner@example.com'}]);
  const result=await listStuckApprovals(db,15);
  assert.equal(result.length,0,'REVIEW_RESULT approvals must never be flagged stuck for lacking consumed_at');
});

test('a PENDING approval is never reported as stuck',async()=>{
  const {listStuckApprovals}=await approvalStore();
  const db=fakeDb([{id:'a4',agent_id:'content-creator',action:'MERGE_PR',target_type:'pull_request',target_id:'4',target_revision:'x',status:'PENDING',consumed_at:null,created_at:oldTs,decided_at:null,decided_by:null}]);
  const result=await listStuckApprovals(db,15);
  assert.equal(result.length,0);
});
