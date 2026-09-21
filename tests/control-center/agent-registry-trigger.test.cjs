const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');

// agent-registry.js's "trigger" field drives whether the Control Center
// dashboard shows an agent that has never run as WAITING FOR INPUT (correct
// for an event-driven agent) or NEEDS ATTENTION (correct for a scheduled
// one). This must be verified against the actual workflow trigger, the same
// way scripts/agent_orchestrator_health.py's EXPECTED_AGENTS table is
// cross-checked in tests/test_agent_orchestrator_health.py -- otherwise the
// registry's claim and the workflow's real behavior can silently drift.
test("every agent's registry trigger classification matches its workflow file's actual on: trigger",async()=>{
  const {AGENTS}=await import(pathToFileURL(process.cwd()+'/control-center/lib/agent-registry.js'));
  for(const agent of AGENTS){
    const workflowFile=agent.workflows?.RUN_NOW;
    assert.ok(workflowFile,`${agent.id} has no RUN_NOW workflow`);
    assert.ok(['scheduled','event-driven'].includes(agent.trigger),`${agent.id} has no valid trigger classification`);
    const yaml=fs.readFileSync(`.github/workflows/${workflowFile}`,'utf8');
    const hasSchedule=/^\s*schedule:/m.test(yaml);
    if(agent.trigger==='scheduled'){
      assert.ok(hasSchedule,`${agent.id} is classified scheduled but ${workflowFile} has no schedule: trigger`);
    }else{
      assert.ok(!hasSchedule,`${agent.id} is classified event-driven but ${workflowFile} has a schedule: trigger -- it is actually scheduled`);
    }
  }
});
