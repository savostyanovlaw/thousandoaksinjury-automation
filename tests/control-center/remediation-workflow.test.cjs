const test=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs');
test('remediation workflow performs tests before opening PR and forbids publication',()=>{
 const y=fs.readFileSync('.github/workflows/remediation-preparer.yml','utf8');
 assert.match(y,/python3 -m unittest discover/);
 assert.match(y,/gh pr create/);
 assert.ok(y.indexOf('python3 -m unittest discover')<y.indexOf('gh pr create'));
 assert.match(y,/publishAllowed":False/);
 assert.match(y,/case "\$FINDING_TYPE"/);
});
