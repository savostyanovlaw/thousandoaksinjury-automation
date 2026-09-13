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
export async function buildDashboardState({agents,github,pendingApprovals=[]}){
  const approvalCounts=new Map();
  for(const a of pendingApprovals) approvalCounts.set(a.agentId,(approvalCounts.get(a.agentId)||0)+1);
  const normalized=[];
  for(const agent of agents){
    if(!agent.deployed){ normalized.push({...agent,status:'NOT DEPLOYED',stale:false,lastRun:null,issues:[],pulls:[],pendingApprovals:0,capabilities:[]}); continue; }
    const workflow=await github.getWorkflowState(agent);
    const [issues,pulls]=await Promise.all([github.listAgentIssues(agent),github.listAgentPulls(agent)]);
    const pending=approvalCounts.get(agent.id)||0;
    let status;
    if(workflow.stale && !pending && !workflow.running && !workflow.currentFailure && !workflow.lastSuccess) status='HEALTHY';
    else status=deriveAgentStatus({deployed:agent.deployed,disabled:agent.disabled,pendingApproval:pending>0,running:workflow.running,currentFailure:workflow.currentFailure || issues.length>0,lastSuccess:workflow.lastSuccess});
    normalized.push({id:agent.id,name:agent.name,description:agent.description,status,stale:!!workflow.stale,lastRun:workflow.lastRun||null,issues,pulls,pendingApprovals:pending,capabilities:agent.deployed?agent.commands:[],cadenceHours:agent.cadenceHours||null});
  }
  const summary={healthy:0,running:0,needsAttention:0,waitingApproval:0,notDeployed:0,disabled:0};
  for(const a of normalized){ if(a.status==='HEALTHY') summary.healthy++; else if(a.status==='RUNNING') summary.running++; else if(a.status==='NEEDS ATTENTION') summary.needsAttention++; else if(a.status==='WAITING APPROVAL') summary.waitingApproval++; else if(a.status==='NOT DEPLOYED') summary.notDeployed++; else if(a.status==='DISABLED') summary.disabled++; }
  const attention=normalized.filter(a=>a.status==='NEEDS ATTENTION').map(a=>({agentId:a.id,title:`${a.name} needs attention`,issues:a.issues}));
  const activity=normalized.filter(a=>a.lastRun).map(a=>({agentId:a.id,title:`${a.name} last run`,timestamp:a.lastRun.createdAt||null,status:a.lastRun.conclusion||a.lastRun.status||'unknown'}));
  const out={generatedAt:new Date().toISOString(),summary,agents:normalized,approvals:pendingApprovals,attention,activity,stale:normalized.some(a=>a.stale)};
  assertNoSecretKeys(out);
  return out;
}
