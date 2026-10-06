// Pesa WhatsApp sender. Deploy into the shop's OWN Supabase project with:  supabase functions deploy whatsapp --no-verify-jwt
// Secrets (supabase secrets set ...):
//   PESA_SEND_KEY       a long random phrase. The owner pastes the same phrase into Pesa, Settings, WhatsApp sending.
//   WHATSAPP_TOKEN      the permanent access token of the Meta system user (WhatsApp Business Cloud API)
//   WHATSAPP_PHONE_ID   the Phone number ID from Meta (not the phone number itself)
//   WHATSAPP_TEMPLATE_DOC / WHATSAPP_TEMPLATE_TEXT / WHATSAPP_LANG   optional, default pesa_document, pesa_message, en
// Details: docs/provisioning/WHATSAPP.md
// @ts-nocheck
import { handleWhatsApp } from '../_shared/wahandler.mjs';

const CORS = { 'access-control-allow-origin':'*', 'access-control-allow-headers':'content-type, x-pesa-key, authorization, apikey', 'access-control-allow-methods':'POST, OPTIONS' };
const hits = [];
Deno.serve(async (request) => {
  if(request.method === 'OPTIONS') return new Response(null, { status:204, headers:CORS });
  let body = {}; if(request.method === 'POST'){ try{ body = await request.json(); }catch(e){ body = {}; } }
  const headers = {}; request.headers.forEach((v, k) => { headers[k] = v; });
  let out;
  try{
    out = await handleWhatsApp({ method:request.method, headers, body }, {
      key:Deno.env.get('PESA_SEND_KEY') || '', token:Deno.env.get('WHATSAPP_TOKEN') || '', phoneId:Deno.env.get('WHATSAPP_PHONE_ID') || '',
      templateDoc:Deno.env.get('WHATSAPP_TEMPLATE_DOC') || 'pesa_document', templateText:Deno.env.get('WHATSAPP_TEMPLATE_TEXT') || 'pesa_message', lang:Deno.env.get('WHATSAPP_LANG') || 'en',
      fetch:(u, o) => fetch(u, o), now:() => Date.now(), hits,
    });
  }catch(e){ out = { status:500, body:{ error:'server_error' } }; console.error(e); }
  return new Response(JSON.stringify(out.body), { status:out.status, headers:Object.assign({ 'content-type':'application/json' }, CORS) });
});
