import { isNoActionReview } from './autonomy.js';
import { decideApproval } from './approval-store.js';
import { hasAuditResult, writeAudit } from './audit.js';

// One version string per cleanup revision -- bumping it lets a future,
// smarter cleanup re-evaluate rows an earlier version already left alone,
// without ever re-touching a row a PRIOR run of the SAME version already
// transitioned (decideApproval's own atomic WHERE status='PENDING' guard
// makes that half of idempotency free; this constant exists purely for the
// audit trail, so "which cleanup logic produced this transition" is never
// ambiguous later).
export const CLEANUP_VERSION = 'queue-cleanup-v1';

export const CLASSIFICATIONS = Object.freeze({
  GENUINE: 'GENUINE_OWNER_DECISION',
  AUTO_ARCHIVE: 'AUTO_ARCHIVE_NO_ACTION',
  STALE_DUPLICATE: 'STALE_DUPLICATE',
  TEST_FIXTURE: 'TEST_FIXTURE',
  INVALID_LEGACY: 'INVALID_LEGACY_APPROVAL',
  BLOCKED_CONFIG: 'BLOCKED_CONFIGURATION_REQUIRING_OWNER_ACTION',
});

const REASONS = {
  [CLASSIFICATIONS.AUTO_ARCHIVE]: 'This workflow run is a genuine zero-finding/healthy result with no concrete reviewable artifact. It was already (or is now) authoritatively classified as no-action and must never sit in Needs Approval.',
  [CLASSIFICATIONS.STALE_DUPLICATE]: 'Another approval already exists for this exact logical item (same agent, target type, and target id); this row is a stale duplicate.',
  [CLASSIFICATIONS.TEST_FIXTURE]: 'This approval originated from the self-healing closed-loop E2E test fixture, never real production content.',
  [CLASSIFICATIONS.INVALID_LEGACY]: "This approval's agent is no longer present in the current agent registry -- a stale legacy row from a retired or renamed agent.",
};

function isTestFixtureReview(rr) {
  if (!rr || typeof rr !== 'object') return false;
  if (String(rr.sourceRevision || rr.source_revision || '').toLowerCase() === 'e2e-fixture') return true;
  const findings = Array.isArray(rr.findings) ? rr.findings : (Array.isArray(rr.failures) ? rr.failures : []);
  return findings.some((f) => String(f?.findingType || f?.check || '').toLowerCase() === 'e2e_fixture_marker');
}

// Pure classifier: given one PENDING approval plus everything needed to
// judge it, decide which taxonomy class it belongs to. Never mutates
// anything, so this alone is exhaustively unit-testable without a database.
//
// Deliberately conservative: any input this function cannot affirmatively
// place in a non-genuine class (reviewResult could not be fetched, the
// agent is known and the run is not a duplicate/fixture/no-action) falls
// through to GENUINE_OWNER_DECISION. A real approval is never guessed away.
export function classifyPendingApproval({ approval, agentKnown, alreadyAutoArchived, reviewResult, videoJobStatus, isDuplicate }) {
  if (!agentKnown) return CLASSIFICATIONS.INVALID_LEGACY;
  if (approval.targetType === 'video_job' && typeof videoJobStatus === 'string' && videoJobStatus.startsWith('BLOCKED_')) {
    return CLASSIFICATIONS.BLOCKED_CONFIG;
  }
  if (approval.action !== 'REVIEW_RESULT' || approval.targetType !== 'workflow_run') return CLASSIFICATIONS.GENUINE;
  if (alreadyAutoArchived) return CLASSIFICATIONS.AUTO_ARCHIVE;
  if (isDuplicate) return CLASSIFICATIONS.STALE_DUPLICATE;
  if (reviewResult === undefined) return CLASSIFICATIONS.GENUINE;
  if (isTestFixtureReview(reviewResult)) return CLASSIFICATIONS.TEST_FIXTURE;
  if (isNoActionReview(reviewResult)) return CLASSIFICATIONS.AUTO_ARCHIVE;
  return CLASSIFICATIONS.GENUINE;
}

// The real, audited state-transition mechanism: every non-genuine row is
// moved out of PENDING through the exact same atomic
// UPDATE ... WHERE status='PENDING' guard a real owner decision uses
// (decideApproval), never a raw UPDATE against the table and never a
// DELETE. That guard is also what makes re-running this idempotent: a row
// this call (or a real owner) already moved out of PENDING is no longer
// PENDING, so a second run's decideApproval call for it fails harmlessly
// and is skipped -- already-clean state never changes twice.
// fetchReviewResults=false runs a CHEAP pass: only the audit-contradiction
// check (a targeted, indexed DB read, no GitHub call) and the
// duplicate/unknown-agent checks (in-memory over the already-loaded
// approval rows) run. It skips re-fetching and re-parsing each run's own
// GitHub job log, which is the expensive part -- safe to call on every
// single dashboard load specifically so the required invariant ("a run
// already marked auto-archived-no-action can never reappear in Needs
// Approval") holds continuously, not merely right after a one-time
// migration. The full, expensive pass (fetchReviewResults=true, the
// default) is for the explicit one-time historical cleanup only.
export async function cleanupApprovalQueue({ db, github, agents, listPendingApprovals, getVideoJobStatus, fetchReviewResults = true }) {
  const agentIds = new Set((agents || []).map((a) => a.id));
  const pending = await listPendingApprovals(db);
  // Oldest first: the earliest approval for a given logical (agent, target
  // type, target id) triple is the canonical one to KEEP; anything sharing
  // that exact triple that arrived later is the duplicate.
  const sorted = [...pending].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const seenKeys = new Set();
  const results = [];
  for (const approval of sorted) {
    const key = `${approval.agentId}:${approval.targetType}:${approval.targetId}`;
    const isDuplicate = seenKeys.has(key);
    seenKeys.add(key);

    const agentKnown = agentIds.has(approval.agentId);
    let alreadyAutoArchived = false;
    let reviewResult;
    let videoJobStatus;
    let fetchDiagnostic;
    if (agentKnown && approval.action === 'REVIEW_RESULT' && approval.targetType === 'workflow_run') {
      alreadyAutoArchived = await hasAuditResult(db, { agentId: approval.agentId, action: 'REVIEW_RESULT', targetId: approval.targetId, result: 'auto-archived-no-action' });
      if (!alreadyAutoArchived && !isDuplicate && fetchReviewResults) {
        try {
          const review = await github.getWorkflowRunReview(approval.targetId);
          reviewResult = review?.reviewResult;
          fetchDiagnostic = reviewResult ? 'found' : 'no-marker-found';
        } catch (err) {
          reviewResult = undefined;
          fetchDiagnostic = `error:${String(err && err.message || err).slice(0, 200)}`;
        }
      }
    }
    if (agentKnown && approval.targetType === 'video_job' && typeof getVideoJobStatus === 'function') {
      try {
        videoJobStatus = await getVideoJobStatus(db, approval.targetId);
      } catch {
        videoJobStatus = undefined;
      }
    }

    const classification = classifyPendingApproval({ approval, agentKnown, alreadyAutoArchived, reviewResult, videoJobStatus, isDuplicate });
    const transitionable = classification !== CLASSIFICATIONS.GENUINE && classification !== CLASSIFICATIONS.BLOCKED_CONFIG;
    let transitioned = false;
    if (transitionable) {
      try {
        await decideApproval(db, approval.id, 'REJECTED', 'system:queue-cleanup', { feedback: `${CLEANUP_VERSION} ${classification}: ${REASONS[classification] || ''}`.slice(0, 500) });
        await writeAudit(db, {
          timestamp: new Date().toISOString(),
          actor: 'system:queue-cleanup',
          agentId: approval.agentId,
          action: approval.action,
          targetType: approval.targetType,
          targetId: approval.targetId,
          targetRevision: approval.targetRevision,
          autonomy: 'GREEN',
          result: `cleanup-${classification.toLowerCase().replace(/_/g, '-')}`,
          approvalId: approval.id,
          errorText: `${CLEANUP_VERSION}: ${REASONS[classification] || ''}`,
        });
        transitioned = true;
      } catch {
        // Already decided -- by a real owner action, or a prior cleanup run.
        // Never an error: this is exactly what idempotency looks like.
      }
    }
    const resultRow = { approvalId: approval.id, agentId: approval.agentId, targetType: approval.targetType, targetId: approval.targetId, classification, transitioned };
    if (fetchDiagnostic) resultRow.fetchDiagnostic = fetchDiagnostic;
    results.push(resultRow);
  }
  const summary = {};
  for (const r of results) summary[r.classification] = (summary[r.classification] || 0) + 1;
  return { version: CLEANUP_VERSION, total: results.length, results, summary };
}
