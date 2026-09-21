const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('the dashboard has one self-healing panel (no second dashboard/UI system) that renders remediationJobs with an owner label',()=>{
  const html=fs.readFileSync('control-center/index.html','utf8');
  assert.match(html,/id="self-healing"/);
  assert.match(html,/id="remediation-list"/);
  const js=fs.readFileSync('control-center/assets/control.js','utf8');
  assert.match(js,/remediation-list/);
  assert.match(js,/remediationPill\(j\.ownerLabel\)/);
});
