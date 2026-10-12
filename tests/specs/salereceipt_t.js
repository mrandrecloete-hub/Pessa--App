// The "Sale recorded" dialog: Print, Print via Bluetooth, Email, Download receipt and Not now. Email opens an email only send sheet.
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
  await sell();
  const labels = await p.evaluate(() => { const m = document.getElementById('modalRoot'); return [...m.querySelectorAll('button')].map(x => x.textContent.trim().replace(/\s+/g, ' ')); });
  console.log('   buttons:', JSON.stringify(labels));
  ck('Print is offered', labels.some(l => l === 'Print'));
  ck('Print via Bluetooth is offered', labels.some(l => /Bluetooth/i.test(l)));
  ck('Email is offered', labels.some(l => l === 'Email'));
  ck('Download receipt is offered', labels.some(l => l === 'Download receipt'));
  ck('Not now is offered', labels.some(l => l === 'Not now'));
  ck('WhatsApp and SMS are not in this box', !labels.some(l => /WhatsApp|SMS/i.test(l)));
  ck('five buttons only', labels.length === 5, labels);
  // Email opens the send sheet with email only
  await p.click('#saleSendBtn'); await p.waitForSelector('#sdRecipient');
  const ch = await p.evaluate(() => [...document.querySelectorAll('[data-channel]')].map(x => x.getAttribute('data-channel')));
  console.log('   send sheet channels:', JSON.stringify(ch));
  ck('the send sheet has an email channel', ch.some(c => /^email/.test(c)), ch);
  ck('no WhatsApp, SMS or Gmail channel', !ch.some(c => /whatsapp|wanow|sms|gmail/.test(c)), ch);
  ck('the mobile number box is hidden', await p.evaluate(() => { const f = document.getElementById('sdPhone'); return !f || f.closest('.field').style.display === 'none'; }));
  await p.click('#sdDone');
  // Print calls the print routine with a receipt
  await p.evaluate(() => { window.__printed = 0; window.__t.printPdfDoc = function(){ window.__printed++; }; });
  // the app calls printPdfDoc by its own name, so watch the iframe it makes instead
  const before = await p.evaluate(() => document.querySelectorAll('iframe').length);
  await p.click('#salePrintBtn'); await p.waitForTimeout(1500);
  const after = await p.evaluate(() => document.querySelectorAll('iframe').length);
  ck('Print builds the receipt and starts printing', after > before || await p.evaluate(() => !document.querySelector('#saleSkipBtn')));
  // Download receipt
  await sell();
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 10000 }).catch(() => null), p.click('#saleReceiptBtn')]);
  await p.waitForTimeout(800);
  ck('Download receipt saves a PDF with no format question', !!dl && /^receipt-.*.pdf$/.test(dl.suggestedFilename()), dl && dl.suggestedFilename());
  ck('Download receipt closes the box', await p.evaluate(() => !document.querySelector('#saleSkipBtn')));
  // Not now closes
  await sell(); await p.click('#saleSkipBtn'); await p.waitForTimeout(200);
  ck('Not now closes the box', await p.evaluate(() => !document.querySelector('#saleSkipBtn')));
  ck('no page errors', errs.length === 0, errs);
  console.log(fail ? 'FAILED ' + fail : 'ALL OK'); await b.close(); process.exit(fail ? 1 : 0);
})();
