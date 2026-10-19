// Run: node scripts/check-pi-intake-pages.mjs
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const routes = ['/', '/car-accident-lawyer/', '/simi-valley/', '/oak-park/', '/camarillo/'];
for (const route of routes) {
  const path = 'website' + (route === '/' ? '/index.html' : route + 'index.html');
  const html = readFileSync(path, 'utf8');
  const expected = 'https://thousandoaksinjury.com' + route;
  assert.ok(html.includes('<link rel="canonical" href="' + expected + '">'), path + ': canonical mismatch');
  assert.ok(html.includes('href="tel:+18182138798"'), path + ': phone CTA missing');
  assert.ok(html.includes('action="/api/case-review"'), path + ': case review form missing');
  assert.ok(html.includes('/assets/lead-events.js'), path + ': event instrumentation missing');
  assert.ok(html.includes('href="#contact"'), path + ': consultation CTA missing');
  console.log('PASS ' + route);
}
console.log('PI intake page checks passed');
