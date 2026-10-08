// Central sending service for Pesa shops: WhatsApp and SMS through the developer's own provider accounts.
// A shop calls it with its own key. The server checks the key, the daily limit and the do not message list before anything is sent.
// It sends only what a shop asks for and says the customer agreed. It does not read the shop's data.
export const MAX_TEXT = 600, FOOTER = ' Reply STOP to stop.';
const reply = (status, body) => ({ status, body });
export function normalizePhone(v){
  let d = String(v || '').replace(/[\s\-().]/g, '');
  if(/^00/.test(d)) d = '+' + d.slice(2); else if(/^0/.test(d)) d = '+264' + d.slice(1); else if(/^264/.test(d)) d = '+' + d;
  return /^\+264[0-9]{8,9}$/.test(d) ? d : null;
}
export const isStop = (t) => /^\s*(stop|stop all|unsubscribe|cancel|end|quit|opt\s*out)\s*[.!]*\s*$/i.test(String(t || ''));
export async function sha256Hex(text){ const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join(''); }
export function dayStartIso(ms){ const l = new Date(ms + 2 * 3600e3); return new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()) - 2 * 3600e3).toISOString(); }
export const PLAN_LIMITS = { starter:50, business:200, premium:1000 };

export async function sendProvider(msg, deps){
  const env = deps.env || {}, f = deps.fetch;
  try{
    if(msg.channel === 'whatsapp'){
      if(!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_ID) return { ok:false, blocked:true, error:'WhatsApp is not set up' };
      const r = await f('https://graph.facebook.com/v20.0/' + env.WHATSAPP_PHONE_ID + '/messages', { method:'POST', headers:{ authorization:'Bearer ' + env.WHATSAPP_TOKEN, 'content-type':'application/json' },
        body:JSON.stringify({ messaging_product:'whatsapp', to:msg.to.replace('+', ''), type:'template', template:{ name:env.WHATSAPP_TEMPLATE || 'pesa_message', language:{ code:env.WHATSAPP_LANG || 'en' }, components:[{ type:'body', parameters:[{ type:'text', text:msg.body.replace(/\s+/g, ' ').slice(0, 900) }] }] } }) });
      return r.ok ? { ok:true } : { ok:false, error:'WhatsApp refused (' + r.status + ')' };
    }
    if(!env.SMS_API_URL || !env.SMS_API_KEY) return { ok:false, blocked:true, error:'SMS is not set up' };
    // Generic JSON gateway. Adapt this one call to the SMS provider you choose.
    const s = await f(env.SMS_API_URL, { method:'POST', headers:{ authorization:'Bearer ' + env.SMS_API_KEY, 'content-type':'application/json' }, body:JSON.stringify({ to:msg.to, message:msg.body.slice(0, 612), from:env.SMS_SENDER || 'Pesa' }) });
    return s.ok ? { ok:true } : { ok:false, error:'SMS gateway refused (' + s.status + ')' };
  }catch(e){ return { ok:false, error:'Network error' }; }
}

/* req = { body:{ apiKey, channel, to, text, consent } }   deps = { db, fetch, env, now() } */
export async function handleSend(req, deps){
  const b = req.body || {}, now = deps.now();
  if(!b.apiKey || String(b.apiKey).length < 20) return reply(401, { error:'bad_key' });
  const shop = await deps.db.getShopByKeyHash(await sha256Hex(String(b.apiKey)));
  if(!shop || !shop.active) return reply(401, { error:'bad_key' });
  if(b.channel !== 'whatsapp' && b.channel !== 'sms') return reply(400, { error:'bad_channel' });
  const to = normalizePhone(b.to); if(!to) return reply(400, { error:'bad_number' });
  let text = String(b.text || '').replace(/[\u0000-\u001f]/g, ' ').trim();
  if(!text || text.length > MAX_TEXT) return reply(400, { error:'bad_text' });
  if(b.consent !== true) return reply(400, { error:'consent_needed', message:'Only send to customers who agreed to get messages.' });
  if(await deps.db.isSuppressed(to)){ await deps.db.logSend({ shop_id:shop.id, channel:b.channel, to_phone:to, body:text, consent_attested:true, status:'suppressed', at:new Date(now).toISOString() }); return reply(403, { error:'suppressed' }); }
  const used = await deps.db.countSendsSince(shop.id, dayStartIso(now));
  if(used >= shop.daily_limit) return reply(429, { error:'daily_limit', limit:shop.daily_limit });
  if(!/stop/i.test(text.slice(-40))) text += FOOTER;
  const r = await sendProvider({ channel:b.channel, to, body:text }, deps);
  await deps.db.logSend({ shop_id:shop.id, channel:b.channel, to_phone:to, body:text, consent_attested:true, status:r.ok ? 'sent' : (r.blocked ? 'blocked' : 'failed'), error:r.error || null, at:new Date(now).toISOString() });
  return r.ok ? reply(200, { ok:true, left:shop.daily_limit - used - 1 }) : reply(502, { error:'send_failed', message:r.error });
}
/* a customer replying STOP to any shop's message: remember it for every shop */
export async function handleStop(items, deps){
  let n = 0;
  for(const it of items){ const p = normalizePhone(String(it.from || '').replace(/^\+?/, '+')); if(p && isStop(it.text)){ await deps.db.addSuppression(p); n++; } }
  return reply(200, { ok:true, stopped:n });
}
export function parseInbound(body){
  const out = [];
  if(body && Array.isArray(body.entry)) body.entry.forEach(en => (en.changes || []).forEach(ch => ((ch.value && ch.value.messages) || []).forEach(m => out.push({ from:m.from, text:m.text && m.text.body }))));
  else if(body && body.from) out.push({ from:body.from, text:body.text || body.message });
  return out;
}
