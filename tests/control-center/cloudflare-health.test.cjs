const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(process.cwd(), 'control-center/functions/api/bootstrap/health.js'), 'utf8');
test('health reports only token presence', () => {
  assert.match(source, /Boolean\(context\.env\.CLOUDFLARE_API_TOKEN\)/);
  assert.doesNotMatch(source, /token:\s*context\.env/);
});
