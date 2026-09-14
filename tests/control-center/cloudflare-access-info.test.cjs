const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(process.cwd(), 'control-center/functions/api/bootstrap/access-info.js'), 'utf8');

test('Access discovery filters output to Control Center hostname', () => {
  assert.match(source, /slc-ai-control\.pages\.dev/);
  assert.doesNotMatch(source, /thousandoaksinjury\.com/);
  assert.doesNotMatch(source, /CLOUDFLARE_API_TOKEN\s*[,}]/);
});
