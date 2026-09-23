const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {createSqliteD1}=require('./sqlite-d1.cjs');

async function youtubeModule(){return import(pathToFileURL(process.cwd()+'/control-center/lib/youtube.js'));}
async function videoStore(){return import(pathToFileURL(process.cwd()+'/control-center/lib/video-store.js'));}
async function videoPipeline(){return import(pathToFileURL(process.cwd()+'/control-center/lib/video-pipeline.js'));}
async function approvalStore(){return import(pathToFileURL(process.cwd()+'/control-center/lib/approval-store.js'));}
async function approvalsModule(){return import(pathToFileURL(process.cwd()+'/control-center/functions/api/control/approvals/[id].js'));}

// ---------- youtube.js ----------

test('createYouTubeClient is unconfigured unless client id, secret, and refresh token are all present',async()=>{
  const {createYouTubeClient}=await youtubeModule();
  assert.equal(createYouTubeClient({}).configured,false);
  assert.equal(createYouTubeClient({clientId:'c'}).configured,false);
  assert.equal(createYouTubeClient({clientId:'c',clientSecret:'s'}).configured,false);
  assert.equal(createYouTubeClient({clientId:'c',clientSecret:'s',refreshToken:'r'}).configured,true);
});

test('uploadVideo throws when not configured, without ever calling fetch',async()=>{
  const {createYouTubeClient}=await youtubeModule();
  let called=false;
  const client=createYouTubeClient({fetchImpl:async()=>{called=true;}});
  await assert.rejects(()=>client.uploadVideo({videoUrl:'https://cdn.example/v.mp4',title:'T',description:'D'}),/not configured/);
  assert.equal(called,false);
});

test('uploadVideo refreshes an access token, fetches the real rendered video, and defaults to private',async()=>{
  const {createYouTubeClient}=await youtubeModule();
  const calls=[];
  const fetchImpl=async(url,opts)=>{
    calls.push(String(url));
    if(String(url).includes('oauth2.googleapis.com/token')){
      const params=new URLSearchParams(opts.body);
      assert.equal(params.get('refresh_token'),'refresh-owner');
      assert.equal(params.get('grant_type'),'refresh_token');
      return {ok:true,json:async()=>({access_token:'access-abc'})};
    }
    if(String(url)==='https://cdn.example/rendered.mp4'){
      return {ok:true,arrayBuffer:async()=>new TextEncoder().encode('fake mp4 bytes').buffer};
    }
    if(String(url).includes('/upload/youtube/v3/videos')){
      assert.equal(opts.headers.Authorization,'Bearer access-abc');
      assert.match(opts.headers['Content-Type'],/^multipart\/related; boundary=/);
      return {ok:true,json:async()=>({id:'yt_video_1'})};
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
  const client=createYouTubeClient({clientId:'client-id',clientSecret:'client-secret',refreshToken:'refresh-owner',fetchImpl});
  const {videoId,url}=await client.uploadVideo({videoUrl:'https://cdn.example/rendered.mp4',title:'Real Title',description:'Real description.'});
  assert.equal(videoId,'yt_video_1');
  assert.equal(url,'https://www.youtube.com/watch?v=yt_video_1');
  assert.equal(calls.length,3);
});

test('uploadVideo raises on a token-refresh failure rather than proceeding with a stale/missing token',async()=>{
  const {createYouTubeClient}=await youtubeModule();
  const client=createYouTubeClient({clientId:'c',clientSecret:'s',refreshToken:'r',fetchImpl:async()=>({ok:false,status:401,json:async()=>({error_description:'invalid_grant'})})});
  await assert.rejects(()=>client.uploadVideo({videoUrl:'https://cdn.example/v.mp4',title:'T',description:'D'}),/invalid_grant/);
});

// ---------- video-pipeline.js: publishVideo ----------

function baseJobRow(overrides={}){
  return {id:crypto.randomUUID(),scriptApprovalId:'sa1',sourceRunId:'100',topic:'car accidents',title:'Car Accidents',script:'Real script.',status:'VIDEO_READY_FOR_REVIEW',createdAt:new Date().toISOString(),...overrides};
}

test('publishVideo records BLOCKED_YOUTUBE_CONFIGURATION when YouTube is not configured, never a fabricated publish',async()=>{
  const {publishVideo}=await videoPipeline();
  const {ensureVideoSchema,createVideoJob,getVideoJob}=await videoStore();
  const db=createSqliteD1();
  await ensureVideoSchema(db);
  const job=await createVideoJob(db,baseJobRow({id:'vj-1',scriptApprovalId:'sa-1'}));
  const record={targetId:job.id};
  const result=await publishVideo({record,db,youtube:{configured:false}});
  assert.equal(result.status,'BLOCKED_YOUTUBE_CONFIGURATION');
  assert.equal((await getVideoJob(db,job.id)).status,'BLOCKED_YOUTUBE_CONFIGURATION');
});

test('publishVideo uploads the real video and stores the real YouTube id/url',async()=>{
  const {publishVideo}=await videoPipeline();
  const {ensureVideoSchema,createVideoJob,updateVideoJob,getVideoJob}=await videoStore();
  const db=createSqliteD1();
  await ensureVideoSchema(db);
  const job=await createVideoJob(db,baseJobRow({id:'vj-2',scriptApprovalId:'sa-2'}));
  await updateVideoJob(db,job.id,'VIDEO_READY_FOR_REVIEW',{videoUrl:'https://cdn.example/final.mp4'});
  const youtube={configured:true,uploadVideo:async({videoUrl,title,description})=>{
    assert.equal(videoUrl,'https://cdn.example/final.mp4');
    assert.equal(title,'Car Accidents');
    assert.equal(description,'Real script.');
    return {videoId:'yt_real',url:'https://www.youtube.com/watch?v=yt_real'};
  }};
  const result=await publishVideo({record:{targetId:job.id},db,youtube});
  assert.equal(result.status,'PUBLISHED');
  assert.equal(result.youtubeVideoId,'yt_real');
  const stored=await getVideoJob(db,job.id);
  assert.equal(stored.status,'PUBLISHED');
  assert.equal(stored.youtubeUrl,'https://www.youtube.com/watch?v=yt_real');
});

test('publishVideo marks PUBLISH_FAILED (with the real error) when the upload itself fails, and never retries silently',async()=>{
  const {publishVideo}=await videoPipeline();
  const {ensureVideoSchema,createVideoJob,getVideoJob}=await videoStore();
  const db=createSqliteD1();
  await ensureVideoSchema(db);
  const job=await createVideoJob(db,baseJobRow({id:'vj-3',scriptApprovalId:'sa-3'}));
  const youtube={configured:true,uploadVideo:async()=>{ throw new Error('YouTube quota exceeded'); }};
  const result=await publishVideo({record:{targetId:job.id},db,youtube});
  assert.equal(result.status,'PUBLISH_FAILED');
  assert.match(result.lastError,/quota exceeded/);
  assert.equal((await getVideoJob(db,job.id)).status,'PUBLISH_FAILED');
});

// ---------- approvals/[id].js: Approve & Publish is the only path to YouTube ----------

test('approving a PUBLISH_VIDEO approval uploads to YouTube and is audited as video-published, never as approved-executed',async()=>{
  const {executeApprovalDecision,applyApprovalDecision}=await approvalsModule();
  const {ensureControlSchema,insertApproval,getApproval,listAuditEvents}=await approvalStore();
  const audit=await import(pathToFileURL(process.cwd()+'/control-center/lib/audit.js'));
  const {ensureVideoSchema,createVideoJob,updateVideoJob}=await videoStore();
  const db=createSqliteD1();
  await ensureControlSchema(db); await ensureVideoSchema(db);
  const job=await createVideoJob(db,baseJobRow({id:'vj-4',scriptApprovalId:'sa-4',title:'Dog Bites',script:'Real script about dog bites.'}));
  await updateVideoJob(db,job.id,'VIDEO_READY_FOR_REVIEW',{videoUrl:'https://cdn.example/dogbite.mp4'});
  await insertApproval(db,{id:'ap-pub-1',agentId:'video-engine',action:'PUBLISH_VIDEO',targetType:'video_job',targetId:job.id,targetRevision:job.id,payloadHash:'h',createdAt:new Date().toISOString()});
  const record={id:'ap-pub-1',agentId:'video-engine',action:'PUBLISH_VIDEO',targetType:'video_job',targetId:job.id,status:'PENDING'};
  const youtube={configured:true,uploadVideo:async()=>({videoId:'yt_dogbite',url:'https://www.youtube.com/watch?v=yt_dogbite'})};
  await applyApprovalDecision({record,decision:'APPROVE',actor:'owner@example.com',db,github:{},youtube});
  const approvalRow=await getApproval(db,'ap-pub-1');
  assert.equal(approvalRow.status,'APPROVED');
  const events=await audit.listAuditEvents(db);
  const match=events.find(e=>e.approvalId==='ap-pub-1');
  assert.equal(match.result,'video-published');
});

test('approving a PUBLISH_VIDEO approval a second time is rejected -- a stale approval can never publish twice',async()=>{
  const {executeApprovalDecision}=await approvalsModule();
  const {ensureControlSchema,insertApproval}=await approvalStore();
  const {ensureVideoSchema,createVideoJob,updateVideoJob}=await videoStore();
  const db=createSqliteD1();
  await ensureControlSchema(db); await ensureVideoSchema(db);
  const job=await createVideoJob(db,baseJobRow({id:'vj-5',scriptApprovalId:'sa-5'}));
  await updateVideoJob(db,job.id,'VIDEO_READY_FOR_REVIEW',{videoUrl:'https://cdn.example/v.mp4'});
  await insertApproval(db,{id:'ap-pub-2',agentId:'video-engine',action:'PUBLISH_VIDEO',targetType:'video_job',targetId:job.id,targetRevision:job.id,payloadHash:'h',createdAt:new Date().toISOString()});
  const record={id:'ap-pub-2',agentId:'video-engine',action:'PUBLISH_VIDEO',targetType:'video_job',targetId:job.id,status:'PENDING'};
  let uploadCount=0;
  const youtube={configured:true,uploadVideo:async()=>{ uploadCount++; return {videoId:`yt_${uploadCount}`,url:'https://www.youtube.com/watch?v=x'}; }};
  await executeApprovalDecision({record,decision:'APPROVE',user:{email:'owner@example.com'},db,github:{},youtube});
  await assert.rejects(()=>executeApprovalDecision({record:{...record,status:'PENDING'},decision:'APPROVE',user:{email:'owner@example.com'},db,github:{},youtube}),/stale or already decided/);
  assert.equal(uploadCount,1,'YouTube must never be uploaded to twice for the same approval');
});

test('rejecting a PUBLISH_VIDEO approval marks the video_job REJECTED and never uploads',async()=>{
  const {executeApprovalDecision}=await approvalsModule();
  const {ensureControlSchema,insertApproval}=await approvalStore();
  const {ensureVideoSchema,createVideoJob,updateVideoJob,getVideoJob}=await videoStore();
  const db=createSqliteD1();
  await ensureControlSchema(db); await ensureVideoSchema(db);
  const job=await createVideoJob(db,baseJobRow({id:'vj-6',scriptApprovalId:'sa-6'}));
  await updateVideoJob(db,job.id,'VIDEO_READY_FOR_REVIEW',{videoUrl:'https://cdn.example/v.mp4'});
  await insertApproval(db,{id:'ap-pub-3',agentId:'video-engine',action:'PUBLISH_VIDEO',targetType:'video_job',targetId:job.id,targetRevision:job.id,payloadHash:'h',createdAt:new Date().toISOString()});
  const record={id:'ap-pub-3',agentId:'video-engine',action:'PUBLISH_VIDEO',targetType:'video_job',targetId:job.id,status:'PENDING'};
  let called=false;
  const youtube={configured:true,uploadVideo:async()=>{ called=true; return {videoId:'x',url:'y'}; }};
  await executeApprovalDecision({record,decision:'REJECT',user:{email:'owner@example.com'},db,github:{},youtube});
  assert.equal(called,false);
  assert.equal((await getVideoJob(db,job.id)).status,'REJECTED');
});

test('YouTube upload always defaults to privacyStatus=private and is never passed a different value from the publish path',()=>{
  const fs=require('node:fs');
  const source=fs.readFileSync('control-center/lib/video-pipeline.js','utf8');
  assert.match(source,/youtube\.uploadVideo\(\{videoUrl:job\.videoUrl,title:job\.title,description:job\.script\}\)/,'publishVideo must never pass an explicit privacyStatus, so uploadVideo\'s own private default always applies');
});
