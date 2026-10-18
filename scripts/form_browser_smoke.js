const { chromium, firefox, webkit } = require('playwright');
process.on('unhandledRejection', error => {
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=${require('path').basename(__filename)} crashed::${String(error && error.stack || error).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A').slice(0, 1500)}`);
  console.error(error);
  process.exit(1);
});

const base = process.env.SITE_URL || 'http://127.0.0.1:4173';
const routes = [
  '/',
  '/car-accident-lawyer/',
  '/newbury-park/',
  '/agoura-hills/',
  '/westlake-village/',
  '/oak-park/',
  '/simi-valley/',
  '/camarillo/',
  '/ru/',
  '/dog-bite-lawyer/',
  '/slip-and-fall-lawyer/',
  '/wrongful-death-lawyer/',
  '/motorcycle-accident-lawyer/',
];
const widths = [390, 1440];

/* Intake fields must match exactly; attribution and timing fields are added by
   the page script and are checked for shape only. */
function sameIntake(actual, expected, route) {
  if (!actual) return false;
  const { elapsed_ms: elapsed, landing_page: landing, ...core } = actual;
  for (const key of Object.keys(core)) if (/^(utm_|gclid|referrer)/.test(key)) delete core[key];
  const sorted = obj => JSON.stringify(Object.keys(obj).sort().map(k => [k, obj[k]]));
  if (sorted(core) !== sorted(expected)) return false;
  if (route === undefined) return elapsed === undefined && landing === undefined;
  return /^\d+$/.test(elapsed || '') && landing === route;
}
const availableEngines = { chromium, firefox, webkit };
const requestedEngines = (process.env.BROWSER_ENGINES || Object.keys(availableEngines).join(','))
  .split(',')
  .map(name => name.trim())
  .filter(Boolean);

(async () => {
  const failures = [];
  for (const engineName of requestedEngines) {
    const engine = availableEngines[engineName];
    if (!engine) throw new Error(`Unsupported browser engine: ${engineName}`);
    const browser = await engine.launch();
    for (const route of routes) {
      for (const width of widths) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        let submission = null;
        let submissionCount = 0;
        await page.route('**/api/case-review', async route => {
          submissionCount += 1;
          const request = route.request();
          const body = request.postDataBuffer();
          const contentType = await request.headerValue('content-type');
          const parsed = body && contentType ? await new Request('http://local.test/', {
            method: 'POST',
            headers: { 'content-type': contentType },
            body,
          }).formData() : null;
          submission = {
            method: request.method(),
            fields: parsed ? Object.fromEntries(parsed) : null,
          };
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ok: true }),
          });
        });
        const response = await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' });
        const form = page.locator('form[data-case-review-form]');
        await form.waitFor();
        await form.locator('[name="name"]').fill('Mobile QA');
        await form.locator('[name="phone"]').fill('+1 (818) 555-0101');
        await form.locator('[name="email"]').fill('mobile.qa+form@example.co.uk');
        await form.locator('[name="message"]').fill('Help');
        const contract = await form.evaluate(element => {
          const values = Object.fromEntries(new FormData(element));
          return {
            action: element.action,
            method: element.method,
            valid: element.checkValidity(),
            values,
          };
        });
        // Let the reveal transition finish so the click lands on the settled button (WebKit flake).
        await form.locator('button[type="submit"]').scrollIntoViewIfNeeded();
        await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => null))));
        await form.locator('button[type="submit"]').click();
        try {
          await page.locator('[data-form-status]').getByText(/Thank you|Спасибо/).waitFor({ timeout: 15000 });
        } catch (error) {
          const state = await page.evaluate(() => {
            const f = document.querySelector('form[data-case-review-form]');
            const s = document.querySelector('[data-form-status]');
            return { url: location.href, status: s && s.textContent, integration: f && f.getAttribute('data-form-integration'),
              invalid: f ? Array.from(f.elements).filter(e => e.validity && !e.validity.valid).map(e => e.name + ':' + e.validationMessage) : null };
          }).catch(e => ({ evalError: String(e) }));
          failures.push({ engineName, route, width, stage: 'success-message', submissionCount, state, contract });
          await page.close();
          continue;
        }
        await form.locator('[name="name"]').fill('Mobile QA');
        await form.locator('[name="phone"]').fill('invalid');
        await form.locator('[name="email"]').fill('mobile.qa@example.com');
        await form.locator('[name="message"]').fill('Help');
        await form.locator('button[type="submit"]').click();
        await page.waitForTimeout(50);
        const expected = {
          name: 'Mobile QA',
          phone: '+1 (818) 555-0101',
          email: 'mobile.qa+form@example.co.uk',
          message: 'Help',
          website: '',
        };
        if (!response || response.status() >= 400 ||
            !contract.action.endsWith('/api/case-review') ||
            contract.method !== 'post' || !contract.valid ||
            !sameIntake(contract.values, { ...expected, language: route === '/ru/' ? 'ru' : 'en' }) ||
            !submission || submission.method !== 'POST' ||
            submissionCount !== 1 ||
            !sameIntake(submission.fields, {
              ...expected,
              page: `${base}${route}`,
              language: route === '/ru/' ? 'ru' : 'en',
            }, route)) {
          failures.push({ engineName, route, width, status: response && response.status(), contract, submission });
        }
        await page.close();
      }
    }
    await browser.close();
  }
  if (failures.length) {
    console.error(JSON.stringify(failures, null, 2));
    if (process.env.GITHUB_ACTIONS) {
      for (const failure of failures.slice(0, 10)) {
        console.log(`::error title=${require('path').basename(__filename)}::${JSON.stringify(failure).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A').slice(0, 900)}`);
      }
    }
    process.exit(1);
  }
  console.log(`Form smoke passed for ${requestedEngines.length} engines, ${routes.length} routes, and ${widths.length} viewport widths.`);
})();
