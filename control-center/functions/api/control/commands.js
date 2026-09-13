import { loadRegistry } from '../../../lib/registry.js';
import { requireAuthorizedUser } from '../../../lib/auth.js';
import { createGitHubAdapter } from '../../../lib/github.js';
import { assertExactFields, errorResponse, jsonResponse, parseJson } from '../../../lib/http.js';
import { claimCommandIdempotency } from '../../../lib/approval-store.js';
import { writeAudit } from '../../../lib/audit.js';

export async function executeCommand({agents,github,body}){
  assertExactFields(body,['agentId','command','idempotencyKey'],['agentId','command','idempotencyKey']);
  const agent=agents.find(a=>a.id===body.agentId);
  if(!agent) throw new Error('Unknown agent');
  if(!agent.deployed) throw new Error('Agent not deployed');
  const capability=agent.commands.find(c=>c.name===body.command);
  if(!capability) throw new Error('Unsupported command');
  if(capability.autonomy==='RED') throw new Error('RED command requires approval');
  return github.dispatchRegisteredWorkflow(agent,body.command,body.idempotencyKey);
}
export async function onRequestPost(context){
  try{
    const user=await requireAuthorizedUser(context,context.env);
    const body=await parseJson(context.request);
    assertExactFields(body,['agentId','command','idempotencyKey'],['agentId','command','idempotencyKey']);
    const agents=await loadRegistry();
    const agent=agents.find(a=>a.id===body.agentId);
    if(!agent) throw new Error('Unknown agent');
    if(!agent.deployed) throw new Error('Agent not deployed');
    const capability=agent.commands.find(c=>c.name===body.command);
    if(!capability) throw new Error('Unsupported command');
    if(capability.autonomy==='RED') throw new Error('RED command requires approval');
    const claimed=await claimCommandIdempotency(context.env.CONTROL_DB,body.idempotencyKey,body.agentId,body.command);
    if(!claimed){ const e=new Error('Duplicate command'); e.status=409; throw e; }
    const github=createGitHubAdapter({token:context.env.GITHUB_TOKEN});
    const result=await github.dispatchRegisteredWorkflow(agent,body.command,body.idempotencyKey);
    await writeAudit(context.env.CONTROL_DB,{timestamp:new Date().toISOString(),actor:user.email,agentId:body.agentId,action:body.command,autonomy:capability.autonomy,result:'dispatched'});
    return jsonResponse({ok:true,result});
  }catch(error){ return errorResponse(error); }
}
