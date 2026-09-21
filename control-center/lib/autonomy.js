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
