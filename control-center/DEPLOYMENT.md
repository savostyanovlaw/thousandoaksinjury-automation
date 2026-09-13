# AI Control Center deployment

The Control Center is a separate Cloudflare Pages project. Do not attach it to the public marketing site's Pages project.

## Required bindings

- `AUTHORIZED_EMAIL` = `savostyanovlaw@gmail.com` (plain configuration value)
- `ACCESS_TEAM_DOMAIN` = the firm's Cloudflare Access team domain
- `ACCESS_AUD` = the Access application's Audience tag
- `GITHUB_TOKEN` = secret with only the repository permissions required to read Actions/issues/PRs, dispatch registered workflows, and perform explicitly approved merge operations
- `CONTROL_DB` = Cloudflare D1 binding initialized from `schema.sql`

The final hostname must be selected during deployment, must not be committed here, and must not be linked from `thousandoaksinjury.com` or its sitemap.

## Access policy

Create a Cloudflare Access self-hosted application covering the entire Control Center hostname. The allow policy contains exactly one authorized identity: `savostyanovlaw@gmail.com`. The Pages Access middleware validates the signed Access JWT and the application additionally compares the verified JWT email to `AUTHORIZED_EMAIL`.

Do not consider the app live until unauthenticated access is denied and an authenticated request for the authorized email succeeds.

## D1

Run `schema.sql` against the Control Center D1 database before enabling RED approvals. RED approval execution must remain disabled if the D1 binding is absent.

## Production gate

Deployment is separate from pull-request validation. CI never deploys. After an approved merge and explicit deployment authorization, verify: Access denial for unauthorized sessions, successful authorized login, `X-Robots-Tag` header, Watchdog state parity with GitHub, safe `RUN NOW`, and continued health of the public site.
