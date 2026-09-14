# Bootstrap endpoints

Temporary, authenticated server-side endpoints used to establish the Control Center's Cloudflare automation path without exposing the Cloudflare credential to the browser.

- `GET /api/bootstrap/token-check` verifies that the encrypted API token is present and active.
- `GET /api/bootstrap/cloudflare` reads only the dedicated `slc-ai-control` Pages project.

Any write capability must remain explicitly named and hard-scoped; generic Cloudflare API proxying is prohibited.
