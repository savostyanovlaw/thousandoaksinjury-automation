const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('russian-language-robot no longer invokes localize() with a fabricated placeholder',()=>{
  const y=fs.readFileSync('.github/workflows/russian-language-robot.yml','utf8');
  assert.doesNotMatch(y,/localize\("production-cycle"/);
  assert.match(y,/inputs\.source_id/);
  assert.match(y,/inputs\.title/);
  assert.match(y,/required: true/);
  assert.match(y,/if: github\.event_name == 'workflow_dispatch'/);
});

test('content-refresher no longer invokes refresh() with a fabricated placeholder',()=>{
  const y=fs.readFileSync('.github/workflows/content-refresher.yml','utf8');
  assert.doesNotMatch(y,/refresh\("production-cycle"/);
  assert.match(y,/inputs\.material_change_reason/);
  assert.match(y,/required: true/);
});

test('video-engine no longer invokes build_video_package() with a fabricated placeholder',()=>{
  const y=fs.readFileSync('.github/workflows/video-engine.yml','utf8');
  assert.doesNotMatch(y,/build_video_package\("production-cycle"/);
  assert.match(y,/inputs\.topic/);
  assert.match(y,/required: true/);
});

test('content-creator hands its real generated draft to the Russian-language robot',()=>{
  const y=fs.readFileSync('.github/workflows/content-creator.yml','utf8');
  assert.match(y,/russian-language-robot\.yml\/dispatches/);
  assert.match(y,/draft\.get\("title"\)/);
  assert.match(y,/draft\.get\("draft"\)/);
  assert.match(y,/actions: write/);
});
