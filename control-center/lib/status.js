export function deriveAgentStatus(input={}){
  if(!input.deployed) return 'NOT DEPLOYED';
  if(input.disabled) return 'DISABLED';
  if(input.pendingApproval) return 'WAITING APPROVAL';
  if(input.running) return 'RUNNING';
  if(input.currentFailure) return 'NEEDS ATTENTION';
  if(input.lastSuccess) return 'HEALTHY';
  // An event-driven agent (no schedule of its own; it only runs when a real
  // upstream event supplies real input) that has simply never run yet, or
  // hasn't run since its last real trigger, is not broken -- it is correctly
  // idle. Only a scheduled agent's silence is itself evidence of failure.
  if(input.eventDriven) return 'WAITING FOR INPUT';
  return 'NEEDS ATTENTION';
}
export function supersedesFailure({failureAt,successAt}){
  if(!failureAt || !successAt) return false;
  return new Date(successAt).getTime() > new Date(failureAt).getTime();
}
