const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(process.cwd(), 'control-center/functions/api/bootstrap/cloudflare.js'), 'utf8');

test('Cloudflare bootstrap is hard scoped to Control Center project/account', () => {
  assert.match(source, /8c69b02e709c79d82d43029a2c5a4c54/);
  assert.match(source, /slc-ai-control/);
  assert.doesNotMatch(source, /thousandoaksinjury\.com/);
});

test('Cloudflare token remains server side', () => {
  assert.match(source, /env\.CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(source, /token:\s*env\.CLOUDFLARE_API_TOKEN/);
});

test('Cloudflare bootstrap is read-only and cannot mutate Pages configuration', () => {
  assert.doesNotMatch(source, /onRequestPost/);
  assert.doesNotMatch(source, /method:\s*['\"]PATCH['\"]/);
  assert.doesNotMatch(source, /enable-preview-access/);
  assert.doesNotMatch(source, /deployment_configs/);
});
