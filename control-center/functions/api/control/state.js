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

export async function onRequestGet(context){
  try{
    await requireAuthorizedUser(context,context.env);
    const agents=await loadRegistry();
    const github=createGitHubAdapter({token:context.env.GITHUB_TOKEN});
    const optional=await loadOptionalControlState({
      loadApprovals:()=>listPendingApprovals(context.env.CONTROL_DB),
      loadAudit:()=>listAuditEvents(context.env.CONTROL_DB)
    });
    const state=await buildDashboardState({agents,github,pendingApprovals:optional.pendingApprovals,auditEvents:optional.auditEvents});
    if(optional.degraded){
      state.stale=true;
      state.degradedSources=optional.degradedSources;
    }
    return jsonResponse(state);
  }catch(error){ return errorResponse(error); }
}
