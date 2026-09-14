import { requireAuthorizedUser } from '../../../lib/auth.js';
import { json } from '../../../lib/http.js';

export async function onRequestGet(context) {
  try {
    requireAuthorizedUser(context);
    if (!context.env.CLOUDFLARE_API_TOKEN) {
      return json({ ok: false, configured: false }, { status: 503 });
    }
    const response = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
      headers: { Authorization: `Bearer ${context.env.CLOUDFLARE_API_TOKEN}` }
    });
    const body = await response.json().catch(() => ({}));
    return json({
      ok: response.ok && body.success === true,
      configured: true,
      status: body?.result?.status || null
    }, { status: response.ok && body.success === true ? 200 : 502 });
  } catch (error) {
    return json({ ok: false, error: error.message }, { status: 500 });
  }
}
