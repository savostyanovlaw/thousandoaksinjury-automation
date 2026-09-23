import { loadRegistry } from '../../../lib/registry.js';
import { requireAuthorizedUser } from '../../../lib/auth.js';
import { createGitHubAdapter } from '../../../lib/github.js';
import { buildDashboardState } from '../../../lib/state.js';
import { listPendingApprovals, listStuckApprovals, ensureRunReviewApproval, ensureControlSchema, claimCommandIdempotency } from '../../../lib/approval-store.js';
import { targetHash } from '../../../lib/approvals.js';
import { errorResponse, jsonResponse } from '../../../lib/http.js';
import { listAuditEvents, writeAudit } from '../../../lib/audit.js';
import { listRemediationJobs, listStuckRemediationJobs } from '../../../lib/remediation-store.js';
import { maybeAutoRemediateGreenReport } from '../../../lib/auto-remediate.js';
import { isNoActionReview } from '../../../lib/autonomy.js';

// A single, owner-facing label per remediation job status -- this is the
// self-healing loop's visible outcome, distinct from (and shown alongside)
// the agent-level Healthy/Running/Waiting states in buildDashboardState.
// Never a second dashboard: this only adds a field to data the Control
// Center already renders as a list.
export function remediationOwnerLabel(job){
  if(job.status==='VERIFIED') return 'Automatically Fixed';
  if(job.status==='ROLLED_BACK' || job.status==='FAILED' || job.status==='ESCALATED') return 'Failed - Needs Attention';
  if(job.status==='MERGED') return 'Recovery In Progress';
  if(job.autonomy==='GREEN' && (job.status==='QUEUED' || job.status==='DISPATCHED')) return 'Recovery In Progress';
  if(job.status==='BLOCKED') return 'Needs Attention';
  return 'Prepared - Awaiting Review';
}

export async function loadOptionalControlState({loadApprovals,loadAudit,loadRemediation=async()=>[],loadStuck=async()=>[],loadStuckRemediation=async()=>[]}){
  const degradedSources=[];
  const [approvalsResult,auditResult,remediationResult,stuckResult,stuckRemediationResult]=await Promise.allSettled([loadApprovals(),loadAudit(),loadRemediation(),loadStuck(),loadStuckRemediation()]);
  let pendingApprovals=[];
  let auditEvents=[];
  let remediationJobs=[];
  let stuckApprovals=[];
  let stuckRemediationJobs=[];
  if(approvalsResult.status==='fulfilled') pendingApprovals=approvalsResult.value;
  else degradedSources.push('approvals');
  if(auditResult.status==='fulfilled') auditEvents=auditResult.value;
  else degradedSources.push('audit');
  if(remediationResult.status==='fulfilled') remediationJobs=remediationResult.value;
  else degradedSources.push('remediation');
  if(stuckResult.status==='fulfilled') stuckApprovals=stuckResult.value;
  else degradedSources.push('stuckApprovals');
  if(stuckRemediationResult.status==='fulfilled') stuckRemediationJobs=stuckRemediationResult.value;
  else degradedSources.push('stuckRemediationJobs');
  return {pendingApprovals,auditEvents,remediationJobs,stuckApprovals,stuckRemediationJobs,degraded:degradedSources.length>0,degradedSources};
}

function safeMessage(value){
  return typeof value==='string' ? value.trim().slice(0,160) : '';
}

export async function loadGitHubDiagnostics(github){
  try{
    const result=await github.diagnoseCredential('technical-seo-watchdog.yml');
    const safe={
      configured:result?.configured===true,
      authStatus:Number(result?.authStatus||0),
      repoStatus:Number(result?.repoStatus||0),
      workflowStatus:Number(result?.workflowStatus||0),
      permissionHeader:safeMessage(result?.permissionHeader),
      credentialPresent:result?.credentialPresent===true,
      credentialLength:Number(result?.credentialLength||0),
      credentialType:safeMessage(result?.credentialType),
      credentialFingerprint:safeMessage(result?.credentialFingerprint)
    };
    const authMessage=safeMessage(result?.authMessage);
    const repoMessage=safeMessage(result?.repoMessage);
    const workflowMessage=safeMessage(result?.workflowMessage);
    if(authMessage) safe.authMessage=authMessage;
    if(repoMessage) safe.repoMessage=repoMessage;
    if(workflowMessage) safe.workflowMessage=workflowMessage;
    return safe;
  }catch{
    return {configured:false,authStatus:0,repoStatus:0,workflowStatus:0};
  }
}

export async function onRequestGet(context){
  try{
    await requireAuthorizedUser(context,context.env);
    // Self-heal rather than fail closed: a dashboard load must not 500 just
    // because schema.sql was never run by hand against this D1 database.
    // CREATE TABLE IF NOT EXISTS is idempotent and cheap on every request.
    await ensureControlSchema(context.env.CONTROL_DB);
    const agents=await loadRegistry();
    const github=createGitHubAdapter({token:context.env.GITHUB_TOKEN});
    const [optional,githubDiagnostics]=await Promise.all([
      loadOptionalControlState({
        loadApprovals:()=>listPendingApprovals(context.env.CONTROL_DB),
        loadAudit:()=>listAuditEvents(context.env.CONTROL_DB),
        loadRemediation:()=>listRemediationJobs(context.env.CONTROL_DB),
        loadStuck:()=>listStuckApprovals(context.env.CONTROL_DB),
        loadStuckRemediation:()=>listStuckRemediationJobs(context.env.CONTROL_DB)
      }),
      loadGitHubDiagnostics(github)
    ]);
    // Push ingestion is primary. Keep dashboard fallback reconciliation bounded:
    // inspect only successful runs that are not already represented in approvals.
    // This preserves missed-ingest recovery without re-reading logs for every agent
    // on every dashboard request.
    const knownRunIds=new Set(optional.pendingApprovals.filter(a=>a.action==='REVIEW_RESULT' && a.targetType==='workflow_run').map(a=>String(a.targetId)));
    for(const agent of agents){
      const wf=await github.getWorkflowState(agent);
      const run=wf?.lastRun;
      if(!wf?.lastSuccess || !run?.id || knownRunIds.has(String(run.id))) continue;
      const review=await github.getWorkflowRunReview(run.id);
      const rr=review?.reviewResult;
      const findings=Array.isArray(rr?.findings)?rr.findings:[];
      const findingCount=Number.isFinite(Number(rr?.findingCount))?Number(rr.findingCount):findings.length;
      const status=String(rr?.status||'').toUpperCase();
      const recommendation=String(rr?.recommendedAction||'').toUpperCase();
      const noAction=((status==='HEALTHY' || rr?.healthy===true) && findingCount===0 && (!recommendation || recommendation==='NO_ACTION' || recommendation==='AUTO_ARCHIVE'));
      if(noAction){
        const priorAudit=(optional.auditEvents||[]).some(e=>e.agentId===agent.id && e.action==='REVIEW_RESULT' && String(e.targetId)===String(run.id) && e.result==='auto-archived-no-action');
        if(!priorAudit) await writeAudit(context.env.CONTROL_DB,{timestamp:new Date().toISOString(),actor:'system:dashboard-reconciliation',agentId:agent.id,action:'REVIEW_RESULT',targetType:'workflow_run',targetId:String(run.id),targetRevision:String(run.id),autonomy:'GREEN',result:'auto-archived-no-action'});
        continue;
      }
      const payload={agentId:agent.id,action:'REVIEW_RESULT',targetType:'workflow_run',targetId:String(run.id),targetRevision:String(run.id)};
      const row=await ensureRunReviewApproval(context.env.CONTROL_DB,{...payload,id:crypto.randomUUID(),payloadHash:await targetHash(payload),status:'PENDING',createdAt:run.createdAt||new Date().toISOString()});
      if(row) await maybeAutoRemediateGreenReport({approvalRow:row,db:context.env.CONTROL_DB,github});
    }
    const reconciledApprovals=await listPendingApprovals(context.env.CONTROL_DB);
    const state=await buildDashboardState({agents,github,pendingApprovals:reconciledApprovals,auditEvents:optional.auditEvents});
    state.githubDiagnostics=githubDiagnostics;
    // Each remediation job carries a single owner-facing label
    // (Automatically Fixed / Recovery In Progress / Failed - Needs
    // Attention / Prepared - Awaiting Review / Needs Attention) so the
    // existing Control Center can show the self-healing loop's outcome
    // without a second dashboard or a developer-facing status string.
    state.remediationJobs=optional.remediationJobs.map(job=>({...job,ownerLabel:remediationOwnerLabel(job)}));
    // An approval stuck APPROVED-but-unconsumed means its execution failed
    // after being claimed (see executeApprovalDecision) -- a real
    // operational problem the owner should see without opening GitHub
    // Actions or querying the database directly.
    state.stuckApprovals=optional.stuckApprovals;
    if(optional.stuckApprovals.length){
      state.attention=[...state.attention,...optional.stuckApprovals.map(a=>({agentId:a.agentId,title:`${a.agentId}: approved action did not finish executing`,issues:[{number:0,title:`Stuck since ${a.decidedAt}`,url:null}]}))];
    }
    // A remediation job left MERGED/DISPATCHED past a grace period means
    // remediation-preparer.yml never reported its real outcome back (a
    // crashed or lost runner) -- a real problem, not a silent gap.
    state.stuckRemediationJobs=optional.stuckRemediationJobs;
    if(optional.stuckRemediationJobs.length){
      state.attention=[...state.attention,...optional.stuckRemediationJobs.map(j=>({agentId:j.sourceAgentId,title:`${j.sourceAgentId}: automatic remediation for ${j.findingType} did not report a final result`,issues:[{number:0,title:`Stuck in ${j.status} since ${j.updatedAt}`,url:null}]}))];
    }
    if(optional.degraded){
      state.stale=true;
      state.degradedSources=optional.degradedSources;
    }
    return jsonResponse(state);
  }catch(error){ return errorResponse(error); }
}
