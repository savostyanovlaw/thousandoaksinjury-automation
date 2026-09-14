import { requireAuthorizedUser, requireSameOrigin } from '../../../lib/auth.js';
import { json } from '../../../lib/http.js';

const ACCOUNT_ID = '8c69b02e709c79d82d43029a2c5a4c54';
const HOSTNAME = 'slc-ai-control.pages.dev';
const AUTHORIZED_EMAIL = 'savostyanovlaw@gmail.com';
const API = 'https://api.cloudflare.com/client/v4';

async function cf(env, path, init = {}) {
  if (!env.CLOUDFLARE_API_TOKEN) throw new Error('CLOUDFLARE_API_TOKEN is not configured');
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json', ...(init.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) throw new Error(body?.errors?.map((e) => e.message).join('; ') || `Cloudflare API ${response.status}`);
  return body.result;
}

export async function onRequestPost(context) {
  try {
    requireSameOrigin(context.request);
    const identity = requireAuthorizedUser(context);
    if (identity.email.toLowerCase() !== AUTHORIZED_EMAIL) return json({ ok: false, error: 'Forbidden' }, { status: 403 });
    const input = await context.request.json().catch(() => ({}));
    if (input.action !== 'ensure-control-center-access') return json({ ok: false, error: 'Unsupported action' }, { status: 400 });

    const apps = await cf(context.env, `/accounts/${ACCOUNT_ID}/access/apps`);
    let app = (apps || []).find((item) => item.domain === HOSTNAME);
    if (!app) {
      app = await cf(context.env, `/accounts/${ACCOUNT_ID}/access/apps`, {
        method: 'POST',
        body: JSON.stringify({ name: 'SLC AI Control Center', domain: HOSTNAME, type: 'self_hosted', session_duration: '24h', auto_redirect_to_identity: false })
      });
    }

    const policies = await cf(context.env, `/accounts/${ACCOUNT_ID}/access/apps/${app.id}/policies`);
    const wantedName = 'Allow Savostyanov Law owner only';
    let policy = (policies || []).find((item) => item.name === wantedName);
    const policyBody = { name: wantedName, decision: 'allow', precedence: 1, include: [{ email: { email: AUTHORIZED_EMAIL } }] };
    if (!policy) {
      policy = await cf(context.env, `/accounts/${ACCOUNT_ID}/access/apps/${app.id}/policies`, { method: 'POST', body: JSON.stringify(policyBody) });
    } else {
      policy = await cf(context.env, `/accounts/${ACCOUNT_ID}/access/apps/${app.id}/policies/${policy.id}`, { method: 'PUT', body: JSON.stringify(policyBody) });
    }

    return json({ ok: true, app: { id: app.id, domain: app.domain, aud: app.aud }, policy: { id: policy.id, name: policy.name }, actor: identity.email });
  } catch (error) {
    return json({ ok: false, error: error.message }, { status: 500 });
  }
}
