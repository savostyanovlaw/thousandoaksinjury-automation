const REPO='savostyanovlaw/thousandoaksinjury-automation';
function headers(token){ return {Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28'}; }
export function createGitHubAdapter({token,fetchImpl=fetch}){
  const dispatchKeys=new Set();
  async function json(url,opts={}){
    const res=await fetchImpl(url,{...opts,headers:{...headers(token),...(opts.headers||{})}});
    if(!res.ok) throw new Error(`GitHub ${res.status}`);
    return res.status===204 ? null : res.json();
  }
  return {
    async getWorkflowState(agent){
      if(!agent?.deployed || !agent?.workflows?.RUN_NOW) return {stale:false,lastSuccess:false,currentFailure:false,running:false,lastRun:null};
      try{
        const data=await json(`https://api.github.com/repos/${REPO}/actions/workflows/${encodeURIComponent(agent.workflows.RUN_NOW)}/runs?per_page=10`);
        const runs=Array.isArray(data?.workflow_runs)?data.workflow_runs:[];
        const latest=runs[0]||null;
        if(!latest) return {stale:false,lastSuccess:false,currentFailure:false,running:false,lastRun:null};
        const running=['queued','in_progress','waiting','requested','pending'].includes(latest.status);
        const currentFailure=latest.status==='completed' && !['success','neutral','skipped'].includes(latest.conclusion);
        const lastSuccess=latest.status==='completed' && latest.conclusion==='success';
        return {stale:false,lastSuccess,currentFailure,running,lastRun:{id:latest.id,status:latest.status,conclusion:latest.conclusion,createdAt:latest.created_at,url:latest.html_url}};
      }catch{
        return {stale:true,lastSuccess:false,currentFailure:false,running:false,lastRun:null,error:'GitHub temporarily unavailable'};
      }
    },
    async listAgentIssues(agent){
      if(!agent?.issueLabel) return [];
      try{
        const data=await json(`https://api.github.com/repos/${REPO}/issues?state=open&labels=${encodeURIComponent(agent.issueLabel)}&per_page=50`);
        return (Array.isArray(data)?data:[]).filter(x=>!x.pull_request).map(x=>({number:x.number,title:x.title,url:x.html_url,state:x.state,updatedAt:x.updated_at}));
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
      return json(`https://api.github.com/repos/${REPO}/pulls/${Number(number)}/merge`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({sha:expectedHeadSha,merge_method:'squash'})});
    }
  };
}
