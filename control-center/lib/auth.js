export class AuthorizationError extends Error {
  constructor(message='Unauthorized'){ super(message); this.name='AuthorizationError'; this.status=403; }
}
export async function requireAuthorizedUser(context, env){
  const configured = typeof env?.AUTHORIZED_EMAIL === 'string' ? env.AUTHORIZED_EMAIL.trim().toLowerCase() : '';
  const email = context?.data?.cloudflareAccess?.JWT?.payload?.email;
  if(!configured || typeof email !== 'string' || email.trim().toLowerCase() !== configured) throw new AuthorizationError();
  return { email: configured };
}
