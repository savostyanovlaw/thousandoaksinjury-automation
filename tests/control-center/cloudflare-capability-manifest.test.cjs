const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(process.cwd(), 'control-center/functions/api/bootstrap/index.js'), 'utf8');

test('manifest exposes only named bootstrap capabilities', () => {
  assert.match(source, /ensure-control-center-access/);
  assert.doesNotMatch(source, /generic|arbitrary|dns|billing/i);
});
