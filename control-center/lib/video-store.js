// The Video Engine's post-script-approval lifecycle: a video_jobs row is
// created the moment the owner approves a video-engine script proposal (see
// approvals/[id].js's video-engine branch) and tracks it through rendering
// and, in a later stage, publication. This is deliberately a SEPARATE table
// from remediation_jobs: rendering/publishing a video is not a "remediation"
// of a finding, it is its own content-production pipeline, and conflating
// the two would make both harder to reason about.
//
// The full status set is declared now (even though this stage only ever
// produces a subset of it) so adding the publish stage later needs no
// further CHECK-constraint migration -- see remediation-store.js's own
// comment on why SQLite/D1 makes that migration expensive to repeat.
const STATUS_VALUES=[
  'RENDERING','RENDER_FAILED','VIDEO_READY_FOR_REVIEW','VIDEO_CHANGES_REQUESTED',
  'FINAL_APPROVED','PUBLISHING','PUBLISHED','PUBLISH_FAILED','REJECTED',
  'BLOCKED_HEYGEN_CONFIGURATION','BLOCKED_YOUTUBE_CONFIGURATION'
];
const TABLE=`CREATE TABLE IF NOT EXISTS video_jobs (
  id TEXT PRIMARY KEY, script_approval_id TEXT NOT NULL, source_run_id TEXT NOT NULL,
  topic TEXT NOT NULL, title TEXT NOT NULL, script TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (${STATUS_VALUES.map(s=>`'${s}'`).join(',')})),
  heygen_video_id TEXT, video_url TEXT, publish_approval_id TEXT,
  youtube_video_id TEXT, youtube_url TEXT, last_error TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
)`;
const INDEX=`CREATE INDEX IF NOT EXISTS idx_video_jobs_script_approval ON video_jobs(script_approval_id)`;
const INDEX_STATUS=`CREATE INDEX IF NOT EXISTS idx_video_jobs_status ON video_jobs(status, updated_at)`;

export async function ensureVideoSchema(db){
  if(!db?.prepare) throw new Error('Control database unavailable');
  await db.prepare(TABLE).run();
  await db.prepare(INDEX).run();
  await db.prepare(INDEX_STATUS).run();
}
// One video_job per script approval, ever -- a retried/duplicated APPROVE
// on the same script approval (the atomic decideApproval claim already
// prevents this at the approval layer, but this is a second, independent
// guard at the video_jobs layer too) must never submit a second render.
export async function createVideoJob(db,row){
  await ensureVideoSchema(db);
  const existing=await db.prepare('SELECT id FROM video_jobs WHERE script_approval_id = ? LIMIT 1').bind(row.scriptApprovalId).first();
  if(existing) return null;
  await db.prepare(`INSERT INTO video_jobs (id,script_approval_id,source_run_id,topic,title,script,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind(row.id,row.scriptApprovalId,row.sourceRunId,row.topic,row.title,row.script,row.status,row.createdAt,row.createdAt).run();
  return row;
}
export async function updateVideoJob(db,id,status,extra={}){
  await ensureVideoSchema(db);
  const now=new Date().toISOString();
  await db.prepare(`UPDATE video_jobs SET status=?,updated_at=?,heygen_video_id=COALESCE(?,heygen_video_id),video_url=COALESCE(?,video_url),publish_approval_id=COALESCE(?,publish_approval_id),youtube_video_id=COALESCE(?,youtube_video_id),youtube_url=COALESCE(?,youtube_url),last_error=COALESCE(?,last_error) WHERE id=?`)
    .bind(status,now,extra.heygenVideoId||null,extra.videoUrl||null,extra.publishApprovalId||null,extra.youtubeVideoId||null,extra.youtubeUrl||null,extra.error||null,id).run();
}
export async function getVideoJob(db,id){
  await ensureVideoSchema(db);
  return await db.prepare('SELECT id, script_approval_id as scriptApprovalId, source_run_id as sourceRunId, topic, title, script, status, heygen_video_id as heygenVideoId, video_url as videoUrl, publish_approval_id as publishApprovalId, youtube_video_id as youtubeVideoId, youtube_url as youtubeUrl, last_error as lastError, created_at as createdAt, updated_at as updatedAt FROM video_jobs WHERE id = ?').bind(id).first();
}
export async function getVideoJobByScriptApproval(db,scriptApprovalId){
  await ensureVideoSchema(db);
  return await db.prepare('SELECT id, script_approval_id as scriptApprovalId, source_run_id as sourceRunId, topic, title, script, status, heygen_video_id as heygenVideoId, video_url as videoUrl, publish_approval_id as publishApprovalId, youtube_video_id as youtubeVideoId, youtube_url as youtubeUrl, last_error as lastError, created_at as createdAt, updated_at as updatedAt FROM video_jobs WHERE script_approval_id = ?').bind(scriptApprovalId).first();
}
export async function listVideoJobsByStatus(db,status){
  await ensureVideoSchema(db);
  const {results=[]}=await db.prepare('SELECT id, script_approval_id as scriptApprovalId, source_run_id as sourceRunId, topic, title, script, status, heygen_video_id as heygenVideoId, video_url as videoUrl, publish_approval_id as publishApprovalId, youtube_video_id as youtubeVideoId, youtube_url as youtubeUrl, last_error as lastError, created_at as createdAt, updated_at as updatedAt FROM video_jobs WHERE status = ? ORDER BY updated_at ASC').bind(status).all();
  return results;
}
// A video_job that is blocked on missing configuration, or that failed
// rendering/publication, would otherwise be invisible to the owner: the
// script approval that created it is already consumed, and (for a blocked
// or render-failed job) no PUBLISH_VIDEO approval was ever created to
// surface it in Needs Approval either. See state.js's attention feed.
const NEEDS_ATTENTION_STATUSES=['BLOCKED_HEYGEN_CONFIGURATION','RENDER_FAILED','BLOCKED_YOUTUBE_CONFIGURATION','PUBLISH_FAILED'];
export async function listVideoJobsNeedingAttention(db){
  await ensureVideoSchema(db);
  const placeholders=NEEDS_ATTENTION_STATUSES.map(()=>'?').join(',');
  const {results=[]}=await db.prepare(`SELECT id, script_approval_id as scriptApprovalId, topic, title, status, last_error as lastError, updated_at as updatedAt FROM video_jobs WHERE status IN (${placeholders}) ORDER BY updated_at DESC`).bind(...NEEDS_ATTENTION_STATUSES).all();
  return results;
}
export async function listVideoJobs(db){
  await ensureVideoSchema(db);
  const {results=[]}=await db.prepare('SELECT id, script_approval_id as scriptApprovalId, source_run_id as sourceRunId, topic, title, script, status, heygen_video_id as heygenVideoId, video_url as videoUrl, publish_approval_id as publishApprovalId, youtube_video_id as youtubeVideoId, youtube_url as youtubeUrl, last_error as lastError, created_at as createdAt, updated_at as updatedAt FROM video_jobs ORDER BY created_at DESC LIMIT 100').all();
  return results;
}
