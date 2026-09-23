const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {createSqliteD1}=require('./sqlite-d1.cjs');

async function approvalStore(){return import(pathToFileURL(process.cwd()+'/control-center/lib/approval-store.js'));}
async function approvalsModule(){return import(pathToFileURL(process.cwd()+'/control-center/functions/api/control/approvals/[id].js'));}

function legacyApprovalsTable(db){
  // The exact pre-CHANGES_REQUESTED shape: no feedback/revision/
  // parent_approval_id columns, and a CHECK constraint with no room for
  // CHANGES_REQUESTED at all.
  db._raw.exec(`CREATE TABLE approvals (
    id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, action TEXT NOT NULL, target_type TEXT NOT NULL,
    target_id TEXT NOT NULL, target_revision TEXT NOT NULL, payload_hash TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    created_at TEXT NOT NULL, decided_at TEXT, decided_by TEXT, consumed_at TEXT
  )`);
  db._raw.exec(`INSERT INTO approvals (id,agent_id,action,target_type,target_id,target_revision,payload_hash,status,created_at)
    VALUES ('legacy-1','technical-seo-watchdog','REVIEW_RESULT','workflow_run','1','1','hash','PENDING','2026-01-01T00:00:00Z')`);
}

test('ensureControlSchema migrates a legacy approvals table (no CHANGES_REQUESTED, no feedback/revision columns) without losing existing rows',async()=>{
  const {ensureControlSchema,getApproval,decideApproval}=await approvalStore();
  const db=createSqliteD1();
  legacyApprovalsTable(db);
  await ensureControlSchema(db);
  const preserved=await getApproval(db,'legacy-1');
  assert.ok(preserved,'the pre-existing row must survive the migration');
  assert.equal(preserved.status,'PENDING');
  assert.equal(preserved.revision,1,'a migrated legacy row defaults to revision 1');
  // The real point of the migration: a CHANGES_REQUESTED write must now
  // succeed against the migrated table's CHECK constraint.
  await decideApproval(db,'legacy-1','CHANGES_REQUESTED','owner@example.com',{feedback:'Please clarify the second paragraph.'});
  const decided=await getApproval(db,'legacy-1');
  assert.equal(decided.status,'CHANGES_REQUESTED');
  assert.equal(decided.feedback,'Please clarify the second paragraph.');
});

test('decideApproval persists feedback only for CHANGES_REQUESTED and the row becomes terminal (never re-decidable)',async()=>{
  const {ensureControlSchema,insertApproval,decideApproval,getApproval}=await approvalStore();
  const db=createSqliteD1();
  await ensureControlSchema(db);
  await insertApproval(db,{id:'ap1',agentId:'russian-language-robot',action:'REVIEW_RESULT',targetType:'workflow_run',targetId:'42',targetRevision:'42',payloadHash:'h',createdAt:'2026-01-01T00:00:00Z'});
  await decideApproval(db,'ap1','CHANGES_REQUESTED','owner@example.com',{feedback:'Make the tone more natural.'});
  const row=await getApproval(db,'ap1');
  assert.equal(row.status,'CHANGES_REQUESTED');
  assert.equal(row.feedback,'Make the tone more natural.');
  await assert.rejects(()=>decideApproval(db,'ap1','APPROVED','owner@example.com'),/stale or already decided/);
});

test('insertApproval round-trips revision and parentApprovalId',async()=>{
  const {ensureControlSchema,insertApproval,getApproval}=await approvalStore();
  const db=createSqliteD1();
  await ensureControlSchema(db);
  await insertApproval(db,{id:'ap2',agentId:'russian-language-robot',action:'REVIEW_RESULT',targetType:'workflow_run',targetId:'43',targetRevision:'43',payloadHash:'h',createdAt:'2026-01-01T00:00:00Z',revision:2,parentApprovalId:'ap1'});
  const row=await getApproval(db,'ap2');
  assert.equal(row.revision,2);
  assert.equal(row.parentApprovalId,'ap1');
});

function githubStub({reviewResult,dispatchAgentRevision}){
  return {
    getWorkflowRunReview:async()=>({reviewResult}),
    dispatchAgentRevision:dispatchAgentRevision||(async()=>{ throw new Error('dispatchAgentRevision should not have been called'); })
  };
}

test('REQUEST_CHANGES requires non-empty feedback',async()=>{
  const {executeApprovalDecision}=await approvalsModule();
  const {ensureControlSchema,insertApproval}=await approvalStore();
  const db=createSqliteD1();
  await ensureControlSchema(db);
  await insertApproval(db,{id:'ap3',agentId:'russian-language-robot',action:'REVIEW_RESULT',targetType:'workflow_run',targetId:'44',targetRevision:'44',payloadHash:'h',createdAt:'2026-01-01T00:00:00Z'});
  const record={id:'ap3',agentId:'russian-language-robot',action:'REVIEW_RESULT',targetType:'workflow_run',targetId:'44',status:'PENDING'};
  const github=githubStub({reviewResult:{}});
  await assert.rejects(()=>executeApprovalDecision({record,decision:'REQUEST_CHANGES',user:{email:'owner@example.com'},db,github,feedback:''}),/Feedback is required/);
  await assert.rejects(()=>executeApprovalDecision({record,decision:'REQUEST_CHANGES',user:{email:'owner@example.com'},db,github}),/Feedback is required/);
});

test('REQUEST_CHANGES on a russian-language-robot review redispatches with the owner feedback, incremented revision, and every real prior field',async()=>{
  const {executeApprovalDecision}=await approvalsModule();
  const {ensureControlSchema,insertApproval,getApproval}=await approvalStore();
  const db=createSqliteD1();
  await ensureControlSchema(db);
  await insertApproval(db,{id:'ap4',agentId:'russian-language-robot',action:'REVIEW_RESULT',targetType:'workflow_run',targetId:'45',targetRevision:'45',payloadHash:'h',createdAt:'2026-01-01T00:00:00Z'});
  const record={id:'ap4',agentId:'russian-language-robot',action:'REVIEW_RESULT',targetType:'workflow_run',targetId:'45',status:'PENDING'};
  let dispatched=null;
  const github=githubStub({
    reviewResult:{
      agent:'russian-language-robot',sourceId:'content-creator:123',sourceRevision:'abc123',
      sourceTitle:'FAQ',sourceBody:'Evidence matters after a crash.',
      localizedTitle:'Вопросы после ДТП',localizedBody:'Существующий русский текст.',
      qaIssues:[{issue:'tone'}],localizationRevision:1
    },
    dispatchAgentRevision:async(job)=>{ dispatched=job; return {ok:true,workflow:'russian-language-robot.yml'}; }
  });
  const result=await executeApprovalDecision({record,decision:'REQUEST_CHANGES',user:{email:'owner@example.com'},db,github,feedback:'Сделать язык естественнее.'});
  assert.equal(result.ok,true);
  assert.equal(result.redispatched,true);
  assert.equal(result.status,'CHANGES_REQUESTED');
  const stored=await getApproval(db,'ap4');
  assert.equal(stored.status,'CHANGES_REQUESTED');
  assert.equal(stored.feedback,'Сделать язык естественнее.');
  assert.ok(dispatched,'dispatchAgentRevision must have been called');
  assert.equal(dispatched.workflow,'russian-language-robot');
  assert.equal(dispatched.inputs.source_id,'content-creator:123');
  assert.equal(dispatched.inputs.source_revision,'abc123');
  assert.equal(dispatched.inputs.title,'FAQ');
  assert.equal(dispatched.inputs.body,'Evidence matters after a crash.');
  assert.equal(dispatched.inputs.localized_title,'Вопросы после ДТП');
  assert.equal(dispatched.inputs.localized_body,'Существующий русский текст.');
  assert.equal(dispatched.inputs.change_request,'Сделать язык естественнее.');
  assert.equal(dispatched.inputs.localization_revision,'2','the revision must increment past the prior review\'s own revision');
  assert.equal(JSON.parse(dispatched.inputs.qa_issues_json)[0].issue,'tone');
});

test('REQUEST_CHANGES on an agent with no revision-aware script records the decision honestly without a fabricated redispatch',async()=>{
  const {executeApprovalDecision}=await approvalsModule();
  const {ensureControlSchema,insertApproval,getApproval}=await approvalStore();
  const db=createSqliteD1();
  await ensureControlSchema(db);
  await insertApproval(db,{id:'ap5',agentId:'technical-seo-watchdog',action:'REVIEW_RESULT',targetType:'workflow_run',targetId:'46',targetRevision:'46',payloadHash:'h',createdAt:'2026-01-01T00:00:00Z'});
  const record={id:'ap5',agentId:'technical-seo-watchdog',action:'REVIEW_RESULT',targetType:'workflow_run',targetId:'46',status:'PENDING'};
  const github=githubStub({reviewResult:{status:'REVIEW',failures:[{check:'title'}]}});
  const result=await executeApprovalDecision({record,decision:'REQUEST_CHANGES',user:{email:'owner@example.com'},db,github,feedback:'Please re-check this.'});
  assert.equal(result.ok,true);
  assert.equal(result.redispatched,false);
  const stored=await getApproval(db,'ap5');
  assert.equal(stored.status,'CHANGES_REQUESTED');
  assert.equal(stored.feedback,'Please re-check this.');
});

test('REQUEST_CHANGES is rejected for a non-review (MERGE_PR/pull_request) approval',async()=>{
  const {executeApprovalDecision}=await approvalsModule();
  const {ensureControlSchema,insertApproval}=await approvalStore();
  const db=createSqliteD1();
  await ensureControlSchema(db);
  await insertApproval(db,{id:'ap6',agentId:'technical-seo-fixer',action:'MERGE_PR',targetType:'pull_request',targetId:'7',targetRevision:'sha',payloadHash:'h',createdAt:'2026-01-01T00:00:00Z'});
  const record={id:'ap6',agentId:'technical-seo-fixer',action:'MERGE_PR',targetType:'pull_request',targetId:'7',status:'PENDING'};
  const github=githubStub({reviewResult:{}});
  await assert.rejects(()=>executeApprovalDecision({record,decision:'REQUEST_CHANGES',user:{email:'owner@example.com'},db,github,feedback:'x'}),/only supported for review results/);
});

test('a CHANGES_REQUESTED approval can never be executed by a later decision call (revision-binding: stale approval never runs)',async()=>{
  const {executeApprovalDecision}=await approvalsModule();
  const {ensureControlSchema,insertApproval}=await approvalStore();
  const db=createSqliteD1();
  await ensureControlSchema(db);
  await insertApproval(db,{id:'ap7',agentId:'russian-language-robot',action:'REVIEW_RESULT',targetType:'workflow_run',targetId:'48',targetRevision:'48',payloadHash:'h',createdAt:'2026-01-01T00:00:00Z'});
  const record={id:'ap7',agentId:'russian-language-robot',action:'REVIEW_RESULT',targetType:'workflow_run',targetId:'48',status:'PENDING'};
  const github=githubStub({reviewResult:{},dispatchAgentRevision:async()=>({ok:true})});
  await executeApprovalDecision({record,decision:'REQUEST_CHANGES',user:{email:'owner@example.com'},db,github,feedback:'x'});
  // A second call must fail up front: executeApprovalDecision itself checks
  // record.status!=='PENDING' before doing anything, exactly like it does
  // for APPROVE/REJECT -- the caller is responsible for reloading the
  // record, and a stale in-memory PENDING record would still be caught by
  // decideApproval's own WHERE status='PENDING' guard.
  const staleRecord={...record,status:'PENDING'};
  await assert.rejects(()=>executeApprovalDecision({record:staleRecord,decision:'REQUEST_CHANGES',user:{email:'owner@example.com'},db,github,feedback:'y'}),/stale or already decided/);
});

test('applyApprovalDecision audits REQUEST_CHANGES distinctly from REJECT, with and without a redispatch',async()=>{
  const {applyApprovalDecision}=await approvalsModule();
  const {ensureControlSchema,insertApproval,listPendingApprovals}=await approvalStore();
  const {listAuditEvents}=await import(pathToFileURL(process.cwd()+'/control-center/lib/audit.js'));
  const db=createSqliteD1();
  await ensureControlSchema(db);
  await insertApproval(db,{id:'ap8',agentId:'russian-language-robot',action:'REVIEW_RESULT',targetType:'workflow_run',targetId:'49',targetRevision:'49',payloadHash:'h',createdAt:'2026-01-01T00:00:00Z'});
  const record={id:'ap8',agentId:'russian-language-robot',action:'REVIEW_RESULT',targetType:'workflow_run',targetId:'49',status:'PENDING'};
  const github=githubStub({reviewResult:{localizationRevision:1},dispatchAgentRevision:async()=>({ok:true})});
  await applyApprovalDecision({record,decision:'REQUEST_CHANGES',actor:'owner@example.com',db,github,feedback:'Improve clarity.'});
  const events=await listAuditEvents(db);
  const match=events.find(e=>e.agentId==='russian-language-robot' && e.result.startsWith('changes-requested'));
  assert.ok(match,'a changes-requested audit event must exist');
  assert.equal(match.result,'changes-requested');
});

// Superseded revision: once the owner requests changes on a review, the
// revision-bound redispatch creates a genuinely new approval for the same
// logical item -- the OLD revision must never linger in Needs Approval
// alongside the new one (it is already terminal via decideApproval's own
// atomic claim), and the NEW revision must be the one actually reviewable.
test('a superseded revision (old CHANGES_REQUESTED approval) is absent from Needs Approval; the new revision it produced remains PENDING',async()=>{
  const {executeApprovalDecision}=await approvalsModule();
  const {ensureControlSchema,insertApproval,listPendingApprovals}=await approvalStore();
  const db=createSqliteD1();
  await ensureControlSchema(db);
  await insertApproval(db,{id:'ap-rev1',agentId:'russian-language-robot',action:'REVIEW_RESULT',targetType:'workflow_run',targetId:'950001',targetRevision:'950001',payloadHash:'h1',createdAt:'2026-01-01T00:00:00Z',revision:1});
  const record={id:'ap-rev1',agentId:'russian-language-robot',action:'REVIEW_RESULT',targetType:'workflow_run',targetId:'950001',status:'PENDING'};
  const github=githubStub({reviewResult:{localizationRevision:1,sourceId:'x',sourceRevision:'x',sourceTitle:'t',sourceBody:'b',localizedTitle:'lt',localizedBody:'lb'},dispatchAgentRevision:async()=>({ok:true})});
  await executeApprovalDecision({record,decision:'REQUEST_CHANGES',user:{email:'owner@example.com'},db,github,feedback:'Please revise.'});
  // The real ingest pipeline creates the actual "revision 2" approval row
  // once the redispatched run completes -- simulated here directly, exactly
  // as ensureRunReviewApproval would produce it.
  await insertApproval(db,{id:'ap-rev2',agentId:'russian-language-robot',action:'REVIEW_RESULT',targetType:'workflow_run',targetId:'950002',targetRevision:'950002',payloadHash:'h2',createdAt:'2026-01-01T00:10:00Z',revision:2,parentApprovalId:'ap-rev1'});
  const pending=await listPendingApprovals(db);
  assert.equal(pending.find(a=>a.id==='ap-rev1'),undefined,'the superseded (old) revision must be absent from Needs Approval');
  const current=pending.find(a=>a.id==='ap-rev2');
  assert.ok(current,'the new revision must remain PENDING');
  assert.equal(current.revision,2);
  assert.equal(current.parentApprovalId,'ap-rev1');
});
