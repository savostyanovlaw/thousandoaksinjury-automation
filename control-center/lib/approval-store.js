export async function listPendingApprovals(db){
  if(!db?.prepare) return [];
  const {results=[]}=await db.prepare("SELECT id, agent_id as agentId, action, target_type as targetType, target_id as targetId, target_revision as targetRevision, payload_hash as payloadHash, status, created_at as createdAt FROM approvals WHERE status = 'PENDING' ORDER BY created_at DESC").all();
  return results;
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
