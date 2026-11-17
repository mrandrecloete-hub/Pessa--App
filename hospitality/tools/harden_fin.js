/* ============================== FINANCIAL CONTROLS ==============================
 * Receipt numbers that cannot repeat, one tap one sale, refunds and voids that add a reversing record (the original
 * sale is never edited or removed), manager approval with a reason, and a reviewed cash up. */

/* ---- one tap, one action ---- */
var _onceBusy = {};
/** Returns false when the same action is already running. Releases itself after ms or when done() is called. */
function uiOnce(key, ms){
  if(_onceBusy[key]) return false;
  _onceBusy[key] = true;
  setTimeout(function(){ delete _onceBusy[key]; }, ms || 1500);
  return true;
}
function uiDone(key){ delete _onceBusy[key]; }
function uiBusyBtn(btn, ms){
  if(!btn) return true;
  if(btn.getAttribute('data-busy') === '1') return false;
  btn.setAttribute('data-busy', '1'); btn.disabled = true;
  setTimeout(function(){ try{ btn.removeAttribute('data-busy'); btn.disabled = false; }catch(e){} }, ms || 1500);
  return true;
}

/* ---- numbering ---- */
function docDevices(){
  var seen = {};
  (State.sales || []).forEach(function(s){ if(s.deviceId) seen[s.deviceId] = 1; });
  (State.invoices || []).forEach(function(s){ if(s.deviceId) seen[s.deviceId] = 1; });
  seen[Dev.id()] = 1;
  return Object.keys(seen);
}
function docDeviceCode(){ return Dev.id().slice(2, 7).toUpperCase(); }
function docUsedNumbers(){
  var used = {};
  (State.sales || []).forEach(function(s){ if(s.receiptNo) used[s.receiptNo] = 1; });
  (State.invoices || []).forEach(function(r){ if(r.number) used[r.number] = 1; });
  return used;
}
function docSeqKey(kind){ return 'pesa_seq_' + kind + '_' + WS.id + '_' + Dev.id(); }
/** Next unique number for a series (RC receipts, INV invoices). Sequential on this device and never already used. */
function docNumberNext(kind, peek){
  var multi = docDevices().length > 1, used = docUsedNumbers(), n = 0;
  try{ n = parseInt(localStorage.getItem(docSeqKey(kind)) || '0', 10) || 0; }catch(e){}
  if(kind === 'INV'){ var s = Number(State.settings && State.settings.invoiceNextNumber) || 1; if(!multi && s - 1 > n) n = s - 1; }
  var pad = kind === 'INV' ? 4 : 6, num;
  do { n++; num = kind + '-' + (multi ? docDeviceCode() + '-' : '') + String(n).padStart(pad, '0'); } while(used[num] && n < 10000000);
  if(!peek){ try{ localStorage.setItem(docSeqKey(kind), String(n)); }catch(e){} }
  return num;
}

/* ---- what a completed sale records (set once, never edited) ---- */
function saleStamp(sale, items){
  var dk = todayKey();
  sale.receiptNo = docNumberNext('RC');
  sale.deviceId = Dev.id();
  sale.cashierId = State.session ? State.session.userId : null;
  sale.syncStatus = 'pending';
  sale.tax = taxSnap(taxFromItems(items, dk));
  return sale;
}

/* ---- refunds and voids ----
   A refund is a new record with negative amounts that points at the original sale. The original stays exactly as it was. */
function saleRefunds(saleId){ return (State.sales || []).filter(function(s){ return s.refundOf === saleId; }); }
function saleRefundedQty(saleId){
  var m = {};
  saleRefunds(saleId).forEach(function(r){ (r.items || []).forEach(function(it){ var k = it.productId || it.name; m[k] = (m[k] || 0) + Math.abs(Number(it.qty) || 0); }); });
  return m;
}
function saleRefundable(sale){
  if(!sale || sale.type === 'refund' || sale.type === 'void') return [];
  var done = saleRefundedQty(sale.id);
  return (sale.items || []).map(function(it, i){
    var k = it.productId || it.name, left = Math.max(0, (Number(it.qty) || 0) - (done[k] || 0));
    return { idx:i, item:it, left:left };
  }).filter(function(x){ return x.left > 0 && !(Number(x.item.unitPrice) < 0); });
}
function refundBuild(sale, picks, reason, kind, approver){
  var items = [], cost = 0, lines = [];
  picks.forEach(function(p){
    var it = p.item, q = p.qty; if(!(q > 0)) return;
    var gross = mMul(it.unitPrice, q);
    items.push({ productId:it.productId, name:it.name, qty:-q, unitPrice:it.unitPrice, cost:it.cost || 0, lineTotal:-gross / 100, taxCategory:it.taxCategory || taxItemCat(it), restock:p.restock !== false });
    cost += mMul(it.cost || 0, q);
    lines.push({ gross:gross / 100, cat:it.taxCategory || taxItemCat(it) });
  });
  var total = 0; items.forEach(function(i){ total += mC(i.lineTotal); });
  var orig = sale.tax && sale.tax.v != null ? sale.tax : null;
  var rt = orig ? { bp:Math.round(Number(orig.rate) * 100), v:orig.v, effective:orig.effective } : taxRateAt(taxDayOf(sale.createdAt));
  var reg = orig ? !!orig.registered : taxRegisteredOn(taxDayOf(sale.createdAt));
  var tx = taxDoc(lines, { dateKey:taxDayOf(sale.createdAt), rate:rt, registered:reg });
  var rec = {
    type:kind === 'void' ? 'void' : 'refund', refundOf:sale.id, refundOfReceipt:sale.receiptNo || '',
    items:items, total:total / 100, cost:-cost / 100, profit:0,
    paymentMethod:sale.paymentMethod, customerId:sale.customerId || null, customerName:sale.customerName || null,
    tillId:State.till && State.till.current ? State.till.current.id : (sale.tillId || null),
    cashierName:State.session ? State.session.name : null, cashierId:State.session ? State.session.userId : null,
    branchId:sale.branchId || null, reason:String(reason || '').slice(0, 300),
    approvedBy:approver ? approver.name : '', approvedById:approver ? approver.id : '', approvedAt:new Date().toISOString(),
    tax:taxNegate(taxSnap(tx)), createdAt:new Date().toISOString(), deviceId:Dev.id(), syncStatus:'pending'
  };
  rec.profit = mF(total + cost);   // negative total plus positive cost: the profit that is taken back
  return rec;
}
function refundSale(sale, picks, reason, kind, approver){
  var rec = refundBuild(sale, picks, reason, kind, approver);
  if(!rec.items.length) throw new Error('NOTHING_TO_REFUND');
  rec.receiptNo = docNumberNext('RC');
  var ref = refs.sales.doc();
  ref.set(rec);
  rec.items.forEach(function(it){
    if(it.restock === false) return;
    var p = State.products.find(function(x){ return x.id === it.productId; });
    if(p && p.stockQty != null) refs.products.doc(p.id).update({ stockQty:mRound2(Number(p.stockQty) + Math.abs(it.qty)) });
  });
  if(sale.paymentMethod === 'credit' && sale.customerId){
    var c = State.customers.find(function(x){ return x.id === sale.customerId; });
    if(c){
      var back = Math.abs(rec.total), nb = mRound2((Number(c.balance) || 0) - back);
      refs.customers.doc(c.id).update({ balance:nb });
      refs.customers.doc(c.id).collection('ledger').add({ type:'refund', amount:back, note:(kind === 'void' ? 'Void of ' : 'Refund of ') + (sale.receiptNo || 'sale'), createdAt:new Date().toISOString(), balanceAfter:nb });
    }
  }
  logAudit('create', 'refund', ref.id, (kind === 'void' ? 'Void' : 'Refund') + ' ' + fmtMoney(Math.abs(rec.total)) + ' of ' + (sale.receiptNo || 'a sale') + ': ' + rec.reason + ' (approved by ' + (approver ? approver.name : 'nobody') + ')');
  return { id:ref.id, rec:rec };
}
/** A manager or the owner types their own password or PIN to approve. A cashier can never approve their own refund. */
function askApprovalSheet(title, onApproved){
  var bosses = State.users.filter(function(u){ return (u.role === 'manager' || u.role === 'owner') && u.active !== false && !u.pending; });
  var me = State.session ? State.session.userId : '';
  var html = '<div class="sheet-head"><h2>' + esc(title) + '</h2></div>' +
    '<div class="banner" style="display:block;">' + tr('A manager or the owner must approve this. Ask them to type their own password.') + '</div>' +
    '<div class="field"><label>' + tr('Approved by') + '</label><select id="apvWho">' + bosses.map(function(u){ return '<option value="' + esc(u.id) + '"' + (u.id === me ? ' selected' : '') + '>' + esc(u.name) + ' (' + esc(tr(ROLE_LABELS[u.role] || u.role)) + ')</option>'; }).join('') + '</select></div>' +
    '<div class="field"><label>' + tr('Their password') + '</label><input id="apvPass" type="password" autocomplete="off"></div><div id="apvErr"></div>' +
    '<div class="actions"><button class="btn btn-primary btn-block" id="apvOk" type="button">' + tr('Approve') + '</button><button class="btn btn-ghost btn-block" id="apvNo" type="button" style="margin-top:8px;">' + tr('Cancel') + '</button></div>';
  var ov = openSheet(html), pass = ov.querySelector('#apvPass'), err = ov.querySelector('#apvErr');
  pass.focus();
  ov.querySelector('#apvNo').addEventListener('click', closeModal);
  function go(){
    var u = bosses.find(function(x){ return x.id === ov.querySelector('#apvWho').value; }); if(!u || !pass.value) return;
    var key = 'approve:' + u.id, lt = authLockText(key);
    if(lt){ err.innerHTML = '<div class="banner">' + ICONS.warn + '<span>' + esc(lt) + '</span></div>'; pass.value = ''; return; }
    pwCheck(pass.value, u.passHash).then(function(ok){
      if(ok){ authOk(key); closeModal(); onApproved({ id:u.id, name:u.name }); }
      else { var f = authFailed(key, u.name); pass.value = ''; err.innerHTML = '<div class="banner">' + ICONS.warn + '<span>' + esc(f.locked ? authLockText(key) : tr('Incorrect password.')) + '</span></div>'; }
    });
  }
  ov.querySelector('#apvOk').addEventListener('click', go);
  pass.addEventListener('keydown', function(e){ if(e.key === 'Enter') go(); });
}
var REFUND_REASONS = ['Customer returned the item', 'Wrong item or wrong price', 'Faulty or damaged item', 'Sale entered by mistake', 'Customer changed their mind', 'Other (write it below)'];
function openRefundSheet(saleId, kind){
  var sale = State.sales.find(function(x){ return x.id === saleId; });
  if(!sale || !secAllow('staff', 'refunding a sale')) return;
  kind = kind === 'void' ? 'void' : 'refund';
  var rows = saleRefundable(sale);
  if(!rows.length){ toast(tr('Nothing left to refund on this sale.')); return; }
  var isVoid = kind === 'void';
  var html = '<div class="sheet-head"><h2>' + (isVoid ? tr('Void this sale') : tr('Refund items')) + '</h2></div>' +
    '<div style="font-size:13px;color:var(--text-muted);margin-bottom:8px;">' + esc(sale.receiptNo || tr('Sale')) + ' · ' + esc(fmtDateTime(sale.createdAt)) + ' · ' + fmtMoney(sale.total) + '</div>' +
    '<div class="banner" style="display:block;">' + (isVoid ? tr('A void cancels the whole sale with a reversing record. The original sale stays in the history.') : tr('A refund adds a reversing record. The original sale stays in the history and is never edited.')) + '</div>' +
    '<div class="rowlist">' + rows.map(function(r){ return '<div class="row" style="cursor:default;"><div class="main"><div class="title">' + esc(r.item.name) + '</div><div class="sub">' + fmtMoney(r.item.unitPrice) + ' · ' + tr('left to refund') + ': ' + r.left + '</div></div><div class="trail"><input type="number" data-rq="' + r.idx + '" min="0" max="' + r.left + '" step="any" value="' + (isVoid ? r.left : 0) + '" ' + (isVoid ? 'readonly' : '') + ' style="width:70px;text-align:right;"></div></div>'; }).join('') + '</div>' +
    '<div class="field" style="margin-top:8px;"><label><input type="checkbox" id="rfRestock" checked style="width:auto;margin-right:8px;">' + tr('Put the items back in stock') + '</label></div>' +
    '<div class="field"><label>' + tr('Reason (required)') + '</label><select id="rfWhy">' + REFUND_REASONS.map(function(x){ return '<option>' + esc(tr(x)) + '</option>'; }).join('') + '</select></div>' +
    '<div class="field"><label>' + tr('Note') + '</label><input id="rfNote" maxlength="200" placeholder="' + esc(tr('Optional detail')) + '"></div>' +
    '<div id="rfSum"></div><div id="rfErr"></div>' +
    '<div class="actions"><button class="btn btn-danger btn-block" id="rfGo" type="button">' + (isVoid ? tr('Void sale') : tr('Refund')) + '</button><button class="btn btn-ghost btn-block" id="rfNo" type="button" style="margin-top:8px;">' + tr('Cancel') + '</button></div>';
  var ov = openSheet(html);
  function picks(){
    return rows.map(function(r){ var el = ov.querySelector('[data-rq="' + r.idx + '"]'), q = Math.min(r.left, Math.max(0, parseFloat(el.value) || 0)); return { item:r.item, qty:q, restock:ov.querySelector('#rfRestock').checked }; }).filter(function(p){ return p.qty > 0; });
  }
  function sum(){
    var p = picks(), box = ov.querySelector('#rfSum');
    if(!p.length){ box.innerHTML = ''; return; }
    var rec = refundBuild(sale, p, '', kind, null);
    box.innerHTML = '<div class="tillcard"><div class="tillrow"><span class="l">' + tr('Money back to the customer') + '</span><span class="v num">' + fmtMoney(Math.abs(rec.total)) + '</span></div>' +
      (rec.tax && rec.tax.registered && rec.tax.vat ? '<div class="tillrow"><span class="l">' + tr('VAT reversed') + '</span><span class="v num">' + fmtMoney(Math.abs(rec.tax.vat)) + '</span></div>' : '') +
      '<div class="tillrow"><span class="l">' + tr('Paid back by') + '</span><span class="v">' + esc(tr({ cash:'Cash', card:'Card', wallet:'Wallet', credit:'Reduces what they owe' }[sale.paymentMethod] || sale.paymentMethod)) + '</span></div></div>';
  }
  ov.querySelectorAll('[data-rq]').forEach(function(e){ e.addEventListener('input', sum); }); sum();
  ov.querySelector('#rfNo').addEventListener('click', closeModal);
  ov.querySelector('#rfGo').addEventListener('click', function(){
    var err = ov.querySelector('#rfErr'), p = picks();
    function bad(m){ err.innerHTML = '<div class="banner">' + ICONS.warn + '<span>' + esc(m) + '</span></div>'; }
    if(!p.length) return bad(tr('Enter how many to refund.'));
    var why = ov.querySelector('#rfWhy').value, note = ov.querySelector('#rfNote').value.trim();
    if(/Other/.test(why) && !note) return bad(tr('Write the reason in the note.'));
    var reason = why + (note ? ': ' + note : '');
    var total = refundBuild(sale, p, reason, kind, null).total;
    if(isVoid && !secVoidAllowed(sale)) return bad(tr('A sale can only be voided on the day it was made and before its till is closed. Use Refund instead.'));
    confirmSheet((isVoid ? tr('Void') : tr('Refund')) + ' ' + fmtMoney(Math.abs(total)) + '?', tr('This adds a reversing record and cannot be undone. A manager or the owner must approve it.'), isVoid ? tr('Void sale') : tr('Refund'), function(){
      askApprovalSheet(isVoid ? tr('Approve void') : tr('Approve refund'), function(approver){
        if(!uiOnce('refund:' + saleId, 3000)) return;
        try{
          var res = refundSale(sale, p, reason, kind, approver);
          toast((isVoid ? tr('Sale voided') : tr('Refund recorded')) + ', ' + fmtMoney(Math.abs(res.rec.total)));
          closeModal(); render();
        }catch(e){ toast(tr('Could not record that. Check the amounts and try again.')); }
      });
    }, true);
  });
}
function secVoidAllowed(sale){
  if(taxDayOf(sale.createdAt) !== todayKey()) return false;
  if(sale.tillId){ var t = State.tillSessions.find(function(x){ return x.id === sale.tillId; }); if(t && t.status === 'closed') return false; }
  return saleRefunds(sale.id).length === 0;
}
function openSaleDetailSheet(saleId){
  var s = State.sales.find(function(x){ return x.id === saleId; }); if(!s) return;
  var isRef = s.type === 'refund' || s.type === 'void', tx = taxOfSale(s), refs_ = saleRefunds(s.id), left = saleRefundable(s);
  var html = '<div class="sheet-head"><h2>' + esc(isRef ? (s.type === 'void' ? tr('Void') : tr('Refund')) : tr('Sale')) + ' ' + esc(s.receiptNo || '') + '</h2></div>' +
    '<div style="font-size:13px;color:var(--text-muted);margin-bottom:8px;">' + esc(fmtDateTime(s.createdAt)) + ' · ' + esc(s.cashierName || '') + ' · ' + esc(tr(({ cash:'Cash', card:'Card', wallet:'Wallet', credit:'Credit' })[s.paymentMethod] || s.paymentMethod || '')) + '</div>' +
    (isRef ? '<div class="banner" style="display:block;">' + tr('Reason') + ': ' + esc(s.reason || '') + '<br>' + tr('Approved by') + ' ' + esc(s.approvedBy || '') + ' · ' + tr('Reverses') + ' ' + esc(s.refundOfReceipt || '') + '</div>' : '') +
    '<div class="rowlist">' + (s.items || []).map(function(it){ return '<div class="row" style="cursor:default;"><div class="main"><div class="title">' + esc(it.name) + '</div><div class="sub">' + esc(String(it.qty)) + ' × ' + fmtMoney(it.unitPrice) + '</div></div><div class="trail"><div class="amt num">' + fmtMoney(it.lineTotal != null ? it.lineTotal : it.qty * it.unitPrice) + '</div></div></div>'; }).join('') + '</div>' +
    '<div class="tillcard" style="margin-top:8px;"><div class="tillrow grand"><span class="l">' + tr('Total') + '</span><span class="v num">' + fmtMoney(s.total) + '</span></div>' +
    (tx && tx.registered && (tx.vat || tx.stdGross) ? '<div class="tillrow"><span class="l">VAT (' + tx.rate + '%) · ' + tr('rule version') + ' ' + tx.v + '</span><span class="v num">' + fmtMoney(tx.vat) + '</span></div>' : '') + '</div>' +
    (refs_.length ? '<div class="section-title">' + tr('Refunds on this sale') + '</div><div class="rowlist">' + refs_.map(function(r){ return '<div class="row" style="cursor:default;"><div class="main"><div class="title">' + esc(r.receiptNo || '') + ' · ' + esc(r.reason || '') + '</div><div class="sub">' + esc(fmtDateTime(r.createdAt)) + ' · ' + tr('approved by') + ' ' + esc(r.approvedBy || '') + '</div></div><div class="trail"><div class="amt num">' + fmtMoney(r.total) + '</div></div></div>'; }).join('') + '</div>' : '') +
    '<div class="actions" style="margin-top:12px;">' + (left.length ? '<button class="btn btn-ghost btn-block" id="sdRefund" type="button">' + tr('Refund items') + '</button>' + (secVoidAllowed(s) ? '<button class="btn btn-ghost btn-block" id="sdVoid" type="button" style="margin-top:8px;">' + tr('Void whole sale') + '</button>' : '') : '') + '<button class="btn btn-ghost btn-block" id="sdDoc" type="button" style="margin-top:8px;">' + tr('View or print the receipt') + '</button><button class="btn btn-ghost btn-block" id="sdX" type="button" style="margin-top:8px;">' + tr('Close') + '</button></div>';
  var ov = openSheet(html);
  ov.querySelector('#sdDoc').addEventListener('click', function(){
    var d = saleReceiptDraft(s);
    openRecordDocSheet(tr(s.paymentMethod === 'credit' ? 'Credit sale' : 'Receipt') + ' ' + d.number, fmtDateTime(s.createdAt) + ' · ' + fmtMoney(s.total), function(){ return s.paymentMethod === 'credit' ? buildInvoicePdf(d) : buildReceiptPdf(d); }, 'receipt-' + d.number + '.pdf');
  });
  var a = ov.querySelector('#sdRefund'); if(a) a.addEventListener('click', function(){ closeModal(); openRefundSheet(s.id, 'refund'); });
  var b = ov.querySelector('#sdVoid'); if(b) b.addEventListener('click', function(){ closeModal(); openRefundSheet(s.id, 'void'); });
  ov.querySelector('#sdX').addEventListener('click', closeModal);
}
var SALES_LEDGER = { q:'', days:14 };
function openSalesLedgerSheet(){
  if(!secAllow('staff', 'opening sales')) return;
  var mine = isRestricted() ? State.session.name : '';
  var html = '<div class="sheet-head"><h2>' + tr('Sales and refunds') + '</h2></div>' +
    '<div class="field"><input id="slQ" placeholder="' + esc(tr('Search receipt number, customer or cashier')) + '" value="' + esc(SALES_LEDGER.q) + '"></div>' +
    '<div class="segbtns" style="margin-bottom:8px;">' + [1, 7, 14, 60].map(function(d){ return '<button type="button" class="segbtn' + (SALES_LEDGER.days === d ? ' active' : '') + '" data-sld="' + d + '">' + (d === 1 ? tr('Today') : d + ' ' + tr('days')) + '</button>'; }).join('') + '</div>' +
    '<div id="slList"></div><div class="actions" style="margin-top:10px;"><button class="btn btn-ghost btn-block" id="slX" type="button">' + tr('Close') + '</button></div>';
  var ov = openSheet(html);
  function paint(){
    var since = Date.now() - SALES_LEDGER.days * 86400000, q = SALES_LEDGER.q.toLowerCase();
    var list = State.sales.filter(function(s){
      if(new Date(s.createdAt).getTime() < since) return false;
      if(mine && s.cashierName !== mine) return false;
      if(!q) return true;
      return [s.receiptNo, s.customerName, s.cashierName, s.reason].join(' ').toLowerCase().indexOf(q) > -1;
    }).sort(function(a, b){ return String(b.createdAt).localeCompare(String(a.createdAt)); }).slice(0, 150);
    ov.querySelector('#slList').innerHTML = list.length ? '<div class="rowlist">' + list.map(function(s){
      var isRef = s.type === 'refund' || s.type === 'void', n = saleRefunds(s.id).length;
      return '<button type="button" class="row" data-sl="' + s.id + '" style="width:100%;text-align:left;"><div class="main"><div class="title">' + esc(s.receiptNo || tr('Sale')) + (isRef ? ' · ' + esc(s.type === 'void' ? tr('Void') : tr('Refund')) : '') + (n ? ' · ' + tr('refunded') : '') + '</div><div class="sub">' + esc(fmtDateTime(s.createdAt)) + ' · ' + esc(s.cashierName || '') + (s.customerName ? ' · ' + esc(s.customerName) : '') + '</div></div><div class="trail"><div class="amt num" style="color:' + (s.total < 0 ? 'var(--danger)' : 'inherit') + ';">' + fmtMoney(s.total) + '</div></div></button>';
    }).join('') + '</div>' : '<div class="empty" style="padding:12px 0;">' + tr('No sales found.') + '</div>';
    ov.querySelectorAll('[data-sl]').forEach(function(b){ b.addEventListener('click', function(){ closeModal(); openSaleDetailSheet(b.getAttribute('data-sl')); }); });
  }
  paint();
  ov.querySelector('#slQ').addEventListener('input', function(e){ SALES_LEDGER.q = e.target.value; paint(); });
  ov.querySelectorAll('[data-sld]').forEach(function(b){ b.addEventListener('click', function(){ SALES_LEDGER.days = parseInt(b.getAttribute('data-sld'), 10); closeModal(); openSalesLedgerSheet(); }); });
  ov.querySelector('#slX').addEventListener('click', closeModal);
}

/* ---- cash up review ---- */
var TILL_VARIANCE_LIMIT = 20;
function tillVarianceLimit(){ var v = Number(State.settings && State.settings.tillVarianceLimit); return v > 0 ? v : TILL_VARIANCE_LIMIT; }
