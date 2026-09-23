const STATUS_VALUES=['QUEUED','DISPATCHED','PREPARED','MERGED','VERIFIED','ROLLED_BACK','BLOCKED','ESCALATED','FAILED'];
const TABLE=`CREATE TABLE IF NOT EXISTS remediation_jobs (
 id TEXT PRIMARY KEY, source_agent_id TEXT NOT NULL, source_run_id TEXT NOT NULL, owner_approval_id TEXT NOT NULL, finding_type TEXT NOT NULL,
 summary TEXT NOT NULL, recommended_action TEXT NOT NULL, raw_finding_json TEXT NOT NULL DEFAULT '{}', remediation_agent_id TEXT,
 autonomy TEXT NOT NULL DEFAULT 'YELLOW', attempt_count INTEGER NOT NULL DEFAULT 0, last_error TEXT, verified_at TEXT,
 status TEXT NOT NULL CHECK (status IN (${STATUS_VALUES.map(s=>`'${s}'`).join(',')})), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 workflow_run_id TEXT, pull_request_number INTEGER, pull_request_revision TEXT)`;
const INDEX=`CREATE INDEX IF NOT EXISTS idx_remediation_owner_approval ON remediation_jobs(owner_approval_id)`;
const INDEX_TYPE=`CREATE INDEX IF NOT EXISTS idx_remediation_finding_type ON remediation_jobs(finding_type, source_agent_id, created_at DESC)`;

// A single owner approval can carry several actionable findings (a
// multi-finding technical SEO report, for example), and every finding gets
// its own remediation job. An earlier schema mistakenly declared
// owner_approval_id UNIQUE, which silently dropped every finding after the
// first in a multi-finding approval (the INSERT failed and the caller
// swallowed the constraint error). This migrates any live table created
// under that mistaken schema, or under the earlier (smaller) status enum
// that had no room for the GREEN closed-loop's MERGED/VERIFIED/ROLLED_BACK/
// ESCALATED states, to the corrected shape without losing rows: real
// SQLite (D1) has no ALTER TABLE that can change a CHECK constraint or drop
// UNIQUE, so the only safe path is create-copy-drop-rename, gated on
// detecting either legacy shape so it only ever runs once and is a no-op
// afterward. New columns (autonomy/attempt_count/last_error/verified_at)
// are added separately via plain ADD COLUMN, which IS safe in SQLite and
// needs no table rebuild.
async function migrateLegacySchema(db){
  let legacy;
  try{
    legacy=await db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='remediation_jobs'").first();
  }catch{ return; }
  const sql=legacy?.sql;
  if(typeof sql!=='string') return;
  const hasLegacyUnique=/owner_approval_id\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(sql);
  const hasNarrowStatusEnum=!/'ESCALATED'/i.test(sql);
  if(!hasLegacyUnique && !hasNarrowStatusEnum) return;
  await db.prepare(TABLE.replace('remediation_jobs','remediation_jobs_migrated')).run();
  // The old table may be missing the new columns entirely (pre-dates this
  // change) or may already have them (only the UNIQUE/status-enum shape is
  // stale) -- SELECT the columns the OLD table is guaranteed to have and
  // let the new columns default, rather than SELECT * which would break if
  // the column sets don't match exactly.
  await db.prepare(`INSERT INTO remediation_jobs_migrated
    (id,source_agent_id,source_run_id,owner_approval_id,finding_type,summary,recommended_action,raw_finding_json,remediation_agent_id,status,created_at,updated_at,workflow_run_id,pull_request_number,pull_request_revision)
    SELECT id,source_agent_id,source_run_id,owner_approval_id,finding_type,summary,recommended_action,raw_finding_json,remediation_agent_id,status,created_at,updated_at,workflow_run_id,pull_request_number,pull_request_revision
    FROM remediation_jobs`).run();
  await db.prepare('DROP TABLE remediation_jobs').run();
  await db.prepare('ALTER TABLE remediation_jobs_migrated RENAME TO remediation_jobs').run();
}

async function addColumnIfMissing(db,column,definition){
  try{
    await db.prepare(`ALTER TABLE remediation_jobs ADD COLUMN ${column} ${definition}`).run();
  }catch(error){
    if(!/duplicate column|already exists/i.test(String(error?.message||error))) throw error;
  }
}

export async function ensureRemediationSchema(db){
  if(!db?.prepare)throw new Error('Control database unavailable');
  await db.prepare(TABLE).run();
  await migrateLegacySchema(db);
  await addColumnIfMissing(db,'autonomy',"TEXT NOT NULL DEFAULT 'YELLOW'");
  await addColumnIfMissing(db,'attempt_count','INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing(db,'last_error','TEXT');
  await addColumnIfMissing(db,'verified_at','TEXT');
  await db.prepare(INDEX).run();
  await db.prepare(INDEX_TYPE).run();
}
export async function createRemediationJob(db,row){
  await ensureRemediationSchema(db);
  await db.prepare(`INSERT INTO remediation_jobs (id,source_agent_id,source_run_id,owner_approval_id,finding_type,summary,recommended_action,raw_finding_json,remediation_agent_id,autonomy,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,'QUEUED',?,?)`)
    .bind(row.id,row.sourceAgentId,row.sourceRunId,row.ownerApprovalId,row.findingType,row.summary,row.recommendedAction,JSON.stringify(row.rawFinding||{}),row.remediationAgentId||null,row.autonomy||'YELLOW',row.createdAt,row.createdAt).run();
  return row;
}
export async function updateRemediationJob(db,id,status,extra={}){
  await ensureRemediationSchema(db);
  const now=new Date().toISOString();
  await db.prepare(`UPDATE remediation_jobs SET status=?,updated_at=?,workflow_run_id=COALESCE(?,workflow_run_id),pull_request_number=COALESCE(?,pull_request_number),pull_request_revision=COALESCE(?,pull_request_revision),last_error=COALESCE(?,last_error),verified_at=COALESCE(?,verified_at) WHERE id=?`)
    .bind(status,now,extra.workflowRunId||null,extra.pullRequestNumber||null,extra.pullRequestRevision||null,extra.error||null,extra.verifiedAt||null,id).run();
}
export async function incrementRemediationAttempt(db,id){
  await ensureRemediationSchema(db);
  const now=new Date().toISOString();
  await db.prepare(`UPDATE remediation_jobs SET attempt_count=attempt_count+1,updated_at=? WHERE id=?`).bind(now,id).run();
}
export async function listRemediationJobs(db){
  await ensureRemediationSchema(db);
  const {results=[]}=await db.prepare(`SELECT id,source_agent_id sourceAgentId,source_run_id sourceRunId,owner_approval_id ownerApprovalId,finding_type findingType,summary,recommended_action recommendedAction,remediation_agent_id remediationAgentId,autonomy,attempt_count attemptCount,last_error lastError,verified_at verifiedAt,status,created_at createdAt,updated_at updatedAt,workflow_run_id workflowRunId,pull_request_number pullRequestNumber,pull_request_revision pullRequestRevision FROM remediation_jobs ORDER BY created_at DESC LIMIT 100`).all();
  return results;
}
export async function getRemediationJob(db,id){
  await ensureRemediationSchema(db);
  return await db.prepare(`SELECT id,source_agent_id sourceAgentId,source_run_id sourceRunId,owner_approval_id ownerApprovalId,finding_type findingType,summary,recommended_action recommendedAction,raw_finding_json rawFindingJson,remediation_agent_id remediationAgentId,autonomy,attempt_count attemptCount,last_error lastError,verified_at verifiedAt,status,created_at createdAt,updated_at updatedAt,workflow_run_id workflowRunId,pull_request_number pullRequestNumber,pull_request_revision pullRequestRevision FROM remediation_jobs WHERE id=?`).bind(id).first();
}
// Non-terminal statuses: a job actively in flight for a given finding
// (already queued, dispatched, or merged-but-not-yet-verified). Used to
// stop a second automatic remediation attempt from being dispatched for
// the exact same still-unresolved condition while one is already underway.
const ACTIVE_STATUSES=['QUEUED','DISPATCHED','PREPARED','MERGED'];
export async function findActiveRemediationJob(db,{sourceAgentId,findingType}){
  await ensureRemediationSchema(db);
  const placeholders=ACTIVE_STATUSES.map(()=>'?').join(',');
  return await db.prepare(`SELECT id,status,created_at as createdAt FROM remediation_jobs WHERE source_agent_id=? AND finding_type=? AND status IN (${placeholders}) ORDER BY created_at DESC LIMIT 1`)
    .bind(sourceAgentId,findingType,...ACTIVE_STATUSES).first();
}
// Bounded retry / cooldown: how many times has autonomous remediation for
// this exact finding already ended in FAILED or ROLLED_BACK within the
// lookback window? Exceeding the cap stops further automatic attempts --
// the finding falls back to a normal owner-reviewed approval instead of
// retrying forever.
export async function countRecentRemediationFailures(db,{sourceAgentId,findingType},sinceIso){
  await ensureRemediationSchema(db);
  const {results=[]}=await db.prepare(`SELECT COUNT(*) as n FROM remediation_jobs WHERE source_agent_id=? AND finding_type=? AND status IN ('FAILED','ROLLED_BACK','ESCALATED') AND created_at > ?`)
    .bind(sourceAgentId,findingType,sinceIso).all();
  return Number(results?.[0]?.n||0);
}
// A remediation job left MERGED (the real repository change landed) but
// never reaching a terminal VERIFIED/ROLLED_BACK/FAILED state is a real
// stuck operational condition -- the workflow that was supposed to verify
// and report back crashed, timed out, or lost its runner. This must be
// visible, not silently forgotten.
//
// DISPATCHED is only a stuck condition for a GREEN job: GREEN is the only
// autonomy that ever progresses itself past DISPATCHED (remediation-
// preparer.yml's merge/verify/report steps are gated on autonomy=='GREEN'
// -- see that workflow's own comment: "A YELLOW job's terminal state is
// exactly what it always was: an open, unmerged PR waiting for a human to
// review and merge it themselves."). Flagging a YELLOW job stuck at
// DISPATCHED would falsely tell the owner every single one of their own
// not-yet-merged remediation PRs "did not report a final result", forever,
// since nothing about a YELLOW job's real success path ever reports back to
// this table at all.
export async function listStuckRemediationJobs(db,thresholdMinutes=20){
  await ensureRemediationSchema(db);
  const cutoff=new Date(Date.now()-thresholdMinutes*60000).toISOString();
  const {results=[]}=await db.prepare(`SELECT id,source_agent_id sourceAgentId,finding_type findingType,status,updated_at updatedAt FROM remediation_jobs WHERE ((status='DISPATCHED' AND autonomy='GREEN') OR status='MERGED') AND updated_at < ? ORDER BY updated_at ASC`).bind(cutoff).all();
  return results;
}
