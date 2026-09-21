const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');

async function githubModule(){return import(pathToFileURL(process.cwd()+'/control-center/lib/github.js'));}
async function approvalsModule(){return import(pathToFileURL(process.cwd()+'/control-center/functions/api/control/approvals/[id].js'));}

test('a content_stale finding routes to content-refresher, not technical-seo-fixer', async()=>{
  const {executeApprovalDecision}=await approvalsModule();
  const state={status:'PENDING',consumed:false};
  const db={prepare(sql){return {bind(...args){return {async run(){
    if(sql.startsWith('UPDATE approvals SET status')){ if(state.status!=='PENDING') return {meta:{changes:0}}; state.status=args[0]; return {meta:{changes:1}}; }
    return {meta:{changes:1}};
  }};},async run(){return {meta:{changes:0}};}};}};
  const record={id:'ap1',agentId:'technical-seo-watchdog',action:'REVIEW_RESULT',targetType:'workflow_run',targetId:'999',status:'PENDING'};
  let dispatchedJob=null;
  const github={
    getWorkflowRunReview:async()=>({reviewResult:{findings:[{
      findingType:'content_stale',check:'content_stale',
      url:'https://thousandoaksinjury.com/dog-bite-lawyer/',
      source_revision:'abc123',page_title:'Thousand Oaks Dog Bite Lawyer',
      page_body:'Real existing page content.',
      material_change_reason:'No substantive update in 400 days.',
      evidence:'No substantive update in 400 days.',
      recommended_fix:'Have Content Refresher propose an updated draft.'
    }]}}),
    dispatchRemediation:async(job)=>{ dispatchedJob=job; return {ok:true,workflow:'content-refresher.yml'}; }
  };
  const result=await executeApprovalDecision({record,decision:'APPROVE',user:{email:'owner@example.com'},db,github});
  assert.equal(result.remediationJobs.length,1);
  assert.equal(result.remediationJobs[0].remediationAgentId,'content-refresher');
  assert.equal(result.remediationJobs[0].status,'DISPATCHED');
  assert.equal(dispatchedJob.remediationAgentId,'content-refresher');
  assert.equal(dispatchedJob.rawFinding.page_title,'Thousand Oaks Dog Bite Lawyer');
});

test('dispatchRemediation sends content-refresher.yml the real page data, not remediation-preparer.yml', async()=>{
  const {createGitHubAdapter}=await githubModule();
  let dispatchedUrl=null, dispatchedBody=null;
  const fetchImpl=async(url,opts)=>{
    dispatchedUrl=String(url); dispatchedBody=JSON.parse(opts.body);
    return new Response('{}',{status:200});
  };
  const github=createGitHubAdapter({token:'ghp_test',fetchImpl});
  const job={
    id:'job1',sourceAgentId:'technical-seo-watchdog',sourceRunId:'999',
    remediationAgentId:'content-refresher',recommendedAction:'fallback reason',
    rawFinding:{url:'https://thousandoaksinjury.com/dog-bite-lawyer/',source_revision:'abc123',page_title:'Thousand Oaks Dog Bite Lawyer',page_body:'Real existing page content.',material_change_reason:'No substantive update in 400 days.'}
  };
  await github.dispatchRemediation(job);
  assert.match(dispatchedUrl,/content-refresher\.yml\/dispatches$/);
  assert.equal(dispatchedBody.inputs.source_id,'https://thousandoaksinjury.com/dog-bite-lawyer/');
  assert.equal(dispatchedBody.inputs.source_revision,'abc123');
  assert.equal(dispatchedBody.inputs.title,'Thousand Oaks Dog Bite Lawyer');
  assert.equal(dispatchedBody.inputs.body,'Real existing page content.');
  assert.equal(dispatchedBody.inputs.material_change_reason,'No substantive update in 400 days.');
});

test('a technical-seo-fixer job still dispatches remediation-preparer.yml unchanged', async()=>{
  const {createGitHubAdapter}=await githubModule();
  let dispatchedUrl=null;
  const fetchImpl=async(url)=>{ dispatchedUrl=String(url); return new Response('{}',{status:200}); };
  const github=createGitHubAdapter({token:'ghp_test',fetchImpl});
  await github.dispatchRemediation({id:'job2',sourceAgentId:'technical-seo-watchdog',sourceRunId:'999',remediationAgentId:'technical-seo-fixer',findingType:'robots',summary:'x',recommendedAction:'y',rawFinding:{}});
  assert.match(dispatchedUrl,/remediation-preparer\.yml\/dispatches$/);
});
