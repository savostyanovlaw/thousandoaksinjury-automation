import { requireGithubActionsAuth, MAINTENANCE_AUDIENCE } from '../../../../lib/github-oidc.js';
import { ensureControlSchema, listPendingApprovals } from '../../../../lib/approval-store.js';
import { loadRegistry } from '../../../../lib/registry.js';
import { createGitHubAdapter } from '../../../../lib/github.js';
import { cleanupApprovalQueue } from '../../../../lib/queue-cleanup.js';
import { getVideoJob } from '../../../../lib/video-store.js';
import { errorResponse, jsonResponse } from '../../../../lib/http.js';

// The one-time (but safely re-runnable) historical cleanup: re-derives the
// real no-action/duplicate/legacy classification for every currently
// PENDING approval, including re-fetching each run's own review data from
// GitHub where needed (see queue-cleanup.js's own comments). This is the
// expensive pass -- called explicitly via GitHub Actions (Control Center
// Maintenance workflow, authenticated with a dedicated OIDC audience so an
// ingest-scoped token can never trigger it), never on an ordinary dashboard
// load (state.js's own cheap, always-on pass covers the common case there).
export async function onRequestPost(context){
  try{
    await requireGithubActionsAuth(context.request,{audience:MAINTENANCE_AUDIENCE});
    await ensureControlSchema(context.env.CONTROL_DB);
    const agents=await loadRegistry();
    const github=createGitHubAdapter({token:context.env.GITHUB_TOKEN});
    // skipFetchTargetIds: optional list of workflow_run target_ids the
    // caller already fetched successfully earlier in the same maintenance
    // run (see queue-cleanup.js). A single Worker invocation cannot fetch
    // every PENDING approval's review data in a large queue, so the
    // maintenance workflow loops this call, accumulating this list itself,
    // so each call's limited subrequest budget reaches approvals no earlier
    // call in the same run has already resolved instead of re-spending it
    // on the same early ones every time.
    let skipFetchTargetIds;
    try{ const body=await context.request.json(); skipFetchTargetIds=Array.isArray(body?.skipFetchTargetIds)?body.skipFetchTargetIds:undefined; }catch{ skipFetchTargetIds=undefined; }
    const result=await cleanupApprovalQueue({
      db:context.env.CONTROL_DB,
      github,
      agents,
      listPendingApprovals,
      getVideoJobStatus:async(db,id)=>(await getVideoJob(db,id))?.status,
      skipFetchTargetIds,
    });
    return jsonResponse(result);
  }catch(error){ return errorResponse(error); }
}
