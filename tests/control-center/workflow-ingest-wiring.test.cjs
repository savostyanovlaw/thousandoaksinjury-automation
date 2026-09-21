const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const workflows=[
  'technical-seo-watchdog.yml',
  'opportunity-finder.yml',
  'content-creator.yml',
  'local-seo-robot.yml',
  'ctr-optimizer.yml',
  'internal-link-builder.yml',
  'competitor-monitor.yml',
  'russian-language-robot.yml',
  'content-refresher.yml',
  'video-engine.yml'
];

test('every producing agent workflow pushes its result into the Control Center without depending on the dashboard',()=>{
  for(const file of workflows){
    const y=fs.readFileSync(`.github/workflows/${file}`,'utf8');
    assert.match(y,/Notify Control Center of new result/,`${file} is missing the Control Center notify step`);
    assert.match(y,/api\/control\/ingest\/review-result/,`${file} does not call the ingest endpoint`);
    assert.match(y,/Authorization: Bearer \$OIDC_TOKEN/,`${file} does not send the OIDC bearer token`);
    assert.match(y,/ACTIONS_ID_TOKEN_REQUEST_TOKEN/,`${file} does not request a GitHub OIDC token`);
    assert.match(y,/audience=slc-ai-control-ingest/,`${file} does not scope its OIDC token to the ingest audience`);
    assert.match(y,/id-token:\s*write/,`${file} does not grant id-token: write permission`);
    assert.match(y,/GITHUB_RUN_ID/,`${file} does not identify the run being ingested`);
    assert.doesNotMatch(y,/CONTROL_INGEST_TOKEN/,`${file} should no longer reference the retired shared-secret ingest token`);
  }
});
