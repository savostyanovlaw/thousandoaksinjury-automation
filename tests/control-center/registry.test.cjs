const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const ROOT=process.cwd();
async function mod(p){ return import(pathToFileURL(path.join(ROOT,p))); }

test('registry contains ten agents and only watchdog deployed', async()=>{
  const { loadRegistry } = await mod('control-center/lib/registry.js');
  const agents = await loadRegistry();
  assert.equal(agents.length,10);
  assert.deepEqual(agents.filter(a=>a.deployed).map(a=>a.id),['technical-seo-watchdog']);
});

test('undeployed agents do not expose commands', async()=>{
  const { loadRegistry } = await mod('control-center/lib/registry.js');
  const agents = await loadRegistry();
  for (const a of agents.filter(a=>!a.deployed)) assert.deepEqual(a.commands,[]);
});
