import test from 'node:test';
import assert from 'node:assert/strict';
import { executeApprovalDecision } from '../../control-center/functions/api/control/approvals/[id].js';

function db(){
  const state={status:'PENDING',consumed:false};
  return {
    state,
    prepare(sql){
      return {
        bind(...args){
          return {
            async run(){
              if(sql.startsWith('UPDATE approvals SET status')){
                if(state.status!=='PENDING') return {meta:{changes:0}};
                state.status=args[0]; return {meta:{changes:1}};
              }
              if(sql.startsWith('UPDATE approvals SET consumed_at')){
                if(state.consumed || state.status!=='APPROVED') return {meta:{changes:0}};
                state.consumed=true; return {meta:{changes:1}};
              }
              return {meta:{changes:1}};
            }
          };
        }
      };
    }
  };
}
const base={id:'ap1',agentId:'content-creator',action:'MERGE_PR',targetType:'pull_request',targetId:'44',targetRevision:'abc',status:'PENDING',consumedAt:null};

test('rejected artifact never executes', async()=>{
  const d=db(); let merged=false;
  const result=await executeApprovalDecision({record:{...base},decision:'REJECT',user:{email:'owner@example.com'},db:d,github:{mergePull:async()=>{merged=true}}});
  assert.equal(result.executed,false); assert.equal(merged,false);
});

test('stale revision cannot execute', async()=>{
  const d=db();
  await assert.rejects(()=>executeApprovalDecision({record:{...base,payloadHash:'x'},decision:'APPROVE',user:{email:'owner@example.com'},db:d,github:{getPullRevision:async()=>({targetRevision:'new'}),mergePull:async()=>({merged:true})}}),/Stale approval target/);
  assert.equal(d.state.status,'PENDING');
});
