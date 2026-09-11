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
  return String(value || '').trim().slice(0, maxLength);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.RESEND_API_KEY) {
    return json({ ok: false, error: 'Submission service is temporarily unavailable.' }, 503);
  }

  let form;
  try {
    form = await request.formData();
  } catch (error) {
    return json({ ok: false, error: 'Invalid submission.' }, 400);
  }

  // Honeypot: silently accept likely automated submissions without sending email.
  if (clean(form.get('website'), 200)) {
    return json({ ok: true });
  }

  const name = clean(form.get('name'), 120);
  const phone = clean(form.get('phone'), 60);
  const email = clean(form.get('email'), 254);
  const message = clean(form.get('message'), 6000);
  const page = clean(form.get('page'), 500);
  const language = clean(form.get('language'), 20) || 'en';

  if (name.length < 2 || phone.length < 7 || !validEmail(email) || message.length < 10) {
    return json({ ok: false, error: 'Please complete all required fields with valid information.' }, 400);
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
    return json({ ok: false, error: 'Unable to send the submission right now.' }, 502);
  }

  if (!resendResponse.ok) {
    return json({ ok: false, error: 'Unable to send the submission right now.' }, 502);
  }

  return json({ ok: true });
}

export function onRequestGet() {
  return json({ ok: false, error: 'Method not allowed.' }, 405);
}
