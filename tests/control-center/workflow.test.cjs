const test=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs');
const p=process.cwd()+'/.github/workflows/control-center-validation.yml';
test('control center validation is least privilege and non-deploying',()=>{const y=fs.readFileSync(p,'utf8'); assert.match(y,/permissions:\s*\n\s*contents:\s*read/); assert.match(y,/node --test tests\/control-center\/\*\.test\.cjs/); assert.match(y,/playwright test/); assert.match(y,/@cloudflare\/pages-functions build/); assert.doesNotMatch(y,/wrangler pages deploy|cloudflare\/pages-action/i);});
