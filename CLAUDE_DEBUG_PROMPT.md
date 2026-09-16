# Claude diagnostic request — Thousand Oaks Injury SEO / PR #40

Review repository savostyanovlaw/thousandoaksinjury-automation, branch seo/money-funnel-internal-links. Diagnose the blocker in Draft PR #40.

Objective: find the root cause and safest solution without corrupting production HTML.

Approved task: add contextual internal links on the six existing city pages (agoura-hills, camarillo, newbury-park, oak-park, simi-valley, westlake-village) to /car-accident-lawyer/, /dog-bite-lawyer/, /slip-and-fall-lawyer/, while retaining href="#contact". The RED regression contract is already in tests/test_local_pages.py. Production HTML has not yet been changed.

Observed blocker: ChatGPT GitHub connector fetch_file output for large city HTML is truncated, while its update_file operation requires complete replacement contents. Replacing a page from truncated output could corrupt it. Direct git clone from the local execution container failed because github.com DNS resolution was unavailable. This appears to be a tooling/data-transfer limitation rather than an SEO/HTML design problem.

Please: (1) inspect the relevant files and confirm or correct this diagnosis; (2) find a safe targeted-patch mechanism that does not require reconstructing a large HTML file from truncated output; consider a repository-side patch script, GitHub Actions, git tree/blob operations, codemod, or another deterministic method; (3) identify the safest deterministic insertion marker, intended around Nearby Communities and before FAQ; (4) explain exact RED-to-GREEN verification; (5) identify cleanup so temporary tooling does not remain in the final PR; (6) keep unrelated defects separate.

Return: Root cause; Recommended solution; Exact implementation steps; Verification; Cleanup; Risks/alternatives. Do not make production edits yourself unless explicitly asked.