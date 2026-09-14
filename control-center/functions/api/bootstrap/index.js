import { requireAuthorizedUser } from '../../../lib/auth.js';
import { json } from '../../../lib/http.js';

export async function onRequestGet(context) {
  try {
    requireAuthorizedUser(context);
    return json({
      ok: true,
      capabilities: [
        'verify-cloudflare-token',
        'read-control-center-pages-project',
        'read-control-center-access-info',
        'ensure-control-center-access'
      ]
    });
  } catch (error) {
    return json({ ok: false, error: error.message }, { status: 500 });
  }
}
