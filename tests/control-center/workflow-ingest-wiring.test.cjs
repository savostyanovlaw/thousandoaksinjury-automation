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
    assert.match(y,/X-Control-Ingest-Token/,`${file} does not send the ingest token header`);
    assert.match(y,/secrets\.CONTROL_INGEST_TOKEN/,`${file} does not reference the CONTROL_INGEST_TOKEN secret`);
    assert.match(y,/GITHUB_RUN_ID/,`${file} does not identify the run being ingested`);
  }
});
