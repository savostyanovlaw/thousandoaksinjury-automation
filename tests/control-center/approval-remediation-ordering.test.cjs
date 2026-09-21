const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
async function approvalsModule(){return import(pathToFileURL(process.cwd()+'/control-center/functions/api/control/approvals/[id].js'));}
async function remediationStore(){return import(pathToFileURL(process.cwd()+'/control-center/lib/remediation-store.js'));}

// A minimal but schema-faithful fake D1: real enough to prove the approval
// claim (PENDING -> APPROVED) is atomic and to let remediation_jobs actually
// accumulate rows, without needing a real database.
function fakeDb({legacyUniqueSchema=false}={}){
  const approvals={ap1:{status:'PENDING',consumedAt:null}};
  const remediationJobs=[];
  let remediationTableCreated=false;
  return {
    approvals,remediationJobs,
    prepare(sql){
      const trimmed=sql.trim();
      return {
        async run(){ return this._exec([]); },
        async first(){ return this._first([]); },
        async all(){ return this._all([]); },
        bind(...args){ return {run:()=>this._exec(args),first:()=>this._first(args),all:()=>this._all(args)}; },
        _exec(args){
          if(/^CREATE TABLE IF NOT EXISTS remediation_jobs/i.test(trimmed)){ remediationTableCreated=true; return {meta:{changes:0}}; }
          if(/^CREATE TABLE .*remediation_jobs_migrated/i.test(trimmed)) return {meta:{changes:0}};
          if(/^CREATE INDEX/i.test(trimmed)) return {meta:{changes:0}};
          if(/^INSERT INTO remediation_jobs_migrated/i.test(trimmed)) return {meta:{changes:0}};
          if(/^DROP TABLE remediation_jobs/i.test(trimmed)) return {meta:{changes:0}};
          if(/^ALTER TABLE remediation_jobs_migrated RENAME/i.test(trimmed)) return {meta:{changes:0}};
          if(/^UPDATE approvals SET status/i.test(trimmed)){
            const [status,,,id]=args;
            const row=approvals[id];
            if(!row || row.status!=='PENDING') return {meta:{changes:0}};
            row.status=status; return {meta:{changes:1}};
          }
          if(/^UPDATE approvals SET consumed_at/i.test(trimmed)){
            const [,id]=args;
            const row=approvals[id];
            if(!row || row.consumed || row.status!=='APPROVED') return {meta:{changes:0}};
            row.consumed=true; return {meta:{changes:1}};
          }
          if(/^INSERT INTO remediation_jobs /i.test(trimmed)){
            const [id,sourceAgentId,sourceRunId,ownerApprovalId,findingType,summary,recommendedAction,rawFindingJson,remediationAgentId]=args;
            remediationJobs.push({id,sourceAgentId,sourceRunId,ownerApprovalId,findingType,summary,recommendedAction,rawFindingJson,remediationAgentId,status:'QUEUED'});
            return {meta:{changes:1}};
          }
          if(/^UPDATE remediation_jobs SET status/i.test(trimmed)){
            // id is always the last bound parameter (... WHERE id=?), whatever
            // the exact number of SET columns/COALESCE args this statement
            // grows to -- pinning to a fixed positional index here previously
            // broke silently the moment updateRemediationJob() gained new
            // columns to set.
            const [status]=args;
            const id=args[args.length-1];
            const job=remediationJobs.find(j=>j.id===id);
            if(job) job.status=status;
            return {meta:{changes:job?1:0}};
          }
          return {meta:{changes:0}};
        },
        _first(){
          if(/^SELECT sql FROM sqlite_master/i.test(trimmed)){
            if(!legacyUniqueSchema || !remediationTableCreated) return null;
            return {sql:"CREATE TABLE remediation_jobs (id TEXT PRIMARY KEY, owner_approval_id TEXT NOT NULL UNIQUE)"};
          }
          return null;
        },
        _all(){ return {results:remediationJobs.slice()}; }
      };
    }
  };
}

const record={id:'ap1',agentId:'technical-seo-watchdog',action:'REVIEW_RESULT',targetType:'workflow_run',targetId:'123',targetRevision:'123',status:'PENDING',consumedAt:null};
const user={email:'owner@example.com'};

test('double-approve on a REVIEW_RESULT approval dispatches remediation at most once', async()=>{
  const {executeApprovalDecision}=await approvalsModule();
  const db=fakeDb();
  let dispatchCount=0;
  const github={
    getWorkflowRunReview:async()=>({reviewResult:{findings:[{findingType:'robots',summary:'Missing sitemap directive'}]}}),
    dispatchRemediation:async()=>{ dispatchCount++; return {ok:true}; }
  };
  const first=await executeApprovalDecision({record:{...record},decision:'APPROVE',user,db,github});
  assert.equal(first.reviewAccepted,true);
  assert.equal(dispatchCount,1);
  assert.equal(db.remediationJobs.length,1);

  // A second APPROVE against the same stale in-memory record (as a
  // double-click or a retried request would send) must be rejected by the
  // atomic claim before any remediation side effect runs again.
  await assert.rejects(
    ()=>executeApprovalDecision({record:{...record},decision:'APPROVE',user,db,github}),
    /Approval is stale or already decided/
  );
  assert.equal(dispatchCount,1,'remediation must not be dispatched twice for one approval');
  assert.equal(db.remediationJobs.length,1,'no duplicate remediation job must be created');
});

test('a multi-finding approval creates and dispatches a remediation job for every finding, not just the first', async()=>{
  const {executeApprovalDecision}=await approvalsModule();
  const db=fakeDb();
  const dispatched=[];
  const github={
    getWorkflowRunReview:async()=>({reviewResult:{findings:[
      {findingType:'robots',summary:'Missing sitemap directive'},
      {findingType:'canonical',summary:'Duplicate canonical tag'},
      {findingType:'broken_link',summary:'Broken internal link'}
    ]}}),
    dispatchRemediation:async(job)=>{ dispatched.push(job.findingType); return {ok:true}; }
  };
  const result=await executeApprovalDecision({record:{...record},decision:'APPROVE',user,db,github});
  assert.equal(result.remediationJobs.length,3);
  assert.deepEqual(dispatched.sort(),['broken_link','canonical','robots']);
  assert.equal(db.remediationJobs.length,3,'every finding must get its own persisted remediation job');
  assert.ok(db.remediationJobs.every(j=>j.status==='DISPATCHED'));
});

test('a remediation dispatch failure marks that job FAILED without losing sibling findings or the approval decision', async()=>{
  const {executeApprovalDecision}=await approvalsModule();
  const db=fakeDb();
  const github={
    getWorkflowRunReview:async()=>({reviewResult:{findings:[
      {findingType:'robots',summary:'Missing sitemap directive'},
      {findingType:'canonical',summary:'Duplicate canonical tag'}
    ]}}),
    dispatchRemediation:async(job)=>{ if(job.findingType==='robots') throw new Error('GitHub 503'); return {ok:true}; }
  };
  const result=await executeApprovalDecision({record:{...record},decision:'APPROVE',user,db,github});
  assert.equal(result.status,'APPROVED');
  const robots=result.remediationJobs.find(j=>j.findingType==='robots');
  const canonical=result.remediationJobs.find(j=>j.findingType==='canonical');
  assert.equal(robots.status,'FAILED');
  assert.equal(canonical.status,'DISPATCHED');
});

test('ensureRemediationSchema migrates a live table off the legacy UNIQUE(owner_approval_id) constraint without losing rows', async()=>{
  const {ensureRemediationSchema}=await remediationStore();
  const db=fakeDb({legacyUniqueSchema:true});
  db.remediationJobs.push({id:'old-job',ownerApprovalId:'ap-legacy',status:'DISPATCHED'});
  await ensureRemediationSchema(db);
  assert.equal(db.remediationJobs.length,1,'pre-existing rows must survive the migration');
  assert.equal(db.remediationJobs[0].id,'old-job');
});

test('approvals/[id].js claims the approval before creating any remediation job', ()=>{
  const fs=require('node:fs');
  const src=fs.readFileSync('control-center/functions/api/control/approvals/[id].js','utf8');
  const claimIndex=src.indexOf("decideApproval(db,record.id,'APPROVED'");
  const createIndex=src.indexOf('createRemediationJob(db,job)');
  assert.ok(claimIndex>=0 && createIndex>=0, 'both calls must be present');
  assert.ok(claimIndex<createIndex, 'decideApproval must be called before createRemediationJob so a double-click cannot dispatch remediation twice');
});
