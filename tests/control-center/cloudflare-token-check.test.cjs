const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(process.cwd(), 'control-center/functions/api/bootstrap/token-check.js'), 'utf8');

test('token check never returns credential value', () => {
  assert.match(source, /user\/tokens\/verify/);
  assert.match(source, /configured:\s*true/);
  assert.doesNotMatch(source, /token:\s*context\.env\.CLOUDFLARE_API_TOKEN/);
});
