import { loadRegistry } from '../../../lib/registry.js';
import { requireAuthorizedUser } from '../../../lib/auth.js';
import { targetHash } from '../../../lib/approvals.js';
import { insertApproval, listPendingApprovals } from '../../../lib/approval-store.js';
import { writeAudit } from '../../../lib/audit.js';
import { assertExactFields, errorResponse, jsonResponse, parseJson, requireSameOrigin } from '../../../lib/http.js';

export async function createApprovalRequest({agents,body,idFactory=()=>crypto.randomUUID(),now=()=>new Date().toISOString()}){
  assertExactFields(body,['agentId','action','targetType','targetId','targetRevision'],['agentId','action','targetType','targetId','targetRevision']);
  const agent=agents.find(a=>a.id===body.agentId);
  if(!agent || !agent.deployed) throw new Error('Agent not deployed');
  const capability=agent.commands.find(c=>c.name===body.action);
  if(!capability || capability.autonomy!=='RED') throw new Error('Action is not a registered RED capability');
  if(body.targetType!=='pull_request') throw new Error('Unsupported RED target type');
  const payload={agentId:body.agentId,action:body.action,targetType:body.targetType,targetId:String(body.targetId),targetRevision:String(body.targetRevision)};
  return {...payload,id:idFactory(),payloadHash:await targetHash(payload),status:'PENDING',createdAt:now()};
}

export async function onRequestGet(context){
  try{ await requireAuthorizedUser(context,context.env); return jsonResponse({approvals:await listPendingApprovals(context.env.CONTROL_DB)}); }
  catch(error){ return errorResponse(error); }
}

export async function onRequestPost(context){
  try{
    const user=await requireAuthorizedUser(context,context.env); requireSameOrigin(context.request);
    const body=await parseJson(context.request);
    const agents=await loadRegistry();
    const row=await createApprovalRequest({agents,body});
    await insertApproval(context.env.CONTROL_DB,row);
    await writeAudit(context.env.CONTROL_DB,{timestamp:row.createdAt,actor:user.email,agentId:row.agentId,action:row.action,targetType:row.targetType,targetId:row.targetId,targetRevision:row.targetRevision,autonomy:'RED',result:'approval-requested',approvalId:row.id});
    return jsonResponse({ok:true,approval:row},201);
  }catch(error){ return errorResponse(error); }
}
