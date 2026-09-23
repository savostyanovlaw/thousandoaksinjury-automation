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
    const result=await cleanupApprovalQueue({
      db:context.env.CONTROL_DB,
      github,
      agents,
      listPendingApprovals,
      getVideoJobStatus:async(db,id)=>(await getVideoJob(db,id))?.status,
    });
    return jsonResponse(result);
  }catch(error){ return errorResponse(error); }
}
