// Pesa licence server. Deploy with:  supabase functions deploy licence --no-verify-jwt
// Secrets (supabase secrets set ...):  LICENCE_PRIVATE_JWK  ADMIN_TOKEN  RESEND_API_KEY  MAIL_FROM
// Details: docs/provisioning/README.md
// @ts-nocheck
import { handle } from '../_shared/handler.mjs';
import { make } from '../_shared/licdocs.mjs';
import { ASSETS } from '../_shared/assets.mjs';
import { jsPDF } from 'npm:jspdf@2.5.1';

const SELLER = { name:'Pesa Namibia', email:'ecrypted5@gmail.com', whatsapp:'081 821 1692', place:'Windhoek, Namibia' };
const CORS = { 'access-control-allow-origin':'*', 'access-control-allow-headers':'content-type, x-admin-token, authorization, apikey', 'access-control-allow-methods':'GET, POST, OPTIONS' };
const URL_ = Deno.env.get('SUPABASE_URL'), SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const H = { apikey:SRK, Authorization:'Bearer ' + SRK, 'Content-Type':'application/json' };
const T = URL_ + '/rest/v1/licence_requests';
const j = async r => { if(!r.ok) throw new Error('db ' + r.status + ' ' + (await r.text()).slice(0, 120)); const t = await r.text(); return t ? JSON.parse(t) : null; };
const db = {
  byRef: ref => fetch(T + '?ref=eq.' + encodeURIComponent(ref), { headers:H }).then(j),
  insert: row => fetch(T, { method:'POST', headers:Object.assign({ Prefer:'return=minimal' }, H), body:JSON.stringify(row) }).then(j),
  update: (id, patch) => fetch(T + '?id=eq.' + encodeURIComponent(id), { method:'PATCH', headers:Object.assign({ Prefer:'return=minimal' }, H), body:JSON.stringify(patch) }).then(j),
  pending: () => fetch(T + '?status=eq.pending&order=created_at.desc&limit=200', { headers:H }).then(j),
};
const RESEND = Deno.env.get('RESEND_API_KEY'), FROM = Deno.env.get('MAIL_FROM');
const mail = (RESEND && FROM) ? async m => {
  const r = await fetch('https://api.resend.com/emails', { method:'POST', headers:{ Authorization:'Bearer ' + RESEND, 'Content-Type':'application/json' },
    body:JSON.stringify({ from:FROM, to:[m.to], subject:m.subject, text:m.text, attachments:m.attachments.map(a => ({ filename:a.filename, content:a.base64 })) }) });
  if(!r.ok) throw new Error('mail ' + r.status + ' ' + (await r.text()).slice(0, 120));
} : null;

Deno.serve(async (request) => {
  if(request.method === 'OPTIONS') return new Response(null, { status:204, headers:CORS });
  const u = new URL(request.url); const action = u.searchParams.get('a') || '';
  let body = {}; if(request.method === 'POST'){ try{ body = await request.json(); }catch(e){ body = {}; } }
  const headers = {}; request.headers.forEach((v, k) => { headers[k] = v; });
  let out;
  try{
    out = await handle({ method:request.method, action, query:Object.fromEntries(u.searchParams), headers, body }, {
      db, mail, now:() => Date.now(), privJwk:JSON.parse(Deno.env.get('LICENCE_PRIVATE_JWK') || 'null'), adminToken:Deno.env.get('ADMIN_TOKEN') || '',
      seller:SELLER, makeDocs:() => make(jsPDF, ASSETS, SELLER), genId:() => crypto.randomUUID(),
    });
  }catch(e){ out = { status:500, body:{ error:'server_error' } }; console.error(e); }
  return new Response(JSON.stringify(out.body), { status:out.status, headers:Object.assign({ 'content-type':'application/json' }, CORS) });
});
