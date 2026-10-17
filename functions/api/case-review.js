const DESTINATION_EMAIL = 'attorney@savostyanovlaw.com';
const FROM_EMAIL = 'Thousand Oaks Injury Website <intake@forms.thousandoaksinjury.com>';
const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const SITE_ORIGIN = 'https://thousandoaksinjury.com';
const MIN_HUMAN_FILL_MS = 2500;

const FIELD_LIMITS = {
  name: 120,
  phone: 60,
  email: 254,
  message: 6000,
  page: 500,
  language: 20,
  website: 200,
  elapsed_ms: 20,
  landing_page: 300,
  referrer: 300,
  utm_source: 120,
  utm_medium: 120,
  utm_campaign: 160,
  utm_term: 160,
  utm_content: 160,
  gclid: 200
};

const ATTRIBUTION_FIELDS = [
  ['landing_page', 'First landing page'],
  ['referrer', 'Referrer'],
  ['utm_source', 'utm_source'],
  ['utm_medium', 'utm_medium'],
  ['utm_campaign', 'utm_campaign'],
  ['utm_term', 'utm_term'],
  ['utm_content', 'utm_content'],
  ['gclid', 'gclid']
];

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

/* Native (no-JavaScript) form posts get a page, not JSON. */
function wantsJson(request) {
  const accept = request.headers.get('accept') || '';
  return accept.includes('application/json') || !accept.includes('text/html');
}

function respond(request, body, status, language) {
  if (wantsJson(request)) return json(body, status);
  const ru = language === 'ru';
  let target;
  if (body.ok) target = ru ? '/thank-you/?lang=ru' : '/thank-you/';
  else target = body.code === 'VALIDATION_ERROR'
    ? (ru ? '/case-review-error/?reason=validation&lang=ru' : '/case-review-error/?reason=validation')
    : (ru ? '/case-review-error/?lang=ru' : '/case-review-error/');
  return new Response(null, {
    status: 303,
    headers: { location: SITE_ORIGIN + target, 'cache-control': 'no-store' }
  });
}

/* Operational log line: codes and counts only, never intake content. */
function logEvent(event, details) {
  try {
    console.log(JSON.stringify(Object.assign({ event: 'case_review_' + event }, details || {})));
  } catch (error) { /* logging must never block delivery */ }
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function oneLine(value) {
  return value.replace(/[\r\n\t]+/g, ' ').trim();
}

function validEmail(value) {
  const match = /^([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+)@([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+)$/.exec(value);
  return !!match && !match[1].startsWith('.') && !match[1].endsWith('.') && !match[1].includes('..');
}

function validPhone(value) {
  const normalized = value.normalize('NFKC');
  const digits = normalized.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

/* Email is optional: many injured callers only want a call back. Phone is required. */
function validationErrors(fields) {
  const errors = {};
  if (!fields.name) errors.name = 'required';
  if (!fields.phone) errors.phone = 'required';
  else if (!validPhone(fields.phone)) errors.phone = 'invalid';
  if (fields.email && !validEmail(fields.email)) errors.email = 'invalid';
  if (!fields.message) errors.message = 'required';
  return errors;
}

function pagePath(value) {
  if (!value) return '';
  try {
    const url = new URL(value, SITE_ORIGIN);
    return url.pathname;
  } catch (error) {
    return '';
  }
}

function countLinks(text) {
  const matches = text.match(/https?:\/\/|www\./gi);
  return matches ? matches.length : 0;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.RESEND_API_KEY) {
    logEvent('unavailable', { reason: 'missing_resend_api_key' });
    return respond(request, {
      ok: false,
      code: 'SERVICE_UNAVAILABLE',
      error: 'Submission service is temporarily unavailable.'
    }, 503);
  }

  let form;
  try {
    form = await request.formData();
  } catch (error) {
    logEvent('rejected', { code: 'INVALID_REQUEST' });
    return respond(request, { ok: false, code: 'INVALID_REQUEST', error: 'Invalid submission.' }, 400);
  }

  const raw = {};
  for (const fieldName of Object.keys(FIELD_LIMITS)) raw[fieldName] = form.get(fieldName);
  if (Object.values(raw).some(value => value !== null && typeof value !== 'string')) {
    logEvent('rejected', { code: 'INVALID_REQUEST' });
    return respond(request, { ok: false, code: 'INVALID_REQUEST', error: 'Invalid submission.' }, 400);
  }

  const language = clean(raw.language) === 'ru' ? 'ru' : 'en';

  // Honeypot: silently accept likely automated submissions without sending email.
  if (clean(raw.website)) {
    logEvent('honeypot', {});
    return respond(request, { ok: true }, 200, language);
  }

  const name = clean(raw.name);
  const phone = clean(raw.phone);
  const email = clean(raw.email);
  const message = clean(raw.message);
  // Without JavaScript the page field is absent; fall back to the same-site Referer.
  let page = clean(raw.page);
  if (!page) {
    const referer = request.headers.get('referer') || '';
    try {
      const refUrl = new URL(referer);
      if (refUrl.hostname === new URL(request.url).hostname) page = (refUrl.origin + refUrl.pathname).slice(0, FIELD_LIMITS.page);
    } catch (error) { /* no usable referer */ }
  }

  const errors = validationErrors({ name, phone, email, message });
  for (const [fieldName, limit] of Object.entries(FIELD_LIMITS)) {
    if (typeof raw[fieldName] === 'string' && raw[fieldName].length > limit) {
      errors[fieldName] = 'too_long';
    }
  }
  if (Object.keys(errors).length) {
    logEvent('rejected', { code: 'VALIDATION_ERROR', fields: Object.keys(errors) });
    return respond(request, {
      ok: false,
      code: 'VALIDATION_ERROR',
      error: 'Please complete all required fields with valid information.',
      fields: errors
    }, 400, language);
  }

  // Spam signals flag the email for review; they never discard a possible client.
  const spamSignals = [];
  const elapsed = Number.parseInt(clean(raw.elapsed_ms), 10);
  if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < MIN_HUMAN_FILL_MS) spamSignals.push('submitted too quickly');
  if (countLinks(message) >= 3) spamSignals.push('multiple links in message');

  const path = pagePath(page) || 'unknown';
  const attributionLines = ATTRIBUTION_FIELDS
    .map(([field, label]) => [label, oneLine(clean(raw[field]))])
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`);
  const hasCampaign = ['utm_source', 'gclid'].some(field => clean(raw[field]));

  const submittedAt = new Date().toISOString();
  const text = [
    'New Free Case Review submission',
    '',
    `Name: ${name}`,
    `Phone: ${phone}`,
    `Email: ${email || 'Not provided'}`,
    `Language: ${language}`,
    `Page: ${page || 'Not provided'}`,
    `Submitted: ${submittedAt}`,
    '',
    'Case description:',
    message,
    '',
    'Lead attribution:',
    ...(attributionLines.length ? attributionLines : ['Direct / unknown']),
    ...(spamSignals.length ? ['', `Spam check: possible spam (${spamSignals.join('; ')}). Review before relying on it.`] : []),
    '',
    'Website notice: Submission does not create an attorney-client relationship.'
  ].join('\n');

  const subject = `${spamSignals.length ? '[Possible spam] ' : ''}New Free Case Review — ${oneLine(name)} (${path})`;
  const payload = {
    from: FROM_EMAIL,
    to: [DESTINATION_EMAIL],
    subject,
    text
  };
  if (email) payload.reply_to = email;

  let resendResponse;
  try {
    resendResponse = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    logEvent('delivery_failed', { reason: 'network', page: path });
    return respond(request, {
      ok: false,
      code: 'DELIVERY_FAILED',
      error: 'Unable to send the submission right now.'
    }, 502, language);
  }

  if (!resendResponse.ok) {
    let providerError = '';
    try {
      const body = await resendResponse.json();
      providerError = typeof body.name === 'string' ? body.name.slice(0, 80) : '';
    } catch (error) { /* provider body is optional */ }
    logEvent('delivery_failed', { reason: 'provider', status: resendResponse.status, provider_error: providerError, page: path });
    return respond(request, {
      ok: false,
      code: 'DELIVERY_FAILED',
      error: 'Unable to send the submission right now.'
    }, 502, language);
  }

  logEvent('delivered', { page: path, language, campaign: hasCampaign, flagged: spamSignals.length > 0, has_email: !!email });
  return respond(request, { ok: true }, 200, language);
}

export function onRequestGet() {
  return json({ ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Method not allowed.' }, 405);
}
