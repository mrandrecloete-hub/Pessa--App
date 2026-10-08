// NamPromo server logic. Plain JavaScript with every outside thing passed in (database, fetch, clock, secrets), so Node can test it
// and the Supabase Edge Functions can run it unchanged. No secret is ever read from a browser.
export const TOWN_NAMES = ['Windhoek', 'Swakopmund', 'Walvis Bay', 'Oshakati', 'Rundu', 'Katima Mulilo', 'Otjiwarongo', 'Keetmanshoop', 'Gobabis'];
export const CATEGORY_NAMES = ['Food and groceries', 'Home and household', 'Clothing and shoes', 'Electronics', 'Building and hardware', 'Health and beauty', 'Restaurants and takeaways', 'Farming and agri', 'Vehicles and parts', 'Other'];
export const CONSENT_WORDING = 'I agree that NamPromo may send me deals and price alerts on the ways I ticked. I can stop at any time. (v1)';
export const CODE_MINUTES = 10, MAX_CODE_TRIES = 5, MAX_CODES_PER_HOUR = 3, QUIET_FROM = 20, QUIET_TO = 7;

/* ---- small helpers ---- */
export function normalizePhone(v){
  var d = String(v || '').replace(/[\s\-().]/g, '');
  if(/^00264/.test(d)) d = '+' + d.slice(2); else if(/^0/.test(d)) d = '+264' + d.slice(1); else if(/^264/.test(d)) d = '+' + d;
  return /^\+2648\d{8}$/.test(d) ? d : null;
}
export function okEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v || '') && String(v).length <= 254; }
export function isStop(text){ return /^\s*(stop|stop all|unsubscribe|cancel|end|quit|opt\s*out)\s*[.!]*\s*$/i.test(String(text || '')); }
const CAT_MS = 2 * 3600e3; // Namibia is UTC+2 all year
export function inQuietHours(ms){ var h = new Date(ms + CAT_MS).getUTCHours(); return h >= QUIET_FROM || h < QUIET_TO; }
export function dayKey(ms){ return new Date(ms + CAT_MS).toISOString().slice(0, 10); }
export async function sha256Hex(text){ var b = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return Array.from(new Uint8Array(b)).map(function(x){ return x.toString(16).padStart(2, '0'); }).join(''); }
export function codeHash(code, subscriberId, pepper){ return sha256Hex(String(code) + ':' + subscriberId + ':' + (pepper || '')); }
function same(a, b){ a = String(a || ''); b = String(b || ''); if(a.length !== b.length) return false; var r = 0; for(var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
function money(n){ return 'N$' + (Math.round(Number(n) * 100) / 100).toFixed(2); }
function reply(status, body){ return { status:status, body:body }; }
function channelFlags(s){ return { whatsapp:!!s.whatsapp_opt_in, sms:!!s.sms_opt_in, email:!!s.email_opt_in }; }

/* ---- sending through the providers (secrets come from the server environment) ---- */
export async function sendMessage(msg, deps){
  var env = deps.env || {}, f = deps.fetch;
  try{
    if(msg.channel === 'whatsapp'){
      if(!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_ID) return { ok:false, blocked:true, error:'WhatsApp is not set up' };
      var r = await f('https://graph.facebook.com/v20.0/' + env.WHATSAPP_PHONE_ID + '/messages', { method:'POST', headers:{ authorization:'Bearer ' + env.WHATSAPP_TOKEN, 'content-type':'application/json' },
        body:JSON.stringify({ messaging_product:'whatsapp', to:String(msg.cellphone).replace('+', ''), type:'template', template:{ name:env.WHATSAPP_TEMPLATE || 'nampromo_message', language:{ code:env.WHATSAPP_LANG || 'en' }, components:[{ type:'body', parameters:[{ type:'text', text:String(msg.body).replace(/\s+/g, ' ').slice(0, 900) }] }] } }) });
      return r.ok ? { ok:true } : { ok:false, error:'WhatsApp refused (' + r.status + ')' };
    }
    if(msg.channel === 'sms'){
      if(!env.SMS_API_URL || !env.SMS_API_KEY) return { ok:false, blocked:true, error:'SMS is not set up' };
      // Generic JSON gateway. Adapt this one call to the SMS provider you choose.
      var s = await f(env.SMS_API_URL, { method:'POST', headers:{ authorization:'Bearer ' + env.SMS_API_KEY, 'content-type':'application/json' }, body:JSON.stringify({ to:msg.cellphone, message:String(msg.body).slice(0, 612), from:env.SMS_SENDER || 'NamPromo' }) });
      return s.ok ? { ok:true } : { ok:false, error:'SMS gateway refused (' + s.status + ')' };
    }
    if(msg.channel === 'email'){
      if(!env.EMAIL_API_URL || !env.EMAIL_API_KEY) return { ok:false, blocked:true, error:'Email is not set up' };
      var e = await f(env.EMAIL_API_URL, { method:'POST', headers:{ authorization:'Bearer ' + env.EMAIL_API_KEY, 'content-type':'application/json' }, body:JSON.stringify({ to:msg.email, subject:'NamPromo', text:msg.body, from:env.EMAIL_FROM || '' }) });
      return e.ok ? { ok:true } : { ok:false, error:'Email provider refused (' + e.status + ')' };
    }
    return { ok:false, blocked:true, error:'Unknown channel' };
  }catch(err){ return { ok:false, error:'Network error' }; }
}
/* send one queued message, but only if the person still allows it */
export async function deliver(msg, deps){
  var transactional = msg.kind === 'verify' || msg.kind === 'service';
  var flags = channelFlags(msg);
  if(!transactional && (msg.stopped_at || !msg.verified_at || !flags[msg.channel])){ await deps.db.markMessage(msg.id, { status:'blocked', error:'No consent for this channel' }); return 'blocked'; }
  var res = await sendMessage(msg, deps);
  await deps.db.markMessage(msg.id, res.ok ? { status:'sent' } : { status:res.blocked ? 'blocked' : 'failed', error:res.error });
  return res.ok ? 'sent' : (res.blocked ? 'blocked' : 'failed');
}

/* ---- sign up: validate, store, send a confirmation code ---- */
export async function handleSubscribe(input, deps){
  var b = input || {}, bad = {}, now = deps.now();
  var name = String(b.fullName || '').trim().replace(/\s+/g, ' '), email = String(b.email || '').trim().toLowerCase(), phone = normalizePhone(b.cellphone);
  var wa = b.whatsapp === true, sms = b.sms === true, mail = b.email_opt_in === true;
  if(name.length < 2 || name.indexOf(' ') < 0 || name.length > 120) bad.fullName = 'Enter your first name and surname.';
  if(!okEmail(email)) bad.email = 'Enter a valid email address.';
  if(!phone) bad.cellphone = 'Enter a Namibian cellphone number, for example 081 123 4567.';
  if(!(wa || sms || mail)) bad.channels = 'Choose at least one way to reach you.';
  if(b.consent !== true) bad.consent = 'Agree to receive messages to continue.';
  var town = b.town && TOWN_NAMES.indexOf(b.town) >= 0 ? b.town : null;
  var cats = Array.isArray(b.categories) ? b.categories.filter(function(c){ return CATEGORY_NAMES.indexOf(c) >= 0; }) : [];
  if(Object.keys(bad).length) return reply(400, { error:'invalid', fields:bad });
  var existing = await deps.db.getSubscriberByPhone(phone);
  // never change or message someone who is already signed up and active
  if(existing && existing.verified_at && !existing.stopped_at) return reply(200, { ok:true, sent:false, message:'If this number is not already signed up, a confirmation code was sent.' });
  if(existing && await deps.db.countVerifyMessagesSince(existing.id, new Date(now - 3600e3).toISOString()) >= MAX_CODES_PER_HOUR) return reply(429, { error:'too_many_codes' });
  var code = String(await deps.randomCode()).padStart(6, '0');
  var fields = { full_name:name, email:email, town:town, categories:cats, whatsapp_opt_in:wa, sms_opt_in:sms, email_opt_in:mail, verify_expires:new Date(now + CODE_MINUTES * 60e3).toISOString(), verify_attempts:0 };
  var sub = existing ? await deps.db.updateSubscriber(existing.id, fields) : await deps.db.insertSubscriber(Object.assign({ cellphone:phone }, fields));
  await deps.db.updateSubscriber(sub.id, { verify_hash:await codeHash(code, sub.id, deps.env.PEPPER) });
  var channel = wa ? 'whatsapp' : sms ? 'sms' : 'email';
  var msg = await deps.db.queueMessage({ subscriber_id:sub.id, channel:channel, kind:'verify', body:'NamPromo code: ' + code + '. It expires in ' + CODE_MINUTES + ' minutes. Do not share it.', dedupe_key:'verify|' + now });
  var full = Object.assign({}, msg, { cellphone:phone, email:email, whatsapp_opt_in:wa, sms_opt_in:sms, email_opt_in:mail });
  var out = await deliver(full, deps);
  if(out !== 'sent') return reply(502, { error:'send_failed', message:'We could not send the code. Please try again later.' });
  return reply(200, { ok:true, sent:true, via:channel });
}
export async function handleVerify(input, deps){
  var phone = normalizePhone(input && input.cellphone), code = String((input && input.code) || '').trim(), now = deps.now();
  if(!phone || !/^\d{6}$/.test(code)) return reply(400, { error:'invalid' });
  var sub = await deps.db.getSubscriberByPhone(phone);
  if(!sub || !sub.verify_hash) return reply(400, { error:'invalid' });
  if(sub.verify_attempts >= MAX_CODE_TRIES) return reply(429, { error:'too_many_tries' });
  if(!sub.verify_expires || new Date(sub.verify_expires).getTime() < now) return reply(400, { error:'expired' });
  if(!same(await codeHash(code, sub.id, deps.env.PEPPER), sub.verify_hash)){ await deps.db.updateSubscriber(sub.id, { verify_attempts:sub.verify_attempts + 1 }); return reply(400, { error:'wrong_code' }); }
  var channels = []; if(sub.whatsapp_opt_in) channels.push('whatsapp'); if(sub.sms_opt_in) channels.push('sms'); if(sub.email_opt_in) channels.push('email');
  await deps.db.markVerified(sub.id, channels, CONSENT_WORDING, new Date(now).toISOString());
  return reply(200, { ok:true, channels:channels });
}

/* ---- people replying STOP ---- */
export async function handleInbound(input, deps){
  var phone = normalizePhone(String((input && input.from) || '').replace(/^\+?/, '+')); var text = input && input.text;
  if(!phone || !isStop(text)) return reply(200, { ok:true, action:'none' });
  var sub = await deps.db.stopSubscriber(phone, new Date(deps.now()).toISOString());
  if(sub){
    var msg = await deps.db.queueMessage({ subscriber_id:sub.id, channel:input.channel === 'sms' ? 'sms' : 'whatsapp', kind:'service', body:'You will not get any more NamPromo messages. To join again, sign up in the app.', dedupe_key:'stop|' + deps.now() });
    if(msg) await deliver(Object.assign({}, msg, { cellphone:phone, email:sub.email }), deps);
  }
  return reply(200, { ok:true, action:'stopped' });
}
// WhatsApp Cloud API webhook body, or a simple { from, text } from an SMS gateway
export function parseInbound(body, channel){
  var out = [];
  if(body && Array.isArray(body.entry)){
    body.entry.forEach(function(en){ (en.changes || []).forEach(function(ch){ ((ch.value && ch.value.messages) || []).forEach(function(m){ out.push({ from:m.from, text:m.text && m.text.body, channel:'whatsapp' }); }); }); });
  } else if(body && body.from) out.push({ from:body.from, text:body.text || body.message, channel:channel || 'sms' });
  return out;
}

/* ---- the daily job: build messages for people who asked for them, then send what is allowed to go now ---- */
export function composeDigest(sub, promos){
  var lines = promos.slice(0, 3).map(function(p){ return p.title + ' ' + money(p.sale_price) + ' at ' + p.shop_name + ' (' + Math.round((p.regular_price - p.sale_price) / p.regular_price * 100) + '% off)'; });
  return ('NamPromo specials in ' + sub.town + ': ' + lines.join('; ') + '. Reply STOP to stop.').slice(0, 600);
}
export async function handleDispatch(input, deps){
  var env = deps.env || {}, now = deps.now();
  if(!env.DISPATCH_KEY || !same(input && input.key, env.DISPATCH_KEY)) return reply(401, { error:'unauthorized' });
  var stats = { expired:0, digests:0, alerts:0, sent:0, blocked:0, failed:0, held:0 };
  stats.expired = await deps.db.expirePromotions();
  var since = (await deps.db.getState('last_dispatch')) || new Date(now - 86400e3).toISOString();
  var promos = await deps.db.listPublishedSince(since);
  var subs = await deps.db.listActiveSubscribers(), today = dayKey(now);
  for(var i = 0; i < subs.length; i++){
    var s = subs[i]; if(!s.town) continue;
    var mine = promos.filter(function(p){ return p.town === s.town && (!s.categories.length || s.categories.indexOf(p.category) >= 0) && (p.regular_price - p.sale_price) / p.regular_price >= 0.1; })
      .sort(function(a, b){ return (b.regular_price - b.sale_price) / b.regular_price - (a.regular_price - a.sale_price) / a.regular_price; });
    if(!mine.length) continue;
    var body = composeDigest(s, mine), made = false;
    for(var ch of ['whatsapp', 'sms', 'email']){ if(!s[ch + '_opt_in']) continue; if(await deps.db.queueMessage({ subscriber_id:s.id, channel:ch, kind:'deal', body:body, dedupe_key:'digest|' + today })) made = true; }
    if(made) stats.digests++;
  }
  var hits = await deps.db.listWatchHits();
  for(var h of hits){
    var text = 'Price alert: ' + h.title + ' is ' + money(h.price) + ' at ' + h.shop_name + ', ' + h.town + '. Reply STOP to stop.';
    for(var c of ['whatsapp', 'sms', 'email']){ if(!h[c + '_opt_in']) continue; if(await deps.db.queueMessage({ subscriber_id:h.subscriber_id, channel:c, kind:'alert', body:text, dedupe_key:'alert|' + h.watch_id + '|' + h.price })) stats.alerts++; }
  }
  var queued = await deps.db.listQueued(Number(env.DISPATCH_BATCH) || 100);
  for(var m of queued){
    if(m.kind !== 'verify' && m.kind !== 'service' && inQuietHours(now)){ stats.held++; continue; }
    var r = await deliver(m, deps); stats[r]++;
  }
  await deps.db.setState('last_dispatch', new Date(now).toISOString());
  return reply(200, Object.assign({ ok:true }, stats));
}
