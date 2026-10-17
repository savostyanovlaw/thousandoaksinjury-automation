#!/usr/bin/env node
/*
 * End-to-end intake test: real pages + the real Pages Function code, with only
 * the outbound Resend API call replaced by an in-memory mailbox.
 *
 *   node scripts/intake_e2e.mjs            # local server on 127.0.0.1:4180
 *
 * Proves for every page with a case-review form: the browser submission
 * reaches /api/case-review, the function builds the intake email to
 * attorney@savostyanovlaw.com with page + attribution, the visitor sees the
 * success state, analytics fires generate_lead without personal data, failures
 * show the phone fallback, and the form works with JavaScript disabled.
 */
import http from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(process.env.PLAYWRIGHT_MODULE || '/opt/npm-tools/node_modules/playwright'); }

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'website');
const PORT = Number(process.env.E2E_PORT || 4180);
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(ROOT, 'artifacts', 'intake-e2e');

const caseReview = await import(pathToFileURL(path.join(ROOT, 'functions/api/case-review.js')));
const health = await import(pathToFileURL(path.join(ROOT, 'functions/api/intake-health.js')));

const mailbox = [];
let resendMode = 'ok';
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url) === 'https://api.resend.com/emails') {
    if (resendMode === 'fail') return new Response(JSON.stringify({ name: 'application_error' }), { status: 500 });
    mailbox.push({ auth: init.headers.authorization, ...JSON.parse(init.body) });
    return new Response(JSON.stringify({ id: `test-${mailbox.length}` }), { status: 200 });
  }
  return realFetch(url, init);
};

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.xml': 'application/xml', '.txt': 'text/plain', '.mp4': 'video/mp4' };
const env = { RESEND_API_KEY: 'e2e-test-key' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  try {
    if (url.pathname === '/api/case-review' || url.pathname === '/api/intake-health') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
      const mod = url.pathname === '/api/case-review' ? caseReview : health;
      const handler = req.method === 'POST' ? mod.onRequestPost : mod.onRequestGet;
      const response = await handler({ request, env });
      let location = response.headers.get('location');
      if (location) location = location.replace('https://thousandoaksinjury.com', BASE);
      res.writeHead(response.status, Object.fromEntries([...response.headers].map(([k, v]) => [k, k === 'location' ? location : v])));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    let file = path.join(SITE, decodeURIComponent(url.pathname));
    if (!file.startsWith(SITE)) throw new Error('bad path');
    if ((await stat(file).catch(() => null))?.isDirectory()) file = path.join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/html' });
    res.end(await readFile(path.join(SITE, '404.html')));
  }
});
await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
if (process.env.SERVE_ONLY) {
  console.log(`Serving website + Pages Functions (test mailbox) on ${BASE}`);
  await new Promise(() => {});
}
await mkdir(SHOTS, { recursive: true });

const ROUTES = ['/', '/car-accident-lawyer/', '/dog-bite-lawyer/', '/newbury-park/', '/westlake-village/', '/agoura-hills/', '/oak-park/', '/simi-valley/', '/camarillo/', '/ru/', '/slip-and-fall-lawyer/', '/wrongful-death-lawyer/', '/motorcycle-accident-lawyer/'];
const results = [];
const failures = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  if (!ok) failures.push({ name, detail });
}

const launch = { headless: true };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await playwright.chromium.launch(launch);

async function newPage(options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, ...options });
  await context.route('https://www.googletagmanager.com/**', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await context.addInitScript(() => {
    try { localStorage.setItem('toi_cookie_consent', JSON.stringify({ necessary: true, analytics: true, marketing: false })); } catch (e) {}
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  return { context, page, errors };
}

async function events(page) {
  return page.evaluate(() => (window.dataLayer || [])
    .map(entry => Array.from(entry))
    .filter(args => args[0] === 'event')
    .map(args => ({ name: args[1], params: args[2] })));
}

async function fill(page, n) {
  const form = page.locator('form[data-case-review-form]');
  await form.waitFor();
  await form.locator('[name="name"]').fill(`E2E Synthetic ${n}`);
  await form.locator('[name="phone"]').fill('(818) 555-0199');
  await form.locator('[name="email"]').fill(n % 2 ? `e2e+${n}@example.com` : '');
  await page.waitForTimeout(2600); // a human-speed fill, so the spam time-trap stays quiet
  await form.locator('[name="message"]').fill('SYNTHETIC TEST - rear-ended at a red light. Not a real client.');
  return form;
}

// 1. JavaScript submission on every page that has a form (first visit carries UTM parameters).
let n = 0;
for (const route of ROUTES) {
  n += 1;
  const { context, page, errors } = await newPage();
  const before = mailbox.length;
  await page.goto(`${BASE}${route}?utm_source=google&utm_medium=organic&utm_campaign=e2e`, { waitUntil: 'domcontentloaded' });
  const form = await fill(page, n);
  await form.locator('button[type="submit"]').click();
  const status = page.locator('[data-form-status]');
  await status.getByText(/Thank you|Спасибо/).waitFor({ timeout: 10000 });
  const mail = mailbox[before];
  const ev = await events(page);
  const lead = ev.find(e => e.name === 'generate_lead');
  const started = ev.find(e => e.name === 'form_start');
  check(`js-submit ${route}`, mailbox.length === before + 1 &&
    mail.to[0] === 'attorney@savostyanovlaw.com' &&
    mail.subject === `New Free Case Review — E2E Synthetic ${n} (${route})` &&
    mail.text.includes('First landing page: ' + route) &&
    mail.text.includes('utm_source: google') &&
    mail.text.includes('Phone: (818) 555-0199') &&
    mail.text.includes(`Language: ${route === '/ru/' ? 'ru' : 'en'}`) &&
    (n % 2 ? mail.reply_to === `e2e+${n}@example.com` : mail.reply_to === undefined) &&
    lead && started && !JSON.stringify(ev).match(/E2E Synthetic|555-0199|example\.com|rear-ended/) &&
    lead.params.landing_page === route && errors.length === 0,
  { route, subject: mail && mail.subject, events: ev.map(e => e.name), errors });
  if (route === '/newbury-park/' || route === '/westlake-village/' || route === '/ru/') {
    await page.screenshot({ path: path.join(SHOTS, `success${route.replace(/\//g, '_')}390.png`), fullPage: false });
  }
  await context.close();
}

// 2. Delivery failure shows the phone fallback and is measured as a failure.
{
  resendMode = 'fail';
  const { context, page } = await newPage();
  await page.goto(`${BASE}/westlake-village/`, { waitUntil: 'domcontentloaded' });
  const form = await fill(page, 101);
  await form.locator('button[type="submit"]').click();
  await page.locator('[data-form-status]').getByText('(818) 213-8798').waitFor({ timeout: 10000 });
  const ev = await events(page);
  check('delivery-failure fallback /westlake-village/', ev.some(e => e.name === 'form_submit_error' && e.params.error_code === 'delivery_failed') && !ev.some(e => e.name === 'generate_lead'), ev);
  await page.screenshot({ path: path.join(SHOTS, 'failure_westlake-village_390.png') });
  await context.close();
  resendMode = 'ok';
}

// 3. Invalid phone is blocked in the browser and never reaches the server.
{
  const { context, page } = await newPage();
  const before = mailbox.length;
  await page.goto(`${BASE}/newbury-park/`, { waitUntil: 'domcontentloaded' });
  const form = await fill(page, 102);
  await form.locator('[name="phone"]').fill('call me');
  await form.locator('button[type="submit"]').click();
  await page.waitForTimeout(300);
  const ev = await events(page);
  check('client validation /newbury-park/', mailbox.length === before && ev.some(e => e.name === 'form_submit_error' && e.params.error_code === 'client_validation'), ev);
  await context.close();
}

// 4. Double-click sends exactly one email.
{
  const { context, page } = await newPage();
  const before = mailbox.length;
  await page.goto(`${BASE}/car-accident-lawyer/`, { waitUntil: 'domcontentloaded' });
  const form = await fill(page, 103);
  await form.locator('button[type="submit"]').dblclick();
  await page.locator('[data-form-status]').getByText(/Thank you/).waitFor({ timeout: 10000 });
  await page.waitForTimeout(300);
  check('no duplicate send on double click', mailbox.length === before + 1, { sent: mailbox.length - before });
  await context.close();
}

// 5. JavaScript disabled: native POST delivers and lands on the thank-you page.
for (const route of ['/newbury-park/', '/westlake-village/', '/ru/']) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
  const page = await context.newPage();
  const before = mailbox.length;
  await page.goto(`${BASE}${route}`, { waitUntil: 'load' });
  const form = page.locator('form[data-form-integration]');
  await form.scrollIntoViewIfNeeded();
  await form.locator('[name="name"]').fill('E2E NoJS');
  await form.locator('[name="phone"]').fill('818-555-0123');
  await form.locator('[name="message"]').fill('SYNTHETIC TEST without JavaScript.');
  // force: without JS the long page is still settling layout; this is a plain user click on the visible button.
  await Promise.all([page.waitForURL(/thank-you/), form.locator('button[type="submit"]').click({ force: true })]);
  const h1 = await page.locator('h1').textContent();
  check(`no-js submit ${route}`, mailbox.length === before + 1 && /Thank You/.test(h1) && mailbox[before].subject.endsWith(`(${route})`),
    { url: page.url(), subject: mailbox[before] && mailbox[before].subject });
  if (route === '/westlake-village/') await page.screenshot({ path: path.join(SHOTS, 'nojs_thank-you_390.png') });
  await context.close();
}

// 6. Mobile click-to-call: sticky bar visible in the first viewport, correct number, tracked.
for (const route of ['/', '/newbury-park/', '/westlake-village/', '/car-accident-lawyer/', '/dog-bite-lawyer/', '/ru/']) {
  const { context, page } = await newPage();
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
  const call = page.locator('.mobile-action-bar a[href^="tel:"]');
  await call.waitFor();
  const href = await call.getAttribute('href');
  const box = await call.boundingBox();
  const allTel = await page.$$eval('a[href^="tel:"]', links => [...new Set(links.map(a => a.getAttribute('href')))]);
  await page.evaluate(() => { document.querySelector('.mobile-action-bar a[href^="tel:"]').addEventListener('click', e => e.preventDefault()); });
  await call.click();
  const ev = await events(page);
  check(`tel CTA ${route}`, href === 'tel:+18182138798' && allTel.length === 1 && box && box.y + box.height <= 844 && box.height >= 44 &&
    ev.some(e => e.name === 'phone_click' && e.params.cta_location === 'sticky_bar'), { href, box, allTel, events: ev.map(e => e.name) });
  await context.close();
}

// 7. Health endpoint.
{
  const response = await realFetch(`${BASE}/api/intake-health`);
  const body = await response.json();
  check('intake health', response.status === 200 && body.delivery_configured === true && !JSON.stringify(body).includes('e2e-test-key'), body);
}

await browser.close();
server.close();
globalThis.fetch = realFetch;
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`);
console.log(`\n${results.length - failures.length}/${results.length} checks passed; ${mailbox.length} intake emails captured by the test mailbox (none sent to a real inbox).`);
if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
