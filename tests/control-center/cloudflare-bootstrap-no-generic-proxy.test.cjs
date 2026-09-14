const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(process.cwd(), 'control-center/functions/api/bootstrap');

test('bootstrap endpoints do not accept arbitrary Cloudflare destinations', () => {
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const source = fs.readFileSync(path.join(dir, name), 'utf8');
    assert.doesNotMatch(source, /input\.(url|path|method|accountId|project|domain)/, name);
    assert.doesNotMatch(source, /payload\.(url|path|method|accountId|project|domain)/, name);
  }
});
