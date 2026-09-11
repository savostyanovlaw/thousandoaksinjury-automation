# Savostyanov Law Premium Website Redesign — Design Spec

## Goal
Create a deployment-ready redesign of `thousandoaksinjury.com` that looks like a premium California boutique personal-injury firm while preserving current SEO value, URLs, crawlability, and the existing no-deploy workflow until final approval.

## Approved visual direction
The approved visual direction is the September 6, 2026 homepage mockup built around the existing `thousandoaksinjury.com` brand and the user-supplied portrait of Alexey Savostyanov. The design language is **California Editorial Luxury**: warm ivory and white backgrounds, deep navy/charcoal, restrained bronze accents, large editorial serif headlines, clean sans-serif UI, substantial whitespace, real attorney photography, and cinematic local imagery from Thousand Oaks / Westlake Village / Ventura County.

The site must feel expensive through typography, composition, photography, restraint, and motion quality — not through flashy effects, heavy gradients, generic stock-law imagery, or simulated “big firm” claims.

## Brand and positioning
Primary brand display: `THOUSAND OAKS INJURY` with `SAVOSTYANOV LAW` as the firm identifier/sub-brand.

Primary positioning message: **Serious representation. Direct access to your attorney.**

Core differentiation:
- Direct attorney access; clients are not handed to a case manager.
- California personal-injury focus.
- Thousand Oaks / Westlake Village local presence with statewide representation where appropriate.
- English and Russian communication.
- Free case review.

No fabricated verdicts, settlements, client counts, “millions recovered,” success rates, ratings, awards, or testimonials may be used. Results and reviews must only display facts expressly verified by the firm.

## Information architecture
Preserve all currently indexed production URLs unless a later approved migration plan expressly redirects them. Existing top-level URLs such as `/`, `/car-accident-lawyer/`, `/agoura-hills/`, `/camarillo/`, `/newbury-park/`, `/oak-park/`, `/simi-valley/`, `/westlake-village/`, and `/ru/` must remain valid.

Primary global navigation:
- Practice Areas
- About
- Results
- Reviews
- Resources
- Contact
- EN | RU
- Phone CTA
- Free Case Review CTA

If a Results page does not yet have enough verified material, the navigation item may be hidden until content exists; do not publish an empty or fabricated results page.

## Homepage structure
### 1. Premium sticky header
Desktop header is initially integrated with the hero and transitions to a compact solid background after scrolling. The phone number and `FREE CASE REVIEW` CTA are always available. On mobile, a compact sticky header is paired with a persistent bottom action bar containing `CALL`, `TEXT` where a real SMS-capable number is confirmed, and `FREE CASE REVIEW`.

### 2. Hero
Hero content:
- Eyebrow: `INJURED IN THOUSAND OAKS?`
- H1: `Thousand Oaks Personal Injury Lawyer`
- Positioning line: `Serious representation. Direct access to your attorney.`
- Short supporting copy explaining direct attorney communication.
- Primary CTA: `FREE CASE REVIEW`
- Secondary CTA: `(818) 213-8798`
- Visible email: `attorney@savostyanovlaw.com`
- Local office signal: Westlake Village, California.

Visual treatment: large user-supplied portrait of Alexey Savostyanov integrated into a local California landscape composition. The portrait must not be replaced with an AI-generated lookalike in production. Use the real supplied image or another firm-approved original photograph.

### 3. Trust strip
Immediately below hero:
- California Bar #363457
- USC Gould School of Law
- Direct Attorney Access
- English · Русский
- Free Consultation

### 4. Practice areas
Interactive editorial layout for core practice areas rather than a dense generic card grid. Initial areas:
- Car Accidents
- Motorcycle Accidents
- Pedestrian Injuries
- Premises Liability
- Wrongful Death

Desktop: hover/focus changes the adjacent visual preview while maintaining accessible links.
Mobile: stacked or accordion/card layout with no hover-only dependency.

### 5. Local representation / brand statement
Dark cinematic section emphasizing local presence, direct representation, and seriousness. Example approved headline direction: `Local Representation. Real Results for Real People.` This wording must not imply unverified outcomes; if necessary, substitute `Local Representation. Personal Attention.` before production.

### 6. How it works
Three-step process:
1. Talk Directly With an Attorney
2. We Investigate the Claim
3. We Pursue the Case

Copy should remain concise and avoid guarantees.

### 7. Attorney section
Large editorial spread using the real portrait.
Required facts:
- Alexey Savostyanov
- California Bar No. 363457
- USC Gould School of Law
- English / Russian
- State/federal admissions only if verified in site content before publication

Include `ABOUT ALEXEY` and `VERIFY STATE BAR LICENSE` links.

### 8. Reviews
Prominent premium testimonial section. Only real, firm-approved reviews may be shown. If Google-review API integration is not available or reliable, use verified manually curated reviews. Do not hard-code a rating such as `4.9/5` unless the current Google rating is independently confirmed immediately before launch.

### 9. Final contact section
Large high-contrast case-review area with:
- Full name
- Phone
- Email
- Brief case description
- `REQUEST A FREE CASE REVIEW`

Also display phone, email, office location, English/Russian availability, and a short confidentiality/no-obligation notice appropriate for attorney advertising.

## Practice-area page template
All practice-area pages use the same premium visual system but retain unique SEO content and intent.

Required structure:
1. Localized hero and direct CTA
2. Proof/credentials strip
3. Common accident/problem categories
4. What compensation may be available
5. What to do after the incident
6. How insurers evaluate/dispute claims
7. Why Savostyanov Law
8. Attorney profile
9. Verified reviews if available
10. FAQ
11. Final case-review CTA

The template must preserve semantic H1/H2 hierarchy and render meaningful content in HTML without requiring client-side JavaScript.

## Local landing pages
Existing city pages remain distinct, indexable pages and must not become thin clones. Each should retain unique local copy and local signals while adopting the new design system.

## Russian version
`/ru/` remains a genuine Russian-language experience, not automatic machine translation. Navigation, CTAs, forms, validation, and accessibility labels must be localized. Use proper hreflang/canonical handling if currently present or add it as part of the SEO implementation.

## Design system
### Color
- Primary background: warm ivory / off-white
- Secondary background: clean white
- Primary text: deep navy / charcoal
- Accent: restrained muted bronze / warm gold
- Dark sections: near-black navy / charcoal

Accent must be used sparingly. No neon effects, bright gradients, glowing buttons, or fake metallic textures.

### Typography
Use a high-quality editorial serif for major headings and a clean, highly legible sans-serif for body/UI. Prefer locally hosted or privacy-conscious font delivery where licensing permits. Maintain readable line lengths and responsive type scaling.

### Layout
- Large whitespace
- Strong vertical rhythm
- Wide desktop compositions with controlled maximum text widths
- Breakpoint-safe layouts for mobile/tablet/desktop
- Avoid repetitive boxed-card visual language where a simpler editorial treatment works

## Motion and interaction
Allowed:
- subtle scroll reveal
- restrained image parallax
- sticky header transition
- hover/focus image swaps for practice areas
- smooth accordion transitions
- testimonial carousel with keyboard controls
- count-up animation only for verified numeric facts

Disallowed:
- auto-rotating hero carousel
- large particle effects
- 3D gimmicks
- excessive scroll-jacking
- motion that hides important content from crawlers
- animation required to understand navigation or content

Respect `prefers-reduced-motion`.

## Accessibility
Target WCAG 2.2 AA behavior where practical.
Required:
- keyboard-navigable menus and interactive controls
- visible focus states
- adequate color contrast
- semantic landmarks and heading hierarchy
- form labels and useful validation
- descriptive alt text for meaningful images
- decorative images marked appropriately
- no hover-only access to content
- reduced-motion support

## SEO preservation
The redesign must not reset existing SEO work.
Required:
- preserve existing production URLs
- preserve or improve titles, meta descriptions, canonical tags, Open Graph, and structured data
- retain indexable HTML content
- retain semantic H1/H2 structure
- preserve internal links and improve contextual linking where useful
- preserve robots.txt and sitemap behavior
- add hreflang only if implemented correctly for EN/RU
- no JS-only rendering for core content
- no accidental `noindex`
- verify schema remains accurate and does not make unsupported claims

## Performance
Target a fast static-first implementation. Do not introduce React/Next or a heavy SPA framework solely for animation.

Preferred architecture:
- existing static HTML structure retained or converted into maintainable static partial/component patterns only if the current deployment supports them safely
- modern CSS
- minimal vanilla JavaScript modules for interaction
- optimized responsive images (`srcset`/`sizes` where useful)
- lazy-load below-the-fold imagery
- preload only truly critical assets
- no heavyweight animation library unless a measured need justifies it

Target launch quality:
- no obvious layout shifts
- responsive images sized correctly
- no blocking third-party scripts without need
- Lighthouse/Core Web Vitals reviewed on representative desktop and mobile pages before deployment approval

## Contact and visible firm information
The visible UI must consistently include:
- (818) 213-8798
- attorney@savostyanovlaw.com
- Westlake Village, California / verified office address where appropriate
- English · Русский

All phone/email links must use correct `tel:` and `mailto:` behavior.

## Forms
Existing contact delivery behavior must be preserved unless explicitly replaced. The redesign must test actual form submission in a safe staging/test configuration before launch.

Form requirements:
- clear success/error states
- no silent failure
- required-field validation
- spam mitigation compatible with current hosting
- privacy/confidentiality copy appropriate to a law firm
- keyboard/mobile usability

## Content and advertising safeguards
Do not publish:
- unverified case results
- unverified Google ratings
- invented testimonials
- fictitious awards/badges
- misleading office locations
- guarantees of outcome
- unsupported statements such as `No Fee Unless We Win` unless confirmed as accurate for the firm's engagement terms and approved for use

All final attorney-advertising language remains subject to the firm's legal review before deployment.

## Testing and QA
Before the redesign is considered deployment-ready, test at minimum:
- homepage desktop/mobile/tablet
- `/car-accident-lawyer/`
- at least two local pages with different content lengths
- `/ru/`
- navigation and mobile menu
- all phone/email CTAs
- form submission success and failure paths
- keyboard navigation
- reduced-motion behavior
- broken links and missing assets
- structured data syntax
- canonical/meta tags
- responsive layout at common breakpoints
- Chrome, Safari/WebKit-equivalent, and Firefox where available
- 404 page

Run a final SEO regression check comparing old and new page-level metadata and URLs before deployment approval.

## Implementation workflow and safety
All redesign work stays on branch `redesign/premium-v2` or successor feature branches targeting it.

Hard constraints until explicit user approval:
- no merge to `main`
- no production deployment
- no DNS changes
- no production form/integration changes that could interrupt leads

A draft PR may be created for review. Final merge/deployment requires explicit approval after visual, functional, SEO, and performance QA.

## Definition of deployment-ready
The redesign is deployment-ready only when:
- approved visual direction is implemented consistently
- all current key URLs remain functional
- critical content is visible/indexable without JavaScript
- contact information is visible and correct
- forms have been tested
- mobile layout is polished
- accessibility checks show no major blockers
- broken-link/asset check is clean
- metadata/schema regression review is complete
- representative pages pass build/serve validation
- no fabricated or unverified marketing claims remain
- a draft PR documents changes and test evidence
- production remains untouched until final approval
