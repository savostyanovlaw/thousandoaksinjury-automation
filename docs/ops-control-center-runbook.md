# AI Agent Control Center — Preview Deployment Runbook

## Deployment shape

Create a **new** Cloudflare Pages project for the control center. Do not change the existing `thousandoaksinjury` Pages project.

- Repository: `savostyanovlaw/thousandoaksinjury-automation`
- Production branch: do not select `main` for first validation; use `feature/agent-control-center-v1` preview deployment.
- Root directory: `ops`
- Build command: blank
- Build output directory: `public`
- Pages Functions directory: `functions` (automatic under the selected root)

## D1

Create database `toi-ops`, bind it as `OPS_DB`, and apply `ops/schema/0001_initial.sql` before testing APIs.

## GitHub OAuth

Create a GitHub OAuth App dedicated to the ops dashboard. Preview callback is `https://<preview-host>/auth/callback`; production callback after explicit launch approval is `https://ops.thousandoaksinjury.com/auth/callback`.

Configure Cloudflare secrets/vars: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `OPS_SESSION_SECRET`, `OPS_ALLOWED_GITHUB_LOGIN=savostyanovlaw`, `OPS_INGEST_TOKEN`, and optional read-only `GITHUB_OPS_TOKEN`.

Never put secret values in the repository.

## Preview validation

1. Unauthenticated dashboard data APIs return 401.
2. Allowlisted GitHub account can sign in; non-allowlisted account gets 403.
3. Emit a heartbeat and verify the agent card appears.
4. Import Search Console rows and verify scores/order.
5. Verify `/api/github` is read-only.
6. Verify lead-event rejects `message`, `email`, `phone`, and `name`.
7. Verify `X-Robots-Tag: noindex, nofollow, noarchive`.

## Production gate

Do not attach `ops.thousandoaksinjury.com` until preview authentication, D1, live heartbeat, GitHub adapter, and privacy tests are proven. Production activation is a separate explicit approval gate.
