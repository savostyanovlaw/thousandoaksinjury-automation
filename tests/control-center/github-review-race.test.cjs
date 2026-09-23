const test=require('node:test'); const assert=require('node:assert/strict'); const {pathToFileURL}=require('node:url');
async function m(){return import(pathToFileURL(process.cwd()+'/control-center/lib/github.js'));}

// A producing workflow's own "Notify Control Center" step calls the ingest
// endpoint -- which calls getWorkflowRunReview -- from INSIDE that same
// still-running job, immediately after the preceding step printed the
// SLC_REVIEW_JSON_B64 marker. The very first read of that job's own logs
// can race GitHub's own log-finalization for the step that just ran; these
// tests prove the bounded retry absorbs that race instead of returning an
// empty review (which would silently strand a fully-GREEN report PENDING
// forever, since dashboard-load reconciliation never retries an approval
// that already exists).

test('getWorkflowRunReview retries when the review marker is not yet in the job log (self-referential ingest race)',async()=>{
  const {createGitHubAdapter}=await m();
  let jobLogCalls=0;
  const fetchImpl=async(url)=>{
    if(url.includes('/actions/jobs/99/logs')){
      jobLogCalls++;
      const body=jobLogCalls<3 ? 'no marker yet' : 'SLC_REVIEW_JSON_B64='+Buffer.from(JSON.stringify({findings:[{findingType:'e2e_fixture_marker'}]})).toString('base64');
      return new Response(body,{status:200});
    }
    if(url.includes('/actions/runs/42/artifacts')) return new Response(JSON.stringify({artifacts:[]}),{status:200,headers:{'content-type':'application/json'}});
    if(url.includes('/actions/runs/42/jobs')) return new Response(JSON.stringify({jobs:[{id:99}]}),{status:200,headers:{'content-type':'application/json'}});
    if(url.includes('/actions/runs/42')) return new Response(JSON.stringify({id:42,status:'in_progress',conclusion:null,created_at:'x',updated_at:'x',html_url:'u',head_sha:'s',event:'workflow_dispatch'}),{status:200,headers:{'content-type':'application/json'}});
    throw new Error('unexpected url '+url);
  };
  const sleeps=[];
  const gh=createGitHubAdapter({token:'x',fetchImpl,sleepImpl:async(ms)=>{sleeps.push(ms);}});
  const review=await gh.getWorkflowRunReview(42);
  assert.equal(jobLogCalls,3);
  assert.ok(review.reviewResult);
  assert.equal(review.reviewResult.findings[0].findingType,'e2e_fixture_marker');
  assert.deepEqual(sleeps,[1500,1500]);
});

test('getWorkflowRunReview gives up after bounded retries rather than retrying forever',async()=>{
  const {createGitHubAdapter}=await m();
  let jobLogCalls=0;
  const fetchImpl=async(url)=>{
    if(url.includes('/logs')){ jobLogCalls++; return new Response('never has the marker',{status:200}); }
    if(url.includes('/artifacts')) return new Response(JSON.stringify({artifacts:[]}),{status:200,headers:{'content-type':'application/json'}});
    if(url.includes('/jobs')) return new Response(JSON.stringify({jobs:[{id:1}]}),{status:200,headers:{'content-type':'application/json'}});
    if(url.includes('/actions/runs/7')) return new Response(JSON.stringify({id:7,status:'completed',conclusion:'success',created_at:'x',updated_at:'x',html_url:'u',head_sha:'s',event:'push'}),{status:200,headers:{'content-type':'application/json'}});
    throw new Error('unexpected url '+url);
  };
  let sleepCount=0;
  const gh=createGitHubAdapter({token:'x',fetchImpl,sleepImpl:async()=>{sleepCount++;}});
  const review=await gh.getWorkflowRunReview(7);
  assert.equal(review.reviewResult,null);
  assert.equal(jobLogCalls,4);
  assert.equal(sleepCount,3);
});

test('getWorkflowRunReview follows the real GitHub job-logs redirect to Azure Blob Storage without replaying the GitHub bearer token onto it',async()=>{
  // GitHub's job-logs endpoint really responds 302 to a pre-signed Azure
  // Blob Storage URL. Confirmed live in production: Cloudflare Workers'
  // fetch (unlike a browser) forwards the original request's headers,
  // including Authorization, across that cross-origin redirect when
  // redirect:'follow' is used -- Azure then rejects the extra Authorization
  // header, so the real review marker (present in the real log) was never
  // found. No earlier test simulated an actual redirect response, so this
  // never surfaced until a live production run.
  const {createGitHubAdapter}=await m();
  const calls=[];
  const fetchImpl=async(url,opts={})=>{
    calls.push({url:String(url),headers:{...(opts.headers||{})}});
    if(String(url).includes('/actions/jobs/1/logs')){
      return new Response(null,{status:302,headers:{location:'https://productionresultssa.blob.core.windows.net/actions-results/fake?sig=abc'}});
    }
    if(String(url).includes('blob.core.windows.net')){
      return new Response('SLC_REVIEW_JSON_B64='+Buffer.from(JSON.stringify({approvalState:'NOT_REQUIRED'})).toString('base64'),{status:200});
    }
    if(String(url).includes('/artifacts')) return new Response(JSON.stringify({artifacts:[]}),{status:200,headers:{'content-type':'application/json'}});
    if(String(url).includes('/jobs')) return new Response(JSON.stringify({jobs:[{id:1}]}),{status:200,headers:{'content-type':'application/json'}});
    if(String(url).includes('/actions/runs/11')) return new Response(JSON.stringify({id:11,status:'completed',conclusion:'success',created_at:'x',updated_at:'x',html_url:'u',head_sha:'s',event:'workflow_dispatch'}),{status:200,headers:{'content-type':'application/json'}});
    throw new Error('unexpected url '+url);
  };
  const gh=createGitHubAdapter({token:'real-github-token',fetchImpl,sleepImpl:async()=>{}});
  const review=await gh.getWorkflowRunReview(11);
  assert.equal(review.reviewResult.approvalState,'NOT_REQUIRED','the marker on the far side of the redirect must be found and parsed');
  const blobCall=calls.find(c=>c.url.includes('blob.core.windows.net'));
  assert.ok(blobCall,'the redirect target must actually be fetched');
  assert.equal(blobCall.headers.Authorization,undefined,'the GitHub bearer token must never be replayed onto the Azure Blob Storage redirect target');
  const jobLogsCall=calls.find(c=>c.url.includes('/actions/jobs/1/logs'));
  assert.equal(jobLogsCall.headers.Authorization,'Bearer real-github-token','the GitHub API call itself must still be authenticated');
});

// Regression: cleanupApprovalQueue processes every PENDING approval in one
// Cloudflare Worker invocation, which has a hard cap on outbound
// subrequests; the real-time ingest path's defaults (4 retry attempts,
// always fetching the artifacts list) were confirmed live in production to
// exhaust that budget partway through a batch of ~31 approvals, after which
// every remaining approval's getWorkflowRunReview call threw "Too many
// subrequests by single Worker invocation" and was silently misclassified.
// These options let a batch caller opt into the minimal-subrequest variant
// (queue-cleanup.js does, since every run it looks at already finished --
// no ingest race is possible -- and it never reads .artifacts).
test('getWorkflowRunReview: maxAttempts:1 makes exactly one attempt with no retry sleep, even with no marker found',async()=>{
  const {createGitHubAdapter}=await m();
  let jobLogCalls=0;
  const fetchImpl=async(url)=>{
    if(url.includes('/logs')){ jobLogCalls++; return new Response('never has the marker',{status:200}); }
    if(url.includes('/jobs')) return new Response(JSON.stringify({jobs:[{id:1}]}),{status:200,headers:{'content-type':'application/json'}});
    if(url.includes('/actions/runs/50')) return new Response(JSON.stringify({id:50,status:'completed',conclusion:'success',created_at:'x',updated_at:'x',html_url:'u',head_sha:'s',event:'push'}),{status:200,headers:{'content-type':'application/json'}});
    throw new Error('unexpected url (artifacts must not be fetched) '+url);
  };
  let sleepCount=0;
  const gh=createGitHubAdapter({token:'x',fetchImpl,sleepImpl:async()=>{sleepCount++;}});
  const review=await gh.getWorkflowRunReview(50,{maxAttempts:1,fetchArtifacts:false});
  assert.equal(review.reviewResult,null);
  assert.equal(jobLogCalls,1,'no retry -- exactly one attempt');
  assert.equal(sleepCount,0);
  assert.deepEqual(review.artifacts,[],'fetchArtifacts:false must never call the artifacts endpoint');
});

test('getWorkflowRunReview needs no retry when the marker is already present on the first read',async()=>{
  const {createGitHubAdapter}=await m();
  let jobLogCalls=0;
  let sleepCount=0;
  const fetchImpl=async(url)=>{
    if(url.includes('/logs')){
      jobLogCalls++;
      return new Response('SLC_REVIEW_JSON_B64='+Buffer.from(JSON.stringify({findings:[]})).toString('base64'),{status:200});
    }
    if(url.includes('/artifacts')) return new Response(JSON.stringify({artifacts:[]}),{status:200,headers:{'content-type':'application/json'}});
    if(url.includes('/jobs')) return new Response(JSON.stringify({jobs:[{id:5}]}),{status:200,headers:{'content-type':'application/json'}});
    if(url.includes('/actions/runs/9')) return new Response(JSON.stringify({id:9,status:'completed',conclusion:'success',created_at:'x',updated_at:'x',html_url:'u',head_sha:'s',event:'push'}),{status:200,headers:{'content-type':'application/json'}});
    throw new Error('unexpected url '+url);
  };
  const gh=createGitHubAdapter({token:'x',fetchImpl,sleepImpl:async()=>{sleepCount++;}});
  const review=await gh.getWorkflowRunReview(9);
  assert.ok(review.reviewResult);
  assert.equal(jobLogCalls,1);
  assert.equal(sleepCount,0);
});
