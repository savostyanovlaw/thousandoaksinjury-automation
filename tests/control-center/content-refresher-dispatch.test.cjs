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

test('approving Content Refresher\'s OWN reviewed draft dispatches content-page-apply.yml instead of silently landing BLOCKED', async()=>{
  // Regression test: Content Refresher's own findings ({page,issue,why,risk,
  // diff:{before,after},sources}, produced by scripts/content_refresher.py's
  // refresh()) carry no findingType/type/check/code at all, so the
  // type-keyed route() map (built for Technical SEO Watchdog's findings)
  // always fell through to remediationAgentId=null -> BLOCKED. Approving
  // looked successful (ok:true) but produced no real remediation dispatch --
  // the owner's approval silently did nothing.
  const {executeApprovalDecision}=await approvalsModule();
  const state={status:'PENDING'};
  const db={prepare(sql){return {bind(...args){return {async run(){
    if(sql.startsWith('UPDATE approvals SET status')){ if(state.status!=='PENDING') return {meta:{changes:0}}; state.status=args[0]; return {meta:{changes:1}}; }
    return {meta:{changes:1}};
  }};},async run(){return {meta:{changes:0}};}};}};
  const record={id:'ap2',agentId:'content-refresher',action:'REVIEW_RESULT',targetType:'workflow_run',targetId:'888',status:'PENDING'};
  let dispatchedJob=null;
  const github={
    getWorkflowRunReview:async()=>({reviewResult:{
      agent:'content-refresher',status:'REVIEW',
      findings:[{
        page:'https://thousandoaksinjury.com/dog-bite-lawyer/',
        issue:'Statute of limitations reference is outdated.',
        why:'California statute of limitations reference is outdated.',
        risk:'LEGAL_REVIEW',
        diff:{before:'You have two years.',after:'You generally have two years, though exceptions apply.'},
        sources:['https://leginfo.legislature.ca.gov/'],
        afterApproval:'Prepare a revision-bound branch/PR containing only this reviewed change.'
      }]
    }}),
    dispatchRemediation:async(job)=>{ dispatchedJob=job; return {ok:true,workflow:'content-page-apply.yml'}; }
  };
  const result=await executeApprovalDecision({record,decision:'APPROVE',user:{email:'owner@example.com'},db,github});
  assert.equal(result.remediationJobs.length,1);
  assert.equal(result.remediationJobs[0].remediationAgentId,'content-page-editor');
  assert.equal(result.remediationJobs[0].status,'DISPATCHED','must actually dispatch, never BLOCKED');
  assert.equal(dispatchedJob.remediationAgentId,'content-page-editor');
  assert.equal(dispatchedJob.rawFinding.diff.before,'You have two years.');
  assert.match(dispatchedJob.summary,/Statute of limitations/);
  assert.match(dispatchedJob.recommendedAction,/revision-bound branch\/PR/);
});

test('dispatchRemediation sends content-page-apply.yml the reviewed before/after text, not remediation-preparer.yml', async()=>{
  const {createGitHubAdapter}=await githubModule();
  let dispatchedUrl=null, dispatchedBody=null;
  const fetchImpl=async(url,opts)=>{
    dispatchedUrl=String(url); dispatchedBody=JSON.parse(opts.body);
    return new Response('{}',{status:200});
  };
  const github=createGitHubAdapter({token:'ghp_test',fetchImpl});
  const job={
    id:'job6',sourceAgentId:'content-refresher',sourceRunId:'888',
    remediationAgentId:'content-page-editor',summary:'Statute of limitations reference is outdated.',
    rawFinding:{page:'https://thousandoaksinjury.com/dog-bite-lawyer/',issue:'Statute of limitations reference is outdated.',diff:{before:'You have two years.',after:'You generally have two years, though exceptions apply.'}}
  };
  await github.dispatchRemediation(job);
  assert.match(dispatchedUrl,/content-page-apply\.yml\/dispatches$/);
  assert.equal(dispatchedBody.inputs.page_url,'https://thousandoaksinjury.com/dog-bite-lawyer/');
  assert.equal(dispatchedBody.inputs.before,'You have two years.');
  assert.equal(dispatchedBody.inputs.after,'You generally have two years, though exceptions apply.');
  assert.equal(dispatchedBody.inputs.issue,'Statute of limitations reference is outdated.');
  assert.equal(dispatchedBody.inputs.source_run_id,'888');
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

test('dispatchRemediation forwards the job autonomy to remediation-preparer.yml', async()=>{
  const {createGitHubAdapter}=await githubModule();
  let dispatchedBody=null;
  const fetchImpl=async(url,opts)=>{ dispatchedBody=JSON.parse(opts.body); return new Response('{}',{status:200}); };
  const github=createGitHubAdapter({token:'ghp_test',fetchImpl});
  await github.dispatchRemediation({id:'job3',sourceAgentId:'technical-seo-watchdog',sourceRunId:'999',remediationAgentId:'technical-seo-fixer',findingType:'robots-sitemap',summary:'x',recommendedAction:'y',autonomy:'GREEN',rawFinding:{}});
  assert.equal(dispatchedBody.inputs.autonomy,'GREEN');
});

test('dispatchRemediation forwards the E2E fixture marker value and force-failure switch only for e2e_fixture_marker jobs', async()=>{
  const {createGitHubAdapter}=await githubModule();
  let dispatchedBody=null;
  const fetchImpl=async(url,opts)=>{ dispatchedBody=JSON.parse(opts.body); return new Response('{}',{status:200}); };
  const github=createGitHubAdapter({token:'ghp_test',fetchImpl});
  await github.dispatchRemediation({id:'job4',sourceAgentId:'technical-seo-watchdog',sourceRunId:'999',remediationAgentId:'technical-seo-fixer',findingType:'e2e_fixture_marker',summary:'x',recommendedAction:'y',autonomy:'GREEN',rawFinding:{fixtureMarkerValue:'marker-abc',fixtureForceVerificationFailure:true}});
  assert.equal(dispatchedBody.inputs.fixture_marker_value,'marker-abc');
  assert.equal(dispatchedBody.inputs.fixture_force_verification_failure,'true');

  let dispatchedBody2=null;
  const fetchImpl2=async(url,opts)=>{ dispatchedBody2=JSON.parse(opts.body); return new Response('{}',{status:200}); };
  const github2=createGitHubAdapter({token:'ghp_test',fetchImpl:fetchImpl2});
  await github2.dispatchRemediation({id:'job5',sourceAgentId:'technical-seo-watchdog',sourceRunId:'999',remediationAgentId:'technical-seo-fixer',findingType:'robots-sitemap',summary:'x',recommendedAction:'y',autonomy:'GREEN',rawFinding:{}});
  assert.equal(dispatchedBody2.inputs.fixture_marker_value,undefined,'a real finding must never carry fixture-only inputs');
});
