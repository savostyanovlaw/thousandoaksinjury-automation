const test=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs');
test('remediation workflow performs tests before opening PR and forbids publication',()=>{
 const y=fs.readFileSync('.github/workflows/remediation-preparer.yml','utf8');
 assert.match(y,/python3 -m unittest discover/);
 assert.match(y,/gh pr create/);
 assert.ok(y.indexOf('python3 -m unittest discover')<y.indexOf('gh pr create'));
 assert.match(y,/publishAllowed"\s*:\s*False/);
 assert.match(y,/deployAllowed"\s*:\s*False/);
 assert.match(y,/case "\$FINDING_TYPE"/);
});

test('GREEN autonomy is the only thing that can authorize a merge, and only for the allowlisted deterministic finding types',()=>{
 const y=fs.readFileSync('.github/workflows/remediation-preparer.yml','utf8');
 assert.match(y,/mergeAllowed"\s*:\s*os\.environ\["AUTONOMY"\]\s*==\s*"GREEN"/);
 assert.match(y,/robots-sitemap\)/,'the deterministic robots.txt fix must key on the REAL finding type (robots-sitemap), not the unrelated "robots" check');
 assert.match(y,/if:\s*inputs\.autonomy == 'GREEN'/);
});

test('a failed post-merge verification is followed by a bounded rollback attempt, never a silent success',()=>{
 const y=fs.readFileSync('.github/workflows/remediation-preparer.yml','utf8');
 assert.match(y,/git revert --no-edit/);
 assert.match(y,/ROLLED_BACK/);
 assert.match(y,/for attempt in 1 2 3 4 5/,'verification retries must be bounded, never an unbounded loop');
});

test('the GREEN result is always reported back to the Control Center ingest endpoint',()=>{
 const y=fs.readFileSync('.github/workflows/remediation-preparer.yml','utf8');
 assert.match(y,/api\/control\/ingest\/remediation-result/);
 assert.match(y,/audience=slc-ai-control-ingest/);
});
