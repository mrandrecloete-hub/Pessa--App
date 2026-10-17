/* ============================== ENTERPRISE TOOLS: product families, branches, transfers, sales channels, shift breaks ==============================
 * Built for businesses with many items, branches and staff. Everything sits on the existing records, so selling, receipts, VAT, the till and the books keep working.
 *  - Product families: each variant (colour, size and so on) is an ordinary product that carries parentId, parentName and variantAttrs.
 *  - Branch dashboard: sales, profit and stock value for every branch side by side, read only.
 *  - Stock transfers between branches: sent (leaves the first branch), then received (joins the second). State.entTransfers.
 *  - Sales channels: online orders (WooCommerce, Shopify, BigCommerce or a CSV) are recorded through the normal Charge sheet; a stock file and a stock queue
 *    keep the online shop in step. State.channelLogs. Pesa only talks to the web address the owner types in.
 *  - Shift breaks: break start and end saved on the clock log (breaks:[{from,to}]), taken off the hours worked.
 * Wording avoids dashes on purpose. Nothing here claims approval by any authority. */
function entList(n){ var a = State[n]; return Array.isArray(a) ? a : []; }
function entSave(coll, id, doc){ id = id || uid(''); refs[coll].doc(id).set(doc); var o = Object.assign({ id:id }, doc), l = entList(coll).filter(function(x){ return x.id !== id; }); l.push(o); State[coll] = l; return o; }
function entPatch(coll, id, patch){ try{ refs[coll].doc(id).update(patch); }catch(e){} entList(coll).forEach(function(x){ if(x.id === id) Object.assign(x, patch); }); }
function entBranchName(id){ if(!id) return tr('Whole shop'); var b = (State.branches || []).find(function(x){ return x.id === id; }); return b ? b.name : tr('Branch'); }
function entNow(){ return new Date().toISOString(); }
function entWho(){ return State.session ? State.session.name : ''; }
function entTimeAgo(iso){ var m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); return m < 1 ? tr('just now') : m < 60 ? m + ' ' + tr('min') : Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm'; }
function entNeedManager(){ if(isManagerOrOwner()) return false; toast(tr('That page is for owners and managers.')); return true; }
function entFileDownload(name, text, type){ try{ var b = new Blob([text], { type:type || 'text/csv;charset=utf-8' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function(){ try{ URL.revokeObjectURL(a.href); a.remove(); }catch(e){} }, 800); }catch(e){ toast(tr('Could not save the file here')); } }
function entCsvCell(v){ v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }

/* ---------------- the hub ---------------- */
function openEnterpriseSheet(){
  if(entNeedManager()) return;
  var rows = [
    ['families', 'Product families (colour, size and more)', 'One item with many variants, stock for each'],
    ['branchdash', 'Branch dashboard', 'Sales, profit and stock for every branch side by side'],
    ['transfers', 'Stock transfers between branches', 'Send stock, track it on the way, receive it'],
    ['channels', 'Sales channels and online shop', 'Online orders and a stock file for WooCommerce, Shopify or BigCommerce']
  ];
  var html = '<div class="sheet-head"><h2>' + tr('Enterprise tools') + '</h2></div>' +
    '<div class="banner" style="display:block;">' + tr('For bigger operations with many items, branches and staff. Everything here works with your normal stock, sales and books.') + '</div>' +
    '<div class="rowlist">' + rows.map(function(r){ return '<button class="row" type="button" data-ent="' + r[0] + '" style="width:100%;text-align:left;"><div class="main"><div class="title">' + tr(r[1]) + '</div><div class="sub">' + tr(r[2]) + '</div></div></button>'; }).join('') + '</div>' +
    '<div class="actions"><button class="btn btn-ghost" id="enClose" type="button">' + tr('Close') + '</button></div>';
  var ov = openSheet(html);
  ov.querySelector('#enClose').addEventListener('click', closeModal);
  ov.querySelectorAll('[data-ent]').forEach(function(b){ b.addEventListener('click', function(){ var k = b.getAttribute('data-ent'); closeModal(); entOpen(k); }); });
}
function entOpen(k){
  if(k === 'families') openFamiliesSheet(); else if(k === 'branchdash') openBranchDashSheet('month'); else if(k === 'transfers') openTransfersSheet();
  else if(k === 'channels') openChannelsSheet();
}

/* ---------------- product families (matrix inventory) ---------------- */
function entFamilies(){
  var map = {};
  (State.products || []).forEach(function(p){ if(!p.parentId) return; var f = map[p.parentId] || (map[p.parentId] = { id:p.parentId, name:p.parentName || p.name, kids:[] }); f.kids.push(p); });
  return Object.keys(map).map(function(k){ return map[k]; }).sort(function(a, b){ return String(a.name).localeCompare(String(b.name)); });
}
function entSplitValues(s){ var seen = {}; return String(s || '').split(',').map(function(x){ return x.trim(); }).filter(function(x){ if(!x || seen[x.toLowerCase()]) return false; seen[x.toLowerCase()] = 1; return true; }).slice(0, 40); }
/* every combination of the option values, e.g. {Colour:[Blue,Red], Size:[S,M]} gives four variants */
function entCombos(axes){
  var out = [{}];
  axes.forEach(function(ax){ var next = []; out.forEach(function(o){ ax.values.forEach(function(v){ var c = Object.assign({}, o); c[ax.name] = v; next.push(c); }); }); out = next; });
  return out;
}
function entVariantName(parent, attrs){ var v = Object.keys(attrs).map(function(k){ return attrs[k]; }).join(' / '); return (parent + ' ' + v).slice(0, 120); }
function entCreateFamily(o){
  var axes = [];
  [[o.ax1, o.v1], [o.ax2, o.v2], [o.ax3, o.v3]].forEach(function(p){ var vals = entSplitValues(p[1]); if(vals.length) axes.push({ name:String(p[0] || '').trim() || ('Option ' + (axes.length + 1)), values:vals }); });
  if(!o.name || !axes.length) return { error:'Give the item a name and at least one option with values.' };
  var combos = entCombos(axes);
  if(combos.length > 200) return { error:'That makes ' + combos.length + ' variants. The most in one family is 200.' };
  var pid = uid('fam_'), made = 0, skipped = 0, now = entNow(), branch = (State.settings.currentBranchId && State.settings.currentBranchId !== 'all') ? State.settings.currentBranchId : null;
  combos.forEach(function(attrs, i){
    var nm = entVariantName(o.name, attrs);
    if((State.products || []).some(function(p){ return String(p.name).toLowerCase() === nm.toLowerCase() && (p.branchId || null) === branch; })){ skipped++; return; }
    var q = Math.max(0, parseInt(o.qty, 10) || 0), cost = Number(o.cost) || 0, sell = Number(o.sell) || 0;
    var data = { name:nm, category:o.category || '', unit:'', costPrice:cost, sellPrice:sell, stockQty:q, lowStock:o.low === '' || o.low == null ? null : parseInt(o.low, 10), barcode:o.prefix ? (String(o.prefix).trim() + String(i + 1).padStart(3, '0')) : '', parentId:pid, parentName:o.name, variantAttrs:attrs, createdAt:now, updatedAt:now };
    if(branch) data.branchId = branch;
    if(q) recordStockMove('manual', q, q * cost, q * sell, 'Added ' + nm);
    refs.products.doc().set(data); made++;
  });
  logAudit('create', 'product', pid, 'Product family ' + o.name + ': ' + made + ' variants');
  return { made:made, skipped:skipped, parentId:pid };
}
function openFamiliesSheet(){
  if(entNeedManager()) return;
  var fams = entFamilies();
  var html = '<div class="sheet-head"><h2>' + tr('Product families') + '</h2></div>' +
    '<div class="banner" style="display:block;">' + tr('Make one item with many variants, for example a shirt in Blue and Red, sizes S, M and L. Each variant is a normal product, so it sells, scans and counts like any other.') + '</div>' +
    (fams.length ? '<div class="rowlist">' + fams.map(function(f){ var tot = f.kids.reduce(function(a, p){ return a + (Number(p.stockQty) || 0); }, 0); return '<button class="row" type="button" data-fam="' + esc(f.id) + '" style="width:100%;text-align:left;"><div class="main"><div class="title">' + esc(f.name) + '</div><div class="sub">' + f.kids.length + ' ' + tr('variants') + '</div></div><div class="trail num">' + tot + ' ' + tr('in stock') + '</div></button>'; }).join('') + '</div>' : '<div class="empty-note" style="padding:10px 2px;">' + tr('No families yet.') + '</div>') +
    '<div class="section-title">' + tr('New family') + '</div>' +
    '<div class="field"><label>' + tr('Item name') + '</label><input id="fmName" placeholder="' + esc(tr('e.g. Work shirt')) + '"></div>' +
    '<div class="field"><label>' + tr('Category') + '</label><input id="fmCat"></div>' +
    [1, 2, 3].map(function(n){ return '<div class="field-row"><div class="field"><label>' + tr('Option') + ' ' + n + (n > 1 ? ' (' + tr('optional') + ')' : '') + '</label><input id="fmAx' + n + '" placeholder="' + esc(tr(n === 1 ? 'Colour' : n === 2 ? 'Size' : 'Style')) + '"></div><div class="field"><label>' + tr('Values, separated by commas') + '</label><input id="fmV' + n + '" placeholder="' + esc(n === 1 ? 'Blue, Red' : n === 2 ? 'S, M, L' : '') + '"></div></div>'; }).join('') +
    '<div class="field-row"><div class="field"><label>' + tr('Cost price') + '</label><input id="fmCost" type="number" step="0.01" min="0"></div><div class="field"><label>' + tr('Selling price') + '</label><input id="fmSell" type="number" step="0.01" min="0"></div></div>' +
    '<div class="field-row"><div class="field"><label>' + tr('Starting stock for each variant') + '</label><input id="fmQty" type="number" min="0" value="0"></div><div class="field"><label>' + tr('Low stock alert') + '</label><input id="fmLow" type="number" min="0"></div></div>' +
    '<div class="field"><label>' + tr('Barcode start (optional, a number is added for each variant)') + '</label><input id="fmPre"></div>' +
    '<div id="fmCount" class="note" style="margin:4px 0 8px;"></div>' +
    '<div class="actions"><button class="btn btn-primary" id="fmMake" type="button">' + tr('Create variants') + '</button><button class="btn btn-ghost" id="fmClose" type="button">' + tr('Close') + '</button></div>';
  var ov = openSheet(html);
  function val(id){ return ov.querySelector('#' + id).value; }
  function count(){ var n = 1, any = false; [1, 2, 3].forEach(function(i){ var c = entSplitValues(val('fmV' + i)).length; if(c){ n *= c; any = true; } }); ov.querySelector('#fmCount').textContent = any ? (n + ' ' + tr('variants will be made')) : ''; }
  ['fmV1', 'fmV2', 'fmV3'].forEach(function(id){ ov.querySelector('#' + id).addEventListener('input', count); });
  ov.querySelector('#fmClose').addEventListener('click', closeModal);
  ov.querySelector('#fmMake').addEventListener('click', function(){
    var r = entCreateFamily({ name:val('fmName').trim(), category:val('fmCat').trim(), ax1:val('fmAx1'), v1:val('fmV1'), ax2:val('fmAx2'), v2:val('fmV2'), ax3:val('fmAx3'), v3:val('fmV3'), cost:val('fmCost'), sell:val('fmSell'), qty:val('fmQty'), low:val('fmLow'), prefix:val('fmPre') });
    if(r.error){ toast(tr(r.error)); return; }
    toast(r.made + ' ' + tr('variants made') + (r.skipped ? ', ' + r.skipped + ' ' + tr('already existed') : '')); closeModal(); setTimeout(openFamiliesSheet, 350);
  });
  ov.querySelectorAll('[data-fam]').forEach(function(b){ b.addEventListener('click', function(){ closeModal(); openFamilySheet(b.getAttribute('data-fam')); }); });
}
function openFamilySheet(id){
  var f = entFamilies().find(function(x){ return x.id === id; }); if(!f){ openFamiliesSheet(); return; }
  var axes = []; f.kids.forEach(function(p){ Object.keys(p.variantAttrs || {}).forEach(function(k){ if(axes.indexOf(k) < 0) axes.push(k); }); });
  var grid = '';
  if(axes.length === 2){
    var rowsV = [], colsV = []; f.kids.forEach(function(p){ var a = (p.variantAttrs || {})[axes[0]], b = (p.variantAttrs || {})[axes[1]]; if(rowsV.indexOf(a) < 0) rowsV.push(a); if(colsV.indexOf(b) < 0) colsV.push(b); });
    grid = '<div style="overflow:auto;"><table class="tbl" style="width:100%;border-collapse:collapse;"><thead><tr><th style="text-align:left;">' + esc(axes[0]) + ' / ' + esc(axes[1]) + '</th>' + colsV.map(function(c){ return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' + rowsV.map(function(r){
      return '<tr><td style="font-weight:700;">' + esc(r) + '</td>' + colsV.map(function(c){ var p = f.kids.find(function(x){ return (x.variantAttrs || {})[axes[0]] === r && (x.variantAttrs || {})[axes[1]] === c; }); return '<td class="num" style="text-align:center;">' + (p ? (Number(p.stockQty) || 0) : '') + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  }
  var html = '<div class="sheet-head"><h2>' + esc(f.name) + '</h2></div>' + grid +
    '<div class="rowlist">' + f.kids.sort(function(a, b){ return String(a.name).localeCompare(String(b.name)); }).map(function(p){ return '<div class="row"><div class="main"><div class="title">' + esc(Object.keys(p.variantAttrs || {}).map(function(k){ return p.variantAttrs[k]; }).join(' / ') || p.name) + '</div><div class="sub">' + esc(p.barcode || '') + '</div></div><div class="trail num">' + (Number(p.stockQty) || 0) + ' · ' + fmtMoney(p.sellPrice || 0) + '</div></div>'; }).join('') + '</div>' +
    '<div class="section-title">' + tr('Change the price of every variant') + '</div>' +
    '<div class="field-row"><div class="field"><label>' + tr('Cost price') + '</label><input id="fpCost" type="number" step="0.01" min="0"></div><div class="field"><label>' + tr('Selling price') + '</label><input id="fpSell" type="number" step="0.01" min="0"></div></div>' +
    '<div class="actions"><button class="btn btn-primary" id="fpSave" type="button">' + tr('Apply to all') + '</button><button class="btn btn-ghost" id="fpBack" type="button">' + tr('Back') + '</button></div>';
  var ov = openSheet(html);
  ov.querySelector('#fpBack').addEventListener('click', function(){ closeModal(); openFamiliesSheet(); });
  ov.querySelector('#fpSave').addEventListener('click', function(){
    var c = ov.querySelector('#fpCost').value, s = ov.querySelector('#fpSell').value; if(c === '' && s === ''){ toast(tr('Type a price first')); return; }
    f.kids.forEach(function(p){ var patch = { updatedAt:entNow() }; if(c !== '') patch.costPrice = Number(c) || 0; if(s !== '') patch.sellPrice = Number(s) || 0; refs.products.doc(p.id).update(patch); });
    logAudit('update', 'product', id, 'Prices changed for family ' + f.name); toast(tr('Prices updated')); closeModal(); setTimeout(function(){ openFamilySheet(id); }, 300);
  });
}

/* ---------------- branch dashboard ---------------- */
function entPeriodFrom(period){ var t = todayKey(); return period === 'today' ? t : period === 'year' ? t.slice(0, 4) + '-01-01' : t.slice(0, 7) + '-01'; }
function entBranchRows(period){
  var from = entPeriodFrom(period), map = {};
  function row(id){ var k = id || ''; return map[k] || (map[k] = { id:k, name:entBranchName(id || null), sales:0, count:0, profit:0, stockCost:0, items:0, low:0 }); }
  (State.branches || []).forEach(function(b){ row(b.id); });
  (State.sales || []).forEach(function(s){ if(String(s.createdAt || '').slice(0, 10) < from) return; var r = row(s.branchId); r.sales += Number(s.total) || 0; r.profit += Number(s.profit) || 0; if(!s.refundOf && (Number(s.total) || 0) > 0) r.count++; });
  (State.products || []).forEach(function(p){ var r = row(p.branchId), q = Number(p.stockQty) || 0; r.stockCost += q * (Number(p.costPrice) || 0); r.items += 1; if(p.lowStock != null && q <= Number(p.lowStock)) r.low++; });
  return Object.keys(map).map(function(k){ return map[k]; }).filter(function(r){ return r.id || r.sales || r.items; }).sort(function(a, b){ return b.sales - a.sales; });
}
function openBranchDashSheet(period){
  if(entNeedManager()) return;
  period = period || 'month';
  var rows = entBranchRows(period), tot = rows.reduce(function(a, r){ a.sales += r.sales; a.profit += r.profit; a.count += r.count; a.stock += r.stockCost; a.low += r.low; return a; }, { sales:0, profit:0, count:0, stock:0, low:0 });
  var best = rows.length ? Math.max.apply(null, rows.map(function(r){ return r.sales; })) : 0;
  var html = '<div class="sheet-head"><h2>' + tr('Branch dashboard') + '</h2></div>' +
    '<div class="actions" style="margin-bottom:8px;">' + [['today', 'Today'], ['month', 'This month'], ['year', 'This year']].map(function(p){ return '<button class="btn ' + (p[0] === period ? 'btn-primary' : 'btn-ghost') + '" type="button" data-bp="' + p[0] + '">' + tr(p[1]) + '</button>'; }).join('') + '</div>' +
    '<div class="stats"><div class="stat"><div class="lbl">' + tr('Sales') + '</div><div class="v num">' + fmtMoney(tot.sales) + '</div></div><div class="stat"><div class="lbl">' + tr('Profit') + '</div><div class="v num">' + fmtMoney(tot.profit) + '</div></div><div class="stat"><div class="lbl">' + tr('Sales made') + '</div><div class="v num">' + tot.count + '</div></div><div class="stat"><div class="lbl">' + tr('Stock at cost') + '</div><div class="v num">' + fmtMoney(tot.stock) + '</div></div></div>' +
    (rows.length ? '<div class="rowlist">' + rows.map(function(r){ var w = best > 0 ? Math.max(2, Math.round(Math.max(0, r.sales) * 100 / best)) : 0;
      return '<div class="row" data-bbranch="' + esc(r.id) + '"><div class="main"><div class="title">' + esc(r.name) + '</div><div class="sub">' + r.count + ' ' + tr('sales') + ' · ' + tr('profit') + ' ' + fmtMoney(r.profit) + ' · ' + tr('stock') + ' ' + fmtMoney(r.stockCost) + (r.low ? ' · ' + r.low + ' ' + tr('low') : '') + '</div><div style="height:6px;border-radius:3px;background:rgba(8,120,90,.15);margin-top:6px;"><div style="height:6px;border-radius:3px;background:#0B7A5C;width:' + w + '%;"></div></div></div><div class="trail num">' + fmtMoney(r.sales) + '</div></div>'; }).join('') + '</div>' : '<div class="empty-note">' + tr('No branches yet. Add branches from the menu.') + '</div>') +
    '<div class="note" style="margin:8px 0;">' + tr('Stock with no branch is shown as Whole shop. Refunds are taken off the sales.') + '</div>' +
    '<div class="actions"><button class="btn btn-ghost" id="bdCsv" type="button">' + tr('Download CSV') + '</button><button class="btn btn-ghost" id="bdClose" type="button">' + tr('Close') + '</button></div>';
  var ov = openSheet(html);
  ov.querySelector('#bdClose').addEventListener('click', closeModal);
  ov.querySelectorAll('[data-bp]').forEach(function(b){ b.addEventListener('click', function(){ closeModal(); openBranchDashSheet(b.getAttribute('data-bp')); }); });
  ov.querySelector('#bdCsv').addEventListener('click', function(){
    var lines = [['Branch', 'Sales', 'Number of sales', 'Profit', 'Stock at cost', 'Low stock items']].concat(rows.map(function(r){ return [r.name, r.sales.toFixed(2), r.count, r.profit.toFixed(2), r.stockCost.toFixed(2), r.low]; }));
    entFileDownload('pesa-branches-' + period + '.csv', lines.map(function(l){ return l.map(entCsvCell).join(','); }).join('\r\n'));
  });
}

/* ---------------- stock transfers between branches ---------------- */
function entTransferSend(fromId, toId, productId, qty){
  var src = (State.products || []).find(function(p){ return p.id === productId; });
  if(!src) return { error:'Pick a product.' };
  qty = parseInt(qty, 10);
  if(!fromId || !toId || fromId === toId) return { error:'Pick two different branches.' };
  if(!(qty > 0)) return { error:'Type how many to send.' };
  if(qty > (Number(src.stockQty) || 0)) return { error:'Only ' + (Number(src.stockQty) || 0) + ' in stock there.' };
  var cost = Number(src.costPrice) || 0, sell = Number(src.sellPrice) || 0;
  refs.products.doc(src.id).update({ stockQty:(Number(src.stockQty) || 0) - qty, updatedAt:entNow() });
  src.stockQty = (Number(src.stockQty) || 0) - qty;
  recordStockMove('manual', -qty, -qty * cost, -qty * sell, 'Transfer out of ' + entBranchName(fromId) + ': ' + src.name);
  var t = entSave('entTransfers', null, { fromBranchId:fromId, toBranchId:toId, productId:src.id, name:src.name, barcode:src.barcode || '', category:src.category || '', cost:cost, sell:sell, qty:qty, status:'sent', sentAt:entNow(), sentBy:entWho() });
  logAudit('create', 'transfer', t.id, 'Sent ' + qty + ' x ' + src.name + ' to ' + entBranchName(toId));
  return { transfer:t };
}
function entTransferReceive(id){
  var t = entList('entTransfers').find(function(x){ return x.id === id; });
  if(!t || t.status !== 'sent') return { error:'This transfer is not waiting.' };
  var dest = (State.products || []).find(function(p){ return (p.branchId || null) === t.toBranchId && ((t.barcode && p.barcode === t.barcode) || String(p.name).toLowerCase() === String(t.name).toLowerCase()); });
  if(dest){ refs.products.doc(dest.id).update({ stockQty:(Number(dest.stockQty) || 0) + t.qty, updatedAt:entNow() }); dest.stockQty = (Number(dest.stockQty) || 0) + t.qty; }
  else { var now = entNow(); refs.products.doc().set({ name:t.name, category:t.category, unit:'', costPrice:t.cost, sellPrice:t.sell, stockQty:t.qty, lowStock:null, barcode:t.barcode, branchId:t.toBranchId, createdAt:now, updatedAt:now }); }
  recordStockMove('manual', t.qty, t.qty * t.cost, t.qty * t.sell, 'Transfer into ' + entBranchName(t.toBranchId) + ': ' + t.name);
  entPatch('entTransfers', id, { status:'received', receivedAt:entNow(), receivedBy:entWho() });
  logAudit('update', 'transfer', id, 'Received ' + t.qty + ' x ' + t.name + ' at ' + entBranchName(t.toBranchId));
  return { ok:true };
}
function openTransfersSheet(){
  if(entNeedManager()) return;
  var br = State.branches || [];
  if(br.length < 2){ openSheet('<div class="sheet-head"><h2>' + tr('Stock transfers') + '</h2></div><div class="banner" style="display:block;">' + tr('Add at least two branches first (Menu, Branches). Then you can move stock between them.') + '</div><div class="actions"><button class="btn btn-ghost" id="trX" type="button">' + tr('Close') + '</button></div>').querySelector('#trX').addEventListener('click', closeModal); return; }
  var list = entList('entTransfers').slice().sort(function(a, b){ return String(b.sentAt).localeCompare(String(a.sentAt)); });
  var waiting = list.filter(function(t){ return t.status === 'sent'; });
  var opts = br.map(function(b){ return '<option value="' + esc(b.id) + '">' + esc(b.name) + '</option>'; }).join('');
  var html = '<div class="sheet-head"><h2>' + tr('Stock transfers') + '</h2></div>' +
    (waiting.length ? '<div class="section-title">' + tr('On the way') + '</div><div class="rowlist">' + waiting.map(function(t){ return '<div class="row"><div class="main"><div class="title">' + t.qty + ' x ' + esc(t.name) + '</div><div class="sub">' + esc(entBranchName(t.fromBranchId)) + ' to ' + esc(entBranchName(t.toBranchId)) + ' · ' + esc(entTimeAgo(t.sentAt)) + '</div></div><div class="trail"><button class="btn btn-primary" type="button" data-rcv="' + esc(t.id) + '">' + tr('Received') + '</button></div></div>'; }).join('') + '</div>' : '') +
    '<div class="section-title">' + tr('Send stock') + '</div>' +
    '<div class="field-row"><div class="field"><label>' + tr('From branch') + '</label><select id="trFrom">' + opts + '</select></div><div class="field"><label>' + tr('To branch') + '</label><select id="trTo">' + opts + '</select></div></div>' +
    '<div class="field"><label>' + tr('Product') + '</label><select id="trProd"></select></div>' +
    '<div class="field"><label>' + tr('How many') + '</label><input id="trQty" type="number" min="1"></div>' +
    '<div class="note">' + tr('Stock leaves the first branch now and joins the second when it is marked Received.') + '</div>' +
    '<div class="actions"><button class="btn btn-primary" id="trSend" type="button">' + tr('Send') + '</button><button class="btn btn-ghost" id="trClose" type="button">' + tr('Close') + '</button></div>' +
    (list.length ? '<div class="section-title">' + tr('History') + '</div><div class="rowlist">' + list.slice(0, 25).map(function(t){ return '<div class="row"><div class="main"><div class="title">' + t.qty + ' x ' + esc(t.name) + '</div><div class="sub">' + esc(entBranchName(t.fromBranchId)) + ' to ' + esc(entBranchName(t.toBranchId)) + ' · ' + (t.status === 'received' ? tr('received') : tr('on the way')) + '</div></div></div>'; }).join('') + '</div>' : '');
  var ov = openSheet(html);
  if(br.length > 1) ov.querySelector('#trTo').selectedIndex = 1;
  function fill(){ var f = ov.querySelector('#trFrom').value; ov.querySelector('#trProd').innerHTML = (State.products || []).filter(function(p){ return (p.branchId || null) === f && (Number(p.stockQty) || 0) > 0 && !p.isMock; }).sort(function(a, b){ return String(a.name).localeCompare(String(b.name)); }).map(function(p){ return '<option value="' + esc(p.id) + '">' + esc(p.name) + ' (' + (Number(p.stockQty) || 0) + ')</option>'; }).join('') || '<option value="">' + esc(tr('Nothing in stock at this branch')) + '</option>'; }
  fill(); ov.querySelector('#trFrom').addEventListener('change', fill);
  ov.querySelector('#trClose').addEventListener('click', closeModal);
  ov.querySelector('#trSend').addEventListener('click', function(){ var r = entTransferSend(ov.querySelector('#trFrom').value, ov.querySelector('#trTo').value, ov.querySelector('#trProd').value, ov.querySelector('#trQty').value); if(r.error){ toast(tr(r.error)); return; } toast(tr('Sent')); closeModal(); setTimeout(openTransfersSheet, 300); });
  ov.querySelectorAll('[data-rcv]').forEach(function(b){ b.addEventListener('click', function(){ var r = entTransferReceive(b.getAttribute('data-rcv')); if(r.error){ toast(tr(r.error)); return; } toast(tr('Received')); closeModal(); setTimeout(openTransfersSheet, 300); }); });
}

/* ---------------- sales channels (online shop) ---------------- */
var ENT_PLATFORMS = ['WooCommerce', 'Shopify', 'BigCommerce', 'Other online shop'];
function entChannelCfg(){ var c = (State.settings && State.settings.entChannel) || {}; return { platform:c.platform || ENT_PLATFORMS[0], endpoint:c.endpoint || '' }; }
/* one list of orders from any of the three platforms, or from a CSV with the columns order, sku, qty, price */
function entParseOrders(text){
  text = String(text || '').trim(); if(!text) return [];
  var orders = [];
  if(text.charAt(0) === '{' || text.charAt(0) === '['){
    var j; try{ j = JSON.parse(text); }catch(e){ return null; }
    var arr = Array.isArray(j) ? j : (j.orders || j.data || [j]);
    arr.forEach(function(o){
      var lines = o.line_items || o.products || o.items || [];
      orders.push({ id:String(o.id != null ? o.id : (o.number || o.name || '')), ref:String(o.number || o.name || o.order_number || o.id || ''), customer:String((o.billing && ((o.billing.first_name || '') + ' ' + (o.billing.last_name || '')).trim()) || (o.customer && (o.customer.first_name || o.customer.name)) || o.email || ''),
        lines:lines.map(function(l){ return { sku:String(l.sku || l.SKU || '').trim(), name:String(l.name || l.title || ''), qty:Number(l.quantity != null ? l.quantity : l.qty) || 0, price:Number(l.price != null ? l.price : l.price_ex_tax) || 0 }; }) });
    });
  } else {
    var map = {}, rows = text.split(/\r?\n/).map(function(r){ return r.split(',').map(function(c){ return c.trim().replace(/^"|"$/g, ''); }); });
    if(rows.length && /order/i.test(rows[0][0])) rows.shift();
    rows.forEach(function(r){ if(r.length < 3 || !r[0]) return; var o = map[r[0]] || (map[r[0]] = { id:r[0], ref:r[0], customer:'', lines:[] }); o.lines.push({ sku:r[1], name:r[1], qty:Number(r[2]) || 0, price:Number(r[3]) || 0 }); });
    orders = Object.keys(map).map(function(k){ return map[k]; });
  }
  return orders.filter(function(o){ return o.id && o.lines.length; });
}
function entMatchProduct(line){
  var s = String(line.sku || '').toLowerCase(), n = String(line.name || '').toLowerCase();
  return (State.products || []).find(function(p){ return s && String(p.barcode || '').toLowerCase() === s; }) || (State.products || []).find(function(p){ return n && String(p.name).toLowerCase() === n; }) || null;
}
function entOrderDone(platform, id){ return entList('channelLogs').some(function(l){ return l.type === 'order' && l.platform === platform && l.externalOrderId === id && l.status === 'recorded'; }); }
function entRecordOrder(platform, o){
  if(entOrderDone(platform, o.id)) return { error:'Order ' + o.ref + ' is already recorded.' };
  var bad = o.lines.filter(function(l){ return !entMatchProduct(l); });
  if(bad.length) return { error:'Some items do not match a product (match by barcode or exact name): ' + bad.map(function(l){ return l.sku || l.name; }).join(', ') };
  if(State.cart && State.cart.length) return { error:'Finish or clear the sale in the cart first.' };
  var log = entList('channelLogs').find(function(l){ return l.type === 'order' && l.platform === platform && l.externalOrderId === o.id && l.status === 'pending'; }) || entSave('channelLogs', null, { type:'order', platform:platform, externalOrderId:o.id, ref:o.ref, status:'pending', total:o.lines.reduce(function(a, l){ return a + l.qty * l.price; }, 0), createdAt:entNow(), by:entWho() });
  o.lines.forEach(function(l){ var p = entMatchProduct(l); State.cart.push({ productId:p.id, name:p.name, unitPrice:l.price || Number(p.sellPrice) || 0, cost:Number(p.costPrice) || 0, qty:l.qty, unit:p.unit || '', maxQty:Infinity, channelLogId:log.id, channelOrderId:o.id, channel:platform }); });
  return { log:log };
}
function entStockRows(){ return (State.products || []).filter(function(p){ return p.barcode && !p.isMock; }).map(function(p){ return { sku:p.barcode, name:p.name, qty:Math.max(0, Number(p.stockQty) || 0), price:Number(p.sellPrice) || 0, id:p.id }; }); }
function entQueueStockAll(){
  var cfg = entChannelCfg(), n = 0, queued = {};
  entList('channelLogs').forEach(function(l){ if(l.type === 'stock' && l.status === 'queued') queued[l.productId] = l; });
  entStockRows().forEach(function(r){ var q = queued[r.id]; if(q){ if(q.qty !== r.qty){ entPatch('channelLogs', q.id, { qty:r.qty, createdAt:entNow() }); n++; } return; } entSave('channelLogs', null, { type:'stock', platform:cfg.platform, productId:r.id, sku:r.sku, qty:r.qty, status:'queued', createdAt:entNow(), by:entWho() }); n++; });
  return n;
}
function entPushQueue(done){
  var cfg = entChannelCfg(), q = entList('channelLogs').filter(function(l){ return l.type === 'stock' && (l.status === 'queued' || l.status === 'failed'); });
  if(!/^https:\/\//i.test(cfg.endpoint)){ done({ error:'Type a web address that starts with https:// first.' }); return; }
  if(!q.length){ done({ sent:0 }); return; }
  if(typeof navigator !== 'undefined' && navigator.onLine === false){ done({ error:'This device is offline. The queue is kept and can be sent later.' }); return; }
  var body = JSON.stringify({ platform:cfg.platform, business:(State.company && (State.company.tradingName || State.company.companyName)) || '', sentAt:entNow(), stock:q.map(function(l){ return { sku:l.sku, quantity:l.qty }; }) });
  fetch(cfg.endpoint, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:body }).then(function(r){
    var ok = r && r.ok; q.forEach(function(l){ entPatch('channelLogs', l.id, ok ? { status:'sent', sentAt:entNow() } : { status:'failed', error:'HTTP ' + (r && r.status) }); });
    done(ok ? { sent:q.length } : { error:'The online shop answered with an error (' + (r && r.status) + '). Items stay in the queue.' });
  }).catch(function(){ q.forEach(function(l){ entPatch('channelLogs', l.id, { status:'failed', error:'unreachable' }); }); done({ error:'Could not reach the web address. Items stay in the queue.' }); });
}
function openChannelsSheet(){
  if(entNeedManager()) return;
  var cfg = entChannelCfg(), logs = entList('channelLogs').slice().sort(function(a, b){ return String(b.createdAt).localeCompare(String(a.createdAt)); }), queued = logs.filter(function(l){ return l.type === 'stock' && (l.status === 'queued' || l.status === 'failed'); }).length;
  var html = '<div class="sheet-head"><h2>' + tr('Sales channels and online shop') + '</h2></div>' +
    '<div class="banner" style="display:block;">' + tr('Record online orders as normal sales, and keep the online shop stock in step. Items are matched to products by barcode (used as the SKU) or exact name. Pesa only contacts the web address you type below.') + '</div>' +
    '<div class="field"><label>' + tr('Platform') + '</label><select id="chPlat">' + ENT_PLATFORMS.map(function(p){ return '<option' + (p === cfg.platform ? ' selected' : '') + '>' + esc(p) + '</option>'; }).join('') + '</select></div>' +
    '<div class="field"><label>' + tr('Web address that receives stock updates (https)') + '</label><input id="chUrl" value="' + esc(cfg.endpoint) + '" placeholder="https://"></div>' +
    '<div class="actions"><button class="btn btn-ghost" id="chSave" type="button">' + tr('Save') + '</button></div>' +
    '<div class="section-title">' + tr('Keep stock in step') + '</div>' +
    '<div class="actions" style="flex-wrap:wrap;"><button class="btn btn-ghost" id="chQueue" type="button">' + tr('Queue current stock') + '</button><button class="btn btn-primary" id="chPush" type="button">' + tr('Send queue') + (queued ? ' (' + queued + ')' : '') + '</button><button class="btn btn-ghost" id="chCsv" type="button">' + tr('Download stock file') + '</button></div>' +
    '<div class="section-title">' + tr('Online orders') + '</div>' +
    '<div class="field"><label>' + tr('Paste orders (JSON from WooCommerce, Shopify or BigCommerce, or CSV with order, sku, qty, price)') + '</label><textarea id="chOrders" rows="5" style="width:100%;"></textarea></div>' +
    '<div class="actions"><button class="btn btn-primary" id="chRead" type="button">' + tr('Read orders') + '</button></div><div id="chList"></div>' +
    (logs.length ? '<div class="section-title">' + tr('Recent activity') + '</div><div class="rowlist">' + logs.slice(0, 15).map(function(l){ return '<div class="row"><div class="main"><div class="title">' + (l.type === 'order' ? tr('Order') + ' ' + esc(l.ref || l.externalOrderId) : tr('Stock') + ' ' + esc(l.sku || '') + ' = ' + (l.qty != null ? l.qty : '')) + '</div><div class="sub">' + esc(l.platform || '') + ' · ' + esc(entTimeAgo(l.createdAt)) + '</div></div><div class="trail">' + esc(tr(l.status)) + '</div></div>'; }).join('') + '</div>' : '') +
    '<div class="actions"><button class="btn btn-ghost" id="chClose" type="button">' + tr('Close') + '</button></div>';
  var ov = openSheet(html), parsed = [];
  ov.querySelector('#chClose').addEventListener('click', closeModal);
  ov.querySelector('#chSave').addEventListener('click', function(){ var u = ov.querySelector('#chUrl').value.trim(); if(u && !/^https:\/\//i.test(u)){ toast(tr('The address must start with https://')); return; } btSave({ entChannel:{ platform:ov.querySelector('#chPlat').value, endpoint:u } }); toast(tr('Saved')); });
  ov.querySelector('#chQueue').addEventListener('click', function(){ btSave({ entChannel:{ platform:ov.querySelector('#chPlat').value, endpoint:ov.querySelector('#chUrl').value.trim() } }); var n = entQueueStockAll(); toast(n + ' ' + tr('stock lines queued')); closeModal(); setTimeout(openChannelsSheet, 300); });
  ov.querySelector('#chPush').addEventListener('click', function(){ btSave({ entChannel:{ platform:ov.querySelector('#chPlat').value, endpoint:ov.querySelector('#chUrl').value.trim() } }); entPushQueue(function(r){ toast(r.error ? tr(r.error) : (r.sent + ' ' + tr('stock lines sent'))); closeModal(); setTimeout(openChannelsSheet, 300); }); });
  ov.querySelector('#chCsv').addEventListener('click', function(){ var lines = [['SKU', 'Name', 'Stock', 'Price']].concat(entStockRows().map(function(r){ return [r.sku, r.name, r.qty, r.price.toFixed(2)]; })); entFileDownload('pesa-online-stock.csv', lines.map(function(l){ return l.map(entCsvCell).join(','); }).join('\r\n')); });
  ov.querySelector('#chRead').addEventListener('click', function(){
    var o = entParseOrders(ov.querySelector('#chOrders').value), box = ov.querySelector('#chList');
    if(o === null){ box.innerHTML = '<div class="banner" style="display:block;">' + tr('That is not valid JSON.') + '</div>'; return; }
    parsed = o; if(!o.length){ box.innerHTML = '<div class="banner" style="display:block;">' + tr('No orders found.') + '</div>'; return; }
    var plat = ov.querySelector('#chPlat').value;
    box.innerHTML = '<div class="rowlist">' + o.map(function(x, i){ var miss = x.lines.filter(function(l){ return !entMatchProduct(l); }).length, done = entOrderDone(plat, x.id), total = x.lines.reduce(function(a, l){ return a + l.qty * l.price; }, 0);
      return '<div class="row"><div class="main"><div class="title">' + tr('Order') + ' ' + esc(x.ref) + ' ' + esc(x.customer) + '</div><div class="sub">' + x.lines.length + ' ' + tr('lines') + ' · ' + fmtMoney(total) + (miss ? ' · ' + miss + ' ' + tr('not matched') : '') + (done ? ' · ' + tr('already recorded') : '') + '</div></div><div class="trail">' + (!miss && !done ? '<button class="btn btn-primary" type="button" data-rec="' + i + '">' + tr('Record sale') + '</button>' : '') + '</div></div>'; }).join('') + '</div>';
    box.querySelectorAll('[data-rec]').forEach(function(b){ b.addEventListener('click', function(){ var r = entRecordOrder(plat, parsed[+b.getAttribute('data-rec')]); if(r.error){ toast(tr(r.error)); return; } closeModal(); try{ renderCartBar(); }catch(e){} setTimeout(openChargeSheet, 60); }); });
  });
}

/* an online order recorded through the Charge sheet: the sale carries the order number and platform, and the log entry is closed once the sale is saved */
function entSaleMeta(){
  var ch = (State.cart || []).find(function(i){ return i.channelLogId; });
  if(!ch) return null;
  return { extra:{ channelOrderId:ch.channelOrderId, channel:ch.channel }, after:function(sale){ entPatch('channelLogs', ch.channelLogId, { status:'recorded', recordedAt:entNow(), receiptNo:sale.receiptNo || '' }); } };
}

/* ---------------- shift breaks ---------------- */
function entBreakMs(l){
  var t = 0, end = l.outAt ? new Date(l.outAt).getTime() : Date.now();
  (l.breaks || []).forEach(function(b){ var from = new Date(b.from).getTime(), to = b.to ? new Date(b.to).getTime() : end; if(isFinite(from) && isFinite(to)) t += Math.max(0, to - from); });
  return t;
}
function entOnBreak(l){ var b = l && l.breaks && l.breaks[l.breaks.length - 1]; return !!(b && !b.to); }
function entCloseBreaks(l, at){ if(!entOnBreak(l)) return null; return l.breaks.map(function(b, i){ return i === l.breaks.length - 1 ? { from:b.from, to:at } : b; }); }
function entToggleBreak(u){
  var open = u && clockOpenLog(u.id); if(!open){ toast(tr('Clock in first')); return; }
  var now = entNow(), br = (open.breaks || []).map(function(b){ return { from:b.from, to:b.to }; });
  if(entOnBreak(open)){ br[br.length - 1].to = now; toast(tr('Break ended')); logAudit('update', 'clock', u.id, u.name + ' ended a break'); }
  else { br.push({ from:now, to:null }); toast(tr('Break started')); logAudit('update', 'clock', u.id, u.name + ' started a break'); }
  refs.clockLogs.doc(open.id).update({ breaks:br }); open.breaks = br;
}
