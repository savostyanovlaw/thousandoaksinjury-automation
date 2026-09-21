import { loadRegistry } from '../../../../lib/registry.js';
import { requireIngestToken } from '../../../../lib/auth.js';
import { ensureRunReviewApproval, ensureControlSchema } from '../../../../lib/approval-store.js';
import { targetHash } from '../../../../lib/approvals.js';
import { writeAudit } from '../../../../lib/audit.js';
import { assertExactFields, errorResponse, jsonResponse, parseJson } from '../../../../lib/http.js';

// Push-based ingestion: a producing GitHub Actions workflow calls this the
// moment its run finishes, so the resulting artifact reaches persistent
// Needs Approval state without depending on a human loading the dashboard
// first (GET /api/control/state still reconciles the same way as a
// harmless, idempotent fallback for any run that predates or misses this
// call). Authenticated with a shared bearer-style token, never a browser
// session, since the caller is a GitHub Actions job.
export async function ingestReviewResult({agents,db,body,now=()=>new Date().toISOString()}){
  assertExactFields(body,['agentId','runId','createdAt'],['agentId','runId']);
  const agent=agents.find(a=>a.id===body.agentId);
  if(!agent || !agent.deployed) throw new Error('Unknown or undeployed agent');
  const payload={agentId:agent.id,action:'REVIEW_RESULT',targetType:'workflow_run',targetId:String(body.runId)};
  const row={...payload,targetRevision:String(body.runId),id:crypto.randomUUID(),payloadHash:await targetHash({...payload,targetRevision:String(body.runId)}),status:'PENDING',createdAt:body.createdAt||now()};
  return ensureRunReviewApproval(db,row);
}

export async function onRequestPost(context){
  try{
    await requireIngestToken(context,context.env);
    const body=await parseJson(context.request);
    const agents=await loadRegistry();
    await ensureControlSchema(context.env.CONTROL_DB);
    const row=await ingestReviewResult({agents,db:context.env.CONTROL_DB,body});
    if(row){
      await writeAudit(context.env.CONTROL_DB,{timestamp:new Date().toISOString(),actor:`agent:${body.agentId}`,agentId:body.agentId,action:'REVIEW_RESULT',targetType:'workflow_run',targetId:String(body.runId),targetRevision:String(body.runId),autonomy:'YELLOW',result:'ingested'});
    }
    return jsonResponse({ok:true,created:!!row},201);
  }catch(error){ return errorResponse(error); }
}
