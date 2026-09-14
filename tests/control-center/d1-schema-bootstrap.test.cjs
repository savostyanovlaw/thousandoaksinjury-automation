const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');

async function store(){
  return import(pathToFileURL(process.cwd()+'/control-center/lib/approval-store.js'));
}

test('ensureControlSchema creates all required D1 tables before command writes',async()=>{
  const {ensureControlSchema}=await store();
  assert.equal(typeof ensureControlSchema,'function');
  const sql=[];
  const db={
    prepare(statement){
      sql.push(statement);
      return {run:async()=>({success:true})};
    }
  };
  await ensureControlSchema(db);
  const joined=sql.join('\n').toLowerCase();
  assert.match(joined,/create table if not exists approvals/);
  assert.match(joined,/create table if not exists audit_events/);
  assert.match(joined,/create table if not exists command_idempotency/);
});
