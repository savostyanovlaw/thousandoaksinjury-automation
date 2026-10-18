import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../functions/api/intake-health.js', import.meta.url), 'utf8');
const { onRequestGet } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('health check reports configured delivery without exposing the secret', async () => {
  const response = onRequestGet({ env: { RESEND_API_KEY: 're_secret_value' } });
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.deepEqual(JSON.parse(text), { ok: true, endpoint: '/api/case-review', delivery_configured: true });
  assert.doesNotMatch(text, /re_secret_value/);
});

test('health check fails loudly when the delivery secret is missing', async () => {
  const response = onRequestGet({ env: {} });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).delivery_configured, false);
});
