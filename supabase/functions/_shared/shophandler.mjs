/* The Pesa Shop host, as one plain function so it can be tested without a server.
   handleShop(req, deps) -> { status, body, headers? }
   req  = { method, action, query, headers, body }
   deps = { db, now(), sha256(text) -> hex, ipHash, adminToken, requireLicence, verifyLicence(key) -> payload | null }
   db   = { get(slug), put(row), remove(slug), list(), newFromIpSince(ipHash, isoTime) }   (all async)

   Public actions  get        (anyone reads a shop page's data)
                   publish    (a shop publishes or updates its page, with the private token it keeps)
                   unpublish  (hide the page)   remove (delete it)
   Admin actions   list, disable, enable   (x-admin-token, to take down a page)
   What is stored is plain data only (names, prices, a phone number, two short lines), never web page code: the page is drawn by Pesa's own viewer. */

const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const res = (status, body, headers) => ({ status, body, headers: headers || {} });
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9]|-(?!-)){1,38}[a-z0-9]$/;
export const RESERVED = ['admin', 'api', 'app', 'www', 'pesa', 'shop', 'shops', 'support', 'help', 'login', 'test', 'demo', 'null', 'undefined', 'static', 'assets', 'site', 'terms', 'privacy', 'refunds', 'namra', 'bank', 'payment', 'payments'];
export const LIMITS = { rows: 3000, bytes: 700000, newShopsPerIpPerDay: 3, minSecondsBetweenPublishes: 10 };
function sameText(a, b){ if(!a || !b || a.length !== b.length) return false; let d = 0; for(let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
export function normPhone(raw){
  let s = String(raw || '').trim().replace(/[\s\-().\/]/g, '');
  if(s.charAt(0) === '+') s = s.slice(1); else if(s.indexOf('00') === 0) s = s.slice(2); else if(s.charAt(0) === '0') s = '264' + s.slice(1); else if(/^[68]\d{8}$/.test(s)) s = '264' + s;
  return s.replace(/\D/g, '');
}
export function cleanRows(list){
  const out = []; let dropped = 0; const seen = new Set();
  for(const r of (Array.isArray(list) ? list : [])){
    const id = String((r && r.id) == null ? '' : r.id).trim(), n = clip(r && r.n, 120), p = Math.round(Number(r && r.p) * 100) / 100;
    if(!/^[A-Za-z0-9_-]{1,60}$/.test(id) || !n || !(p > 0) || !(p < 10000000) || seen.has(id)){ dropped++; continue; }
    seen.add(id);
    const s = Number(r.s), m = r.m == null ? null : Number(r.m);
    out.push({ id, n, c: clip(r.c, 60), p, u: clip(r.u, 20), s: s === 0 || s === 1 ? s : 2, m: m != null && isFinite(m) && m >= 0 && m < 10000000 ? Math.round(m * 1000) / 1000 : null });
  }
  return { rows: out, dropped };
}

export async function handleShop(req, deps){
  const a = req.action || '', q = req.query || {}, b = req.body || {};
  const slugOf = v => String(v || '').trim().toLowerCase();
  const admin = () => sameText(String((req.headers && (req.headers['x-admin-token'] || req.headers['X-Admin-Token'])) || ''), String(deps.adminToken || ''));

  if(a === 'get'){
    if(req.method !== 'GET') return res(405, { error: 'get_only' });
    const slug = slugOf(q.s), row = SLUG_RE.test(slug) ? await deps.db.get(slug) : null;
    if(!row || !row.published || row.disabled) return res(404, { error: 'not_found' });
    return res(200, { shop: row.shop, phone: row.phone, intro: row.intro, how: row.how, rows: row.rows, updated: row.updated_at }, { 'cache-control': 'public, max-age=30' });
  }

  if(a === 'list' || a === 'disable' || a === 'enable'){
    if(!admin()) return res(401, { error: 'admin_only' });
    if(a === 'list') return res(200, { shops: (await deps.db.list()).map(r => ({ slug: r.slug, shop: r.shop, phone: r.phone, rows: (r.rows || []).length, published: r.published, disabled: r.disabled, ref: r.ref, updated_at: r.updated_at })) });
    const row = await deps.db.get(slugOf(b.slug)); if(!row) return res(404, { error: 'not_found' });
    row.disabled = a === 'disable'; await deps.db.put(row); return res(200, { ok: true, slug: row.slug, disabled: row.disabled });
  }

  if(a === 'publish' || a === 'unpublish' || a === 'remove'){
    if(req.method !== 'POST') return res(405, { error: 'post_only' });
    const slug = slugOf(b.slug), token = String(b.token || '');
    if(!SLUG_RE.test(slug) || RESERVED.indexOf(slug) > -1) return res(400, { error: 'bad_name' });
    if(token.length < 32 || token.length > 200) return res(400, { error: 'bad_token' });
    const hash = await deps.sha256(token), existing = await deps.db.get(slug);
    if(existing && !sameText(existing.token_hash, hash)) return res(403, { error: 'name_taken' });
    if(a === 'unpublish' || a === 'remove'){
      if(!existing) return res(404, { error: 'not_found' });
      if(a === 'remove'){ await deps.db.remove(slug); return res(200, { ok: true, removed: true }); }
      existing.published = false; await deps.db.put(existing); return res(200, { ok: true, published: false });
    }
    if(existing && existing.disabled) return res(403, { error: 'disabled' });
    const nowMs = deps.now(), nowIso = new Date(nowMs).toISOString();
    if(existing && existing.updated_at && nowMs - new Date(existing.updated_at).getTime() < LIMITS.minSecondsBetweenPublishes * 1000) return res(429, { error: 'too_fast' });
    if(!existing && deps.ipHash && (await deps.db.newFromIpSince(deps.ipHash, new Date(nowMs - 86400000).toISOString())) >= LIMITS.newShopsPerIpPerDay) return res(429, { error: 'too_many_shops' });
    let ref = existing ? existing.ref : '';
    if(deps.requireLicence){
      const lic = await deps.verifyLicence(b.licence);
      if(!lic) return res(402, { error: 'licence_needed' });
      if(lic.exp && String(lic.exp) < new Date(nowMs + 2 * 3600 * 1000).toISOString().slice(0, 10)) return res(402, { error: 'licence_expired' });
      ref = String(lic.ref || '');
    }
    const shop = clip(b.shop, 80); if(!shop) return res(400, { error: 'bad_shop' });
    const phone = normPhone(b.phone); if(!/^\d{9,15}$/.test(phone)) return res(400, { error: 'bad_phone' });
    if(JSON.stringify(b).length > LIMITS.bytes) return res(413, { error: 'too_big' });
    if(!Array.isArray(b.rows) || b.rows.length > LIMITS.rows) return res(413, { error: 'too_many_products' });
    const { rows, dropped } = cleanRows(b.rows);
    if(!rows.length || dropped > rows.length) return res(400, { error: 'bad_products' });
    const row = { slug, token_hash: hash, ref, shop, phone, intro: clip(b.intro, 200), how: clip(b.how, 200), rows, published: true, disabled: false,
      created_at: existing ? existing.created_at : nowIso, updated_at: nowIso, ip_hash: existing ? existing.ip_hash : (deps.ipHash || '') };
    await deps.db.put(row);
    return res(200, { ok: true, slug, products: rows.length, skipped: dropped, updated: nowIso });
  }
  return res(400, { error: 'unknown_action' });
}
