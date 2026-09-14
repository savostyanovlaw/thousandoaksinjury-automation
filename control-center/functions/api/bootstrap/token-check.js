import { requireAuthorizedUser } from '../../../lib/auth.js';
import { jsonResponse } from '../../../lib/http.js';

export async function onRequestGet(context) {
  try {
    await requireAuthorizedUser(context, context.env);
    if (!context.env.CLOUDFLARE_API_TOKEN) {
      return jsonResponse({ ok: false, configured: false }, 503);
    }
    const response = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
      headers: { Authorization: `Bearer ${context.env.CLOUDFLARE_API_TOKEN}` }
    });
    const body = await response.json().catch(() => ({}));
    return jsonResponse({
      ok: response.ok && body.success === true,
      configured: true,
      status: body?.result?.status || null
    }, response.ok && body.success === true ? 200 : 502);
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, Number(error?.status) || 500);
  }
}
