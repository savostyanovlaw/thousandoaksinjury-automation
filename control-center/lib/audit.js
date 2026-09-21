const FIELDS=['timestamp','actor','agentId','action','targetType','targetId','targetRevision','autonomy','result','githubRunId','githubIssueNumber','githubPrNumber','approvalId','findingType','mergedSha','errorText'];
export function sanitizeAuditEvent(event){ const out={}; for(const f of FIELDS) if(event[f]!==undefined) out[f]=event[f]; return out; }
export async function writeAudit(db,event){
  const safe=sanitizeAuditEvent(event);
  if(!db?.prepare) return safe;
  await db.prepare('INSERT INTO audit_events (id, timestamp, actor, agent_id, action, target_type, target_id, target_revision, autonomy, result, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(),safe.timestamp||new Date().toISOString(),safe.actor||'',safe.agentId||'',safe.action||'',safe.targetType||null,safe.targetId||null,safe.targetRevision||null,safe.autonomy||'',safe.result||'',JSON.stringify({githubRunId:safe.githubRunId,githubIssueNumber:safe.githubIssueNumber,githubPrNumber:safe.githubPrNumber,approvalId:safe.approvalId,findingType:safe.findingType,mergedSha:safe.mergedSha,errorText:safe.errorText})).run();
  return safe;
}

export async function listAuditEvents(db,limit=50){
  if(!db?.prepare) return [];
  const safeLimit=Math.max(1,Math.min(Number(limit)||50,100));
  const {results=[]}=await db.prepare('SELECT timestamp, actor, agent_id as agentId, action, target_type as targetType, target_id as targetId, target_revision as targetRevision, autonomy, result, metadata_json as metadataJson FROM audit_events ORDER BY timestamp DESC LIMIT ?').bind(safeLimit).all();
  return results.map(row=>{let metadata={};try{metadata=JSON.parse(row.metadataJson||'{}')}catch{};const {metadataJson,...rest}=row;return sanitizeAuditEvent({...rest,...metadata});});
}
