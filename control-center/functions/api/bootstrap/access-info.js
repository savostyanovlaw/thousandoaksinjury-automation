import { requireAuthorizedUser } from '../../../lib/auth.js';
import { jsonResponse } from '../../../lib/http.js';

const ACCOUNT_ID = '8c69b02e709c79d82d43029a2c5a4c54';
const API = 'https://api.cloudflare.com/client/v4';

async function request(env, path) {
  if (!env.CLOUDFLARE_API_TOKEN) throw new Error('CLOUDFLARE_API_TOKEN is not configured');
  const response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) throw new Error(body?.errors?.[0]?.message || `Cloudflare API ${response.status}`);
  return body.result;
}

export async function onRequestGet(context) {
  try {
    await requireAuthorizedUser(context, context.env);
    const [organization, applications] = await Promise.all([
      request(context.env, `/accounts/${ACCOUNT_ID}/access/organizations`),
      request(context.env, `/accounts/${ACCOUNT_ID}/access/apps`)
    ]);
    const relevant = (applications || []).filter((app) => {
      const domain = String(app.domain || '');
      return domain === 'slc-ai-control.pages.dev' || domain.endsWith('.slc-ai-control.pages.dev');
    }).map((app) => ({ id: app.id, name: app.name, domain: app.domain, aud: app.aud, type: app.type }));
    return jsonResponse({
      ok: true,
      organization: organization ? { name: organization.name, authDomain: organization.auth_domain } : null,
      applications: relevant
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, Number(error?.status) || 500);
  }
}
