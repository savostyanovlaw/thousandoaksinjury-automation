import { jsonResponse } from '../../../lib/http.js';

export async function onRequestGet(context) {
  return jsonResponse({ ok: true, cloudflareTokenConfigured: Boolean(context.env.CLOUDFLARE_API_TOKEN) });
}
