const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(process.cwd(), 'control-center/functions/api/bootstrap/index.js'), 'utf8');

test('manifest exposes only read-only Cloudflare bootstrap capabilities', () => {
  assert.match(source, /verify-cloudflare-token/);
  assert.match(source, /read-control-center-pages-project/);
  assert.doesNotMatch(source, /access/i);
  assert.doesNotMatch(source, /generic|arbitrary|dns|billing|mutate|write/i);
});
