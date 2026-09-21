import { requireGithubActionsAuth } from '../../../../lib/github-oidc.js';
import { ensureControlSchema } from '../../../../lib/approval-store.js';
import { getRemediationJob, updateRemediationJob, incrementRemediationAttempt } from '../../../../lib/remediation-store.js';
import { writeAudit } from '../../../../lib/audit.js';
import { assertExactFields, errorResponse, jsonResponse, parseJson } from '../../../../lib/http.js';

const TERMINAL_STATUSES = new Set(['VERIFIED', 'FAILED', 'ROLLED_BACK']);

// The GREEN closed loop's final step: remediation-preparer.yml calls this
// itself, the moment it knows the real outcome of merging and verifying an
// autonomous fix, using the exact same GitHub Actions OIDC identity token
// pattern as the review-result ingest endpoint -- no shared secret, and a
// token scoped to (and checked against) the exact run that reports it, so
// one run's report can never be replayed as another's.
export async function ingestRemediationResult({db,body}){
  assertExactFields(body,['jobId','runId','status','prNumber','mergedSha','error'],['jobId','runId','status']);
  if(!TERMINAL_STATUSES.has(body.status)) throw new Error(`Unsupported remediation result status: ${body.status}`);
  const job=await getRemediationJob(db,body.jobId);
  if(!job) throw new Error('Remediation job not found');
  await incrementRemediationAttempt(db,job.id);
  await updateRemediationJob(db,job.id,body.status,{
    workflowRunId:String(body.runId),
    pullRequestNumber:body.prNumber?Number(body.prNumber):null,
    pullRequestRevision:body.mergedSha||null,
    error:body.error||null,
    verifiedAt:body.status==='VERIFIED'?new Date().toISOString():null
  });
  return job;
}

export async function onRequestPost(context){
  try{
    const claims=await requireGithubActionsAuth(context.request);
    const body=await parseJson(context.request);
    // As with review-result ingestion: the token is scoped to the exact
    // remediation-preparer.yml run that minted it, so it can only ever
    // report the outcome of that same run, not an arbitrary job id.
    if(String(claims.run_id)!==String(body.runId)) throw new Error('Token run id does not match request run id');
    await ensureControlSchema(context.env.CONTROL_DB);
    const job=await ingestRemediationResult({db:context.env.CONTROL_DB,body});
    // The full evidence trail (what triggered this, which agent, why GREEN,
    // what changed, whether it was verified, whether it was rolled back) is
    // already durable on the remediation_jobs row itself (finding_type,
    // summary, recommended_action, raw_finding_json, autonomy). This audit
    // entry is the timeline record of the autonomous decision's outcome.
    await writeAudit(context.env.CONTROL_DB,{
      timestamp:new Date().toISOString(),
      actor:`github-actions:${claims.workflow||'remediation-preparer'}`,
      agentId:job.sourceAgentId,
      action:'AUTO_REMEDIATION',
      targetType:'remediation_job',
      targetId:job.id,
      targetRevision:body.mergedSha||job.sourceRunId,
      autonomy:'GREEN',
      result:body.status==='VERIFIED'?'auto-verified':body.status==='ROLLED_BACK'?'auto-rolled-back':'auto-execution-failed',
      githubRunId:String(body.runId),
      githubPrNumber:body.prNumber?Number(body.prNumber):undefined,
      findingType:job.findingType,
      mergedSha:body.mergedSha||undefined,
      errorText:body.error||undefined
    });
    return jsonResponse({ok:true,jobId:job.id,status:body.status},200);
  }catch(error){ return errorResponse(error); }
}
