function canonical(value){
  if(Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if(value && typeof value==='object') return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
async function sha256(text){
  if(globalThis.crypto?.subtle){
    const bytes=new TextEncoder().encode(text); const digest=await crypto.subtle.digest('SHA-256',bytes); return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
  }
  const {createHash}=await import('node:crypto'); return createHash('sha256').update(text).digest('hex');
}
export async function targetHash(payload){ return sha256(canonical(payload)); }
export function assertApprovalExecutable(record,currentTarget){
  if(record.consumedAt) throw new Error('Approval already consumed');
  if(record.status!=='APPROVED') throw new Error('Approval is not approved');
  if(record.targetRevision!==currentTarget.targetRevision) throw new Error('Stale approval target');
  return true;
}
export async function verifyApprovalHash(record,currentTarget){
  const hash=await targetHash(currentTarget);
  if(hash!==record.payloadHash) throw new Error('Stale approval payload');
  assertApprovalExecutable(record,currentTarget);
  return true;
}
