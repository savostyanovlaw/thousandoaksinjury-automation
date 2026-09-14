const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

test('browser assets never reference Cloudflare API token', () => {
  const assets = walk(path.join(process.cwd(), 'control-center/assets'));
  for (const file of assets) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /CLOUDFLARE_API_TOKEN|api\.cloudflare\.com/);
  }
});
