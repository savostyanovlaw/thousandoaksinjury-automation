const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
async function middleware(){return import(pathToFileURL(process.cwd()+'/control-center/functions/_middleware.js'));}
const env={AUTHORIZED_EMAIL:'savostyanovlaw@gmail.com',CONTROL_AUTH_PASSWORD:'example-password-long-enough-2026',CLOUDFLARE_API_TOKEN:'example-signing-material'};

test('unauthenticated browser request is redirected to native login',async()=>{
  const {onRequest}=await middleware();
  const request=new Request('https://slc-ai-control.pages.dev/');
  const response=await onRequest({request,env,data:{},next:async()=>new Response('dashboard')});
  assert.equal(response.status,303);
  assert.equal(response.headers.get('location'),'/auth/login');
});

test('login accepts configured credentials and issues secure session cookie',async()=>{
  const {onRequest}=await middleware();
  const body=new URLSearchParams({email:'savostyanovlaw@gmail.com',password:'example-password-long-enough-2026'});
  const request=new Request('https://slc-ai-control.pages.dev/auth/login',{method:'POST',headers:{origin:'https://slc-ai-control.pages.dev','content-type':'application/x-www-form-urlencoded'},body});
  const response=await onRequest({request,env,data:{},next:async()=>new Response('unused')});
  assert.equal(response.status,303);
  assert.equal(response.headers.get('location'),'/');
  const cookie=response.headers.get('set-cookie');
  assert.match(cookie,/slc_session=/);
  assert.match(cookie,/HttpOnly/);
  assert.match(cookie,/Secure/);
  assert.match(cookie,/SameSite=Strict/);
});

test('unauthenticated API request fails with 401 rather than redirect',async()=>{
  const {onRequest}=await middleware();
  const request=new Request('https://slc-ai-control.pages.dev/api/control/state');
  const response=await onRequest({request,env,data:{},next:async()=>new Response('unused')});
  assert.equal(response.status,401);
  assert.match(await response.text(),/Unauthorized/);
});
