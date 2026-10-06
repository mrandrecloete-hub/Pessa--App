/* ============================== PESA AI ASSISTANT (built in agent) ==============================
 * A background helper that lives inside the app. It needs no outside tool to run.
 *  - Starts when the app boots and is called from the half hour check loop (agentTick), plus a short delayed nudge when
 *    sales or till records change (this also fires when the Advanced Pesa Connection brings in new records).
 *  - Offline first: it reads only the records already on this device (State). Whatever it writes goes through the
 *    normal data layer, so offline results wait in the same waiting line as every other change and send when the
 *    connection returns. Nothing here talks to the network unless the owner sets an optional AI wording address.
 *  - Three jobs: Smart Reorder (daily), Risk and Audit Watchdog (every check), Automated Accountant (month end).
 *  - It speaks through Messages as "Pesa AI Assistant" and leaves notes in the Alert centre.
 *  - Only an owner or manager device does the work, and every note has a fixed id for its day, so two devices
 *    never create the same note twice.
 * Notes are signs worth checking, not proof that anyone did anything wrong. */
var AGENT_ID = 'pesa-ai', AGENT_NAME = 'Pesa AI Assistant';
var _agent = { busy:false, nudge:0, last:0, lastRun:{}, started:false };

function agentOn(){ var s = State.settings || {}; return s.agentOff !== true; }
function agentCanRun(){
  try{ return !!(State.session && isManagerOrOwner() && agentOn() && !isRestricted()); }catch(e){ return false; }
}
function agentReady(){
  var r = State.ready || {};
  return !!(r.products && r.sales && r.settings && r.users && r.tills && r.messages);
}
function agentOnline(){ try{ return navigator.onLine !== false; }catch(e){ return true; } }
function agentHash(str){ var h = 5381, i; for(i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
function agentNotesList(){ return Array.isArray(State.agentNotes) ? State.agentNotes : []; }
function agentHas(id){ return agentNotesList().some(function(n){ return n.id === id; }); }

/* Optional wording polish through an address the owner sets (for example their own secure function). The key never
   lives in the app. Off unless State.settings.agentAiUrl is set, and the plain text is always kept if it fails. */
function agentPolish(text){
  var url = (State.settings || {}).agentAiUrl;
  if(!url || !agentOnline() || typeof fetch !== 'function') return Promise.resolve(text);
  return fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ task:'rewrite', text:text }) })
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(j){ return (j && typeof j.text === 'string' && j.text.length < 2000) ? j.text : text; })
    .catch(function(){ return text; });
}

/* Writes one note. Same id on the same day means it is only written once. */
function agentNote(id, note){
  if(agentHas(id)) return false;
  var doc = Object.assign({ createdAt:new Date().toISOString(), level:'info', status:'new', by:AGENT_NAME }, note);
  try{ State.agentNotes = [Object.assign({ id:id }, doc)].concat(agentNotesList()); }catch(e){}
  try{ refs.agentNotes.doc(id).set(doc); }catch(e){}
  return true;
}

/* Sends a message as the assistant. to is a staff id or 'all'. */
function agentSay(to, title, body, urgent){
  try{
    var tu = (State.users || []).find(function(u){ return u.id === to; });
    refs.messages.add({ to:to, toName: tu ? tu.name : 'All employees', fromId:AGENT_ID, fromName:AGENT_NAME, kind:'message', urgent:!!urgent,
      title:title, body:body, readBy:{}, createdAt:new Date().toISOString() });
  }catch(e){}
}
function agentOwnerIds(){
  return (State.users || []).filter(function(u){ return u.role === 'owner' && u.active !== false; }).map(function(u){ return u.id; });
}
function agentTellOwner(title, body, urgent){ agentOwnerIds().forEach(function(id){ agentSay(id, title, body, urgent); }); }

/* ---- job 1: Smart Reorder, once a day ---- */
function agentReorder(){
  var day = todayKey(), id = 'reorder-' + day;
  if(agentHas(id)) return;
  var list = reorderSuggestions().slice(0, 60);
  if(!list.length) return;
  var out = list.some(function(r){ return r.stock <= 0; });
  var lines = list.map(function(r){
    return { productId:r.product.id, name:r.product.name, stock:r.stock, qty:r.qty, perDay:Math.round(r.perDay * 100) / 100, daysLeft: r.daysLeft === Infinity ? null : Math.round(r.daysLeft * 10) / 10, supplierId:r.product.supplierId || '' };
  });
  var top = list.slice(0, 3).map(function(r){ return r.product.name; }).join(', ');
  var title = 'Draft reorder list ready: ' + list.length + (list.length === 1 ? ' product' : ' products');
  var body = 'Worked out from the last 30 days of sales. Most urgent: ' + top + '. Open the Reorder list to check the amounts before you order.';
  agentNote(id, { kind:'reorder', level: out ? 'high' : 'med', title:title, body:body, lines:lines, status:'draft', go:'reorder', label:'Open reorder list' });
  agentTellOwner('Reorder draft is ready', body, false);
}

/* ---- job 2: Risk and Audit Watchdog ---- */
function agentRiskFindings(){
  var out = [], now = Date.now(), d1 = now - 86400000, d7 = now - 7 * 86400000, k;
  // repeated till shortages at cash up (last 7 days)
  var short = {};
  (State.tillSessions || []).forEach(function(t){
    if(t.status === 'closed' && t.variance < -0.009 && new Date(t.closedAt || t.openedAt).getTime() >= d7){
      var m = short[t.cashierName || 'Unknown'] || (short[t.cashierName || 'Unknown'] = { n:0, total:0, last:'' }); m.n++; m.total += -t.variance; m.last = t.closedAt || t.openedAt;
    }
  });
  Object.keys(short).forEach(function(c){
    var m = short[c];
    if(m.n >= 2) out.push({ key:'short|' + c + '|' + m.n, level:'high', title:c + ': till short ' + m.n + ' times this week', body:'A total of ' + fmtMoney(m.total) + ' short at cash up. Check the till sessions and talk to ' + c + '.' });
  });
  // many records removed in the last day
  var del = {};
  (State.auditLog || []).forEach(function(a){
    if((a.action === 'delete' || a.action === 'invoice_deleted') && new Date(a.createdAt).getTime() >= d1){ var u = a.userName || 'Unknown'; del[u] = (del[u] || 0) + 1; }
  });
  Object.keys(del).forEach(function(u){
    if(del[u] >= 3) out.push({ key:'del|' + u + '|' + del[u], level:'med', title:u + ' removed ' + del[u] + ' records in one day', body:'Open the Activity log to see what was removed and why.' });
  });
  // alcohol or tobacco marked tax exempt, or sold below cost (last 7 days)
  var byId = {}; (State.products || []).forEach(function(p){ byId[p.id] = p; });
  var ex = [], below = [];
  (State.sales || []).forEach(function(s){
    if(new Date(s.createdAt).getTime() < d7) return;
    (s.items || []).forEach(function(it){
      var p = byId[it.productId] || {}, sin = EL_SIN.test(String(it.name || p.name || ''));
      if(!sin) return;
      var cost = Number(it.cost) || Number(p.costPrice) || 0, price = Number(it.unitPrice) || 0;
      if((p.taxCategory === 'EXEMPT' || it.taxCategory === 'EXEMPT')) ex.push(it.name || p.name);
      if(cost > 0 && price < cost) below.push(it.name || p.name);
    });
  });
  if(ex.length) out.push({ key:'ex|' + ex.length + '|' + ex[0], level:'high', title:'Alcohol or tobacco sold as tax exempt', body:ex.length + ' sale lines this week, for example ' + ex[0] + '. These are normally charged VAT at the standard rate. Check the product tax category.' });
  if(below.length) out.push({ key:'below|' + below.length + '|' + below[0], level:'high', title:'Alcohol or tobacco sold below cost', body:below.length + ' sale lines this week, for example ' + below[0] + '. Check the selling price and the cost price.' });
  return out;
}
function agentWatchdog(){
  var day = todayKey();
  agentRiskFindings().forEach(function(f){
    var id = 'risk-' + agentHash(f.key) + '-' + day;
    if(agentNote(id, { kind:'risk', level:f.level, title:'Risk warning: ' + f.title, body:f.body, status:'new', go:'risk', label:'Open risk warnings' })){
      agentTellOwner('Risk warning', f.title + '. ' + f.body, f.level === 'high');
      try{ logAudit('other', 'agent', null, 'Pesa AI Assistant raised a risk warning: ' + f.title); }catch(e){}
    }
  });
}

/* ---- job 3: Automated Accountant, the moment a month has finished ---- */
function agentAccountant(){
  if(typeof acctFileMissing !== 'function' || _acctBusy) return;
  var r = State.ready || {};
  if(!(r.accountingPeriods && r.sales && r.expenses && r.products && r.customers && r.settings && r.company && r.wastage && r.suppliers && r.supplierInvoices && r.supplierPayments)) return;
  var now = new Date(), prev = new Date(now.getFullYear(), now.getMonth() - 1, 1), key = periodKeyOf(prev);
  var filed = (State.accountingPeriods || []).some(function(p){ return p.periodKey === key; });
  if(filed) return;
  _acctBusy = true;
  acctFileMissing('agent').then(function(n){
    _acctBusy = false;
    if(n > 0){
      var body = n + (n === 1 ? ' month was' : ' months were') + ' filed with its trial balance, income statement and VAT working figures, each with its verification fingerprint. Open Accountant to review it. Figures are for your records and are to be confirmed with the relevant legal bodies, authorities and entities of Namibia.';
      agentNote('acct-' + key, { kind:'accounts', level:'info', title:'Monthly accounting pack filed', body:body, status:'done', go:'accountant', label:'Open Accountant' });
      agentTellOwner('Monthly accounting pack filed', body, false);
    }
  }, function(){ _acctBusy = false; });
}

/* ---- the loop ---- */
function agentTick(why){
  try{
    if(_agent.busy || !agentCanRun() || !agentReady()) return;
    _agent.busy = true; _agent.last = Date.now();
    try{ agentReorder(); }catch(e){}
    try{ agentWatchdog(); }catch(e){}
    try{ agentAccountant(); }catch(e){}
    _agent.busy = false;
  }catch(e){ _agent.busy = false; }
}
/* called when sales or tills change (including records arriving live from the connection); waits a moment so a burst runs once */
function agentNudge(){
  if(_agent.nudge || !agentCanRun()) return;
  _agent.nudge = setTimeout(function(){ _agent.nudge = 0; if(Date.now() - _agent.last > 60000) agentTick('nudge'); }, 20000);
}
function agentStart(){
  if(_agent.started) return; _agent.started = true;
  try{ window.addEventListener('online', function(){ setTimeout(function(){ agentTick('online'); }, 4000); }); }catch(e){}
  setTimeout(function(){ agentTick('boot'); }, 30000);
}
/* the notes shown in the Alert centre (newest first, last 10 days, not dismissed) */
function agentAlerts(){
  try{
    if(!agentOn() || !(State.session && isManagerOrOwner())) return [];
    var since = Date.now() - 10 * 86400000;
    var seenReorder = false;
    return agentNotesList().filter(function(n){
      if(n.status === 'dismissed' || n.status === 'done' || new Date(n.createdAt).getTime() < since) return false;
      if(n.kind === 'reorder'){ if(seenReorder) return false; seenReorder = true; }
      return true;
    }).slice(0, 12).map(function(n){
      return { id:'agent-' + n.id, level:n.level || 'info', title:n.title, body:n.body, go:n.go, label:n.label };
    });
  }catch(e){ return []; }
}
/* the Pesa AI Assistant page */
function openAgentSheet(){
  var notes = agentNotesList().slice(0, 40), on = agentOn();
  var col = { high:'var(--danger)', med:'var(--warn, #d98e2b)', info:'var(--text-muted)' };
  var html = '<div class="sheet-head"><h2>' + tr('Pesa AI Assistant') + '</h2></div>' +
    '<div class="banner" style="display:block;">' + tr('Works quietly in the background from your own shop records on this device. It prepares a daily reorder draft, watches for signs worth checking, and files finished months in Accountant. These are signs worth checking, not proof that anyone did anything wrong. Anything it does while offline sends when the connection returns.') + '</div>' +
    '<div class="row"><div class="main"><div class="title">' + tr('Assistant is') + ' ' + tr(on ? 'on' : 'off') + '</div><div class="sub">' + tr(agentOnline() ? 'Connection is available' : 'Offline, using records on this device') + '</div></div>' +
    '<div class="trail"><button class="btn btn-ghost" id="agToggle" type="button">' + tr(on ? 'Turn off' : 'Turn on') + '</button></div></div>' +
    '<div class="actions"><button class="btn btn-primary btn-block" id="agRun" type="button">' + tr('Check now') + '</button></div>' +
    (notes.length ? '<div class="rowlist">' + notes.map(function(n, i){
      return '<div class="row"><div class="main"><div class="title" style="color:' + (col[n.level] || col.info) + ';">' + esc(n.title) + '</div><div class="sub">' + esc(n.body) + '</div><div class="sub">' + esc(fmtDateTime(n.createdAt)) + '</div></div>' +
        '<div class="trail">' + (n.status !== 'dismissed' && n.status !== 'done' ? '<button class="btn btn-ghost" data-ag-x="' + i + '" type="button">' + tr('Done') + '</button>' : '') + '</div></div>';
    }).join('') + '</div>' : '<div class="empty"><div class="t">' + tr('No notes yet') + '</div><div class="s">' + tr('The assistant will leave notes here and in the Alert centre.') + '</div></div>') +
    smartBackBtn();
  var ov = openSheet(html); wireSmartBack(ov);
  ov.querySelector('#agToggle').addEventListener('click', function(){ btSave({ agentOff: on }); closeModal(); openAgentSheet(); });
  ov.querySelector('#agRun').addEventListener('click', function(){ _agent.last = 0; agentTick('manual'); toast(tr('Checked')); closeModal(); openAgentSheet(); });
  ov.querySelectorAll('[data-ag-x]').forEach(function(b){ b.addEventListener('click', function(){
    var n = notes[+b.getAttribute('data-ag-x')]; if(!n) return;
    try{ n.status = 'dismissed'; refs.agentNotes.doc(n.id).update({ status:'dismissed' }); }catch(e){}
    closeModal(); openAgentSheet();
  }); });
}
