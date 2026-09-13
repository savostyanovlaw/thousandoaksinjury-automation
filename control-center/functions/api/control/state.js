import { loadRegistry } from '../../../lib/registry.js';
import { requireAuthorizedUser } from '../../../lib/auth.js';
import { createGitHubAdapter } from '../../../lib/github.js';
import { buildDashboardState } from '../../../lib/state.js';
import { listPendingApprovals } from '../../../lib/approval-store.js';
import { errorResponse, jsonResponse } from '../../../lib/http.js';
import { listAuditEvents } from '../../../lib/audit.js';
export async function onRequestGet(context){
  try{
    await requireAuthorizedUser(context,context.env);
    const agents=await loadRegistry();
    const github=createGitHubAdapter({token:context.env.GITHUB_TOKEN});
    const [pendingApprovals,auditEvents]=await Promise.all([listPendingApprovals(context.env.CONTROL_DB),listAuditEvents(context.env.CONTROL_DB)]);
    return jsonResponse(await buildDashboardState({agents,github,pendingApprovals,auditEvents}));
  }catch(error){ return errorResponse(error); }
}
