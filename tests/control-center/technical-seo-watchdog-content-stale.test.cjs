const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('checkout uses full git history so the content-staleness check has real file dates to compare against', ()=>{
  const y=fs.readFileSync('.github/workflows/technical-seo-watchdog.yml','utf8');
  assert.match(y,/fetch-depth:\s*0/);
});

test('the findings conversion step preserves every real field a failure carries, not a fixed subset', ()=>{
  const y=fs.readFileSync('.github/workflows/technical-seo-watchdog.yml','utf8');
  // A prior version of this step rebuilt each finding from a fixed list of
  // keys (findingType/title/summary/recommendedAction/url/fingerprint),
  // which silently dropped a content_stale finding's real
  // source_revision/page_title/page_body/material_change_reason before it
  // ever reached the Control Center -- the exact data Content Refresher
  // needs to produce a real draft instead of an empty/placeholder one.
  assert.match(y,/\*\*f,/,'the findings conversion must spread the original failure dict so no field is silently dropped');
});
