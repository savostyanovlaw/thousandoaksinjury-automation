const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(process.cwd(), 'functions/api/slc-control-repair.js'), 'utf8');

test('repair endpoint is hard scoped to the Control Center project', () => {
  assert.match(source, /8c69b02e709c79d82d43029a2c5a4c54/);
  assert.match(source, /slc-ai-control/);
  assert.match(source, /control-center/);
  assert.doesNotMatch(source, /payload\.|request\.json\(|url\.searchParams/);
});

test('repair only updates Pages build configuration and never exposes token', () => {
  assert.match(source, /CLOUDFLARE_API_TOKEN/);
  assert.match(source, /method:\s*'PATCH'/);
  assert.match(source, /root_dir:\s*'control-center'/);
  assert.match(source, /destination_dir:\s*'\.'/);
  assert.match(source, /build_command:\s*'exit 0'/);
  assert.doesNotMatch(source, /dns|billing|access\/apps/i);
  assert.doesNotMatch(source, /token\s*:/i);
});

test('repair refuses unrelated hosts', () => {
  assert.match(source, /slc-ai-control\.pages\.dev/);
  assert.match(source, /Not Found/);
});
