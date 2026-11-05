// Pesa Shop host. Deploy with:  supabase functions deploy shop --no-verify-jwt
// Secrets (supabase secrets set ...):  ADMIN_TOKEN  (optional)  REQUIRE_LICENCE=1 and LICENCE_PUBLIC_JWK  (when licence keys are switched on)
// Details: docs/provisioning/SHOP.md
// @ts-nocheck
import { handleShop } from '../_shared/shophandler.mjs';
import { verifyLicence } from '../_shared/sign.mjs';

const CORS = { 'access-control-allow-origin':'*', 'access-control-allow-headers':'content-type, x-admin-token, authorization, apikey', 'access-control-allow-methods':'GET, POST, OPTIONS' };
const URL_ = Deno.env.get('SUPABASE_URL'), SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const H = { apikey:SRK, Authorization:'Bearer ' + SRK, 'Content-Type':'application/json' };
const T = URL_ + '/rest/v1/pesa_shops';
const j = async r => { if(!r.ok) throw new Error('db ' + r.status + ' ' + (await r.text()).slice(0, 120)); const t = await r.text(); return t ? JSON.parse(t) : null; };
const db = {
  get: async slug => (await fetch(T + '?slug=eq.' + encodeURIComponent(slug), { headers:H }).then(j))[0] || null,
  put: row => fetch(T + '?on_conflict=slug', { method:'POST', headers:Object.assign({ Prefer:'resolution=merge-duplicates,return=minimal' }, H), body:JSON.stringify(row) }).then(j),
  remove: slug => fetch(T + '?slug=eq.' + encodeURIComponent(slug), { method:'DELETE', headers:H }).then(j),
  list: () => fetch(T + '?select=slug,shop,phone,rows,published,disabled,ref,updated_at&order=updated_at.desc&limit=500', { headers:H }).then(j),
  newFromIpSince: async (ip, since) => (await fetch(T + '?select=slug&ip_hash=eq.' + encodeURIComponent(ip) + '&created_at=gte.' + encodeURIComponent(since), { headers:H }).then(j)).length,
};
const sha256 = async t => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))).map(x => x.toString(16).padStart(2, '0')).join('');
const PUB = (() => { try{ return JSON.parse(Deno.env.get('LICENCE_PUBLIC_JWK') || 'null'); }catch(e){ return null; } })();

Deno.serve(async (request) => {
  if(request.method === 'OPTIONS') return new Response(null, { status:204, headers:CORS });
  const u = new URL(request.url); const action = u.searchParams.get('a') || '';
  let body = {}; if(request.method === 'POST'){ try{ body = await request.json(); }catch(e){ body = {}; } }
  const headers = {}; request.headers.forEach((v, k) => { headers[k] = v; });
  const ip = (headers['x-forwarded-for'] || headers['cf-connecting-ip'] || '').split(',')[0].trim();
  let out;
  try{
    out = await handleShop({ method:request.method, action, query:Object.fromEntries(u.searchParams), headers, body }, {
      db, now:() => Date.now(), sha256, ipHash: ip ? await sha256('pesa-shop-ip:' + ip) : '', adminToken:Deno.env.get('ADMIN_TOKEN') || '',
      requireLicence: Deno.env.get('REQUIRE_LICENCE') === '1', verifyLicence: key => PUB ? verifyLicence(PUB, key) : Promise.resolve(null),
    });
  }catch(e){ out = { status:500, body:{ error:'server_error' }, headers:{} }; console.error(e); }
  return new Response(JSON.stringify(out.body), { status:out.status, headers:Object.assign({ 'content-type':'application/json' }, CORS, out.headers || {}) });
});
