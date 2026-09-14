const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(process.cwd(), 'control-center/functions/api/bootstrap/access-config.js'), 'utf8');

test('Access config is immutable-target and owner-only', () => {
  assert.match(source, /slc-ai-control\.pages\.dev/);
  assert.match(source, /savostyanovlaw@gmail\.com/);
  assert.match(source, /ensure-control-center-access/);
  assert.match(source, /requireSameOrigin/);
  assert.doesNotMatch(source, /input\.(domain|email|account|url|path|method)/);
  assert.doesNotMatch(source, /thousandoaksinjury\.com/);
});
