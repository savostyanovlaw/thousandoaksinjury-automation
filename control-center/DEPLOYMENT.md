# AI Control Center deployment

The Control Center is a separate Cloudflare Pages project. Do not attach it to the public marketing site's Pages project.

## Required bindings

- `AUTHORIZED_EMAIL` = `savostyanovlaw@gmail.com` (plain configuration value)
- `CONTROL_AUTH_PASSWORD` = strong secret used by the native Control Center sign-in form; also serves as the session-signing fallback in isolated Preview environments
- `CONTROL_SESSION_SECRET` = optional dedicated server-side session-signing secret (preferred for production)
- `CLOUDFLARE_API_TOKEN` = server-side secret used only by the read-only Cloudflare project status adapter
- `GITHUB_TOKEN` = secret with only the repository permissions required to read Actions/issues/PRs and dispatch registered workflows
- `CONTROL_DB` = Cloudflare D1 binding initialized from `schema.sql` (also self-created on demand by `ensureControlSchema`/`ensureRemediationSchema` -- every route that touches `CONTROL_DB` calls it first, so a fresh or recreated database heals itself on the next request)

## Autonomous result ingestion (GitHub Actions -> Control Center)

Every producing agent workflow ends with a "Notify Control Center" step that requests a short-lived GitHub Actions OIDC identity token (`permissions: id-token: write`, audience `slc-ai-control-ingest`) and POSTs `{agentId, runId}` to `$CONTROL_CENTER_URL/api/control/ingest/review-result` with `Authorization: Bearer <token>`. The route (`control-center/lib/github-oidc.js`) verifies the token's signature against GitHub's public JWKS (`https://token.actions.githubusercontent.com/.well-known/jwks`) and checks its `repository` claim matches this exact repository and its `run_id` claim matches the run id being ingested.

**No shared secret is created, stored, or synchronized on either side for this.** This intentionally replaces an earlier shared-secret design (`CONTROL_INGEST_TOKEN`): a Cloudflare Pages secret only binds to *deployments created after it was set* (https://developers.cloudflare.com/pages/functions/bindings/#secrets), so a secret added after the last deploy silently does nothing until the next one -- this is exactly the failure this repository hit in production (every ingest call returned 401 "Ingest token not configured" even with the correct token, because the live deployment predated the secret). An OIDC token has no such binding-timing dependency: it is minted fresh by GitHub per run and verified against GitHub's own live public keys, with nothing for either side to configure, rotate, or leave stale.

For this to work in production, the repository owner only needs:

- GitHub Actions repository variable `CONTROL_CENTER_URL` = the Control Center's production origin (e.g. `https://slc-ai-control.pages.dev` or its custom domain), no trailing slash. (Not a secret -- it's a public URL.)

If a legacy `CONTROL_INGEST_TOKEN` secret exists from before this change, it is no longer read by any code path and may be safely deleted from both GitHub Actions and Cloudflare Pages at your convenience; nothing depends on it.

If `CONTROL_CENTER_URL` is unset, or the ingest call otherwise fails, each workflow's notify step logs a warning and continues (it never fails the agent run); the dashboard's own `GET /api/control/state` reconciliation remains a fallback that still surfaces the result the next time a human opens the Control Center.

No Cloudflare Zero Trust or Access application is required.

## Native authentication

All requests pass through `functions/_middleware.js`. Unauthenticated browser requests are redirected to `/auth/login`; unauthenticated API requests return HTTP 401. Login succeeds only when both the submitted email matches `AUTHORIZED_EMAIL` and the submitted password matches `CONTROL_AUTH_PASSWORD`.

Successful login issues a signed `slc_session` cookie with `HttpOnly`, `Secure`, and `SameSite=Strict`. Sessions expire after eight hours and are signed server-side with `CONTROL_SESSION_SECRET` when configured, otherwise `CONTROL_AUTH_PASSWORD`. Session signing does not depend on the Cloudflare management API token. Authentication responses and dashboard responses remain `no-store`/`noindex`.

Preview deployments must not create an alternate unprotected entry point. The preferred production configuration is to disable automatic preview deployments for this private app. If previews are intentionally enabled later, the native auth variables/secrets must also exist in the preview environment and unauthenticated preview URLs must be verified to redirect to native login before use.

## D1

Run `schema.sql` against the Control Center D1 database before enabling commands or RED approvals. The control API intentionally fails closed if durable idempotency/approval storage is absent.

## Production gate

Deployment is separate from pull-request validation. CI never deploys. After an approved merge and deployment authorization, verify: unauthenticated production access redirects to native login; invalid credentials are rejected; successful owner login works; direct API requests without a valid session return 401; `X-Robots-Tag` and `Cache-Control: no-store` remain present; Watchdog state matches GitHub; safe `RUN NOW` works once `GITHUB_TOKEN` is configured; and the public `thousandoaksinjury.com` site remains healthy.
