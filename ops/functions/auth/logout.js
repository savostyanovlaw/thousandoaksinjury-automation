import {clearSessionCookie} from '../_lib/auth.js';export function onRequestGet(){return new Response(null,{status:302,headers:{location:'/','set-cookie':clearSessionCookie()}})}
