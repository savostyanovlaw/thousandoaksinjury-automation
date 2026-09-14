import { createSessionToken, sessionCookie, clearSessionCookie, requireAuthorizedUser, verifyCredentials } from '../lib/auth.js';
import { createGitHubAdapter } from '../lib/github.js';

function loginPage(error=''){
  const message=error ? `<p role="alert">${error}</p>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>AI Control Center Sign In</title><style>body{font-family:system-ui,sans-serif;background:#0b1020;color:#fff;min-height:100vh;display:grid;place-items:center;margin:0}.card{width:min(420px,calc(100% - 32px));background:#151c31;border:1px solid #2a3556;border-radius:16px;padding:28px;box-sizing:border-box}h1{font-size:1.4rem;margin:0 0 8px}p{color:#b9c2d8}label{display:block;margin-top:16px;font-size:.9rem}input{width:100%;box-sizing:border-box;margin-top:6px;padding:11px 12px;border-radius:9px;border:1px solid #465171;background:#0c1326;color:#fff}button{width:100%;margin-top:20px;padding:11px;border:0;border-radius:9px;font-weight:700;cursor:pointer}</style></head><body><main class="card"><h1>AI CONTROL CENTER</h1><p>Savostyanov Law Corporation</p>${message}<form method="post" action="/auth/login"><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button type="submit">Sign in</button></form></main></body></html>`;
}

function htmlResponse(html,status=200,headers={}){
  return new Response(html,{status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex, nofollow, noarchive',...headers}});
}

function jsonNoStore(value,status=200){
  return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex, nofollow, noarchive'}});
}

function isSameOrigin(request){
  const origin=request.headers.get('origin');
  return Boolean(origin && origin===new URL(request.url).origin);
}

export async function onRequest(context){
  const {request,env}=context;
  const url=new URL(request.url);

  if(url.pathname==='/auth/github-diagnostic' && request.method==='GET'){
    const github=createGitHubAdapter({token:env.GITHUB_TOKEN});
    const result=await github.diagnoseCredential('technical-seo-watchdog.yml');
    return jsonNoStore(result);
  }

  if(url.pathname==='/auth/login' && request.method==='GET') return htmlResponse(loginPage());

  if(url.pathname==='/auth/login' && request.method==='POST'){
    if(!isSameOrigin(request)) return new Response('Forbidden',{status:403,headers:{'cache-control':'no-store'}});
    const form=await request.formData();
    const email=form.get('email');
    const password=form.get('password');
    if(!(await verifyCredentials(env,email,password))) return htmlResponse(loginPage('Invalid credentials.'),401);
    const token=await createSessionToken(env,String(email));
    return new Response(null,{status:303,headers:{location:'/', 'set-cookie':sessionCookie(token),'cache-control':'no-store'}});
  }

  if(url.pathname==='/auth/logout' && request.method==='POST'){
    if(!isSameOrigin(request)) return new Response('Forbidden',{status:403,headers:{'cache-control':'no-store'}});
    return new Response(null,{status:303,headers:{location:'/auth/login','set-cookie':clearSessionCookie(),'cache-control':'no-store'}});
  }

  try{
    await requireAuthorizedUser(context,env);
    return context.next();
  }catch{
    if(url.pathname.startsWith('/api/')){
      return new Response(JSON.stringify({ok:false,error:'Unauthorized'}),{status:401,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
    }
    return new Response(null,{status:303,headers:{location:'/auth/login','cache-control':'no-store'}});
  }
}
