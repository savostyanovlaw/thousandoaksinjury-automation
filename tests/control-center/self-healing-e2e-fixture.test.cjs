const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('the self-healing E2E fixture emits a GREEN e2e_fixture_marker finding with a real per-run marker value',()=>{
  const y=fs.readFileSync('.github/workflows/technical-seo-watchdog.yml','utf8');
  assert.match(y,/self_healing_e2e_fixture/);
  assert.match(y,/self_healing_e2e_force_failure/);
  assert.match(y,/findingType':'e2e_fixture_marker'/);
  assert.match(y,/marker_value = "e2e-" \+ os\.environ\.get\("GITHUB_RUN_ID"/,'the marker value must be unique per run, never a fabricated constant');
  assert.match(y,/fixture_force_verification_failure/);
});

test('the fixture never touches anything under website/ -- it can never reach production content',()=>{
  const y=fs.readFileSync('.github/workflows/technical-seo-watchdog.yml','utf8');
  const fixtureStart=y.indexOf('Inject safe self-healing closed-loop E2E fixture');
  const fixtureEnd=y.indexOf('Reconcile watchdog GitHub issues');
  const fixtureBlock=y.slice(fixtureStart,fixtureEnd);
  assert.doesNotMatch(fixtureBlock,/website\//);
});

test('remediation-preparer.yml only ever writes the fixture marker to a repository-internal file, never under website/',()=>{
  const y=fs.readFileSync('.github/workflows/remediation-preparer.yml','utf8');
  assert.match(y,/remediation\/e2e-fixture-marker\.txt/);
  // Find the deterministic-mutation case block specifically (the one that
  // writes files), not the later verification case block or the input
  // description text that also mentions this finding type by name.
  const mutationCaseStart=y.indexOf('case "$FINDING_TYPE" in');
  assert.ok(mutationCaseStart>=0);
  const fixtureCaseStart=y.indexOf('e2e_fixture_marker)',mutationCaseStart);
  const fixtureCaseEnd=y.indexOf(';;',fixtureCaseStart);
  const caseBlock=y.slice(fixtureCaseStart,fixtureCaseEnd);
  assert.match(caseBlock,/remediation\/e2e-fixture-marker\.txt/);
  // Check for an actual write/path reference to website/, not just the word
  // appearing in an explanatory comment (this block's own comment
  // legitimately says "never anything under website/").
  assert.doesNotMatch(caseBlock,/>\s*website\/|Path\(["']website\//);
});
