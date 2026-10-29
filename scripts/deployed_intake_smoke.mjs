#!/usr/bin/env node
/*
 * Smoke test for a DEPLOYED site (Cloudflare preview or production).
 *
 *   SITE_URL=https://thousandoaksinjury.com node scripts/deployed_intake_smoke.mjs
 *
 * Sends no email by default:
 *   - every sitemap page returns 200, has one tel:+18182138798 target, and a
 *     case-review form that POSTs natively to /api/case-review;
 *   - /api/intake-health reports the delivery secret is bound;
 *   - an EMPTY POST to /api/case-review returns 400 VALIDATION_ERROR, proving the
 *     Pages Function runs on this deployment (an empty form can never send);
 *   - in Chromium, forms upgrade to the inline handler and a submission reaches
 *     the endpoint with the correct payload (the request is intercepted, so no
 *     email is sent).
 * SEND_TEST_LEAD=1 additionally sends ONE clearly labeled synthetic lead
 * through the real endpoint to prove delivery to the firm's inbox.
 */
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/npm-tools/node_modules/playwright'); }

const BASE = (process.env.SITE_URL || 'https://thousandoaksinjury.com').replace(/\/$/, '');
const SEND_TEST_LEAD = process.env.SEND_TEST_LEAD === '1';
const OUT = path.join(process.cwd(), 'artifacts', 'deployed-smoke');
await mkdir(OUT, { recursive: true });

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + JSON.stringify(detail)}`);
  if (!ok && process.env.GITHUB_ACTIONS) console.log(`::error title=Smoke FAIL::${name} ${JSON.stringify(detail).slice(0, 900).replace(/[\r\n%]/g, ' ')}`);
}

async function get(pathname, init) {
  const response = await fetch(BASE + pathname, { redirect: 'manual', ...init });
  return { status: response.status, headers: response.headers, text: await response.text() };
}

// 1. Static pages from the sitemap.
const sitemap = await get('/sitemap.xml');
const paths = [...sitemap.text.matchAll(/<loc>https:\/\/thousandoaksinjury\.com(\/[^<]*)<\/loc>/g)].map(m => m[1]);
check('sitemap lists pages', sitemap.status === 200 && paths.length >= 15, { status: sitemap.status, count: paths.length });
const formPages = [];
for (const p of paths) {
  const page = await get(p);
  const tels = [...new Set([...page.text.matchAll(/href="(tel:[^"]+)"/g)].map(m => m[1]))];
  const hasForm = page.text.includes('data-form-integration="pending"');
  const nativeForm = /<form data-form-integration="pending"[^>]*action="\/api\/case-review" method="post"/.test(page.text);
  if (hasForm) formPages.push(p);
  check(`page ${p}`, page.status === 200 && tels.length === 1 && tels[0] === 'tel:+18182138798' && (!hasForm || nativeForm) &&
    !/will be enabled only after|submission is loading/.test(page.text), { status: page.status, tels, hasForm, nativeForm });
}
for (const p of ['/thank-you/', '/case-review-error/']) {
  const page = await get(p);
  check(`status page ${p}`, page.status === 200 && page.text.includes('noindex') && page.text.includes('tel:+18182138798'), { status: page.status });
}
const robots = await get('/robots.txt');
check('robots.txt', robots.status === 200 && robots.text.includes('Sitemap: https://thousandoaksinjury.com/sitemap.xml') && !/Disallow:\s*\/\s*$/m.test(robots.text), robots.text);

// 2. Endpoint is deployed and configured (no email sent).
const healthRes = await get('/api/intake-health');
let health = {};
try { health = JSON.parse(healthRes.text); } catch {}
check('intake health: delivery secret bound', healthRes.status === 200 && health.delivery_configured === true, { status: healthRes.status, health });
const empty = await get('/api/case-review', { method: 'POST', headers: { accept: 'application/json' }, body: new FormData() });
let emptyBody = {};
try { emptyBody = JSON.parse(empty.text); } catch {}
check('empty POST rejected with VALIDATION_ERROR (function live, nothing sent)', empty.status === 400 && emptyBody.code === 'VALIDATION_ERROR', { status: empty.status, body: emptyBody });

// 3. Browser wiring on the deployed build (submission intercepted; no email).
const browser = await playwright.chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
for (const p of ['/newbury-park/', '/westlake-village/', '/car-accident-lawyer/', '/ru/']) {
  if (!formPages.includes(p)) continue;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  let fields = null;
  await page.route('**/api/case-review', async route => {
    const req = route.request();
    fields = Object.fromEntries(await new Request('http://x/', { method: 'POST', headers: { 'content-type': await req.headerValue('content-type') }, body: req.postDataBuffer() }).formData());
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.goto(`${BASE}${p}?utm_source=smoke`, { waitUntil: 'load' });
  const form = page.locator('form[data-case-review-form]');
  await form.waitFor({ timeout: 15000 });
  const bar = page.locator('.mobile-action-bar a[href="tel:+18182138798"]');
  const barBox = await bar.boundingBox();
  await page.screenshot({ path: path.join(OUT, `${p.replace(/\//g, '_') || 'home'}first-view-390.png`) });
  await form.locator('[name="name"]').fill('SMOKE TEST (intercepted)');
  await form.locator('[name="phone"]').fill('818-555-0100');
  await form.locator('[name="message"]').fill('Automated deployed smoke test. Intercepted; never sent.');
  await form.locator('button[type="submit"]').click();
  await page.locator('[data-form-status]').getByText(/Thank you|Спасибо/).waitFor({ timeout: 10000 });
  check(`browser form wiring ${p}`, fields && fields.phone === '818-555-0100' && fields.page.startsWith(BASE + p) &&
    fields.landing_page === p && fields.utm_source === 'smoke' && barBox && barBox.y + barBox.height <= 844 && errors.length === 0,
  { fields: fields && Object.keys(fields), barBox, errors });
  await context.close();
}
await browser.close();

// 4. Optional: one real, labeled synthetic lead through the live endpoint.
if (SEND_TEST_LEAD) {
  const data = new FormData();
  data.set('name', 'TEST LEAD - automated funnel check');
  data.set('phone', '818-555-0100');
  data.set('message', `Automated end-to-end delivery test from ${BASE}. Not a real client. Safe to delete.`);
  data.set('page', `${BASE}/newbury-park/`);
  data.set('language', 'en');
  data.set('landing_page', '/newbury-park/');
  data.set('utm_source', 'deployed-smoke');
  const sent = await get('/api/case-review', { method: 'POST', headers: { accept: 'application/json' }, body: data });
  check('ONE labeled synthetic lead accepted by the live endpoint (check the inbox)', sent.status === 200 && JSON.parse(sent.text).ok === true, { status: sent.status, body: sent.text.slice(0, 200) });
}

const failed = results.filter(r => !r.ok);
console.log(`\n${BASE}: ${results.length - failed.length}/${results.length} checks passed${SEND_TEST_LEAD ? ' (one labeled test lead sent)' : ' (no email sent)'}.`);
process.exit(failed.length ? 1 : 0);
