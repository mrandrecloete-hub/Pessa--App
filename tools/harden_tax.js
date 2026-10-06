/* ============================== MONEY AND TAX CORE ==============================
 * Money is added up as whole cents so totals never drift. VAT rates are configuration with an effective date, and
 * every sale keeps a snapshot of the rule it was made under, so changing the rate later never rewrites history.
 * Pesa records and calculates tax for the owner. It is not connected to NamRA and does not claim approval. */
var TAX_DISCLAIMER = 'Pesa provides business and tax-recording tools. It does not replace professional tax advice and does not claim NamRA approval unless expressly confirmed by NamRA.';
var ERECORD_NOTE = 'Electronic records and signatures are subject to applicable Namibian law and the specific requirements of the transaction.';
var TAX_CATS = ['STANDARD', 'ZERO_RATED', 'EXEMPT', 'NON_VAT'];
var TAX_CAT_LABEL = { STANDARD:'Standard rated', ZERO_RATED:'Zero rated (0%)', EXEMPT:'VAT exempt', NON_VAT:'Not a VAT item' };

/* ---- whole cent money ---- */
function mC(x){ var v = Number(x); if(!isFinite(v)) return 0; return Math.round(Math.abs(v) * 100 + 1e-7) * (v < 0 ? -1 : 1); }
function mF(c){ return c / 100; }
function mSum(list, fn){ var t = 0; (list || []).forEach(function(x){ t += mC(fn ? fn(x) : x); }); return t / 100; }
function mMul(price, qty){ return mC(Number(price) * Number(qty)); }
function mDivRound(n, d){ var a = Math.abs(n), q = Math.floor(a / d), r = a - q * d; if(r * 2 >= d) q++; return n < 0 ? -q : q; }
function mRound2(x){ return mC(x) / 100; }

/** A YYYY-MM-DD day from either a date key or an ISO time (local day). */
function taxDayOf(v){ v = String(v || ''); return v.indexOf('T') > -1 ? (acctDK(v) || todayKey()) : (v.slice(0, 10) || todayKey()); }

/* ---- configuration with versions ---- */
function taxConfig(){
  var c = State.settings && State.settings.taxConfig;
  if(c && Array.isArray(c.versions) && c.versions.length) return c;
  var legacy = State.settings && State.settings.vatRate != null ? Number(State.settings.vatRate) : 15;
  return { versions:[{ v:1, effective:'2000-01-01', vatRate:isFinite(legacy) ? legacy : 15, reason:'Namibian standard VAT rate', by:'', at:'' }], vatRegistered:undefined, registeredFrom:'' };
}
function taxVersions(){ return taxConfig().versions.slice().sort(function(a, b){ return String(a.effective).localeCompare(String(b.effective)) || a.v - b.v; }); }
/** The rate, its version number and its start date that apply to a given day (YYYY-MM-DD). */
function taxRateAt(dateKey){
  var vs = taxVersions(), pick = vs[0], dk = String(dateKey || todayKey()).slice(0, 10);
  vs.forEach(function(v){ if(String(v.effective) <= dk) pick = v; });
  var rate = Number(pick.vatRate); if(!isFinite(rate) || rate < 0) rate = 0;
  return { rate:rate, bp:Math.round(rate * 100), v:pick.v, effective:pick.effective };
}
function taxRegisteredOn(dateKey){
  var c = taxConfig(), reg = typeof c.vatRegistered === 'boolean' ? c.vatRegistered : !!(State.company && String(State.company.vatNumber || '').trim());
  if(!reg) return false;
  if(c.registeredFrom && dateKey && String(dateKey).slice(0, 10) < c.registeredFrom) return false;
  return true;
}
/** Adds a new rate. The old versions stay, so earlier sales and filed months keep the rate they were made under. */
function taxAddVersion(rate, effective, reason){
  var c = JSON.parse(JSON.stringify(taxConfig())), vs = taxVersions(), last = vs[vs.length - 1];
  rate = Number(rate);
  if(!isFinite(rate) || rate < 0 || rate > 30) throw new Error('RATE_RANGE');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(effective))) throw new Error('DATE');
  if(String(effective) <= String(last.effective) && last.effective !== '2000-01-01') throw new Error('DATE_ORDER');
  var filed = taxLastFiledDate();
  if(filed && String(effective) <= filed) throw new Error('PERIOD_FILED');
  var nv = { v:(last ? last.v : 0) + 1, effective:String(effective), vatRate:rate, reason:String(reason || '').slice(0, 200), by:State.session ? State.session.name : '', at:new Date().toISOString() };
  c.versions.push(nv);
  btSave(nv.effective <= todayKey() ? { taxConfig:c, vatRate:rate } : { taxConfig:c });
  logAudit('update', 'tax', null, 'VAT rate version ' + nv.v + ': ' + rate + '% from ' + nv.effective + (nv.reason ? ' (' + nv.reason + ')' : ''));
  return nv;
}
function taxLastFiledDate(){
  var last = '';
  (State.accountingPeriods || []).forEach(function(p){ if(p && p.to && String(p.to) > last) last = String(p.to); });
  return last;
}
function taxSetRegistration(registered, from){
  var c = JSON.parse(JSON.stringify(taxConfig()));
  c.vatRegistered = !!registered; c.registeredFrom = registered ? String(from || '').slice(0, 10) : '';
  btSave({ taxConfig:c });
  logAudit('update', 'tax', null, 'VAT registration set to ' + (registered ? 'registered' + (c.registeredFrom ? ' from ' + c.registeredFrom : '') : 'not registered'));
}
function isVatVendor(){ return taxRegisteredOn(todayKey()); }

/* ---- the calculation ----
   lines: [{ gross (VAT included, a refund line is negative), cat }]   opt: { dateKey, discount, rate:{bp,v,effective}, registered }
   A negative line or a discount is taken off the positive lines in proportion (largest remainder, to the cent). */
function taxDoc(lines, opt){
  opt = opt || {};
  var dk = String(opt.dateKey || todayKey()).slice(0, 10), rt = opt.rate || taxRateAt(dk), reg = opt.registered != null ? !!opt.registered : taxRegisteredOn(dk);
  var cats = TAX_CATS, pool = [0, 0, 0, 0], disc = mC(opt.discount || 0);
  (lines || []).forEach(function(l){
    var g = mC(l.gross), ci = cats.indexOf(l.cat); if(ci < 0) ci = 0;
    if(!reg) ci = 3;
    if(g < 0) disc += -g; else pool[ci] += g;
  });
  var tot = pool[0] + pool[1] + pool[2] + pool[3];
  if(disc > tot) disc = tot;
  if(disc > 0 && tot > 0){ var cut = acctAllocate(disc, pool); pool = pool.map(function(p, i){ return p - cut[i]; }); }
  var vat = reg ? acctVatInside(pool[0], rt.bp) : 0;
  var out = { v:rt.v, rate:rt.bp / 100, rateBp:rt.bp, effective:rt.effective, registered:reg,
    stdGross:pool[0], stdNet:pool[0] - vat, vat:vat, zero:pool[1], exempt:pool[2], non:pool[3], discount:disc, total:pool[0] + pool[1] + pool[2] + pool[3] };
  return out;
}
/** The same figures in dollars, for storing on a sale or invoice. */
function taxSnap(d){
  return { v:d.v, rate:d.rate, effective:d.effective, registered:d.registered, stdGross:mF(d.stdGross), stdNet:mF(d.stdNet), vat:mF(d.vat), zero:mF(d.zero), exempt:mF(d.exempt), non:mF(d.non), discount:mF(d.discount), total:mF(d.total) };
}
function taxNegate(sn){
  var o = JSON.parse(JSON.stringify(sn));
  ['stdGross', 'stdNet', 'vat', 'zero', 'exempt', 'non', 'discount', 'total'].forEach(function(k){ o[k] = o[k] ? -o[k] : 0; });
  return o;
}
function taxItemCat(it){
  var c = it && (it.cat || it.taxCategory);
  if(c && TAX_CATS.indexOf(c) > -1) return c;
  var p = null;
  if(it && it.productId) p = State.products.find(function(x){ return x.id === it.productId; });
  if(!p && it){ var nm = String(it.desc || it.name || '').trim().toLowerCase(); if(nm) p = State.products.find(function(x){ return String(x.name || '').toLowerCase() === nm; }); }
  return (p && p.taxCategory && TAX_CATS.indexOf(p.taxCategory) > -1) ? p.taxCategory : 'STANDARD';
}
function taxFromItems(items, dateKey, opt){
  var lines = (items || []).map(function(it){
    var g = it.lineTotal != null ? it.lineTotal : mMul(it.unitPrice, it.qty) / 100;
    return { gross:g, cat:taxItemCat(it) };
  });
  return taxDoc(lines, Object.assign({ dateKey:dateKey }, opt || {}));
}
/** The tax figures of a recorded sale: the snapshot made at the time, or (older sales) worked out under the rule of that day. */
function taxOfSale(s){
  if(s && s.tax && s.tax.v != null) return s.tax;
  var dk = s && s.createdAt ? acctDK(s.createdAt) : todayKey();
  var d = taxFromItems(s && s.items, dk);
  var sn = taxSnap(d);
  if(s && s.type === 'refund') sn = taxNegate(sn);
  return sn;
}
function taxPeriod(sales){
  var t = { stdGross:0, stdNet:0, vat:0, zero:0, exempt:0, non:0, total:0 }, c = { stdGross:0, stdNet:0, vat:0, zero:0, exempt:0, non:0, total:0 };
  (sales || []).forEach(function(s){ var x = taxOfSale(s); Object.keys(c).forEach(function(k){ c[k] += mC(x[k]); }); });
  Object.keys(c).forEach(function(k){ t[k] = mF(c[k]); });
  return t;
}
/** Input VAT is only what the supplier invoice showed (entered on the expense). Pesa never assumes an expense carries VAT. */
function taxInputVat(expenses, fromKey, toKey){
  var c = 0;
  (expenses || []).forEach(function(e){
    var dk = acctDK(e.createdAt);
    if(!taxRegisteredOn(dk)) return;
    var v = mC(e.vat || 0); if(v > 0 && v <= mC(e.amount)) c += v;
  });
  return mF(c);
}
/** What a "Tax invoice" must show. The title falls back to "Invoice" when the supplier details are missing. */
function taxInvoiceProblems(draft){
  var p = [], co = State.company || {}, S = State.settings || {};
  if(!taxRegisteredOn(taxDayOf(draft && (draft.dateStr || draft.at)))) return p;
  if(!String(co.vatNumber || '').trim()) p.push('Your VAT registration number');
  if(!String(co.tradingName || co.companyName || '').trim()) p.push('Your business name');
  if(!String(S.businessContact || '').trim() && !String(co.address || co.physicalAddress || '').trim()) p.push('Your business address');
  if(!String(draft && draft.number || '').trim()) p.push('An invoice number');
  if(!(draft && draft.items && draft.items.length)) p.push('At least one line');
  if(!String(draft && draft.billToName || '').trim() || /^customer$/i.test(String(draft.billToName).trim())) p.push('The customer name');
  return p;
}

/* ---- future official integration ----
   Pesa's own tax record (PesaEfd) is internal and never submitted anywhere unless an official, supported NamRA
   connection exists and the owner turns it on. New providers register here without changing the till. */
var TaxIntegration = (function(){
  var providers = [
    { id:'pesa-internal', name:'Pesa internal tax record', official:false, enabled:true, note:'Kept on your own devices. Not sent to NamRA.' },
    { id:'namra-einvoicing', name:'NamRA e-invoicing', official:true, enabled:false, available:false, note:'No official NamRA interface has been published to Pesa. Nothing is submitted.' }
  ];
  function get(id){ return providers.filter(function(p){ return p.id === id; })[0]; }
  return {
    providers:function(){ return providers.slice(); },
    register:function(p){ if(p && p.id && !get(p.id)) providers.push(p); },
    canSubmit:function(id){ var p = get(id); return !!(p && p.official && p.enabled && p.available !== false); },
    submit:function(id, record){
      var p = get(id);
      if(!p || !p.official || !p.enabled || p.available === false) return Promise.reject(new Error('NO_OFFICIAL_INTEGRATION'));
      if(typeof p.send !== 'function') return Promise.reject(new Error('NO_OFFICIAL_INTEGRATION'));
      logAudit('other', 'tax', null, 'Tax record sent to ' + p.name);
      return p.send(record);
    },
    status:function(){ return 'No official NamRA integration is connected. Pesa does not submit anything to NamRA.'; }
  };
})();

/* ---- built in checks (also run by the integrity report and the tests) ---- */
function taxSelfTest(){
  var r = [], eq = function(n, a, b){ r.push({ name:n, ok:a === b, got:a, want:b }); };
  var rate15 = { bp:1500, v:1, effective:'2000-01-01' };
  var d = taxDoc([{ gross:115, cat:'STANDARD' }], { dateKey:'2026-01-01', rate:rate15, registered:true });
  eq('N$115 standard: VAT 15.00', d.vat, 1500); eq('N$115 standard: net 100.00', d.stdNet, 10000);
  d = taxDoc([{ gross:10, cat:'ZERO_RATED' }, { gross:20, cat:'EXEMPT' }, { gross:5, cat:'NON_VAT' }], { rate:rate15, registered:true });
  eq('zero rated, exempt and non VAT carry no VAT', d.vat, 0); eq('they still add up to the total', d.total, 3500);
  d = taxDoc([{ gross:115, cat:'STANDARD' }], { rate:rate15, registered:false });
  eq('a business that is not VAT registered charges no VAT', d.vat, 0); eq('and keeps the full amount', d.non, 11500);
  d = taxDoc([{ gross:100, cat:'STANDARD' }, { gross:100, cat:'ZERO_RATED' }], { rate:rate15, registered:true, discount:20 });
  eq('a discount is shared across the pools', d.total, 18000); eq('standard pool after discount', d.stdGross, 9000); eq('VAT after discount', d.vat, 1174);
  d = taxDoc([{ gross:0.35, cat:'STANDARD' }], { rate:rate15, registered:true });
  eq('rounding: VAT on N$0.35 is 5c', d.vat, 5);
  d = taxDoc([{ gross:0.30, cat:'STANDARD' }], { rate:rate15, registered:true });
  eq('rounding: VAT on N$0.30 is 4c', d.vat, 4);
  var a = 0; for(var i = 0; i < 10; i++) a += mC(0.1); eq('ten times 10c is exactly N$1.00', a, 100);
  eq('10.005 rounds half up to 10.01', mC(10.005), 1001); eq('-10.005 rounds away from zero', mC(-10.005), -1001);
  eq('19.99 x 3 is 59.97', mMul(19.99, 3), 5997);
  var s1 = taxDoc([{ gross:230, cat:'STANDARD' }], { rate:rate15, registered:true }), sn = taxSnap(s1);
  var ref = taxNegate(sn); eq('a refund reverses the VAT exactly', mC(sn.vat) + mC(ref.vat), 0);
  var r16 = taxRateAt('2026-06-30'); eq('the rate on a day uses the version in force that day', typeof r16.rate, 'number');
  return r;
}

/* ---- tax settings ---- */
function openTaxSettingsSheet(){
  if(!secAllow('owner', 'opening tax settings')) return;
  var c = taxConfig(), vs = taxVersions(), now = taxRateAt(todayKey()), reg = taxRegisteredOn(todayKey()), co = State.company || {};
  var html = '<div class="sheet-head"><h2>' + tr('Tax settings') + '</h2></div>' +
    '<div class="banner" style="display:block;">' + esc(tr(TAX_DISCLAIMER)) + '</div>' +
    '<div class="section-title">' + tr('VAT registration') + '</div>' +
    '<div class="field"><label><input type="checkbox" id="txReg"' + (reg ? ' checked' : '') + ' style="width:auto;margin-right:8px;">' + tr('This business is registered for VAT') + '</label></div>' +
    '<div class="field"><label>' + tr('Registered from (optional)') + '</label><input id="txFrom" type="date" value="' + esc(c.registeredFrom || '') + '"></div>' +
    '<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">' + tr('VAT registration number') + ': <b>' + esc(co.vatNumber || tr('not entered, add it under Company details')) + '</b>. ' + tr('When this is off, Pesa charges and shows no VAT, and documents are plain invoices and receipts.') + '</div>' +
    '<div class="actions"><button class="btn btn-ghost btn-block" id="txSaveReg" type="button">' + tr('Save registration') + '</button></div>' +
    '<div class="section-title">' + tr('VAT rate') + '</div>' +
    '<div class="tillcard"><div class="tillrow"><span class="l">' + tr('Standard rate today') + '</span><span class="v num">' + now.rate + '%</span></div><div class="tillrow"><span class="l">' + tr('Configuration version') + '</span><span class="v num">' + now.v + '</span></div></div>' +
    '<div class="rowlist" style="margin-top:8px;">' + vs.slice().reverse().map(function(v){ return '<div class="row" style="cursor:default;"><div class="main"><div class="title">' + v.vatRate + '% ' + tr('from') + ' ' + esc(v.effective === '2000-01-01' ? tr('the start') : v.effective) + '</div><div class="sub">' + tr('Version') + ' ' + v.v + (v.reason ? ' · ' + esc(v.reason) : '') + (v.by ? ' · ' + esc(v.by) : '') + '</div></div></div>'; }).join('') + '</div>' +
    '<div style="font-size:12px;color:var(--text-muted);margin:8px 0;">' + tr('Sales made earlier keep the rate that applied on their day. A new rate only applies from its start date.') + '</div>' +
    '<div class="field-row"><div class="field"><label>' + tr('New rate (%)') + '</label><input id="txRate" type="number" inputmode="decimal" step="0.1" placeholder="15"></div><div class="field"><label>' + tr('Starts on') + '</label><input id="txEff" type="date" value="' + todayKey() + '"></div></div>' +
    '<div class="field"><label>' + tr('Reason (for example the law that changed it)') + '</label><input id="txWhy" maxlength="120"></div>' +
    '<div id="txErr"></div>' +
    '<div class="actions"><button class="btn btn-primary btn-block" id="txAdd" type="button">' + tr('Add new rate') + '</button></div>' +
    '<div class="section-title">' + tr('Tax categories') + '</div>' +
    '<div style="font-size:12.5px;line-height:1.55;">' + TAX_CATS.map(function(k){ return '<b>' + esc(tr(TAX_CAT_LABEL[k])) + '</b>: ' + esc(tr({ STANDARD:'VAT is included in the price and shown on documents.', ZERO_RATED:'VAT registered business, 0% VAT, still recorded as a taxable supply.', EXEMPT:'Exempt supply, no VAT charged and no input VAT claimed on it.', NON_VAT:'Outside VAT, for example sales by a business that is not registered.' }[k])); }).join('<br>') + '</div>' +
    '<div class="section-title">' + tr('Submission to NamRA') + '</div>' +
    '<div class="banner" style="display:block;">' + esc(tr(TaxIntegration.status())) + '<br>' + esc(tr('Reports made by Pesa are labelled Pesa-generated unless the authority has officially accepted them.')) + '</div>' +
    '<div class="actions" style="margin-top:8px;"><button class="btn btn-ghost btn-block" id="txBack" type="button">' + tr('Close') + '</button></div>';
  var ov = openSheet(html);
  ov.querySelector('#txBack').addEventListener('click', closeModal);
  ov.querySelector('#txSaveReg').addEventListener('click', function(){
    var on = ov.querySelector('#txReg').checked, from = ov.querySelector('#txFrom').value;
    secReauth(tr('Confirm with your password to change VAT registration'), function(){ taxSetRegistration(on, from); toast(tr('Saved')); closeModal(); openTaxSettingsSheet(); });
  });
  ov.querySelector('#txAdd').addEventListener('click', function(){
    var err = ov.querySelector('#txErr'), rate = ov.querySelector('#txRate').value, eff = ov.querySelector('#txEff').value, why = ov.querySelector('#txWhy').value;
    function bad(m){ err.innerHTML = '<div class="banner">' + ICONS.warn + '<span>' + esc(m) + '</span></div>'; }
    if(rate === '' || !isFinite(Number(rate)) || Number(rate) < 0 || Number(rate) > 30) return bad(tr('Enter a rate between 0 and 30.'));
    if(!/^\d{4}-\d{2}-\d{2}$/.test(eff)) return bad(tr('Choose the day the new rate starts.'));
    if(!String(why).trim()) return bad(tr('Write the reason, for example the law or notice.'));
    confirmSheet(tr('Add VAT rate') + ' ' + Number(rate) + '%?', tr('From') + ' ' + eff + '. ' + tr('Earlier sales keep the old rate. This is recorded in the activity log.'), tr('Add rate'), function(){
      secReauth(tr('Confirm with your password to change the VAT rate'), function(){
        try{ taxAddVersion(Number(rate), eff, why); toast(tr('New VAT rate saved')); closeModal(); openTaxSettingsSheet(); }
        catch(e){ var m = { RATE_RANGE:'Enter a rate between 0 and 30.', DATE:'Choose the day the new rate starts.', DATE_ORDER:'The new rate must start after the last one.', PERIOD_FILED:'That day is inside a month that was already filed. Choose a later day.' }[e.message]; toast(tr(m || 'Could not save the rate.')); }
      });
    }, false);
  });
}
