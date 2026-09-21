// Test-only fixtures for minting locally-signed tokens shaped like GitHub
// Actions OIDC identity tokens, so github-oidc.js's cryptographic
// verification logic can be tested deterministically and offline instead
// of depending on GitHub's live endpoint. Never imported by production
// code -- only by tests.
import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet } from 'jose';
import { GITHUB_OIDC_ISSUER, INGEST_AUDIENCE, INGEST_REPOSITORY } from './github-oidc.js';

export async function generateTestKeyPair(kid = 'test-key-1') {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = kid;
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  return { privateKey, jwk, kid };
}

export async function buildTestJwks() {
  const { privateKey, jwk, kid } = await generateTestKeyPair();
  return { privateKey, jwks: createLocalJWKSet({ keys: [jwk] }), kid };
}

// Builds the raw JWKS document (as GitHub's real endpoint would serve it
// over HTTP) for tests that exercise the default remote-fetch code path by
// mocking global.fetch, rather than injecting a jwks resolver directly.
export async function buildRemoteJwksDocument(kid = 'live-path-key') {
  const { privateKey, jwk } = await generateTestKeyPair(kid);
  return { privateKey, kid, document: { keys: [jwk] } };
}

export async function signTestToken(privateKey, kid, {
  claims = {},
  issuer = GITHUB_OIDC_ISSUER,
  audience = INGEST_AUDIENCE,
  expiresInSeconds = 300,
} = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    repository: INGEST_REPOSITORY,
    run_id: '12345',
    workflow: 'Test Workflow',
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt(now)
    .setExpirationTime(now + expiresInSeconds)
    .sign(privateKey);
}
