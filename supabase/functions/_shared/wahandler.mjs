// Pesa WhatsApp sender: pure logic (no Deno, no network of its own) so it can be tested in Node.
// It talks to Meta's WhatsApp Business Cloud API through deps.fetch. The Meta access token never leaves the server.
// deps: { key, token, phoneId, templateDoc, templateText, lang, graph, fetch, now, hits }
const MAX_PDF_BYTES = 2000000;     // Meta allows 100 MB for documents, Pesa documents are far smaller
const MAX_PER_HOUR = 100;          // best effort cap per running copy of the function, a stop against a leaked key

function same(a, b){                // constant time comparison
  a = String(a || ''); b = String(b || '');
  let d = a.length ^ b.length;
  for(let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}
export function normPhone(raw){
  let s = String(raw || '').trim().replace(/[\s\-().\/]/g, '');
  if(s.charAt(0) === '+') s = s.slice(1);
  else if(s.indexOf('00') === 0) s = s.slice(2);
  else if(s.charAt(0) === '0') s = '264' + s.slice(1);
  else if(/^[68]\d{8}$/.test(s)) s = '264' + s;
  return s.replace(/\D/g, '');
}
// Template parameters may not hold new lines, tabs or runs of spaces, and are limited in length.
const param = (v, n) => String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' | ').replace(/ {4,}/g, '   ').trim().slice(0, n || 1000) || '-';
const out = (status, body) => ({ status, body });

export async function handleWhatsApp(req, deps){
  if(req.method !== 'POST') return out(405, { error:'post_only' });
  if(!deps.key || !deps.token || !deps.phoneId) return out(503, { error:'not_configured' });
  const h = req.headers || {};
  if(!same(h['x-pesa-key'], deps.key)) return out(401, { error:'bad_key' });
  const b = req.body || {};
  if(b.action === 'ping') return out(200, { ok:true });
  const to = normPhone(b.to);
  if(to.length < 9 || to.length > 15) return out(400, { error:'bad_number' });
  const text = String(b.text || '').trim();
  if(!text) return out(400, { error:'empty_message' });
  const now = deps.now ? deps.now() : Date.now(), hits = deps.hits || (deps.hits = []);
  while(hits.length && now - hits[0] > 3600000) hits.shift();
  if(hits.length >= MAX_PER_HOUR) return out(429, { error:'hourly_limit' });

  let bytes = null;
  if(b.pdf){
    try{
      const bin = atob(String(b.pdf)); bytes = new Uint8Array(bin.length);
      for(let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    }catch(e){ return out(400, { error:'bad_pdf' }); }
    if(bytes.length > MAX_PDF_BYTES) return out(413, { error:'pdf_too_big' });
    if(!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) return out(400, { error:'bad_pdf' });
  }
  const G = (deps.graph || 'https://graph.facebook.com/v21.0') + '/' + deps.phoneId;
  const auth = { Authorization:'Bearer ' + deps.token };
  const filename = param(b.filename || 'document.pdf', 80).replace(/[^\w.\- ]+/g, '_');
  async function fail(r){
    let m = {}; try{ m = (await r.json()).error || {}; }catch(e){}
    const code = Number(m.code) || 0;
    const error = code === 190 ? 'token_invalid' : code === 132001 ? 'template_missing' : code === 131047 ? 'window_closed' : code === 131030 ? 'number_not_allowed' : 'meta_error';
    return out(502, { error, code, detail:String(m.message || '').slice(0, 160) });
  }
  try{
    let mediaId = null;
    if(bytes){
      const fd = new FormData();
      fd.append('messaging_product', 'whatsapp'); fd.append('type', 'application/pdf');
      fd.append('file', new Blob([bytes], { type:'application/pdf' }), filename);
      const mr = await deps.fetch(G + '/media', { method:'POST', headers:auth, body:fd });
      if(!mr.ok) return fail(mr);
      mediaId = (await mr.json()).id;
      if(!mediaId) return out(502, { error:'meta_error', detail:'no media id' });
    }
    let msg;
    if(b.mode === 'session'){            // free form: only works when the customer messaged the shop in the last 24 hours
      msg = mediaId ? { type:'document', document:{ id:mediaId, filename, caption:param(text, 1000) } } : { type:'text', text:{ body:text.slice(0, 4000) } };
    } else {                             // an approved template, so it also works for a customer who has not messaged first
      const comps = [];
      if(mediaId) comps.push({ type:'header', parameters:[{ type:'document', document:{ id:mediaId, filename } }] });
      comps.push({ type:'body', parameters:[{ type:'text', text:param(b.name || 'there', 60) }, { type:'text', text:param(b.shop || 'Pesa', 60) }, { type:'text', text:param(text, 900) }] });
      msg = { type:'template', template:{ name: mediaId ? (deps.templateDoc || 'pesa_document') : (deps.templateText || 'pesa_message'), language:{ code:deps.lang || 'en' }, components:comps } };
    }
    const r = await deps.fetch(G + '/messages', { method:'POST', headers:Object.assign({ 'Content-Type':'application/json' }, auth), body:JSON.stringify(Object.assign({ messaging_product:'whatsapp', to }, msg)) });
    if(!r.ok) return fail(r);
    const j = await r.json(); hits.push(now);
    return out(200, { ok:true, id:(j.messages && j.messages[0] && j.messages[0].id) || null, attached:!!mediaId });
  }catch(e){ return out(502, { error:'network' }); }
}
