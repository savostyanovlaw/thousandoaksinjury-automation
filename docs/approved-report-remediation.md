# Approved Report Remediation Contract

This contract defines the next Control Center workflow for diagnostic agents such as Technical SEO Watchdog.

## Owner-facing report
Every finding MUST include:
- **What was found** — plain-language description, not only a JSON key.
- **Why it matters** — practical impact.
- **What should be done** — an explicit recommended action, e.g. "Update the page title to accurately describe the page and keep it within the target length."
- **What approval does** — "Approve to authorize preparation of a fix. This does not publish or deploy anything."

Raw JSON remains attached for machine use, but is secondary to the human-readable recommendation.

## Two-gate remediation flow
1. Diagnostic agent produces a report artifact and recommendation.
2. Artifact enters Owner Review Queue.
3. **Gate 1 — APPROVE REMEDIATION:** owner approval authorizes the Orchestrator to create a remediation job from the approved artifact.
4. Orchestrator routes the job to the registered remediation/fix agent for that finding type.
5. Fix agent may edit a feature branch, run tests, and create a pull request. It MUST NOT merge, deploy, publish, or otherwise externally execute.
6. The resulting PR/artifact returns to Owner Review Queue with a human-readable summary of proposed changes and tests.
7. **Gate 2 — APPROVE EXECUTION:** merge/deploy/publish remains a RED action and requires a separate explicit owner approval.
8. Every transition is written to the audit trail.

## Required remediation job payload
```json
{
  "sourceAgentId": "technical-seo-watchdog",
  "sourceArtifact": "<artifact/run id>",
  "ownerApprovalId": "<approval id>",
  "findingType": "<registered finding type>",
  "summary": "<plain-language problem>",
  "recommendedAction": "<plain-language action>",
  "rawFinding": {},
  "executionPolicy": {
    "branchOnly": true,
    "testsRequired": true,
    "pullRequestRequired": true,
    "mergeAllowed": false,
    "deployAllowed": false,
    "publishAllowed": false,
    "secondOwnerApprovalRequired": true
  }
}
```

## Routing
The Orchestrator must use an allowlisted finding-type → remediation-agent mapping. Unknown finding types are not executed; they remain in Review Queue with "No remediation agent registered."

Initial SEO routing should cover title/meta description, canonical, broken-link/redirect, sitemap/robots, schema/structured-data, and other repository-level technical SEO fixes.

## Non-negotiable safety invariant
An approval of a diagnostic report is authorization to **prepare** a fix only. It is never authorization to merge, deploy, publish, contact a third party, or change production. Those actions require their own subsequent explicit owner approval.
