const test=require('node:test'); const assert=require('node:assert/strict'); const {pathToFileURL}=require('node:url');
async function m(){return import(pathToFileURL(process.cwd()+'/control-center/lib/github.js'));}
const agent={id:'technical-seo-watchdog',deployed:true,workflows:{RUN_NOW:'technical-seo-watchdog.yml'},commands:[{name:'RUN_NOW',autonomy:'GREEN'}],issueLabel:'technical-seo-watchdog'};
function fetcher(responses){let i=0; return async()=>{const r=responses[i++]; if(r instanceof Error) throw r; return new Response(JSON.stringify(r.body??r),{status:r.status??200,headers:{'content-type':'application/json'}});};}
test('normalizes successful latest workflow run',async()=>{const {createGitHubAdapter}=await m(); const gh=createGitHubAdapter({token:'x',fetchImpl:fetcher([{workflow_runs:[{id:3,status:'completed',conclusion:'success',created_at:'2026-09-13T10:00:00Z',html_url:'https://github/run/3'}]}])}); const s=await gh.getWorkflowState(agent); assert.equal(s.lastSuccess,true); assert.equal(s.currentFailure,false);});
test('unavailable GitHub returns stale unknown rather than red',async()=>{const {createGitHubAdapter}=await m(); const gh=createGitHubAdapter({token:'x',fetchImpl:async()=>{throw new Error('down')}}); const s=await gh.getWorkflowState(agent); assert.equal(s.stale,true); assert.equal(s.currentFailure,false);});
test('dispatch resolves workflow from registry and blocks duplicate key',async()=>{const {createGitHubAdapter}=await m(); let calls=[]; const gh=createGitHubAdapter({token:'x',fetchImpl:async(url,opts)=>{calls.push([url,opts]); return new Response(null,{status:204});}}); await gh.dispatchRegisteredWorkflow(agent,'RUN_NOW','abc'); await assert.rejects(()=>gh.dispatchRegisteredWorkflow(agent,'RUN_NOW','abc'),/Duplicate/); assert.match(calls[0][0],/technical-seo-watchdog.yml\/dispatches/);});
test('finds Watchdog issues by marker rather than requiring a label',async()=>{const {createGitHubAdapter}=await m(); const gh=createGitHubAdapter({token:'x',fetchImpl:fetcher([[{number:15,title:'[Technical SEO Watchdog] canonical: /',body:'<!-- technical-seo-watchdog:watchdog:canonical:/ -->',html_url:'https://github/15',state:'open',updated_at:'2026-09-13T10:00:00Z'},{number:16,title:'Other issue',body:'unrelated',html_url:'https://github/16',state:'open'}]])}); const issues=await gh.listAgentIssues(agent); assert.deepEqual(issues.map(x=>x.number),[15]);});

test('read-only GitHub calls omit Authorization when token is not configured',async()=>{
  const {createGitHubAdapter}=await m();
  const calls=[];
  const gh=createGitHubAdapter({fetchImpl:async(url,opts)=>{calls.push([url,opts]); return new Response(JSON.stringify({workflow_runs:[]}),{status:200,headers:{'content-type':'application/json'}});}});
  await gh.getWorkflowState(agent);
  assert.equal(Object.prototype.hasOwnProperty.call(calls[0][1].headers,'Authorization'),false);
});

test('write GitHub calls fail clearly when token is not configured',async()=>{
  const {createGitHubAdapter}=await m();
  const gh=createGitHubAdapter({fetchImpl:async()=>{throw new Error('should not fetch');}});
  await assert.rejects(()=>gh.dispatchRegisteredWorkflow(agent,'RUN_NOW','no-token'),/GitHub write credential not configured/);
});

test('credential diagnostics expose only safe status fields',async()=>{
  const {createGitHubAdapter}=await m();
  const responses=[
    new Response(JSON.stringify({login:'savostyanovlaw'}),{status:200,headers:{'content-type':'application/json'}}),
    new Response(JSON.stringify({full_name:'savostyanovlaw/thousandoaksinjury-automation'}),{status:200,headers:{'content-type':'application/json'}}),
    new Response(JSON.stringify({id:357353459,state:'active'}),{status:200,headers:{'content-type':'application/json'}})
  ];
  let i=0;
  const gh=createGitHubAdapter({token:'super-secret',fetchImpl:async()=>responses[i++]});
  const result=await gh.diagnoseCredential('technical-seo-watchdog.yml');
  assert.deepEqual(result,{configured:true,authStatus:200,repoStatus:200,workflowStatus:200});
  assert.equal(JSON.stringify(result).includes('super-secret'),false);
});
