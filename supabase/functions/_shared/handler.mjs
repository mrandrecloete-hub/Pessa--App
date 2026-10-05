/* The Pesa licence server, as one plain function so it can be tested without a server.
   handle(req, deps) -> { status, body }
   req  = { method, action, query, headers, body }
   deps = { db, mail, now(), privJwk, adminToken, seller, makeDocs(), genId() }
   db   = { byRef(ref), insert(row), update(id, patch), pending() }   (all async)
   mail = async ({ to, subject, text, attachments:[{ filename, base64 }] })  or null

   Public actions   request  (a shop says it has paid)   status  (a shop asks for its key)
   Admin actions    list     (waiting requests)          approve (payment confirmed: make the key, email the client) */
import { PLANS, REF_RE, computeExp, signLicence, priceFor } from './sign.mjs';

const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/;
const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const res = (status, body) => ({ status, body });
function sameToken(a, b){ if(!a || !b || a.length !== b.length) return false; let d = 0; for(let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
const latestApproved = rows => rows.filter(r => r.status === 'approved' && r.key).sort((a, b) => (a.exp < b.exp ? 1 : a.exp > b.exp ? -1 : 0))[0] || null;
const latestPending = rows => rows.filter(r => r.status === 'pending').sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0] || null;

export async function handle(req, deps){
  const action = req.action, q = req.query || {}, b = req.body || {};
  const admin = () => sameToken(String((req.headers && (req.headers['x-admin-token'] || req.headers['X-Admin-Token'])) || ''), String(deps.adminToken || ''));

  if(action === 'request'){
    const ref = clip(b.ref, 20).toUpperCase(), plan = clip(b.plan, 20), period = b.period === 'yearly' ? 'yearly' : 'monthly';
    if(!REF_RE.test(ref)) return res(400, { error:'bad_reference' });
    if(!PLANS[plan]) return res(400, { error:'bad_plan' });
    const email = clip(b.email, 120); if(email && !EMAIL_RE.test(email)) return res(400, { error:'bad_email' });
    const shop = clip(b.shop, 80), rows = await deps.db.byRef(ref), pend = latestPending(rows);
    const fields = { shop, email, plan, period, amount_due: priceFor(plan, period) };
    if(pend){ await deps.db.update(pend.id, fields); return res(200, { ok:true, status:'pending' }); }
    await deps.db.insert(Object.assign({ id:deps.genId(), ref, status:'pending', created_at:new Date(deps.now()).toISOString() }, fields));
    return res(200, { ok:true, status:'pending' });
  }

  if(action === 'status'){
    const ref = clip(q.ref, 20).toUpperCase(); if(!REF_RE.test(ref)) return res(400, { error:'bad_reference' });
    const rows = await deps.db.byRef(ref), ok = latestApproved(rows);
    if(ok) return res(200, { status:'approved', key:ok.key, plan:ok.plan, exp:ok.exp });
    return res(200, { status: latestPending(rows) ? 'pending' : 'none' });
  }

  if(action === 'list'){
    if(!admin()) return res(401, { error:'not_allowed' });
    const rows = await deps.db.pending();
    return res(200, { requests: rows.map(r => ({ id:r.id, ref:r.ref, shop:r.shop, email:r.email, plan:r.plan, period:r.period, amount_due:r.amount_due, created_at:r.created_at })) });
  }

  if(action === 'approve'){
    if(!admin()) return res(401, { error:'not_allowed' });
    const ref = clip(b.ref, 20).toUpperCase(); if(!REF_RE.test(ref)) return res(400, { error:'bad_reference' });
    const amount = Number(b.amount); if(!(amount >= 0) || isNaN(amount)) return res(400, { error:'bad_amount' });
    const rows = await deps.db.byRef(ref); let row = latestPending(rows);
    if(!row){
      const plan = clip(b.plan, 20); if(!PLANS[plan]) return res(404, { error:'no_request' });
      row = { id:deps.genId(), ref, status:'pending', created_at:new Date(deps.now()).toISOString(), shop:clip(b.shop, 80), email:clip(b.email, 120), plan, period:b.period === 'yearly' ? 'yearly' : 'monthly', amount_due:0 };
      await deps.db.insert(row);
    }
    const prev = latestApproved(rows), months = row.period === 'yearly' ? 12 : 1;
    const t = computeExp(deps.now(), months, prev && prev.exp);
    const payload = { v:1, ref, plan:row.plan, exp:t.exp, iat:t.from }; if(row.shop) payload.shop = row.shop.slice(0, 60);
    const key = await signLicence(deps.privJwk, payload);
    const paid = /^\d{4}-\d{2}-\d{2}$/.test(String(b.paidDate || '')) ? b.paidDate : t.from;
    const seq = rows.filter(r => r.status === 'approved').length + 1;
    const patch = { status:'approved', key, exp:t.exp, from_date:t.from, approved_at:new Date(deps.now()).toISOString(), paid_amount:amount, method:clip(b.method, 40) || 'EFT / bank transfer', bank_ref:clip(b.bankRef, 60), paid_date:paid, seq };
    await deps.db.update(row.id, patch);
    let emailed = false, mailError = '';
    const to = clip(b.email, 120) || row.email;
    if(deps.mail && to && EMAIL_RE.test(to)){
      try{
        const docs = deps.makeDocs();
        const d = { ref, shop:row.shop, client:row.shop, email:to, plan:row.plan, months, from:t.from, exp:t.exp, key, paid, method:patch.method, bankRef:patch.bank_ref, amount, seq };
        const toB64 = doc => { const u = new Uint8Array(doc.output('arraybuffer')); let s = ''; for(let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); };
        const base = (row.shop || 'client').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'client';
        await deps.mail({
          to, subject:'Your Pesa payment and licence certificate',
          text:'Hello ' + (row.shop || '') + ',\n\nThank you for your payment of N$' + amount.toFixed(2) + '. Your Pesa ' + PLANS[row.plan].name + ' licence is active until ' + t.exp + '. Pesa switches it on by itself when you open the app with an internet connection.\n\nAttached you will find two documents:\n1. Proof of payment\n2. Licence certificate, which carries your licence key and the steps to switch it on yourself if you ever need to\n\nIf you need help, message us on WhatsApp ' + deps.seller.whatsapp + '.\n\nKind regards,\n' + deps.seller.name,
          attachments:[ { filename:'Pesa-Proof-of-Payment-' + base + '-' + paid + '.pdf', base64:toB64(docs.buildProof(d)) }, { filename:'Pesa-Licence-Certificate-' + base + '-' + ref + '.pdf', base64:toB64(docs.buildCert(d)) } ]
        });
        emailed = true;
      }catch(e){ mailError = String(e && e.message || e).slice(0, 200); }
    }
    return res(200, { ok:true, ref, plan:row.plan, exp:t.exp, key, emailed, mailError });
  }

  return res(404, { error:'unknown_action' });
}
