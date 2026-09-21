CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, action TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL, target_revision TEXT NOT NULL, payload_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING','APPROVED','REJECTED')), created_at TEXT NOT NULL, decided_at TEXT, decided_by TEXT, consumed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_approvals_status_created ON approvals(status, created_at DESC);
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, actor TEXT NOT NULL, agent_id TEXT NOT NULL, action TEXT NOT NULL, target_type TEXT, target_id TEXT, target_revision TEXT,
  autonomy TEXT NOT NULL, result TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_events(timestamp DESC);
CREATE TABLE IF NOT EXISTS command_idempotency (idempotency_key TEXT PRIMARY KEY, agent_id TEXT NOT NULL, command TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_command_idempotency_created ON command_idempotency(created_at DESC);
CREATE TABLE IF NOT EXISTS remediation_jobs (
  id TEXT PRIMARY KEY, source_agent_id TEXT NOT NULL, source_run_id TEXT NOT NULL, owner_approval_id TEXT NOT NULL, finding_type TEXT NOT NULL,
  summary TEXT NOT NULL, recommended_action TEXT NOT NULL, raw_finding_json TEXT NOT NULL DEFAULT '{}', remediation_agent_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('QUEUED','DISPATCHED','PREPARED','BLOCKED','FAILED')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  workflow_run_id TEXT, pull_request_number INTEGER, pull_request_revision TEXT
);
CREATE INDEX IF NOT EXISTS idx_remediation_status_created ON remediation_jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_remediation_owner_approval ON remediation_jobs(owner_approval_id);
-- A prior version of this table declared owner_approval_id UNIQUE, which
-- silently dropped every finding after the first in a multi-finding
-- approval. Any database created under that schema is migrated forward
-- automatically by ensureRemediationSchema() in remediation-store.js the
-- next time a route touches it; this file only defines the corrected shape
-- for fresh installs.
