const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {createSqliteD1}=require('./sqlite-d1.cjs');

async function heygenModule(){return import(pathToFileURL(process.cwd()+'/control-center/lib/heygen.js'));}
async function videoStore(){return import(pathToFileURL(process.cwd()+'/control-center/lib/video-store.js'));}
async function videoPipeline(){return import(pathToFileURL(process.cwd()+'/control-center/lib/video-pipeline.js'));}
async function approvalStore(){return import(pathToFileURL(process.cwd()+'/control-center/lib/approval-store.js'));}
async function approvalsModule(){return import(pathToFileURL(process.cwd()+'/control-center/functions/api/control/approvals/[id].js'));}
async function reviewModule(){return import(pathToFileURL(process.cwd()+'/control-center/functions/api/control/approvals/[id]/review.js'));}
async function authModule(){return import(pathToFileURL(process.cwd()+'/control-center/lib/auth.js'));}

// ---------- heygen.js ----------

test('createHeyGenClient is unconfigured unless api key, avatar id, and voice id are all present', async()=>{
  const {createHeyGenClient}=await heygenModule();
  assert.equal(createHeyGenClient({}).configured,false);
  assert.equal(createHeyGenClient({apiKey:'k'}).configured,false);
  assert.equal(createHeyGenClient({apiKey:'k',avatarId:'a'}).configured,false);
  assert.equal(createHeyGenClient({apiKey:'k',avatarId:'a',voiceId:'v'}).configured,true);
});

test('submitRender posts the real script to the owner\'s own avatar/voice and never a generic fallback', async()=>{
  const {createHeyGenClient}=await heygenModule();
  let capturedUrl=null, capturedBody=null, capturedHeaders=null;
  const fetchImpl=async(url,opts)=>{
    capturedUrl=String(url); capturedBody=JSON.parse(opts.body); capturedHeaders=opts.headers;
    return {ok:true,json:async()=>({data:{video_id:'vid_123'}})};
  };
  const client=createHeyGenClient({apiKey:'sk-test',avatarId:'avatar-owner',voiceId:'voice-owner',fetchImpl});
  const {videoId}=await client.submitRender('Real script text.');
  assert.equal(videoId,'vid_123');
  assert.match(capturedUrl,/\/v2\/video\/generate$/);
  assert.equal(capturedHeaders['X-Api-Key'],'sk-test');
  assert.equal(capturedBody.video_inputs[0].character.avatar_id,'avatar-owner');
  assert.equal(capturedBody.video_inputs[0].voice.voice_id,'voice-owner');
  assert.equal(capturedBody.video_inputs[0].voice.input_text,'Real script text.');
});

test('submitRender throws when not configured, without ever calling fetch', async()=>{
  const {createHeyGenClient}=await heygenModule();
  let called=false;
  const client=createHeyGenClient({fetchImpl:async()=>{called=true;}});
  await assert.rejects(()=>client.submitRender('x'),/not configured/);
  assert.equal(called,false);
});

test('pollStatus normalizes completed/failed as done and processing as not done', async()=>{
  const {createHeyGenClient}=await heygenModule();
  const makeClient=(status,extra={})=>createHeyGenClient({apiKey:'k',avatarId:'a',voiceId:'v',fetchImpl:async()=>({ok:true,json:async()=>({data:{status,...extra}})})});
  const completed=await makeClient('completed',{video_url:'https://cdn.example/video.mp4'}).pollStatus('vid_1');
  assert.equal(completed.done,true);
  assert.equal(completed.videoUrl,'https://cdn.example/video.mp4');
  const failed=await makeClient('failed',{error:{message:'render engine error'}}).pollStatus('vid_2');
  assert.equal(failed.done,true);
  assert.equal(failed.error,'render engine error');
  const processing=await makeClient('processing').pollStatus('vid_3');
  assert.equal(processing.done,false);
});

// ---------- video-store.js ----------

function baseJobRow(overrides={}){
  return {id:crypto.randomUUID(),scriptApprovalId:'sa1',sourceRunId:'100',topic:'car accidents',title:'Car Accidents: What to Know',script:'Real script.',status:'RENDERING',createdAt:new Date().toISOString(),...overrides};
}

test('createVideoJob is one-per-script-approval: a second call for the same approval returns null', async()=>{
  const {ensureVideoSchema,createVideoJob}=await videoStore();
  const db=createSqliteD1();
  await ensureVideoSchema(db);
  const first=await createVideoJob(db,baseJobRow({scriptApprovalId:'sa-dup'}));
  assert.ok(first);
  const second=await createVideoJob(db,baseJobRow({id:crypto.randomUUID(),scriptApprovalId:'sa-dup'}));
  assert.equal(second,null);
});

test('listVideoJobsNeedingAttention surfaces blocked/failed jobs but not a healthy in-progress one', async()=>{
  const {ensureVideoSchema,createVideoJob}=await videoStore();
  const {listVideoJobsNeedingAttention}=await videoStore();
  const db=createSqliteD1();
  await ensureVideoSchema(db);
  await createVideoJob(db,baseJobRow({scriptApprovalId:'sa-rendering',status:'RENDERING'}));
  await createVideoJob(db,baseJobRow({scriptApprovalId:'sa-blocked',status:'BLOCKED_HEYGEN_CONFIGURATION'}));
  await createVideoJob(db,baseJobRow({scriptApprovalId:'sa-failed',status:'RENDER_FAILED'}));
  const attention=await listVideoJobsNeedingAttention(db);
  const statuses=attention.map(j=>j.status).sort();
  assert.deepEqual(statuses,['BLOCKED_HEYGEN_CONFIGURATION','RENDER_FAILED']);
});

// ---------- video-pipeline.js ----------

test('startVideoRendering records BLOCKED_HEYGEN_CONFIGURATION when HeyGen is not configured, never a fallback render',async()=>{
  const {startVideoRendering}=await videoPipeline();
  const {ensureVideoSchema,getVideoJobByScriptApproval}=await videoStore();
  const db=createSqliteD1();
  await ensureVideoSchema(db);
  const record={id:'sa-1',targetId:'100'};
  const pkg={topic:'car accidents',title:'Car Accidents',script:'Real script.'};
  const job=await startVideoRendering({record,pkg,db,heygen:{configured:false}});
  assert.equal(job.status,'BLOCKED_HEYGEN_CONFIGURATION');
  const stored=await getVideoJobByScriptApproval(db,'sa-1');
  assert.equal(stored.status,'BLOCKED_HEYGEN_CONFIGURATION');
});

test('startVideoRendering submits a real render and stores the HeyGen video id',async()=>{
  const {startVideoRendering}=await videoPipeline();
  const {ensureVideoSchema,getVideoJobByScriptApproval}=await videoStore();
  const db=createSqliteD1();
  await ensureVideoSchema(db);
  const record={id:'sa-2',targetId:'101'};
  const pkg={topic:'slip and fall',title:'Slip and Fall',script:'Real script text.'};
  const heygen={configured:true,submitRender:async(script)=>{ assert.equal(script,'Real script text.'); return {videoId:'vid_abc'}; }};
  const job=await startVideoRendering({record,pkg,db,heygen});
  assert.equal(job.status,'RENDERING');
  assert.equal(job.heygenVideoId,'vid_abc');
  const stored=await getVideoJobByScriptApproval(db,'sa-2');
  assert.equal(stored.heygenVideoId,'vid_abc');
});

test('startVideoRendering marks RENDER_FAILED (with the real error) when the HeyGen submission itself fails',async()=>{
  const {startVideoRendering}=await videoPipeline();
  const db=createSqliteD1();
  const record={id:'sa-3',targetId:'102'};
  const pkg={topic:'t',title:'T',script:'S'};
  const heygen={configured:true,submitRender:async()=>{ throw new Error('HeyGen 503'); }};
  const job=await startVideoRendering({record,pkg,db,heygen});
  assert.equal(job.status,'RENDER_FAILED');
  assert.match(job.lastError,/HeyGen 503/);
});

test('startVideoRendering is idempotent: a second call for the same script approval never submits a second render',async()=>{
  const {startVideoRendering}=await videoPipeline();
  const db=createSqliteD1();
  const record={id:'sa-4',targetId:'103'};
  const pkg={topic:'t',title:'T',script:'S'};
  let submitCount=0;
  const heygen={configured:true,submitRender:async()=>{ submitCount++; return {videoId:`vid_${submitCount}`}; }};
  const first=await startVideoRendering({record,pkg,db,heygen});
  const second=await startVideoRendering({record,pkg,db,heygen});
  assert.equal(submitCount,1);
  assert.equal(second.id,first.id);
});

test('pollRenderingVideoJobs transitions a completed render to VIDEO_READY_FOR_REVIEW and creates a real, separate publish approval',async()=>{
  const {startVideoRendering,pollRenderingVideoJobs}=await videoPipeline();
  const {ensureVideoSchema,getVideoJobByScriptApproval}=await videoStore();
  const {ensureControlSchema,listPendingApprovals}=await approvalStore();
  const db=createSqliteD1();
  await ensureVideoSchema(db);
  await ensureControlSchema(db);
  const record={id:'sa-5',targetId:'104'};
  const pkg={topic:'t',title:'A Real Video Title',script:'Real script.'};
  const heygenSubmit={configured:true,submitRender:async()=>({videoId:'vid_ready'})};
  await startVideoRendering({record,pkg,db,heygen:heygenSubmit});
  const heygenPoll={configured:true,pollStatus:async(id)=>{ assert.equal(id,'vid_ready'); return {status:'completed',videoUrl:'https://cdn.example/final.mp4',done:true}; }};
  await pollRenderingVideoJobs({db,heygen:heygenPoll});
  const job=await getVideoJobByScriptApproval(db,'sa-5');
  assert.equal(job.status,'VIDEO_READY_FOR_REVIEW');
  assert.equal(job.videoUrl,'https://cdn.example/final.mp4');
  assert.ok(job.publishApprovalId);
  const pending=await listPendingApprovals(db);
  const publishApproval=pending.find(a=>a.id===job.publishApprovalId);
  assert.ok(publishApproval,'a real PUBLISH_VIDEO approval must exist');
  assert.equal(publishApproval.action,'PUBLISH_VIDEO');
  assert.equal(publishApproval.targetType,'video_job');
  assert.equal(publishApproval.targetId,job.id);
});

test('pollRenderingVideoJobs marks a failed render RENDER_FAILED without creating a publish approval',async()=>{
  const {startVideoRendering,pollRenderingVideoJobs}=await videoPipeline();
  const {ensureVideoSchema,getVideoJobByScriptApproval}=await videoStore();
  const {ensureControlSchema,listPendingApprovals}=await approvalStore();
  const db=createSqliteD1();
  await ensureVideoSchema(db); await ensureControlSchema(db);
  const record={id:'sa-6',targetId:'105'};
  await startVideoRendering({record,pkg:{topic:'t',title:'T',script:'S'},db,heygen:{configured:true,submitRender:async()=>({videoId:'vid_fail'})}});
  await pollRenderingVideoJobs({db,heygen:{configured:true,pollStatus:async()=>({status:'failed',error:'engine crashed',done:true})}});
  const job=await getVideoJobByScriptApproval(db,'sa-6');
  assert.equal(job.status,'RENDER_FAILED');
  assert.match(job.lastError,/engine crashed/);
  assert.equal((await listPendingApprovals(db)).length,0);
});

test('pollRenderingVideoJobs leaves a still-processing render untouched and a transient poll error does not flip it to failed',async()=>{
  const {startVideoRendering,pollRenderingVideoJobs}=await videoPipeline();
  const {ensureVideoSchema,getVideoJobByScriptApproval}=await videoStore();
  const db=createSqliteD1();
  await ensureVideoSchema(db);
  const record={id:'sa-7',targetId:'106'};
  await startVideoRendering({record,pkg:{topic:'t',title:'T',script:'S'},db,heygen:{configured:true,submitRender:async()=>({videoId:'vid_proc'})}});
  await pollRenderingVideoJobs({db,heygen:{configured:true,pollStatus:async()=>({status:'processing',done:false})}});
  assert.equal((await getVideoJobByScriptApproval(db,'sa-7')).status,'RENDERING');
  await pollRenderingVideoJobs({db,heygen:{configured:true,pollStatus:async()=>{ throw new Error('network blip'); }}});
  assert.equal((await getVideoJobByScriptApproval(db,'sa-7')).status,'RENDERING','a transient polling failure must never be mistaken for a render failure');
});

// ---------- approvals/[id].js: the actual routing fix ----------

test('approving a video-engine script proposal starts rendering instead of the generic finding/remediation path (regression: this used to land BLOCKED)',async()=>{
  const {executeApprovalDecision}=await approvalsModule();
  const {ensureControlSchema,insertApproval,getApproval}=await approvalStore();
  const {ensureVideoSchema,getVideoJobByScriptApproval}=await videoStore();
  const db=createSqliteD1();
  await ensureControlSchema(db); await ensureVideoSchema(db);
  await insertApproval(db,{id:'ap-video-1',agentId:'video-engine',action:'REVIEW_RESULT',targetType:'workflow_run',targetId:'200',targetRevision:'200',payloadHash:'h',createdAt:new Date().toISOString()});
  const record={id:'ap-video-1',agentId:'video-engine',action:'REVIEW_RESULT',targetType:'workflow_run',targetId:'200',status:'PENDING'};
  const github={getWorkflowRunReview:async()=>({reviewResult:{agent:'video-engine',topic:'car accidents',title:'Car Accidents',script:'A real script about car accidents.'}})};
  const heygen={configured:true,submitRender:async()=>({videoId:'vid_real'})};
  const result=await executeApprovalDecision({record,decision:'APPROVE',user:{email:'owner@example.com'},db,github,heygen});
  assert.equal(result.ok,true);
  assert.equal(result.videoJob.status,'RENDERING');
  assert.equal(result.videoJob.heygenVideoId,'vid_real');
  assert.equal(result.remediationJobs,undefined,'must never fall into the generic finding/remediation-job path');
  const approvalRow=await getApproval(db,'ap-video-1');
  assert.equal(approvalRow.status,'APPROVED');
  const videoJob=await getVideoJobByScriptApproval(db,'ap-video-1');
  assert.ok(videoJob,'a real video_job row must exist, never a silent no-op');
});

// Stage 2 (Approve & Publish -> YouTube) is now wired -- see
// video-engine-publish.test.cjs for its full coverage. This only checks
// that approving a PUBLISH_VIDEO approval for a video_job that does not
// actually exist fails honestly rather than silently claiming success.
test('approving a PUBLISH_VIDEO approval for a nonexistent video job fails explicitly rather than silently claiming success',async()=>{
  const {executeApprovalDecision}=await approvalsModule();
  const {ensureControlSchema,insertApproval}=await approvalStore();
  const db=createSqliteD1();
  await ensureControlSchema(db);
  await insertApproval(db,{id:'ap-publish-1',agentId:'video-engine',action:'PUBLISH_VIDEO',targetType:'video_job',targetId:'vj-does-not-exist',targetRevision:'vj-does-not-exist',payloadHash:'h',createdAt:new Date().toISOString()});
  const record={id:'ap-publish-1',agentId:'video-engine',action:'PUBLISH_VIDEO',targetType:'video_job',targetId:'vj-does-not-exist',status:'PENDING'};
  const result=await executeApprovalDecision({record,decision:'APPROVE',user:{email:'owner@example.com'},db,github:{},youtube:{configured:true}});
  assert.equal(result.ok,false);
  assert.equal(result.failed,true);
  assert.match(result.error,/Video job not found/);
});

// ---------- review.js: the video job is visible in Final Review ----------

test('the review endpoint exposes a video_job PUBLISH_VIDEO approval\'s real title/script/videoUrl',async()=>{
  const {onRequestGet}=await reviewModule();
  const {createSessionToken}=await authModule();
  const {ensureControlSchema,insertApproval}=await approvalStore();
  const {ensureVideoSchema,createVideoJob,updateVideoJob}=await videoStore();
  const db=createSqliteD1();
  await ensureControlSchema(db); await ensureVideoSchema(db);
  const job=await createVideoJob(db,baseJobRow({id:'vj-review-1',scriptApprovalId:'sa-review-1',title:'Dog Bites: Know Your Rights',script:'Real script.',status:'RENDERING'}));
  await updateVideoJob(db,job.id,'VIDEO_READY_FOR_REVIEW',{videoUrl:'https://cdn.example/dogbite.mp4'});
  await insertApproval(db,{id:'ap-review-1',agentId:'video-engine',action:'PUBLISH_VIDEO',targetType:'video_job',targetId:job.id,targetRevision:job.id,payloadHash:'h',createdAt:new Date().toISOString()});
  const env={AUTHORIZED_EMAIL:'savostyanovlaw@gmail.com',CONTROL_AUTH_PASSWORD:'example-password-long-enough-2026',CONTROL_DB:db,GITHUB_TOKEN:'ghp_test'};
  const token=await createSessionToken(env,'savostyanovlaw@gmail.com');
  const request=new Request('https://slc-ai-control.pages.dev/api/control/approvals/ap-review-1/review',{headers:{cookie:`slc_session=${token}`}});
  const response=await onRequestGet({request,env,params:{id:'ap-review-1'},data:{}});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.reviewResult.title,'Dog Bites: Know Your Rights');
  assert.equal(body.reviewResult.videoUrl,'https://cdn.example/dogbite.mp4');
  assert.equal(body.reviewResult.status,'VIDEO_READY_FOR_REVIEW');
});
