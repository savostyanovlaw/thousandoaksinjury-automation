const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {createSqliteD1}=require('./sqlite-d1.cjs');

async function remediationStore(){return import(pathToFileURL(process.cwd()+'/control-center/lib/remediation-store.js'));}

function baseJob(overrides={}){
  return {id:crypto.randomUUID(),sourceAgentId:'technical-seo-watchdog',sourceRunId:'1',ownerApprovalId:'ap1',findingType:'robots-sitemap',summary:'s',recommendedAction:'a',rawFinding:{},remediationAgentId:'technical-seo-fixer',autonomy:'GREEN',createdAt:new Date().toISOString(),...overrides};
}

test('a fresh database accepts every new terminal status (MERGED/VERIFIED/ROLLED_BACK/ESCALATED)',async()=>{
  const {ensureRemediationSchema,createRemediationJob,updateRemediationJob,getRemediationJob}=await remediationStore();
  const db=createSqliteD1();
  await ensureRemediationSchema(db);
  const job=baseJob();
  await createRemediationJob(db,job);
  for(const status of ['DISPATCHED','MERGED','VERIFIED']){
    await updateRemediationJob(db,job.id,status);
  }
  const row=await getRemediationJob(db,job.id);
  assert.equal(row.status,'VERIFIED');
  assert.equal(row.autonomy,'GREEN');
});

test('a legacy table (UNIQUE owner_approval_id, narrow status enum) migrates without losing rows and now accepts the new statuses',async()=>{
  const {ensureRemediationSchema,getRemediationJob,updateRemediationJob}=await remediationStore();
  const db=createSqliteD1();
  db._raw.exec(`CREATE TABLE remediation_jobs (
    id TEXT PRIMARY KEY, source_agent_id TEXT NOT NULL, source_run_id TEXT NOT NULL, owner_approval_id TEXT NOT NULL UNIQUE, finding_type TEXT NOT NULL,
    summary TEXT NOT NULL, recommended_action TEXT NOT NULL, raw_finding_json TEXT NOT NULL DEFAULT '{}', remediation_agent_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('QUEUED','DISPATCHED','PREPARED','BLOCKED','FAILED')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    workflow_run_id TEXT, pull_request_number INTEGER, pull_request_revision TEXT)`);
  db._raw.exec(`INSERT INTO remediation_jobs (id,source_agent_id,source_run_id,owner_approval_id,finding_type,summary,recommended_action,status,created_at,updated_at)
    VALUES ('old-job','technical-seo-watchdog','1','ap-legacy','robots','s','a','DISPATCHED','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`);
  await ensureRemediationSchema(db);
  const preserved=await getRemediationJob(db,'old-job');
  assert.ok(preserved,'the pre-existing row must survive the migration');
  assert.equal(preserved.status,'DISPATCHED');
  assert.equal(preserved.autonomy,'YELLOW','a migrated row without an autonomy column must default to YELLOW');
  // The whole point of the migration: a status the old CHECK constraint
  // would have rejected must now be accepted.
  await updateRemediationJob(db,'old-job','VERIFIED');
  const updated=await getRemediationJob(db,'old-job');
  assert.equal(updated.status,'VERIFIED');
});

test('calling ensureRemediationSchema repeatedly is idempotent (no duplicate-column errors)',async()=>{
  const {ensureRemediationSchema}=await remediationStore();
  const db=createSqliteD1();
  await ensureRemediationSchema(db);
  await ensureRemediationSchema(db);
  await ensureRemediationSchema(db);
});

test('findActiveRemediationJob finds an in-flight job but not a terminal one',async()=>{
  const {ensureRemediationSchema,createRemediationJob,updateRemediationJob,findActiveRemediationJob}=await remediationStore();
  const db=createSqliteD1();
  await ensureRemediationSchema(db);
  const job=baseJob({findingType:'robots-sitemap'});
  await createRemediationJob(db,job);
  await updateRemediationJob(db,job.id,'DISPATCHED');
  const active=await findActiveRemediationJob(db,{sourceAgentId:'technical-seo-watchdog',findingType:'robots-sitemap'});
  assert.equal(active.id,job.id);
  await updateRemediationJob(db,job.id,'VERIFIED');
  const noneActive=await findActiveRemediationJob(db,{sourceAgentId:'technical-seo-watchdog',findingType:'robots-sitemap'});
  assert.equal(noneActive,null);
});

test('countRecentRemediationFailures only counts FAILED/ROLLED_BACK/ESCALATED within the window',async()=>{
  const {ensureRemediationSchema,createRemediationJob,updateRemediationJob,countRecentRemediationFailures}=await remediationStore();
  const db=createSqliteD1();
  await ensureRemediationSchema(db);
  const recentIso=new Date().toISOString();
  const oldIso=new Date(Date.now()-1000*3600*48).toISOString();
  const j1=baseJob({createdAt:recentIso}); await createRemediationJob(db,j1); await updateRemediationJob(db,j1.id,'FAILED');
  const j2=baseJob({createdAt:recentIso}); await createRemediationJob(db,j2); await updateRemediationJob(db,j2.id,'ROLLED_BACK');
  const j3=baseJob({createdAt:recentIso}); await createRemediationJob(db,j3); await updateRemediationJob(db,j3.id,'VERIFIED');
  const j4=baseJob({createdAt:oldIso}); await createRemediationJob(db,j4); await updateRemediationJob(db,j4.id,'FAILED');
  const since=new Date(Date.now()-1000*3600*24).toISOString();
  const count=await countRecentRemediationFailures(db,{sourceAgentId:'technical-seo-watchdog',findingType:'robots-sitemap'},since);
  assert.equal(count,2,'only the two recent FAILED/ROLLED_BACK jobs must count; VERIFIED and the old FAILED must not');
});

test('listStuckRemediationJobs finds a DISPATCHED/MERGED job past the threshold but not a fresh or terminal one',async()=>{
  const {ensureRemediationSchema,createRemediationJob,updateRemediationJob,listStuckRemediationJobs}=await remediationStore();
  const db=createSqliteD1();
  await ensureRemediationSchema(db);
  const stuck=baseJob(); await createRemediationJob(db,stuck); await updateRemediationJob(db,stuck.id,'MERGED');
  db._raw.exec(`UPDATE remediation_jobs SET updated_at='2020-01-01T00:00:00Z' WHERE id='${stuck.id}'`);
  const fresh=baseJob(); await createRemediationJob(db,fresh); await updateRemediationJob(db,fresh.id,'DISPATCHED');
  const done=baseJob(); await createRemediationJob(db,done); await updateRemediationJob(db,done.id,'VERIFIED');
  db._raw.exec(`UPDATE remediation_jobs SET updated_at='2020-01-01T00:00:00Z' WHERE id='${done.id}'`);
  const results=await listStuckRemediationJobs(db,20);
  const ids=results.map(r=>r.id);
  assert.ok(ids.includes(stuck.id));
  assert.ok(!ids.includes(fresh.id),'a recently-updated job must not be reported stuck');
  assert.ok(!ids.includes(done.id),'a terminal VERIFIED job must never be reported stuck regardless of age');
});
