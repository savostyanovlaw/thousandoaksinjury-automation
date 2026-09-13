import { AGENTS } from './agent-registry.js';
const AUTONOMY = new Set(['GREEN','YELLOW','RED']);
export function validateRegistry(agents){
  if(!Array.isArray(agents)) throw new Error('Registry must be an array');
  const ids=new Set();
  for(const agent of agents){
    if(!agent?.id || ids.has(agent.id)) throw new Error(`Invalid or duplicate agent id: ${agent?.id}`);
    ids.add(agent.id);
    if(!Array.isArray(agent.commands)) throw new Error(`commands must be an array for ${agent.id}`);
    for(const command of agent.commands){
      if(!command?.name || !AUTONOMY.has(command.autonomy)) throw new Error(`Invalid command for ${agent.id}`);
      if(agent.deployed && ['RUN_NOW','RETRY'].includes(command.name) && !agent.workflows?.[command.name]) throw new Error(`Missing registered workflow for ${agent.id}:${command.name}`);
    }
    if(!agent.deployed && agent.commands.length) throw new Error(`Undeployed agent cannot expose commands: ${agent.id}`);
  }
  return agents;
}
export async function loadRegistry(){
  return validateRegistry(structuredClone(AGENTS));
}
export async function getAgent(id){
  const agents=await loadRegistry();
  return agents.find(a=>a.id===id) ?? null;
}
