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

// Regression: the Russian-language handoff used to pass ONLY title/body,
// never localized_title/localized_body -- so russian_language_robot.py's
// localize() always fell into its own NEEDS_LOCALIZATION fallback (no real
// translation was ever generated in production, invisible to the owner
// since that result auto-archives). This locks in that a real translation
// call is attempted, gated on a real secret, and that its failure can never
// crash the handoff or fabricate a draft.
test('the Russian-language handoff attempts a real translation call, gated on ANTHROPIC_API_KEY, and degrades safely on failure', ()=>{
  const y=fs.readFileSync('.github/workflows/content-creator.yml','utf8');
  assert.match(y,/ANTHROPIC_API_KEY:\s*\$\{\{\s*secrets\.ANTHROPIC_API_KEY\s*\}\}/);
  assert.match(y,/from scripts\.translate_content import translate_to_russian/);
  assert.match(y,/translate_to_russian\(title,body,os\.environ\.get\("ANTHROPIC_API_KEY",""\)\)/);
  assert.match(y,/except Exception as exc:/);
  assert.match(y,/if localized_title and localized_body:/);
  assert.match(y,/inputs\["localized_title"\]=localized_title/);
  assert.match(y,/inputs\["localized_body"\]=localized_body/);
});
