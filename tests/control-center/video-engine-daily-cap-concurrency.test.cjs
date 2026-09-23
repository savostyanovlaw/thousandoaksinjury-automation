const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

// Regression: the one-proposal-per-Pacific-day cap is enforced by
// reconstructing history from past runs' own completed logs (see
// video_engine_daily.py's history_from_runs). A run still in progress has
// not yet printed its marker, so it is invisible to a second run's history
// check -- without a concurrency group serializing runs, the schedule
// firing at the same moment as a workflow_dispatch (e.g. Content Creator's
// automatic handoff) could let two runs both see "not yet proposed today"
// and both produce a proposal on the same Pacific day.
test('video-engine.yml serializes concurrent runs so the daily-cap history check can never race', ()=>{
  const y=fs.readFileSync('.github/workflows/video-engine.yml','utf8');
  assert.match(y,/^concurrency:\s*$/m,'video-engine.yml must declare a concurrency block');
  assert.match(y,/^\s*group:\s*video-engine\s*$/m);
  assert.match(y,/^\s*cancel-in-progress:\s*false\s*$/m,'a run must never be cancelled mid-flight -- that would abandon whatever it already committed to build without any record of it');
});

test('technical-seo-watchdog.yml still has its own concurrency group (the established pattern this fix mirrors)', ()=>{
  const y=fs.readFileSync('.github/workflows/technical-seo-watchdog.yml','utf8');
  assert.match(y,/group:\s*technical-seo-watchdog/);
  assert.match(y,/cancel-in-progress:\s*false/);
});
