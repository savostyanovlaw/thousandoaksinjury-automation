import { loadRegistry } from '../../../../lib/registry.js';
import { requireGithubActionsAuth } from '../../../../lib/github-oidc.js';
import { ensureRunReviewApproval, ensureControlSchema } from '../../../../lib/approval-store.js';
import { targetHash } from '../../../../lib/approvals.js';
import { writeAudit } from '../../../../lib/audit.js';
import { createGitHubAdapter } from '../../../../lib/github.js';
import { maybeAutoRemediateGreenReport } from '../../../../lib/auto-remediate.js';
import { assertExactFields, errorResponse, jsonResponse, parseJson } from '../../../../lib/http.js';

// Push-based ingestion: a producing GitHub Actions workflow calls this the
// moment its run finishes, so the resulting artifact reaches persistent
// Needs Approval state without depending on a human loading the dashboard
// first (GET /api/control/state still reconciles the same way as a
// harmless, idempotent fallback for any run that predates or misses this
// call). Authenticated with GitHub's own OIDC identity token, never a
// browser session and never a shared secret: no credential is created,
// stored, or synchronized on either side, and Cloudflare has nothing to
// rebind after a Cloudflare-side configuration change.
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
    const claims=await requireGithubActionsAuth(context.request);
    const body=await parseJson(context.request);
    // The OIDC token is scoped to the exact run that minted it (GitHub sets
    // its run_id claim server-side). Requiring it to match the run id the
    // caller claims to be ingesting means a token can only ever ingest the
    // result of the run that requested it, not an arbitrary run id.
    if(String(claims.run_id)!==String(body.runId)) throw new Error('Token run id does not match request run id');
    const agents=await loadRegistry();
    await ensureControlSchema(context.env.CONTROL_DB);
    // Read the producing run before creating an approval. A successful HEALTHY
    // report with zero findings and no proposed action belongs in Audit/History,
    // not in the owner's Needs Approval queue.
    const github=createGitHubAdapter({token:context.env.GITHUB_TOKEN});
    const review=await github.getWorkflowRunReview(body.runId);
    const rr=review?.reviewResult;
    const findings=Array.isArray(rr?.findings)?rr.findings:[];
    const findingCount=Number.isFinite(Number(rr?.findingCount))?Number(rr.findingCount):findings.length;
    const status=String(rr?.status||'').toUpperCase();
    const recommendation=String(rr?.recommendedAction||'').toUpperCase();
    const noAction=(status==='HEALTHY' && findingCount===0 && (!recommendation || recommendation==='NO_ACTION' || recommendation==='AUTO_ARCHIVE'));
    if(noAction){
      await writeAudit(context.env.CONTROL_DB,{timestamp:new Date().toISOString(),actor:`github-actions:${claims.workflow||body.agentId}`,agentId:body.agentId,action:'REVIEW_RESULT',targetType:'workflow_run',targetId:String(body.runId),targetRevision:String(body.runId),autonomy:'GREEN',result:'auto-archived-no-action'});
      return jsonResponse({ok:true,created:false,autoArchived:true},201);
    }
    const row=await ingestReviewResult({agents,db:context.env.CONTROL_DB,body});
    if(row){
      await writeAudit(context.env.CONTROL_DB,{timestamp:new Date().toISOString(),actor:`github-actions:${claims.workflow||body.agentId}`,agentId:body.agentId,action:'REVIEW_RESULT',targetType:'workflow_run',targetId:String(body.runId),targetRevision:String(body.runId),autonomy:'YELLOW',result:'ingested'});
      // A newly-created approval (never a re-ingest of a run already
      // processed) is the one moment to check whether every finding in it
      // is GREEN-eligible and, if so, execute it automatically -- see
      // lib/auto-remediate.js. Anything not fully green is left exactly as
      // before: a normal PENDING approval waiting for the owner.
      await maybeAutoRemediateGreenReport({approvalRow:row,db:context.env.CONTROL_DB,github});
    }
    return jsonResponse({ok:true,created:!!row},201);
  }catch(error){ return errorResponse(error); }
}
