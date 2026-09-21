const CONTROL_SCHEMA=[
  `CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    target_revision TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    created_at TEXT NOT NULL,
    decided_at TEXT,
    decided_by TEXT,
    consumed_at TEXT
  )`,
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

export async function ensureControlSchema(db){
  if(!db?.prepare) throw new Error('Control database unavailable');
  for(const statement of CONTROL_SCHEMA) await db.prepare(statement).run();
}

export async function listPendingApprovals(db){
  if(!db?.prepare) return [];
  const {results=[]}=await db.prepare("SELECT id, agent_id as agentId, action, target_type as targetType, target_id as targetId, target_revision as targetRevision, payload_hash as payloadHash, status, created_at as createdAt FROM approvals WHERE status = 'PENDING' ORDER BY created_at DESC").all();
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
  return await db.prepare("SELECT id, agent_id as agentId, action, target_type as targetType, target_id as targetId, target_revision as targetRevision, payload_hash as payloadHash, status, created_at as createdAt, decided_at as decidedAt, decided_by as decidedBy, consumed_at as consumedAt FROM approvals WHERE id = ?").bind(id).first();
}
export async function insertApproval(db,row){
  if(!db?.prepare) throw new Error('Approval storage unavailable');
  await db.prepare("INSERT INTO approvals (id, agent_id, action, target_type, target_id, target_revision, payload_hash, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)").bind(row.id,row.agentId,row.action,row.targetType,row.targetId,row.targetRevision,row.payloadHash,row.createdAt).run();
  return row;
}
export async function decideApproval(db,id,status,user){
  const now=new Date().toISOString();
  const result=await db.prepare("UPDATE approvals SET status = ?, decided_at = ?, decided_by = ? WHERE id = ? AND status = 'PENDING'").bind(status,now,user,id).run();
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
