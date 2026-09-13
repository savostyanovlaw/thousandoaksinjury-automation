const DESTINATION_EMAIL = 'attorney@savostyanovlaw.com';
const FROM_EMAIL = 'Thousand Oaks Injury Website <intake@forms.thousandoaksinjury.com>';
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function clean(value, maxLength) {
  return typeof value === 'string' ? value.trim() : '';
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

function validationErrors(fields) {
  const errors = {};
  if (!fields.name) errors.name = 'required';
  if (!fields.phone) errors.phone = 'required';
  else if (!validPhone(fields.phone)) errors.phone = 'invalid';
  if (!fields.email) errors.email = 'required';
  else if (!validEmail(fields.email)) errors.email = 'invalid';
  if (!fields.message) errors.message = 'required';
  return errors;
}

const FIELD_LIMITS = {
  name: 120,
  phone: 60,
  email: 254,
  message: 6000,
  page: 500,
  language: 20,
  website: 200
};

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.RESEND_API_KEY) {
    return json({
      ok: false,
      code: 'SERVICE_UNAVAILABLE',
      error: 'Submission service is temporarily unavailable.'
    }, 503);
  }

  let form;
  try {
    form = await request.formData();
  } catch (error) {
    return json({ ok: false, code: 'INVALID_REQUEST', error: 'Invalid submission.' }, 400);
  }

  const raw = {};
  for (const fieldName of Object.keys(FIELD_LIMITS)) raw[fieldName] = form.get(fieldName);
  if (Object.values(raw).some(value => value !== null && typeof value !== 'string')) {
    return json({ ok: false, code: 'INVALID_REQUEST', error: 'Invalid submission.' }, 400);
  }

  // Honeypot: silently accept likely automated submissions without sending email.
  if (clean(raw.website)) {
    return json({ ok: true });
  }

  const name = clean(raw.name);
  const phone = clean(raw.phone);
  const email = clean(raw.email);
  const message = clean(raw.message);
  const page = clean(raw.page);
  const language = clean(raw.language) || 'en';

  const errors = validationErrors({ name, phone, email, message });
  for (const [fieldName, limit] of Object.entries(FIELD_LIMITS)) {
    if (typeof raw[fieldName] === 'string' && raw[fieldName].length > limit) {
      errors[fieldName] = 'too_long';
    }
  }
  if (Object.keys(errors).length) {
    return json({
      ok: false,
      code: 'VALIDATION_ERROR',
      error: 'Please complete all required fields with valid information.',
      fields: errors
    }, 400);
  }

  const submittedAt = new Date().toISOString();
  const text = [
    'New Free Case Review submission',
    '',
    `Name: ${name}`,
    `Phone: ${phone}`,
    `Email: ${email}`,
    `Language: ${language}`,
    `Page: ${page || 'Not provided'}`,
    `Submitted: ${submittedAt}`,
    '',
    'Case description:',
    message,
    '',
    'Website notice: Submission does not create an attorney-client relationship.'
  ].join('\n');

  let resendResponse;
  try {
    resendResponse = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [DESTINATION_EMAIL],
        reply_to: email,
        subject: `New Free Case Review — ${name}`,
        text
      })
    });
  } catch (error) {
    return json({
      ok: false,
      code: 'DELIVERY_FAILED',
      error: 'Unable to send the submission right now.'
    }, 502);
  }

  if (!resendResponse.ok) {
    return json({
      ok: false,
      code: 'DELIVERY_FAILED',
      error: 'Unable to send the submission right now.'
    }, 502);
  }

  return json({ ok: true });
}

export function onRequestGet() {
  return json({ ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Method not allowed.' }, 405);
}
