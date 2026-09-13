import { loadRegistry } from '../../../../lib/registry.js';
import { requireAuthorizedUser } from '../../../../lib/auth.js';
import { createGitHubAdapter } from '../../../../lib/github.js';
import { buildDashboardState } from '../../../../lib/state.js';
import { listPendingApprovals } from '../../../../lib/approval-store.js';
import { errorResponse, jsonResponse } from '../../../../lib/http.js';
export async function onRequestGet(context){
  try{
    await requireAuthorizedUser(context,context.env);
    const agents=await loadRegistry(); const agent=agents.find(a=>a.id===context.params.id); if(!agent){const e=new Error('Unknown agent');e.status=404;throw e;}
    const github=createGitHubAdapter({token:context.env.GITHUB_TOKEN});
    const approvals=(await listPendingApprovals(context.env.CONTROL_DB)).filter(x=>x.agentId===agent.id);
    const state=await buildDashboardState({agents:[agent],github,pendingApprovals:approvals});
    return jsonResponse({generatedAt:state.generatedAt,agent:state.agents[0],activity:state.activity,attention:state.attention,approvals});
  }catch(error){ return errorResponse(error); }
}
