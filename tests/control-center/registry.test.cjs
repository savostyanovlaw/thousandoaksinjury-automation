const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const ROOT=process.cwd();
async function mod(p){ return import(pathToFileURL(path.join(ROOT,p))); }

test('registry contains ten deployed agents', async()=>{
  const { loadRegistry } = await mod('control-center/lib/registry.js');
  const agents = await loadRegistry(path.join(ROOT,'control-center/agent-registry.json'));
  assert.equal(agents.length,10);
  assert.deepEqual(agents.filter(a=>a.deployed).map(a=>a.id),['technical-seo-watchdog']);
});

test('undeployed agents do not expose commands', async()=>{
  const { loadRegistry } = await mod('control-center/lib/registry.js');
  const agents = await loadRegistry(path.join(ROOT,'control-center/agent-registry.json'));
  for (const a of agents.filter(a=>!a.deployed)) assert.deepEqual(a.commands,[]);
});

test('static runtime registry matches documented JSON registry', async()=>{
  const { AGENTS } = await mod('control-center/lib/agent-registry.js');
  const fs=require('node:fs');
  const documented=JSON.parse(fs.readFileSync(path.join(ROOT,'control-center/agent-registry.json'),'utf8'));
  assert.deepEqual(AGENTS,documented);
  assert.deepEqual(AGENTS.find(a=>a.id==='technical-seo-watchdog').scheduleUtcHours,[0,12]);
});
