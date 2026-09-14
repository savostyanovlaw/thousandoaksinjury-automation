import { requireAuthorizedUser } from '../../../../lib/auth.js';
import { createGitHubAdapter } from '../../../../lib/github.js';
import { errorResponse, jsonResponse } from '../../../../lib/http.js';

function safeMessage(value){
  return typeof value==='string' ? value.trim().slice(0,160) : '';
}

export function safeDiagnostic(input={}){
  const result={
    configured:input.configured===true,
    authStatus:Number(input.authStatus||0),
    repoStatus:Number(input.repoStatus||0),
    workflowStatus:Number(input.workflowStatus||0)
  };
  const authMessage=safeMessage(input.authMessage);
  const repoMessage=safeMessage(input.repoMessage);
  const workflowMessage=safeMessage(input.workflowMessage);
  if(authMessage) result.authMessage=authMessage;
  if(repoMessage) result.repoMessage=repoMessage;
  if(workflowMessage) result.workflowMessage=workflowMessage;
  return result;
}

export async function onRequestGet(context){
  try{
    await requireAuthorizedUser(context,context.env);
    const github=createGitHubAdapter({token:context.env.GITHUB_TOKEN});
    const result=await github.diagnoseCredential('technical-seo-watchdog.yml');
    return jsonResponse(safeDiagnostic(result));
  }catch(error){
    return errorResponse(error);
  }
}
