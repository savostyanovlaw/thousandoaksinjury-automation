import { jwtVerify, createRemoteJWKSet } from 'jose';
import { AuthorizationError } from './auth.js';

// Authenticates GitHub Actions workflow calls (currently only the ingest
// endpoint) using GitHub's own OpenID Connect identity tokens instead of a
// shared secret synchronized by hand between GitHub and Cloudflare. A
// shared secret set in the Cloudflare dashboard only binds to *future*
// deployments (see https://developers.cloudflare.com/pages/functions/bindings/#secrets),
// so a secret added after the last deploy silently does nothing until the
// next one -- exactly the failure mode this replaces. An OIDC token is
// minted fresh by GitHub for each workflow run, is cryptographically
// verifiable against GitHub's own public keys, expires in minutes, and
// requires no secret to ever be created, stored, or rotated on either
// side.
export const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';

// Not secrets: an OIDC audience and a source repository are the identity
// this endpoint trusts, not credentials. Safe to read directly from code.
export const INGEST_AUDIENCE = 'slc-ai-control-ingest';
export const INGEST_REPOSITORY = 'savostyanovlaw/thousandoaksinjury-automation';
// A distinct audience for maintenance operations (the audited approval-
// queue cleanup): least privilege -- a token minted for ingesting one
// agent's review result should never also authorize a queue-wide cleanup,
// even though both come from the same trusted repository.
export const MAINTENANCE_AUDIENCE = 'slc-ai-control-maintenance';

let cachedJwks = null;
function defaultJwks() {
  if (!cachedJwks) cachedJwks = createRemoteJWKSet(new URL(`${GITHUB_OIDC_ISSUER}/.well-known/jwks`));
  return cachedJwks;
}

// jwks is injectable so tests can verify the real claim-checking logic
// against a locally-signed token instead of GitHub's live endpoint.
export async function verifyGithubActionsToken(token, { jwks, audience = INGEST_AUDIENCE, repository = INGEST_REPOSITORY } = {}) {
  if (typeof token !== 'string' || !token) throw new AuthorizationError();
  let payload;
  try {
    ({ payload } = await jwtVerify(token, jwks || defaultJwks(), { issuer: GITHUB_OIDC_ISSUER, audience }));
  } catch {
    throw new AuthorizationError();
  }
  if (payload.repository !== repository) throw new AuthorizationError();
  return payload;
}

export async function requireGithubActionsAuth(request, options = {}) {
  const header = request?.headers?.get?.('authorization') || request?.headers?.get?.('Authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) throw new AuthorizationError();
  return verifyGithubActionsToken(match[1], options);
}
