const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

// Regression: isNoActionReview() (see autonomy.js and
// auto-archive-no-action.test.cjs) can only auto-archive a genuinely
// zero-finding/healthy run when the ingest call's own JSON body carries
// `healthy`/`findingCount` -- it is never fetched live server-side (see
// review-result.js's own comment on why). Five of the ten push-ingesting
// workflows were calling the ingest endpoint with a bare
// `{"agentId":...,"runId":...}` body, so isNoActionReview had nothing to
// evaluate and always fell through to a normal PENDING approval -- even on
// a real HEALTHY, zero-finding, no-artifact run. Confirmed live in
// production: Competitor Monitor run 35827300960 (findings:[]), Opportunity
// Finder run 35827293957 (status:HEALTHY, findingCount:0), Local SEO Robot
// run 35827295813 (status:HEALTHY, findingCount:0), and Internal Link
// Builder run 35827299160 (suggestionCount:0) each produced a spurious
// Needs Approval item instead of landing in Audit/History.
//
// This locks in that every workflow whose own script can genuinely report
// zero findings passes enough of its already-computed report data through
// to let the ingest endpoint's own no-action classifier fire -- never a
// bare {agentId,runId} body for these agents.

const AGENTS_REQUIRING_HEALTH_SIGNAL=[
  {workflow:'opportunity-finder.yml',reportPath:'artifacts/opportunity-finder/report.json'},
  {workflow:'local-seo-robot.yml',reportPath:'artifacts/local-seo-robot/report.json'},
  {workflow:'ctr-optimizer.yml',reportPath:'artifacts/ctr-optimizer/report.json'},
  {workflow:'internal-link-builder.yml',reportPath:'artifacts/internal-link-builder/report.json'},
  {workflow:'competitor-monitor.yml',reportPath:'artifacts/competitor-monitor/report.json'},
  {workflow:'technical-seo-watchdog.yml',reportPath:'artifacts/technical-seo-watchdog/report.json'},
];

for(const {workflow,reportPath} of AGENTS_REQUIRING_HEALTH_SIGNAL){
  test(`${workflow}: the Control Center ingest call includes a real healthy/findingCount signal, never a bare {agentId,runId} body`,()=>{
    const y=fs.readFileSync(`.github/workflows/${workflow}`,'utf8');
    // The literal bare-body form this regression shipped with -- must never
    // reappear as the actual -d payload for the ingest curl call.
    assert.doesNotMatch(y,/-d\s+"\{\\"agentId\\":\\"[a-z-]+\\",\\"runId\\":\\"\$\{GITHUB_RUN_ID\}\\"\}"/,
      'the ingest call must not regress to a bare {agentId,runId} body with no health signal');
    assert.match(y,new RegExp(reportPath.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')),
      'the payload-building step must read this run\'s own already-computed report.json');
    assert.match(y,/"healthy":/,'the ingest payload must compute a real healthy boolean from the report');
    assert.match(y,/"findingCount":/,'the ingest payload must compute a real findingCount from the report');
    assert.match(y,/-d\s+"\$PAYLOAD"/,'the curl call must send the computed payload variable, not a literal string');
  });
}

// The remaining two push-ingesting agents (Content Refresher, Russian
// Language Robot) use a different, equally valid mechanism: a client-side
// approvalState==='NOT_REQUIRED' pre-check that skips the ingest call
// entirely on a no-action result, rather than relying on the server-side
// isNoActionReview classifier. Locking in that this pre-check still exists
// prevents a regression to the same bare-body bug via a different path.
for(const workflow of ['content-refresher.yml','russian-language-robot.yml']){
  test(`${workflow}: a no-action result is skipped client-side via approvalState before ever calling ingest`,()=>{
    const y=fs.readFileSync(`.github/workflows/${workflow}`,'utf8');
    assert.match(y,/d\.get\(['"]approvalState['"]\)\s*==\s*['"]NOT_REQUIRED['"]/);
  });
}

// Content Creator and Video Engine have no "zero finding" concept at all --
// every real produced artifact (a draft, a script) is itself the reviewable
// content, so an unconditional ingest call on success is correct and must
// not be "fixed" into requiring a health signal it can never have.
for(const workflow of ['content-creator.yml','video-engine.yml']){
  test(`${workflow}: always-reviewable content is ingested unconditionally, with no healthy/findingCount gate`,()=>{
    const y=fs.readFileSync(`.github/workflows/${workflow}`,'utf8');
    assert.match(y,/ingest\/review-result/);
  });
}
