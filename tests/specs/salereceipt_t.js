// The "Sale recorded" dialog: Print, Print via Bluetooth, Email, WhatsApp, Download receipt and Not now.
// Email and WhatsApp open a send sheet limited to that channel. WhatsApp always carries the receipt PDF.
const { chromium } = require('playwright');
let fail = 0; const ck = (n, c, x) => { console.log((c ? '  ok   ' : '  FAIL ') + n + (c ? '' : '  -> ' + JSON.stringify(x))); if (!c) fail++; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: 'block', acceptDownloads: true });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await require('./biz_boot.js')(p);
  await p.evaluate(async () => { const T = window.__t; await T.refs.products.doc('p1').set({ name: 'Milk 1L', category: 'Dairy', sellPrice: 22, costPrice: 15, stockQty: 50, barcode: '600111' }); });
  await p.waitForTimeout(300);
  async function sell(){
    await p.evaluate(() => { const T = window.__t; T.setTab('sell'); T.addToCart('p1'); T.openChargeSheet(); });
    await p.waitForSelector('#confirmChargeBtn', { timeout: 8000 }).catch(() => {});
    await p.evaluate(() => window.__t.finalizeSale('cash', null, {}));
    await p.waitForSelector('#saleSkipBtn', { timeout: 8000 });
  }
  const channels = () => p.evaluate(() => [...document.querySelectorAll('[data-channel]')].map(x => x.getAttribute('data-channel')));
  await sell();
  const labels = await p.evaluate(() => { const m = document.getElementById('modalRoot'); return [...m.querySelectorAll('button')].map(x => x.textContent.trim().replace(/\s+/g, ' ')); });
  console.log('   buttons:', JSON.stringify(labels));
  ck('Print is offered', labels.some(l => l === 'Print'));
  ck('Print via Bluetooth is offered', labels.some(l => /Bluetooth/i.test(l)));
  ck('Email is offered', labels.some(l => l === 'Email'));
  ck('WhatsApp is offered', labels.some(l => l === 'WhatsApp'));
  ck('Download receipt is offered', labels.some(l => l === 'Download receipt'));
  ck('Not now is offered', labels.some(l => l === 'Not now'));
  ck('SMS is not in this box', !labels.some(l => /SMS/i.test(l)));
  ck('six buttons only', labels.length === 6, labels);
  // Email: email channels only
  await p.click('#saleSendBtn'); await p.waitForSelector('#sdRecipient');
  let ch = await channels();
  ck('Email sheet has an email channel', ch.some(c => /^email/.test(c)), ch);
  ck('Email sheet has no WhatsApp, SMS or Gmail', !ch.some(c => /whatsapp|wanow|sms|gmail/.test(c)), ch);
  await p.click('#sdDone');
  // WhatsApp: WhatsApp channels only
  await p.click('#saleWaBtn'); await p.waitForSelector('#sdRecipient');
  ch = await channels();
  console.log('   WhatsApp sheet channels:', JSON.stringify(ch));
  ck('WhatsApp sheet has the WhatsApp channel', ch.includes('whatsapp'), ch);
  ck('WhatsApp sheet has no email, SMS or Gmail', !ch.some(c => /^email|sms|gmail/.test(c)), ch);
  ck('the email box is hidden and the number box is shown', await p.evaluate(() => document.getElementById('sdEmail').closest('.field').style.display === 'none' && document.getElementById('sdPhone').closest('.field').style.display !== 'none'));
  await p.fill('#sdPhone', '0811234567');
  // 1) a device that can share a file: the PDF goes to the share list with the message
  await p.evaluate(() => {
    window.__shared = null;
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: function(d){ return !!(d && d.files && d.files.length); } });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async function(d){ window.__shared = { n: d.files.length, name: d.files[0].name, type: d.files[0].type, size: d.files[0].size, text: d.text || '' }; } });
  });
  await p.waitForTimeout(600);   // the PDF is built as the sheet opens
  await p.click('[data-channel="whatsapp"]'); await p.waitForTimeout(500);
  const sh = await p.evaluate(() => window.__shared);
  console.log('   shared:', JSON.stringify(sh));
  ck('the PDF is handed to the share list', !!sh && sh.n === 1 && /^receipt-.*\.pdf$/.test(sh.name) && sh.type === 'application/pdf' && sh.size > 1000, sh);
  ck('the message goes with the PDF', !!sh && /receipt/i.test(sh.text), sh);
  // 2) a device that cannot share a file: the chat opens and the PDF is saved to attach
  await p.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    window.__opened = null; window.open = function(u){ window.__opened = String(u); return { closed:false, focus:function(){} }; };
  });
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }).catch(() => null), p.click('[data-channel="whatsapp"]')]);
  await p.waitForTimeout(400);
  const opened = await p.evaluate(() => window.__opened);
  ck('the WhatsApp chat opens with the number', !!opened && /wa\.me\/264811234567|wa\.me\/0?811234567|api\.whatsapp\.com/.test(opened), opened);
  ck('the PDF is saved so it can be attached', !!dl && /^receipt-.*\.pdf$/.test(dl.suggestedFilename()), dl && dl.suggestedFilename());
  ck('the result tells the person how to attach it', /paperclip/i.test(await p.innerText('#sdResult')), await p.innerText('#sdResult'));
  await p.click('#sdDone');
  // Print
  const before = await p.evaluate(() => document.querySelectorAll('iframe').length);
  await p.click('#salePrintBtn'); await p.waitForTimeout(1500);
  const after = await p.evaluate(() => document.querySelectorAll('iframe').length);
  ck('Print builds the receipt and starts printing', after > before || await p.evaluate(() => !document.querySelector('#saleSkipBtn')));
  // Download receipt
  await sell();
  const [dl2] = await Promise.all([p.waitForEvent('download', { timeout: 10000 }).catch(() => null), p.click('#saleReceiptBtn')]);
  await p.waitForTimeout(800);
  ck('Download receipt saves a PDF with no format question', !!dl2 && /^receipt-.*\.pdf$/.test(dl2.suggestedFilename()), dl2 && dl2.suggestedFilename());
  ck('Download receipt closes the box', await p.evaluate(() => !document.querySelector('#saleSkipBtn')));
  // Not now
  await sell(); await p.click('#saleSkipBtn'); await p.waitForTimeout(200);
  ck('Not now closes the box', await p.evaluate(() => !document.querySelector('#saleSkipBtn')));
  ck('no page errors', errs.length === 0, errs);
  console.log(fail ? 'FAILED ' + fail : 'ALL OK'); await b.close(); process.exit(fail ? 1 : 0);
})();
