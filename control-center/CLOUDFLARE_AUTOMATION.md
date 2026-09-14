# Cloudflare automation boundary

The Control Center may use `CLOUDFLARE_API_TOKEN` only from server-side Pages Functions. The credential must never be returned to the browser, logged, committed, or exposed through a generic proxy.

Initial bootstrap capabilities are deliberately hard-coded to Cloudflare account `8c69b02e709c79d82d43029a2c5a4c54` and Pages project `slc-ai-control`. Browser input cannot choose an account, project, API path, URL, or HTTP method.

DNS, billing, membership, unrelated Pages projects, and the public marketing project are outside this automation boundary.

Any expansion of Cloudflare write capabilities must be implemented as a named capability, tested, reviewed through a pull request, and treated according to the Control Center GREEN/YELLOW/RED policy.
