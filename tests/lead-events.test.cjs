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
  assert.deepEqual(JSON.parse(JSON.stringify(s.events[0][2])), { page_location: 'https://thousandoaksinjury.com/dog-bite-lawyer/', page_path: '/dog-bite-lawyer/', cta_location: 'page' });
});
test('analytics events stop immediately when consent is rejected', () => {
  const s = setup({ analytics: false }); s.click('tel:+18182138798');
  s.context.window.toiTrackEvent('generate_lead'); assert.equal(s.events.length, 0);
});
test('ordinary navigation is not tracked and mail links are a separate email_click, never a phone conversion', () => {
  const s = setup({ analytics: true }); s.click('/'); assert.equal(s.events.length, 0);
  s.click('mailto:attorney@savostyanovlaw.com');
  assert.equal(s.events.length, 1); assert.equal(s.events[0][1], 'email_click');
});
test('successful form tracking includes no submitted name, email, phone or message', () => {
  const s = setup({ analytics: true }); s.context.window.toiTrackEvent('generate_lead');
  assert.equal(s.events[0][1], 'generate_lead'); assert.equal(Object.keys(s.events[0][2]).length, 2);
});
test('only allow-listed, non-personal parameters reach analytics', () => {
  const s = setup({ analytics: true });
  s.context.window.toiTrackEvent('generate_lead', { form_id: 'case_review', form_language: 'en', name: 'Jane Doe', email: 'jane@example.com', phone: '8185550101', message: 'hurt' });
  assert.deepEqual(Object.keys(s.events[0][2]).sort(), ['form_id', 'form_language', 'page_location', 'page_path']);
});
test('submission failures are reported with an error code only', () => {
  const s = setup({ analytics: true });
  s.context.window.toiTrackEvent('form_submit_error', { form_id: 'case_review', error_code: 'delivery_failed' });
  assert.equal(s.events[0][1], 'form_submit_error'); assert.equal(s.events[0][2].error_code, 'delivery_failed');
});
test('landing page from first-touch attribution is attached as a path', () => {
  const s = setup({ analytics: true });
  s.context.window.toiFirstTouch = () => ({ landing_page: '/newbury-park/', utm_source: 'google' });
  s.context.window.toiTrackEvent('generate_lead');
  assert.equal(s.events[0][2].landing_page, '/newbury-park/'); assert.equal(s.events[0][2].utm_source, undefined);
});
