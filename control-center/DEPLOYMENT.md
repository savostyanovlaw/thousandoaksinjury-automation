# AI Control Center deployment

The Control Center is a separate Cloudflare Pages project. Do not attach it to the public marketing site's Pages project.

## Required bindings

- `AUTHORIZED_EMAIL` = `savostyanovlaw@gmail.com` (plain configuration value)
- `CONTROL_AUTH_PASSWORD` = strong secret used only by the native Control Center sign-in form
- `CLOUDFLARE_API_TOKEN` = server-side secret used for the read-only Cloudflare project status adapter and as domain-separated session signing material
- `GITHUB_TOKEN` = secret with only the repository permissions required to read Actions/issues/PRs and dispatch registered workflows
- `CONTROL_DB` = Cloudflare D1 binding initialized from `schema.sql`

No Cloudflare Zero Trust or Access application is required.

## Native authentication

All requests pass through `functions/_middleware.js`. Unauthenticated browser requests are redirected to `/auth/login`; unauthenticated API requests return HTTP 401. Login succeeds only when both the submitted email matches `AUTHORIZED_EMAIL` and the submitted password matches `CONTROL_AUTH_PASSWORD`.

Successful login issues a signed `slc_session` cookie with `HttpOnly`, `Secure`, and `SameSite=Strict`. Sessions expire after eight hours and are signed server-side. Authentication responses and dashboard responses remain `no-store`/`noindex`.

Preview deployments must not create an alternate unprotected entry point. The preferred production configuration is to disable automatic preview deployments for this private app. If previews are intentionally enabled later, the native auth variables/secrets must also exist in the preview environment and unauthenticated preview URLs must be verified to redirect to native login before use.

## D1

Run `schema.sql` against the Control Center D1 database before enabling commands or RED approvals. The control API intentionally fails closed if durable idempotency/approval storage is absent.

## Production gate

Deployment is separate from pull-request validation. CI never deploys. After an approved merge and deployment authorization, verify: unauthenticated production access redirects to native login; invalid credentials are rejected; successful owner login works; direct API requests without a valid session return 401; `X-Robots-Tag` and `Cache-Control: no-store` remain present; Watchdog state matches GitHub; safe `RUN NOW` works once `GITHUB_TOKEN` is configured; and the public `thousandoaksinjury.com` site remains healthy.
