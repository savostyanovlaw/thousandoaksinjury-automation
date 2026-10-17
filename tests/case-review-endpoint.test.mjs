import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../functions/api/case-review.js', import.meta.url), 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { onRequestPost } = await import(moduleUrl);

function multipart(fields) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return new Request('https://thousandoaksinjury.com/api/case-review', {
    method: 'POST',
    body: data,
    headers: { Accept: 'application/json' },
  });
}

function validFields(overrides = {}) {
  return {
    name: 'QA Visitor',
    phone: '(818) 555-0101',
    email: 'qa.visitor@example.com',
    message: 'I was injured in a collision.',
    page: 'https://thousandoaksinjury.com/',
    language: 'en',
    website: '',
    ...overrides,
  };
}

async function invoke(request, resend = { ok: true }) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    calls.push(args);
    return resend;
  };
  try {
    const response = await onRequestPost({ request, env: { RESEND_API_KEY: 'test-secret' } });
    return { response, payload: await response.json(), calls };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('accepts a legitimate non-empty short message that browser required validation accepts', async () => {
  const result = await invoke(multipart(validFields({ message: 'Help' })));
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload, { ok: true });
  assert.equal(result.calls.length, 1);
});

test('accepts common desktop, mobile, and international phone formats', async () => {
  for (const phone of ['818-555-0101', '(818) 555 0101', '+1 818.555.0101', '+44 20 7946 0958', '＋１（８１８）５５５－０１０１']) {
    const result = await invoke(multipart(validFields({ phone })));
    assert.equal(result.response.status, 200, phone);
  }
});

test('rejects a phone without a plausible number of digits with a field error', async () => {
  const result = await invoke(multipart(validFields({ phone: 'call-me-now' })));
  assert.equal(result.response.status, 400);
  assert.equal(result.payload.ok, false);
  assert.equal(result.payload.code, 'VALIDATION_ERROR');
  assert.deepEqual(result.payload.fields, { phone: 'invalid' });
  assert.equal(result.calls.length, 0);
});

test('returns machine-readable errors for missing and invalid required fields', async () => {
  const result = await invoke(multipart(validFields({ name: ' ', email: 'bad', message: ' ' })));
  assert.equal(result.response.status, 400);
  assert.equal(result.payload.code, 'VALIDATION_ERROR');
  assert.deepEqual(result.payload.fields, {
    name: 'required',
    email: 'invalid',
    message: 'required',
  });
  assert.equal(result.calls.length, 0);
});

test('rejects malformed email addresses before delivery', async () => {
  for (const email of ['a,b@example.com', 'a@example..com', 'a@example.com.', 'a<z@example.com', '.a@example.com']) {
    const result = await invoke(multipart(validFields({ email })));
    assert.equal(result.response.status, 400, email);
    assert.deepEqual(result.payload.fields, { email: 'invalid' }, email);
    assert.equal(result.calls.length, 0, email);
  }
});

test('rejects an unparseable request body without calling Resend', async () => {
  const request = new Request('https://thousandoaksinjury.com/api/case-review', {
    method: 'POST',
    body: '{broken',
    headers: { 'content-type': 'application/json' },
  });
  const result = await invoke(request);
  assert.equal(result.response.status, 400);
  assert.equal(result.payload.code, 'INVALID_REQUEST');
  assert.equal(result.calls.length, 0);
});

test('rejects non-text and oversized multipart fields', async () => {
  const withFile = new FormData();
  for (const [name, value] of Object.entries(validFields())) withFile.set(name, value);
  withFile.set('name', new Blob(['not text']), 'name.txt');
  let result = await invoke(new Request('https://thousandoaksinjury.com/api/case-review', {
    method: 'POST', body: withFile,
  }));
  assert.equal(result.response.status, 400);
  assert.equal(result.payload.code, 'INVALID_REQUEST');
  assert.equal(result.calls.length, 0);

  result = await invoke(multipart(validFields({ name: 'x'.repeat(121) })));
  assert.equal(result.response.status, 400);
  assert.deepEqual(result.payload.fields, { name: 'too_long' });
  assert.equal(result.calls.length, 0);
});

test('silently accepts a filled honeypot without sending lead data', async () => {
  const result = await invoke(multipart(validFields({ website: 'https://spam.invalid' })));
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.payload, { ok: true });
  assert.equal(result.calls.length, 0);
});

test('does not include the API key or submitted lead fields in error responses', async () => {
  const result = await invoke(multipart(validFields({ email: 'private@example.com' })), { ok: false });
  assert.equal(result.response.status, 502);
  const serialized = JSON.stringify(result.payload);
  assert.doesNotMatch(serialized, /test-secret|private@example\.com|QA Visitor/);
  assert.equal(result.payload.code, 'DELIVERY_FAILED');
});

function sentEmail(result) {
  return JSON.parse(result.calls[0][1].body);
}

test('email is optional: a phone-only lead is delivered without reply_to', async () => {
  const result = await invoke(multipart(validFields({ email: '' })));
  assert.equal(result.response.status, 200);
  const email = sentEmail(result);
  assert.equal(email.reply_to, undefined);
  assert.match(email.text, /Email: Not provided/);
  assert.match(email.text, /Phone: \(818\) 555-0101/);
});

test('intake email includes landing page path in subject and a lead attribution block', async () => {
  const result = await invoke(multipart(validFields({
    page: 'https://thousandoaksinjury.com/newbury-park/?utm_source=google',
    landing_page: '/newbury-park/',
    referrer: 'https://www.google.com/',
    utm_source: 'google',
    utm_medium: 'organic',
    gclid: 'abc123',
  })));
  assert.equal(result.response.status, 200);
  const email = sentEmail(result);
  assert.match(email.subject, /\(\/newbury-park\/\)$/);
  assert.match(email.text, /Lead attribution:\nFirst landing page: \/newbury-park\/\nReferrer: https:\/\/www\.google\.com\/\nutm_source: google\nutm_medium: organic\ngclid: abc123/);
  assert.equal(email.reply_to, 'qa.visitor@example.com');
});

test('missing attribution still succeeds and is labelled Direct / unknown', async () => {
  const result = await invoke(multipart(validFields()));
  assert.equal(result.response.status, 200);
  assert.match(sentEmail(result).text, /Lead attribution:\nDirect \/ unknown/);
});

test('attribution fields are length-limited server-side', async () => {
  const result = await invoke(multipart(validFields({ utm_campaign: 'x'.repeat(161) })));
  assert.equal(result.response.status, 400);
  assert.deepEqual(result.payload.fields, { utm_campaign: 'too_long' });
  assert.equal(result.calls.length, 0);
});

test('fast or link-heavy submissions are flagged for review, never discarded', async () => {
  let result = await invoke(multipart(validFields({ elapsed_ms: '400' })));
  assert.equal(result.response.status, 200);
  assert.equal(result.calls.length, 1);
  assert.match(sentEmail(result).subject, /^\[Possible spam\] /);
  result = await invoke(multipart(validFields({ elapsed_ms: '45000' })));
  assert.doesNotMatch(sentEmail(result).subject, /Possible spam/);
  result = await invoke(multipart(validFields({ message: 'see http://a.example http://b.example www.c.example' })));
  assert.match(sentEmail(result).subject, /^\[Possible spam\] /);
});

test('header injection in the name cannot add lines to the subject', async () => {
  const result = await invoke(multipart(validFields({ name: 'Eve\r\nBcc: x@example.com' })));
  assert.doesNotMatch(sentEmail(result).subject, /[\r\n]/);
});

function nativePost(fields) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return new Request('https://thousandoaksinjury.com/api/case-review', {
    method: 'POST', body: data,
    headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
  });
}

async function invokeRaw(request, resend = { ok: true }, env = { RESEND_API_KEY: 'test-secret' }) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => { calls.push(args); return resend; };
  try {
    return { response: await onRequestPost({ request, env }), calls };
  } finally { globalThis.fetch = originalFetch; }
}

test('no-JavaScript form posts are delivered and redirected to the thank-you page', async () => {
  const { response, calls } = await invokeRaw(nativePost(validFields()));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), 'https://thousandoaksinjury.com/thank-you/');
  assert.equal(calls.length, 1);
  const ru = await invokeRaw(nativePost(validFields({ language: 'ru' })));
  assert.equal(ru.response.headers.get('location'), 'https://thousandoaksinjury.com/thank-you/?lang=ru');
});

test('no-JavaScript validation and delivery failures go to the error page with phone fallback', async () => {
  let { response, calls } = await invokeRaw(nativePost(validFields({ phone: '' })));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), 'https://thousandoaksinjury.com/case-review-error/?reason=validation');
  assert.equal(calls.length, 0);
  ({ response } = await invokeRaw(nativePost(validFields()), { ok: false, status: 403, json: async () => ({ name: 'validation_error' }) }));
  assert.equal(response.headers.get('location'), 'https://thousandoaksinjury.com/case-review-error/');
  ({ response } = await invokeRaw(nativePost(validFields()), { ok: true }, {}));
  assert.equal(response.headers.get('location'), 'https://thousandoaksinjury.com/case-review-error/');
});

test('failure logs carry codes only, never intake content or the secret', async () => {
  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(String(line));
  try {
    await invokeRaw(multipart(validFields({ name: 'Private Person', email: 'private@example.com', message: 'secret injury details' })),
      { ok: false, status: 422, json: async () => ({ name: 'invalid_from_address', message: 'domain not verified' }) });
    await invokeRaw(multipart(validFields({ name: 'Private Person' })));
  } finally { console.log = original; }
  const all = lines.join('\n');
  assert.match(all, /case_review_delivery_failed/);
  assert.match(all, /invalid_from_address/);
  assert.match(all, /case_review_delivered/);
  assert.doesNotMatch(all, /Private Person|private@example\.com|secret injury|test-secret|818/);
});

test('without a page field the same-site Referer identifies the landing page; foreign referers are ignored', async () => {
  const same = nativePost(validFields({ page: '' }));
  same.headers.set('referer', 'https://thousandoaksinjury.com/westlake-village/?utm_source=x');
  let { calls } = await invokeRaw(same);
  assert.match(JSON.parse(calls[0][1].body).subject, /\(\/westlake-village\/\)$/);
  const foreign = nativePost(validFields({ page: '' }));
  foreign.headers.set('referer', 'https://evil.example/westlake-village/');
  ({ calls } = await invokeRaw(foreign));
  assert.match(JSON.parse(calls[0][1].body).subject, /\(unknown\)$/);
});
