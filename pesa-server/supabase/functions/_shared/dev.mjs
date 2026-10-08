// Developer login for the Pesa app's Developer panel. The password is checked here, on the server, and the app receives a short lived token
// signed with a private key that only this server holds. The app checks the signature with the matching public key.
// Pure logic with everything passed in (database, clock, keys), so Node can test it and the Edge Function runs it unchanged.
export const TOKEN_HOURS = 8, MAX_TRIES = 5, LOCK_MINUTES = 5;
export function b64u(u8){ let s = ''; for(let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
export function unb64u(s){ s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while(s.length % 4) s += '='; const b = atob(s), u = new Uint8Array(b.length); for(let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
export const hex = (buf) => Array.from(new Uint8Array(buf)).map(x => x.toString(16).padStart(2, '0')).join('');
export const unhex = (h) => { const a = new Uint8Array(h.length / 2); for(let i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16); return a; };
const same = (a, b) => { a = String(a || ''); b = String(b || ''); if(a.length !== b.length) return false; let r = 0; for(let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
const reply = (status, body) => ({ status, body });
// the same recipe the app and tools/make_master.mjs use
export async function derive(username, password, saltHex, iterations){
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(username).trim().toLowerCase() + '\n' + password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name:'PBKDF2', hash:'SHA-256', salt:unhex(saltHex), iterations }, key, 256));
}
export async function signToken(privJwk, payload){
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const k = await crypto.subtle.importKey('jwk', privJwk, { name:'ECDSA', namedCurve:'P-256' }, false, ['sign']);
  return 'PDEV1.' + b64u(data) + '.' + b64u(new Uint8Array(await crypto.subtle.sign({ name:'ECDSA', hash:'SHA-256' }, k, data)));
}
export async function verifyToken(pubJwk, token, nowMs){
  const p = String(token || '').split('.'); if(p.length !== 3 || p[0] !== 'PDEV1') return null;
  try{
    const k = await crypto.subtle.importKey('jwk', pubJwk, { name:'ECDSA', namedCurve:'P-256' }, false, ['verify']);
    if(!(await crypto.subtle.verify({ name:'ECDSA', hash:'SHA-256' }, k, unb64u(p[2]), unb64u(p[1])))) return null;
    const pl = JSON.parse(new TextDecoder().decode(unb64u(p[1])));
    return pl.exp * 1000 > nowMs ? pl : null;
  }catch(e){ return null; }
}
const cleanUser = (u) => String(u || '').trim().toLowerCase();

/* req = { action, body, ip }   deps = { db, now(), privJwk, pubJwk, randomHex(n) } */
export async function handleDev(req, deps){
  const b = req.body || {}, now = deps.now(), ipk = 'ip:' + (req.ip || 'unknown');
  async function who(){ const t = await verifyToken(deps.pubJwk, b.token, now); if(!t) return null; const u = await deps.db.getUser(t.sub); return u && u.active ? { user:u, token:t } : null; }
  if(req.action === 'login'){
    const username = cleanUser(b.username), password = String(b.password || '');
    if(!username || !password || password.length > 200) return reply(400, { error:'invalid' });
    for(const key of ['user:' + username, ipk]){ const a = await deps.db.getAttempt(key); if(a && a.until && new Date(a.until).getTime() > now) return reply(429, { error:'locked', minutes:Math.ceil((new Date(a.until).getTime() - now) / 60000) }); }
    const u = await deps.db.getUser(username);
    // always do the slow hash, so a wrong username takes as long as a wrong password
    const got = await derive(username, password, u ? u.salt : '00'.repeat(16), u ? u.iterations : 210000);
    const ok = !!u && u.active && same(got, u.hash);
    for(const key of ['user:' + username, ipk]){
      if(ok && key.startsWith('user:')) await deps.db.clearAttempt(key);
      else if(!ok){ const a = (await deps.db.getAttempt(key)) || { n:0 }, n = (a.n || 0) + 1; await deps.db.setAttempt(key, n >= MAX_TRIES ? 0 : n, n >= MAX_TRIES ? new Date(now + LOCK_MINUTES * 60e3).toISOString() : null); }
    }
    await deps.db.audit({ username, action:'login', ok, detail:req.ip ? String(req.ip).slice(0, 45) : '' });
    if(!ok) return reply(401, { error:'wrong' });
    const exp = Math.floor(now / 1000) + TOKEN_HOURS * 3600;
    return reply(200, { ok:true, role:u.role, name:u.name || u.username, exp, token:await signToken(deps.privJwk, { sub:u.username, role:u.role, exp, iat:Math.floor(now / 1000), jti:deps.randomHex(8) }) });
  }
  if(req.action === 'check'){ const w = await who(); return w ? reply(200, { ok:true, role:w.user.role, exp:w.token.exp }) : reply(401, { error:'invalid' }); }
  const w = await who(); if(!w) return reply(401, { error:'invalid' });
  if(w.user.role !== 'master') return reply(403, { error:'master_only' });
  if(req.action === 'list') return reply(200, { ok:true, users:(await deps.db.listUsers()).map(u => ({ username:u.username, name:u.name, role:u.role, active:u.active, created_at:u.created_at })) });
  if(req.action === 'add'){
    const username = cleanUser(b.username), password = String(b.password || ''), name = String(b.name || '').trim().slice(0, 80);
    if(!/^[a-z0-9._@+-]{3,80}$/.test(username)) return reply(400, { error:'bad_username' });
    if(password.length < 10 || password.length > 200) return reply(400, { error:'weak_password' });
    if(await deps.db.getUser(username)) return reply(409, { error:'exists' });
    const salt = deps.randomHex(16);
    await deps.db.insertUser({ username, name:name || username, role:'helper', salt, hash:await derive(username, password, salt, 210000), iterations:210000, created_by:w.user.username });
    await deps.db.audit({ username:w.user.username, action:'add:' + username, ok:true, detail:'' });
    return reply(200, { ok:true });
  }
  if(req.action === 'remove'){
    const username = cleanUser(b.username), u = await deps.db.getUser(username);
    if(!u || u.role === 'master') return reply(400, { error:'cannot_remove' });
    await deps.db.setActive(username, false); await deps.db.audit({ username:w.user.username, action:'remove:' + username, ok:true, detail:'' });
    return reply(200, { ok:true });
  }
  return reply(400, { error:'unknown_action' });
}
