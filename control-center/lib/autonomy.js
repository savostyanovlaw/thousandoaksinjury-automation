import { findActiveRemediationJob, countRecentRemediationFailures } from './remediation-store.js';

// The GREEN allowlist: finding types that are safe, deterministic, and
// reversible enough to execute without owner approval. Each entry here
// must correspond to an actual deterministic mutation branch in
// remediation-preparer.yml -- being on this list is what lets a finding
// skip Needs Approval entirely, so it is deliberately small and explicit
// rather than inferred from agent identity or finding severity.
//
// - robots-sitemap: appending a missing Sitemap: directive to robots.txt.
//   Purely additive, idempotent, and trivially revertible.
// - e2e_fixture_marker: a repository-internal marker file used only by the
//   gated self-healing E2E fixture; it can never affect real production
//   content (see .github/workflows/technical-seo-watchdog.yml).
export const GREEN_FINDING_TYPES = new Set(['robots-sitemap', 'e2e_fixture_marker']);

// How many times autonomous remediation may fail/roll back for the exact
// same finding before the system stops retrying automatically and instead
// leaves the finding as a normal owner-reviewed approval. Bounded so a
// persistently broken condition (or a broken fixer) cannot retry forever.
export const MAX_AUTO_REMEDIATION_FAILURES = 2;
export const AUTO_REMEDIATION_COOLDOWN_HOURS = 24;
// A job actively in flight blocks a second automatic attempt only while it
// is genuinely recent -- this bounds how long a crashed/stuck job can
// suppress reprocessing of a still-real, still-unresolved condition
// (listStuckRemediationJobs already surfaces the stuck job itself to the
// owner well before this window elapses).
export const IN_FLIGHT_SUPPRESSION_HOURS = 6;

export function classifyFindingType(type) {
  return GREEN_FINDING_TYPES.has(String(type || '').toLowerCase()) ? 'GREEN' : 'YELLOW';
}

// A report is eligible for fully-automatic execution only when EVERY
// actionable item in it is GREEN. A single non-green item anywhere in the
// same report keeps the whole approval on the normal owner-reviewed path --
// partially auto-executing a mixed report would be confusing to audit and
// is not necessary for this to be a real, useful capability.
export function isReportFullyGreen(items) {
  if (!Array.isArray(items) || items.length === 0) return false;
  return items.every((item) => classifyFindingType(item?.findingType || item?.type || item?.check || item?.code) === 'GREEN');
}

// A report is safe to auto-archive out of Needs Approval (and never worth
// creating a PENDING approval for at all) only when it affirmatively
// represents a completed no-action result -- never merely because it has
// zero "findings". A content artifact (a Video Engine proposal, a Russian
// localization, an actionable Content Refresher diff) can legitimately have
// zero items in its `findings` array and still require attorney review, so
// absence of findings alone is never sufficient. Two independent, real
// signals this codebase already uses qualify:
//  - approvalState === 'NOT_REQUIRED': the producing agent's own script
//    explicitly said no review is needed (content_refresher.py and
//    russian_language_robot.py already set this exact field for their own
//    no-action branches; this is the single most authoritative signal,
//    because it is the agent affirmatively declaring "nothing to review"
//    rather than an inference this code draws from other fields). Any other
//    approvalState value (e.g. 'PENDING') means the agent uses this
//    convention and is NOT declaring a no-action result, so it is never
//    auto-archived even if it happens to carry zero findings.
//  - a health-check-style report -- one that never uses the approvalState
//    convention at all, meaning it never claims to produce a reviewable
//    artifact -- that affirmatively reports healthy===true or
//    status==='HEALTHY' with zero findings, and does not explicitly demand
//    requiresAttorneyReview.
export function isNoActionReview(reviewResult) {
  const rr = reviewResult || {};
  if (String(rr.approvalState || '').toUpperCase() === 'NOT_REQUIRED') return true;
  if (rr.approvalState !== undefined) return false;
  if (rr.requiresAttorneyReview === true) return false;
  // Real agent scripts spell "how many actionable items" differently:
  // findingCount/findings (Technical SEO Watchdog, Opportunity Finder,
  // Local SEO Robot), failures (legacy Watchdog shape), suggestionCount/
  // proposals (Internal Link Builder), findingCount alone with per-page
  // proposals (CTR Optimizer). ANY of these present and nonzero means real,
  // actionable content -- checked before any healthy/status inference, and
  // regardless of which other fields are or are not present, since a script
  // that reports a real count is always authoritative about it.
  const countCandidates = [
    rr.findingCount,
    Array.isArray(rr.findings) ? rr.findings.length : undefined,
    Array.isArray(rr.failures) ? rr.failures.length : undefined,
    rr.suggestionCount,
    Array.isArray(rr.proposals) ? rr.proposals.length : undefined,
  ].filter((v) => v !== undefined).map(Number).filter((v) => Number.isFinite(v));
  if (countCandidates.some((v) => v > 0)) return false;
  // No count signal of any kind (a legacy/unknown report shape) is never
  // auto-archived -- there is nothing here to affirmatively confirm no-action.
  if (countCandidates.length === 0) return false;
  if (rr.healthy === true || String(rr.status || '').toUpperCase() === 'HEALTHY') return true;
  // A zero-count report that never explicitly declares itself healthy can
  // still be genuinely no-action -- real read-only/proposal-only monitoring
  // scripts (Competitor Monitor, Internal Link Builder) never set a
  // healthy/status field at all. Treat that as no-action only when the
  // payload itself explicitly declares it is non-publishing (monitor- or
  // proposal-only) and contains no reviewable proposal/draft/content
  // artifact -- a real content artifact can legitimately carry a zero count
  // and must never be inferred as no-action merely from its mode.
  const nonPublishing = rr.publishAllowed === false || /MONITOR_ONLY|PROPOSAL_ONLY|READ_ONLY/.test(String(rr.mode || '').toUpperCase());
  const artifactKeys = ['proposal','proposedChanges','proposed_changes','draft','localizedBody','script','spokenScript','videoUrl','video_url','targetPage','target_page'];
  const hasReviewableArtifact = artifactKeys.some(k => {
    const v = rr[k];
    return Array.isArray(v) ? v.length > 0 : (v && typeof v === 'object' ? Object.keys(v).length > 0 : typeof v === 'string' ? v.trim().length > 0 : false);
  });
  return nonPublishing && !hasReviewableArtifact;
}

// Decides, for one already-classified-GREEN finding, whether it is safe to
// dispatch automatic remediation right now: no other attempt already in
// flight for the same finding, and the finding hasn't exhausted its bounded
// retry budget. Returns {eligible:true} or {eligible:false, reason}.
export async function checkAutoRemediationEligibility(db, { sourceAgentId, findingType }) {
  const active = await findActiveRemediationJob(db, { sourceAgentId, findingType });
  if (active) {
    const ageHours = (Date.now() - new Date(active.createdAt).getTime()) / 3_600_000;
    if (ageHours < IN_FLIGHT_SUPPRESSION_HOURS) {
      return { eligible: false, reason: `Remediation job ${active.id} is already in flight (status ${active.status}).` };
    }
  }
  const sinceIso = new Date(Date.now() - AUTO_REMEDIATION_COOLDOWN_HOURS * 3_600_000).toISOString();
  const failures = await countRecentRemediationFailures(db, { sourceAgentId, findingType }, sinceIso);
  if (failures >= MAX_AUTO_REMEDIATION_FAILURES) {
    return { eligible: false, reason: `Automatic remediation has failed ${failures} time(s) for this finding in the last ${AUTO_REMEDIATION_COOLDOWN_HOURS}h; escalating to owner review instead of retrying again.` };
  }
  return { eligible: true };
}
