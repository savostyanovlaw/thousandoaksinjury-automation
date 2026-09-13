import { loadRegistry } from '../../../lib/registry.js';
import { requireAuthorizedUser } from '../../../lib/auth.js';
import { createGitHubAdapter } from '../../../lib/github.js';
import { buildDashboardState } from '../../../lib/state.js';
import { listPendingApprovals } from '../../../lib/approval-store.js';
import { errorResponse, jsonResponse } from '../../../lib/http.js';
export async function onRequestGet(context){
  try{
    await requireAuthorizedUser(context,context.env);
    const agents=await loadRegistry();
    const github=createGitHubAdapter({token:context.env.GITHUB_TOKEN});
    const pendingApprovals=await listPendingApprovals(context.env.CONTROL_DB);
    return jsonResponse(await buildDashboardState({agents,github,pendingApprovals}));
  }catch(error){ return errorResponse(error); }
}
