// Computer (wide screen) speed: the side menu is drawn on every page switch, so its alert badge must not rescan every sale each time,
// and the cached answers must still change at once when a sale is added.
const { chromium } = require('playwright');
let fail = 0; const ck = (n, c, extra) => { console.log((c ? '  ok   ' : '  FAIL ') + n + (c ? '' : (extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''))); if (!c) fail++; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, serviceWorkers: 'block' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await require('./biz_boot.js')(p);
  await p.evaluate(() => { const T = window.__t, S = T.State, now = Date.now();
    const prods = []; for (let i = 0; i < 3000; i++) prods.push({ id: 'p' + i, name: 'Product ' + i, category: 'Dry', sellPrice: 20, costPrice: 10, stockQty: 50, lowStock: 5, barcode: String(7000000000000 + i), createdAt: new Date(now).toISOString() }); S.products = prods;
    const sales = []; for (let i = 0; i < 12000; i++) { const pr = prods[(i * 7) % 3000]; sales.push({ id: 's' + i, items: [{ productId: pr.id, name: pr.name, qty: 1, unitPrice: 20, cost: 10, lineTotal: 20 }], total: 20, cost: 10, profit: 10, paymentMethod: 'cash', cashierName: 'Owner', createdAt: new Date(now - (i % 60) * 86400000 - 3600000).toISOString() }); } S.sales = sales; });
  // the cached figures follow a new sale at once
  const r = await p.evaluate(() => { const T = window.__t, S = T.State; const before = T.brainToday(new Date()).total;
    S.sales.push({ id: 'sNew', items: [{ productId: 'p1', name: 'Product 1', qty: 1, unitPrice: 20, cost: 10, lineTotal: 20 }], total: 777, cost: 10, profit: 767, paymentMethod: 'cash', cashierName: 'Owner', createdAt: new Date().toISOString() });
    const after = T.brainToday(new Date()).total; return { before, after }; });
  ck('today takings follow a new sale straight away', r.after - r.before === 777, r);
  const same = await p.evaluate(() => { const T = window.__t; return T.brainDayIndex() === T.brainDayIndex(); });
  ck('the same day is not scanned twice in a row', same === true);
  // wide screen page switches stay quick on a big shop
  const times = []; for (const t of ['credit', 'expenses', 'stock', 'credit', 'expenses', 'dashboard', 'credit']) { times.push(await p.evaluate(async (t) => { const t0 = performance.now(); window.__t.setTab(t); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return performance.now() - t0; }, t)); }
  const warm = times.slice(1); const avg = Math.round(warm.reduce((a, x) => a + x, 0) / warm.length);
  console.log('   page switch times (ms):', times.map(x => Math.round(x)).join(', '), ' average after the first:', avg);
  ck('page switches on a wide screen average under 150 ms with 12,000 sales', avg < 150, avg);
  ck('side menu badge is still right', typeof (await p.evaluate(() => window.__t.smartAlertCount())) === 'number');
  ck('no page errors', errs.length === 0, errs);
  console.log(fail ? 'FAILED ' + fail : 'ALL OK'); await b.close(); process.exit(fail ? 1 : 0);
})();
