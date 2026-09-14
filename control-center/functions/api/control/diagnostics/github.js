import { requireAuthorizedUser } from '../../../../lib/auth.js';
import { createGitHubAdapter } from '../../../../lib/github.js';
import { errorResponse, jsonResponse } from '../../../../lib/http.js';

export function safeDiagnostic(input={}){
  return {
    configured:input.configured===true,
    authStatus:Number(input.authStatus||0),
    repoStatus:Number(input.repoStatus||0),
    workflowStatus:Number(input.workflowStatus||0)
  };
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
