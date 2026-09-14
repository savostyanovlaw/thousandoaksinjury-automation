import { requireAuthorizedUser } from '../../../lib/auth.js';
import { jsonResponse } from '../../../lib/http.js';

export async function onRequestGet(context) {
  try {
    await requireAuthorizedUser(context, context.env);
    return jsonResponse({
      ok: true,
      capabilities: [
        'verify-cloudflare-token',
        'read-control-center-pages-project'
      ]
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, Number(error?.status) || 500);
  }
}
