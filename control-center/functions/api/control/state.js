import { loadRegistry } from '../../../lib/registry.js';
import { requireAuthorizedUser } from '../../../lib/auth.js';
import { createGitHubAdapter } from '../../../lib/github.js';
import { buildDashboardState } from '../../../lib/state.js';
import { listPendingApprovals } from '../../../lib/approval-store.js';
import { errorResponse, jsonResponse } from '../../../lib/http.js';
import { listAuditEvents } from '../../../lib/audit.js';

export async function loadOptionalControlState({loadApprovals,loadAudit}){
  const degradedSources=[];
  const [approvalsResult,auditResult]=await Promise.allSettled([loadApprovals(),loadAudit()]);
  let pendingApprovals=[];
  let auditEvents=[];
  if(approvalsResult.status==='fulfilled') pendingApprovals=approvalsResult.value;
  else degradedSources.push('approvals');
  if(auditResult.status==='fulfilled') auditEvents=auditResult.value;
  else degradedSources.push('audit');
  return {pendingApprovals,auditEvents,degraded:degradedSources.length>0,degradedSources};
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
      workflowStatus:Number(result?.workflowStatus||0)
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
    const agents=await loadRegistry();
    const github=createGitHubAdapter({token:context.env.GITHUB_TOKEN});
    const [optional,githubDiagnostics]=await Promise.all([
      loadOptionalControlState({
        loadApprovals:()=>listPendingApprovals(context.env.CONTROL_DB),
        loadAudit:()=>listAuditEvents(context.env.CONTROL_DB)
      }),
      loadGitHubDiagnostics(github)
    ]);
    const state=await buildDashboardState({agents,github,pendingApprovals:optional.pendingApprovals,auditEvents:optional.auditEvents});
    state.githubDiagnostics=githubDiagnostics;
    if(optional.degraded){
      state.stale=true;
      state.degradedSources=optional.degradedSources;
    }
    return jsonResponse(state);
  }catch(error){ return errorResponse(error); }
}
