const { chromium, firefox, webkit } = require('playwright');
const fs = require('fs');
const path = require('path');

const base = process.env.SITE_URL || 'http://127.0.0.1:4173';
const routes = [
  ['home', '/'],
  ['car-accident', '/car-accident-lawyer/'],
  ['newbury-park', '/newbury-park/'],
  ['agoura-hills', '/agoura-hills/'],
  ['russian', '/ru/'],
  ['not-found', '/does-not-exist-for-smoke-test'],
];
const widths = [360, 390, 768, 1024, 1440];
const engines = { chromium, firefox, webkit };
const outDir = path.join(process.cwd(), 'artifacts', 'browser');
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const failures = [];
  for (const [engineName, engine] of Object.entries(engines)) {
    const browser = await engine.launch();
    for (const [slug, route] of routes) {
      for (const width of widths) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        const consoleErrors = [];
        page.on('console', msg => {
          if (msg.type() === 'error') consoleErrors.push(msg.text());
        });
        page.on('pageerror', err => consoleErrors.push(err.message));
        const response = await page.goto(`${base}${route}`, { waitUntil: 'networkidle' });
        const status = response ? response.status() : 0;
        const h1Count = await page.locator('h1').count();
        const phoneCount = await page.locator('a[href^="tel:+18182138798"]').count();
        const emailCount = await page.locator('a[href="mailto:attorney@savostyanovlaw.com"]').count();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
        const expected404 = slug === 'not-found';
        if ((!expected404 && status >= 400) || h1Count !== 1 || phoneCount < 1 || emailCount < 1 || overflow || consoleErrors.length) {
          failures.push({ engineName, slug, width, status, h1Count, phoneCount, emailCount, overflow, consoleErrors });
        }
        if (width === 390 || width === 1440) {
          await page.screenshot({ path: path.join(outDir, `${engineName}-${slug}-${width}.png`), fullPage: true });
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
  console.log(`Browser smoke passed for ${Object.keys(engines).length} engines, ${routes.length} routes, and ${widths.length} viewport widths.`);
})();
