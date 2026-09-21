const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
async function oidc(){return import(pathToFileURL(process.cwd()+'/control-center/lib/github-oidc.js'));}
async function fixtures(){return import(pathToFileURL(process.cwd()+'/control-center/lib/github-oidc.testkit.js'));}

test('accepts a validly signed token whose claims match the expected repository',async()=>{
  const {verifyGithubActionsToken}=await oidc();
  const {signTestToken,buildTestJwks}=await fixtures();
  const {privateKey,jwks,kid}=await buildTestJwks();
  const token=await signTestToken(privateKey,kid);
  const payload=await verifyGithubActionsToken(token,{jwks});
  assert.equal(payload.repository,'savostyanovlaw/thousandoaksinjury-automation');
  assert.equal(payload.run_id,'12345');
});

test('rejects a token with the wrong audience',async()=>{
  const {verifyGithubActionsToken}=await oidc();
  const {AuthorizationError}=await import(pathToFileURL(process.cwd()+'/control-center/lib/auth.js'));
  const {signTestToken,buildTestJwks}=await fixtures();
  const {privateKey,jwks,kid}=await buildTestJwks();
  const token=await signTestToken(privateKey,kid,{audience:'some-other-audience'});
  await assert.rejects(()=>verifyGithubActionsToken(token,{jwks}),AuthorizationError);
});

test('rejects a token with the wrong issuer',async()=>{
  const {verifyGithubActionsToken}=await oidc();
  const {AuthorizationError}=await import(pathToFileURL(process.cwd()+'/control-center/lib/auth.js'));
  const {signTestToken,buildTestJwks}=await fixtures();
  const {privateKey,jwks,kid}=await buildTestJwks();
  const token=await signTestToken(privateKey,kid,{issuer:'https://not-github.example.com'});
  await assert.rejects(()=>verifyGithubActionsToken(token,{jwks}),AuthorizationError);
});

test('rejects a token whose repository claim does not match',async()=>{
  const {verifyGithubActionsToken}=await oidc();
  const {AuthorizationError}=await import(pathToFileURL(process.cwd()+'/control-center/lib/auth.js'));
  const {signTestToken,buildTestJwks}=await fixtures();
  const {privateKey,jwks,kid}=await buildTestJwks();
  const token=await signTestToken(privateKey,kid,{claims:{repository:'someone-else/unrelated-repo'}});
  await assert.rejects(()=>verifyGithubActionsToken(token,{jwks}),AuthorizationError);
});

test('rejects an expired token',async()=>{
  const {verifyGithubActionsToken}=await oidc();
  const {AuthorizationError}=await import(pathToFileURL(process.cwd()+'/control-center/lib/auth.js'));
  const {signTestToken,buildTestJwks}=await fixtures();
  const {privateKey,jwks,kid}=await buildTestJwks();
  const token=await signTestToken(privateKey,kid,{expiresInSeconds:-10});
  await assert.rejects(()=>verifyGithubActionsToken(token,{jwks}),AuthorizationError);
});

test('rejects a token signed by a key that is not in the trusted JWKS (tampered/forged)',async()=>{
  const {verifyGithubActionsToken}=await oidc();
  const {AuthorizationError}=await import(pathToFileURL(process.cwd()+'/control-center/lib/auth.js'));
  const {signTestToken,buildTestJwks}=await fixtures();
  const trusted=await buildTestJwks();
  const attacker=await buildTestJwks();
  // Sign with the attacker's key but claim the trusted key's kid, then
  // verify against the trusted JWKS: a real signature-mismatch case.
  const forged=await signTestToken(attacker.privateKey,trusted.kid);
  await assert.rejects(()=>verifyGithubActionsToken(forged,{jwks:trusted.jwks}),AuthorizationError);
});

test('rejects a non-string or empty token',async()=>{
  const {verifyGithubActionsToken}=await oidc();
  const {AuthorizationError}=await import(pathToFileURL(process.cwd()+'/control-center/lib/auth.js'));
  await assert.rejects(()=>verifyGithubActionsToken(''),AuthorizationError);
  await assert.rejects(()=>verifyGithubActionsToken(undefined),AuthorizationError);
});

test('requireGithubActionsAuth extracts and verifies a Bearer token',async()=>{
  const {requireGithubActionsAuth}=await oidc();
  const {signTestToken,buildTestJwks}=await fixtures();
  const {privateKey,jwks,kid}=await buildTestJwks();
  const token=await signTestToken(privateKey,kid);
  const request=new Request('https://slc-ai-control.pages.dev/api/control/ingest/review-result',{headers:{authorization:`Bearer ${token}`}});
  const payload=await requireGithubActionsAuth(request,{jwks});
  assert.equal(payload.repository,'savostyanovlaw/thousandoaksinjury-automation');
});

test('requireGithubActionsAuth fails closed with no Authorization header',async()=>{
  const {requireGithubActionsAuth}=await oidc();
  const {AuthorizationError}=await import(pathToFileURL(process.cwd()+'/control-center/lib/auth.js'));
  const request=new Request('https://slc-ai-control.pages.dev/api/control/ingest/review-result');
  await assert.rejects(()=>requireGithubActionsAuth(request),AuthorizationError);
});

test('requireGithubActionsAuth fails closed with a malformed Authorization header',async()=>{
  const {requireGithubActionsAuth}=await oidc();
  const {AuthorizationError}=await import(pathToFileURL(process.cwd()+'/control-center/lib/auth.js'));
  const request=new Request('https://slc-ai-control.pages.dev/api/control/ingest/review-result',{headers:{authorization:'not-a-bearer-token'}});
  await assert.rejects(()=>requireGithubActionsAuth(request),AuthorizationError);
});
