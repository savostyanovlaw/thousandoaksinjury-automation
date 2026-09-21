import { requireAuthorizedUser } from '../../../../../lib/auth.js';
import { createGitHubAdapter } from '../../../../../lib/github.js';
import { getApproval, ensureControlSchema } from '../../../../../lib/approval-store.js';
import { errorResponse, jsonResponse } from '../../../../../lib/http.js';

export async function onRequestGet(context){
  try{
    await requireAuthorizedUser(context,context.env);
    await ensureControlSchema(context.env.CONTROL_DB);
    const record=await getApproval(context.env.CONTROL_DB,context.params.id);
    if(!record) throw new Error('Approval not found');
    if(record.action!=='REVIEW_RESULT' || record.targetType!=='workflow_run') throw new Error('Review result unavailable for this approval');
    const github=createGitHubAdapter({token:context.env.GITHUB_TOKEN});
    const review=await github.getWorkflowRunReview(record.targetId);
    return jsonResponse({approval:{id:record.id,agentId:record.agentId,targetId:record.targetId,targetRevision:record.targetRevision,status:record.status},...review});
  }catch(error){ return errorResponse(error); }
}
