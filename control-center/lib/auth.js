const SESSION_COOKIE = 'slc_session';
const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 20;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class AuthorizationError extends Error {
  constructor(message='Unauthorized'){ super(message); this.name='AuthorizationError'; this.status=401; }
}

function base64UrlEncode(bytes){
  let binary='';
  for(const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

function base64UrlDecode(value){
  const normalized=value.replace(/-/g,'+').replace(/_/g,'/');
  const padded=normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary=atob(padded);
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
  return bytes;
}

async function hmac(keyMaterial,message){
  if(typeof keyMaterial !== 'string' || !keyMaterial) throw new AuthorizationError();
  const key=await crypto.subtle.importKey('raw',encoder.encode(`slc-control-session:${keyMaterial}`),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
  return new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(message)));
}

async function constantTimeStringEqual(a,b){
  if(typeof a !== 'string' || typeof b !== 'string') return false;
  const [da,db]=await Promise.all([
    crypto.subtle.digest('SHA-256',encoder.encode(a)),
    crypto.subtle.digest('SHA-256',encoder.encode(b))
  ]);
  const aa=new Uint8Array(da); const bb=new Uint8Array(db);
  let diff=aa.length ^ bb.length;
  for(let i=0;i<Math.max(aa.length,bb.length);i++) diff |= (aa[i % aa.length] ^ bb[i % bb.length]);
  return diff===0;
}

function configuredEmail(env){
  return typeof env?.AUTHORIZED_EMAIL === 'string' ? env.AUTHORIZED_EMAIL.trim().toLowerCase() : '';
}

export async function verifyCredentials(env,email,password){
  const expectedEmail=configuredEmail(env);
  const expectedPassword=typeof env?.CONTROL_AUTH_PASSWORD === 'string' ? env.CONTROL_AUTH_PASSWORD : '';
  if(!expectedEmail || expectedPassword.length < MIN_PASSWORD_LENGTH || typeof email !== 'string' || typeof password !== 'string') return false;
  const emailOk=await constantTimeStringEqual(email.trim().toLowerCase(),expectedEmail);
  const passwordOk=await constantTimeStringEqual(password,expectedPassword);
  return emailOk && passwordOk;
}

export async function createSessionToken(env,email,now=Date.now(),ttlMs=DEFAULT_SESSION_TTL_MS){
  const expectedEmail=configuredEmail(env);
  const normalized=typeof email === 'string' ? email.trim().toLowerCase() : '';
  if(!expectedEmail || normalized !== expectedEmail) throw new AuthorizationError();
  const payload={email:expectedEmail,iat:now,exp:now+ttlMs};
  const encodedPayload=base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signature=base64UrlEncode(await hmac(env?.CLOUDFLARE_API_TOKEN,encodedPayload));
  return `${encodedPayload}.${signature}`;
}

export async function verifySessionToken(env,token,now=Date.now()){
  try{
    if(typeof token !== 'string' || !token.includes('.')) throw new AuthorizationError();
    const [encodedPayload,providedSignature,...rest]=token.split('.');
    if(rest.length || !encodedPayload || !providedSignature) throw new AuthorizationError();
    const expectedSignature=base64UrlEncode(await hmac(env?.CLOUDFLARE_API_TOKEN,encodedPayload));
    if(!(await constantTimeStringEqual(providedSignature,expectedSignature))) throw new AuthorizationError();
    const payload=JSON.parse(decoder.decode(base64UrlDecode(encodedPayload)));
    const expectedEmail=configuredEmail(env);
    if(!expectedEmail || payload?.email !== expectedEmail || !Number.isFinite(payload?.exp) || now >= payload.exp) throw new AuthorizationError();
    return {email:expectedEmail,exp:payload.exp};
  }catch(error){
    if(error instanceof AuthorizationError) throw error;
    throw new AuthorizationError();
  }
}

function readCookie(header,name){
  if(typeof header !== 'string') return null;
  for(const part of header.split(';')){
    const [rawName,...rest]=part.trim().split('=');
    if(rawName===name) return rest.join('=') || null;
  }
  return null;
}

export async function requireAuthorizedUser(context,env){
  if(context?.data?.authUser?.email===configuredEmail(env)) return context.data.authUser;
  const cookie=context?.request?.headers?.get?.('cookie') || context?.request?.headers?.get?.('Cookie') || '';
  const token=readCookie(cookie,SESSION_COOKIE);
  if(!token) throw new AuthorizationError();
  const user=await verifySessionToken(env,token);
  if(context?.data) context.data.authUser=user;
  return user;
}

export function sessionCookie(token,maxAgeSeconds=28800){
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookie(){
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}
