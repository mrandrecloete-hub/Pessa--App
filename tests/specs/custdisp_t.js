// Customer display: a plain second window that shows the cart and total, then a thank you, and closes with Pesa.
const { chromium } = require('playwright');
let fail = 0; const ck = (n, c, x) => { console.log((c ? '  ok   ' : '  FAIL ') + n + (c ? '' : '  -> ' + JSON.stringify(x))); if (!c) fail++; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: 'block' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await require('./biz_boot.js')(p);
  await p.evaluate(async () => { const T = window.__t; await T.refs.products.doc('p1').set({ name: 'Milk 1L', category: 'Dairy', sellPrice: 20, costPrice: 12, stockQty: 50, barcode: '600111' }); await T.refs.products.doc('p2').set({ name: 'Bread', category: 'Bakery', sellPrice: 30, costPrice: 18, stockQty: 50, barcode: '600222' }); });
  await p.waitForTimeout(300);
  const [pop] = await Promise.all([ctx.waitForEvent('page'), p.evaluate(() => window.__t.cdOpen())]);
  await pop.waitForSelector('#cdBody');
  ck('an empty cart shows the welcome', /Welcome/.test(await pop.innerText('#cdBody')), await pop.innerText('#cdBody'));
  await p.evaluate(() => { const T = window.__t; T.setTab('sell'); T.addToCart('p1'); T.addToCart('p1'); T.addToCart('p2'); });
  const t1 = await pop.innerText('#cdBody');
  ck('items and the total show for the customer', /Milk 1L/.test(t1) && /Bread/.test(t1) && /N\$70\.00/.test(t1) && /2 x N\$20\.00/.test(t1), t1);
  await p.evaluate(() => window.__t.finalizeSale('cash', null, { cashReceived: 100, changeGiven: 30 }));
  await p.waitForTimeout(400);
  const t2 = await pop.innerText('#cdBody');
  ck('a thank you with the total paid shows after the sale', /Thank you/.test(t2) && /N\$70\.00/.test(t2), t2);
  ck('the display holds no cart items after the sale', !/Milk 1L/.test(t2), t2);
  const closed = pop.waitForEvent('close', { timeout: 5000 }).then(() => true, () => false);
  await p.close({ runBeforeUnload: false });
  ck('the display closes when Pesa closes', await closed);
  ck('no page errors', errs.length === 0, errs);
  await b.close(); console.log(fail ? 'FAILED ' + fail : 'all ok'); process.exit(fail ? 1 : 0);
})();
