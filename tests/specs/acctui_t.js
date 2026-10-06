// The rebuilt Accountant page: profit or loss picture, periods, the Profit and Loss report, the list of reports made,
// checking a report, checking all records, saving and checking a copy, access, and layout on a phone.
const { chromium } = require('playwright'); const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const D = (process.env.PESA_OUT || os.tmpdir() + '/pesa-tests/'); fs.mkdirSync(D, { recursive: true });
let fail = 0; const ck = (n, c, extra) => { console.log((c ? '  ok   ' : '  FAIL ') + n + (c ? '' : (extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''))); if (!c) fail++; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: 'block', acceptDownloads: true });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await require('./biz_boot.js')(p);
  // seed: last month and the month before are filed-able, this month so far has a loss
  await p.evaluate(async () => {
    const T = window.__t, r = T.refs, now = new Date();
    const key = (back) => { const d = new Date(now.getFullYear(), now.getMonth() - back, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
    window.__keys = { cur: key(0), last: key(1), prev: key(2) };
    const mk = async (o) => { const d = r.products.doc(); await d.set(o); return d.id; };
    const milk = await mk({ name: 'Milk 1L', category: 'Dairy', sellPrice: 50, costPrice: 30, stockQty: 500 });
    let n = 0;
    const sale = async (date, qty, price, cost) => { const items = [{ productId: milk, name: 'Milk 1L', qty, unitPrice: price, cost, lineTotal: qty * price, taxCategory: 'STANDARD' }]; await r.sales.doc('s' + (++n)).set({ items, total: qty * price, cost: qty * cost, profit: qty * (price - cost), paymentMethod: 'cash', createdAt: date + 'T10:00:00' }); };
    const k = window.__keys;
    await sale(k.prev + '-05', 1, 50, 30);                       // two months ago: sales 50, cost 30
    await r.expenses.doc('e0').set({ category: 'Rent', amount: 5, paidFrom: 'Cash drawer', createdAt: k.prev + '-06T09:00:00' });
    await sale(k.last + '-05', 2, 50, 30);                       // last month: 100 sales, 60 cost
    await sale(k.last + '-10', 4, 50, 30);                       //            200 sales, 120 cost
    await r.expenses.doc('e1').set({ category: 'Rent', amount: 70, paidFrom: 'Cash drawer', createdAt: k.last + '-06T09:00:00' });
    await r.expenses.doc('e2').set({ category: 'Wages', amount: 20, paidFrom: 'Cash drawer', createdAt: k.last + '-12T09:00:00' });
    await sale(k.cur + '-01', 1, 40, 30);                        // this month: sales 40, cost 30
    await r.expenses.doc('e3').set({ category: 'Rent', amount: 100, paidFrom: 'Cash drawer', createdAt: k.cur + '-01T09:00:00' });
  });
  await p.waitForTimeout(400);
  await p.evaluate(() => window.__t.openAccountantSheet());
  await p.waitForFunction(() => { const e = document.getElementById('acStatus'); return e && !/Checking/.test(e.textContent); }, null, { timeout: 15000 });
  await p.click('[data-actile="pl"]');
  const hero = () => p.innerText('#acHero');
  // 1. this month: 40 - 30 - 100 = loss 90
  let h = await hero();
  ck('this month shows a Loss', /Loss/i.test(h), h);
  ck('this month loss is 90.00', /90\.00/.test(h), h);
  ck('this month is the pressed period', (await p.getAttribute('[data-acper="month"]', 'aria-pressed')) === 'true');
  const brk = await p.innerText('#acBreak');
  ck('breakdown lists Rent', /Rent/.test(brk) && /100\.00/.test(brk), brk);
  ck('breakdown shows net loss row', /Net loss/.test(brk), brk);
  ck('cost bar is drawn', !!(await p.$('#acBar .ac-bar')));
  // 2. last month: sales 300, cost 180, gross 120, costs 90, profit 30
  await p.click('[data-acper="last"]'); await p.waitForTimeout(150);
  h = await hero();
  ck('last month shows a Profit', /Profit/i.test(h) && !/Loss/i.test(h), h);
  ck('last month profit is 30.00', /30\.00/.test(h), h);
  ck('profit is 10.0% of sales', /10\.0%/.test(h), h);
  ck('compares with the days before', /before/.test(h), h);
  const brk2 = await p.innerText('#acBreak');
  ck('sales 300 and gross profit 120 shown', /300\.00/.test(brk2) && /120\.00/.test(brk2), brk2);
  ck('wages 20 and rent 70 shown', /Wages/.test(brk2) && /20\.00/.test(brk2) && /70\.00/.test(brk2), brk2);
  // 3. custom dates
  await p.click('[data-acper="custom"]');
  const k = await p.evaluate(() => window.__keys);
  await p.fill('#acFrom', k.last + '-01'); await p.fill('#acTo', k.last + '-07'); await p.click('#acShow'); await p.waitForTimeout(150);
  h = await hero();
  ck('custom dates: first week of last month', /Profit|Loss/i.test(h), h);   // 100 sales - 60 cost - 70 rent = loss 30
  ck('custom dates give a loss of 30.00', /Loss/i.test(h) && /30\.00/.test(h), h);
  await p.fill('#acFrom', k.last + '-09'); await p.fill('#acTo', k.last + '-03'); await p.click('#acShow'); await p.waitForTimeout(150);
  ck('start after end changes nothing', /Loss/i.test(await hero()) && /30\.00/.test(await hero()));
  // 4. the report: number, register, checking
  const rep = await p.evaluate(async (k) => {
    const T = window.__t; const r = await T.acctMakePl(k.last + '-01', T.acctMonthEnd(k.last));
    if (!r) return null; return { no: r.meta.no, fp: r.fp, fh: r.fh, pages: r.doc.getNumberOfPages(), net: r.v.pl.net, filedMatch: !!r.meta.filedMatch, prev: !!r.meta.prev };
  }, k);
  ck('report built', !!rep);
  ck('report number has the right shape', /^PL-\d{8}-\d{8}-[A-F0-9]{6}$/.test(rep.no), rep.no);
  ck('report net is 30.00 in cents', rep.net === 3000, rep.net);
  ck('fingerprints are SHA-256', /^[a-f0-9]{64}$/.test(rep.fp) && /^[a-f0-9]{64}$/.test(rep.fh));
  ck('report has a comparison with the days before', rep.prev);
  // save the PDF bytes and read the text when pdftotext exists
  const bytes = await p.evaluate(async (k) => { const T = window.__t; const r = await T.acctMakePl(k.last + '-01', T.acctMonthEnd(k.last)); return Array.from(new Uint8Array(r.doc.output('arraybuffer'))); }, k);
  const pdfPath = path.join(D, 'acctui_pl.pdf'); fs.writeFileSync(pdfPath, Buffer.from(bytes));
  let txt = ''; try { txt = cp.execFileSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8' }); } catch (e) { txt = ''; }
  if (txt) {
    ck('pdf has the report title', /Profit and Loss report/i.test(txt));
    ck('pdf shows the report number', txt.indexOf(rep.no) >= 0);
    ck('pdf shows both fingerprints', txt.replace(/\s+/g, '').indexOf(rep.fp) >= 0 && txt.replace(/\s+/g, '').indexOf(rep.fh) >= 0);
    ck('pdf shows net profit 30.00', /Net profit/.test(txt) && /30\.00/.test(txt));
    ck('pdf says not audited', /not audited/i.test(txt));
    ck('pdf has page numbers', /Page 1 of/.test(txt));
    ck('pdf has no dash in the wording of the notes', !/ – | — /.test(txt));
  } else console.log('   (pdftotext not available, PDF text checks skipped)');
  const reg = await p.evaluate(async (k) => {
    const T = window.__t; const r = await T.acctMakePl(k.last + '-01', T.acctMonthEnd(k.last));
    await T.acctIssueReport(r, 'download'); await T.acctIssueReport(r, 'print');           // the same report twice: one line
    const list = T.acctReports(); const chk = await T.acctRegisterCheck(list);
    return { n: list.length, ok: chk.ok, no: list[0].no, prevIsGenesis: list[0].prev === 'GENESIS' };
  }, k);
  ck('register has one line for the same report', reg.n === 1, reg);
  ck('register chain is intact', reg.ok && reg.prevIsGenesis);
  const c1 = await p.evaluate((no) => window.__t.acctCheckReport(no), reg.no);
  ck('check report: genuine and matching', c1.kind === 'ok', c1);
  const c1b = await p.evaluate((no) => window.__t.acctCheckReport(no.slice(0, 5)), reg.no);
  ck('a short fragment is refused', c1b.kind === 'warn', c1b);
  const c1c = await p.evaluate(() => window.__t.acctCheckReport('PL-19990101-19990131-ABCDEF'));
  ck('an unknown number is not trusted', c1c.kind === 'bad', c1c);
  // a record changes after the report was made
  await p.evaluate(async (k) => { await window.__t.refs.expenses.doc('e9').set({ category: 'Rent', amount: 1, paidFrom: 'Cash drawer', createdAt: k.last + '-20T09:00:00' }); }, k);
  const c2 = await p.evaluate((no) => window.__t.acctCheckReport(no), reg.no);
  ck('check report: warns when records changed since', c2.kind === 'warn', c2);
  await p.evaluate(async () => { await window.__t.refs.expenses.doc('e9').delete(); });
  // the list of reports is tamper evident
  const c3 = await p.evaluate((no) => { const T = window.__t; const list = T.State.settings.acctReports; const keep = list[0].net; list[0].net = 999999; return T.acctCheckReport(no).then(r => { list[0].net = keep; return r; }); }, reg.no);
  ck('check report: a changed line is not trusted', c3.kind === 'bad', c3);
  // 5. kept months, chain, verify all
  const filed = await p.evaluate(async () => { const T = window.__t; const n = await T.acctFileMissing('manual'); return { n, keys: T.acctPeriods().map(x => x.periodKey) }; });
  ck('two finished months were filed', filed.n === 2 && filed.keys.length === 2, filed);
  const v1 = await p.evaluate(async () => { const T = window.__t; const G = await T.acctGather(), B = T.acctBuild(G); return T.acctVerifyAllData(G, B); });
  ck('verify all: everything intact', v1.ok && v1.total === 2 && !v1.hashBad.length && v1.chain.ok && v1.reg.ok, v1);
  const v2 = await p.evaluate(async () => { const T = window.__t; const list = T.State.accountingPeriods; const rec = list.find(x => x.periodKey === window.__keys.last); const keep = rec.pl.net; rec.pl.net = keep + 1; const G = await T.acctGather(), B = T.acctBuild(G); const o = await T.acctVerifyAllData(G, B); rec.pl.net = keep; return o; });
  ck('verify all: a changed figure is caught by the hash', !v2.ok && v2.hashBad.length === 1, v2);
  const v3 = await p.evaluate(async () => { const T = window.__t; const rec = T.State.accountingPeriods.find(x => x.periodKey === window.__keys.last); const keep = rec.prevHash; rec.prevHash = 'f'.repeat(64); const o = T.acctChainCheck(T.acctPeriods()); rec.prevHash = keep; return o; });
  ck('chain check: a broken link is caught', !v3.ok && v3.breaks.length === 1, v3);
  const v4 = await p.evaluate(() => { const T = window.__t; const all = T.acctPeriods(); const first = all[0]; const hist = first.history; const old = first.hash; first.history = (first.history || []).concat([{ hash: 'abc' }]); const o = T.acctChainCheck(all); first.history = hist; return o; });
  ck('chain check: intact again', v4.ok);
  // 6. the page itself: filed list, status, register, buttons
  await p.evaluate(() => { window.__t.closeModal(); window.__t.openAccountantSheet(); });
  await p.waitForFunction(() => { const e = document.getElementById('acStatus'); return e && !/Checking/.test(e.textContent); }, null, { timeout: 15000 });
  const nAcct = (await p.$$('[data-acct]')).length;
  ck('page shows filed months', nAcct === 2, nAcct);
  ck('page lists the report that was made', /PL-/.test(await p.innerText('#acRegList')));
  const st = await p.innerText('#acStatus');
  ck('status line is calm and clear', st.length > 0 && !/Checking/.test(st), st);
  await p.fill('#acChkNo', reg.no); await p.click('#acChkGo'); await p.waitForSelector('#acChkOut .ac-res');
  ck('Check a report on the page: genuine', /genuine/.test(await p.innerText('#acChkOut')), await p.innerText('#acChkOut'));
  await p.click('#acVerifyAll'); await p.waitForSelector('#acSafeOut .ac-res');
  const so = await p.innerText('#acSafeOut');
  ck('Check all records on the page: intact', /intact/i.test(so) && !/problem/i.test(so), so);
  // 7. save a copy, then check it, then check a changed copy
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }), p.click('#acExport')]);
  const copyPath = path.join(D, 'acctui_copy.json'); await dl.saveAs(copyPath);
  const copy = JSON.parse(fs.readFileSync(copyPath, 'utf8'));
  ck('copy has the file fingerprint, months and reports', /^[a-f0-9]{64}$/.test(copy.fileHash) && copy.periods.length === 2 && copy.reports.length === 1);
  await p.waitForSelector('#acSafeOut .ac-res');
  ck('copy saved message shows the fingerprint', (await p.innerText('#acSafeOut')).indexOf(copy.fileHash) >= 0);
  await p.setInputFiles('#acCopyFile', copyPath); await p.waitForFunction(() => /intact|problem/i.test(document.getElementById('acSafeOut').innerText), null, { timeout: 8000 });
  ck('checking the saved copy: intact', /This copy is intact/.test(await p.innerText('#acSafeOut')), await p.innerText('#acSafeOut'));
  const bad = JSON.parse(JSON.stringify(copy)); bad.periods[0].pl.net += 100; const badPath = path.join(D, 'acctui_copy_bad.json'); fs.writeFileSync(badPath, JSON.stringify(bad));
  await p.setInputFiles('#acCopyFile', badPath); await p.waitForFunction(() => /problem/i.test(document.getElementById('acSafeOut').innerText), null, { timeout: 8000 });
  ck('checking a changed copy: problem found', /problem/i.test(await p.innerText('#acSafeOut')), await p.innerText('#acSafeOut'));
  const junk = path.join(D, 'acctui_junk.json'); fs.writeFileSync(junk, '{"hello":1}');
  await p.setInputFiles('#acCopyFile', junk); await p.waitForFunction(() => /not a Pesa/i.test(document.getElementById('acSafeOut').innerText), null, { timeout: 8000 });
  ck('checking some other file is refused', true);
  const books = await p.evaluate(() => ({ months: window.__t.State.accountingPeriods.length, reports: window.__t.acctReports().length }));
  ck('checking and saving copies changed nothing in the books', books.months === 2 && books.reports === 1, books);
  // 8. layout on a phone, and on a wide screen
  const ov = await p.evaluate(() => { const de = document.documentElement; const sh = document.querySelector('.sheet'); return { page: de.scrollWidth - innerWidth, sheet: sh ? sh.scrollWidth - sh.clientWidth : 0 }; });
  ck('no sideways scrolling on a phone', ov.page <= 1 && ov.sheet <= 1, ov);
  await p.evaluate(() => { document.querySelector('.sheet').scrollTop = 0; });
  await p.screenshot({ path: D + 'acctui_390.png' });
  await p.setViewportSize({ width: 1100, height: 900 }); await p.waitForTimeout(300); await p.screenshot({ path: D + 'acctui_1100.png' });
  await p.setViewportSize({ width: 390, height: 900 });
  // 9. access: the role comes from the saved user record, so a cashier cannot open it (and a changed session cannot raise it)
  const denied = await p.evaluate(() => { const T = window.__t; T.closeModal(); const me = T.State.users.find(u => u.id === T.State.session.userId); const role = me.role; me.role = 'cashier'; let opened = false; try { T.openAccountantSheet(); opened = !!document.querySelector('#acPer'); } catch (e) { } me.role = role; T.closeModal(); return opened; });
  ck('a cashier cannot open the Accountant', denied === false);
  const denied2 = await p.evaluate(async () => { const T = window.__t; T.closeModal(); const me = T.State.users.find(u => u.id === T.State.session.userId); const role = me.role; me.role = 'cashier'; T.State.session.role = 'owner'; let r = null; try { r = await T.acctExportRecords(); } catch (e) { r = 'err'; } me.role = role; return r === null; });
  ck('a cashier cannot save a copy of the records either', denied2 === true);
  ck('no page errors', errs.length === 0, errs);
  console.log(fail ? 'FAILED ' + fail : 'ALL OK'); await b.close(); process.exit(fail ? 1 : 0);
})();
