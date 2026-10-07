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
/* ---- pictures ---- */
var AGENT_ICON = 'data:image/webp;base64,UklGRgoPAABXRUJQVlA4WAoAAAAQAAAAXwAAXwAAQUxQSMkBAAABkFvbtttG9+NBY4EQmVwBrGVsTlJqgIvNYJGtyOU0ubyXcpfh//fuWDm8cExETAAeGnIAq+uj6ZmxlXY2Ha2vAsgDnlaAsrdxw5bfbPRKQJ4iCIrhKUlNam0xTUrydFhAwqMy4OsemZKx5ZYSufcVyB4heF2TUemiRrJ+DXmQoJowKd3UxEkFeYCgs8uGrjbc7UB+k4Vqn5HORu5XIftFkFczRrobOXsl4SdBzYYON6whAAQfGOly5AcIQlYcm/qkdlxkIceAkU5HDpCH8trUK7XrMqDLRLcTu8COeWY7WLyn+WW8X+xT6biyP2byLHE8p3qmnF/RPDNe8b////x4RfPMeDWneqacj5k8Sxz3qZ4p+4v3NL+M94vYseRXsh2gS8/YRSivTb1Suy5DjgGjV5ED5CErjk19UjsusgDBB0afIj9AAAhqNh41rCEAEOTVjNGfyNkrCT8hC9U+ozeR+1XI8GtBZ5eNLw13OxD8XlBNmNQPTZxUEDxU8Lomo/qgkaxfQ/DwDPi6R6ZkbbOUyL2vQIbHBkExPCWpSa0tpklJng4LSMATClD2Nm7Y8puNXgkInjbkAFbXR9Mza4edTUfrqwDygIcCAFZQOCAaDQAAsDMAnQEqYABgAD4xFodCoiELjcOYEAGCWwAxjfRB9fI/kV7JVa/sH4W9c3bZFZ7Sf1P3Z/Az1C/oP2AP1U6Vf7UeoT9iP+l/hveA/vn7Y+4/+3f432AP6f/n/SA9in0AP2F9MP9qvgm/bT90/gZ/Yb/+dYBzr59PhX+I/Ov3f8qv6vvU2ov8k+235H8yvyk+HP7j4U/D3+c9Qj8V/l39y34WrHoEeuPz3/Lfmx/hvJy9H/mi9Eb/d/lv613hQeFfo78AH84/tn+l+6D6Yf5z/vf5z8wPan8+f8f/MfAR/Kv6X/pv7j+8n+T///1Zeyz9nvZK/WgjUbapugWt2C96iWqEE0ESw43oMZDsHg0wMNuBqnVSGv/+fTCb7HIdXyFj43edpNpKk8Tqt3Qh15G8UTfykrEcuFi45HW2eCTXkhqDhxfEOLeUCOOsib3IJQ7/k/Wdd/y5ZCuKt57hn549w9OL2WmTlq4quddUzYgt0j3q+VeWLfv3592vjv/3KDDZKi4kTzomVMQXlnwC2LtjMkHSI37wleTw6PTXhJIBgwE/CdNeXgAA7RsuOxl3cGZWyyjAivtIrjWouoxgJlFwqMxr4Nd1xEba1lNzamqrC9NmXAXOVcnTU+AqDOwNaX7iSg/EjSCedl79NG6vYn9hmY9RcFjlRqbPkxOMS7FqLQ40UF+GS9+0UOtZn//hlFOR1ka+MNwv2E+vGIjabGG/w1I2aFSytuOmgkazI9k48sqEOjdXdc6j54o89CLoPg9R6XUx4aDWdhyMIAhqjJe7CEdz0okX/ZfBxY6ogaKQREyxjqO+CLMeit4uTzqzccFTm6NWs3oyeG/+ZM+tJdBTxLE1ybjzK4c2HKjWWA2VPK3wLDldTum7Eq36zQB9dABHf19lrZkPXsCGmUTU3ozhRwlcqD6VqYVfD8Rfh5Rs8wvgh0lOTpDO1ezIqqs3IOFmWmp+YnPVwPuicvwcrtRf+R3h6VRUYG+wqDSoBS9oAgg/bp0yRNUxXIj/hzOF4qCASttBQU5Jq0MhbZH0okGp5VPFbjfpn4t9Uy9fczWsW8GGlJhKajpnyl5spkLJy0+T0J1dK8bIbGl4X/LzbpKrXJWXo/+laWolfqmUIl/RmESERrPwB+BtaHQ8B+9LPxiKsDluRmOYgCQ8OST6B/hx1uQtWloHiiZcB484f4gDZLxisQO5qT1Oc884jNuY0tzobfZV0OsxiI+ciP8ulfhqcGQ/QHS475xvlOrKeZNVaoO6wjsPojd6k5hmMmom8SuuMPZ019gl0E6HGJNK7zBGxoAlp7DOfhSoz5Q8nxJbwjRvzTljzGyTXBXnzjpoWFBxgrhLy0oQJAh9xzP5DPO04g7hkMrET69k5QOwQJ4jGCsNGmg4eruKKgVml8SNw/h9yTJy73Tu9GbAgzvV9byI+FIG9DkOZpzJ3zt/5DMvN2iKm6OpPh4jVvWSD5iNzOA7pDK9pY4umf+iBhtG10KSxllAumFsylrVostNxCa2R+y2U0dPnw5/5Dl7RmkkPTJZMrt0awUknWf8J03K/7fCBWX7JlywapFN68LJW8O5ObACDhy8f3Ejp7RdO37yWU9q19veLh64Utvdz+S3dmNOMGTA996WKvEArDrIm9sMLonzApU0tGZgsNvoJ/hA2HVTNoUMn0cpyiOcTKBV3uUVY0fizp0OUCYcWpaRHht3flmGqOK09eSh659IQTL800d6VQheihEDGekQp1CRPN71KHvYr634nhYH9b4Mm5pAICfm77TXvZhuwNQ5yB8Lw1WWOuEOS7uQcuQmMLzVzWuFEfyHYULrCHnw11p1H4INopJYFSe8nmaHA0UJbKzst1o5GvhOzdwO0xxXY25ppQOy0+kY3jfSwikR/+uKXRFAasl78eZXb/8FBT9DI7Gx/wG5fFz0nt11ogXJeRCWcGiyeIJMr5cCK3eY2NEAAxIXzlimSqcMAfJzwLUJRoebw7Tfnkmpg76IZQ6H1SJKY6rNR7CTjKF1k54+Tek9tOcdbGT8d1BCUDJ2x0se8J6M0bPHR1W3zJjd7jGEHUQFxQpEJWj9Bei1VL9/u4DSGQ6HhQspf6Kngnmh7PfLiePAxRRdXcutDbffO/0mgGBRz07GoiFU1T/pzYibTw3SEG4yyhUcwnFNWN//B2lmhZ2luYNROALZ/l8/pdzz9or606BmACMiu7V7K5WFsve0CSC/aN59nsOWVbgPQzgygT7qtKh8Xfhz0qzebj3zL+VoXVdKf9aVy7IXyTk7jIqFse6oOdZprYQ04dEFcq9JpFIAtVsw8Tp4LFJ2FjjnF2jzOOhQ6hm3syeZRPYP1wWogi5/N9g1lMJ8i56mnBdHjOQQijtf+B2xGgcEmrHCWk0dvNyOmX33ucSGFZ9jLBXN0soAIbTwRWrBnUePFzH5hxk8aOJBs3SSIT1A+vM+orcOi1bMivaEethTgHkGsg7QHRB/BYTaajB6NzPlzDipEQ+hGQRMeHR0H6utRhbKE2HPiMdf5wtmorqNHK+rCwRCE5giy0366r4Cpo1HtyKI5pzoFzCUDK3QIcSSwShB7H73aIt0Pk3GdCjBtCpV24pIPRPOt/hce5V+X5foTYAJ2oGLfJGI+8+tbHLUa6K8/+aWuGRi1R7dIJHxMcq/vhNWs8dszPDrqseQWywwDib09vMNuO7iTxMKMcSSfOcLTOCXARVFV/+vQPv6I9KuhB+1cmztgMB/3E/0L4O12xWjEmQEUctihHZWLoj1FhvxEGd4DB1ECwJLHJqUd4+nkvyR5uwd3oLmNAd2AJ5jbU+EnxiWu9a0YcF5DmFA5oIQhgcPmqS51qMvZnn/tfDZFUo8DmsAnPjECW+IZW1h9eyHPnUnIkqawm/RctIZgfMWrJxubjsV3CuoyP8MqkyaFwxP5sovRq75chLevK9edE57hdYJZAy7+FSzb0aXmgwP2dyU/NV678x73soU4pe9H3eF3nQyYjY6YzfLB+t3lN8jaqWGaHJJLZOR5ydfbX8OgiSs52gaKw9eunPkAatPSSTBox6pgFalwfoSf+AdIm187m8wdioFXujD3qJKroR8oPzuTWfw1WWr176FbnYcS1b9EdlkOj49o0BWqE51o1xzxgV2pATA1K1CHO1AARtpOP4uzxLRra13gxOcJcEqgvJHh8NqtiIqhLSMI4I04quYrgBa+h8swHr8D2Bxkvj/waflIIMeQIcqL5Px5eC/SvQntF16QEUH3lB5XruH2vktx0nMnw7o6szkVjh3v5Zs3QGlPZgJltPa1/Llv9/dWvxgBQt3xk7hc3WI3BtptYlHb1rAcymE82sHQTMw9VvBTRx58Z5l8HvVSuFiIYnhRGSHEYVzm9X96E0+CdN8SEBrU7bEO/cGXWGZBE6uPxGuU/Deywp+EOiYWqgp8f/pePOrfl29OCMWZhgO/89co0IdOaxLNu47fitUYrcDz3xT8Wd7maGq9MKEDbj6MQqbDGz4g0U6cspZFeYt9i/N8eC2O63fELA3kuUkQKvXiXfe6sdUwxf8sYstsZXaJ4q89ySXfw4QWyIuH//PxB5xLfeM2I9fDixVenChOf+JnIMgKbvpHg6wiSsOfURnRhtKiIl8EF3fyRdzk1tkPC709PZtUtzvmP5BV+vNUwDxfALJtHYeMK1CH5QTwyEeWYhLcHInDKGzi1+1ubNdnZqoD0gqSjt1GGXaiphBKVPQxFQBiQIIa51354rDbKAp8YWL+sKIrFaEEgNaTWwTz1CwK6CxMLZURpZ84yZKuN+RVRvAw2aW52xZeB8LhEEjA7hQhzO5Go83DNovU/C3J/XHm4oX9UHu26aT4ORwprpzi30oWjpoQD48UqxvIRgw99qHP7zNVQtn2b88ivjxdgysgfvg5QT+EJ3M9XiI+khiZm7UCV+y7PHvUmOADraAMBoQBzyqployWvX91fhLvs8Pcm1SKnWrA9iFCbsOypuxGfCsk3pnCX+Ii/z+LAU2XepXWqrSvtxHMC8BZtsuRn9JBcMhOmI62pl9kcuQ5RmUnn6lBglq3ENPjCEGroJp5kD4Lt3tNiDlKOFzrdZKwgdThq7wDdIDrBdt4AKp9D/OgXMGaplSfFeIMf4tRo0+rY7e6kELSDMTTSkyT2BNGiViUYYic15zSlBlTh7J/zRmz/6bZCJYm/prFCE+owuV1Tkf2sipFjRBw6HGWJ8t+lExO5+Q8Wx9X3QOEAkqXZvZ/1w3Uz3lK4UAKNvY2Fj6LHY2HoTRPumMoKdKl68GdGGzKrWhaLkt+DvtRHK18sIhB+qTivUrXLlnSl+mCywkAo4BoXlbpNtToso0hUP/pODRB7Cz6IT/jcdw87rP/CYvnJGPeE//nod07Js1jFALb7Lhzhiyz3M/a6FXi5QzfpOenBKeY+g3MYKvmdAah9m9V6Zk5d596kD8Lu2p59WnBb59OZSRSwPd8d2iVQFM9WvyoTwA';
var AGENT_ROBOT = 'data:image/webp;base64,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';
ICON3D.agent = AGENT_ICON; ICON3D_KEY.agent = 'agent';

/* ---- understanding what the owner asks, and doing it ----
 * Plain rules, no outside service. Questions are answered by Pesa Brain, pages are opened, and changes (an expense, a
 * product, stock, a price, a message, a month end) are shown first and only done after the owner taps Confirm.
 * Removing records is never done here: it needs a manager or owner password and a reason on the page itself. */
var AGENT_PAGES = [
  [/stock take|stocktake|count stock/, 'stocktake', 'Stock take'], [/purchase order/, 'pos', 'Purchase orders'], [/supplier/, 'suppliers', 'Suppliers'],
  [/trial balance|accountant|accounting|bookkeeping|books\b|ledger/, 'accountant', 'Accountant'], [/\bvat\b/, 'vat', 'VAT'],
  [/branch/, 'branches', 'Branches'], [/wastage|shrinkage/, 'wastage', 'Wastage'], [/reconcil/, 'tab-reconcile', 'Reconciliation'],
  [/employee|staff|team/, 'tab-team', 'Employee tracking'], [/invoice/, 'tab-invoices', 'Invoices'], [/expense/, 'tab-expenses', 'Expenses'],
  [/\btill\b|cash up/, 'tab-till', 'Till'], [/credit|debtor|customer/, 'tab-credit', 'Credit'], [/report/, 'tab-reports', 'Reports'],
  [/insight/, 'insights', 'Sales insights'], [/business tools|import|labels/, 'bizhub', 'Business tools'], [/smart tools/, 'smart', 'Pesa Smart Tools'],
  [/message|inbox|chat/, 'inbox', 'Messages'], [/setting/, 'settings', 'Settings'], [/training/, 'training', 'Training'],
  [/privacy|legal/, 'legal', 'Legal and privacy'], [/\babout\b/, 'about', 'About Pesa'], [/dashboard|home/, 'tab-dashboard', 'Dashboard'],
  [/\bstock\b|inventory|product/, 'tab-stock', 'Stock'], [/\bsell\b|checkout|new sale|point of sale|\bpos\b/, 'tab-sell', 'Sell']
];
function agentFindProduct(text){
  var q = String(text || '').toLowerCase(), best = null;
  (State.products || []).forEach(function(p){
    var n = String(p.name || '').toLowerCase(); if(!n) return;
    if(q.indexOf(n) > -1 && (!best || n.length > best.name.length)) best = p;
  });
  return best;
}
function agentFindUser(text){
  var q = String(text || '').toLowerCase(), best = null;
  (State.users || []).forEach(function(u){
    var n = String(u.name || '').toLowerCase(); if(!n || u.active === false) return;
    var first = n.split(' ')[0];
    if(new RegExp('\\b' + first.replace(/[^a-z0-9]/g, '') + '\\b').test(q) && (!best || first.length > best.first.length)) best = { u:u, first:first };
  });
  return best ? best.u : null;
}
function agentNum(s){ var m = String(s || '').match(/(\d+(?:[.,]\d+)?)/); return m ? parseFloat(m[1].replace(',', '.')) : NaN; }
function agentMoneyAfter(q, words){ var m = q.match(new RegExp('(?:' + words + ')\\s*(?:of|is|at|to|for|=)?\\s*n?\\$?\\s*(\\d+(?:[.,]\\d+)?)')); return m ? parseFloat(m[1].replace(',', '.')) : NaN; }

function agentParse(raw){
  var text = String(raw || '').trim(), q = text.toLowerCase().replace(/[?!.]+$/, ''), m, p;
  if(!q) return { text:'Type or say what you need, for example: how much did I sell today?' };
  var staff = true; try{ staff = isManagerOrOwner(); }catch(e){}
  if(!staff) return { text:'The assistant helps owners and managers.' };

  // removals are never done from here
  if(/^(delete|remove|erase|clear|wipe)\b/.test(q)) return { text:'Removing records needs a manager or owner password and a reason, so I will not do it from here. Open the page and remove it there.', go:'', pages:AGENT_PAGES.filter(function(x){ return x[0].test(q); }).slice(0, 1) };

  // add an expense
  if((m = q.match(/\b(add|record|log|capture)\b.*\bexpense\b/)) || /^(paid|spent)\b/.test(q)){
    var amt = agentNum(q.replace(/expense/g, ''));
    if(!isFinite(amt) || amt <= 0) return { text:'How much was the expense? For example: add expense 150 for transport.' };
    var cat = (EXPENSE_CATEGORIES || []).find(function(c){ return q.indexOf(c.toLowerCase().split('/')[0]) > -1; }) || 'Other';
    var note = (q.match(/\bfor\s+(.+)$/) || [])[1] || ''; if(note && cat.toLowerCase().indexOf(note.toLowerCase()) === 0) note = '';
    return { text:'Record an expense of ' + fmtMoney(amt) + ' under ' + cat + (note ? ' (' + note + ')' : '') + '?', confirm:function(){
      refs.expenses.doc().set({ category:cat, amount:amt, note:note, paidFrom:'Cash drawer', ref:'', createdAt:new Date().toISOString() });
      logAudit('create', 'expense', null, 'Pesa AI Assistant added expense ' + fmtMoney(amt) + ' (' + cat + ') at the owner request'); syncNowSafe();
      return 'Expense recorded.';
    } };
  }
  // send a message or an instruction to staff
  if((m = q.match(/^(?:send (?:a )?message to|message|tell|instruct|notify|ask)\s+(everyone|all(?: employees| staff)?|[a-z]+)\b[\s:,]*(?:to |that )?(.*)$/)) && m[2]){
    var all = /^(everyone|all)/.test(m[1]), who = all ? null : agentFindUser(m[1]);
    if(!all && !who) return { text:'I could not find a staff member called ' + m[1] + '. Check the name under Employee tracking.' };
    var body = text.slice(text.toLowerCase().indexOf(m[2])), instr = /^(tell|instruct|ask)\b/.test(q);
    return { text:'Send ' + (instr ? 'an instruction' : 'a message') + ' to ' + (who ? who.name : 'all employees') + ': "' + body + '"?', confirm:function(){
      var me = State.session ? State.session.name : 'the owner';
      refs.messages.add({ to: who ? who.id : 'all', toName: who ? who.name : 'All employees', fromId:AGENT_ID, fromName:AGENT_NAME, kind: instr ? 'instruction' : 'message', urgent:false,
        title: instr ? 'Instruction from ' + me : 'Message from ' + me, body:body, readBy:{}, createdAt:new Date().toISOString() });
      logAudit('other', 'message', null, 'Pesa AI Assistant sent a message to ' + (who ? who.name : 'all employees') + ' for ' + me); syncNowSafe();
      return 'Sent.';
    } };
  }
  // add a product
  if((m = q.match(/^(?:add|create|new)\s+(?:a\s+|new\s+)?product\s+(.+)$/))){
    var rest = m[1], nm = rest.split(/\s+(?:price|sell|selling|cost|stock|qty|quantity|at|for)\b/)[0].trim();
    var sell = agentMoneyAfter(rest, 'price|sell|selling|at|for'), cost = agentMoneyAfter(rest, 'cost'), qty = agentMoneyAfter(rest, 'stock|qty|quantity');
    if(!nm || !isFinite(sell)) return { text:'Tell me the name and the selling price, for example: add product Bread price 18 cost 12 stock 20.' };
    var nice = nm.replace(/\b\w/g, function(c){ return c.toUpperCase(); });
    if((State.products || []).some(function(x){ return String(x.name).toLowerCase() === nm; })) return { text:nice + ' is already in your stock list.', go:'tab-stock', label:'Open Stock' };
    return { text:'Add product ' + nice + ' at ' + fmtMoney(sell) + (isFinite(cost) ? ', cost ' + fmtMoney(cost) : '') + (isFinite(qty) ? ', stock ' + qty : '') + '?', confirm:function(){
      var nq = isFinite(qty) ? Math.round(qty) : 0, cp = isFinite(cost) ? cost : 0;
      if(nq) recordStockMove('manual', nq, nq * cp, nq * sell, 'Added ' + nice);
      refs.products.doc().set({ name:nice, category:'', unit:'', costPrice:cp, sellPrice:sell, stockQty:nq, lowStock:null, barcode:'', expiryDate:'', supplierId:'', createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() });
      logAudit('create', 'product', null, 'Pesa AI Assistant added ' + nice + ' at the owner request'); syncNowSafe();
      return nice + ' added.';
    } };
  }
  // add stock to a product
  if((m = q.match(/^(?:add|receive|restock|received)\s+(\d+)\s+(?:more\s+|units?\s+of\s+|stock\s+(?:to|for|of)\s+)?(.+)$/)) && (p = agentFindProduct(m[2]))){
    var add = parseInt(m[1], 10);
    return { text:'Add ' + add + ' to the stock of ' + p.name + ' (now ' + (p.stockQty || 0) + ', would be ' + ((p.stockQty || 0) + add) + ')?', confirm:function(){
      recordStockMove('manual', add, add * (p.costPrice || 0), add * (p.sellPrice || 0), 'Added stock to ' + p.name);
      refs.products.doc(p.id).update({ stockQty:(p.stockQty || 0) + add, updatedAt:new Date().toISOString() });
      logAudit('update', 'product', p.id, 'Pesa AI Assistant added ' + add + ' stock to ' + p.name); syncNowSafe();
      return 'Stock updated.';
    } };
  }
  // change a price
  if((m = q.match(/(?:set|change|update|make)\s+(?:the\s+)?(?:selling\s+)?price\s+(?:of\s+|for\s+)?(.+?)\s+(?:to|at)\s+n?\$?\s*(\d+(?:[.,]\d+)?)$/)) && (p = agentFindProduct(m[1]))){
    var np = parseFloat(m[2].replace(',', '.'));
    return { text:'Change the price of ' + p.name + ' from ' + fmtMoney(p.sellPrice || 0) + ' to ' + fmtMoney(np) + '?', confirm:function(){
      refs.products.doc(p.id).update({ sellPrice:np, updatedAt:new Date().toISOString() });
      logAudit('update', 'product', p.id, 'Pesa AI Assistant changed the price of ' + p.name + ' to ' + fmtMoney(np)); syncNowSafe();
      return 'Price changed.';
    } };
  }
  // put something in the cart
  if((m = q.match(/^(?:sell|add to (?:the )?cart|ring up)\s+(?:(\d+)\s+)?(.+)$/)) && (p = agentFindProduct(m[2]))){
    var n = Math.max(1, parseInt(m[1] || '1', 10));
    return { text:'Put ' + n + ' x ' + p.name + ' (' + fmtMoney(p.sellPrice || 0) + ' each) in the cart and open Sell?', confirm:function(){
      for(var i = 0; i < n; i++) addToCart(p.id);
      setTab('sell'); return 'In the cart. Take payment on the Sell page.';
    }, keepOpen:false };
  }
  // jobs the assistant runs itself
  if(/\b(back ?up)\b/.test(q) && /\b(make|do|run|take|create|now)\b|^back ?up/.test(q)){
    return { text:'Make a backup of your shop records on this device now?', confirm:function(){ return Backups.make('Pesa AI Assistant').then(function(){ return 'Backup saved.'; }, function(){ return 'The backup could not be saved.'; }); } };
  }
  if(/\b(file|close|run|do)\b.*\b(month|accounts|books)\b|month end|file (the )?accounts/.test(q)){
    return { text:'File every finished month in Accountant now (trial balance, income statement, VAT working figures, each with its fingerprint)?', confirm:function(){
      return acctFileMissing('agent').then(function(n){ return n ? n + ' month' + (n === 1 ? '' : 's') + ' filed. Open Accountant to review.' : 'Nothing to file: every finished month is already filed.'; }, function(){ return 'Filing did not finish. Try again from Accountant.'; });
    } };
  }
  if(/\b(check|scan|audit|watch)\b.*\b(risk|till|fraud|anomal|suspicious|problems?)\b|risk check|run (the )?checks?/.test(q)){
    var f = agentRiskFindings();
    agentTick('asked');
    return f.length ? { text:f.length + ' sign' + (f.length === 1 ? '' : 's') + ' worth checking.', lines:f.map(function(x){ return x.title + '. ' + x.body; }), go:'risk', label:'Open risk warnings' } : { text:'I checked your tills, removals and prices. Nothing unusual found.' };
  }
  if(/reorder|restock|running low|low stock|what should i (order|buy)/.test(q) && !/^add\b/.test(q)){
    var ro = reorderSuggestions().slice(0, 8);
    if(!ro.length) return { text:'Nothing needs reordering right now.' };
    return { text:ro.length + ' product' + (ro.length === 1 ? '' : 's') + ' need restocking, most urgent first.', lines:ro.map(function(r){ return r.product.name + ': ' + r.stock + ' left, suggest ' + r.qty; }), go:'reorder', label:'Open reorder list' };
  }
  // open a page
  var nav = /^(open|go to|goto|show me the|take me to|launch|view|start)\b/.test(q) || q.split(/\s+/).length <= 3;
  if(nav){
    var pg = AGENT_PAGES.find(function(x){ return x[0].test(q); });
    if(pg){ if(/^(alerts?|alert centre)$/.test(q)) return { text:'Opening the Alert centre.', go:'alerts', open:true }; return { text:'Opening ' + pg[2] + '.', page:pg[1], open:true }; }
    if(/alert/.test(q)) return { text:'Opening the Alert centre.', go:'alerts', open:true };
  }
  // questions about the shop
  var r = brainAnswer(text);
  if(r && !/^I did not understand/.test(r.text)) return r;
  var pg2 = AGENT_PAGES.find(function(x){ return x[0].test(q); });
  if(pg2) return { text:'I can open ' + pg2[2] + ' for you.', page:pg2[1], label:'Open ' + pg2[2] };
  return { text:'I did not understand that yet. I can answer questions about your sales, stock and customers, open any page, add an expense, a product or stock, change a price, message your team, make a backup and file the month. Try one of the examples.' };
}

/* ---- the page ---- */
var AGENT_CSS = '<style>' +
  '.ag-hero{position:relative;display:flex;align-items:flex-end;justify-content:space-between;gap:6px;margin:6px 0 14px;min-height:150px;}.ag-hero .tx{flex:1 1 58%;}' +
  '.ag-hello{font-size:26px;line-height:1.12;font-weight:800;color:#fff;margin:0;}.ag-hello b{color:#F2C25A;}.ag-sub{font-size:13.5px;line-height:1.45;color:#DDF5EA;margin-top:8px;}' +
  '.ag-robot{flex:0 0 40%;max-width:170px;width:40%;height:auto;filter:drop-shadow(0 8px 14px rgba(0,0,0,.35));}' +
  '.ag-ask{display:flex;align-items:center;gap:8px;border-radius:999px;padding:6px 6px 6px 14px;background:rgba(255,255,255,.1);border:1px solid rgba(124,240,196,.4);}' +
  '.ac-dark .ag-ask input#agQ{background:transparent !important;border:0 !important;box-shadow:none !important;}.ag-ask svg.sp{flex:0 0 auto;color:#7CF0C4;}.ag-ask input{flex:1;min-width:0;background:transparent;border:0;outline:0;color:#F6FFFA;font:inherit;font-size:15px;padding:9px 2px;}.ag-ask input::placeholder{color:#CDEFE0;opacity:.85;}' +
  '.ag-send{flex:0 0 auto;width:42px;height:42px;border-radius:50%;border:0;background:linear-gradient(135deg,#2BD4A0,#14996F);color:#04251C;display:flex;align-items:center;justify-content:center;cursor:pointer;}' +
  '.ag-mic{flex:0 0 auto;width:38px;height:38px;border-radius:50%;border:0;background:transparent;color:#CFF5E4;cursor:pointer;}' +
  '.ag-out{margin:12px 0 4px;}.ag-msg{border-radius:18px;padding:12px 14px;background:rgba(255,255,255,.08);border:1px solid rgba(124,240,196,.26);color:#F6FFFA;margin-bottom:8px;}' +
  '.ag-msg.me{background:rgba(43,212,160,.16);border-color:rgba(43,212,160,.4);margin-left:28px;font-weight:600;}.ag-msg .ln{font-size:13px;line-height:1.5;margin-top:5px;color:#E8FBF2;}' +
  '.ag-btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;}' +
  '.ag-h{font-size:17px;font-weight:800;color:#fff;margin:16px 0 8px;}' +
  '.ag-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;}' +
  '.ag-tile{display:flex;flex-direction:column;align-items:flex-start;text-align:left;gap:6px;padding:12px 10px;border-radius:18px;border:1px solid rgba(124,240,196,.3);background:rgba(255,255,255,.07);color:#F6FFFA;cursor:pointer;font:inherit;min-height:112px;}' +
  '.ag-tile:hover,.ag-tile:focus-visible{border-color:#F2C25A;}.ag-tile .ic{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(43,212,160,.2);color:#7CF0C4;}' +
  '.ag-tile .nm{font-size:14px;font-weight:800;line-height:1.2;}.ag-tile .ds{font-size:11.5px;line-height:1.35;color:#CDEFE0;}' +
  '.ag-try{border-radius:18px;padding:12px 14px;background:rgba(43,212,160,.12);border:1px solid rgba(124,240,196,.3);}.ag-try b{display:block;margin-bottom:6px;color:#fff;}' +
  '.ag-try button{display:block;width:100%;text-align:left;background:transparent;border:0;color:#E8FBF2;font:inherit;font-size:13.5px;padding:5px 0;cursor:pointer;}.ag-try button:before{content:"\\2022  ";color:#7CF0C4;}' +
  '.ag-pill{margin-left:auto;display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:8px 14px;background:rgba(43,212,160,.18);border:1px solid rgba(124,240,196,.35);color:#EAFBF3;font-size:14px;font-weight:600;}.ag-pill i{width:9px;height:9px;border-radius:50%;background:#4BE3A2;display:inline-block;}.ag-pill.off i{background:#E0A93A;}' +
  '.ag-word{font-size:34px;font-weight:800;color:#fff;line-height:1;}.ag-word small{display:block;font-size:11px;letter-spacing:.28em;font-weight:600;color:#CFF5E4;margin-top:4px;}' +
  '</style>';
var AGENT_TILES = [
  ['Today\'s sales', 'See what you sold today', 'How much did I sell today?', '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'],
  ['Low stock', 'What to reorder', 'What should I reorder?', '<path d="M3 7l9-4 9 4-9 4-9-4Z"/><path d="M3 7v10l9 4 9-4V7"/>'],
  ['Who owes me', 'Late and unpaid', 'Who owes me money?', '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6M18 8v6M15 11h6"/>'],
  ['Risk check', 'Tills, removals, prices', 'Check for risks', '<path d="M12 3l9 16H3L12 3Z"/><path d="M12 10v4M12 17v.5"/>'],
  ['Month end', 'File the books', 'File the month end accounts', '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'],
  ['Backup now', 'Save your records', 'Make a backup now', '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>']
];
var AGENT_TRY = ['What is my profit this week?', 'Add expense 150 for transport', 'Tell Sam to count the till before closing', 'Add 20 to the stock of Milk', 'Set price of Bread to 18', 'Open Accountant'];
var SEND_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"/></svg>';
function openAgentSheet(){
  var notes = agentNotesList().slice(0, 30), on = agentOn(), online = agentOnline();
  var logo = (typeof PESA_LOGO_DATA_URL !== 'undefined' && PESA_LOGO_DATA_URL) ? PESA_LOGO_DATA_URL : '';
  var col = { high:'#FF9B8C', med:'#F2C25A', info:'#CDEFE0' };
  var html = ACCT_CSS3 + AGENT_CSS +
    '<div class="ac-wm"><img src="' + logo + '" alt="" draggable="false"></div>' +
    '<div class="ac-top"><img src="' + AGENT_ICON + '" alt="" draggable="false" style="height:54px;width:auto;border-radius:14px;"><span class="ag-word">Pesa<small>' + tr('AI ASSISTANT') + '</small></span><span class="ag-pill' + (on && online ? '' : ' off') + '"><i></i>' + tr(!on ? 'Paused' : (online ? 'Online' : 'Offline')) + '</span></div>' +
    '<div class="ag-hero"><div class="tx"><h2 class="ag-hello">' + tr('Hello, I am your') + '<br><b>Pesa</b> ' + tr('AI Assistant') + '</h2><div class="ag-sub">' + tr('I help you run your shop: answer questions, open pages, record expenses and stock, message your team and keep watch.') + '</div></div><img class="ag-robot" src="' + AGENT_ROBOT + '" alt="" draggable="false"></div>' +
    '<div class="ag-ask"><svg class="sp" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.2 6.3L21 10l-6.8 1.7L12 18l-2.2-6.3L3 10l6.8-1.7L12 2Z"/></svg><input id="agQ" type="text" autocomplete="off" placeholder="' + esc(tr('Ask me anything...')) + '">' +
      (voiceSupported() ? '<button class="ag-mic" id="agMic" type="button" aria-label="' + esc(tr('Voice')) + '">' + MIC_ICON + '</button>' : '') + '<button class="ag-send" id="agGo" type="button" aria-label="' + esc(tr('Send')) + '">' + SEND_ICON + '</button></div>' +
    '<div class="ag-out" id="agOut" aria-live="polite"></div>' +
    '<div class="ag-h">' + tr('Quick actions') + '</div><div class="ag-grid">' + AGENT_TILES.map(function(t, i){
      return '<button type="button" class="ag-tile" data-ag-t="' + i + '"><span class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + t[3] + '</svg></span><span class="nm">' + tr(t[0]) + '</span><span class="ds">' + tr(t[1]) + '</span></button>'; }).join('') + '</div>' +
    '<div class="ag-h">' + tr('Try asking me') + '</div><div class="ag-try">' + AGENT_TRY.map(function(x, i){ return '<button type="button" data-ag-e="' + i + '">' + esc(tr(x)) + '</button>'; }).join('') + '</div>' +
    '<div class="ag-h">' + tr('Notes from the assistant') + '</div>' +
    (notes.length ? '<div class="rowlist">' + notes.map(function(n, i){
      return '<div class="row"><div class="main"><div class="title" style="color:' + (col[n.level] || col.info) + ';">' + esc(n.title) + '</div><div class="sub">' + esc(n.body) + '</div><div class="sub">' + esc(fmtDateTime(n.createdAt)) + '</div></div>' +
        '<div class="trail">' + (n.status !== 'dismissed' && n.status !== 'done' ? '<button class="btn btn-ghost" data-ag-x="' + i + '" type="button">' + tr('Done') + '</button>' : '') + '</div></div>';
    }).join('') + '</div>' : '<div class="ac-help">' + tr('No notes yet. The assistant checks by itself every half hour and leaves notes here and in the Alert centre.') + '</div>') +
    '<div class="ac-btns" style="margin-top:12px;"><button class="btn btn-ghost" id="agToggle" type="button">' + tr(on ? 'Pause assistant' : 'Turn assistant on') + '</button><button class="btn btn-primary" id="agRun" type="button">' + tr('Check now') + '</button></div>' +
    '<div class="rep-note" style="margin-top:12px;">' + tr('The assistant works from your own records on this device and only does what you confirm. These are signs worth checking, not proof that anyone did anything wrong. It will not remove records: that needs a manager or owner password and a reason on the page itself. Anything it does while offline sends when the connection returns.') + '</div>' +
    '<div class="ac-foot"><i>Pesa</i><span>' + tr('Your Mula, Your Pride') + '</span></div>' +
    '<div class="actions"><button class="btn btn-ghost btn-block" id="agClose" type="button">' + tr('Close') + '</button></div>';
  var ov = openSheet(html);
  var shEl = ov.querySelector('.sheet'); if(shEl) shEl.classList.add('ac-dark');
  var inp = ov.querySelector('#agQ'), out = ov.querySelector('#agOut');
  function go(r){ closeModal(); if(r.page) handleDrawerAction(r.page); else if(r.go === 'alerts') openSmartSection('alerts'); else if(r.go) openSmartSection(r.go); }
  function show(q, r){
    var h = '<div class="ag-msg me">' + esc(q) + '</div><div class="ag-msg"><div style="font-weight:700;">' + esc(r.text) + '</div>' +
      (r.lines ? r.lines.map(function(l){ return '<div class="ln">' + esc(l) + '</div>'; }).join('') : '') + '<div class="ag-btns">' +
      (r.confirm ? '<button class="btn btn-primary" id="agYes" type="button">' + tr('Confirm') + '</button><button class="btn btn-ghost" id="agNo" type="button">' + tr('Cancel') + '</button>' : '') +
      ((r.go || r.page) && !r.open ? '<button class="btn btn-ghost" id="agOpen" type="button">' + tr(r.label || 'Open') + '</button>' : '') + '</div></div>';
    out.innerHTML = h;
    var y = out.querySelector('#agYes'), n = out.querySelector('#agNo'), o = out.querySelector('#agOpen');
    if(y) y.addEventListener('click', function(){
      y.disabled = true;
      Promise.resolve().then(function(){ return r.confirm(); }).then(function(msg){ out.innerHTML = '<div class="ag-msg"><div style="font-weight:700;">' + esc(msg || 'Done.') + '</div></div>'; }, function(){ out.innerHTML = '<div class="ag-msg">' + esc(tr('That did not work. Nothing was changed.')) + '</div>'; });
    });
    if(n) n.addEventListener('click', function(){ out.innerHTML = '<div class="ag-msg">' + esc(tr('Cancelled. Nothing was changed.')) + '</div>'; });
    if(o) o.addEventListener('click', function(){ go(r); });
    if(r.open){ setTimeout(function(){ go(r); }, 350); }
    try{ out.scrollIntoView({ behavior:'smooth', block:'nearest' }); }catch(e){}
  }
  function ask(t){
    t = String(t || '').trim(); if(!t) return; inp.value = '';
    var r; try{ r = agentParse(t); }catch(e){ r = { text:'Something went wrong with that request. Nothing was changed.' }; }
    show(t, r);
  }
  ov.querySelector('#agGo').addEventListener('click', function(){ ask(inp.value); });
  inp.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); ask(inp.value); } });
  var mic = ov.querySelector('#agMic'); if(mic) mic.addEventListener('click', function(){ startVoiceSearch(mic, ask); });
  ov.querySelectorAll('[data-ag-t]').forEach(function(b){ b.addEventListener('click', function(){ ask(AGENT_TILES[+b.getAttribute('data-ag-t')][2]); }); });
  ov.querySelectorAll('[data-ag-e]').forEach(function(b){ b.addEventListener('click', function(){ var t = AGENT_TRY[+b.getAttribute('data-ag-e')]; inp.value = t; inp.focus(); }); });
  ov.querySelector('#agToggle').addEventListener('click', function(){ btSave({ agentOff: on }); closeModal(); openAgentSheet(); });
  ov.querySelector('#agRun').addEventListener('click', function(){ _agent.last = 0; agentTick('manual'); toast(tr('Checked')); closeModal(); openAgentSheet(); });
  ov.querySelector('#agClose').addEventListener('click', closeModal);
  ov.querySelectorAll('[data-ag-x]').forEach(function(b){ b.addEventListener('click', function(){
    var n = notes[+b.getAttribute('data-ag-x')]; if(!n) return;
    try{ n.status = 'dismissed'; refs.agentNotes.doc(n.id).update({ status:'dismissed' }); }catch(e){}
    closeModal(); openAgentSheet();
  }); });
}
