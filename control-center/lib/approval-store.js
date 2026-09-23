const APPROVALS_TABLE=`CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    target_revision TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('PENDING','APPROVED','REJECTED','CHANGES_REQUESTED')),
    created_at TEXT NOT NULL,
    decided_at TEXT,
    decided_by TEXT,
    consumed_at TEXT,
    feedback TEXT,
    revision INTEGER NOT NULL DEFAULT 1,
    parent_approval_id TEXT
  )`;
const CONTROL_SCHEMA=[
  APPROVALS_TABLE,
  `CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    actor TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    target_revision TEXT,
    autonomy TEXT NOT NULL,
    result TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}'
  )`,
  `CREATE TABLE IF NOT EXISTS command_idempotency (
    idempotency_key TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    command TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`
];

// A live approvals table created before CHANGES_REQUESTED existed has no
// room for it in its CHECK constraint, and real SQLite (D1) has no ALTER
// TABLE that can change a CHECK constraint -- the only safe path is
// create-copy-drop-rename, exactly the pattern remediation-store.js already
// established for its own status-enum migration. Gated on detecting the
// legacy shape so it only ever runs once and is a no-op afterward.
async function migrateLegacyApprovalsSchema(db){
  let legacy;
  try{
    legacy=await db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='approvals'").first();
  }catch{ return; }
  const sql=legacy?.sql;
  if(typeof sql!=='string') return;
  if(/CHANGES_REQUESTED/i.test(sql)) return;
  await db.prepare(APPROVALS_TABLE.replace('approvals (','approvals_migrated (')).run();
  await db.prepare(`INSERT INTO approvals_migrated
    (id,agent_id,action,target_type,target_id,target_revision,payload_hash,status,created_at,decided_at,decided_by,consumed_at)
    SELECT id,agent_id,action,target_type,target_id,target_revision,payload_hash,status,created_at,decided_at,decided_by,consumed_at
    FROM approvals`).run();
  await db.prepare('DROP TABLE approvals').run();
  await db.prepare('ALTER TABLE approvals_migrated RENAME TO approvals').run();
}
async function addColumnIfMissing(db,table,column,definition){
  try{
    await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }catch(error){
    if(!/duplicate column|already exists/i.test(String(error?.message||error))) throw error;
  }
}
export async function ensureControlSchema(db){
  if(!db?.prepare) throw new Error('Control database unavailable');
  for(const statement of CONTROL_SCHEMA) await db.prepare(statement).run();
  await migrateLegacyApprovalsSchema(db);
  await addColumnIfMissing(db,'approvals','feedback','TEXT');
  await addColumnIfMissing(db,'approvals','revision',"INTEGER NOT NULL DEFAULT 1");
  await addColumnIfMissing(db,'approvals','parent_approval_id','TEXT');
}

export async function listPendingApprovals(db){
  if(!db?.prepare) return [];
  const {results=[]}=await db.prepare("SELECT id, agent_id as agentId, action, target_type as targetType, target_id as targetId, target_revision as targetRevision, payload_hash as payloadHash, status, created_at as createdAt, revision, parent_approval_id as parentApprovalId FROM approvals WHERE status = 'PENDING' ORDER BY created_at DESC").all();
  return results;
}
// A MERGE_PR approval that was claimed APPROVED but never reached
// consumed_at is a real, observable "stuck" operational state: the
// github.mergePull call failed after the claim already succeeded (see
// executeApprovalDecision's RED branch), so the decision happened but
// execution did not finish. This check is scoped to MERGE_PR specifically
// -- REVIEW_RESULT approvals never set consumed_at at all, by design (they
// route to remediation jobs, whose own status is the real completion
// signal), so including them here would flag every successful review as
// "stuck". A short grace period (thresholdMinutes) avoids flagging an
// approval that is still legitimately mid-execution.
export async function listStuckApprovals(db,thresholdMinutes=15){
  if(!db?.prepare) return [];
  const cutoff=new Date(Date.now()-thresholdMinutes*60000).toISOString();
  const {results=[]}=await db.prepare("SELECT id, agent_id as agentId, action, target_type as targetType, target_id as targetId, target_revision as targetRevision, status, created_at as createdAt, decided_at as decidedAt, decided_by as decidedBy FROM approvals WHERE status = 'APPROVED' AND action = 'MERGE_PR' AND consumed_at IS NULL AND decided_at < ? ORDER BY decided_at ASC").bind(cutoff).all();
  return results;
}
export async function ensureRunReviewApproval(db,row){
  if(!db?.prepare) throw new Error('Approval storage unavailable');
  const existing=await db.prepare("SELECT id FROM approvals WHERE agent_id = ? AND action = 'REVIEW_RESULT' AND target_type = 'workflow_run' AND target_id = ? LIMIT 1").bind(row.agentId,String(row.targetId)).first();
  if(existing) return null;
  await insertApproval(db,{...row,action:'REVIEW_RESULT',targetType:'workflow_run',targetId:String(row.targetId)});
  return row;
}
export async function getApproval(db,id){
  if(!db?.prepare) return null;
  return await db.prepare("SELECT id, agent_id as agentId, action, target_type as targetType, target_id as targetId, target_revision as targetRevision, payload_hash as payloadHash, status, created_at as createdAt, decided_at as decidedAt, decided_by as decidedBy, consumed_at as consumedAt, feedback, revision, parent_approval_id as parentApprovalId FROM approvals WHERE id = ?").bind(id).first();
}
export async function insertApproval(db,row){
  if(!db?.prepare) throw new Error('Approval storage unavailable');
  await db.prepare("INSERT INTO approvals (id, agent_id, action, target_type, target_id, target_revision, payload_hash, status, created_at, revision, parent_approval_id) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)").bind(row.id,row.agentId,row.action,row.targetType,row.targetId,row.targetRevision,row.payloadHash,row.createdAt,row.revision||1,row.parentApprovalId||null).run();
  return row;
}
// feedback is only ever set when status is CHANGES_REQUESTED -- APPROVE/
// REJECT never pass it, and the column stays NULL for them exactly as
// before this decision type existed.
export async function decideApproval(db,id,status,user,{feedback}={}){
  const now=new Date().toISOString();
  const result=await db.prepare("UPDATE approvals SET status = ?, decided_at = ?, decided_by = ?, feedback = ? WHERE id = ? AND status = 'PENDING'").bind(status,now,user,feedback||null,id).run();
  if(!result?.meta?.changes) throw new Error('Approval is stale or already decided');
  return {status,decidedAt:now,decidedBy:user};
}
export async function consumeApproval(db,id){
  const now=new Date().toISOString();
  const result=await db.prepare("UPDATE approvals SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL AND status = 'APPROVED'").bind(now,id).run();
  if(!result?.meta?.changes) throw new Error('Approval already consumed');
  return now;
}
export async function claimCommandIdempotency(db,key,agentId,command){
  if(!db?.prepare) throw new Error('Command idempotency storage unavailable');
  const now=new Date().toISOString();
  try{
    await db.prepare("INSERT INTO command_idempotency (idempotency_key, agent_id, command, created_at) VALUES (?, ?, ?, ?)").bind(key,agentId,command,now).run();
    return true;
  }catch(error){
    const message=String(error?.message||error);
    if(/unique|constraint|primary/i.test(message)) return false;
    throw error;
  }
}
