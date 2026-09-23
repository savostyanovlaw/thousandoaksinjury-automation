import { requireAuthorizedUser } from '../../../../../lib/auth.js';
import { createGitHubAdapter } from '../../../../../lib/github.js';
import { getApproval, ensureControlSchema } from '../../../../../lib/approval-store.js';
import { getVideoJob } from '../../../../../lib/video-store.js';
import { errorResponse, jsonResponse } from '../../../../../lib/http.js';

export async function onRequestGet(context){
  try{
    await requireAuthorizedUser(context,context.env);
    await ensureControlSchema(context.env.CONTROL_DB);
    const record=await getApproval(context.env.CONTROL_DB,context.params.id);
    if(!record) throw new Error('Approval not found');
    const approval={id:record.id,agentId:record.agentId,targetId:record.targetId,targetRevision:record.targetRevision,status:record.status};
    if(record.targetType==='video_job' && record.action==='PUBLISH_VIDEO'){
      const job=await getVideoJob(context.env.CONTROL_DB,record.targetId);
      if(!job) throw new Error('Video job not found');
      // Shaped exactly like a workflow-run reviewResult so the existing
      // owner-facing renderer (which already understands script/videoUrl/
      // status generically) needs no video-specific frontend branch.
      return jsonResponse({approval,artifacts:[],reviewResult:{
        agent:'video-engine',status:job.status,title:job.title,script:job.script,
        videoUrl:job.videoUrl,findingCount:0,requiresAttorneyReview:true
      }});
    }
    if(record.action!=='REVIEW_RESULT' || record.targetType!=='workflow_run') throw new Error('Review result unavailable for this approval');
    const github=createGitHubAdapter({token:context.env.GITHUB_TOKEN});
    const review=await github.getWorkflowRunReview(record.targetId);
    return jsonResponse({approval,...review});
  }catch(error){ return errorResponse(error); }
}
