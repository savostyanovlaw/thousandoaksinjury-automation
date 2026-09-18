export function execute(artifact, approval, executor){
  if(!approval) throw new Error('Approval required');
  if(approval.status!=='APPROVED') throw new Error('Approval is not approved');
  if(String(approval.artifactId)!==String(artifact.artifact_id)) throw new Error('Approval artifact mismatch');
  if(String(approval.targetRevision)!==String(artifact.revision)) throw new Error('Stale approval target');
  if(approval.consumedAt) throw new Error('Approval already consumed');
  const result=executor(artifact); approval.consumedAt='consumed'; return result;
}
