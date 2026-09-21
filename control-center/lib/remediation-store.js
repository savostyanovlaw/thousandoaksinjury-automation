const TABLE=`CREATE TABLE IF NOT EXISTS remediation_jobs (
 id TEXT PRIMARY KEY, source_agent_id TEXT NOT NULL, source_run_id TEXT NOT NULL, owner_approval_id TEXT NOT NULL, finding_type TEXT NOT NULL,
 summary TEXT NOT NULL, recommended_action TEXT NOT NULL, raw_finding_json TEXT NOT NULL DEFAULT '{}', remediation_agent_id TEXT,
 status TEXT NOT NULL CHECK (status IN ('QUEUED','DISPATCHED','PREPARED','BLOCKED','FAILED')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 workflow_run_id TEXT, pull_request_number INTEGER, pull_request_revision TEXT)`;
const INDEX=`CREATE INDEX IF NOT EXISTS idx_remediation_owner_approval ON remediation_jobs(owner_approval_id)`;

// A single owner approval can carry several actionable findings (a
// multi-finding technical SEO report, for example), and every finding gets
// its own remediation job. An earlier schema mistakenly declared
// owner_approval_id UNIQUE, which silently dropped every finding after the
// first in a multi-finding approval (the INSERT failed and the caller
// swallowed the constraint error). This migrates any live table created
// under that mistaken schema to the corrected one without losing rows: real
// SQLite (D1) has no ALTER TABLE DROP CONSTRAINT, so the only safe path is
// create-copy-drop-rename, gated on detecting the legacy UNIQUE definition
// so it only ever runs once and is a no-op afterward.
async function migrateAwayFromLegacyUniqueConstraint(db){
  let legacy;
  try{
    legacy=await db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='remediation_jobs'").first();
  }catch{ return; }
  const sql=legacy?.sql;
  if(typeof sql!=='string' || !/owner_approval_id\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(sql)) return;
  await db.prepare(TABLE.replace('remediation_jobs','remediation_jobs_migrated')).run();
  await db.prepare('INSERT INTO remediation_jobs_migrated SELECT * FROM remediation_jobs').run();
  await db.prepare('DROP TABLE remediation_jobs').run();
  await db.prepare('ALTER TABLE remediation_jobs_migrated RENAME TO remediation_jobs').run();
}

export async function ensureRemediationSchema(db){
  if(!db?.prepare)throw new Error('Control database unavailable');
  await db.prepare(TABLE).run();
  await migrateAwayFromLegacyUniqueConstraint(db);
  await db.prepare(INDEX).run();
}
export async function createRemediationJob(db,row){await ensureRemediationSchema(db);await db.prepare(`INSERT INTO remediation_jobs (id,source_agent_id,source_run_id,owner_approval_id,finding_type,summary,recommended_action,raw_finding_json,remediation_agent_id,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'QUEUED',?,?)`).bind(row.id,row.sourceAgentId,row.sourceRunId,row.ownerApprovalId,row.findingType,row.summary,row.recommendedAction,JSON.stringify(row.rawFinding||{}),row.remediationAgentId||null,row.createdAt,row.createdAt).run();return row;}
export async function updateRemediationJob(db,id,status,extra={}){await ensureRemediationSchema(db);const now=new Date().toISOString();await db.prepare(`UPDATE remediation_jobs SET status=?,updated_at=?,workflow_run_id=COALESCE(?,workflow_run_id),pull_request_number=COALESCE(?,pull_request_number),pull_request_revision=COALESCE(?,pull_request_revision) WHERE id=?`).bind(status,now,extra.workflowRunId||null,extra.pullRequestNumber||null,extra.pullRequestRevision||null,id).run();}
export async function listRemediationJobs(db){await ensureRemediationSchema(db);const {results=[]}=await db.prepare(`SELECT id,source_agent_id sourceAgentId,source_run_id sourceRunId,owner_approval_id ownerApprovalId,finding_type findingType,summary,recommended_action recommendedAction,remediation_agent_id remediationAgentId,status,created_at createdAt,updated_at updatedAt,workflow_run_id workflowRunId,pull_request_number pullRequestNumber,pull_request_revision pullRequestRevision FROM remediation_jobs ORDER BY created_at DESC LIMIT 100`).all();return results;}
