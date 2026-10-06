# Personal injury SEO and conversion improvements

## Prepared website changes

- Persistent mobile call/case-review actions and attorney profile links across the 15 sitemap pages, including the Russian page and video library.
- A visible phone/case-review CTA on the video library.
- Expanded dog bite and slip and fall pages on their existing URLs, using the shared navigation, contact form and advertising footer. Their titles/H1s now target Thousand Oaks while retaining statewide service language.
- New `/wrongful-death-lawyer/` and `/motorcycle-accident-lawyer/` resources, linked from the homepage and included in the sitemap.
- Connected `LegalService` and `Service` structured data on the four practice pages.
- Consent-gated `phone_click` events, separately from `generate_lead`, which is sent only after a successful form response. A phone click is not proof of a completed call or intake.
- Event URLs and GA4 configuration exclude query strings and fragments. Intake field values are not added to these analytics events.
- Preserved homepage/car-accident/Russian titles, H1s, canonicals, and existing EN/RU hreflang. Existing page URLs are retained.

## Audit corrections

The production `/assets/city-pages.js` was fetched and compared byte-for-byte with the repository on October 5, 2026. It already contains GA4 measurement ID `G-2QSCB196HW`, consent-controlled tag loading, and successful form events. Absence of a Google tag in the initial HTML is not evidence that GA4 is absent. Actual reception in the intended GA4 property still requires a signed-in verification.

The HTTPS www host independently returned HTTP 522 during this implementation. Its Cloudflare configuration cannot be fixed from HTML alone.

## Cloudflare action requiring account access

Inspect the current DNS target and Pages custom-domain configuration first. Ensure `www.thousandoaksinjury.com` resolves to a configured, valid host, with TLS coverage. Create a host-specific redirect for requests whose hostname is exactly `www.thousandoaksinjury.com`:

- Destination: `https://thousandoaksinjury.com` plus the original path.
- Status: 301.
- Preserve query string.
- Cover both HTTP and HTTPS; verify that the apex does not match the redirect rule.
- Check `/`, `/dog-bite-lawyer/`, and an unknown path for loops and correct destinations.

Do not add a universal `/*` redirect to apex: that would match apex requests too. Cloudflare Pages `_redirects` does not support domain-level redirects; use an appropriate Cloudflare Redirect Rule/Bulk Redirect configuration after inspecting the actual account setup.

Reference: https://developers.cloudflare.com/pages/configuration/redirects/

## Google Business Profile draft

Primary category: **Personal injury attorney**.

Inspect current secondary categories before changing them. Keep only categories that accurately describe the business; do not infer unseen categories or automatically delete legitimate services. Preserve the existing business name, address, and phone.

Proposed description (under 750 characters):

Savostyanov Law Corporation represents people injured in car, motorcycle, pedestrian and rideshare accidents, dog attacks, slip and fall incidents, and other personal injury matters, including wrongful death. Based in Westlake Village, the firm serves Thousand Oaks and clients throughout California. Clients communicate directly with attorney Alexey Savostyanov in English or Russian. Consultations are free. Personal injury representation is offered under a written contingency fee agreement that explains attorney fees and case costs separately.

Proposed services: Car accidents; Motorcycle accidents; Pedestrian accidents; Rideshare accidents; Dog bites; Slip and fall / premises liability; Wrongful death.

Review requests and replies require the actual reviews/client list and separate authorization to contact those people. Do not fabricate reviews, disclose client information in replies, script search keywords, or offer incentives.

## Legal sources used for practice-page drafting

The official 2026 CACI PDF was downloaded and its text examined:
https://courts.ca.gov/system/files/file/judicial_council_of_california_civil_jury_instructions_2026.pdf

- CACI 463: PDF page 452 / printed page 378 — dog bite elements; Civil Code § 3342.
- CACI 1000–1001: PDF pages 700–703 / printed pages 626–629 — premises liability and reasonable care; Civil Code § 1714.
- CACI 3921: PDF pages 2773–2775 / printed pages 887–889 — wrongful death damages and statutory sources.
- DMV lane sharing guidance: https://www.dmv.ca.gov/portal/handbook/california-driver-handbook/laws-and-rules-of-the-road-cont1/
- California Courts government claim guidance: https://selfhelp.courts.ca.gov/civil-lawsuit/government-claim

The practice pages link to these materials/statutes. They do not claim that an attorney has already reviewed the draft or promise any case result.

## Remaining validation and deployment work

- Merge/deploy through the established production workflow and verify the resulting live files.
- Verify GA4 property reception, cookie rejection, and `phone_click`/successful `generate_lead` events on a real browser. Do not report an accepted event as a completed call.
- A contact-form endpoint response alone does not prove inbox delivery. Check receipt of an explicitly identified test submission with the owner.
- Use Search Console URL Inspection for the new pages and the four URLs identified in the audit. This connector supplies Search Analytics, not URL Inspection or indexing requests.
- No Cloudflare/GBP configuration change or production deployment has occurred as part of preparing this branch.
