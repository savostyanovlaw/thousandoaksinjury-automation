import { createVideoJob, updateVideoJob, getVideoJob, getVideoJobByScriptApproval, listVideoJobsByStatus } from './video-store.js';
import { insertApproval } from './approval-store.js';
import { targetHash } from './approvals.js';

// Stage 1 of the Video Engine pipeline: called the moment the owner
// approves a video-engine script proposal. Approving the script authorizes
// RENDERING ONLY -- it never authorizes YouTube publication (see
// video-store.js's status set and approvals/[id].js's separate PUBLISH_VIDEO
// approval, created only once a video is actually ready for review).
export async function startVideoRendering({record,pkg,db,heygen}){
  // Idempotent: decideApproval's own atomic PENDING->APPROVED claim already
  // means this only ever runs once per approval in practice, but this is a
  // second, independent guard at the video_jobs layer -- a retried call
  // must never submit a second real HeyGen render.
  const existing=await getVideoJobByScriptApproval(db,record.id);
  if(existing) return existing;
  const script=String(pkg?.script||'');
  const title=String(pkg?.title||'Untitled video');
  const topic=String(pkg?.topic||'');
  const base={id:crypto.randomUUID(),scriptApprovalId:record.id,sourceRunId:String(record.targetId),topic,title,script,createdAt:new Date().toISOString()};
  if(!heygen?.configured){
    // A genuine, precisely identifiable external blocker -- never a
    // fallback to a public/generic avatar or a different voice. See
    // heygen.js's own comment.
    const created=await createVideoJob(db,{...base,status:'BLOCKED_HEYGEN_CONFIGURATION'});
    return created||await getVideoJobByScriptApproval(db,record.id);
  }
  let videoId=null,status='RENDERING',error=null;
  try{
    ({videoId}=await heygen.submitRender(script));
  }catch(err){
    status='RENDER_FAILED';
    error=String(err?.message||err).slice(0,300);
  }
  const created=await createVideoJob(db,{...base,status});
  if(!created) return await getVideoJobByScriptApproval(db,record.id);
  if(videoId||error) await updateVideoJob(db,created.id,status,{heygenVideoId:videoId,error});
  return {...created,status,heygenVideoId:videoId,lastError:error};
}

// Called from state.js's dashboard-load reconciliation, mirroring exactly
// how maybeAutoRemediateGreenReport's own retry loop already works: HeyGen
// renders asynchronously (Workflow B in the legacy n8n pipeline polls it the
// same way), so a video_job left RENDERING needs to be checked again on a
// later load rather than blocking the original approval request on it.
export async function pollRenderingVideoJobs({db,heygen}){
  if(!heygen?.configured) return;
  const pending=await listVideoJobsByStatus(db,'RENDERING');
  for(const job of pending){
    if(!job.heygenVideoId) continue;
    let result;
    try{
      result=await heygen.pollStatus(job.heygenVideoId);
    }catch{
      // A transient polling failure (network blip) must not flip a
      // genuinely still-rendering job to failed -- leave it RENDERING and
      // let the next dashboard load try again.
      continue;
    }
    if(!result.done) continue;
    if(result.status==='completed' && result.videoUrl){
      // The finished video needs its OWN approval, separate from the
      // script approval that only ever authorized rendering -- Stage 2
      // (Approve & Publish) is a distinct, later, revision-bound decision.
      const payload={agentId:'video-engine',action:'PUBLISH_VIDEO',targetType:'video_job',targetId:job.id,targetRevision:job.id};
      const publishApprovalId=crypto.randomUUID();
      await insertApproval(db,{...payload,id:publishApprovalId,payloadHash:await targetHash(payload),createdAt:new Date().toISOString()});
      await updateVideoJob(db,job.id,'VIDEO_READY_FOR_REVIEW',{videoUrl:result.videoUrl,publishApprovalId});
    }else{
      await updateVideoJob(db,job.id,'RENDER_FAILED',{error:result.error||'HeyGen reported a failed render'});
    }
  }
}

// Stage 2: called only from a PUBLISH_VIDEO/video_job approval's own
// Approve decision (see approvals/[id].js) -- a completely separate,
// later, revision-bound decision from Stage 1's script approval. The
// approval's own atomic PENDING->APPROVED claim (decideApproval) is what
// guarantees this runs at most once per approval, exactly like every other
// RED/approval-gated action in this file; there is no second guard here
// because a video_job only ever has one PUBLISH_VIDEO approval created for
// it in the first place (see pollRenderingVideoJobs above).
export async function publishVideo({record,db,youtube}){
  const job=await getVideoJob(db,record.targetId);
  if(!job) throw new Error('Video job not found');
  if(!youtube?.configured){
    // A genuine, precisely identifiable external blocker -- never a
    // fabricated publish result.
    await updateVideoJob(db,job.id,'BLOCKED_YOUTUBE_CONFIGURATION',{});
    return {...job,status:'BLOCKED_YOUTUBE_CONFIGURATION'};
  }
  await updateVideoJob(db,job.id,'PUBLISHING',{});
  try{
    // privacyStatus is never passed here -- uploadVideo's own default
    // ('private') is what every real publish through this code path gets.
    // Making a video public is a separate, explicit owner action taken
    // directly in YouTube Studio, never something this pipeline decides.
    const {videoId,url}=await youtube.uploadVideo({videoUrl:job.videoUrl,title:job.title,description:job.script});
    await updateVideoJob(db,job.id,'PUBLISHED',{youtubeVideoId:videoId,youtubeUrl:url});
    return {...job,status:'PUBLISHED',youtubeVideoId:videoId,youtubeUrl:url};
  }catch(error){
    const message=String(error?.message||error).slice(0,300);
    await updateVideoJob(db,job.id,'PUBLISH_FAILED',{error:message});
    return {...job,status:'PUBLISH_FAILED',lastError:message};
  }
}
