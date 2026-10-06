// Any generated document can be emailed to anyone: the download box has an Email it button that opens the send sheet.
const { chromium } = require('playwright');
let fail = 0; const ck = (n, c, extra) => { console.log((c ? '  ok   ' : '  FAIL ') + n + (c ? '' : (extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''))); if (!c) fail++; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ serviceWorkers: 'block' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await require('./biz_boot.js')(p);
  await p.evaluate(() => { window.__opened = []; window.open = u => { window.__opened.push(u); return null; }; document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a[href^="mailto:"]'); if (a) { e.preventDefault(); window.__opened.push(a.getAttribute('href')); } }, true);
    const fake = { output: () => new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), getNumberOfPages: () => 1 };
    window.__ret = 'pending'; window.__t.saveGeneratedPdf(fake, 'receipt-INV-0007.pdf').then(r => { window.__ret = r; }); });
  await p.waitForSelector('#xpMail');
  ck('download box has an Email it button', true);
  await p.click('#xpMail');
  await p.waitForSelector('.send-overlay');
  ck('send sheet opens with the document name', /receipt INV 0007/i.test(await p.textContent('.send-overlay .banner')));
  ck('saveGeneratedPdf does not claim a download happened', (await p.evaluate(() => window.__ret)) === false);
  await p.selectOption('#sdRecipient', 'manual');
  await p.fill('#sdEmail', 'anyone@gmail.com, boss@company.co.za');
  await p.click('[data-channel="email"]');
  await p.waitForFunction(() => window.__opened.length > 0, null, { timeout: 5000 }).catch(() => {});
  const url = await p.evaluate(() => window.__opened[0] || '');
  ck('email app opens addressed to both people', /^mailto:anyone@gmail\.com,boss@company\.co\.za\?/.test(url), url);
  ck('subject names the document and the shop', /subject=Receipt%20inv%200007%20from%20/i.test(url), url);
  // a bad address is refused
  await p.fill('#sdEmail', 'not-an-email'); await p.evaluate(() => { window.__opened = []; }); await p.click('[data-channel="email"]'); await p.waitForTimeout(300);
  ck('a bad address is refused', (await p.evaluate(() => window.__opened.length)) === 0);

  // Send now: straight from Pesa through the email service, with the PDF when the plan allows it
  async function sendNowRun(attach, rejectPdf){
    return p.evaluate(async ({ attach, rejectPdf }) => {
      localStorage.setItem('pesa_emailjs_v1', JSON.stringify({ service: 'service_a', template: 'template_reset', key: 'pubkey' }));
      localStorage.setItem('pesa_email_alerts_v1', JSON.stringify({ on: false, attach, to: 'owner@example.com', template: 'template_msg' }));
      localStorage.removeItem('pesa_email_send_count_v1');
      document.querySelectorAll('.send-overlay').forEach(e => e.remove());
      const calls = []; window.fetch = (u, init) => { if (!/emailjs/.test(u)) return Promise.reject(new Error('x')); const b = JSON.parse(init.body); calls.push(b); return Promise.resolve({ ok: !(rejectPdf && b.template_params.document) }); };
      const fake = { output: () => new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), getNumberOfPages: () => 1 };
      window.__t.emailGeneratedDoc(fake, 'receipt-INV-0007.pdf');
      await new Promise(r => setTimeout(r, 300));
      const ov = document.querySelector('.send-overlay');
      ov.querySelector('#sdRecipient').value = 'manual'; ov.querySelector('#sdEmail').value = 'a@x.com, b@y.com';
      ov.querySelector('[data-channel="emailnow"]').click();
      await new Promise(r => setTimeout(r, 900));
      return { n: calls.length, first: calls[0] && calls[0].template_params, tpl: calls[0] && calls[0].template_id, hasDoc: calls.map(c => !!c.template_params.document), msg: ov.querySelector('#sdResult').textContent };
    }, { attach, rejectPdf });
  }
  const a1 = await sendNowRun(false, false);
  ck('Send now emails each address straight away', a1.n === 2 && a1.first.to_email === 'a@x.com' && a1.tpl === 'template_msg', a1);
  ck('without the attach switch no PDF is sent', a1.hasDoc.every(x => !x) && /Sent to/.test(a1.msg), a1);
  const a2 = await sendNowRun(true, false);
  ck('with the attach switch the PDF is attached', a2.n === 2 && a2.hasDoc.every(x => x) && /^data:application\/pdf;base64,/.test(a2.first.document) && a2.first.document_name === 'receipt-INV-0007.pdf' && /attached/i.test(a2.msg), a2);
  const a3 = await sendNowRun(true, true);
  ck('if the plan rejects the PDF it falls back to sending without it', a3.n === 4 && /did not accept the PDF/.test(a3.msg), a3);

  // Send now by WhatsApp: goes to the shop's own sending service with the key in a header and the PDF as base64
  const w1 = await p.evaluate(async () => {
    localStorage.setItem('pesa_wa_v1', JSON.stringify({ url: 'https://abc.supabase.co/functions/v1/whatsapp', key: 'secret-key-1' }));
    localStorage.removeItem('pesa_wa_count_v1'); document.querySelectorAll('.send-overlay').forEach(e => e.remove());
    const calls = []; window.fetch = (u, init) => { calls.push({ u, h: init.headers, b: JSON.parse(init.body) }); return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, attached: true }) }); };
    const fake = { output: () => new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), getNumberOfPages: () => 1 };
    window.__t.emailGeneratedDoc(fake, 'receipt-INV-0007.pdf'); await new Promise(r => setTimeout(r, 300));
    const ov = document.querySelector('.send-overlay'); ov.querySelector('#sdRecipient').value = 'manual'; ov.querySelector('#sdPhone').value = '081 234 5678';
    ov.querySelector('[data-channel="wanow"]').click(); await new Promise(r => setTimeout(r, 700));
    return { n: calls.length, c: calls[0], msg: ov.querySelector('#sdResult').textContent };
  });
  ck('Send now by WhatsApp posts to the sending service with the key and the PDF', w1.n === 1 && w1.c.u === 'https://abc.supabase.co/functions/v1/whatsapp' && w1.c.h['x-pesa-key'] === 'secret-key-1' && w1.c.b.to === '081 234 5678' && /^JVBER/.test(w1.c.b.pdf) && w1.c.b.filename === 'receipt-INV-0007.pdf', w1);
  ck('the result says it was sent', /Sent to 081 234 5678/.test(w1.msg) && /PDF was attached/.test(w1.msg), w1.msg);
  const w2 = await p.evaluate(async () => {
    localStorage.removeItem('pesa_wa_count_v1'); document.querySelectorAll('.send-overlay').forEach(e => e.remove());
    window.fetch = () => Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'template_missing' }) });
    const fake = { output: () => new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), getNumberOfPages: () => 1 };
    window.__t.emailGeneratedDoc(fake, 'x.pdf'); await new Promise(r => setTimeout(r, 300));
    const ov = document.querySelector('.send-overlay'); ov.querySelector('#sdPhone').value = '0812345678';
    ov.querySelector('[data-channel="wanow"]').click(); await new Promise(r => setTimeout(r, 500)); return ov.querySelector('#sdResult').textContent; });
  ck('a Meta problem is explained in plain words', /approved template/.test(w2), w2);
  const w3 = await p.evaluate(() => { localStorage.removeItem('pesa_wa_v1'); document.querySelectorAll('.send-overlay').forEach(e => e.remove());
    const fake = { output: () => new Blob(['x']), getNumberOfPages: () => 1 }; window.__t.emailGeneratedDoc(fake, 'x.pdf'); return !!document.querySelector('[data-channel="wanow"]'); });
  ck('the button is hidden until WhatsApp sending is set up', w3 === false);
  ck('no page errors', errs.length === 0, errs);
  console.log(fail ? 'FAILED ' + fail : 'ALL OK'); await b.close(); process.exit(fail ? 1 : 0);
})();
