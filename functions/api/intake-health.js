/*
 * Intake health check for monitoring. Reports only whether the email
 * delivery secret is bound to this deployment; never its value, and it
 * never sends email.
 */
export function onRequestGet(context) {
  const configured = !!(context.env && context.env.RESEND_API_KEY);
  return new Response(JSON.stringify({
    ok: configured,
    endpoint: '/api/case-review',
    delivery_configured: configured
  }), {
    status: configured ? 200 : 503,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex'
    }
  });
}
