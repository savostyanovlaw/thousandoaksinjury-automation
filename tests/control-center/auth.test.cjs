const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
async function m(){return import(pathToFileURL(process.cwd()+'/control-center/lib/auth.js'));}

const env={
  AUTHORIZED_EMAIL:'savostyanovlaw@gmail.com',
  CONTROL_AUTH_PASSWORD:'correct horse battery staple',
  CLOUDFLARE_API_TOKEN:'server-side-signing-material'
};

test('native credentials accept only configured email and password',async()=>{
  const {verifyCredentials}=await m();
  assert.equal(await verifyCredentials(env,'SavostyanovLaw@Gmail.com','correct horse battery staple'),true);
  assert.equal(await verifyCredentials(env,'other@example.com','correct horse battery staple'),false);
  assert.equal(await verifyCredentials(env,'savostyanovlaw@gmail.com','wrong'),false);
});

test('native auth fails closed when configured password is too short',async()=>{
  const {verifyCredentials}=await m();
  const weak={...env,CONTROL_AUTH_PASSWORD:'short-password'};
  assert.equal(await verifyCredentials(weak,'savostyanovlaw@gmail.com','short-password'),false);
});

test('signed native session validates and rejects tampering',async()=>{
  const {createSessionToken,verifySessionToken}=await m();
  const now=1_800_000_000_000;
  const token=await createSessionToken(env,'savostyanovlaw@gmail.com',now);
  const session=await verifySessionToken(env,token,now+1000);
  assert.equal(session.email,'savostyanovlaw@gmail.com');
  await assert.rejects(()=>verifySessionToken(env,token+'x',now+1000),/Unauthorized/);
});

test('expired native session is rejected',async()=>{
  const {createSessionToken,verifySessionToken}=await m();
  const now=1_800_000_000_000;
  const token=await createSessionToken(env,'savostyanovlaw@gmail.com',now,1000);
  await assert.rejects(()=>verifySessionToken(env,token,now+2000),/Unauthorized/);
});

test('requireAuthorizedUser reads native session cookie instead of Cloudflare Access context',async()=>{
  const {createSessionToken,requireAuthorizedUser}=await m();
  const token=await createSessionToken(env,'savostyanovlaw@gmail.com',Date.now());
  const context={request:{headers:new Headers({cookie:`slc_session=${token}`})},data:{}};
  const user=await requireAuthorizedUser(context,env);
  assert.equal(user.email,'savostyanovlaw@gmail.com');
});

test('missing native session fails closed',async()=>{
  const {requireAuthorizedUser}=await m();
  const context={request:{headers:new Headers()},data:{}};
  await assert.rejects(()=>requireAuthorizedUser(context,env),/Unauthorized/);
});
