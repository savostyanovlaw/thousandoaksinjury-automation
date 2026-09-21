import { loadRegistry } from '../../../lib/registry.js';
import { requireAuthorizedUser } from '../../../lib/auth.js';
import { createGitHubAdapter } from '../../../lib/github.js';
import { buildDashboardState } from '../../../lib/state.js';
import { listPendingApprovals, ensureRunReviewApproval, ensureControlSchema } from '../../../lib/approval-store.js';
import { targetHash } from '../../../lib/approvals.js';
import { errorResponse, jsonResponse } from '../../../lib/http.js';
import { listAuditEvents } from '../../../lib/audit.js';
import { listRemediationJobs } from '../../../lib/remediation-store.js';

export async function loadOptionalControlState({loadApprovals,loadAudit,loadRemediation=async()=>[]}){
  const degradedSources=[];
  const [approvalsResult,auditResult,remediationResult]=await Promise.allSettled([loadApprovals(),loadAudit(),loadRemediation()]);
  let pendingApprovals=[];
  let auditEvents=[];
  let remediationJobs=[];
  if(approvalsResult.status==='fulfilled') pendingApprovals=approvalsResult.value;
  else degradedSources.push('approvals');
  if(auditResult.status==='fulfilled') auditEvents=auditResult.value;
  else degradedSources.push('audit');
  if(remediationResult.status==='fulfilled') remediationJobs=remediationResult.value;
  else degradedSources.push('remediation');
  return {pendingApprovals,auditEvents,remediationJobs,degraded:degradedSources.length>0,degradedSources};
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
        loadRemediation:()=>listRemediationJobs(context.env.CONTROL_DB)
      }),
      loadGitHubDiagnostics(github)
    ]);
    // Reconcile successful workflow runs into the owner review queue.
    // Presentation decides whether a result is actionable; execution remains approval-gated.
    // This is review-only: approving a result never publishes or executes it.
    for(const agent of agents){
      const wf=await github.getWorkflowState(agent);
      const run=wf?.lastRun;
      if(wf?.lastSuccess && run?.id){
        const payload={agentId:agent.id,action:'REVIEW_RESULT',targetType:'workflow_run',targetId:String(run.id),targetRevision:String(run.id)};
        await ensureRunReviewApproval(context.env.CONTROL_DB,{...payload,id:crypto.randomUUID(),payloadHash:await targetHash(payload),status:'PENDING',createdAt:run.createdAt||new Date().toISOString()});
      }
    }
    const reconciledApprovals=await listPendingApprovals(context.env.CONTROL_DB);
    const state=await buildDashboardState({agents,github,pendingApprovals:reconciledApprovals,auditEvents:optional.auditEvents});
    state.githubDiagnostics=githubDiagnostics;
    state.remediationJobs=optional.remediationJobs;
    if(optional.degraded){
      state.stale=true;
      state.degradedSources=optional.degradedSources;
    }
    return jsonResponse(state);
  }catch(error){ return errorResponse(error); }
}
