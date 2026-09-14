import { requireAuthorizedUser } from '../../../lib/auth.js';
import { jsonResponse } from '../../../lib/http.js';

const ACCOUNT_ID = '8c69b02e709c79d82d43029a2c5a4c54';
const PROJECT = 'slc-ai-control';
const API = 'https://api.cloudflare.com/client/v4';

async function cf(env, path) {
  if (!env.CLOUDFLARE_API_TOKEN) throw new Error('CLOUDFLARE_API_TOKEN is not configured');
  const response = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    const message = body?.errors?.map((e) => e.message).join('; ') || `Cloudflare API ${response.status}`;
    throw new Error(message);
  }
  return body.result;
}

export async function onRequestGet(context) {
  try {
    const identity = await requireAuthorizedUser(context, context.env);
    const project = await cf(context.env, `/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}`);
    return jsonResponse({
      ok: true,
      actor: identity.email,
      project: {
        name: project.name,
        subdomain: project.subdomain,
        productionBranch: project.production_branch,
        domains: project.domains || []
      },
      tokenConfigured: true
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, Number(error?.status) || 500);
  }
}
