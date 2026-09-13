const test=require('node:test'); const assert=require('node:assert/strict'); const {pathToFileURL}=require('node:url');
async function m(){return import(pathToFileURL(process.cwd()+'/control-center/lib/audit.js'));}
test('audit event allowlists fields and never serializes secrets',async()=>{const {sanitizeAuditEvent}=await m(); const out=sanitizeAuditEvent({timestamp:'x',actor:'a',agentId:'b',action:'RUN_NOW',result:'ok',token:'secret',password:'nope'}); assert.equal(out.token,undefined); assert.equal(out.password,undefined); assert.equal(out.action,'RUN_NOW');});
