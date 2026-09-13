const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
async function mod(rel){return import(pathToFileURL(path.join(process.cwd(),rel)).href+'?t='+Date.now());}

test('claimCommandIdempotency accepts first key and rejects duplicate', async()=>{
  const {claimCommandIdempotency}=await mod('control-center/lib/approval-store.js');
  const seen=new Set();
  const db={prepare(){return {bind(key){return {async run(){if(seen.has(key)){const e=new Error('UNIQUE constraint failed');throw e;}seen.add(key);return {meta:{changes:1}};}}}}}};
  assert.equal(await claimCommandIdempotency(db,'abc','technical-seo-watchdog','RUN_NOW'),true);
  assert.equal(await claimCommandIdempotency(db,'abc','technical-seo-watchdog','RUN_NOW'),false);
});

test('claimCommandIdempotency fails closed without durable storage', async()=>{
  const {claimCommandIdempotency}=await mod('control-center/lib/approval-store.js');
  await assert.rejects(()=>claimCommandIdempotency(null,'abc','a','RUN_NOW'),/storage unavailable/);
});
