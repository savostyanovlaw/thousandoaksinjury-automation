const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const text = fs.readFileSync(path.join(process.cwd(), 'control-center/functions/api/bootstrap/SECURITY.md'), 'utf8');
test('security doc prohibits generic proxy', () => assert.match(text, /not a Cloudflare API proxy/i));
