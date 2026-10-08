// @ts-nocheck
// Shared wrapper for the NamPromo Edge Functions: CORS, JSON in and out, and the database client.
import postgres from 'npm:postgres@3';
import { makeDb } from './db.mjs';

const CORS = { 'access-control-allow-origin':'*', 'access-control-allow-headers':'content-type, authorization, apikey, x-nampromo-key', 'access-control-allow-methods':'POST, GET, OPTIONS' };
let sql;
export function deps(){
  if(!sql) sql = postgres(Deno.env.get('SUPABASE_DB_URL'), { max:1, prepare:false });
  const env = {}; for(const k of ['PEPPER','DISPATCH_KEY','WHATSAPP_TOKEN','WHATSAPP_PHONE_ID','WHATSAPP_TEMPLATE','WHATSAPP_LANG','WHATSAPP_VERIFY_TOKEN','SMS_API_URL','SMS_API_KEY','SMS_SENDER','EMAIL_API_URL','EMAIL_API_KEY','EMAIL_FROM','DISPATCH_BATCH']) env[k] = Deno.env.get(k) || '';
  return { db:makeDb(sql), fetch:(u, o) => fetch(u, o), now:() => Date.now(), env, randomCode:() => crypto.getRandomValues(new Uint32Array(1))[0] % 1000000 };
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
