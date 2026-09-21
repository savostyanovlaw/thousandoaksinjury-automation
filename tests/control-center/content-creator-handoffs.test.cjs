const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

// Content Creator is the one real, currently-firing upstream event for two
// otherwise-idle event-driven agents. This locks in that both handoffs stay
// wired to the actual generated draft (topic/city/title/body), never to a
// fabricated placeholder, and that neither ever authorizes anything beyond
// producing another reviewable draft.
test('Content Creator automatically hands its real draft to Russian-Language Robot', ()=>{
  const y=fs.readFileSync('.github/workflows/content-creator.yml','utf8');
  assert.match(y,/Trigger Russian-language review draft from this real draft/);
  assert.match(y,/russian-language-robot\.yml\/dispatches/);
  assert.match(y,/title=draft\.get\("title"\)/);
  assert.match(y,/body=\(draft\.get\("draft"\) or ""\)/);
  assert.match(y,/if not title or not body:/);
});

test('Content Creator automatically hands its real topic/city to Video Engine', ()=>{
  const y=fs.readFileSync('.github/workflows/content-creator.yml','utf8');
  assert.match(y,/Trigger Video Engine package from this real draft/);
  assert.match(y,/video-engine\.yml\/dispatches/);
  assert.match(y,/topic=draft\.get\("topic"\)/);
  assert.match(y,/city=draft\.get\("city"\)/);
  assert.match(y,/if not topic or not city:/);
});

test('neither handoff step ever sets publishAllowed or mergeAllowed to true', ()=>{
  const y=fs.readFileSync('.github/workflows/content-creator.yml','utf8');
  assert.doesNotMatch(y,/publishAllowed["']?\s*[:=]\s*(True|true)/);
  assert.doesNotMatch(y,/mergeAllowed["']?\s*[:=]\s*(True|true)/);
});
