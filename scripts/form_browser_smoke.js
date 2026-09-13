const { chromium, firefox, webkit } = require('playwright');

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
];
const widths = [390, 1440];
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
        await form.locator('button[type="submit"]').click();
        await page.locator('[data-form-status]').getByText(/Thank you|Спасибо/).waitFor();
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
            JSON.stringify(contract.values) !== JSON.stringify(expected) ||
            !submission || submission.method !== 'POST' ||
            submissionCount !== 1 ||
            JSON.stringify(submission.fields) !== JSON.stringify({
              ...expected,
              page: `${base}${route}`,
              language: route === '/ru/' ? 'ru' : 'en',
            })) {
          failures.push({ engineName, route, width, status: response && response.status(), contract, submission });
        }
        await page.close();
      }
    }
    await browser.close();
  }
  if (failures.length) {
    console.error(JSON.stringify(failures, null, 2));
    process.exit(1);
  }
  console.log(`Form smoke passed for ${requestedEngines.length} engines, ${routes.length} routes, and ${widths.length} viewport widths.`);
})();
