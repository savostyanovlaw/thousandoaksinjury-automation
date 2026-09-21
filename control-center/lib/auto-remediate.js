import { isReportFullyGreen, checkAutoRemediationEligibility } from './autonomy.js';
import { applyApprovalDecision } from '../functions/api/control/approvals/[id].js';

const AUTO_ACTOR = 'system:auto-green-remediation';

function actionableItems(review) {
  const r = review?.reviewResult || {};
  const findings = Array.isArray(r.findings) ? r.findings : (Array.isArray(r.failures) ? r.failures : []);
  return findings.length ? findings : [];
}

// Called right after a NEW REVIEW_RESULT approval is created (push-ingest or
// dashboard-load reconciliation -- never for a re-check of an
// already-processed run, so this never re-fetches or re-decides for the
// same run twice). If every actionable finding in the report is GREEN and
// none of them are already in flight or have exhausted their bounded retry
// budget, this approves the report itself, automatically, as the system --
// exactly the same claim/dispatch/audit code path a human's Approve click
// runs, just invoked without a human. Anything else (mixed report, no
// findings, cooldown exceeded, already in flight) leaves the approval
// PENDING for ordinary owner review; this function is a pure best-effort
// accelerator, never a requirement for the approval to eventually resolve.
export async function maybeAutoRemediateGreenReport({ approvalRow, db, github }) {
  if (!approvalRow) return { attempted: false };
  try {
    const review = await github.getWorkflowRunReview(approvalRow.targetId);
    const items = actionableItems(review);
    if (!isReportFullyGreen(items)) return { attempted: false, reason: 'not fully green' };
    for (const item of items) {
      const findingType = String(item?.findingType || item?.type || item?.check || item?.code || '');
      const eligibility = await checkAutoRemediationEligibility(db, { sourceAgentId: approvalRow.agentId, findingType });
      if (!eligibility.eligible) return { attempted: false, reason: eligibility.reason };
    }
    const record = { ...approvalRow, status: 'PENDING' };
    const result = await applyApprovalDecision({ record, decision: 'APPROVE', actor: AUTO_ACTOR, db, github });
    return { attempted: true, result };
  } catch (error) {
    // Never let an auto-remediation attempt crash the caller (an ingest
    // call or a dashboard load): the approval simply stays PENDING for a
    // human, which is always a safe fallback.
    return { attempted: false, reason: String(error?.message || error).slice(0, 300) };
  }
}
