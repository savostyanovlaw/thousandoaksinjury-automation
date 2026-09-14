const ACCOUNT_ID = '8c69b02e709c79d82d43029a2c5a4c54';
const PROJECT = 'slc-ai-control';
const API = 'https://api.cloudflare.com/client/v4';

function allowedHost(hostname) {
  return hostname === 'slc-ai-control.pages.dev' || hostname.endsWith('.slc-ai-control.pages.dev');
}

async function cf(env, path, init = {}) {
  if (!env.CLOUDFLARE_API_TOKEN) {
    return { ok: false, status: 503, error: 'Cloudflare token unavailable' };
  }
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      'content-type': 'application/json',
      ...(init.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    return {
      ok: false,
      status: response.status || 502,
      error: body?.errors?.map((item) => item.message).join('; ') || 'Cloudflare API request failed'
    };
  }
  return { ok: true, status: response.status, result: body.result };
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  if (!allowedHost(url.hostname)) {
    return new Response('Not Found', { status: 404 });
  }

  const projectPath = `/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}`;
  const before = await cf(context.env, projectPath);
  if (!before.ok) {
    return Response.json({ ok: false, stage: 'read', error: before.error }, { status: before.status });
  }

  const current = before.result?.build_config || {};
  const desired = {
    root_dir: 'control-center',
    destination_dir: '.',
    build_command: 'exit 0'
  };

  if (
    current.root_dir === desired.root_dir &&
    current.destination_dir === desired.destination_dir &&
    current.build_command === desired.build_command
  ) {
    return Response.json({
      ok: true,
      changed: false,
      project: PROJECT,
      buildConfig: desired
    }, { headers: { 'cache-control': 'no-store' } });
  }

  const updated = await cf(context.env, projectPath, {
    method: 'PATCH',
    body: JSON.stringify({ build_config: desired })
  });
  if (!updated.ok) {
    return Response.json({ ok: false, stage: 'update', error: updated.error }, { status: updated.status });
  }

  const actual = updated.result?.build_config || {};
  return Response.json({
    ok: true,
    changed: true,
    project: PROJECT,
    buildConfig: {
      root_dir: actual.root_dir || null,
      destination_dir: actual.destination_dir || null,
      build_command: actual.build_command || null
    }
  }, { headers: { 'cache-control': 'no-store' } });
}
