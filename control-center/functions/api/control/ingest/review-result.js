import { loadRegistry } from '../../../../lib/registry.js';
import { requireGithubActionsAuth } from '../../../../lib/github-oidc.js';
import { ensureRunReviewApproval, ensureControlSchema, claimCommandIdempotency } from '../../../../lib/approval-store.js';
import { targetHash } from '../../../../lib/approvals.js';
import { writeAudit } from '../../../../lib/audit.js';
import { createGitHubAdapter } from '../../../../lib/github.js';
import { maybeAutoRemediateGreenReport } from '../../../../lib/auto-remediate.js';
import { isNoActionReview } from '../../../../lib/autonomy.js';
import { assertExactFields, errorResponse, jsonResponse, parseJson } from '../../../../lib/http.js';

// Optional fields a producing workflow may include directly in its ingest
// body, carrying the SAME review-result data it already computed locally
// (report.json is right there on disk in that job) -- these are never
// fetched live from GitHub here. This call happens from inside the
// producing workflow's own still-running job (its "Notify Control Center"
// step calls this endpoint immediately after the preceding step computed
// and printed the result), so re-fetching that same run's own job logs at
// this exact moment would race GitHub's own log-finalization for the step
// that just ran (see getWorkflowRunReview's own comment on this race,
// fixed for auto-remediation but never safe to reintroduce here). Omitting
// these fields entirely preserves the original behavior exactly: no field
// means isNoActionReview cannot affirmatively conclude "no action", so the
// approval is created exactly as it always was.
const OPTIONAL_REVIEW_SUMMARY_FIELDS = ['approvalState', 'status', 'healthy', 'findingCount', 'requiresAttorneyReview'];

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
  assertExactFields(body,['agentId','runId','createdAt',...OPTIONAL_REVIEW_SUMMARY_FIELDS],['agentId','runId']);
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
    assertExactFields(body,['agentId','runId','createdAt',...OPTIONAL_REVIEW_SUMMARY_FIELDS],['agentId','runId']);
    // The OIDC token is scoped to the exact run that minted it (GitHub sets
    // its run_id claim server-side). Requiring it to match the run id the
    // caller claims to be ingesting means a token can only ever ingest the
    // result of the run that requested it, not an arbitrary run id.
    if(String(claims.run_id)!==String(body.runId)) throw new Error('Token run id does not match request run id');
    const agents=await loadRegistry();
    await ensureControlSchema(context.env.CONTROL_DB);
    // A successful HEALTHY report with zero findings and no proposed action
    // belongs in Audit/History, not in the owner's Needs Approval queue --
    // decided ONLY from data the calling workflow already computed and
    // included directly in this body (see OPTIONAL_REVIEW_SUMMARY_FIELDS
    // above). Never fetched live here: a body that omits these fields
    // (every existing caller today) always evaluates to false, so behavior
    // is unchanged for any workflow that hasn't adopted the new fields.
    if(isNoActionReview(body)){
      // Idempotent: a retried/duplicated ingest call for the same run must
      // never write a second audit row for it.
      const claimed=await claimCommandIdempotency(context.env.CONTROL_DB,`review-result:no-action:${body.agentId}:${body.runId}`,body.agentId,'AUTO_ARCHIVE_REVIEW');
      if(claimed){
        await writeAudit(context.env.CONTROL_DB,{timestamp:new Date().toISOString(),actor:`github-actions:${claims.workflow||body.agentId}`,agentId:body.agentId,action:'REVIEW_RESULT',targetType:'workflow_run',targetId:String(body.runId),targetRevision:String(body.runId),autonomy:'GREEN',result:'auto-archived-no-action'});
      }
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
      const github=createGitHubAdapter({token:context.env.GITHUB_TOKEN});
      await maybeAutoRemediateGreenReport({approvalRow:row,db:context.env.CONTROL_DB,github});
    }
    return jsonResponse({ok:true,created:!!row},201);
  }catch(error){ return errorResponse(error); }
}
