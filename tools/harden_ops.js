/* ===== Pesa hardening part 4: backup checks, recovery page, integrity report, privacy controls ===== */
var BACKUP_ARRAYS = ['products','customers','sales','expenses','invoices','reports','suppliers','purchaseOrders','branches','wastage','tillSessions','posDevices','posBatches','messages','workReports','stockTakes','stockMoves','supplierInvoices','supplierPayments','supplierStatements','quotes','recurring','loyaltyLog','accountingPeriods','payRuns','courseProgress','deletedRecords','clockLogs','tips','calEvents'];
/** Checks a backup before anything is restored from it. Returns { ok, problems, counts }. */
function backupCheck(data){
  var problems = [], counts = {};
  if(!data || typeof data !== 'object' || Array.isArray(data)) return { ok:false, problems:['This is not a Pesa backup file.'], counts:counts };
  if(!data.exportedAt && !data.shop && !data.sales) problems.push('The file has no Pesa data in it.');
  BACKUP_ARRAYS.forEach(function(k){
    var rows = data[k];
    if(rows === undefined || rows === null) return;
    if(!Array.isArray(rows)){ problems.push(k + ' is damaged (not a list).'); return; }
    counts[k] = rows.length;
    var seen = {}, bad = 0;
    rows.forEach(function(r){
      if(!r || typeof r !== 'object' || Array.isArray(r) || !r.id || typeof r.id !== 'string' || r.id.indexOf('/') >= 0 || r.id === '__proto__' || r.id === 'constructor'){ bad++; return; }
      if(seen[r.id]) bad++; seen[r.id] = 1;
    });
    if(bad) problems.push(k + ': ' + bad + ' record(s) are damaged or duplicated.');
  });
  ['sales','expenses'].forEach(function(k){
    (Array.isArray(data[k]) ? data[k] : []).forEach(function(r){
      if(r && typeof r === 'object' && r.total !== undefined && r.total !== null && !isFinite(Number(r.total))) problems.push(k + ' ' + r.id + ' has an amount that is not a number.');
    });
  });
  if(data.shop && (typeof data.shop !== 'object' || Array.isArray(data.shop))) problems.push('Shop settings are damaged.');
  if(data.shop && data.shop.syncServiceKey) problems.push('Settings contain a secret key and will not be restored.');
  if(data.ledgers && typeof data.ledgers !== 'object') problems.push('Customer ledgers are damaged.');
  return { ok: problems.length === 0, problems: problems.slice(0, 8), counts: counts };
}
function backupBody(p){ var c = Object.assign({}, p); delete c.integrity; return JSON.stringify(c); }
/** Adds a SHA-256 fingerprint so a changed or cut off file is noticed on restore. */
async function backupSeal(p){
  var chk = backupCheck(p), body = backupBody(p), sha = await sha256Hex(body);
  p.integrity = { algo:'SHA-256', sha:sha, bytes:body.length, app:APP_VERSION, records:Object.keys(chk.counts).reduce(function(s, k){ return s + chk.counts[k]; }, 0) };
  return p;
}
/** null when there is no fingerprint (an older file), true when it matches, false when it does not. */
async function backupSealOk(p){
  if(!p || !p.integrity || !p.integrity.sha) return null;
  try{ return (await sha256Hex(backupBody(p))) === p.integrity.sha; }catch(e){ return false; }
}
function backupVerKey(){ return 'pesa_backup_verified_' + WS.id; }
function backupVerifiedAt(){ try{ return parseInt(localStorage.getItem(backupVerKey()) || '0', 10) || 0; }catch(e){ return 0; } }
/** Reads a saved snapshot back and checks it is whole. Only a snapshot that passes counts as verified. */
async function backupVerifyKey(key){
  try{
    var r = await Backups.get(key);
    if(!r || !r.json) return false;
    if(r.sha && (await sha256Hex(r.json)) !== r.sha) return false;
    var d = JSON.parse(r.json), chk = backupCheck(d);
    if(!chk.ok) return false;
    try{ localStorage.setItem(backupVerKey(), String(r.at)); }catch(e){}
    return true;
  }catch(e){ return false; }
}
async function recoveryStatus(){
  var out = { last:Backups.lastAt(), verified:backupVerifiedAt(), points:0, unsynced:0, syncState:'off', used:0, quota:0, persisted:null, online:navigator.onLine };
  try{ out.points = (await Backups.list()).length; }catch(e){ out.points = -1; }
  try{ out.unsynced = Sync.pendingCount(); out.syncState = Sync.status().state; }catch(e){}
  try{
    if(navigator.storage && navigator.storage.estimate){ var e = await navigator.storage.estimate(); out.used = e.usage || 0; out.quota = e.quota || 0; }
    if(navigator.storage && navigator.storage.persisted) out.persisted = await navigator.storage.persisted();
  }catch(e){}
  var now = Date.now();
  out.health = !out.last ? 'none' : (out.verified && out.verified >= out.last - 60000 && now - out.verified < 3*DAY_MS) ? 'good' : (now - out.last < 3*DAY_MS ? 'unverified' : 'old');
  return out;
}
function openRecoverySheet(){
  if(!secAllow('manager', 'the recovery page')) return;
  var ov = openSheet('<div class="sheet-head"><h2>'+tr('Backup and recovery')+'</h2></div><div id="rcBody"><div class="empty"><div class="t">'+tr('Checking')+'</div></div></div>' +
    '<div class="actions"><button class="btn btn-primary btn-block" id="rcNow" type="button">'+tr('Back up and verify now')+'</button></div>' +
    '<div class="actions"><button class="btn btn-ghost btn-block" id="rcList" type="button">'+tr('Recovery points and restore')+'</button></div>' +
    '<div class="actions"><button class="btn btn-ghost btn-block" id="rcFull" type="button">'+tr('Download a full copy')+'</button></div>' +
    '<div class="banner" style="display:block;margin-top:10px;">'+tr('A backup only counts once it has been read back and checked. Copies kept only on this device are lost if the device is lost or its browser data is cleared, so download a copy and keep it somewhere else. Pesa cannot promise that data is permanently safe.')+'</div>');
  async function paint(){
    var s = await recoveryStatus(), pct = s.quota ? Math.round(s.used/s.quota*100) : null;
    var hl = { good:['Verified','ok'], unverified:['Saved, not yet verified','warn'], old:['Out of date','bad'], none:['No backup yet','bad'] }[s.health];
    function row(t, v, lvl){ return '<div class="row"><div class="main"><div class="title">'+tr(t)+'</div></div><div class="trail" style="text-align:right;'+(lvl==='bad'?'color:#c0392b;':lvl==='warn'?'color:#b9770e;':'')+'">'+v+'</div></div>'; }
    ov.querySelector('#rcBody').innerHTML = '<div class="rowlist">' +
      row('Last successful backup', s.last ? esc(fmtDateTime(new Date(s.last).toISOString())) : tr('Never'), s.last?'':'bad') +
      row('Backup health', tr(hl[0]), hl[1]) +
      row('Unsynced records', s.syncState === 'off' ? tr('Cloud connection is off') : String(s.unsynced), s.unsynced > 0 ? 'warn' : '') +
      row('Recovery points', s.points < 0 ? tr('Not available here') : String(s.points), s.points === 0 ? 'bad' : '') +
      row('Storage available', s.quota ? esc(fmtBytes(Math.max(0, s.quota - s.used))) + ' ('+(100-pct)+'% '+tr('free')+')' : tr('Unknown'), pct !== null && pct > 85 ? 'bad' : '') +
      (s.persisted === false ? row('Protected from clean up', tr('No'), 'warn') : '') + '</div>';
  }
  ov.querySelector('#rcNow').addEventListener('click', async function(){
    var b = ov.querySelector('#rcNow'); b.disabled = true;
    var snap = await Backups.make('manual'); var ok = snap ? await backupVerifyKey(snap.key) : false;
    b.disabled = false; toast(snap ? (ok ? tr('Backup saved and verified') : tr('Backup saved but could not be verified')) : tr('Could not save a backup')); paint();
  });
  ov.querySelector('#rcList').addEventListener('click', function(){ openBackupsSheet(); });
  ov.querySelector('#rcFull').addEventListener('click', function(){ if(secAllow('owner', 'downloading a full copy')) secReauth('Download a full copy of the business data', exportData); });
  paint();
}

/* ---------------- Accounting Integrity Report ---------------- */
async function integrityChecks(){
  var r = [];
  function add(group, name, ok, detail, level){ r.push({ group:group, name:name, ok:!!ok, detail:detail || '', level:level || (ok ? 'ok' : 'fail') }); }
  try{ taxSelfTest().forEach(function(t){ add('VAT and rounding', t.name, t.ok, t.ok ? '' : 'got ' + t.got + ', expected ' + t.want); }); }catch(e){ add('VAT and rounding', 'Tax self test', false, String(e && e.message || e)); }
  try{ var av = auditVerify(); add('Audit trail', 'Audit log chain is unbroken (' + av.checked + ' entries checked)', av.ok, av.ok ? (av.legacy ? av.legacy + ' older entries have no fingerprint.' : '') : av.problems.slice(0, 3).join(' ')); }catch(e){ add('Audit trail', 'Audit chain check', false, String(e && e.message || e)); }
  try{
    var G = await acctGather(), B = acctBuild(G), v = acctView(G, B, B.start || todayKey(), todayKey());
    acctChecks(G, B, v).forEach(function(c){ add('Books', c.text, c.level !== 'fail', '', c.level === 'fail' ? 'fail' : (c.level === 'warn' ? 'warn' : 'ok')); });
    var bad = 0; B.journals.forEach(function(j){ var d = 0, c = 0; j.lines.forEach(function(l){ d += l.dr; c += l.cr; }); if(d !== c) bad++; });
    add('Books', B.journals.length + ' journals checked, each must balance to the cent', bad === 0, bad ? bad + ' do not balance.' : '');
  }catch(e){ add('Books', 'Books could not be built', false, String(e && e.message || e)); }
  try{
    var over = 0, noRef = 0, dupNo = {}, dups = 0, tot = 0;
    State.sales.forEach(function(s){
      if(s.refundOf || s.isRefund) return;
      try{ if(saleRefunds(s).reduce(function(a, x){ return a + Math.abs(Number(x.total) || 0); }, 0) > (Number(s.total) || 0) + 0.005) over++; }catch(e){}
    });
    State.invoices.forEach(function(i){ var n = i.number || i.invoiceNumber; if(!n) return; if(dupNo[n]) dups++; dupNo[n] = 1; tot++; });
    add('Documents', 'No sale is refunded for more than it was sold for', over === 0, over ? over + ' sale(s) have refunds above the sale total.' : '');
    add('Documents', 'Invoice numbers are unique (' + tot + ' checked)', dups === 0, dups ? dups + ' duplicate number(s). Check the invoice list.' : '');
  }catch(e){}
  try{
    var neg = State.products.filter(function(p){ return !p.isMock && p.stock !== undefined && p.stock !== null && Number(p.stock) < 0; }).length;
    add('Stock', 'No product has negative stock', neg === 0, neg ? neg + ' product(s) are below zero. Do a stock take or record the missing purchase.' : '', neg ? 'warn' : 'ok');
    var nocost = State.products.filter(function(p){ return !p.isMock && !(Number(p.cost) > 0); }).length;
    add('Stock', 'Every product has a cost price', nocost === 0, nocost ? nocost + ' product(s) have none, so profit on them is not reliable.' : '', nocost ? 'warn' : 'ok');
  }catch(e){}
  try{
    var m = State.sales.filter(function(s){ var t = Number(s.total); return !isFinite(t) || t < 0 && !(s.refundOf || s.isRefund); }).length;
    add('Sales', 'Every sale has a valid amount', m === 0, m ? m + ' sale(s) have a missing or negative amount.' : '');
  }catch(e){}
  return r;
}
async function openIntegritySheet(){
  if(!secAllow('manager', 'the integrity report')) return;
  var ov = openSheet('<div class="sheet-head"><h2>'+tr('Accounting integrity report')+'</h2></div><div id="igBody"><div class="empty"><div class="t">'+tr('Running checks')+'</div></div></div>' +
    '<div class="banner" style="display:block;margin-top:10px;">'+tr(TAX_DISCLAIMER)+'</div>');
  var rows = await integrityChecks(), pass = rows.filter(function(x){ return x.level === 'ok'; }).length, fail = rows.filter(function(x){ return x.level === 'fail'; }).length, warn = rows.filter(function(x){ return x.level === 'warn'; }).length;
  var groups = {}; rows.forEach(function(x){ (groups[x.group] = groups[x.group] || []).push(x); });
  var html = '<div class="banner" style="display:block;"><b>'+pass+'</b> '+tr('passed')+' · <b>'+fail+'</b> '+tr('failed')+' · <b>'+warn+'</b> '+tr('to review')+' · '+esc(fmtDateTime(new Date().toISOString()))+'</div>';
  Object.keys(groups).forEach(function(g){
    html += '<div style="font-weight:700;margin:12px 0 4px;">'+tr(g)+'</div><div class="rowlist">' + groups[g].map(function(x){
      var mark = x.level === 'ok' ? '✔' : (x.level === 'warn' ? '!' : '✖'), col = x.level === 'ok' ? '#1e8449' : (x.level === 'warn' ? '#b9770e' : '#c0392b');
      return '<div class="row"><div class="main"><div class="title">'+esc(x.name)+'</div>'+(x.detail?'<div class="sub">'+esc(x.detail)+'</div>':'')+'</div><div class="trail" style="color:'+col+';font-weight:700;">'+mark+'</div></div>';
    }).join('') + '</div>';
  });
  ov.querySelector('#igBody').innerHTML = html;
  logAudit('other', 'integrity', null, 'Integrity report run: ' + pass + ' passed, ' + fail + ' failed, ' + warn + ' to review');
}

/* ---------------- Privacy and data controls ---------------- */
var PRIVACY_NOTE = 'Designed to support privacy and applicable legal requirements. The business owner remains responsible for lawful use of customer and employee information.';
function privacyServices(){
  var out = [{ n:'This device', d:'All records are stored in this browser by default.', on:true }];
  try{ var c = Sync.cfg(); out.push({ n:'Cloud connection (Supabase)', d:'Business records are uploaded to the server you set up' + (E2E.ok() ? ', encrypted on the device first.' : ', not end to end encrypted.'), on:!!c.on }); }catch(e){}
  try{ if(State.settings.fiscal && State.settings.fiscal.enabled) out.push({ n:'Tax record module', d:'Records are kept in a local outbox and are only sent if a tax endpoint is configured.', on:true }); }catch(e){}
  out.push({ n:'Receipts and messages you send', d:'Anything you share by WhatsApp, email or print leaves Pesa and goes to that service.', on:true });
  return out;
}
function privacyCustomerExport(c){
  return gatherLedgers().then(function(l){
    return { exportedAt:new Date().toISOString(), customer:c, ledger:l[c.id] || [], sales:State.sales.filter(function(s){ return s.customerId === c.id; }) };
  });
}
function privacyAnonymise(c){
  return refs.customers.doc(c.id).update({ name:'Anonymised customer', phone:'', email:'', address:'', idNumber:'', notes:'', anonymisedAt:new Date().toISOString() });
}
function openPrivacyControlsSheet(){
  if(!secAllow('owner', 'privacy and data controls')) return;
  var cust = State.customers.slice().sort(function(a, b){ return String(a.name || '').localeCompare(String(b.name || '')); });
  var ov = openSheet('<div class="sheet-head"><h2>'+tr('Privacy and data controls')+'</h2></div>' +
    '<div class="banner" style="display:block;">'+tr(PRIVACY_NOTE)+'</div>' +
    '<div style="font-weight:700;margin:12px 0 4px;">'+tr('Where your data goes')+'</div><div class="rowlist">' + privacyServices().map(function(s){ return '<div class="row"><div class="main"><div class="title">'+tr(s.n)+'</div><div class="sub">'+tr(s.d)+'</div></div><div class="trail">'+(s.on?tr('On'):tr('Off'))+'</div></div>'; }).join('') + '</div>' +
    '<div style="font-weight:700;margin:12px 0 4px;">'+tr('One customer')+'</div>' +
    '<select class="input" id="pcCust"><option value="">'+tr('Choose a customer')+'</option>' + cust.map(function(c){ return '<option value="'+esc(c.id)+'">'+esc(c.name || '')+'</option>'; }).join('') + '</select>' +
    '<div class="actions"><button class="btn btn-ghost btn-block" id="pcExp" type="button">'+tr('Download this customer’s data')+'</button></div>' +
    '<div class="actions"><button class="btn btn-ghost btn-block" id="pcAnon" type="button">'+tr('Anonymise this customer')+'</button></div>' +
    '<div class="banner" style="display:block;margin-top:6px;">'+tr('Anonymising removes the name, phone, email, address, ID number and notes. Sales and totals stay so your books and tax records still add up. It cannot be undone.')+'</div>' +
    '<div style="font-weight:700;margin:12px 0 4px;">'+tr('Keeping records')+'</div>' +
    '<div class="banner" style="display:block;">'+tr('Tax and accounting records are usually kept for a set number of years. Check the period that applies to you with your accountant before deleting anything. Pesa never deletes sales or invoices on its own.')+'</div>' +
    '<div style="font-weight:700;margin:12px 0 4px;">'+tr('Tax and records notices')+'</div>' +
    '<div class="banner" style="display:block;">'+tr(TAX_DISCLAIMER)+'</div><div class="banner" style="display:block;margin-top:6px;">'+tr(ERECORD_NOTE)+'</div>' +
    '<div class="banner" style="display:block;margin-top:6px;">'+tr('Every export, anonymise and delete is written to the audit log with who did it and when.')+'</div>');
  function pick(){ var id = ov.querySelector('#pcCust').value; var c = cust.find(function(x){ return x.id === id; }); if(!c) toast(tr('Choose a customer first')); return c; }
  ov.querySelector('#pcExp').addEventListener('click', function(){
    var c = pick(); if(!c) return;
    secReauth('Download personal data of ' + (c.name || 'a customer'), function(){
      privacyCustomerExport(c).then(function(p){ logAudit('other', 'privacy', c.id, 'Customer data exported'); downloadTextFile('pesa-customer-'+todayKey()+'.json', JSON.stringify(p, null, 2)); });
    });
  });
  ov.querySelector('#pcAnon').addEventListener('click', function(){
    var c = pick(); if(!c) return;
    confirmSheet(tr('Anonymise this customer?'), tr('Their personal details are removed for good. Sales and balances stay.'), tr('Anonymise'), function(){
      secReauth('Anonymise ' + (c.name || 'a customer'), function(){
        privacyAnonymise(c).then(function(){ logAudit('update', 'privacy', c.id, 'Customer anonymised'); toast(tr('Customer anonymised')); closeModal(); });
      });
    }, true, true);
  });
}
