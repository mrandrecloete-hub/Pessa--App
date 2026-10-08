// @ts-nocheck
// Shared wrapper for the Pesa platform Edge Functions: CORS, JSON in and out, the database client and the secrets.
import postgres from 'npm:postgres@3';
import { makeDb } from './db.mjs';
const CORS = { 'access-control-allow-origin':'*', 'access-control-allow-headers':'content-type, authorization, apikey', 'access-control-allow-methods':'POST, GET, OPTIONS' };
let sql;
export function deps(){
  if(!sql) sql = postgres(Deno.env.get('SUPABASE_DB_URL'), { max:1, prepare:false });
  const env = {}; for(const k of ['WHATSAPP_TOKEN','WHATSAPP_PHONE_ID','WHATSAPP_TEMPLATE','WHATSAPP_LANG','WHATSAPP_VERIFY_TOKEN','SMS_API_URL','SMS_API_KEY','SMS_SENDER']) env[k] = Deno.env.get(k) || '';
  const j = (k) => { try{ return JSON.parse(Deno.env.get(k) || 'null'); }catch(e){ return null; } };
  return { db:makeDb(sql), fetch:(u, o) => fetch(u, o), now:() => Date.now(), env, privJwk:j('DEV_PRIVATE_JWK'), pubJwk:j('DEV_PUBLIC_JWK'),
    randomHex:(n) => Array.from(crypto.getRandomValues(new Uint8Array(n))).map(x => x.toString(16).padStart(2, '0')).join('') };
}
export function serveJson(run){
  Deno.serve(async (request) => {
    if(request.method === 'OPTIONS') return new Response(null, { status:204, headers:CORS });
    let out;
    try{ out = await run(request, deps()); }catch(e){ console.error(e); out = { status:500, body:{ error:'server_error' } }; }
    return new Response(JSON.stringify(out.body), { status:out.status, headers:Object.assign({ 'content-type':'application/json' }, CORS) });
  });
}
export async function readBody(request){ try{ return await request.json(); }catch(e){ return {}; } }
export const clientIp = (request) => (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
