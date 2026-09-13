import { deriveAgentStatus } from './status.js';
const CRED_RE=/(token|secret|password|api.?key|private.?key|credential)/i;
export function assertNoSecretKeys(value,path='root'){
  if(Array.isArray(value)){ value.forEach((v,i)=>assertNoSecretKeys(v,`${path}[${i}]`)); return true; }
  if(value && typeof value==='object'){
    for(const [k,v] of Object.entries(value)){
      if(CRED_RE.test(k)) throw new Error(`credential-like key in browser payload: ${path}.${k}`);
      assertNoSecretKeys(v,`${path}.${k}`);
    }
  }
  return true;
}
function nextExpectedAt(agent,nowMs=Date.now()){
  const hours=Array.isArray(agent?.scheduleUtcHours)?agent.scheduleUtcHours.map(Number).filter(h=>Number.isInteger(h)&&h>=0&&h<=23).sort((a,b)=>a-b):[];
  if(!hours.length) return null;
  const now=new Date(nowMs);
  for(const hour of hours){ const candidate=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate(),hour,0,0)); if(candidate.getTime()>nowMs) return candidate.toISOString(); }
  const tomorrow=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1,hours[0],0,0));
  return tomorrow.toISOString();
}
function runActivity(agent,workflow){
  const latestSuccess=(workflow.recentRuns||[]).find(r=>r.conclusion==='success');
  const latestSuccessTime=latestSuccess?.createdAt?new Date(latestSuccess.createdAt).getTime():0;
  return (workflow.recentRuns||[]).map(run=>{
    let status=run.conclusion||run.status||'unknown';
    if(run.conclusion && !['success','neutral','skipped'].includes(run.conclusion) && latestSuccessTime && new Date(run.createdAt).getTime()<latestSuccessTime) status='resolved by later successful run';
    return {agentId:agent.id,title:`${agent.name} workflow run`,timestamp:run.createdAt||null,status,url:run.url||null};
  });
}
export async function buildDashboardState({agents,github,pendingApprovals=[],auditEvents=[]}){
  const approvalCounts=new Map();
  for(const a of pendingApprovals) approvalCounts.set(a.agentId,(approvalCounts.get(a.agentId)||0)+1);
  const normalized=[]; const workflowActivity=[];
  for(const agent of agents){
    if(!agent.deployed){ normalized.push({...agent,status:'NOT DEPLOYED',stale:false,lastRun:null,recentRuns:[],nextExpectedAt:null,issues:[],pulls:[],pendingApprovals:0,capabilities:[]}); continue; }
    const workflow=await github.getWorkflowState(agent);
    const [issues,pulls]=await Promise.all([github.listAgentIssues(agent),github.listAgentPulls(agent)]);
    const pending=approvalCounts.get(agent.id)||0;
    let status;
    if(workflow.stale && !pending && !workflow.running && !workflow.currentFailure && !workflow.lastSuccess) status='HEALTHY';
    else status=deriveAgentStatus({deployed:agent.deployed,disabled:agent.disabled,pendingApproval:pending>0,running:workflow.running,currentFailure:workflow.currentFailure || issues.length>0,lastSuccess:workflow.lastSuccess});
    normalized.push({id:agent.id,name:agent.name,description:agent.description,status,stale:!!workflow.stale,lastRun:workflow.lastRun||null,recentRuns:workflow.recentRuns||[],nextExpectedAt:nextExpectedAt(agent),issues,pulls,pendingApprovals:pending,capabilities:agent.deployed?agent.commands:[],cadenceHours:agent.cadenceHours||null});
    workflowActivity.push(...runActivity(agent,workflow));
  }
  const summary={healthy:0,running:0,needsAttention:0,waitingApproval:0,notDeployed:0,disabled:0,productionWebsite:'UNKNOWN'};
  for(const a of normalized){ if(a.status==='HEALTHY') summary.healthy++; else if(a.status==='RUNNING') summary.running++; else if(a.status==='NEEDS ATTENTION') summary.needsAttention++; else if(a.status==='WAITING APPROVAL') summary.waitingApproval++; else if(a.status==='NOT DEPLOYED') summary.notDeployed++; else if(a.status==='DISABLED') summary.disabled++; }
  const watchdog=normalized.find(a=>a.id==='technical-seo-watchdog');
  summary.productionWebsite=watchdog?.stale?'DATA STALE':watchdog?.status==='HEALTHY'?'HEALTHY':watchdog?.status||'UNKNOWN';
  const attention=normalized.filter(a=>a.status==='NEEDS ATTENTION').map(a=>({agentId:a.id,title:`${a.name} needs attention`,issues:a.issues}));
  const auditActivity=auditEvents.map(e=>({agentId:e.agentId,title:`${e.agentId}: ${e.action}`,timestamp:e.timestamp,status:e.result,targetId:e.targetId||null}));
  const activity=[...auditActivity,...workflowActivity].filter(a=>a.timestamp).sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp)).slice(0,50);
  const out={generatedAt:new Date().toISOString(),summary,agents:normalized,approvals:pendingApprovals,attention,activity,stale:normalized.some(a=>a.stale)};
  assertNoSecretKeys(out);
  return out;
}
