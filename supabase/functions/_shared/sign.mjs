/* Creating and checking Pesa licence keys. Works in Deno (Supabase) and Node, using WebCrypto.
   A key is  PESA1.<payload>.<signature>  where the payload is JSON { v, ref, plan, exp, iat, shop }.
   It is the same format tools/issuer.html makes and the app checks. */
export const PLANS = { starter:{ m:500, y:5000, name:'Starter' }, business:{ m:900, y:9000, name:'Business' }, premium:{ m:1500, y:15000, name:'Premium' } };
export const REF_RE = /^PESA-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export function b64u(u8){ let s = ''; for(let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
export function unb64u(s){ s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while(s.length % 4) s += '='; const b = atob(s), u = new Uint8Array(b.length); for(let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
const pad = n => (n < 10 ? '0' + n : '' + n);
export const iso = d => d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
export function addMonths(d, n){ const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const day = r.getUTCDate(); r.setUTCMonth(r.getUTCMonth() + n); if(r.getUTCDate() < day) r.setUTCDate(0); return r; }

/** When a new licence ends: from today, or from the current end date when renewing early. Dates are Namibia local days (UTC+2). */
export function computeExp(nowMs, months, currentExp){
  const local = new Date(nowMs + 2 * 3600 * 1000);
  let base = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  if(currentExp && /^\d{4}-\d{2}-\d{2}$/.test(currentExp)){ const c = new Date(currentExp + 'T00:00:00Z'); if(c > base) base = c; }
  return { from: iso(new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()))), exp: iso(addMonths(base, months)) };
}
export function priceFor(plan, period){ const p = PLANS[plan]; if(!p) return 0; return period === 'yearly' ? p.y : p.m; }

export async function signLicence(privJwk, payload){
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const k = await crypto.subtle.importKey('jwk', privJwk, { name:'ECDSA', namedCurve:'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name:'ECDSA', hash:'SHA-256' }, k, data);
  return 'PESA1.' + b64u(data) + '.' + b64u(new Uint8Array(sig));
}
export async function verifyLicence(pubJwk, key){
  const parts = String(key || '').replace(/\s+/g, '').split('.');
  if(parts.length !== 3 || parts[0] !== 'PESA1') return null;
  try{
    const data = unb64u(parts[1]), sig = unb64u(parts[2]);
    const k = await crypto.subtle.importKey('jwk', pubJwk, { name:'ECDSA', namedCurve:'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name:'ECDSA', hash:'SHA-256' }, k, sig, data);
    return ok ? JSON.parse(new TextDecoder().decode(data)) : null;
  }catch(e){ return null; }
}
