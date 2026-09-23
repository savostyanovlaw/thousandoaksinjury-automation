const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');

async function approvalsModule(){return import(pathToFileURL(process.cwd()+'/control-center/functions/api/control/approvals/[id].js'));}
async function authModule(){return import(pathToFileURL(process.cwd()+'/control-center/lib/auth.js'));}
async function approvalsLib(){return import(pathToFileURL(process.cwd()+'/control-center/lib/approvals.js'));}

// A generic-enough fake D1 covering every table this route touches
// (approvals, audit_events, remediation_jobs) so onRequestPost -- the real
// HTTP entrypoint, not just the inner executeApprovalDecision -- can be
// exercised end to end, including the audit write that follows it.
function fakeDb(seedApprovals=[]){
  const approvals=new Map(seedApprovals.map(a=>[a.id,{...a}]));
  const auditEvents=[];
  const remediationJobs=[];
  let remediationTableCreated=false;
  function row(){ return {
    prepare(sql){
      const trimmed=sql.trim();
      const exec=(args)=>{
        if(/^CREATE TABLE/i.test(trimmed)){ if(/remediation_jobs/i.test(trimmed)) remediationTableCreated=true; return {meta:{changes:0}}; }
        if(/^CREATE INDEX/i.test(trimmed)) return {meta:{changes:0}};
        if(/^UPDATE approvals SET status/i.test(trimmed)){
          const [status,decidedAt,decidedBy,feedback,id]=args;
          const a=approvals.get(id);
          if(!a || a.status!=='PENDING') return {meta:{changes:0}};
          a.status=status; a.decidedAt=decidedAt; a.decidedBy=decidedBy; a.feedback=feedback;
          return {meta:{changes:1}};
        }
        if(/^UPDATE approvals SET consumed_at/i.test(trimmed)){
          const [consumedAt,id]=args;
          const a=approvals.get(id);
          if(!a || a.consumedAt || a.status!=='APPROVED') return {meta:{changes:0}};
          a.consumedAt=consumedAt;
          return {meta:{changes:1}};
        }
        if(/^INSERT INTO audit_events/i.test(trimmed)){
          const [id,timestamp,actor,agentId,action,targetType,targetId,targetRevision,autonomy,result,metadataJson]=args;
          auditEvents.push({id,timestamp,actor,agentId,action,targetType,targetId,targetRevision,autonomy,result,metadata:JSON.parse(metadataJson)});
          return {meta:{changes:1}};
        }
        if(/^INSERT INTO remediation_jobs /i.test(trimmed)){
          const [id,sourceAgentId,sourceRunId,ownerApprovalId,findingType,summary,recommendedAction,rawFindingJson,remediationAgentId]=args;
          remediationJobs.push({id,sourceAgentId,sourceRunId,ownerApprovalId,findingType,summary,recommendedAction,rawFindingJson,remediationAgentId,status:'QUEUED'});
          return {meta:{changes:1}};
        }
        if(/^UPDATE remediation_jobs SET status/i.test(trimmed)){
          const [status,,,,,id]=args;
          const job=remediationJobs.find(j=>j.id===id);
          if(job) job.status=status;
          return {meta:{changes:job?1:0}};
        }
        return {meta:{changes:0}};
      };
      const first=(args)=>{
        if(/^SELECT sql FROM sqlite_master/i.test(trimmed)) return remediationTableCreated?null:null;
        if(/^SELECT .*FROM approvals WHERE id = \?/i.test(trimmed)){
          const [id]=args;
          const a=approvals.get(id);
          return a?{id:a.id,agentId:a.agentId,action:a.action,targetType:a.targetType,targetId:a.targetId,targetRevision:a.targetRevision,payloadHash:a.payloadHash,status:a.status,createdAt:a.createdAt,decidedAt:a.decidedAt||null,decidedBy:a.decidedBy||null,consumedAt:a.consumedAt||null}:null;
        }
        return null;
      };
      return {
        async run(){ return exec([]); },
        async first(){ return first([]); },
        async all(){ return {results:[]}; },
        bind(...args){ return {run:()=>exec(args),first:()=>first(args),all:async()=>({results:[]})}; }
      };
    }
  };}
  const db=row();
  db.approvals=approvals; db.auditEvents=auditEvents; db.remediationJobs=remediationJobs;
  return db;
}

async function makeContext({db,approvalId,decision,agentEmail='savostyanovlaw@gmail.com',github}){
  const {createSessionToken}=await authModule();
  const env={AUTHORIZED_EMAIL:agentEmail,CONTROL_AUTH_PASSWORD:'example-password-long-enough-2026',CONTROL_DB:db,GITHUB_TOKEN:'test-token'};
  const token=await createSessionToken(env,agentEmail);
  const url='https://slc-ai-control.pages.dev/api/control/approvals/'+approvalId;
  const request=new Request(url,{
    method:'POST',
    headers:{cookie:`slc_session=${token}`,origin:'https://slc-ai-control.pages.dev','content-type':'application/json'},
    body:JSON.stringify({decision})
  });
  return {request,env,params:{id:approvalId},_github:github};
}

// Monkey-patch createGitHubAdapter via module cache is awkward across ESM;
// instead we import the module under test and call onRequestPost directly,
// but the module always builds its own github adapter from GITHUB_TOKEN. To
// exercise a controlled github adapter (forced failures, call recording) we
// call executeApprovalDecision directly for the RED path (already unit
// tested at that layer) and use onRequestPost only for the parts that don't
// need a github double: REJECT and the same-origin/auth/audit plumbing.

const nowIso='2026-09-21T05:00:00.000Z';

test('REJECT via the real HTTP route writes exactly one audit event and never calls mergePull', async()=>{
  const {onRequestPost}=await approvalsModule();
  const approval={id:'ap-reject-1',agentId:'content-creator',action:'MERGE_PR',targetType:'pull_request',targetId:'50',targetRevision:'abc',payloadHash:'irrelevant',status:'PENDING',createdAt:nowIso};
  const db=fakeDb([approval]);
  const context=await makeContext({db,approvalId:approval.id,decision:'REJECT'});
  const response=await onRequestPost(context);
  const body=await response.json();
  assert.equal(body.executed,false);
  assert.equal(db.approvals.get(approval.id).status,'REJECTED');
  assert.equal(db.auditEvents.length,1);
  assert.equal(db.auditEvents[0].result,'rejected');
});

test('a retried REJECT on an already-decided approval executes nothing and writes no second audit event', async()=>{
  const {onRequestPost}=await approvalsModule();
  const approval={id:'ap-reject-2',agentId:'content-creator',action:'MERGE_PR',targetType:'pull_request',targetId:'51',targetRevision:'abc',payloadHash:'irrelevant',status:'PENDING',createdAt:nowIso};
  const db=fakeDb([approval]);
  const context1=await makeContext({db,approvalId:approval.id,decision:'REJECT'});
  await onRequestPost(context1);
  assert.equal(db.auditEvents.length,1);
  const context2=await makeContext({db,approvalId:approval.id,decision:'REJECT'});
  const response2=await onRequestPost(context2);
  assert.equal(response2.status,400);
  assert.equal(db.auditEvents.length,1,'a stale/retried decision must not add a second audit event');
});

test('a rejected approval can never later be approved', async()=>{
  const {onRequestPost}=await approvalsModule();
  const approval={id:'ap-reject-3',agentId:'content-creator',action:'MERGE_PR',targetType:'pull_request',targetId:'52',targetRevision:'abc',payloadHash:'irrelevant',status:'PENDING',createdAt:nowIso};
  const db=fakeDb([approval]);
  await onRequestPost(await makeContext({db,approvalId:approval.id,decision:'REJECT'}));
  const response=await onRequestPost(await makeContext({db,approvalId:approval.id,decision:'APPROVE'}));
  assert.equal(response.status,400);
  assert.equal(db.approvals.get(approval.id).status,'REJECTED');
  assert.equal(db.auditEvents.length,1,'the rejected-then-approve-attempt must not add a second audit event or execute anything');
});

// --- RED (MERGE_PR) execution, through the real HTTP route, with a real
// GitHub REST shape mocked at the fetch layer (createGitHubAdapter is
// otherwise untouched) ---

function mockGithubFetch({headSha,mergeOk=true,mergeStatus=200}){
  let mergeCalls=0;
  const fn=async(url,opts={})=>{
    const u=String(url);
    if(/\/pulls\/60$/.test(u) && (!opts.method || opts.method==='GET')){
      return new Response(JSON.stringify({head:{sha:headSha},html_url:'https://github.com/x/y/pull/60',state:'open',merged:false}),{status:200,headers:{'content-type':'application/json'}});
    }
    if(/\/pulls\/60\/merge$/.test(u) && opts.method==='PUT'){
      mergeCalls++;
      if(!mergeOk) return new Response(JSON.stringify({message:'Merge conflict'}),{status:mergeStatus,headers:{'content-type':'application/json'}});
      return new Response(JSON.stringify({merged:true,message:'Pull Request successfully merged'}),{status:200,headers:{'content-type':'application/json'}});
    }
    throw new Error(`unexpected fetch in test: ${opts.method||'GET'} ${u}`);
  };
  fn.mergeCallCount=()=>mergeCalls;
  return fn;
}

async function buildRedApproval(headSha){
  const {targetHash}=await approvalsLib();
  const payload={agentId:'content-creator',action:'MERGE_PR',targetType:'pull_request',targetId:'60',targetRevision:headSha};
  return {id:'ap-red-'+headSha+'-'+Math.random().toString(36).slice(2),agentId:'content-creator',action:'MERGE_PR',targetType:'pull_request',targetId:'60',targetRevision:headSha,payloadHash:await targetHash(payload),status:'PENDING',createdAt:nowIso,consumedAt:null};
}

test('APPROVE on a RED merge executes exactly once, matches the approved revision exactly, and is audited', async()=>{
  const {onRequestPost}=await approvalsModule();
  const approval=await buildRedApproval('sha-current');
  const db=fakeDb([approval]);
  const fetchMock=mockGithubFetch({headSha:'sha-current'});
  const originalFetch=global.fetch; global.fetch=fetchMock;
  try{
    const response=await onRequestPost(await makeContext({db,approvalId:approval.id,decision:'APPROVE'}));
    const body=await response.json();
    assert.equal(body.executed,true);
    assert.equal(body.merged,true);
    assert.equal(fetchMock.mergeCallCount(),1);
    assert.equal(db.approvals.get(approval.id).status,'APPROVED');
    assert.ok(db.approvals.get(approval.id).consumedAt,'a successful execution must consume the approval');
    assert.equal(db.auditEvents.length,1);
    assert.equal(db.auditEvents[0].result,'approved-executed');

    // Retry: same approval id, same decision, sent again (double-click or a
    // network retry). It must not merge a second time and must not add a
    // second audit event.
    const retry=await onRequestPost(await makeContext({db,approvalId:approval.id,decision:'APPROVE'}));
    assert.equal(retry.status,400);
    assert.equal(fetchMock.mergeCallCount(),1,'a retried APPROVE must not merge twice');
    assert.equal(db.auditEvents.length,1,'a retried APPROVE must not add a second audit event');
  }finally{ global.fetch=originalFetch; }
});

test('a stale/superseded PR revision cannot execute and leaves the approval PENDING with no audit event', async()=>{
  const {onRequestPost}=await approvalsModule();
  const approval=await buildRedApproval('sha-old');
  const db=fakeDb([approval]);
  // The real PR has since moved to a new head sha -- the approval was for
  // sha-old, which no longer exists as the PR's current head.
  const fetchMock=mockGithubFetch({headSha:'sha-new'});
  const originalFetch=global.fetch; global.fetch=fetchMock;
  try{
    const response=await onRequestPost(await makeContext({db,approvalId:approval.id,decision:'APPROVE'}));
    assert.equal(response.status,400);
    assert.equal(fetchMock.mergeCallCount(),0,'a stale target must never reach the merge call');
    assert.equal(db.approvals.get(approval.id).status,'PENDING','a rejected-as-stale request must not consume the PENDING claim');
    assert.equal(db.auditEvents.length,0,'nothing happened, so nothing should be audited');
  }finally{ global.fetch=originalFetch; }
});

test('a failed merge is claimed, left in an observable stuck APPROVED-but-unconsumed state, and audited as failed', async()=>{
  const {onRequestPost}=await approvalsModule();
  const approval=await buildRedApproval('sha-conflict');
  const db=fakeDb([approval]);
  const fetchMock=mockGithubFetch({headSha:'sha-conflict',mergeOk:false,mergeStatus:409});
  const originalFetch=global.fetch; global.fetch=fetchMock;
  try{
    const response=await onRequestPost(await makeContext({db,approvalId:approval.id,decision:'APPROVE'}));
    const body=await response.json();
    assert.equal(body.executed,false);
    assert.equal(body.failed,true);
    assert.equal(db.approvals.get(approval.id).status,'APPROVED');
    assert.equal(db.approvals.get(approval.id).consumedAt,null,'a failed execution must not be marked consumed');
    assert.equal(db.auditEvents.length,1);
    assert.equal(db.auditEvents[0].result,'approved-execution-failed');
  }finally{ global.fetch=originalFetch; }
});
