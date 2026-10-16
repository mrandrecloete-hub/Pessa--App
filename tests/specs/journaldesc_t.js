// Journal and general ledger: every sale is described from its own receipt, and refunds and voids are booked as reversals.
const { chromium } = require('playwright');
let fail = 0; const ck = (n, c, x) => { console.log((c ? '  ok   ' : '  FAIL ') + n + (c ? '' : '  -> ' + JSON.stringify(x))); if (!c) fail++; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 430, height: 900 }, serviceWorkers: 'block' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await require('./biz_boot.js')(p);
  const R = await p.evaluate(async () => {
    const T = window.__t, r = T.refs, today = new Date().toISOString().slice(0, 10);
    await r.products.doc('p1').set({ name: 'Milk 1L', category: 'Dairy', sellPrice: 20, costPrice: 12, stockQty: 50 });
    await r.products.doc('p2').set({ name: 'Brown bread', category: 'Bakery', sellPrice: 15, costPrice: 8, stockQty: 50 });
    await r.customers.doc('c1').set({ name: 'Maria Shikongo', balance: 0 });
    const it = (id, name, q, price, cost) => ({ productId: id, name, qty: q, unitPrice: price, cost, lineTotal: q * price, taxCategory: 'STANDARD' });
    await r.sales.doc('abc123xyz').set({ items: [it('p1', 'Milk 1L', 2, 20, 12), it('p2', 'Brown bread', 1, 15, 8)], total: 55, cost: 32, profit: 23, paymentMethod: 'cash', receiptNo: 'INV-0007', createdAt: today + 'T10:15:00' });
    await r.sales.doc('qq9988zz').set({ items: [it('p1', 'Milk 1L', 5, 20, 12)], total: 100, cost: 60, profit: 40, paymentMethod: 'credit', customerId: 'c1', customerName: 'Maria Shikongo', receiptNo: 'INV-0008', createdAt: today + 'T11:40:00' });
    await r.sales.doc('w1').set({ items: [it('p2', 'Brown bread', 2, 15, 8)], total: 30, cost: 16, profit: 14, paymentMethod: 'wallet', walletProvider: 'PayToday', receiptNo: 'INV-0009', createdAt: today + 'T12:00:00' });
    await r.sales.doc('many').set({ items: [1, 2, 3, 4, 5, 6].map(i => it('p1', 'Item ' + i + ' ' + 'x'.repeat(50), 1, 10, 5)), total: 60, cost: 30, profit: 30, paymentMethod: 'card', receiptNo: 'INV-0010', createdAt: today + 'T12:30:00' });
    await r.sales.doc('noreceipt').set({ items: [it('p1', 'Milk 1L', 0.5, 20, 12)], total: 10, cost: 6, profit: 4, paymentMethod: 'cash', createdAt: today + 'T09:05:00' });
    await r.sales.doc('rf0001').set({ type: 'refund', refundOf: 'abc123xyz', refundOfReceipt: 'INV-0007', receiptNo: 'RC-0001', items: [{ productId: 'p1', name: 'Milk 1L', qty: -1, unitPrice: 20, cost: 12, lineTotal: -20, taxCategory: 'STANDARD' }], total: -20, cost: -12, profit: -8, paymentMethod: 'cash', reason: 'Expired on the shelf', createdAt: today + 'T13:00:00' });
    await r.sales.doc('vd0001').set({ type: 'void', refundOf: 'w1', refundOfReceipt: 'INV-0009', receiptNo: 'RC-0002', items: [{ productId: 'p2', name: 'Brown bread', qty: -2, unitPrice: 15, cost: 8, lineTotal: -30, taxCategory: 'STANDARD' }], total: -30, cost: -16, profit: -14, paymentMethod: 'wallet', walletProvider: 'PayToday', reason: 'Wrong item', createdAt: today + 'T13:10:00' });
    await new Promise(x => setTimeout(x, 300));
    const G = await T.acctGather(), B = T.acctBuild(G);
    const by = {}; B.journals.forEach(j => { by[j.id] = j; });
    const v = T.acctView(G, B, today, today);
    const jd = await T.acctJournalData(today, today, null);
    const L = T.acctLedger(B, today, today);
    const revenueLines = (L.find(a => a.code === '4000') || { lines: [] }).lines.map(x => x.memo);
    return { by: Object.fromEntries(Object.keys(by).map(k => [k, { ref: by[k].ref, memo: by[k].memo, kind: by[k].kind, lines: by[k].lines.map(l => [l.account, l.dr, l.cr]) }])),
      revenue: v.pl.revenue, cogs: v.pl.cogs, csvMemos: jd.rows.filter(x => /^(SALE|REF)/.test(x[0])).map(x => [x[0], x[3], x[4]]), pdfRefs: jd.pdf.map(x => x[1]).filter(Boolean), revenueLines };
  });
  const m = id => R.by[id];
  ck('cash sale: receipt number and items', m('SALE-abc123xyz').memo === 'Sale INV-0007: 2 x Milk 1L, 1 x Brown bread (cash)', m('SALE-abc123xyz').memo);
  ck('the reference is the receipt number', m('SALE-abc123xyz').ref === 'INV-0007', m('SALE-abc123xyz').ref);
  ck('credit sale names the customer', m('SALE-qq9988zz').memo === 'Sale INV-0008 to Maria Shikongo: 5 x Milk 1L (on credit)', m('SALE-qq9988zz').memo);
  ck('wallet sale names the provider', m('SALE-w1').memo === 'Sale INV-0009: 2 x Brown bread (wallet: PayToday)', m('SALE-w1').memo);
  ck('a long basket shows four items and how many more', /^Sale INV-0010: 1 x Item 1 x+\.\.\., 1 x Item 2 .*, and 2 more \(card\)$/.test(m('SALE-many').memo), m('SALE-many').memo);
  ck('a sale with no receipt number uses its time, never the record id', /^Sale 09:05: 0\.5 x Milk 1L \(cash\)$/.test(m('SALE-noreceipt').memo) && !/noreceipt/.test(m('SALE-noreceipt').memo), m('SALE-noreceipt').memo);
  ck('refund says which receipt it reverses, with the reason', m('REF-rf0001').memo === 'Refund RC-0001 of receipt INV-0007: 1 x Milk 1L (cash). Reason: Expired on the shelf', m('REF-rf0001').memo);
  ck('void says which receipt it reverses', /^Void RC-0002 of receipt INV-0009: 2 x Brown bread \(wallet: PayToday\)\. Reason: Wrong item$/.test(m('REF-vd0001').memo), m('REF-vd0001').memo);
  ck('no memo contains an internal record id', Object.values(R.by).every(j => !/abc123xyz|qq9988zz|rf0001|vd0001|noreceipt/.test(j.memo)));
  // the refund reverses: cash credited, revenue debited, cost of goods credited, stock debited
  const rf = m('REF-rf0001').lines;
  ck('the refund credits cash and debits revenue', rf.some(l => l[0] === '1000' && l[2] === 2000) && rf.some(l => l[0] === '4000' && l[1] === 2000), rf);
  ck('the refund credits cost of goods and debits stock', rf.some(l => l[0] === '5000' && l[2] === 1200) && rf.some(l => l[0] === '1200' && l[1] === 1200), rf);
  // sales 55 + 100 + 30 + 60 + 10 less refund 20 less void 30 = 205 revenue; cost 32+60+16+30+6 less 12 less 16 = 116
  ck('revenue is sales less refunds and voids', R.revenue === 20500, R.revenue);
  ck('cost of goods is reduced by the refund and void', R.cogs === 11600, R.cogs);
  ck('the journal document uses the receipt number as the reference', R.pdfRefs.some(x => /^INV-0007 \/ 1$/.test(x)) && R.pdfRefs.some(x => /^RC-0001 \/ 1$/.test(x)), R.pdfRefs.slice(0, 6));
  ck('the journal file has the receipt number and the description', R.csvMemos.some(x => x[0] === 'SALE-abc123xyz' && x[1] === 'INV-0007' && /2 x Milk 1L/.test(x[2])), R.csvMemos.slice(0, 3));
  ck('the general ledger shows the same description', R.revenueLines.includes('Sale INV-0007: 2 x Milk 1L, 1 x Brown bread (cash)'), R.revenueLines);
  ck('no page errors', errs.length === 0, errs);
  console.log(fail ? 'FAILED ' + fail : 'ALL OK'); await b.close(); process.exit(fail ? 1 : 0);
})();
