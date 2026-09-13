const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
async function m(){return import(pathToFileURL(process.cwd()+'/control-center/lib/http.js'));}

test('same-origin state-changing request is accepted',async()=>{
  const {requireSameOrigin}=await m();
  const req=new Request('https://control.example.com/api/control/commands',{method:'POST',headers:{Origin:'https://control.example.com'}});
  assert.equal(requireSameOrigin(req),true);
});

test('missing or cross-origin state-changing request is rejected',async()=>{
  const {requireSameOrigin}=await m();
  const missing=new Request('https://control.example.com/api/control/commands',{method:'POST'});
  const cross=new Request('https://control.example.com/api/control/commands',{method:'POST',headers:{Origin:'https://evil.example'}});
  for(const req of [missing,cross]){
    try{ requireSameOrigin(req); assert.fail('expected rejection'); }
    catch(error){ assert.equal(error.status,403); assert.match(error.message,/origin/i); }
  }
});
