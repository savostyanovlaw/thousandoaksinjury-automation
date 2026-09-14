const test=require('node:test'); const assert=require('node:assert/strict'); const {pathToFileURL}=require('node:url');
async function state(){return import(pathToFileURL(process.cwd()+'/control-center/functions/api/control/state.js'));}
function ctx(extra={}){return {request:new Request('https://x/api/control/state'),data:{},env:{AUTHORIZED_EMAIL:'savostyanovlaw@gmail.com',GITHUB_TOKEN:'x'},...extra};}
test('state endpoint fails closed without native session',async()=>{const {onRequestGet}=await state(); const res=await onRequestGet(ctx()); assert.equal(res.status,401);});
