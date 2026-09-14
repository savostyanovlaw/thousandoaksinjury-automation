import { json } from '../../../lib/http.js';

export async function onRequestGet(context) {
  return json({ ok: true, cloudflareTokenConfigured: Boolean(context.env.CLOUDFLARE_API_TOKEN) });
}
