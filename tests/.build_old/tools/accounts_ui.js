/* ============================ ACCOUNTANT PAGE (rebuilt) ============================
 * One calm page: books check, profit or loss, reports to keep, things to do, other documents, kept months,
 * records and safety tools, settings. It only READS the books and builds documents from them. The books themselves
 * (acctGather, acctBuild, acctView, the monthly filing and its hash chain) are untouched, so every figure here is
 * the same cent exact figure the rest of Pesa uses.
 *
 * Safety rules for this block:
 *  1. Owner and manager only, checked again before every action.
 *  2. Nothing here changes, deletes or re-saves a kept month. Only the existing Re-run month sheet can, and it keeps history.
 *  3. Every report gets a number and two fingerprints (the records it used, and the figures printed). A register of
 *     reports made is kept in the settings, chained by hash, so a report can be checked later.
 *  4. Verify and copy tools never write to the books. Checking a saved copy only reads the file.
 *  5. Any failure shows one calm message. Records are never touched by a failed report.
 * No dash characters in the wording, to match the rest of the app.
 */
var ACCT_REG_MAX = 300;
var ACCT_COPY_MAX_BYTES = 25 * 1024 * 1024;
var _acctPlBusy = false;

function acctGuard(){ if(!isManagerOrOwner()){ toast(tr('Accountant is for owners and managers')); return false; } return true; }
function acctReports(){ var r = State.settings.acctReports; return Array.isArray(r) ? r : []; }
function acctDayMs(k){ var p = String(k).split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
function acctAddDays(k, n){ var d = new Date(acctDayMs(k) + n * 86400000); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); }
function acctSpanDays(from, to){ return Math.round((acctDayMs(to) - acctDayMs(from)) / 86400000) + 1; }
function acctPrevRange(from, to){ var n = acctSpanDays(from, to), pt = acctAddDays(from, -1); return { from:acctAddDays(pt, -(n - 1)), to:pt, days:n }; }
function acctRangeText(from, to){ return acctDateText(from) + ' ' + tr('to') + ' ' + acctDateText(to); }
function acctPct1(part, whole){ if(!whole) return ''; var t = Math.round(part * 1000 / whole); var neg = t < 0; t = Math.abs(t); return (neg ? '-' : '') + Math.floor(t / 10) + '.' + (t % 10) + '%'; }

function acctPeriodChoices(){
  var now = new Date(), today = todayKey(now), cur = periodKeyOf(now);
  var py = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(), pm = now.getMonth() === 0 ? 12 : now.getMonth();
  var prev = py + '-' + String(pm).padStart(2, '0');
  var q = Math.floor(now.getMonth() / 3) * 3 + 1;
  return [
    { k:'month', t:'This month', from:cur + '-01', to:today },
    { k:'last', t:'Last month', from:prev + '-01', to:acctMonthEnd(prev) },
    { k:'quarter', t:'This quarter', from:now.getFullYear() + '-' + String(q).padStart(2, '0') + '-01', to:today },
    { k:'year', t:'This year', from:now.getFullYear() + '-01-01', to:today },
    { k:'custom', t:'Pick dates' }
  ];
}

/* ---------- the profit or loss picture ---------- */
function acctHeroHtml(v, prevV, prevR){
  var P = v.pl, net = P.net, loss = net < 0, col = loss ? 'var(--danger)' : 'var(--success)';
  var word = net === 0 ? tr('Break even') : loss ? tr('Loss') : tr('Profit');
  var h = '<div class="ac-hero" role="status" aria-live="polite" style="border-color:' + col + ';">' +
    '<div class="ac-hero-l" style="color:' + col + ';">' + esc(word) + '</div>' +
    '<div class="ac-hero-n num" style="color:' + col + ';">' + esc(acctM(Math.abs(net))) + '</div>' +
    '<div class="ac-hero-s">' + esc(acctRangeText(v.from, v.to)) + '</div>';
  if(P.revenue > 0 && net > 0) h += '<div class="ac-hero-s">' + esc(tr('That is') + ' ' + acctPct1(net, P.revenue) + ' ' + tr('of your sales')) + '</div>';
  if(prevV){
    var d = net - prevV.pl.net, dw = d === 0 ? tr('The same as') : d > 0 ? tr('Up') + ' ' + acctM(d) + ' ' + tr('on') : tr('Down') + ' ' + acctM(-d) + ' ' + tr('on');
    h += '<div class="ac-hero-c">' + esc(dw + ' ' + tr('the') + ' ' + prevR.days + ' ' + (prevR.days === 1 ? tr('day') : tr('days')) + ' ' + tr('before') + ' (' + (prevV.pl.net < 0 ? tr('loss') + ' ' : '') + acctM(Math.abs(prevV.pl.net)) + ')') + '</div>';
  }
  return h + '</div>';
}
function acctBreakdownHtml(v){
  var P = v.pl;
  function row(l, val, cls, indent){ return '<div class="tillrow' + (cls ? ' ' + cls : '') + '"><span class="l"' + (indent ? ' style="padding-left:' + indent + 'px;"' : '') + '>' + esc(l) + '</span><span class="v num">' + esc(val) + '</span></div>'; }
  var h = '<div class="tillcard">' +
    row(tr('Money coming in'), '', 'ac-grp') +
    row(tr('Sales, excluding VAT'), acctM(P.revenue), '', 12) +
    row(tr('Money going out'), '', 'ac-grp') +
    row(tr('Cost of the goods you sold'), acctM(-P.cogs), '', 12) +
    (P.wastage ? row(tr('Stock lost or wasted'), acctM(-P.wastage), '', 12) : '') +
    row(tr('Gross profit'), acctM(P.grossProfit), 'ac-sub') +
    row(tr('Running costs'), '', 'ac-grp');
  if(!P.expenses.length) h += row(tr('None recorded'), acctM(0), '', 12);
  P.expenses.forEach(function(r){ h += row(r.name, acctM(-r.amount), '', 12); });
  h += row(tr('Total running costs'), acctM(-P.opex), 'ac-sub') + row(P.net < 0 ? tr('Net loss') : tr('Net profit'), acctM(Math.abs(P.net)), 'grand') + '</div>';
  return h;
}
/** A simple bar: how each N$ of sales is split between what it cost you and what you kept. */
function acctBarHtml(v){
  var P = v.pl; if(P.revenue <= 0) return '';
  var cost = P.cogs + P.wastage, run = P.opex, keep = P.net > 0 ? P.net : 0;
  var pc = Math.max(0, Math.round(cost * 100 / P.revenue)), pr = Math.max(0, Math.round(run * 100 / P.revenue)), pk = Math.max(0, Math.round(keep * 100 / P.revenue));
  var over = P.net < 0, total = pc + pr + pk, sc = total > 100 ? 100 / total : 1;
  function seg(p, c, label){ return p > 0 ? '<span style="width:' + (p * sc) + '%;background:' + c + ';" title="' + esc(label + ' ' + p + '%') + '"></span>' : ''; }
  var lab = tr('Of every N$100 of sales') + ': ' + tr('goods') + ' ' + pc + ', ' + tr('running costs') + ' ' + pr + ', ' + (over ? tr('so there is a loss') : tr('kept as profit') + ' ' + pk);
  return '<div class="ac-bar-wrap"><div class="ac-bar" role="img" aria-label="' + esc(lab) + '"' + (over ? ' style="outline:2px solid var(--danger);"' : '') + '>' + seg(pc, '#c47f00', tr('Goods')) + seg(pr, '#6b7a99', tr('Running costs')) + seg(pk, 'var(--success)', tr('Kept')) + '</div>' +
    '<div class="ac-key"><span><i style="background:#c47f00;"></i>' + esc(tr('Goods')) + ' ' + pc + '%</span><span><i style="background:#6b7a99;"></i>' + esc(tr('Running costs')) + ' ' + pr + '%</span>' + (over ? '<span><i style="background:var(--danger);"></i>' + esc(tr('Costs are more than sales')) + '</span>' : '<span><i style="background:var(--success);"></i>' + esc(tr('Kept')) + ' ' + pk + '%</span>') + '</div></div>';
}

/* ---------- the profit and loss report (PDF) ---------- */
function acctDrawPlPdf(v, meta){
  var ctor = getJsPDF(); if(!ctor) return null;
  var doc = newPdfDoc(ctor, { unit:'mm', format:'a4' });
  var head = drawDocHeader(doc), pal = head.pal, m = head.margin, W = head.contentW, y = head.y;
  function need(h){ if(y + h > head.limit){ doc.addPage(); y = pdTop(doc, 16); } }
  function sect(t, h){ need(h || 34); pdSection(doc, pal, m, y + 3, W, t); y += 7; }
  function note(text){
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.8); pdSet(doc, 't', pal.muted);
    doc.splitTextToSize(String(tr(text)), W).forEach(function(l){ need(4.5); doc.text(l, m, y); y += 3.9; });
    y += 3;
  }
  function tbl(cols, rows, bold){ need(14); y = pdfTable(doc, { x:m, y:y, width:W, columns:cols, rows:rows, boldRows:bold }); y += 6; }
  function two(rows, bold){ tbl([{ label:tr('Item'), width:W - 50 }, { label:tr('Amount'), width:50, align:'right' }], rows, bold); }
  var P = v.pl, ty = y;
  y = pdTitle(doc, pal, m, y, tr('Profit and Loss report'));
  pdPill(doc, pal, m + W, ty + 1.5, meta.filedMatch ? tr('Matches filed month') : tr('Prepared from records'));
  var gen = new Date(meta.generatedAt);
  y += pdStrip(doc, pal, m, y, W, tr('Report details'), [
    [tr('Business'), meta.shopName], [tr('Period'), acctRangeText(v.from, v.to)], [tr('Report no'), meta.no],
    [tr('Prepared'), fmtDateNice(gen) + ' ' + gen.toLocaleTimeString(uiLocale(), { hour:'2-digit', minute:'2-digit' })]
  ]) + 5;
  note([meta.tin ? tr('TIN') + ' ' + meta.tin : '', meta.vatNumber ? tr('VAT number') + ' ' + meta.vatNumber : tr('Not VAT registered'), meta.generatedBy ? tr('Prepared by') + ' ' + meta.generatedBy : ''].filter(Boolean).join('   |   '));
  need(14); y += pdTotalBar(doc, pal, m, y, W, P.net < 0 ? tr('Net loss') : P.net === 0 ? tr('Break even') : tr('Net profit'), acctM(Math.abs(P.net)), 13) + 6;
  if(P.revenue > 0 && P.net > 0) note(tr('Profit is') + ' ' + acctPct1(P.net, P.revenue) + ' ' + tr('of sales for this period.'));
  sect('Income statement', 70);
  var rows = [[tr('Sales, standard rated'), acctM(P.salesStandard)], [tr('Sales, zero rated (0%)'), acctM(P.salesZero)], [tr('Sales, VAT exempt'), acctM(P.salesExempt)]];
  if(P.salesNonVat) rows.push([tr('Sales, no VAT charged'), acctM(P.salesNonVat)]);
  var ti = rows.length; rows.push([tr('Total sales (excluding VAT)'), acctM(P.revenue)]);
  rows.push([tr('Cost of goods sold'), acctM(-P.cogs)], [tr('Stock wastage and shrinkage'), acctM(-P.wastage)]);
  var gi = rows.length; rows.push([tr('Gross profit'), acctM(P.grossProfit)]);
  P.expenses.forEach(function(r){ rows.push([r.name, acctM(-r.amount)]); });
  rows.push([tr('Total running costs'), acctM(-P.opex)], [P.net < 0 ? tr('Net loss for the period') : tr('Net profit for the period'), acctM(P.net)]);
  two(rows, [ti, gi, rows.length - 2, rows.length - 1]);
  if(meta.prev){
    sect('Compared with the days before', 44);
    var pp = meta.prev, dn = P.net - pp.v.pl.net;
    tbl([{ label:tr('Period'), width:W - 100, wrap:true }, { label:tr('Sales'), width:34, align:'right' }, { label:tr('Net'), width:34, align:'right' }, { label:tr('Change'), width:32, align:'right' }],
      [[acctRangeText(pp.from, pp.to), acctM(pp.v.pl.revenue), acctM(pp.v.pl.net), ''], [acctRangeText(v.from, v.to), acctM(P.revenue), acctM(P.net), (dn > 0 ? '+' : '') + acctM(dn)]], [1]);
  }
  sect('Checks on these figures', 24);
  tbl([{ label:tr('Result'), width:22 }, { label:tr('Check'), width:W - 22, wrap:true }], v.checks.map(function(c){ return [c.level === 'ok' ? tr('Passed') : c.level === 'fail' ? tr('FAILED') : c.level === 'warn' ? tr('Review') : tr('Note'), tr(c.text)]; }));
  sect('How to check this report later', 50);
  note(tr('Report no') + ': ' + meta.no);
  note(tr('Records fingerprint') + ' (SHA-256): ' + meta.fingerprint);
  note(tr('Figures fingerprint') + ' (SHA-256): ' + meta.figuresHash);
  note('In Pesa open Accountant, then Check a report, and type the report number. Pesa finds it in the list of reports made and tells you whether the sales, costs and other records for these dates are still the same as when the report was made. A single changed sale or expense changes the records fingerprint.');
  if(meta.filedHash) note(tr('Filed month record hash') + ' (SHA-256): ' + meta.filedHash);
  sect('Basis of preparation', 60);
  note('Prepared by Pesa from the sales, expenses, supplier invoices and payments, wastage and customer payments recorded in it, on an accrual basis, in Namibia Dollars (N$) to the cent. Profit is not the same as cash in the bank. Cost of goods sold uses the cost price held on each product, so products with no cost price make profit look higher than it is.');
  note('Pesa does not see your bank, fixed assets, loans, payroll taxes, owner drawings, income tax or imports, so those are not in these figures. A registered accountant should review them before they are used for annual financial statements, tax returns or a loan.');
  note('This report is prepared by software. It is not audited or reviewed, and it is to be confirmed with the relevant legal bodies, authorities and entities of Namibia and your accountant. Keep it with your business records.');
  var pages = doc.getNumberOfPages();
  for(var pg = 1; pg <= pages; pg++){
    doc.setPage(pg);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); pdSet(doc, 't', pal.muted);
    doc.text(meta.no + '  |  ' + (meta.shopName || '') + '  |  ' + tr('Page') + ' ' + pg + ' ' + tr('of') + ' ' + pages, m, 271.8);
  }
  return doc;
}
function acctPlCsv(v, meta){
  var P = v.pl, rows = [[tr('Profit and Loss report')], [tr('Business'), meta.shopName], [tr('Period'), v.from + ' ' + tr('to') + ' ' + v.to], [tr('Report no'), meta.no],
    [tr('Records fingerprint'), meta.fingerprint], [tr('Figures fingerprint'), meta.figuresHash], [], [tr('Item'), tr('Amount')],
    [tr('Sales, standard rated'), acctNum(P.salesStandard)], [tr('Sales, zero rated (0%)'), acctNum(P.salesZero)], [tr('Sales, VAT exempt'), acctNum(P.salesExempt)], [tr('Sales, no VAT charged'), acctNum(P.salesNonVat)],
    [tr('Total sales (excluding VAT)'), acctNum(P.revenue)], [tr('Cost of goods sold'), acctNum(-P.cogs)], [tr('Stock wastage and shrinkage'), acctNum(-P.wastage)], [tr('Gross profit'), acctNum(P.grossProfit)]];
  P.expenses.forEach(function(r){ rows.push([r.name, acctNum(-r.amount)]); });
  rows.push([tr('Total running costs'), acctNum(-P.opex)], [P.net < 0 ? tr('Net loss') : tr('Net profit'), acctNum(P.net)]);
  return rows.map(function(r){ return r.map(acctCsvQ).join(','); }).join('\r\n');
}
/** Builds the report for exactly these dates from the books as they are right now. */
async function acctMakePl(from, to){
  var ready = await ensureJsPDF(); if(!ready){ toast(tr('Couldn’t load the PDF engine. Check your connection and try again')); return null; }
  var G = await acctGather(), B = acctBuild(G), v = acctView(G, B, from, to);
  var fp = await acctFingerprint(B, from, to);
  var fh = await sha256Hex(acctStable({ v:ACCT_VERSION, from:from, to:to, fingerprint:fp, pl:v.pl, vatVendor:G.vatVendor }));
  var meta = acctMetaFor(G, null, { from:from, to:to, custom:true });
  meta.no = 'PL-' + from.replace(/-/g, '') + '-' + to.replace(/-/g, '') + '-' + fh.slice(0, 6).toUpperCase();
  meta.fingerprint = fp; meta.figuresHash = fh;
  var key = from.slice(0, 7), filed = State.accountingPeriods.find(function(r){ return r.periodKey === key; });
  if(filed && filed.from === from && filed.to === to){ meta.filedHash = filed.hash; meta.filedMatch = filed.fingerprint === fp; }
  var pr = acctPrevRange(from, to);
  if(B.first && pr.to >= B.first) meta.prev = { from:pr.from, to:pr.to, v:acctView(G, B, pr.from, pr.to) };
  var doc = acctDrawPlPdf(v, meta);
  if(!doc) return null;
  return { doc:doc, v:v, meta:meta, fp:fp, fh:fh };
}
function acctEntryCore(e){ return { v:e.v, no:e.no, from:e.from, to:e.to, issuedAt:e.issuedAt, by:e.by, byId:e.byId, revenue:e.revenue, net:e.net, fingerprint:e.fingerprint, figuresHash:e.figuresHash, how:e.how }; }
/** Adds one line to the register of reports made. The register is chained: each line holds a hash of the line before it. */
async function acctIssueReport(r, how){
  var list = acctReports().slice(), P = r.v.pl;
  if(list.some(function(e){ return e.no === r.meta.no; })){ logAudit('accounts_report', 'accounting', r.meta.no, 'Saved profit and loss report ' + r.meta.no + ' again (' + how + ')'); return; }
  var prev = list.length ? list[list.length - 1].hash : 'GENESIS';
  var core = { v:1, no:r.meta.no, from:r.v.from, to:r.v.to, issuedAt:new Date().toISOString(), by:State.session ? State.session.name : '', byId:State.session ? State.session.userId : null, revenue:P.revenue, net:P.net, fingerprint:r.fp, figuresHash:r.fh, how:how };
  var entry = Object.assign({}, core, { prev:prev });
  entry.hash = await sha256Hex(prev + '\n' + acctStable(core));
  list.push(entry); if(list.length > ACCT_REG_MAX) list = list.slice(-ACCT_REG_MAX);
  btSave({ acctReports:list });
  logAudit('accounts_report', 'accounting', r.meta.no, 'Made profit and loss report ' + r.meta.no + ' for ' + r.v.from + ' to ' + r.v.to + ' (' + how + ')');
}
async function acctDownloadPl(from, to, mode){
  if(!acctGuard() || _acctPlBusy) return;
  _acctPlBusy = true;
  try{
    toast(tr('Preparing documents…'));
    var r = await acctMakePl(from, to); if(!r) return;
    var ok;
    if(mode === 'print'){ printPdfDoc(r.doc); ok = true; }
    else ok = await saveGeneratedPdf(r.doc, 'profit-and-loss-' + from + '-to-' + to + '.pdf', { csv:acctPlCsv(r.v, r.meta) });
    if(ok){ await acctIssueReport(r, mode === 'print' ? 'print' : 'download'); toast(tr('Report made') + ': ' + r.meta.no); }
  }catch(e){ toast(tr('Could not make the report. Your records are not affected.')); }
  finally{ _acctPlBusy = false; }
}

/* ---------- checking: the chain, the register, saved copies ---------- */
async function acctEntryOk(e){ try{ return (await sha256Hex(String(e.prev || 'GENESIS') + '\n' + acctStable(acctEntryCore(e)))) === e.hash; }catch(x){ return false; } }
async function acctRegisterCheck(list){
  var bad = [];
  for(var i = 0; i < list.length; i++){
    if(!(await acctEntryOk(list[i]))) bad.push(list[i].no);
    else if(i > 0 && list[i].prev !== list[i - 1].hash) bad.push(list[i].no);
  }
  return { ok:!bad.length, bad:bad, count:list.length };
}
/** A month is linked to the one before it by hash. A month whose earlier neighbour was re-run still links through that neighbour's history. */
function acctChainCheck(list){
  var breaks = [], notes = [];
  for(var i = 1; i < list.length; i++){
    var rec = list[i], prev = list[i - 1];
    if(rec.prevHash === prev.hash) continue;
    if((prev.history || []).some(function(h){ return h.hash === rec.prevHash; })) continue;
    if(rec.prevHash === 'GENESIS'){ notes.push(rec.periodKey); continue; }
    breaks.push(rec.periodKey);
  }
  return { ok:!breaks.length, breaks:breaks, notes:notes };
}
async function acctVerifyAllData(G, B){
  var list = acctPeriods(), out = { total:list.length, hashBad:[], changed:[], chain:acctChainCheck(list), reg:null };
  for(var i = 0; i < list.length; i++){
    var r = list[i];
    if(!(await acctVerify(r))) out.hashBad.push(r.periodKey);
    if((await acctFingerprint(B, r.from, r.to)) !== r.fingerprint) out.changed.push(r.periodKey);
  }
  out.reg = await acctRegisterCheck(acctReports());
  out.ok = !out.hashBad.length && !out.chain.breaks.length && out.reg.ok;
  return out;
}
function acctResultHtml(kind, title, lines){
  var col = kind === 'ok' ? 'var(--success)' : kind === 'bad' ? 'var(--danger)' : '#c47f00', mark = kind === 'ok' ? '✓' : kind === 'bad' ? '✗' : '!';
  return '<div class="ac-res" style="border-color:' + col + ';"><div class="ac-res-t" style="color:' + col + ';"><b>' + mark + '</b> ' + esc(title) + '</div>' + lines.map(function(l){ return '<div class="ac-res-l">' + esc(l) + '</div>'; }).join('') + '</div>';
}
function acctKeyList(keys){ return keys.map(acctLabelOf).join(', '); }

async function acctExportRecords(){
  if(!acctGuard()) return null;
  var G = await acctGather(), B = acctBuild(G);
  var chk = await acctVerifyAllData(G, B);
  var body = { app:'Pesa', kind:'accounting records', version:ACCT_VERSION, exportedAt:new Date().toISOString(), exportedBy:State.session ? State.session.name : '', shopName:G.shopName, tin:G.tin, vatNumber:G.vatNumber, periods:acctPeriods(), reports:acctReports() };
  var fileHash = await sha256Hex(acctStable(body));
  var out = Object.assign({}, body, { fileHash:fileHash });
  var name = 'pesa-accounting-records-' + todayKey() + '.json';
  var ok = await saveBlobFile(name, new Blob([JSON.stringify(out, null, 1)], { type:'application/json' }));
  if(ok) logAudit('accounts_exported', 'accounting', null, 'Saved a copy of ' + body.periods.length + ' kept month(s) and ' + body.reports.length + ' report(s) (file fingerprint ' + fileHash.slice(0, 12) + ')');
  return ok ? { fileHash:fileHash, months:body.periods.length, reports:body.reports.length, chain:chk } : null;
}
/** Reads a saved copy and checks it. It never writes anything to the books. */
async function acctCheckCopy(file){
  if(!file) return { kind:'warn', title:tr('No file chosen'), lines:[] };
  if(file.size > ACCT_COPY_MAX_BYTES) return { kind:'bad', title:tr('That file is too big to be a Pesa records copy'), lines:[] };
  var txt = await new Promise(function(res, rej){ var fr = new FileReader(); fr.onload = function(){ res(String(fr.result || '')); }; fr.onerror = function(){ rej(new Error('read')); }; fr.readAsText(file); });
  var o; try{ o = JSON.parse(txt); }catch(e){ return { kind:'bad', title:tr('That file is not a Pesa records copy'), lines:[tr('It could not be read as saved records.')] }; }
  if(!o || o.app !== 'Pesa' || o.kind !== 'accounting records' || !Array.isArray(o.periods) || !Array.isArray(o.reports)) return { kind:'bad', title:tr('That file is not a Pesa records copy'), lines:[] };
  var lines = [], bad = 0;
  var claimed = o.fileHash, body = Object.assign({}, o); delete body.fileHash;
  var fh = await sha256Hex(acctStable(body));
  if(fh !== claimed){ bad++; lines.push(tr('The file fingerprint does not match. The file has been changed since it was saved.')); }
  else lines.push(tr('File fingerprint matches') + ': ' + fh.slice(0, 16) + '…');
  var hashBad = [];
  for(var i = 0; i < o.periods.length; i++){ if(!(await acctVerify(o.periods[i]))) hashBad.push(o.periods[i].periodKey); }
  if(hashBad.length){ bad++; lines.push(tr('Months that do not match their hash') + ': ' + acctKeyList(hashBad)); }
  else lines.push(o.periods.length + ' ' + tr('kept month(s) match their hashes.'));
  var ch = acctChainCheck(o.periods.slice().sort(function(a, b){ return a.periodKey < b.periodKey ? -1 : 1; }));
  if(!ch.ok){ bad++; lines.push(tr('The chain between months is broken at') + ': ' + acctKeyList(ch.breaks)); } else lines.push(tr('The chain between months is intact.'));
  var rc = await acctRegisterCheck(o.reports);
  if(!rc.ok){ bad++; lines.push(tr('Reports that do not match') + ': ' + rc.bad.join(', ')); } else lines.push(o.reports.length + ' ' + tr('report(s) in the list are intact.'));
  var now = {}; acctPeriods().forEach(function(r){ now[r.periodKey] = r.hash; });
  var diff = o.periods.filter(function(r){ return now[r.periodKey] && now[r.periodKey] !== r.hash; }).map(function(r){ return r.periodKey; });
  var missing = o.periods.filter(function(r){ return !now[r.periodKey]; }).map(function(r){ return r.periodKey; });
  if(diff.length) lines.push(tr('Different from what Pesa holds now (a month was re-run or changed)') + ': ' + acctKeyList(diff));
  else lines.push(tr('Every month in the file is the same as the one Pesa holds now.') + (missing.length ? ' ' + tr('Not in Pesa now') + ': ' + acctKeyList(missing) : ''));
  return { kind: bad ? 'bad' : diff.length ? 'warn' : 'ok', title: bad ? tr('This copy has a problem') : tr('This copy is intact'), lines:lines };
}
async function acctCheckReport(text){
  var q = String(text || '').trim().toUpperCase();
  if(q.length < 6) return { kind:'warn', title:tr('Type the whole report number'), lines:[tr('It looks like PL, two dates and six letters or numbers.')] };
  var list = acctReports(), hit = list.filter(function(e){ return e.no.toUpperCase() === q || String(e.figuresHash).toUpperCase().indexOf(q) === 0 || String(e.fingerprint).toUpperCase().indexOf(q) === 0; });
  if(!hit.length) return { kind:'bad', title:tr('No report with that number is in the list'), lines:[tr('Reports made on another device appear here after that device has synced. If this report did not come from Pesa, do not rely on it.')] };
  var e = hit[hit.length - 1], lines = [];
  lines.push(tr('Report') + ' ' + e.no + ': ' + acctRangeText(e.from, e.to));
  lines.push(tr('Made') + ' ' + fmtDateTime(e.issuedAt) + (e.by ? ' ' + tr('by') + ' ' + e.by : ''));
  lines.push((e.net < 0 ? tr('Loss') : tr('Profit')) + ' ' + acctM(Math.abs(e.net)) + ', ' + tr('sales') + ' ' + acctM(e.revenue));
  var ok = await acctEntryOk(e), kind = 'ok';
  if(!ok){ kind = 'bad'; lines.push(tr('This line in the list of reports has been changed. Do not rely on it.')); }
  var G = await acctGather(), B = acctBuild(G), fp = await acctFingerprint(B, e.from, e.to);
  if(fp === e.fingerprint) lines.push(tr('The sales, costs and other records for these dates are the same as when the report was made.'));
  else { if(kind === 'ok') kind = 'warn'; lines.push(tr('Records for these dates have changed since the report was made (a sale, expense or other record was added, edited or removed). The report shows what was true then. Make a new report to see the figures today.')); }
  return { kind:kind, title: kind === 'ok' ? tr('This report is genuine and still matches your records') : kind === 'warn' ? tr('This report is genuine, but your records have changed since') : tr('This report cannot be trusted'), lines:lines };
}

var ACCT_CSS2 = '<style>' +
  '.ac-per{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 10px;}' +
  '.ac-per button{border:1px solid var(--border);background:var(--surface);color:inherit;border-radius:999px;padding:8px 14px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;}' +
  '.ac-per button[aria-pressed="true"]{background:var(--primary);color:var(--primary-contrast,#fff);border-color:var(--primary);}' +
  '.ac-hero{border:2px solid var(--border);border-radius:20px;padding:18px 16px;background:var(--surface);text-align:center;margin-bottom:12px;}' +
  '.ac-hero-l{font-size:13px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;}' +
  '.ac-hero-n{font-size:34px;font-weight:800;line-height:1.15;margin:4px 0 6px;word-break:break-word;}' +
  '.ac-hero-s{font-size:12.5px;color:var(--text-muted);line-height:1.45;}.ac-hero-c{font-size:13px;margin-top:8px;font-weight:600;}' +
  '.ac-bar-wrap{margin:2px 0 12px;}.ac-bar{display:flex;height:14px;border-radius:999px;overflow:hidden;background:var(--surface-2,#e8ece6);}.ac-bar span{display:block;height:100%;}' +
  '.ac-key{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--text-muted);margin-top:6px;}.ac-key i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:baseline;}' +
  '.ac-grp{font-weight:800;font-size:12.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;}.ac-sub .l,.ac-sub .v{font-weight:700;}' +
  '.ac-btns{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0;}@media (max-width:420px){.ac-btns{grid-template-columns:1fr;}}' +
  '.ac-res{border:2px solid var(--border);border-radius:14px;padding:12px 13px;margin-top:10px;background:var(--surface);}.ac-res-t{font-weight:700;font-size:14px;line-height:1.35;}.ac-res-l{font-size:12.5px;line-height:1.45;margin-top:5px;word-break:break-word;}' +
  '.ac-reg{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid var(--border);font-size:12.5px;}.ac-reg:first-child{border-top:0;}.ac-reg b{font-size:13px;}' +
  '.ac-safe{border:1px dashed var(--border);border-radius:14px;padding:12px 13px;margin:8px 0;font-size:12.5px;line-height:1.5;color:var(--text-muted);}' +
  '</style>';

/** The Accountant page. */
function openAccountantSheet(){
  if(!acctGuard()) return;
  var op = State.settings.acctOpening;
  var last = acctPeriods().slice(-1)[0], cat = acctVatCategory();
  var choices = acctPeriodChoices(), cur = periodKeyOf(new Date());
  function secTitle(t, extra){ return '<div class="section-title"><span>' + tr(t) + '</span>' + (extra || '') + '</div>'; }
  var html = ACCT_CSS + ACCT_CSS2 + '<div class="sheet-head" style="display:flex;align-items:center;gap:10px;"><img src="' + ICON3D.accountant + '" alt="" width="44" height="44" draggable="false" style="display:block;flex:none;"><h2 style="margin:0;">' + tr('Accountant') + '</h2></div>' +
    '<div class="ac-status"><div class="ac-dot" id="acDot">…</div><div><div class="ac-st-t" id="acStatus">' + tr('Checking…') + '</div>' +
      '<div class="ac-st-s">' + tr('Books start') + ': ' + esc(op && op.date ? acctDateText(op.date) : tr('First record in Pesa')) + '<br>' + tr('Latest month filed') + ': ' + esc(last ? acctLabelOf(last.periodKey) : tr('none yet')) + '</div></div></div>' +
    secTitle('Profit or loss') +
    '<div class="ac-per" id="acPer" role="group" aria-label="' + esc(tr('Choose the period')) + '">' + choices.map(function(c){ return '<button type="button" data-acper="' + c.k + '" aria-pressed="false">' + esc(tr(c.t)) + '</button>'; }).join('') + '</div>' +
    '<div id="acCustom" style="display:none;"><div class="field-row"><div class="field"><label>' + tr('From') + '</label><input id="acFrom" type="date" max="' + todayKey() + '" value="' + cur + '-01"></div><div class="field"><label>' + tr('To') + '</label><input id="acTo" type="date" max="' + todayKey() + '" value="' + todayKey() + '"></div><button class="btn btn-accent" id="acShow" type="button" style="align-self:flex-end;">' + tr('Show') + '</button></div></div>' +
    '<div id="acHero"><div class="ac-hero"><div class="ac-hero-s">' + tr('Working out your figures…') + '</div></div></div>' +
    '<div id="acBar"></div><div id="acBreak"></div><div id="acNotes"></div>' +
    '<div class="ac-help">' + tr('Profit is your sales less the cost of what you sold and your running costs. It is not the same as cash in the bank.') + '</div>' +
    secTitle('Make a report to keep') +
    '<div class="ac-help">' + tr('A Profit and Loss report for the dates above. Each report gets a number and a fingerprint, and Pesa keeps a list of the reports you make so you can check them later.') + '</div>' +
    '<div class="ac-btns"><button class="btn btn-primary" id="acPlPdf" type="button" disabled>' + tr('Save the report') + '</button><button class="btn btn-ghost" id="acPlPrint" type="button" disabled>' + tr('Print the report') + '</button></div>' +
    '<div id="acSmart"></div>' +
    secTitle('More documents') +
    ACCT_DOCS.map(function(d){ return '<button type="button" class="ac-doc" data-acdoc="' + d.k + '"><span class="ic">' + acctDocIcon(d) + '</span><span class="tx"><span class="nm" style="display:block;">' + tr(d.t) + '</span><span class="ds" style="display:block;">' + tr(d.d) + '</span></span></button>'; }).join('') +
    secTitle('Filed months', '<button class="ac-link" id="acFile" type="button">' + tr('File missing months') + '</button>') +
    '<div class="ac-help">' + tr('Each finished month is filed here automatically the first time the owner or a manager opens Pesa after month end. A filed month is never silently replaced.') + '</div>' +
    '<div id="acList">' + acctListHtml(null) + '</div>' +
    secTitle('Reports you made') +
    '<div id="acRegList"></div>' +
    '<div class="field" style="margin-top:8px;"><label>' + tr('Check a report') + '</label><div class="field-row"><div class="field"><input id="acChkNo" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="PL-20261001-20261031-A1B2C3"></div><button class="btn btn-accent" id="acChkGo" type="button" style="align-self:flex-start;">' + tr('Check') + '</button></div></div>' +
    '<div id="acChkOut"></div>' +
    secTitle('Keep your records safe') +
    '<div class="ac-safe">' + tr('Records live on this device and sync to your other devices if Advanced Pesa Connection is on. Save a copy now and then in a safe place, for example a folder that backs up to cloud storage. A copy carries a fingerprint, so you can prove later that it has not been changed.') + '</div>' +
    '<div class="ac-btns"><button class="btn btn-ghost" id="acVerifyAll" type="button">' + tr('Check all records now') + '</button><button class="btn btn-ghost" id="acExport" type="button">' + tr('Save a copy of all records') + '</button></div>' +
    '<div class="field"><label>' + tr('Check a saved copy') + '</label><input id="acCopyFile" type="file" accept="application/json,.json"></div>' +
    '<div id="acSafeOut"></div>' +
    secTitle('Settings') +
    '<div class="tillcard" style="padding:4px 16px;">' +
      '<div class="ac-set"><div><div class="l">' + tr('Opening balances') + '</div><div class="s">' + tr('What the business had on the day you started recording in Pesa.') + '</div></div>' +
        (isOwner() ? '<button class="btn btn-ghost" id="acOpen" type="button">' + tr('Change') + '</button>' : '<span class="s">' + tr('Owner only') + '</span>') + '</div>' +
      '<div class="ac-set"><div><div class="l">' + tr('Your VAT category') + '</div><div class="s">' + tr('Check your VAT registration certificate or ITAS.') + '</div></div>' +
        '<select id="acSetVat"><option value="">' + tr('Choose') + '</option><option value="A"' + (cat === 'A' ? ' selected' : '') + '>A</option><option value="B"' + (cat === 'B' ? ' selected' : '') + '>B</option></select></div>' +
    '</div>' +
    '<div class="rep-note" style="margin-top:12px;">' + tr('Pesa does not see your bank, fixed assets, loans, payroll taxes, owner drawings or income tax. These documents support your records and your accountant. They are not audited and are to be confirmed with the relevant legal bodies, authorities and entities of Namibia and your accountant.') + '</div>';
  var ov = openSheet(html);
  var S = { G:null, B:null, status:null, per:'month', from:choices[0].from, to:choices[0].to, v:null };
  function alive(){ return document.body.contains(ov); }
  function $(id){ return ov.querySelector(id); }

  function paintRegister(){
    var list = acctReports().slice().reverse().slice(0, 8);
    $('#acRegList').innerHTML = list.length ? '<div class="tillcard" style="padding:4px 14px;">' + list.map(function(e){
      return '<div class="ac-reg"><div><b>' + esc(e.no) + '</b><div style="color:var(--text-muted);">' + esc(acctRangeText(e.from, e.to)) + '</div></div><div style="text-align:right;"><div class="num" style="color:var(--' + (e.net < 0 ? 'danger' : 'success') + ');">' + esc((e.net < 0 ? tr('Loss') : tr('Profit')) + ' ' + acctM(Math.abs(e.net))) + '</div><div style="color:var(--text-muted);">' + esc(fmtDateNice(e.issuedAt)) + '</div></div></div>';
    }).join('') + '</div>' : '<div class="ac-help">' + tr('No reports made yet. The reports you save or print appear here.') + '</div>';
  }
  function paintPeriod(){
    var from = S.from, to = S.to;
    if(!S.G){ return; }
    try{
      var v = acctView(S.G, S.B, from, to), pr = acctPrevRange(from, to), pv = (S.B.first && pr.to >= S.B.first) ? acctView(S.G, S.B, pr.from, pr.to) : null;
      S.v = v;
      $('#acHero').innerHTML = acctHeroHtml(v, pv, pr);
      $('#acBar').innerHTML = acctBarHtml(v);
      $('#acBreak').innerHTML = acctBreakdownHtml(v);
      var notes = v.checks.filter(function(c){ return c.level === 'fail' || c.level === 'warn'; });
      $('#acNotes').innerHTML = notes.length ? '<div class="section-title" style="margin-top:12px;"><span>' + tr('Things that affect these figures') + '</span></div><div class="tillcard" style="padding:6px 14px;">' + notes.map(acctCheckHtml).join('') + '</div>' : '';
      $('#acPlPdf').disabled = false; $('#acPlPrint').disabled = false;
    }catch(e){
      S.v = null; $('#acHero').innerHTML = '<div class="ac-hero"><div class="ac-hero-s">' + tr('Could not work out the figures. Your records are safe.') + '</div></div>'; $('#acBar').innerHTML = ''; $('#acBreak').innerHTML = ''; $('#acNotes').innerHTML = '';
      $('#acPlPdf').disabled = true; $('#acPlPrint').disabled = true;
    }
  }
  function setPer(k){
    var c = choices.filter(function(x){ return x.k === k; })[0]; if(!c) return;
    S.per = k;
    ov.querySelectorAll('[data-acper]').forEach(function(b){ b.setAttribute('aria-pressed', b.getAttribute('data-acper') === k ? 'true' : 'false'); });
    $('#acCustom').style.display = k === 'custom' ? 'block' : 'none';
    if(k !== 'custom'){ S.from = c.from; S.to = c.to; paintPeriod(); }
  }
  ov.querySelectorAll('[data-acper]').forEach(function(b){ b.addEventListener('click', function(){ setPer(b.getAttribute('data-acper')); }); });
  $('#acShow').addEventListener('click', function(){
    var f = $('#acFrom').value, t = $('#acTo').value;
    if(!f || !t || f > t){ toast(tr('Choose a start date on or before the end date')); return; }
    if(t > todayKey()) t = todayKey();
    S.from = f; S.to = t; paintPeriod();
  });
  $('#acPlPdf').addEventListener('click', function(){ if(S.v) acctDownloadPl(S.v.from, S.v.to, 'save').then(function(){ if(alive()) paintRegister(); }); });
  $('#acPlPrint').addEventListener('click', function(){ if(S.v) acctDownloadPl(S.v.from, S.v.to, 'print').then(function(){ if(alive()) paintRegister(); }); });

  function wireList(){
    ov.querySelectorAll('[data-acct-act]').forEach(function(el){
      function go(){
        var card = el.closest('[data-acct]'), rec = card && State.accountingPeriods.find(function(r){ return r.periodKey === card.getAttribute('data-acct'); });
        if(!rec) return;
        var a = el.getAttribute('data-acct-act');
        if(a === 'pdf') acctDownloadPack(rec);
        else if(a === 'csv') acctDownloadJournal(rec.from, rec.to, rec);
        else if(a === 'tb') acctDownloadTb(rec);
        else if(a === 'view') openAcctDetailSheet(rec, S.status && S.status[rec.periodKey]);
      }
      el.addEventListener('click', go);
      if(el.getAttribute('role') === 'button') el.addEventListener('keydown', function(e){ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); go(); } });
    });
  }
  function paintList(){ $('#acList').innerHTML = acctListHtml(S.status); wireList(); }
  wireList(); paintRegister(); setPer('month');
  ov.querySelectorAll('[data-acdoc]').forEach(function(b){ b.addEventListener('click', function(){ openAcctDocSheet(b.getAttribute('data-acdoc')); }); });
  var sv = $('#acSetVat'); if(sv) sv.addEventListener('change', function(){ if(!acctGuard()) return; btSave({ vatCategory:sv.value || null }); toast(tr('Saved')); });

  acctComputeStatus().then(function(r){
    if(!alive()) return;
    S.status = r.status; S.G = r.G; S.B = r.B;
    var bad = Object.keys(r.status).filter(function(k){ return r.status[k].verified === false; }).length;
    var chg = Object.keys(r.status).filter(function(k){ return r.status[k].changed; }).length;
    var chain = acctChainCheck(acctPeriods()), cur2 = periodKeyOf(new Date());
    var v = acctView(r.G, r.B, r.B.first || cur2 + '-01', r.B.last || todayKey());
    var fails = v.checks.filter(function(c){ return c.level === 'fail'; }).length, warns = v.checks.filter(function(c){ return c.level === 'warn'; });
    var lvl = (bad || fails || !chain.ok) ? 'bad' : (chg || warns.length) ? 'warn' : 'ok';
    $('#acDot').className = 'ac-dot ' + lvl; $('#acDot').textContent = lvl === 'ok' ? '✓' : lvl === 'warn' ? '!' : '✗';
    $('#acStatus').textContent = bad ? bad + ' ' + tr('hash mismatch') : !chain.ok ? tr('Chain between months is broken') : fails ? tr('Failed') : chg ? chg + ' ' + tr('month(s) changed since filing') : warns.length ? warns.length + ' ' + tr('to review') : tr('All passed');
    var Sm = acctSmart(r.G, r.B, v); $('#acSmart').innerHTML = acctSmartHtml(Sm);
    ov.querySelectorAll('[data-acsa]').forEach(function(b){ b.addEventListener('click', function(){
      var x = Sm.todo[+b.getAttribute('data-acsa')];
      if(x.act === 'file') $('#acFile').click();
      else if(x.act === 'vatcat'){ var sel = $('#acSetVat'); if(sel){ sel.scrollIntoView({ block:'center' }); sel.focus(); } }
      else if(x.act === 'opening'){ closeModal(); openAcctOpeningSheet(); }
      else if(x.act === 'products'){ closeModal(); setTab('stock'); }
      else if(x.act === 'vatdone'){ var m = Object.assign({}, State.settings.vatDone || {}); m[x.ref] = todayKey(); btSave({ vatDone:m }); toast(tr('Marked as submitted')); closeModal(); openAccountantSheet(); }
    }); });
    paintList(); paintPeriod();
  }, function(){ if(!alive()) return; $('#acStatus').textContent = tr('Could not check'); $('#acHero').innerHTML = '<div class="ac-hero"><div class="ac-hero-s">' + tr('Could not work out the figures. Your records are safe.') + '</div></div>'; });

  $('#acFile').addEventListener('click', async function(){
    if(!acctGuard()) return;
    var b = $('#acFile'); b.disabled = true;
    try{ var n = await acctFileMissing('manual'); toast(n ? n + ' ' + tr('month(s) filed') : tr('Every finished month already has a pack')); }catch(e){ toast(tr('Could not file the months')); }
    b.disabled = false; closeModal(); openAccountantSheet();
  });
  var ob = $('#acOpen'); if(ob) ob.addEventListener('click', function(){ closeModal(); openAcctOpeningSheet(); });

  function show(id, r){ $(id).innerHTML = acctResultHtml(r.kind, r.title, r.lines || []); }
  $('#acChkGo').addEventListener('click', async function(){
    if(!acctGuard()) return;
    try{ show('#acChkOut', await acctCheckReport($('#acChkNo').value)); }catch(e){ show('#acChkOut', { kind:'warn', title:tr('Could not check that report'), lines:[tr('Nothing was changed.')] }); }
  });
  $('#acChkNo').addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); $('#acChkGo').click(); } });
  $('#acVerifyAll').addEventListener('click', async function(){
    if(!acctGuard()) return;
    var b = $('#acVerifyAll'); b.disabled = true;
    try{
      var G = await acctGather(), B = acctBuild(G), o = await acctVerifyAllData(G, B), lines = [];
      lines.push(o.total + ' ' + tr('kept month(s) checked.'));
      lines.push(o.hashBad.length ? tr('Months that do not match their hash') + ': ' + acctKeyList(o.hashBad) : tr('Every kept month matches its hash.'));
      lines.push(o.chain.ok ? tr('The chain between months is intact.') : tr('The chain between months is broken at') + ': ' + acctKeyList(o.chain.breaks));
      lines.push(o.reg.ok ? o.reg.count + ' ' + tr('report(s) in the list are intact.') : tr('Reports that do not match') + ': ' + o.reg.bad.join(', '));
      lines.push(o.changed.length ? tr('Records changed since filing') + ': ' + acctKeyList(o.changed) : tr('No records have changed since their months were filed.'));
      var kind = o.ok ? (o.changed.length ? 'warn' : 'ok') : 'bad';
      show('#acSafeOut', { kind:kind, title: o.ok ? (o.changed.length ? tr('Intact, but some records changed since filing') : tr('All records are intact')) : tr('A problem was found'), lines:lines });
      logAudit('accounts_verified', 'accounting', null, 'Checked all accounting records: ' + (o.ok ? 'intact' : 'problem found') + ', ' + o.total + ' month(s), ' + o.reg.count + ' report(s)');
    }catch(e){ show('#acSafeOut', { kind:'warn', title:tr('Could not check the records'), lines:[tr('Nothing was changed.')] }); }
    b.disabled = false;
  });
  $('#acExport').addEventListener('click', async function(){
    if(!acctGuard()) return;
    var b = $('#acExport'); b.disabled = true;
    try{
      var r = await acctExportRecords();
      if(r) show('#acSafeOut', { kind: r.chain.ok ? 'ok' : 'bad', title: tr('Copy saved'), lines:[r.months + ' ' + tr('kept month(s) and') + ' ' + r.reports + ' ' + tr('report(s) saved.'), tr('File fingerprint') + ': ' + r.fileHash, tr('Write the fingerprint down or keep it with the file. Anyone can later check the file here to see that it has not been changed.')] });
    }catch(e){ show('#acSafeOut', { kind:'warn', title:tr('Could not save the copy'), lines:[tr('Nothing was changed.')] }); }
    b.disabled = false;
  });
  $('#acCopyFile').addEventListener('change', async function(){
    if(!acctGuard()) return;
    var f = this.files && this.files[0];
    try{ show('#acSafeOut', await acctCheckCopy(f)); }catch(e){ show('#acSafeOut', { kind:'warn', title:tr('Could not read that file'), lines:[tr('Nothing was changed.')] }); }
    this.value = '';
  });
}
