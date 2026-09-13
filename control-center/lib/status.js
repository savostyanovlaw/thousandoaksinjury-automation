export function deriveAgentStatus(input={}){
  if(!input.deployed) return 'NOT DEPLOYED';
  if(input.disabled) return 'DISABLED';
  if(input.pendingApproval) return 'WAITING APPROVAL';
  if(input.running) return 'RUNNING';
  if(input.currentFailure) return 'NEEDS ATTENTION';
  if(input.lastSuccess) return 'HEALTHY';
  return 'NEEDS ATTENTION';
}
export function supersedesFailure({failureAt,successAt}){
  if(!failureAt || !successAt) return false;
  return new Date(successAt).getTime() > new Date(failureAt).getTime();
}
