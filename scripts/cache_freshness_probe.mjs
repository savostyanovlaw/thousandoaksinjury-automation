#!/usr/bin/env node
/*
 * Read-only probe: is the public URL serving the same HTML as a cache-busted
 * request? Prints cache headers so stale edge/browser caching is provable.
 *
 *   SITE_URL=https://thousandoaksinjury.com node scripts/cache_freshness_probe.mjs
 *   STRICT=1 → exit 1 when any page is stale.
 */
const BASE = (process.env.SITE_URL || 'https://thousandoaksinjury.com').replace(/\/$/, '');
const PATHS = (process.env.PROBE_PATHS || '/,/newbury-park/,/westlake-village/,/agoura-hills/,/car-accident-lawyer/,/dog-bite-lawyer/,/ru/').split(',');
const HEADERS = ['cf-cache-status', 'age', 'cache-control', 'cdn-cache-control', 'cloudflare-cdn-cache-control', 'etag', 'last-modified', 'server'];

function title(html) {
  const m = /<title>([^<]*)<\/title>/.exec(html);
  return m ? m[1] : '(no title)';
}

let stale = 0;
const rows = [];
for (const p of PATHS) {
  const plain = await fetch(BASE + p, { headers: { 'user-agent': 'Mozilla/5.0 (cache-freshness-probe)' } });
  const plainHtml = await plain.text();
  const busted = await fetch(`${BASE}${p}?cb=${Date.now()}`, { headers: { 'cache-control': 'no-cache', 'user-agent': 'Mozilla/5.0 (cache-freshness-probe)' } });
  const bustedHtml = await busted.text();
  const same = plainHtml === bustedHtml;
  const oldForm = /will be enabled only after|submission is loading/.test(plainHtml);
  if (!same || oldForm) stale += 1;
  const headers = Object.fromEntries(HEADERS.map(h => [h, plain.headers.get(h)]).filter(([, v]) => v !== null));
  rows.push({ path: p, status: plain.status, identical_to_cache_busted: same, old_form_text: oldForm, title_plain: title(plainHtml), title_fresh: title(bustedHtml), headers });
}
for (const row of rows) {
  console.log(`${row.identical_to_cache_busted && !row.old_form_text ? 'FRESH' : 'STALE'}  ${row.path}  plain="${row.title_plain}"  fresh="${row.title_fresh}"  ${JSON.stringify(row.headers)}`);
}
console.log(`\n${BASE}: ${rows.length - stale}/${rows.length} pages fresh.`);
if (stale && process.env.GITHUB_ACTIONS) console.log(`::warning title=Stale HTML::${stale} page(s) on ${BASE} differ from a cache-busted fetch; see job log for cache headers.`);
process.exit(stale && process.env.STRICT === '1' ? 1 : 0);
