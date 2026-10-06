const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function setup(consent) {
  const events = [], listeners = {};
  const context = { window: { gtag: (...args) => events.push(args) }, location: { origin: 'https://thousandoaksinjury.com', pathname: '/dog-bite-lawyer/' }, localStorage: { getItem: () => JSON.stringify(consent) }, document: { addEventListener: (name, fn) => { listeners[name] = fn; } } };
  const file = path.join(__dirname, '../website/assets/lead-events.js');
  assert.ok(fs.existsSync(file), 'Lead tracking must be implemented');
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context);
  return { context, events, click: href => listeners.click({ target: { closest: () => ({ getAttribute: () => href }) } }) };
}
test('phone click is measured separately from a submitted lead and excludes personal data', () => {
  const s = setup({ analytics: true });
  s.click('tel:+18182138798');
  assert.equal(s.events.length, 1);
  assert.equal(s.events[0][1], 'phone_click');
  assert.deepEqual(JSON.parse(JSON.stringify(s.events[0][2])), { page_location: 'https://thousandoaksinjury.com/dog-bite-lawyer/', page_path: '/dog-bite-lawyer/' });
});
test('analytics events stop immediately when consent is rejected', () => {
  const s = setup({ analytics: false }); s.click('tel:+18182138798');
  s.context.window.toiTrackEvent('generate_lead'); assert.equal(s.events.length, 0);
});
test('ordinary navigation and mail links do not become phone conversions', () => {
  const s = setup({ analytics: true }); s.click('/'); s.click('mailto:attorney@savostyanovlaw.com'); assert.equal(s.events.length, 0);
});
test('successful form tracking includes no submitted name, email, phone or message', () => {
  const s = setup({ analytics: true }); s.context.window.toiTrackEvent('generate_lead');
  assert.equal(s.events[0][1], 'generate_lead'); assert.equal(Object.keys(s.events[0][2]).length, 2);
});
