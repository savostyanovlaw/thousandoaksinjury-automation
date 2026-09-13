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
