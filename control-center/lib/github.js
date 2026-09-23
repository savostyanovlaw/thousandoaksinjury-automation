const REPO='savostyanovlaw/thousandoaksinjury-automation';
function headers(token){
  const out={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'Savostyanov-Law-AI-Control-Center'};
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
export function createGitHubAdapter({token,fetchImpl=fetch,sleepImpl=(ms)=>new Promise(r=>setTimeout(r,ms))}){
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
      const server=String(res.headers?.get?.('server')||'').slice(0,80);
      const acceptedPermissions=String(res.headers?.get?.('x-accepted-github-permissions')||'').slice(0,160);
      return {status:res.status,message,requestId,server,acceptedPermissions};
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
      const result={configured:true,authStatus:auth.status,repoStatus:repo.status,workflowStatus:workflowProbe.status,permissionHeader,...fingerprint,authRequestId:auth.requestId||'',repoRequestId:repo.requestId||'',workflowRequestId:workflowProbe.requestId||'',authServer:auth.server||'',repoServer:repo.server||'',workflowServer:workflowProbe.server||''};
      if(auth.message) result.authMessage=auth.message;
      if(auth.acceptedPermissions) result.authAcceptedPermissions=auth.acceptedPermissions;
      if(repo.message) result.repoMessage=repo.message;
      if(repo.acceptedPermissions) result.repoAcceptedPermissions=repo.acceptedPermissions;
      if(workflowProbe.message) result.workflowMessage=workflowProbe.message;
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
          .filter(x=>`${x.title||''}
${x.body||''}`.toLowerCase().includes(String(marker).toLowerCase()))
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
        await json(`https://api.github.com/repos/${REPO}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:'main',...(agent?.workflowInputs?.[command]?{inputs:agent.workflowInputs[command]}:{})})});
        return {ok:true,workflow,command};
      }catch(error){ dispatchKeys.delete(idempotencyKey); throw error; }
    },
    async dispatchRemediation(job){
      requireWriteCredential();
      // A remediation job's real target workflow depends on what kind of
      // fix it needs -- a technical SEO defect is a repository-level code
      // change (remediation-preparer.yml), while a content-staleness
      // finding needs an actual reviewable content draft built from the
      // page's own real current title/body (content-refresher.yml). Each
      // dispatch only ever supplies real data the source finding carried;
      // nothing here is a placeholder.
      if(job.remediationAgentId==='content-refresher'){
        const workflow='content-refresher.yml';
        const raw=job.rawFinding||{};
        const inputs={
          source_id:String(raw.url||job.sourceRunId||job.id),
          source_revision:String(raw.source_revision||job.sourceRunId||'unknown'),
          title:String(raw.page_title||'Untitled page').slice(0,500),
          body:String(raw.page_body||'').slice(0,9000),
          material_change_reason:String(raw.material_change_reason||job.recommendedAction||'Content freshness review requested.').slice(0,500)
        };
        await json(`https://api.github.com/repos/${REPO}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:'main',inputs})});
        return {ok:true,workflow};
      }
      // The owner has already reviewed and approved this exact before/after
      // diff in Content Refresher's own draft (requiresAttorneyReview was
      // true, approvalState PENDING) -- this applies ONLY that reviewed text
      // to the real page and opens a PR, never merges (content is always
      // YELLOW/owner-merge-only; see content-page-apply.yml, which refuses
      // to touch the file at all unless the reviewed "before" text still
      // matches the current page exactly once).
      if(job.remediationAgentId==='content-page-editor'){
        const workflow='content-page-apply.yml';
        const raw=job.rawFinding||{};
        const diff=raw.diff||{};
        const inputs={
          job_id:String(job.id),
          page_url:String(raw.page||'').slice(0,500),
          before:String(diff.before||'').slice(0,20000),
          after:String(diff.after||'').slice(0,20000),
          issue:String(raw.issue||job.summary||'').slice(0,500),
          source_run_id:String(job.sourceRunId)
        };
        await json(`https://api.github.com/repos/${REPO}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:'main',inputs})});
        return {ok:true,workflow};
      }
      const workflow='remediation-preparer.yml';
      const raw=job.rawFinding||{};
      const inputs={job_id:String(job.id),source_agent_id:String(job.sourceAgentId),source_run_id:String(job.sourceRunId),finding_type:String(job.findingType),summary:String(job.summary).slice(0,500),recommended_action:String(job.recommendedAction).slice(0,500),autonomy:String(job.autonomy||'YELLOW')};
      // The gated E2E fixture's own inputs: a real repository-internal
      // marker file value to write, and an optional switch to deliberately
      // fail post-merge verification so the bounded retry/rollback path can
      // be proven on demand. Never present for a real finding.
      if(String(job.findingType).toLowerCase()==='e2e_fixture_marker'){
        inputs.fixture_marker_value=String(raw.fixtureMarkerValue||raw.fixture_marker_value||job.id);
        inputs.fixture_force_verification_failure=String(raw.fixtureForceVerificationFailure||raw.fixture_force_verification_failure||false)==='true'?'true':'false';
      }
      await json(`https://api.github.com/repos/${REPO}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:'main',inputs})});
      return {ok:true,workflow};
    },
    async getWorkflowRunReview(runId){
      const id=Number(runId);
      if(!Number.isFinite(id)) throw new Error('Invalid workflow run');
      // A producing workflow's own "Notify Control Center" step calls the
      // ingest endpoint (which reaches this function) from INSIDE that same
      // still-running job, immediately after the preceding step printed
      // this marker -- so the very first read of that job's own logs can
      // race GitHub's own log-finalization for the step that just ran.
      // Losing that race silently leaves a fully-GREEN report stuck
      // PENDING forever (dashboard-load reconciliation never retries an
      // approval that already exists). A short bounded retry absorbs the
      // race without meaningfully slowing down the real "no review yet"
      // case, since a genuinely absent marker still resolves after the
      // same fixed number of attempts.
      const maxAttempts=4;
      const retryDelayMs=1500;
      let run,artifactsData,jobsData,reviewResult=null;
      for(let attempt=1;attempt<=maxAttempts;attempt++){
        run=await json(`https://api.github.com/repos/${REPO}/actions/runs/${id}`);
        artifactsData=await json(`https://api.github.com/repos/${REPO}/actions/runs/${id}/artifacts?per_page=100`);
        jobsData=await json(`https://api.github.com/repos/${REPO}/actions/runs/${id}/jobs?per_page=100`);
        reviewResult=null;
        for(const job of (jobsData?.jobs||[])){
          try{
            const res=await fetchImpl(`https://api.github.com/repos/${REPO}/actions/jobs/${job.id}/logs`,{headers:headers(token),redirect:'follow'});
            if(!res.ok) continue;
            const log=await res.text();
            const matches=[...log.matchAll(/SLC_REVIEW_JSON_B64=([A-Za-z0-9+/=]+)/g)];
            if(matches.length){
              const raw=atob(matches[matches.length-1][1]);
              const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
              reviewResult=JSON.parse(new TextDecoder().decode(bytes));
              break;
            }
          }catch{}
        }
        if(reviewResult || attempt===maxAttempts) break;
        await sleepImpl(retryDelayMs);
      }
      const artifacts=(artifactsData?.artifacts||[]).map(a=>({id:a.id,name:a.name,size:a.size_in_bytes,expired:!!a.expired,createdAt:a.created_at,url:`https://github.com/${REPO}/actions/runs/${id}/artifacts/${a.id}`}));
      return {run:{id:run.id,name:run.name,status:run.status,conclusion:run.conclusion,createdAt:run.created_at,updatedAt:run.updated_at,url:run.html_url,headSha:run.head_sha,event:run.event},artifacts,reviewResult};
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
