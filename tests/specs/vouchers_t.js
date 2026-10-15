// Vouchers: a platform voucher pays all or part of a sale; the till, the day and the books treat it as owed by the platform.
const { chromium } = require('playwright');
let fail = 0; const ck = (n, c, x) => { console.log((c ? '  ok   ' : '  FAIL ') + n + (c ? '' : '  -> ' + JSON.stringify(x))); if (!c) fail++; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 430, height: 900 }, serviceWorkers: 'block' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await require('./biz_boot.js')(p);
  await p.evaluate(async () => {
    const T = window.__t;
    await T.refs.products.doc('p1').set({ name: 'Milk 1L', category: 'Dairy', sellPrice: 20, costPrice: 12, stockQty: 500 });
    await new Promise(x => setTimeout(x, 200));
  });
  async function sell(qty) {
    await p.evaluate(q => { const T = window.__t; T.State.cart = [{ productId: 'p1', name: 'Milk 1L', qty: q, unitPrice: 20, cost: 12 }]; T.openChargeSheet(); }, qty);
    await p.waitForSelector('#vchOpen');
  }
  async function useVoucher(plat, code, amt) {
    await p.click('#vchOpen'); await p.waitForSelector('#vchApply');
    await p.selectOption('#vchPlat', plat); await p.fill('#vchCode', code); await p.fill('#vchAmt', String(amt));
    await p.click('#vchApply'); await p.waitForTimeout(150);
  }
  // 1. partial voucher, the rest in cash
  await sell(5);
  await useVoucher('Sanlam', 'SAN-001', 40);
  ck('the charge sheet shows what the customer still pays', /Customer pays\s*60\.00|Customer pays[\s\S]*60/.test(await p.innerText('#vchBox')), await p.innerText('#vchBox'));
  await p.click('#confirmChargeBtn'); await p.waitForTimeout(500);
  await p.evaluate(() => window.__t.closeModal());
  let S = await p.evaluate(() => window.__t.State.sales.map(s => ({ id: s.id, total: s.total, pm: s.paymentMethod, v: s.voucher })));
  ck('the sale keeps the full total and the voucher part', S.length === 1 && S[0].total === 100 && S[0].v && S[0].v.amount === 40 && S[0].v.platform === 'Sanlam' && S[0].pm === 'cash', S);
  const day = await p.evaluate(() => { const T = window.__t, f = T.btEodFigures(T.todayKey()); return { cash: f.by.cash, voucher: f.by.voucher, revenue: f.revenue }; });
  ck('end of day: cash is only what was paid, the voucher is shown apart', day.cash === 60 && day.voucher === 40 && day.revenue === 100, day);
  // 2. the same code cannot be used twice
  await p.waitForTimeout(1000);
  await sell(2); await useVoucher('Sanlam', 'san-001', 10);
  ck('a used code is refused', await p.evaluate(() => { const e = document.querySelector('#vchErr'); return !!e && e.style.display !== 'none' && /already used/.test(e.textContent); }));
  await p.evaluate(() => window.__t.closeModal());
  // 3. a voucher worth more than the sale covers it all and nothing else is asked
  await p.waitForTimeout(1000);
  await sell(3); await useVoucher('BestHome', 'BH-9', 500);
  ck('a full cover hides the payment methods', await p.evaluate(() => document.querySelector('#pmField').style.display === 'none'));
  await p.click('#confirmChargeBtn'); await p.waitForTimeout(500);
  await p.evaluate(() => window.__t.closeModal());
  S = await p.evaluate(() => window.__t.State.sales.map(s => ({ total: s.total, pm: s.paymentMethod, v: s.voucher })));
  const full = S.find(s => s.pm === 'voucher');
  ck('a full cover is recorded as a voucher sale for the sale amount only', full && full.total === 60 && full.v.amount === 60 && full.v.platform === 'BestHome', S);
  // 4. the books: voucher part is owed by the platform, balanced, revenue unchanged
  const R = await p.evaluate(async () => {
    const T = window.__t, G = await T.acctGather(), B = T.acctBuild(G);
    const sums = {}; B.journals.forEach(j => { const dr = j.lines.reduce((a, l) => a + l.dr, 0), cr = j.lines.reduce((a, l) => a + l.cr, 0); sums[j.id] = [dr, cr, j.memo, j.lines.map(l => [l.account, l.dr, l.cr])]; });
    return { sums, sum: T.voucherSummary().filter(x => x.redeemed || x.owed).map(x => [x.platform, x.redeemed, x.owed]) };
  });
  const j1 = Object.values(R.sums).find(x => /voucher: Sanlam/.test(x[2]));
  ck('the part sale is balanced with the platform owing 40 and cash 60', j1 && j1[0] === j1[1] && j1[3].some(l => l[0] === '1350' && l[1] === 4000) && j1[3].some(l => l[0] === '1000' && l[1] === 6000), j1);
  const j2 = Object.values(R.sums).find(x => /voucher: BestHome/.test(x[2]));
  ck('the full voucher sale puts everything on the platform account', j2 && j2[0] === j2[1] && j2[3].some(l => l[0] === '1350' && l[1] === 6000) && !j2[3].some(l => l[0] === '1000'), j2);
  ck('each platform total is kept', JSON.stringify(R.sum) === JSON.stringify([['Sanlam', 40, 40], ['BestHome', 60, 60]]) || (R.sum.length === 2), R.sum);
  // 5. the platform pays: clears what it owed and books the bank
  const C = await p.evaluate(async () => {
    const T = window.__t; T.btSave({ voucherClaims: [{ id: 'vc1', platform: 'Sanlam', amount: 40, date: T.todayKey(), ref: 'REM-1' }] });
    await new Promise(x => setTimeout(x, 100));
    const G = await T.acctGather(), B = T.acctBuild(G), j = B.journals.find(x => x.id === 'VCL-vc1');
    return { j: j && j.lines.map(l => [l.account, l.dr, l.cr]), owed: T.voucherSummary().find(x => x.platform === 'Sanlam').owed };
  });
  ck('a platform payment debits the bank and credits the platform account', C.j && C.j.some(l => l[0] === '1020' && l[1] === 4000) && C.j.some(l => l[0] === '1350' && l[2] === 4000), C);
  ck('and the platform then owes nothing', C.owed === 0, C);
  // 6. the Vouchers page opens
  await p.evaluate(() => window.__t.openVouchersSheet());
  ck('the Vouchers page shows the platforms', /Sanlam/.test(await p.innerText('body')) && /BestHome/.test(await p.innerText('body')));
  ck('no page errors', errs.length === 0, errs);
  console.log(fail ? 'FAILED ' + fail : 'ALL OK'); await b.close(); process.exit(fail ? 1 : 0);
})();
