const FIELDS=['timestamp','actor','agentId','action','targetType','targetId','targetRevision','autonomy','result','githubRunId','githubIssueNumber','githubPrNumber','approvalId'];
export function sanitizeAuditEvent(event){ const out={}; for(const f of FIELDS) if(event[f]!==undefined) out[f]=event[f]; return out; }
export async function writeAudit(db,event){
  const safe=sanitizeAuditEvent(event);
  if(!db?.prepare) return safe;
  await db.prepare('INSERT INTO audit_events (id, timestamp, actor, agent_id, action, target_type, target_id, target_revision, autonomy, result, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(),safe.timestamp||new Date().toISOString(),safe.actor||'',safe.agentId||'',safe.action||'',safe.targetType||null,safe.targetId||null,safe.targetRevision||null,safe.autonomy||'',safe.result||'',JSON.stringify({githubRunId:safe.githubRunId,githubIssueNumber:safe.githubIssueNumber,githubPrNumber:safe.githubPrNumber,approvalId:safe.approvalId})).run();
  return safe;
}
