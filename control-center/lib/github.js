const REPO='savostyanovlaw/thousandoaksinjury-automation';
function headers(token){
  const out={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
  if(typeof token==='string' && token.trim()) out.Authorization=`Bearer ${token.trim()}`;
  return out;
}
async function credentialFingerprint(token){
  if(typeof token!=='string' || !token.trim()) return {credentialPresent:false,credentialLength:0,credentialType:'none',credentialFingerprint:''};
  const value=token.trim();
  const bytes=new TextEncoder().encode(value);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  const fingerprint=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,12);
  const credentialType=value.startsWith('github_pat_')?'fine-grained':value.startsWith('ghp_')?'classic':'unknown';
  return {credentialPresent:true,credentialLength:value.length,credentialType,credentialFingerprint:fingerprint};
}
export function createGitHubAdapter({token,fetchImpl=fetch}){
  const dispatchKeys=new Set();
  const hasWriteCredential=typeof token==='string' && Boolean(token.trim());
  async function json(url,opts={}){
    const res=await fetchImpl(url,{...opts,headers:{...headers(token),...(opts.headers||{})}});
    if(!res.ok) throw new Error(`GitHub ${res.status}`);
    return res.status===204 ? null : res.json();
  }
  async function probe(url){
    try{
      const res=await fetchImpl(url,{headers:headers(token)});
      let message='';
      if(!res.ok){
        try{
          const body=await res.clone().json();
          if(typeof body?.message==='string') message=body.message.slice(0,160);
        }catch{}
      }
      const requestId=String(res.headers?.get?.('x-github-request-id')||'').slice(0,80);
      const acceptedPermissions=String(res.headers?.get?.('x-accepted-github-permissions')||'').slice(0,160);
      return {status:res.status,message,requestId,acceptedPermissions};
    }catch{return {status:0,message:'Network error'};}
  }
  function requireWriteCredential(){
    if(!hasWriteCredential) throw new Error('GitHub write credential not configured');
  }
  return {
    writeActionsAvailable:hasWriteCredential,
    async diagnoseCredential(workflow='technical-seo-watchdog.yml'){
      if(!hasWriteCredential) return {configured:false,authStatus:0,repoStatus:0,workflowStatus:0,permissionHeader:''};
      const auth=await probe('https://api.github.com/user');
      const repo=await probe(`https://api.github.com/repos/${REPO}`);
      const workflowProbe=await probe(`https://api.github.com/repos/${REPO}/actions/workflows/${encodeURIComponent(workflow)}`);
      let permissionHeader='';
      try{
        const permissionRes=await fetchImpl(`https://api.github.com/repos/${REPO}`,{headers:headers(token)});
        permissionHeader=String(permissionRes.headers?.get?.('x-oauth-scopes')||'').slice(0,160);
      }catch{}
      const fingerprint=await credentialFingerprint(token);
      const result={configured:true,authStatus:auth.status,repoStatus:repo.status,workflowStatus:workflowProbe.status,permissionHeader,...fingerprint};
      if(auth.message) result.authMessage=auth.message;
      if(auth.requestId) result.authRequestId=auth.requestId;
      if(auth.acceptedPermissions) result.authAcceptedPermissions=auth.acceptedPermissions;
      if(repo.message) result.repoMessage=repo.message;
      if(repo.requestId) result.repoRequestId=repo.requestId;
      if(repo.acceptedPermissions) result.repoAcceptedPermissions=repo.acceptedPermissions;
      if(workflowProbe.message) result.workflowMessage=workflowProbe.message;
      if(workflowProbe.requestId) result.workflowRequestId=workflowProbe.requestId;
      if(workflowProbe.acceptedPermissions) result.workflowAcceptedPermissions=workflowProbe.acceptedPermissions;
      return result;
    },
    async getWorkflowState(agent){
      if(!agent?.deployed || !agent?.workflows?.RUN_NOW) return {stale:false,lastSuccess:false,currentFailure:false,running:false,lastRun:null,recentRuns:[]};
      try{
        const data=await json(`https://api.github.com/repos/${REPO}/actions/workflows/${encodeURIComponent(agent.workflows.RUN_NOW)}/runs?per_page=10`);
        const runs=Array.isArray(data?.workflow_runs)?data.workflow_runs:[];
        const latest=runs[0]||null;
        if(!latest) return {stale:false,lastSuccess:false,currentFailure:false,running:false,lastRun:null,recentRuns:[]};
        const running=['queued','in_progress','waiting','requested','pending'].includes(latest.status);
        const currentFailure=latest.status==='completed' && !['success','neutral','skipped'].includes(latest.conclusion);
        const lastSuccess=latest.status==='completed' && latest.conclusion==='success';
        const recentRuns=runs.slice(0,10).map(run=>({id:run.id,status:run.status,conclusion:run.conclusion,createdAt:run.created_at,url:run.html_url}));
        return {stale:false,lastSuccess,currentFailure,running,lastRun:recentRuns[0],recentRuns};
      }catch(error){
        return {stale:true,lastSuccess:false,currentFailure:false,running:false,lastRun:null,recentRuns:[],error:'GitHub temporarily unavailable'};
      }
    },
    async listAgentIssues(agent){
      const marker=agent?.issueLabel || agent?.id;
      if(!marker) return [];
      try{
        const data=await json(`https://api.github.com/repos/${REPO}/issues?state=open&per_page=100`);
        return (Array.isArray(data)?data:[])
          .filter(x=>!x.pull_request)
          .filter(x=>`${x.title||''}\n${x.body||''}`.toLowerCase().includes(String(marker).toLowerCase()))
          .map(x=>({number:x.number,title:x.title,url:x.html_url,state:x.state,updatedAt:x.updated_at}));
      }catch{return [];}
    },
    async listAgentPulls(agent){
      try{
        const data=await json(`https://api.github.com/repos/${REPO}/pulls?state=open&per_page=50`);
        const needle=agent?.id||'';
        return (Array.isArray(data)?data:[]).filter(x=>`${x.title} ${x.head?.ref||''}`.toLowerCase().includes(needle.toLowerCase())).map(x=>({number:x.number,title:x.title,url:x.html_url,headSha:x.head?.sha,state:x.state}));
      }catch{return [];}
    },
    async dispatchRegisteredWorkflow(agent,command,idempotencyKey){
      requireWriteCredential();
      if(!idempotencyKey) throw new Error('Missing idempotency key');
      if(dispatchKeys.has(idempotencyKey)) throw new Error('Duplicate command');
      const workflow=agent?.workflows?.[command];
      const capability=agent?.commands?.find(c=>c.name===command);
      if(!workflow || !capability || !agent.deployed) throw new Error('Unsupported command');
      if(capability.autonomy==='RED') throw new Error('RED command requires approval');
      dispatchKeys.add(idempotencyKey);
      try{
        await json(`https://api.github.com/repos/${REPO}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:'main'})});
        return {ok:true,workflow,command};
      }catch(error){ dispatchKeys.delete(idempotencyKey); throw error; }
    },
    async getPullRevision(number){
      const data=await json(`https://api.github.com/repos/${REPO}/pulls/${Number(number)}`);
      return {targetRevision:data.head.sha,url:data.html_url,state:data.state,merged:data.merged};
    },
    async mergePull(number,expectedHeadSha){
      requireWriteCredential();
      return json(`https://api.github.com/repos/${REPO}/pulls/${Number(number)}/merge`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({sha:expectedHeadSha,merge_method:'squash'})});
    }
  };
}
