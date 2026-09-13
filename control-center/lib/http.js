export function jsonResponse(data,status=200,headers={}){ return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}}); }
export function errorResponse(error){ const status=Number(error?.status)||400; const message=status>=500?'Internal error':(error?.message||'Request failed'); return jsonResponse({ok:false,error:message},status); }
export async function parseJson(request){ try{return await request.json();}catch{ const e=new Error('Invalid JSON'); e.status=400; throw e; } }
export function assertExactFields(body,allowed,required=[]){ const keys=Object.keys(body||{}); for(const k of keys) if(!allowed.includes(k)) throw new Error(`Unexpected field: ${k}`); for(const k of required) if(body?.[k]===undefined||body?.[k]===null||body?.[k]==='') throw new Error(`Missing field: ${k}`); }

export function requireSameOrigin(request){
  const origin=request?.headers?.get?.('Origin');
  const expected=new URL(request.url).origin;
  if(!origin || origin!==expected){ const e=new Error('Invalid request origin'); e.status=403; throw e; }
  return true;
}
