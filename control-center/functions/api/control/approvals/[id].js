import { requireAuthorizedUser } from '../../../../lib/auth.js';
import { createGitHubAdapter } from '../../../../lib/github.js';
import { targetHash, assertApprovalExecutable } from '../../../../lib/approvals.js';
import { getApproval, decideApproval, consumeApproval, ensureControlSchema } from '../../../../lib/approval-store.js';
import { writeAudit } from '../../../../lib/audit.js';
import { createRemediationJob, updateRemediationJob } from '../../../../lib/remediation-store.js';
import { assertExactFields, errorResponse, jsonResponse, parseJson, requireSameOrigin } from '../../../../lib/http.js';

export async function executeApprovalDecision({record,decision,user,db,github}){
  if(!record) throw new Error('Approval not found');
  if(record.status!=='PENDING') throw new Error('Approval is stale or already decided');
  if(decision==='REJECT'){
    const decided=await decideApproval(db,record.id,'REJECTED',user.email);
    return {ok:true,executed:false,...decided};
  }
  if(decision!=='APPROVE') throw new Error('Invalid decision');
  if(record.targetType==='workflow_run' && record.action==='REVIEW_RESULT'){
    const review=await github.getWorkflowRunReview(record.targetId);
    const r=review?.reviewResult||{};
    const findings=Array.isArray(r.findings)?r.findings:[];
    const actionable=findings.length?findings:[r];
    const jobs=[];
    const route=(type)=>({
      title:'technical-seo-fixer',meta_description:'technical-seo-fixer',canonical:'technical-seo-fixer',
      broken_link:'technical-seo-fixer',redirect:'technical-seo-fixer',sitemap:'technical-seo-fixer',
      robots:'technical-seo-fixer',schema:'technical-seo-fixer',structured_data:'technical-seo-fixer'
    }[String(type||'').toLowerCase()]|| (record.agentId==='technical-seo-watchdog'?'technical-seo-fixer':null));
    for(const item of actionable){
      const type=item?.findingType||item?.type||item?.code||'general';
      const summary=String(item?.summary||item?.title||item?.message||r?.title||'Approved agent finding').slice(0,1000);
      const recommendedAction=String(item?.recommendedAction||item?.recommendation||r?.recommendation||'Prepare a repository-level fix for owner review.').slice(0,1000);
      const remediationAgentId=route(type);
      const job={id:crypto.randomUUID(),sourceAgentId:record.agentId,sourceRunId:String(record.targetId),ownerApprovalId:record.id,findingType:String(type),summary,recommendedAction,rawFinding:item||{},remediationAgentId,createdAt:new Date().toISOString()};
      try{
        await createRemediationJob(db,job);
        if(remediationAgentId){await github.dispatchRemediation(job);await updateRemediationJob(db,job.id,'DISPATCHED');}
        else await updateRemediationJob(db,job.id,'BLOCKED');
        jobs.push({...job,status:remediationAgentId?'DISPATCHED':'BLOCKED'});
      }catch(error){ if(!/UNIQUE|constraint/i.test(String(error?.message||error))) throw error; }
    }
    const decided=await decideApproval(db,record.id,'APPROVED',user.email);
    return {ok:true,executed:false,reviewAccepted:true,remediationJobs:jobs,...decided};
  }
  if(record.targetType!=='pull_request' || record.action!=='MERGE_PR') throw new Error('Unsupported RED action');
  const current=await github.getPullRevision(record.targetId);
  const payload={agentId:record.agentId,action:record.action,targetType:record.targetType,targetId:String(record.targetId),targetRevision:String(current.targetRevision)};
  const currentHash=await targetHash(payload);
  if(current.targetRevision!==record.targetRevision || currentHash!==record.payloadHash) throw new Error('Stale approval target');
  await decideApproval(db,record.id,'APPROVED',user.email);
  assertApprovalExecutable({...record,status:'APPROVED',consumedAt:null},payload);
  const merged=await github.mergePull(record.targetId,record.targetRevision);
  await consumeApproval(db,record.id);
  return {ok:true,executed:true,merged:!!merged?.merged,message:merged?.message||'Merge dispatched'};
}

export async function onRequestPost(context){
  try{
    const user=await requireAuthorizedUser(context,context.env); requireSameOrigin(context.request); const body=await parseJson(context.request); assertExactFields(body,['decision'],['decision']);
    await ensureControlSchema(context.env.CONTROL_DB);
    const record=await getApproval(context.env.CONTROL_DB,context.params.id); const github=createGitHubAdapter({token:context.env.GITHUB_TOKEN});
    const result=await executeApprovalDecision({record,decision:body.decision,user,db:context.env.CONTROL_DB,github});
    await writeAudit(context.env.CONTROL_DB,{timestamp:new Date().toISOString(),actor:user.email,agentId:record.agentId,action:record.action,targetType:record.targetType,targetId:record.targetId,targetRevision:record.targetRevision,autonomy:record.action==='REVIEW_RESULT'?'YELLOW':'RED',result:body.decision==='APPROVE'?(record.action==='REVIEW_RESULT'?'review-approved':'approved-executed'):'rejected',approvalId:record.id,githubPrNumber:Number(record.targetId)});
    return jsonResponse(result);
  }catch(error){ return errorResponse(error); }
}
