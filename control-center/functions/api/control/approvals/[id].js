import { requireAuthorizedUser } from '../../../../lib/auth.js';
import { createGitHubAdapter } from '../../../../lib/github.js';
import { targetHash, assertApprovalExecutable } from '../../../../lib/approvals.js';
import { getApproval, decideApproval, consumeApproval, ensureControlSchema } from '../../../../lib/approval-store.js';
import { writeAudit } from '../../../../lib/audit.js';
import { createRemediationJob, updateRemediationJob } from '../../../../lib/remediation-store.js';
import { classifyFindingType } from '../../../../lib/autonomy.js';
import { assertExactFields, errorResponse, jsonResponse, parseJson, requireSameOrigin } from '../../../../lib/http.js';

// Which agents' scripts already accept a change_request/revision pair (see
// e.g. scripts/russian_language_robot.py's localize()) and which real
// workflow to redispatch with the owner's feedback plus every real field the
// prior review already carried. An agent not listed here still gets its
// CHANGES_REQUESTED decision recorded and audited correctly (the approval is
// terminal, never re-approvable) -- it just does not yet get an automatic
// revision redispatch, which is honest: never claim to have re-run an agent
// that has no revision-aware code path yet.
function buildRevisionDispatch(agentId,rr,feedback){
  if(agentId==='russian-language-robot'){
    const nextRevision=Number(rr?.localizationRevision||1)+1;
    return {workflow:'russian-language-robot',inputs:{
      source_id:String(rr?.sourceId||''),
      source_revision:String(rr?.sourceRevision||''),
      title:String(rr?.sourceTitle||''),
      body:String(rr?.sourceBody||''),
      localized_title:String(rr?.localizedTitle||''),
      localized_body:String(rr?.localizedBody||''),
      qa_issues_json:JSON.stringify(Array.isArray(rr?.qaIssues)?rr.qaIssues:[]),
      change_request:feedback,
      localization_revision:String(nextRevision)
    }};
  }
  return null;
}

export async function executeApprovalDecision({record,decision,user,db,github,feedback}){
  if(!record) throw new Error('Approval not found');
  if(record.status!=='PENDING') throw new Error('Approval is stale or already decided');
  if(decision==='REJECT'){
    const decided=await decideApproval(db,record.id,'REJECTED',user.email);
    return {ok:true,executed:false,...decided};
  }
  if(decision==='REQUEST_CHANGES'){
    if(record.targetType!=='workflow_run' || record.action!=='REVIEW_RESULT') throw new Error('Request changes is only supported for review results');
    const trimmedFeedback=String(feedback||'').trim();
    if(!trimmedFeedback) throw new Error('Feedback is required to request changes');
    // Claimed FIRST, same as APPROVE below: CHANGES_REQUESTED is terminal
    // for this row (decideApproval only ever succeeds once per approval,
    // via its own WHERE status='PENDING' guard) -- it can never be
    // re-decided or executed later. A revision redispatch, if any, creates
    // a brand-new GitHub Actions run and therefore a brand-new approval row
    // through the existing ingest pipeline; the original review the owner
    // saw is never mutated.
    const decided=await decideApproval(db,record.id,'CHANGES_REQUESTED',user.email,{feedback:trimmedFeedback});
    try{
      const review=await github.getWorkflowRunReview(record.targetId);
      const revisionDispatch=buildRevisionDispatch(record.agentId,review?.reviewResult||{},trimmedFeedback);
      if(!revisionDispatch) return {ok:true,executed:false,redispatched:false,...decided};
      await github.dispatchAgentRevision(revisionDispatch);
      return {ok:true,executed:false,redispatched:true,...decided};
    }catch(error){
      return {ok:false,executed:false,failed:true,error:String(error?.message||error).slice(0,300),...decided};
    }
  }
  if(decision!=='APPROVE') throw new Error('Invalid decision');
  if(record.targetType==='workflow_run' && record.action==='REVIEW_RESULT'){
    // Claim the approval FIRST with the same atomic PENDING -> APPROVED
    // update used for RED merges below (decideApproval only succeeds once,
    // ever, per approval id). Every side effect that follows -- remediation
    // job creation and dispatch -- only happens after that claim succeeds,
    // so a double-click or a retried request can create/dispatch
    // remediation for a given approval at most once, matching the same
    // claim-then-act pattern used elsewhere in this file.
    const decided=await decideApproval(db,record.id,'APPROVED',user.email);
    // Past this point the approval is already claimed: nothing below may
    // throw and skip the caller's audit write. Any failure -- including one
    // fetching the review itself, not just an individual remediation
    // dispatch -- is returned as a structured failed result instead, so the
    // decision is always audited even when execution could not complete.
    try{
      const review=await github.getWorkflowRunReview(record.targetId);
      const r=review?.reviewResult||{};
      // Different agents' real reports use different real array field names
      // for their per-item results: opportunity-finder emits "findings"
      // (items keyed by "type"), while Technical SEO Watchdog emits
      // "failures" (items keyed by "check", from its Failure dataclass).
      // Checking only "findings" silently collapsed every Watchdog report
      // -- however many real failures it actually found -- into a single
      // generic pseudo-item, which defeated the whole point of routing each
      // finding to its own remediation job.
      const findings=Array.isArray(r.findings)?r.findings:(Array.isArray(r.failures)?r.failures:[]);
      const actionable=findings.length?findings:[r];
      const jobs=[];
      const route=(type)=>({
        title:'technical-seo-fixer',meta_description:'technical-seo-fixer',canonical:'technical-seo-fixer',
        broken_link:'technical-seo-fixer',redirect:'technical-seo-fixer',sitemap:'technical-seo-fixer',
        robots:'technical-seo-fixer',schema:'technical-seo-fixer',structured_data:'technical-seo-fixer',
        content_stale:'content-refresher'
      }[String(type||'').toLowerCase()]|| (record.agentId==='technical-seo-watchdog'?'technical-seo-fixer':null));
      // Every actionable finding in the approved report gets its own
      // remediation job -- a multi-finding report must remediate all of its
      // findings, not just the first (remediation_jobs.owner_approval_id is
      // no longer UNIQUE; see remediation-store.js).
      for(const item of actionable){
        const type=item?.findingType||item?.type||item?.check||item?.code||'general';
        const summary=String(item?.summary||item?.evidence||item?.title||item?.message||r?.title||'Approved agent finding').slice(0,1000);
        const recommendedAction=String(item?.recommendedAction||item?.recommended_fix||item?.recommendation||r?.recommendation||'Prepare a repository-level fix for owner review.').slice(0,1000);
        const remediationAgentId=route(type);
        const autonomy=classifyFindingType(type);
        const job={id:crypto.randomUUID(),sourceAgentId:record.agentId,sourceRunId:String(record.targetId),ownerApprovalId:record.id,findingType:String(type),summary,recommendedAction,rawFinding:item||{},remediationAgentId,autonomy,createdAt:new Date().toISOString()};
        await createRemediationJob(db,job);
        if(!remediationAgentId){
          await updateRemediationJob(db,job.id,'BLOCKED');
          jobs.push({...job,status:'BLOCKED'});
          continue;
        }
        // A transient dispatch failure (GitHub/network) must not lose the
        // finding or corrupt the approval: the job lands in a clear terminal
        // FAILED state with the error recorded, instead of throwing and
        // abandoning the remaining findings in this same approval.
        try{
          await github.dispatchRemediation(job);
          await updateRemediationJob(db,job.id,'DISPATCHED');
          jobs.push({...job,status:'DISPATCHED'});
        }catch(error){
          await updateRemediationJob(db,job.id,'FAILED');
          jobs.push({...job,status:'FAILED',error:String(error?.message||error).slice(0,300)});
        }
      }
      return {ok:true,executed:false,reviewAccepted:true,remediationJobs:jobs,...decided};
    }catch(error){
      return {ok:false,executed:false,failed:true,error:String(error?.message||error).slice(0,300),...decided};
    }
  }
  if(record.targetType!=='pull_request' || record.action!=='MERGE_PR') throw new Error('Unsupported RED action');
  const current=await github.getPullRevision(record.targetId);
  const payload={agentId:record.agentId,action:record.action,targetType:record.targetType,targetId:String(record.targetId),targetRevision:String(current.targetRevision)};
  const currentHash=await targetHash(payload);
  if(current.targetRevision!==record.targetRevision || currentHash!==record.payloadHash) throw new Error('Stale approval target');
  const decided=await decideApproval(db,record.id,'APPROVED',user.email);
  // As above: the claim already happened, so a failed merge must come back
  // as a result the caller can audit, not an exception that skips it. The
  // approval is left APPROVED-but-unconsumed on failure -- a deliberate,
  // observable "stuck" state (surfaced by the Agent Orchestrator) rather
  // than a silent retry, since the underlying PR may itself need attention
  // before a fresh approval cycle can safely execute.
  try{
    assertApprovalExecutable({...record,status:'APPROVED',consumedAt:null},payload);
    const merged=await github.mergePull(record.targetId,record.targetRevision);
    await consumeApproval(db,record.id);
    return {ok:true,executed:true,merged:!!merged?.merged,message:merged?.message||'Merge dispatched'};
  }catch(error){
    return {ok:false,executed:false,failed:true,error:String(error?.message||error).slice(0,300),...decided};
  }
}

// Shared by the human-facing HTTP route below and by the automatic
// GREEN-report trigger (lib/auto-remediate.js), so both paths execute and
// audit through the exact same code -- an autonomous decision is not a
// different, lighter-weight code path than a human one, only a different
// actor string.
export async function applyApprovalDecision({record,decision,actor,db,github,feedback}){
  const result=await executeApprovalDecision({record,decision,user:{email:actor},db,github,feedback});
  // A structured {failed:true} result still means the approval WAS
  // claimed (decideApproval already succeeded inside
  // executeApprovalDecision) -- it must be audited as a failed execution,
  // never silently dropped, so the owner has a durable record of exactly
  // what was approved and that its execution did not complete.
  const auditResult=decision==='REJECT'
    ? 'rejected'
    : decision==='REQUEST_CHANGES'
      ? (result.failed?'changes-requested-redispatch-failed':(result.redispatched?'changes-requested':'changes-requested-no-redispatch'))
      : result.failed
        ? (record.action==='REVIEW_RESULT'?'review-approved-with-errors':'approved-execution-failed')
        : (record.action==='REVIEW_RESULT'?'review-approved':'approved-executed');
  await writeAudit(db,{timestamp:new Date().toISOString(),actor,agentId:record.agentId,action:record.action,targetType:record.targetType,targetId:record.targetId,targetRevision:record.targetRevision,autonomy:record.action==='REVIEW_RESULT'?'YELLOW':'RED',result:auditResult,approvalId:record.id,githubPrNumber:Number(record.targetId)});
  return result;
}

export async function onRequestPost(context){
  try{
    const user=await requireAuthorizedUser(context,context.env); requireSameOrigin(context.request); const body=await parseJson(context.request); assertExactFields(body,['decision','feedback'],['decision']);
    await ensureControlSchema(context.env.CONTROL_DB);
    const record=await getApproval(context.env.CONTROL_DB,context.params.id); const github=createGitHubAdapter({token:context.env.GITHUB_TOKEN});
    const result=await applyApprovalDecision({record,decision:body.decision,actor:user.email,db:context.env.CONTROL_DB,github,feedback:body.feedback});
    return jsonResponse(result);
  }catch(error){ return errorResponse(error); }
}
