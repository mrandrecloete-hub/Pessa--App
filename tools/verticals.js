/* ============================== BUSINESS TYPES: Barbershop and Salon, Retail, Hospitality ==============================
 * The business type is chosen when signing up (State.company.businessType: 'retail' | 'beauty' | 'hospitality').
 * Retail keeps the full Pesa dashboard exactly as it is. Barbershop and Salon, and Hospitality, get their own dashboard and
 * their own pages on top of the same app: sales, till, VAT, reports, accounting, staff, messages and the assistant all stay.
 * Anything sold goes through the normal Sell and Charge steps, so receipts, VAT, the till and the books keep working.
 *  - Services (cuts, braids, nails) are saved as products with isService:true and no stock count.
 *  - Appointments and the walk in queue are one list (State.appointments).
 *  - Rooms, room bookings and open tabs are State.hosRooms, State.hosBookings, State.hosTabs.
 * Wording avoids dashes on purpose. Tax and levy figures are estimates, to be confirmed with the relevant authorities. */
var BIZ_TYPES = [
  { k:'beauty', name:'Barbershop or Salon', sub:'Barbers, hair, braids, nails and beauty. Bookings, walk in queue, clients and stylist earnings.' },
  { k:'retail', name:'Retail business', sub:'Shops, spazas, wholesale and general dealers. The full Pesa dashboard.' },
  { k:'hospitality', name:'Hospitality', sub:'Guest houses, lodges, B and Bs, restaurants and bars. Rooms, bookings and tabs.' }
];
function bizType(){ var t = State.company && State.company.businessType; return (t === 'beauty' || t === 'hospitality') ? t : 'retail'; }
function vertActive(){ return bizType() !== 'retail' && !State.showRetailDash; }
function vAddDays(key, n){ var d = new Date(key + 'T12:00:00'); d.setDate(d.getDate() + n); return todayKey(d); }
function vDayLabel(key){ try{ return new Date(key + 'T12:00:00').toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' }); }catch(e){ return key; } }
function vNights(a, b){ return Math.max(1, Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000)); }
function vList(n){ var a = State[n]; return Array.isArray(a) ? a : []; }
function vSave(coll, id, doc){ var ref = refs[coll].doc(id); ref.set(doc); var o = Object.assign({ id:id }, doc), l = vList(coll).filter(function(x){ return x.id !== id; }); l.push(o); State[coll] = l; return o; }
function vPatch(coll, id, patch){ try{ refs[coll].doc(id).update(patch); }catch(e){} vList(coll).forEach(function(x){ if(x.id === id) Object.assign(x, patch); }); }
function vStaff(){ return (State.users || []).filter(function(u){ return u.active !== false && !u.pending && u.role !== 'stockclerk'; }); }
function vSalesToday(){ var t = todayKey(); return (State.sales || []).filter(function(s){ return String(s.createdAt || '').slice(0, 10) === t; }); }
function vSum(list, f){ return list.reduce(function(a, x){ return a + (Number(f(x)) || 0); }, 0); }
function vField(label, inner){ return '<div class="field"><label>' + tr(label) + '</label>' + inner + '</div>'; }
function vOpts(list, sel, blank){ return (blank ? '<option value="">' + esc(tr(blank)) + '</option>' : '') + list.map(function(o){ return '<option value="' + esc(o[0]) + '"' + (o[0] === sel ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join(''); }
function vClientsList(){ return State.customers || []; }
function vCartIsFree(){ if(State.cart && State.cart.length){ toast(tr('Finish or clear the sale in the cart first.')); setTab('sell'); return false; } return true; }
function vCartAdd(line){ State.cart.push(Object.assign({ qty:1, cost:0, unit:'', maxQty:Infinity }, line)); }
function vOpenCharge(){ try{ renderCartBar(); }catch(e){} closeModal(); setTimeout(openChargeSheet, 60); }
function vWaLink(phone, text){ var p = String(phone || '').replace(/[^0-9]/g, ''); if(p.length === 9 && p.charAt(0) === '8') p = '264' + p; else if(p.length === 10 && p.charAt(0) === '0') p = '264' + p.slice(1); return p ? 'https://wa.me/' + p + '?text=' + encodeURIComponent(text) : ''; }
function vShop(){ return (State.company && (State.company.tradingName || State.company.companyName)) || 'our shop'; }

/* ---- sales made from an appointment, a room booking or a tab carry that link, and close the job once the sale is recorded ---- */
function vertSaleMeta(){
  var c = State.cart || [], a = c.find(function(i){ return i.apptId; }), b = c.find(function(i){ return i.bookingId; }), t = c.filter(function(i){ return i.tabId; });
  if(!a && !b && !t.length) return null;
  var extra = {}, tabIds = [];
  if(a){ extra.appointmentId = a.apptId; extra.stylistId = a.stylistId || ''; extra.stylistName = a.stylistName || ''; }
  if(b){ extra.bookingId = b.bookingId; extra.roomId = b.roomId || ''; }
  t.forEach(function(i){ if(tabIds.indexOf(i.tabId) < 0) tabIds.push(i.tabId); });
  if(tabIds.length) extra.tabIds = tabIds;
  return { extra:extra, after:function(sale){
    var at = new Date().toISOString();
    if(a) vPatch('appointments', a.apptId, { status:'done', doneAt:at, saleTotal:sale.total });
    if(b) vPatch('hosBookings', b.bookingId, { status:'out', checkedOutAt:at, paidTotal:sale.total });
    tabIds.forEach(function(id){ vPatch('hosTabs', id, { status:'closed', closedAt:at }); });
  } };
}

/* ---- the three type cards on the sign up page ---- */
function regTypeHtml(){
  return '<div class="reg-type" id="regTypeBox"><div class="section-title" style="margin-top:2px;">' + tr('What type of business do you have?') + '</div><div class="rt-grid">' +
    BIZ_TYPES.map(function(t, i){
      return '<label class="rt-card"><input type="radio" name="rcBizType" value="' + t.k + '"' + (t.k === 'retail' ? ' checked' : '') + '><span class="rt-in"><span class="rt-n">' + (i + 1) + '</span><span class="rt-t"><b>' + tr(t.name) + '</b><small>' + tr(t.sub) + '</small></span></span></label>';
    }).join('') + '</div></div>' +
    '<style>.reg-type{margin:6px 0 16px;}.rt-grid{display:grid;gap:10px;}.rt-card{display:block;cursor:pointer;}.rt-card input{position:absolute;opacity:0;pointer-events:none;}' +
    '.rt-in{display:flex;gap:12px;align-items:center;padding:12px 14px;border-radius:18px;border:1.5px solid rgba(8,120,90,.28);background:rgba(255,255,255,.7);transition:.15s;}' +
    '.rt-n{flex:0 0 auto;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;background:rgba(8,120,90,.14);color:#0B7A5C;}' +
    '.rt-t b{display:block;font-size:15.5px;color:#0B3B2C;}.rt-t small{display:block;font-size:12.5px;line-height:1.4;color:#3F5F54;margin-top:2px;}' +
    '.rt-card input:checked + .rt-in{border-color:#D99A1E;background:linear-gradient(135deg,rgba(43,212,160,.22),rgba(242,194,90,.22));box-shadow:0 0 0 2px rgba(217,154,30,.35);}.rt-card input:checked + .rt-in .rt-n{background:#0B7A5C;color:#fff;}' +
    '.rt-card input:focus-visible + .rt-in{outline:2px solid #0B7A5C;outline-offset:2px;}@media (min-width:860px){.rt-grid{grid-template-columns:repeat(3,minmax(0,1fr));}.rt-in{height:100%;}}</style>';
}
function regPickedType(root){ var r = root.querySelector('input[name="rcBizType"]:checked'); return r ? r.value : 'retail'; }

/* ---- menu rows and page keys ---- */
var VERT_PAGES = {
  beauty: [['v-appts', 'Appointments', 'clock'], ['v-queue', 'Walk in queue', 'people'], ['v-clients', 'Clients', 'people'], ['v-services', 'Services and prices', 'clipboard', 1], ['v-earn', 'Stylist earnings', 'chartbar', 1]],
  hospitality: [['v-bookings', 'Room bookings', 'clock'], ['v-rooms', 'Rooms', 'box'], ['v-tabs', 'Tables and tabs', 'receipt'], ['v-guests', 'Guests', 'people'], ['v-comply', 'Licences and levy', 'clipboard', 1]]
};
/* What each business type does NOT need. Retail hides nothing. Everything hidden is still in the app and comes back if the business type is changed.
   Salon: no full screen point of sale (Sell does the job), no purchase orders, stock takes, wastage, branches or invoices, no barcode labels, import cost calculator, currency or quotes.
   Hospitality: keeps the point of sale (bars and restaurants use it), purchase orders, stock takes and wastage, but no branches, barcode labels or import cost calculator. */
var VERT_HIDE = {
  beauty:      { menu:['tab-invoices', 'terminal', 'stocktake', 'pos', 'wastage', 'branches'], biz:['labels', 'landed', 'currency', 'quotes'], smart:['reorder'], tabs:['invoices'] },
  hospitality: { menu:['branches'], biz:['labels', 'landed'], smart:[], tabs:[] }
};
function vertTiles(kind, tiles){ var h = VERT_HIDE[bizType()]; if(!h || !h[kind]) return tiles; return tiles.filter(function(t){ return h[kind].indexOf(t[0]) < 0; }); }
/* Each business type has its own menu and nothing from another type. Barbershop and salon, and hospitality, get only their own pages plus the few things
   every business needs (messages, reports, expenses, team, accounts, settings). Retail keeps the full Pesa app and none of the pages below. */
var VERT_KEEP = {
  beauty:      ['inbox', 'tab-dashboard', 'tab-stock', 'tab-reports', 'tab-expenses', 'tab-team', 'vat', 'accountant', 'pay', 'v-type', 'settings'],
  hospitality: ['inbox', 'tab-dashboard', 'tab-stock', 'tab-invoices', 'tab-reports', 'tab-expenses', 'tab-team', 'vat', 'accountant', 'pay', 'v-type', 'settings']
};
function vStrictRows(html){
  var t = bizType(), keep = VERT_KEEP[t].concat(['tab-me', 'tab-records']); if(!isManagerOrOwner()) keep.push('tab-till');
  html = html.replace(/<button class="drawer-row"[^>]*data-drawer-row="([^"]+)"[\s\S]*?<\/button>/g, function(m, k){ return (k.indexOf('v-') === 0 || keep.indexOf(k) >= 0) ? m : ''; });
  for(var i = 0; i < 4; i++) html = html.replace(/<div class="drawer-sub">[^<]*<\/div>\s*(?=<div class="drawer-sub">|$)/g, '');
  return html;
}
function vertFilterRows(html){
  // the owner's Business type row sits with Settings, at the bottom of the menu
  if(State.session && isOwner()){ var sr = /<button class="drawer-row"[^>]*data-drawer-row="settings"/; if(sr.test(html)) html = html.replace(sr, function(m){ return drawerRowHtml('v-type', ICONS.branch || ICONS.box, 'Business type') + m; }); }
  if(VERT_KEEP[bizType()]) return vStrictRows(html);
  var h = VERT_HIDE[bizType()]; if(!h) return html;
  h.menu.forEach(function(k){ html = html.replace(new RegExp('<button class="drawer-row"[^>]*data-drawer-row="' + k + '"[\\s\\S]*?</button>', 'g'), ''); });
  return html;
}
(function(){ try{ var _mrh = menuRowsHtml; menuRowsHtml = function(){ return vertFilterRows(_mrh()); }; var _rt = roleTabs; roleTabs = function(role){ var a = _rt(role), h = VERT_HIDE[bizType()]; return h ? a.filter(function(x){ return h.tabs.indexOf(x) < 0; }) : a; }; }catch(e){} })();
/* the first run setup guide speaks the language of the business type */
(function(){
  try{
    var _steps = btSetupSteps, _go = btSetupGo;
    btSetupSteps = function(){
      var list = _steps(), t = bizType(); if(t === 'retail') return list;
      var rep = {
        beauty:{ pro:{ t:'Add your services and prices', d:'Cuts, braids, nails and more, with prices and minutes.', done:vServices().length > 0, go:'v-services' },
                 cus:{ t:'Add your clients', d:'They are also added whenever you book someone.', done:(State.customers || []).length > 0, go:'v-clients' },
                 team:{ t:'Add your barbers and stylists', d:'Give each person their own login.' },
                 sale:{ t:'Take your first booking', d:'Book a client, then charge when they are done.', done:vList('appointments').length > 0, go:'v-appts' } },
        hospitality:{ pro:{ t:'Add your rooms and rates', d:'Each room with its type and price per night.', done:vRooms().length > 0, go:'v-rooms' },
                 team:{ t:'Add your front desk, waiters and housekeeping', d:'Give each person their own login.' },
                 sale:{ t:'Take your first room booking', d:'Book a guest, check them in, then check them out.', done:vList('hosBookings').length > 0, go:'v-bookings' } }
      }[t], drop = t === 'beauty' ? ['sup'] : ['cus'];
      return list.filter(function(x){ return drop.indexOf(x.k) < 0; }).map(function(x){ return rep[x.k] ? Object.assign({}, x, rep[x.k]) : x; });
    };
    btSetupGo = function(k){ if(String(k).indexOf('v-') === 0){ vertDrawerAction(k); return; } return _go(k); };
  }catch(e){}
})();
/* header and footer: see through at every screen size, no bar, no gold line */
var VERT_MGR = { 'v-services':1, 'v-earn':1, 'v-comply':1, 'v-type':1 };
/* the job names people see for the cashier and stock clerk roles change with the business type (the permissions underneath stay the same) */
var VERT_ROLE_BASE = null;
var VERT_JOBS = { beauty:['Barber', 'Stylist', 'Braider', 'Nail technician', 'Receptionist', 'Apprentice'], hospitality:['Receptionist', 'Waiter', 'Bartender', 'Cook', 'Housekeeper', 'Cashier'], retail:[] };
function vertLabels(){
  try{
    if(!VERT_ROLE_BASE) VERT_ROLE_BASE = { l:Object.assign({}, ROLE_LABELS), c:Object.assign({}, ROLE_INFO.cashier), k:Object.assign({}, ROLE_INFO.stockclerk) };
    var t = bizType();
    ROLE_LABELS.cashier = t === 'beauty' ? 'Barber, Stylist or Receptionist' : t === 'hospitality' ? 'Front desk, Waiter or Bar staff' : VERT_ROLE_BASE.l.cashier;
    ROLE_LABELS.stockclerk = t === 'hospitality' ? 'Housekeeping or Stock clerk' : VERT_ROLE_BASE.l.stockclerk;
    if(t === 'beauty') ROLE_INFO.cashier = { desc:'Works with clients: sees the booking list and walk in queue, starts and charges their own jobs, sells products and runs their own till.', can:['See and update appointments and the walk in queue', 'Charge services and sell products', 'Open and close your own till', 'See your own sales and records'], cannot:['Change prices or services', 'See earnings of other people, reports or profit', 'Open the team list or business settings'] };
    else if(t === 'hospitality') ROLE_INFO.cashier = { desc:'Works the front desk, restaurant or bar: takes room bookings, checks guests in and out, opens and charges tabs and runs their own till.', can:['See and edit room bookings, check in and check out', 'Open tabs and charge them', 'Open and close your own till', 'See your own sales and records'], cannot:['Change room rates or licence details', 'See reports, profit or other staff', 'Open the team list or business settings'] };
    else ROLE_INFO.cashier = VERT_ROLE_BASE.c;
  }catch(e){}
}
function vertStaffTweaks(){
  try{
    var t = bizType(); if(t === 'retail') return;
    var job = document.getElementById('sfJob'); if(job){ job.setAttribute('list', 'sfJobList'); job.setAttribute('placeholder', 'e.g. ' + VERT_JOBS[t][0]); if(!document.getElementById('sfJobList')) job.insertAdjacentHTML('afterend', '<datalist id="sfJobList">' + VERT_JOBS[t].map(function(j){ return '<option value="' + j + '">'; }).join('') + '</datalist>'); }
    var role = document.getElementById('sfRole'); if(role && t === 'beauty') [].slice.call(role.options).forEach(function(o){ if(o.value === 'stockclerk') o.remove(); });
    if(role) [].slice.call(role.options).forEach(function(o){ if(o.value === 'cashier') o.textContent = ROLE_LABELS.cashier; else if(o.value === 'stockclerk') o.textContent = ROLE_LABELS.stockclerk; });
  }catch(e){}
}
(function(){ try{ var _oss = openStaffSheet; openStaffSheet = function(u){ vertLabels(); var r = _oss(u); vertStaffTweaks(); return r; }; }catch(e){} })();
function vertMenuRows(){
  var t = bizType(), rows = '';
  vertLabels();
  if(t !== 'retail'){
    rows += '<div class="drawer-sub">' + (t === 'beauty' ? 'Barbershop and Salon' : 'Hospitality') + '</div>';
    VERT_PAGES[t].forEach(function(p){ if(p[3] && !isManagerOrOwner()) return; rows += drawerRowHtml(p[0], ICONS[p[2]] || ICONS.clipboard, p[1]); });
  }
  return rows;
}
function vertDrawerAction(key){
  if(key.indexOf('v-') !== 0) return false;
  if(VERT_MGR[key] && !isManagerOrOwner()){ toast(tr('That page is for owners and managers.')); return true; }
  var m = { 'v-appts':function(){ openApptSheet(todayKey()); }, 'v-queue':openQueueSheet, 'v-clients':openClientsSheet, 'v-services':openServicesSheet, 'v-earn':openEarningsSheet,
    'v-bookings':openBookingsSheet, 'v-rooms':openRoomsSheet, 'v-tabs':openTabsSheet, 'v-guests':openGuestsSheet, 'v-comply':openComplySheet, 'v-type':openBizTypeSheet }[key];
  if(m) m(); return !!m;
}
(function(){ try{ [['Appointments', 'v-appts'], ['Walk in queue', 'v-queue'], ['Clients', 'v-clients'], ['Services and prices', 'v-services'], ['Room bookings', 'v-bookings'], ['Rooms', 'v-rooms'], ['Tables and tabs', 'v-tabs']].forEach(function(p){ AGENT_PAGES.unshift([new RegExp(p[0].toLowerCase().replace(/ and /g, '.*')), p[1], p[0]]); }); }catch(e){} })();

/* ---- business type switcher (owner) ---- */
function openBizTypeSheet(){
  var cur = bizType();
  var html = '<div class="sheet-head"><h2>' + tr('Business type') + '</h2></div><div class="banner" style="display:block;">' + tr('This sets which dashboard and pages Pesa shows. Your sales, stock and records are never removed when you change it.') + '</div>' +
    '<div class="rowlist">' + BIZ_TYPES.map(function(t){ return '<button class="row" type="button" data-bt="' + t.k + '" style="width:100%;text-align:left;' + (t.k === cur ? 'border-color:#F2C25A;' : '') + '"><div class="main"><div class="title">' + tr(t.name) + (t.k === cur ? ' (' + tr('current') + ')' : '') + '</div><div class="sub">' + tr(t.sub) + '</div></div></button>'; }).join('') + '</div>' +
    '<div class="actions"><button class="btn btn-ghost btn-block" id="btClose" type="button">' + tr('Close') + '</button></div>';
  var ov = openSheet(html);
  ov.querySelector('#btClose').addEventListener('click', closeModal);
  ov.querySelectorAll('[data-bt]').forEach(function(b){ b.addEventListener('click', function(){
    var k = b.getAttribute('data-bt'); if(k === cur){ closeModal(); return; }
    try{ refs.company.update({ businessType:k }); State.company = Object.assign({}, State.company, { businessType:k }); logAudit('update', 'company', null, 'Business type set to ' + k); }catch(e){}
    State.showRetailDash = false; closeModal(); toast(tr('Business type changed')); setTab('dashboard'); render();
  }); });
}

/* ==================================== shared dashboard pieces ==================================== */
function vTile(act, icon, label, sub){
  return '<button class="qa-btn" type="button" data-vq="' + act + '"><span class="qa-ico">' + (ICONS[icon] || ICONS.clipboard) + '</span><span class="qa-lbl">' + tr(label) + '</span>' + (sub ? '<span class="qa-sub" style="display:block;font-size:11px;opacity:.8;">' + esc(sub) + '</span>' : '') + '</button>';
}
function vStat(label, val, color){ return '<div class="stat"><div class="lbl">' + tr(label) + '</div><div class="v num small"' + (color ? ' style="color:' + color + ';"' : '') + '>' + val + '</div></div>'; }
function vHero(label, val, sub){
  return '<div class="hero-card"><div class="hero-top"><div><div class="hero-lbl">' + tr(label) + '</div><div class="hero-val num">' + val + '</div><div class="hero-delta" style="opacity:.9;">' + sub + '</div></div></div></div>';
}
function vertDashboardHtml(){
  var html = '';
  try{ html += pilotHomeNote(); }catch(e){}
  vertLabels();
  html += (bizType() === 'beauty' ? vBeautyDash() : vHospDash());
  html += vSetupCard() + vManageTiles();
  return dashWrap(html);
}
var _vInit = false;
/* the get started card: shown to the owner until the three first steps are done */
function vSetupCard(){
  if(!isManagerOrOwner()) return '';
  var t = bizType(), staffN = (State.users || []).filter(function(u){ return u.active !== false && u.role !== 'owner'; }).length;
  var steps = t === 'beauty' ? [[vServices().length > 0, 'Add your services and prices', 'services'], [staffN > 0, 'Add your barbers and stylists', 'addstaff'], [vList('appointments').length > 0, 'Take your first booking', 'newbook']]
    : [[vRooms().length > 0, 'Add your rooms and rates', 'rooms'], [staffN > 0, 'Add your front desk, waiters and housekeeping', 'addstaff'], [vList('hosBookings').length > 0, 'Take your first room booking', 'newstay']];
  if(steps.every(function(x){ return x[0]; })) return '';
  return '<div class="section-title">' + tr('Get started') + '</div><div class="rowlist">' + steps.map(function(x, i){
    return '<button class="row" type="button" data-vq="' + x[2] + '" style="width:100%;text-align:left;"><div class="main"><div class="title">' + (x[0] ? '&#10003; ' : (i + 1) + '. ') + tr(x[1]) + '</div></div><div class="trail">' + (x[0] ? tr('Done') : tr('Open')) + '</div></button>'; }).join('') + '</div>';
}
/* everything else the owner needs, kept right on the dashboard */
function vManageTiles(){
  if(!isManagerOrOwner()) return '';
  var t = bizType();
  return '<div class="section-title">' + tr('Run your business') + '</div><div class="qa-row">' + vTile('team', 'people', 'Team') + vTile('addstaff', 'plus', 'Add employee') + vTile('expenses', 'receipt', 'Expenses') + vTile('stock', 'box', t === 'beauty' ? 'Products and stock' : 'Menu and stock') + '</div>' +
    '<div class="qa-row">' + vTile('accountant', 'book', 'Accountant') + (t === 'beauty' ? vTile('vat', 'percent', 'VAT') : vTile('invoices', 'invoice', 'Invoices')) + vTile('msgs', 'bolt', 'Messages') + vTile('settings', 'info', 'Settings') + '</div>';
}
/* an employee's own page: their jobs for today */
function vertMeHtml(){
  var t = bizType(); if(t === 'retail') return '';
  var me = State.session && State.session.userId, today = todayKey(), h = '';
  if(t === 'beauty'){
    var mine = vApptsOn(today).filter(function(a){ return a.stylistId === me && a.status !== 'done' && a.status !== 'noshow'; }).sort(function(a, b){ return String(a.time).localeCompare(String(b.time)); });
    var queue = vApptsOn(today).filter(function(a){ return a.status === 'waiting'; }).length;
    h += '<div class="section-title">' + tr('My clients today') + '</div>' + (mine.length ? '<div class="rowlist">' + mine.slice(0, 6).map(function(a){ return '<button class="row" type="button" data-vq="appt" data-id="' + a.id + '" style="width:100%;text-align:left;"><div class="main"><div class="title">' + esc(a.time || '') + ' ' + esc(a.clientName) + '</div><div class="sub">' + esc((a.serviceNames || []).join(', ')) + '</div></div><div class="trail"><span class="rolebadge">' + esc(tr(VS_STATUS[a.status] || a.status)) + '</span></div></button>'; }).join('') + '</div>' : '<div class="banner" style="display:block;">' + tr('No clients booked for you right now.') + '</div>') +
      '<div class="qa-row">' + vTile('appts', 'clock', 'Appointments') + vTile('queue', 'people', 'Walk in queue', queue ? queue + ' ' + tr('waiting') : '') + vTile('newbook', 'plus', 'New booking') + vTile('clients', 'people', 'Clients') + '</div>';
  } else {
    var arr = vList('hosBookings').filter(function(b){ return b.status === 'reserved' && b.checkIn === today; }).length, dep = vList('hosBookings').filter(function(b){ return b.status === 'in' && b.checkOut <= today; }).length, tabs = vList('hosTabs').filter(function(x){ return x.status === 'open'; }).length;
    h += '<div class="section-title">' + tr('Front desk today') + '</div><div class="stats">' + vStat('Arriving today', arr) + vStat('Leaving today', dep) + vStat('Open tabs', tabs) + '</div>' +
      '<div class="qa-row">' + vTile('bookings', 'clock', 'Bookings') + vTile('newstay', 'plus', 'New booking') + vTile('tabs', 'receipt', 'Tabs') + vTile('rooms', 'box', 'Rooms') + '</div>';
  }
  return h;
}
function vertInit(){
  if(_vInit) return; _vInit = true;
  document.addEventListener('click', function(e){
    var el = e.target && e.target.closest ? e.target.closest('[data-vq]') : null; if(!el) return;
    var a = el.getAttribute('data-vq'), id = el.getAttribute('data-id') || '';
    var go = { sell:function(){ setTab('sell'); }, stock:function(){ setTab('stock'); }, expenses:function(){ setTab('expenses'); }, reports:function(){ setTab('reports'); },
      appts:function(){ openApptSheet(todayKey()); }, queue:openQueueSheet, clients:openClientsSheet, services:openServicesSheet, earn:openEarningsSheet, newbook:function(){ openApptForm(null, todayKey()); },
      bookings:openBookingsSheet, rooms:openRoomsSheet, tabs:openTabsSheet, guests:openGuestsSheet, comply:openComplySheet, newstay:function(){ openStayForm(null); },
      team:openTeamSheet, addstaff:function(){ openStaffSheet(null); }, suppliers:function(){ handleDrawerAction('suppliers'); }, accountant:function(){ handleDrawerAction('accountant'); }, msgs:openInboxSheet, tools:openBizHub, till:function(){ setTab('till'); }, settings:openSettingsSheet, smart:openSmartToolsSheet, assistant:openAgentSheet, vat:function(){ handleDrawerAction('vat'); }, invoices:function(){ setTab('invoices'); },
      retail:function(){ State.showRetailDash = true; render(); }, vert:function(){ State.showRetailDash = false; render(); },
      appt:function(){ var a2 = vList('appointments').find(function(x){ return x.id === id; }); if(a2) openApptSheet(a2.date); }, stay:function(){ var b = vList('hosBookings').find(function(x){ return x.id === id; }); if(b) openStayView(b); } }[a];
    if(go){ e.preventDefault(); go(); }
  });
}

/* ==================================== BARBERSHOP AND SALON ==================================== */
function vServices(){ return (State.products || []).filter(function(p){ return p.isService; }); }
var VS_STATUS = { booked:'Booked', arrived:'Arrived', inchair:'In the chair', waiting:'Waiting', done:'Done', noshow:'No show', cancelled:'Cancelled' };
function vApptsOn(date){ return vList('appointments').filter(function(a){ return a.date === date && a.status !== 'cancelled'; }); }
function vBeautyDash(){
  var t = todayKey(), all = vApptsOn(t), sales = vSalesToday(), total = vSum(sales, function(s){ return s.total; });
  var todo = all.filter(function(a){ return a.status !== 'done' && a.status !== 'noshow'; }).sort(function(a, b){ return String(a.time).localeCompare(String(b.time)); });
  var waiting = all.filter(function(a){ return a.status === 'waiting'; }).length, done = all.filter(function(a){ return a.status === 'done'; }).length, ns = all.filter(function(a){ return a.status === 'noshow'; }).length;
  var tomorrow = vApptsOn(vAddDays(t, 1)).length;
  var h = vHero('Today’s takings', fmtMoney(total), done + ' ' + tr('done') + ', ' + todo.length + ' ' + tr('still to come'));
  h += '<div class="qa-row">' + vTile('newbook', 'plus', 'New booking') + vTile('queue', 'people', 'Walk in') + vTile('clients', 'people', 'Clients') + '</div>';
  h += '<div class="section-title">' + tr('Today at a glance') + '</div><div class="stats">' + vStat('Bookings today', all.length) + vStat('Walk ins waiting', waiting) + vStat('Done', done, 'var(--success)') + vStat('No shows', ns, ns ? 'var(--danger)' : '') + vStat('Tomorrow', tomorrow + ' ' + tr('booked')) + vStat('Clients', vClientsList().length) + '</div>';
  h += '<div class="section-title">' + tr('Next up') + '</div>';
  h += todo.length ? '<div class="rowlist">' + todo.slice(0, 5).map(function(a){
    return '<button class="row" type="button" data-vq="appt" data-id="' + a.id + '" style="width:100%;text-align:left;"><div class="main"><div class="title">' + esc(a.time || '') + ' ' + esc(a.clientName || '') + '</div><div class="sub">' + esc((a.serviceNames || []).join(', ')) + (a.stylistName ? ' · ' + esc(a.stylistName) : '') + '</div></div><div class="trail"><span class="rolebadge">' + esc(tr(VS_STATUS[a.status] || a.status)) + '</span></div></button>';
  }).join('') + '</div>' : '<div class="banner" style="display:block;">' + tr('No one is booked yet today. Tap New booking, or Walk in when someone arrives.') + '</div>';
  h += '<div class="section-title">' + tr('Your salon') + '</div><div class="qa-row">' + vTile('appts', 'clock', 'Appointments') + vTile('services', 'clipboard', 'Services') + vTile('earn', 'chartbar', 'Earnings') + vTile('reports', 'chartbar', 'Reports') + '</div>';
  return h;
}

var VS_STARTER = [
  ['Men’s haircut', 60, 30, 'Barber'], ['Fade', 80, 40, 'Barber'], ['Kids haircut', 50, 25, 'Barber'], ['Beard trim', 40, 15, 'Barber'], ['Shave', 50, 20, 'Barber'], ['Haircut and beard', 90, 45, 'Barber'], ['Line up', 30, 15, 'Barber'],
  ['Wash and blow dry', 120, 45, 'Hair'], ['Box braids', 450, 240, 'Hair'], ['Cornrows', 200, 90, 'Hair'], ['Weave install', 600, 180, 'Hair'], ['Relaxer', 250, 90, 'Hair'], ['Hair colour', 350, 120, 'Hair'], ['Deep conditioning treatment', 150, 45, 'Hair'],
  ['Gel nails', 250, 60, 'Nails'], ['Manicure', 120, 45, 'Nails'], ['Pedicure', 180, 60, 'Nails'], ['Makeup', 300, 60, 'Beauty'], ['Eyebrow shaping', 60, 20, 'Beauty']
];
function openServicesSheet(){
  var list = vServices().sort(function(a, b){ return String(a.category || '').localeCompare(String(b.category || '')) || String(a.name).localeCompare(String(b.name)); });
  var html = '<div class="sheet-head"><h2>' + tr('Services and prices') + '</h2></div>' +
    '<div class="banner" style="display:block;">' + tr('These are what you book and charge. Services have no stock count. The starter prices are only examples in Namibian dollars, change them to your own prices.') + '</div>' +
    (list.length ? '<div class="rowlist">' + list.map(function(p){ return '<button class="row" type="button" data-sv="' + p.id + '" style="width:100%;text-align:left;"><div class="main"><div class="title">' + esc(p.name) + '</div><div class="sub">' + esc(p.category || '') + ' · ' + (p.durationMin || 30) + ' ' + tr('min') + '</div></div><div class="trail num"><b>' + fmtMoney(p.sellPrice || 0) + '</b></div></button>'; }).join('') + '</div>' : '<div class="empty"><div class="t">' + tr('No services yet') + '</div></div>') +
    '<div class="actions"><button class="btn btn-primary" id="svAdd" type="button">' + tr('Add a service') + '</button>' + (list.length ? '' : '<button class="btn btn-accent" id="svStarter" type="button">' + tr('Add starter services') + '</button>') + '<button class="btn btn-ghost" id="svClose" type="button">' + tr('Close') + '</button></div>';
  var ov = openSheet(html);
  ov.querySelector('#svClose').addEventListener('click', closeModal);
  ov.querySelector('#svAdd').addEventListener('click', function(){ openServiceForm(null); });
  var st = ov.querySelector('#svStarter'); if(st) st.addEventListener('click', function(){
    VS_STARTER.forEach(function(s){ refs.products.doc().set({ name:s[0], category:s[3], unit:'', costPrice:0, sellPrice:s[1], stockQty:null, lowStock:null, barcode:'', expiryDate:'', supplierId:'', isService:true, durationMin:s[2], createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() }); });
    logAudit('create', 'product', null, 'Added starter salon services'); syncNowSafe(); closeModal(); setTimeout(openServicesSheet, 400);
  });
  ov.querySelectorAll('[data-sv]').forEach(function(b){ b.addEventListener('click', function(){ openServiceForm(vServices().find(function(p){ return p.id === b.getAttribute('data-sv'); })); }); });
}
function openServiceForm(p){
  var html = '<div class="sheet-head"><h2>' + tr(p ? 'Edit service' : 'Add a service') + '</h2></div>' +
    vField('Service name', '<input id="svName" value="' + esc(p ? p.name : '') + '" placeholder="e.g. Fade">') +
    '<div class="field-row">' + vField('Price (N$)', '<input id="svPrice" type="number" inputmode="decimal" step="0.01" value="' + (p ? p.sellPrice : '') + '">') + vField('Minutes it takes', '<input id="svMin" type="number" inputmode="numeric" value="' + (p ? p.durationMin || 30 : 30) + '">') + '</div>' +
    vField('Group', '<select id="svCat">' + vOpts(['Barber', 'Hair', 'Nails', 'Beauty', 'Treatment', 'Other'].map(function(x){ return [x, x]; }), p ? p.category : 'Barber') + '</select>') +
    '<div id="svErr"></div><div class="actions"><button class="btn btn-primary btn-block" id="svSave" type="button">' + tr('Save') + '</button>' + (p ? '<button class="btn btn-danger" id="svOff" type="button">' + tr('Hide this service') + '</button>' : '') + '<button class="btn btn-ghost" id="svBack" type="button">' + tr('Back') + '</button></div>';
  var ov = openSheet(html, { center:true });
  ov.querySelector('#svBack').addEventListener('click', function(){ closeModal(); openServicesSheet(); });
  ov.querySelector('#svSave').addEventListener('click', function(){
    var name = ov.querySelector('#svName').value.trim(), price = parseFloat(ov.querySelector('#svPrice').value);
    if(!name || !isFinite(price) || price < 0){ ov.querySelector('#svErr').innerHTML = '<div class="banner">' + esc(tr('Enter the service name and its price.')) + '</div>'; return; }
    var d = { name:name, sellPrice:price, durationMin:parseInt(ov.querySelector('#svMin').value, 10) || 30, category:ov.querySelector('#svCat').value, isService:true, stockQty:null, updatedAt:new Date().toISOString() };
    if(p){ refs.products.doc(p.id).update(d); logAudit('update', 'product', p.id, 'Edited service ' + name); }
    else { refs.products.doc().set(Object.assign({ costPrice:0, unit:'', lowStock:null, barcode:'', expiryDate:'', supplierId:'', createdAt:new Date().toISOString() }, d)); logAudit('create', 'product', null, 'Added service ' + name); }
    syncNowSafe(); closeModal(); setTimeout(openServicesSheet, 350);
  });
  var off = ov.querySelector('#svOff'); if(off) off.addEventListener('click', function(){ refs.products.doc(p.id).update({ hidden:true, isService:true, archived:true }); logAudit('update', 'product', p.id, 'Hid service ' + p.name); closeModal(); setTimeout(openServicesSheet, 350); });
}

/* ---- appointments ---- */
function openApptSheet(date){
  var list = vApptsOn(date).sort(function(a, b){ return String(a.time).localeCompare(String(b.time)); });
  var html = '<div class="sheet-head"><h2>' + tr('Appointments') + '</h2></div>' +
    '<div class="actions" style="margin:0 0 8px;"><button class="btn btn-ghost" id="apPrev" type="button">&larr;</button><button class="btn btn-ghost" id="apToday" type="button" style="flex:1;">' + esc(date === todayKey() ? tr('Today') + ', ' : '') + esc(vDayLabel(date)) + '</button><button class="btn btn-ghost" id="apNext" type="button">&rarr;</button></div>' +
    (list.length ? '<div class="rowlist">' + list.map(function(a){
      var late = a.status === 'booked' && date === todayKey() && String(a.time) < new Date().toTimeString().slice(0, 5);
      return '<div class="row" style="display:block;"><div style="display:flex;justify-content:space-between;gap:8px;"><div class="main"><div class="title">' + esc(a.time || '') + ' ' + esc(a.clientName || '') + '</div><div class="sub">' + esc((a.serviceNames || []).join(', ')) + (a.stylistName ? ' · ' + esc(a.stylistName) : '') + (a.deposit ? ' · ' + tr('deposit') + ' ' + fmtMoney(a.deposit) : '') + '</div>' + (a.notes ? '<div class="sub">' + esc(a.notes) + '</div>' : '') + '</div><div class="trail num"><b>' + fmtMoney(a.total || 0) + '</b><div class="sub" style="color:' + (late ? 'var(--danger)' : 'inherit') + ';">' + esc(tr(VS_STATUS[a.status] || a.status)) + (late ? ' ' + tr('(late)') : '') + '</div></div></div>' +
        '<div class="actions" style="margin:8px 0 0;flex-wrap:wrap;">' + apptButtons(a) + '</div></div>';
    }).join('') + '</div>' : '<div class="empty"><div class="t">' + tr('No appointments this day') + '</div></div>') +
    '<div class="actions"><button class="btn btn-primary" id="apNew" type="button">' + tr('New booking') + '</button><button class="btn btn-ghost" id="apClose" type="button">' + tr('Close') + '</button></div>';
  var ov = openSheet(html);
  ov.querySelector('#apClose').addEventListener('click', closeModal);
  ov.querySelector('#apNew').addEventListener('click', function(){ closeModal(); openApptForm(null, date); });
  ov.querySelector('#apPrev').addEventListener('click', function(){ closeModal(); openApptSheet(vAddDays(date, -1)); });
  ov.querySelector('#apNext').addEventListener('click', function(){ closeModal(); openApptSheet(vAddDays(date, 1)); });
  ov.querySelector('#apToday').addEventListener('click', function(){ closeModal(); openApptSheet(todayKey()); });
  ov.querySelectorAll('[data-ap]').forEach(function(b){ b.addEventListener('click', function(){ apptAction(b.getAttribute('data-id'), b.getAttribute('data-ap'), date); }); });
}
function apptButtons(a){
  var b = function(k, label, cls){ return '<button class="btn ' + (cls || 'btn-ghost') + '" type="button" data-ap="' + k + '" data-id="' + a.id + '" style="padding:6px 10px;font-size:12.5px;">' + tr(label) + '</button>'; };
  var out = '';
  if(a.status === 'booked') out += b('arrived', 'Arrived', 'btn-accent') + b('remind', 'WhatsApp reminder') + b('noshow', 'No show') + b('cancel', 'Cancel');
  else if(a.status === 'arrived' || a.status === 'waiting') out += b('start', 'Start', 'btn-accent') + b('charge', 'Charge', 'btn-primary') + b('cancel', 'Cancel');
  else if(a.status === 'inchair') out += b('charge', 'Finish and charge', 'btn-primary');
  else if(a.status === 'noshow') out += b('rebook', 'Rebook');
  return out;
}
function apptAction(id, act, date){
  var a = vList('appointments').find(function(x){ return x.id === id; }); if(!a) return;
  if(act === 'arrived') vPatch('appointments', id, { status:'arrived' });
  else if(act === 'start') vPatch('appointments', id, { status:'inchair' });
  else if(act === 'noshow'){ vPatch('appointments', id, { status:'noshow' }); logAudit('other', 'appointment', id, 'No show: ' + a.clientName); }
  else if(act === 'cancel'){ vPatch('appointments', id, { status:'cancelled' }); logAudit('other', 'appointment', id, 'Cancelled: ' + a.clientName); }
  else if(act === 'rebook'){ closeModal(); openApptForm(null, vAddDays(todayKey(), 1), a); return; }
  else if(act === 'remind'){
    var link = vWaLink(a.clientPhone, 'Hello ' + (a.clientName || '') + ', this is a reminder of your appointment at ' + vShop() + ' on ' + vDayLabel(a.date) + ' at ' + a.time + '. Reply to confirm. Thank you.');
    if(!link){ toast(tr('Add the client phone number first.')); return; } window.open(link, '_blank', 'noopener'); return;
  } else if(act === 'charge'){
    if(!vCartIsFree()) return;
    var svc = (a.serviceIds || []).map(function(sid){ return State.products.find(function(p){ return p.id === sid; }); }).filter(Boolean);
    if(!svc.length){ toast(tr('This booking has no services. Edit it or sell from the Sell page.')); return; }
    svc.forEach(function(p){ vCartAdd({ productId:p.id, name:p.name, unitPrice:p.sellPrice || 0, cost:p.costPrice || 0, unit:'', apptId:a.id, stylistId:a.stylistId || '', stylistName:a.stylistName || '' }); });
    vOpenCharge(); return;
  }
  closeModal(); openApptSheet(date);
}
function openApptForm(a, date, from){
  var svc = vServices(), staff = vStaff(), src = a || from || {};
  var html = '<div class="sheet-head"><h2>' + tr(a ? 'Edit booking' : 'New booking') + '</h2></div>' +
    vField('Client name', '<input id="apName" list="apClients" autocomplete="off" value="' + esc(src.clientName || '') + '"><datalist id="apClients">' + vClientsList().map(function(c){ return '<option value="' + esc(c.name) + '">'; }).join('') + '</datalist>') +
    vField('Phone or WhatsApp', '<input id="apPhone" inputmode="tel" placeholder="081 234 5678" value="' + esc(src.clientPhone || '') + '">') +
    vField('Services', svc.length ? '<div id="apSvc" style="display:grid;gap:6px;">' + svc.map(function(p){ return '<label style="display:flex;gap:8px;align-items:center;"><input type="checkbox" data-s="' + p.id + '" style="width:auto;"' + ((src.serviceIds || []).indexOf(p.id) > -1 ? ' checked' : '') + '><span style="flex:1;">' + esc(p.name) + '</span><span class="num">' + fmtMoney(p.sellPrice || 0) + '</span></label>'; }).join('') + '</div>' : '<div class="banner">' + tr('Add your services first under Services and prices.') + '</div>') +
    '<div class="field-row">' + vField('Date', '<input id="apDate" type="date" value="' + (src.date && a ? src.date : date) + '">') + vField('Time', '<input id="apTime" type="time" value="' + (a ? a.time : '09:00') + '">') + '</div>' +
    vField('Barber or stylist', '<select id="apStaff">' + vOpts(staff.map(function(u){ return [u.id, u.name]; }), src.stylistId, 'Anyone') + '</select>') +
    '<div class="field-row">' + vField('Deposit received (N$, optional)', '<input id="apDep" type="number" inputmode="decimal" step="0.01" value="' + (src.deposit || '') + '">') + '</div>' +
    vField('Notes (hair type, style wanted, allergies)', '<textarea id="apNotes" rows="2">' + esc(src.notes || '') + '</textarea>') +
    '<div id="apErr"></div><div class="actions"><button class="btn btn-primary btn-block" id="apSave" type="button">' + tr('Save booking') + '</button><button class="btn btn-ghost" id="apBack" type="button">' + tr('Back') + '</button></div>';
  var ov = openSheet(html, { center:true });
  ov.querySelector('#apBack').addEventListener('click', function(){ closeModal(); openApptSheet(date); });
  ov.querySelector('#apName').addEventListener('change', function(){ var c = vClientsList().find(function(x){ return String(x.name).toLowerCase() === ov.querySelector('#apName').value.trim().toLowerCase(); }); if(c && c.phone && !ov.querySelector('#apPhone').value) ov.querySelector('#apPhone').value = c.phone; });
  ov.querySelector('#apSave').addEventListener('click', function(){
    var name = ov.querySelector('#apName').value.trim(), ids = [].slice.call(ov.querySelectorAll('[data-s]:checked')).map(function(x){ return x.getAttribute('data-s'); }),
        d = ov.querySelector('#apDate').value, t = ov.querySelector('#apTime').value;
    function fail(m){ ov.querySelector('#apErr').innerHTML = '<div class="banner">' + esc(tr(m)) + '</div>'; }
    if(!name) return fail('Enter the client name.'); if(!d || !t) return fail('Choose the date and time.');
    var sv = ids.map(function(i){ return State.products.find(function(p){ return p.id === i; }); }).filter(Boolean);
    var su = vStaff().find(function(u){ return u.id === ov.querySelector('#apStaff').value; });
    var clash = su && vList('appointments').some(function(x){ return x.id !== (a && a.id) && x.stylistId === su.id && x.date === d && x.time === t && x.status !== 'cancelled' && x.status !== 'noshow'; });
    if(clash) return fail('This person already has a booking at that time. Choose another time or person.');
    var phone = ov.querySelector('#apPhone').value.trim();
    var cust = vClientsList().find(function(c){ return String(c.name).toLowerCase() === name.toLowerCase(); });
    if(!cust){ var cid = uid('c'); refs.customers.doc(cid).set({ name:name, phone:phone, balance:0, createdAt:new Date().toISOString() }); cust = { id:cid }; }
    else if(phone && !cust.phone) refs.customers.doc(cust.id).update({ phone:phone });
    var doc = { clientName:name, clientPhone:phone, customerId:cust.id, serviceIds:ids, serviceNames:sv.map(function(p){ return p.name; }), total:vSum(sv, function(p){ return p.sellPrice; }), durationMin:vSum(sv, function(p){ return p.durationMin || 30; }) || 30,
      stylistId:su ? su.id : '', stylistName:su ? su.name : '', date:d, time:t, status:a ? a.status : 'booked', kind:'booking', deposit:parseFloat(ov.querySelector('#apDep').value) || 0, notes:ov.querySelector('#apNotes').value.trim(), createdAt:a ? a.createdAt : new Date().toISOString() };
    vSave('appointments', a ? a.id : uid('ap'), doc); logAudit('create', 'appointment', null, 'Booking for ' + name + ' on ' + d + ' ' + t); syncNowSafe();
    closeModal(); openApptSheet(d);
  });
}

/* ---- walk in queue ---- */
function openQueueSheet(){
  var t = todayKey(), q = vList('appointments').filter(function(a){ return a.date === t && (a.status === 'waiting' || a.status === 'inchair') && a.kind === 'walkin'; }).sort(function(a, b){ return String(a.createdAt).localeCompare(String(b.createdAt)); });
  var svc = vServices(), staff = vStaff();
  var html = '<div class="sheet-head"><h2>' + tr('Walk in queue') + '</h2></div>' +
    '<div class="banner" style="display:block;">' + tr('Add people who arrive without a booking. Start them when a chair is free, then charge when done.') + '</div>' +
    (q.length ? '<div class="rowlist">' + q.map(function(a, i){ return '<div class="row" style="display:block;"><div style="display:flex;justify-content:space-between;"><div class="main"><div class="title">' + (a.status === 'waiting' ? (i + 1) + '. ' : '') + esc(a.clientName) + '</div><div class="sub">' + esc((a.serviceNames || []).join(', ')) + (a.stylistName ? ' · ' + esc(a.stylistName) : '') + '</div></div><div class="trail num"><b>' + fmtMoney(a.total || 0) + '</b><div class="sub">' + esc(tr(VS_STATUS[a.status])) + '</div></div></div><div class="actions" style="margin:8px 0 0;">' + apptButtons(a) + '</div></div>'; }).join('') + '</div>' : '<div class="empty"><div class="t">' + tr('Nobody waiting') + '</div></div>') +
    '<div class="section-title">' + tr('Add someone') + '</div>' +
    vField('Name', '<input id="qName" placeholder="First name">') + vField('Service', '<select id="qSvc">' + vOpts(svc.map(function(p){ return [p.id, p.name + ' (' + fmtMoney(p.sellPrice || 0) + ')']; }), '', 'Choose a service') + '</select>') +
    vField('Barber or stylist', '<select id="qStaff">' + vOpts(staff.map(function(u){ return [u.id, u.name]; }), '', 'Next free') + '</select>') +
    '<div id="qErr"></div><div class="actions"><button class="btn btn-primary" id="qAdd" type="button">' + tr('Add to the queue') + '</button><button class="btn btn-ghost" id="qClose" type="button">' + tr('Close') + '</button></div>';
  var ov = openSheet(html);
  ov.querySelector('#qClose').addEventListener('click', closeModal);
  ov.querySelectorAll('[data-ap]').forEach(function(b){ b.addEventListener('click', function(){
    var id = b.getAttribute('data-id'), act = b.getAttribute('data-ap');
    if(act === 'cancel') { apptAction(id, act, t); closeModal(); openQueueSheet(); return; }
    if(act === 'start'){ vPatch('appointments', id, { status:'inchair' }); closeModal(); openQueueSheet(); return; }
    apptAction(id, act, t);
  }); });
  ov.querySelector('#qAdd').addEventListener('click', function(){
    var name = ov.querySelector('#qName').value.trim(), p = svc.find(function(x){ return x.id === ov.querySelector('#qSvc').value; });
    if(!name || !p){ ov.querySelector('#qErr').innerHTML = '<div class="banner">' + esc(tr('Enter a name and choose a service.')) + '</div>'; return; }
    var su = staff.find(function(u){ return u.id === ov.querySelector('#qStaff').value; });
    vSave('appointments', uid('ap'), { clientName:name, clientPhone:'', customerId:'', serviceIds:[p.id], serviceNames:[p.name], total:p.sellPrice || 0, durationMin:p.durationMin || 30, stylistId:su ? su.id : '', stylistName:su ? su.name : '', date:t, time:new Date().toTimeString().slice(0, 5), status:'waiting', kind:'walkin', deposit:0, notes:'', createdAt:new Date().toISOString() });
    syncNowSafe(); closeModal(); openQueueSheet();
  });
}

/* ---- clients ---- */
function vClientVisits(c){ return (State.sales || []).filter(function(s){ return s.customerId === c.id && s.appointmentId; }).length + vList('appointments').filter(function(a){ return a.customerId === c.id && a.status === 'done' && !(State.sales || []).some(function(s){ return s.appointmentId === a.id; }); }).length; }
function openClientsSheet(){
  var html = '<div class="sheet-head"><h2>' + tr('Clients') + '</h2></div><div class="searchbar" style="margin-bottom:10px;">' + ICONS.search + '<input id="clQ" placeholder="' + esc(tr('Search clients')) + '"></div><div id="clList"></div>' +
    '<div class="actions"><button class="btn btn-primary" id="clNew" type="button">' + tr('Add a client') + '</button><button class="btn btn-ghost" id="clClose" type="button">' + tr('Close') + '</button></div>';
  var ov = openSheet(html);
  ov.querySelector('#clClose').addEventListener('click', closeModal);
  ov.querySelector('#clNew').addEventListener('click', function(){ closeModal(); openClientForm(null); });
  function paint(){
    var q = (ov.querySelector('#clQ').value || '').toLowerCase(), list = vClientsList().filter(function(c){ return !q || String(c.name).toLowerCase().indexOf(q) > -1 || String(c.phone || '').indexOf(q) > -1; }).slice(0, 80);
    ov.querySelector('#clList').innerHTML = list.length ? '<div class="rowlist">' + list.map(function(c){ var v = vClientVisits(c); return '<button class="row" type="button" data-cl="' + c.id + '" style="width:100%;text-align:left;"><div class="main"><div class="title">' + esc(c.name) + '</div><div class="sub">' + esc(c.phone || tr('No phone')) + (c.prefs ? ' · ' + esc(String(c.prefs).slice(0, 40)) : '') + '</div></div><div class="trail">' + v + ' ' + tr(v === 1 ? 'visit' : 'visits') + '</div></button>'; }).join('') + '</div>' : '<div class="empty"><div class="t">' + tr('No clients yet. They are added when you book them.') + '</div></div>';
    ov.querySelectorAll('[data-cl]').forEach(function(b){ b.addEventListener('click', function(){ closeModal(); openClientForm(vClientsList().find(function(c){ return c.id === b.getAttribute('data-cl'); })); }); });
  }
  ov.querySelector('#clQ').addEventListener('input', paint); paint();
}
function openClientForm(c){
  var hist = c ? vList('appointments').filter(function(a){ return a.customerId === c.id; }).sort(function(a, b){ return String(b.date).localeCompare(String(a.date)); }).slice(0, 8) : [];
  var html = '<div class="sheet-head"><h2>' + tr(c ? 'Client' : 'Add a client') + '</h2></div>' + vField('Name', '<input id="cfName" value="' + esc(c ? c.name : '') + '">') + vField('Phone or WhatsApp', '<input id="cfPhone" inputmode="tel" value="' + esc(c ? c.phone || '' : '') + '">') +
    vField('Preferences and notes (style, hair type, products, allergies)', '<textarea id="cfPrefs" rows="3">' + esc(c ? c.prefs || '' : '') + '</textarea>') +
    (c ? '<div class="section-title">' + tr('Recent visits') + '</div>' + (hist.length ? '<div class="rowlist">' + hist.map(function(a){ return '<div class="row"><div class="main"><div class="title">' + esc(vDayLabel(a.date)) + '</div><div class="sub">' + esc((a.serviceNames || []).join(', ')) + '</div></div><div class="trail">' + esc(tr(VS_STATUS[a.status] || a.status)) + '</div></div>'; }).join('') + '</div>' : '<div class="banner" style="display:block;">' + tr('No visits yet.') + '</div>') : '') +
    '<div class="actions"><button class="btn btn-primary" id="cfSave" type="button">' + tr('Save') + '</button>' + (c ? '<button class="btn btn-accent" id="cfBook" type="button">' + tr('Book now') + '</button>' : '') + '<button class="btn btn-ghost" id="cfBack" type="button">' + tr('Back') + '</button></div>';
  var ov = openSheet(html, { center:true });
  ov.querySelector('#cfBack').addEventListener('click', function(){ closeModal(); openClientsSheet(); });
  ov.querySelector('#cfSave').addEventListener('click', function(){
    var name = ov.querySelector('#cfName').value.trim(); if(!name){ toast(tr('Enter the client name.')); return; }
    var d = { name:name, phone:ov.querySelector('#cfPhone').value.trim(), prefs:ov.querySelector('#cfPrefs').value.trim() };
    if(c) refs.customers.doc(c.id).update(d); else refs.customers.doc(uid('c')).set(Object.assign({ balance:0, createdAt:new Date().toISOString() }, d));
    syncNowSafe(); closeModal(); openClientsSheet();
  });
  var bk = ov.querySelector('#cfBook'); if(bk) bk.addEventListener('click', function(){ closeModal(); openApptForm(null, todayKey(), { clientName:c.name, clientPhone:c.phone }); });
}

/* ---- stylist earnings: commission or chair rent, from sales made through bookings ---- */
function openEarningsSheet(){
  if(!isManagerOrOwner()){ toast(tr('Earnings are for owners and managers.')); return; }
  var now = new Date(), mo = new Date(now.getFullYear(), now.getMonth(), 1).getTime(), wk = Date.now() - 7 * 86400000, tdy = new Date(todayKey() + 'T00:00:00').getTime();
  var rows = vStaff().map(function(u){
    var mine = (State.sales || []).filter(function(s){ return s.stylistId === u.id; });
    var inP = function(t){ return mine.filter(function(s){ return tms(s.createdAt) >= t; }); };
    var pct = Number(u.commissionPct) || 0, rent = Number(u.chairRent) || 0, m = vSum(inP(mo), function(s){ return s.total; });
    return { u:u, today:vSum(inP(tdy), function(s){ return s.total; }), week:vSum(inP(wk), function(s){ return s.total; }), month:m, jobs:inP(mo).length, pct:pct, rent:rent, earn:Math.round(m * pct) / 100 };
  });
  var html = '<div class="sheet-head"><h2>' + tr('Stylist earnings') + '</h2></div><div class="banner" style="display:block;">' + tr('Worked out from sales charged through bookings and the walk in queue. Set each person’s commission percent, or a weekly chair rent if they rent a chair from you. Check payouts against your agreement with each person.') + '</div>' +
    (rows.length ? '<div class="rowlist">' + rows.map(function(r){ return '<div class="row" style="display:block;"><div style="display:flex;justify-content:space-between;"><div class="main"><div class="title">' + esc(r.u.name) + '</div><div class="sub">' + tr('Today') + ' ' + fmtMoney(r.today) + ' · ' + tr('7 days') + ' ' + fmtMoney(r.week) + ' · ' + r.jobs + ' ' + tr('jobs this month') + '</div></div><div class="trail num"><b>' + fmtMoney(r.month) + '</b><div class="sub">' + tr('this month') + '</div></div></div>' +
      '<div style="display:flex;gap:8px;align-items:end;margin-top:8px;"><div class="field" style="margin:0;flex:1;"><label>' + tr('Commission %') + '</label><input type="number" inputmode="decimal" min="0" max="100" data-pct="' + r.u.id + '" value="' + (r.pct || '') + '"></div><div class="field" style="margin:0;flex:1;"><label>' + tr('Chair rent per week (N$)') + '</label><input type="number" inputmode="decimal" min="0" data-rent="' + r.u.id + '" value="' + (r.rent || '') + '"></div></div>' +
      '<div class="sub" style="margin-top:6px;">' + (r.pct ? tr('Earned this month') + ' ' + fmtMoney(r.earn) + '. ' : '') + (r.rent ? tr('Rent due each week') + ' ' + fmtMoney(r.rent) + '.' : '') + '</div>' +
      (r.pct && r.earn > 0 ? '<div class="actions" style="margin:6px 0 0;"><button class="btn btn-ghost" type="button" data-pay="' + r.u.id + '" style="padding:6px 10px;font-size:12.5px;">' + tr('Record payout as an expense') + '</button></div>' : '') + '</div>'; }).join('') + '</div>' : '<div class="empty"><div class="t">' + tr('Add your team under Employee tracking first.') + '</div></div>') +
    '<div class="actions"><button class="btn btn-primary" id="erSave" type="button">' + tr('Save') + '</button><button class="btn btn-ghost" id="erClose" type="button">' + tr('Close') + '</button></div>';
  var ov = openSheet(html);
  ov.querySelector('#erClose').addEventListener('click', closeModal);
  ov.querySelector('#erSave').addEventListener('click', function(){
    rows.forEach(function(r){ var p = parseFloat(ov.querySelector('[data-pct="' + r.u.id + '"]').value) || 0, c = parseFloat(ov.querySelector('[data-rent="' + r.u.id + '"]').value) || 0;
      if(p !== r.pct || c !== r.rent) refs.users.doc(r.u.id).update({ commissionPct:Math.min(100, Math.max(0, p)), chairRent:Math.max(0, c) }); });
    toast(tr('Saved')); closeModal();
  });
  ov.querySelectorAll('[data-pay]').forEach(function(b){ b.addEventListener('click', function(){
    var r = rows.find(function(x){ return x.u.id === b.getAttribute('data-pay'); }); if(!r) return;
    refs.expenses.doc().set({ category:'Wages', amount:r.earn, note:'Commission for ' + r.u.name, paidFrom:'Cash drawer', ref:'', createdAt:new Date().toISOString() });
    logAudit('create', 'expense', null, 'Commission payout ' + fmtMoney(r.earn) + ' for ' + r.u.name); toast(tr('Payout recorded under Expenses')); b.disabled = true;
  }); });
}

/* ==================================== HOSPITALITY ==================================== */
function vRooms(){ return vList('hosRooms').filter(function(r){ return r.active !== false; }); }
function vStaysOn(date){ return vList('hosBookings').filter(function(b){ return b.status !== 'cancelled' && b.checkIn <= date && b.checkOut > date; }); }
function vRoomFree(roomId, a, b, exceptId){ return !vList('hosBookings').some(function(x){ return x.id !== exceptId && x.roomId === roomId && x.status !== 'cancelled' && x.status !== 'out' && x.checkIn < b && x.checkOut > a; }); }
function vHospDash(){
  var t = todayKey(), rooms = vRooms(), inhouse = vList('hosBookings').filter(function(b){ return b.status === 'in'; }),
      arrivals = vList('hosBookings').filter(function(b){ return b.status === 'reserved' && b.checkIn === t; }), departs = inhouse.filter(function(b){ return b.checkOut <= t; }),
      sales = vSalesToday(), total = vSum(sales, function(s){ return s.total; }), occ = rooms.length ? Math.round(inhouse.length * 100 / rooms.length) : 0, tabs = vList('hosTabs').filter(function(x){ return x.status === 'open'; });
  var h = vHero('Today’s takings', fmtMoney(total), occ + '% ' + tr('occupied') + ', ' + inhouse.length + ' ' + tr('of') + ' ' + rooms.length + ' ' + tr('rooms'));
  h += '<div class="qa-row">' + vTile('newstay', 'plus', 'New booking') + vTile('tabs', 'receipt', 'Tabs', tabs.length ? tabs.length + ' ' + tr('open') : '') + vTile('rooms', 'box', 'Rooms') + '</div>';
  h += '<div class="section-title">' + tr('Today at a glance') + '</div><div class="stats">' + vStat('Arriving today', arrivals.length) + vStat('Leaving today', departs.length, departs.length ? 'var(--warn,#d98e2b)' : '') + vStat('In house', inhouse.length + ' ' + tr('rooms')) + vStat('Open tabs', tabs.length) + vStat('Rooms ready', rooms.filter(function(r){ return (r.status || 'clean') === 'clean' && !inhouse.some(function(b){ return b.roomId === r.id; }); }).length) + vStat('Guests this month', vList('hosBookings').filter(function(b){ return String(b.checkIn).slice(0, 7) === t.slice(0, 7) && b.status !== 'cancelled'; }).length) + '</div>';
  h += '<div class="section-title">' + tr('Arrivals and departures') + '</div>';
  var ad = arrivals.map(function(b){ return [b, 'Arriving']; }).concat(departs.map(function(b){ return [b, 'Leaving']; }));
  h += ad.length ? '<div class="rowlist">' + ad.slice(0, 6).map(function(p){ var b = p[0]; return '<button class="row" type="button" data-vq="stay" data-id="' + b.id + '" style="width:100%;text-align:left;"><div class="main"><div class="title">' + esc(b.guestName) + '</div><div class="sub">' + esc(b.roomName || '') + ' · ' + vNights(b.checkIn, b.checkOut) + ' ' + tr('nights') + '</div></div><div class="trail"><span class="rolebadge">' + tr(p[1]) + '</span></div></button>'; }).join('') + '</div>' : '<div class="banner" style="display:block;">' + tr(rooms.length ? 'No arrivals or departures today.' : 'Add your rooms first, then take bookings.') + '</div>';
  h += '<div class="section-title">' + tr('Your property') + '</div><div class="qa-row">' + vTile('bookings', 'clock', 'Bookings') + vTile('guests', 'people', 'Guests') + vTile('comply', 'clipboard', 'Licences') + vTile('reports', 'chartbar', 'Reports') + '</div>';
  var m = t.slice(0, 7), roomRev = 0;
  (State.sales || []).forEach(function(s){ if(String(s.createdAt).slice(0, 7) === m) (s.items || []).forEach(function(i){ if(String(i.productId).indexOf('room:') === 0) roomRev += Number(i.lineTotal) || 0; }); });
  h += '<div class="banner" style="display:block;margin-top:10px;">' + tr('Room fees this month') + ': <b>' + fmtMoney(roomRev) + '</b>. ' + tr('Estimated Namibia Tourism Board levy at 2 percent') + ': <b>' + fmtMoney(roomRev * 0.02) + '</b>. ' + tr('This is an estimate, to be confirmed with the Namibia Tourism Board.') + '</div>';
  return h;
}

/* ---- rooms ---- */
var VH_TYPES = ['Single', 'Double', 'Twin', 'Family', 'Suite', 'Chalet', 'Campsite', 'Dormitory bed'];
var VH_STATUS = { clean:'Clean and ready', dirty:'Needs cleaning', maintenance:'Out of order' };
function openRoomsSheet(){
  var rooms = vRooms(), inhouse = vList('hosBookings').filter(function(b){ return b.status === 'in'; });
  var html = '<div class="sheet-head"><h2>' + tr('Rooms') + '</h2></div>' +
    (rooms.length ? '<div class="rowlist">' + rooms.map(function(r){ var occ = inhouse.find(function(b){ return b.roomId === r.id; }); return '<div class="row" style="display:block;"><div style="display:flex;justify-content:space-between;"><div class="main"><div class="title">' + esc(r.name) + '</div><div class="sub">' + esc(r.type || '') + ' · ' + (r.capacity || 2) + ' ' + tr('guests') + (occ ? ' · ' + tr('In use by') + ' ' + esc(occ.guestName) : '') + '</div></div><div class="trail num"><b>' + fmtMoney(r.rate || 0) + '</b><div class="sub">' + tr('per night') + '</div></div></div><div class="actions" style="margin:8px 0 0;"><select data-rs="' + r.id + '" style="flex:1;">' + vOpts(Object.keys(VH_STATUS).map(function(k){ return [k, tr(VH_STATUS[k])]; }), r.status || 'clean') + '</select><button class="btn btn-ghost" type="button" data-re="' + r.id + '" style="padding:6px 10px;">' + tr('Edit') + '</button></div></div>'; }).join('') + '</div>' : '<div class="empty"><div class="t">' + tr('No rooms yet') + '</div></div>') +
    '<div class="actions"><button class="btn btn-primary" id="rmAdd" type="button">' + tr('Add a room') + '</button><button class="btn btn-ghost" id="rmClose" type="button">' + tr('Close') + '</button></div>';
  var ov = openSheet(html);
  ov.querySelector('#rmClose').addEventListener('click', closeModal);
  ov.querySelector('#rmAdd').addEventListener('click', function(){ closeModal(); openRoomForm(null); });
  ov.querySelectorAll('[data-rs]').forEach(function(s){ s.addEventListener('change', function(){ vPatch('hosRooms', s.getAttribute('data-rs'), { status:s.value }); toast(tr('Room updated')); }); });
  ov.querySelectorAll('[data-re]').forEach(function(b){ b.addEventListener('click', function(){ closeModal(); openRoomForm(rooms.find(function(r){ return r.id === b.getAttribute('data-re'); })); }); });
}
function openRoomForm(r){
  var html = '<div class="sheet-head"><h2>' + tr(r ? 'Edit room' : 'Add a room') + '</h2></div>' + vField('Room name or number', '<input id="rfName" value="' + esc(r ? r.name : '') + '" placeholder="e.g. Room 1 or Chalet Oryx">') +
    '<div class="field-row">' + vField('Type', '<select id="rfType">' + vOpts(VH_TYPES.map(function(x){ return [x, x]; }), r ? r.type : 'Double') + '</select>') + vField('Sleeps', '<input id="rfCap" type="number" inputmode="numeric" value="' + (r ? r.capacity || 2 : 2) + '">') + '</div>' +
    vField('Rate per night (N$)', '<input id="rfRate" type="number" inputmode="decimal" step="0.01" value="' + (r ? r.rate || '' : '') + '">') +
    '<div id="rfErr"></div><div class="actions"><button class="btn btn-primary" id="rfSave" type="button">' + tr('Save') + '</button>' + (r ? '<button class="btn btn-danger" id="rfOff" type="button">' + tr('Hide this room') + '</button>' : '') + '<button class="btn btn-ghost" id="rfBack" type="button">' + tr('Back') + '</button></div>';
  var ov = openSheet(html, { center:true });
  ov.querySelector('#rfBack').addEventListener('click', function(){ closeModal(); openRoomsSheet(); });
  ov.querySelector('#rfSave').addEventListener('click', function(){
    var name = ov.querySelector('#rfName').value.trim(), rate = parseFloat(ov.querySelector('#rfRate').value);
    if(!name || !isFinite(rate) || rate < 0){ ov.querySelector('#rfErr').innerHTML = '<div class="banner">' + esc(tr('Enter the room name and its rate.')) + '</div>'; return; }
    vSave('hosRooms', r ? r.id : uid('rm'), { name:name, type:ov.querySelector('#rfType').value, capacity:parseInt(ov.querySelector('#rfCap').value, 10) || 2, rate:rate, status:r ? r.status : 'clean', active:true, createdAt:r ? r.createdAt : new Date().toISOString() });
    syncNowSafe(); closeModal(); openRoomsSheet();
  });
  var off = ov.querySelector('#rfOff'); if(off) off.addEventListener('click', function(){ vPatch('hosRooms', r.id, { active:false }); closeModal(); openRoomsSheet(); });
}

/* ---- room bookings: list, 14 day board, new booking, check in, check out ---- */
function openBookingsSheet(){
  var t = todayKey(), rooms = vRooms(), days = []; for(var i = 0; i < 14; i++) days.push(vAddDays(t, i));
  var open = vList('hosBookings').filter(function(b){ return b.status === 'reserved' || b.status === 'in'; }).sort(function(a, b){ return String(a.checkIn).localeCompare(String(b.checkIn)); });
  var board = rooms.length ? '<div style="overflow-x:auto;margin:6px 0 10px;"><table style="border-collapse:collapse;font-size:11px;min-width:100%;color:#EAFBF3;"><tr><th style="text-align:left;padding:3px 6px;">' + tr('Room') + '</th>' + days.map(function(d){ return '<th style="padding:3px 4px;">' + d.slice(8) + '</th>'; }).join('') + '</tr>' +
    rooms.map(function(r){ return '<tr><td style="padding:3px 6px;white-space:nowrap;">' + esc(r.name) + '</td>' + days.map(function(d){ var b = vStaysOn(d).find(function(x){ return x.roomId === r.id; }); return '<td style="padding:0;"><div style="height:22px;min-width:18px;margin:1px;border-radius:5px;background:' + (b ? (b.status === 'in' ? '#2BD4A0' : '#F2C25A') : 'rgba(255,255,255,.08)') + ';" title="' + esc(b ? b.guestName : '') + '"></div></td>'; }).join('') + '</tr>'; }).join('') + '</table><div class="sub" style="margin-top:4px;"><span style="color:#2BD4A0;">&#9632;</span> ' + tr('In house') + ' <span style="color:#F2C25A;">&#9632;</span> ' + tr('Reserved') + '</div></div>' : '';
  var html = '<div class="sheet-head"><h2>' + tr('Room bookings') + '</h2></div>' + board +
    (open.length ? '<div class="rowlist">' + open.map(function(b){ return '<button class="row" type="button" data-st="' + b.id + '" style="width:100%;text-align:left;"><div class="main"><div class="title">' + esc(b.guestName) + '</div><div class="sub">' + esc(b.roomName || '') + ' · ' + esc(vDayLabel(b.checkIn)) + ' to ' + esc(vDayLabel(b.checkOut)) + ' · ' + vNights(b.checkIn, b.checkOut) + ' ' + tr('nights') + '</div></div><div class="trail"><span class="rolebadge">' + tr(b.status === 'in' ? 'In house' : 'Reserved') + '</span></div></button>'; }).join('') + '</div>' : '<div class="empty"><div class="t">' + tr('No current or upcoming bookings') + '</div></div>') +
    '<div class="actions"><button class="btn btn-primary" id="bkNew" type="button">' + tr('New booking') + '</button><button class="btn btn-ghost" id="bkClose" type="button">' + tr('Close') + '</button></div>';
  var ov = openSheet(html);
  ov.querySelector('#bkClose').addEventListener('click', closeModal);
  ov.querySelector('#bkNew').addEventListener('click', function(){ closeModal(); openStayForm(null); });
  ov.querySelectorAll('[data-st]').forEach(function(b){ b.addEventListener('click', function(){ closeModal(); openStayView(vList('hosBookings').find(function(x){ return x.id === b.getAttribute('data-st'); })); }); });
}
var VH_SOURCES = ['Walk in', 'Phone', 'WhatsApp', 'Booking.com', 'Airbnb', 'Travel agent', 'Other'];
function openStayForm(b){
  var rooms = vRooms(), t = todayKey();
  if(!rooms.length){ toast(tr('Add your rooms first.')); openRoomsSheet(); return; }
  var html = '<div class="sheet-head"><h2>' + tr(b ? 'Edit booking' : 'New room booking') + '</h2></div>' + vField('Guest name', '<input id="sfGuest" list="sfGuests" value="' + esc(b ? b.guestName : '') + '"><datalist id="sfGuests">' + vClientsList().map(function(c){ return '<option value="' + esc(c.name) + '">'; }).join('') + '</datalist>') +
    '<div class="field-row">' + vField('Phone or WhatsApp', '<input id="sfPhone" inputmode="tel" value="' + esc(b ? b.phone || '' : '') + '">') + vField('Email (optional)', '<input id="sfMail" type="email" value="' + esc(b ? b.email || '' : '') + '">') + '</div>' +
    '<div class="field-row">' + vField('Check in', '<input id="sfIn" type="date" value="' + (b ? b.checkIn : t) + '">') + vField('Check out', '<input id="sfOut" type="date" value="' + (b ? b.checkOut : vAddDays(t, 1)) + '">') + '</div>' +
    '<div class="field-row">' + vField('Room', '<select id="sfRoom">' + vOpts(rooms.map(function(r){ return [r.id, r.name + ' (' + fmtMoney(r.rate || 0) + ')']; }), b ? b.roomId : '') + '</select>') + vField('Guests', '<input id="sfAd" type="number" inputmode="numeric" value="' + (b ? b.adults || 2 : 2) + '">') + '</div>' +
    '<div class="field-row">' + vField('Rate per night (N$)', '<input id="sfRate" type="number" inputmode="decimal" step="0.01" value="' + (b ? b.rate : '') + '">') + vField('Deposit received (N$)', '<input id="sfDep" type="number" inputmode="decimal" step="0.01" value="' + (b ? b.deposit || '' : '') + '">') + '</div>' +
    vField('Where did the booking come from?', '<select id="sfSrc">' + vOpts(VH_SOURCES.map(function(x){ return [x, x]; }), b ? b.source : 'Walk in') + '</select>') + vField('Notes (arrival time, meals, requests)', '<textarea id="sfNotes" rows="2">' + esc(b ? b.notes || '' : '') + '</textarea>') +
    '<div id="sfErr"></div><div class="actions"><button class="btn btn-primary btn-block" id="sfSave" type="button">' + tr('Save booking') + '</button><button class="btn btn-ghost" id="sfBack" type="button">' + tr('Back') + '</button></div>';
  var ov = openSheet(html, { center:true }), rateEl = ov.querySelector('#sfRate'), roomEl = ov.querySelector('#sfRoom');
  function pickRate(){ var r = rooms.find(function(x){ return x.id === roomEl.value; }); if(r && (!rateEl.value || rateEl.dataset.auto === '1')){ rateEl.value = r.rate || ''; rateEl.dataset.auto = '1'; } }
  roomEl.addEventListener('change', pickRate); rateEl.addEventListener('input', function(){ rateEl.dataset.auto = '0'; }); pickRate();
  ov.querySelector('#sfBack').addEventListener('click', function(){ closeModal(); openBookingsSheet(); });
  ov.querySelector('#sfSave').addEventListener('click', function(){
    var g = ov.querySelector('#sfGuest').value.trim(), a = ov.querySelector('#sfIn').value, c = ov.querySelector('#sfOut').value, room = rooms.find(function(x){ return x.id === roomEl.value; }), rate = parseFloat(rateEl.value);
    function fail(m){ ov.querySelector('#sfErr').innerHTML = '<div class="banner">' + esc(tr(m)) + '</div>'; }
    if(!g) return fail('Enter the guest name.'); if(!a || !c || c <= a) return fail('Check out must be after check in.'); if(!isFinite(rate) || rate < 0) return fail('Enter the rate per night.');
    if(!vRoomFree(room.id, a, c, b && b.id)) return fail('That room is already booked for those dates. Choose another room or other dates.');
    var phone = ov.querySelector('#sfPhone').value.trim(), cust = vClientsList().find(function(x){ return String(x.name).toLowerCase() === g.toLowerCase(); });
    if(!cust){ var cid = uid('c'); refs.customers.doc(cid).set({ name:g, phone:phone, balance:0, createdAt:new Date().toISOString() }); cust = { id:cid }; }
    vSave('hosBookings', b ? b.id : uid('bk'), { guestName:g, customerId:cust.id, phone:phone, email:ov.querySelector('#sfMail').value.trim(), adults:parseInt(ov.querySelector('#sfAd').value, 10) || 1, roomId:room.id, roomName:room.name, checkIn:a, checkOut:c, rate:rate, deposit:parseFloat(ov.querySelector('#sfDep').value) || 0, source:ov.querySelector('#sfSrc').value, notes:ov.querySelector('#sfNotes').value.trim(), status:b ? b.status : 'reserved', createdAt:b ? b.createdAt : new Date().toISOString() });
    logAudit('create', 'booking', null, 'Room booking for ' + g + ', ' + room.name + ', ' + a + ' to ' + c); syncNowSafe(); closeModal(); openBookingsSheet();
  });
}
function stayFolio(b){
  var nights = vNights(b.checkIn, b.checkOut), room = b.rate * nights, tabs = vList('hosTabs').filter(function(x){ return x.bookingId === b.id && x.status === 'open'; }), extras = vSum(tabs, function(x){ return vSum(x.items || [], function(i){ return i.qty * i.unitPrice; }); });
  return { nights:nights, room:room, tabs:tabs, extras:extras, total:room + extras, due:room + extras - (b.deposit || 0) };
}
function openStayView(b){
  var f = stayFolio(b), html = '<div class="sheet-head"><h2>' + esc(b.guestName) + '</h2></div><div class="rowlist">' +
    '<div class="row"><div class="main"><div class="title">' + esc(b.roomName) + '</div><div class="sub">' + esc(vDayLabel(b.checkIn)) + ' to ' + esc(vDayLabel(b.checkOut)) + ' · ' + f.nights + ' ' + tr('nights') + ' · ' + (b.adults || 1) + ' ' + tr('guests') + '</div></div><div class="trail"><span class="rolebadge">' + tr({ reserved:'Reserved', in:'In house', out:'Checked out', cancelled:'Cancelled' }[b.status]) + '</span></div></div>' +
    '<div class="row"><div class="main"><div class="title">' + tr('Room') + ' (' + f.nights + ' x ' + fmtMoney(b.rate) + ')</div></div><div class="trail num">' + fmtMoney(f.room) + '</div></div>' +
    f.tabs.map(function(x){ return '<div class="row"><div class="main"><div class="title">' + esc(x.name) + '</div><div class="sub">' + tr('Added to the room') + '</div></div><div class="trail num">' + fmtMoney(vSum(x.items || [], function(i){ return i.qty * i.unitPrice; })) + '</div></div>'; }).join('') +
    '<div class="row"><div class="main"><div class="title"><b>' + tr('Total') + '</b></div></div><div class="trail num"><b>' + fmtMoney(f.total) + '</b></div></div>' + (b.deposit ? '<div class="row"><div class="main"><div class="title">' + tr('Deposit already received') + '</div></div><div class="trail num">' + fmtMoney(b.deposit) + '</div></div><div class="row"><div class="main"><div class="title"><b>' + tr('Balance to collect') + '</b></div></div><div class="trail num"><b>' + fmtMoney(f.due) + '</b></div></div>' : '') + '</div>' +
    (b.notes ? '<div class="banner" style="display:block;">' + esc(b.notes) + '</div>' : '') +
    '<div class="actions vs-acts" style="flex-wrap:wrap;"><style>.vs-acts .btn{flex:1 1 44%;}</style>' + (b.status === 'reserved' ? '<button class="btn btn-accent" data-sa="in" type="button">' + tr('Check in') + '</button>' : '') + (b.status === 'in' ? '<button class="btn btn-primary" data-sa="out" type="button">' + tr('Check out and charge') + '</button><button class="btn btn-ghost" data-sa="tab" type="button">' + tr('Add food or drinks') + '</button>' : '') +
    (b.status === 'reserved' || b.status === 'in' ? '<button class="btn btn-ghost" data-sa="edit" type="button">' + tr('Edit') + '</button>' : '') + (b.status === 'reserved' ? '<button class="btn btn-ghost" data-sa="cancel" type="button">' + tr('Cancel booking') + '</button>' : '') + (b.phone ? '<button class="btn btn-ghost" data-sa="wa" type="button">WhatsApp</button>' : '') + '<button class="btn btn-ghost" data-sa="back" type="button">' + tr('Back') + '</button></div>';
  var ov = openSheet(html);
  ov.querySelectorAll('[data-sa]').forEach(function(x){ x.addEventListener('click', function(){
    var a = x.getAttribute('data-sa');
    if(a === 'back'){ closeModal(); openBookingsSheet(); }
    else if(a === 'in'){ vPatch('hosBookings', b.id, { status:'in', checkedInAt:new Date().toISOString() }); vPatch('hosRooms', b.roomId, { status:'clean' }); logAudit('other', 'booking', b.id, 'Checked in ' + b.guestName); closeModal(); openStayView(Object.assign({}, b, { status:'in' })); }
    else if(a === 'cancel'){ vPatch('hosBookings', b.id, { status:'cancelled' }); logAudit('other', 'booking', b.id, 'Cancelled booking for ' + b.guestName); closeModal(); openBookingsSheet(); }
    else if(a === 'edit'){ closeModal(); openStayForm(b); }
    else if(a === 'tab'){ closeModal(); openTabForm(null, b); }
    else if(a === 'wa'){ var l = vWaLink(b.phone, 'Hello ' + b.guestName + ', thank you for booking with ' + vShop() + ' (' + vDayLabel(b.checkIn) + ' to ' + vDayLabel(b.checkOut) + ').'); if(l) window.open(l, '_blank', 'noopener'); }
    else if(a === 'out'){
      if(!vCartIsFree()) return;
      vCartAdd({ productId:'room:' + b.roomId, name:b.roomName + ', ' + f.nights + (f.nights === 1 ? ' night' : ' nights'), unitPrice:b.rate, qty:f.nights, bookingId:b.id, roomId:b.roomId });
      f.tabs.forEach(function(tb){ (tb.items || []).forEach(function(i){ vCartAdd({ productId:i.productId, name:i.name, unitPrice:i.unitPrice, cost:i.cost || 0, qty:i.qty, tabId:tb.id }); }); });
      vPatch('hosRooms', b.roomId, { status:'dirty' }); vOpenCharge();
    }
  }); });
}

/* ---- tables and tabs (restaurant, bar, room service) ---- */
function vTabTotal(t){ return vSum(t.items || [], function(i){ return i.qty * i.unitPrice; }); }
function openTabsSheet(){
  var tabs = vList('hosTabs').filter(function(x){ return x.status === 'open'; }).sort(function(a, b){ return String(a.createdAt).localeCompare(String(b.createdAt)); });
  var html = '<div class="sheet-head"><h2>' + tr('Tables and tabs') + '</h2></div><div class="banner" style="display:block;">' + tr('Open a tab for a table, the bar or a room. Add food and drinks as they are ordered, then charge the tab. Drinks and food use your normal stock list, so stock goes down when you charge.') + '</div>' +
    (tabs.length ? '<div class="rowlist">' + tabs.map(function(x){ return '<button class="row" type="button" data-tb="' + x.id + '" style="width:100%;text-align:left;"><div class="main"><div class="title">' + esc(x.name) + '</div><div class="sub">' + (x.items || []).length + ' ' + tr('items') + (x.bookingId ? ' · ' + tr('on a room') : '') + '</div></div><div class="trail num"><b>' + fmtMoney(vTabTotal(x)) + '</b></div></button>'; }).join('') + '</div>' : '<div class="empty"><div class="t">' + tr('No open tabs') + '</div></div>') +
    '<div class="actions"><button class="btn btn-primary" id="tbNew" type="button">' + tr('Open a tab') + '</button><button class="btn btn-ghost" id="tbClose" type="button">' + tr('Close') + '</button></div>';
  var ov = openSheet(html);
  ov.querySelector('#tbClose').addEventListener('click', closeModal);
  ov.querySelector('#tbNew').addEventListener('click', function(){ closeModal(); openTabForm(null, null); });
  ov.querySelectorAll('[data-tb]').forEach(function(b){ b.addEventListener('click', function(){ closeModal(); openTabForm(vList('hosTabs').find(function(x){ return x.id === b.getAttribute('data-tb'); }), null); }); });
}
function openTabForm(tab, booking){
  var t = tab ? JSON.parse(JSON.stringify(tab)) : { id:uid('tb'), name:booking ? booking.roomName + ' ' + booking.guestName : '', items:[], status:'open', bookingId:booking ? booking.id : (tab && tab.bookingId) || '', createdAt:new Date().toISOString(), openedBy:State.session ? State.session.name : '' };
  var prods = (State.products || []).filter(function(p){ return !p.isService && !p.hidden && !p.archived; }).sort(function(a, b){ return String(a.name).localeCompare(String(b.name)); });
  var stays = vList('hosBookings').filter(function(b){ return b.status === 'in'; });
  var ov = openSheet('<div id="tfBody"></div>');
  function paint(){
    ov.querySelector('#tfBody').innerHTML = '<div class="sheet-head"><h2>' + tr('Tab') + '</h2></div>' + vField('Name (table, bar or room)', '<input id="tfName" value="' + esc(t.name) + '" placeholder="e.g. Table 4">') +
      (stays.length ? vField('Put this on a room', '<select id="tfRoom">' + vOpts(stays.map(function(b){ return [b.id, b.roomName + ' ' + b.guestName]; }), t.bookingId, 'Not on a room') + '</select>') : '') +
      '<div class="section-title">' + tr('Items') + '</div>' + (t.items.length ? '<div class="rowlist">' + t.items.map(function(i, n){ return '<div class="row"><div class="main"><div class="title">' + esc(i.name) + '</div><div class="sub">' + fmtMoney(i.unitPrice) + '</div></div><div class="trail" style="display:flex;gap:6px;align-items:center;"><button class="btn btn-ghost" data-m="' + n + '" type="button" style="padding:4px 10px;">-</button><b>' + i.qty + '</b><button class="btn btn-ghost" data-p="' + n + '" type="button" style="padding:4px 10px;">+</button></div></div>'; }).join('') + '</div><div class="row"><div class="main"><div class="title"><b>' + tr('Total') + '</b></div></div><div class="trail num"><b>' + fmtMoney(vTabTotal(t)) + '</b></div></div>' : '<div class="banner" style="display:block;">' + tr('Nothing added yet.') + '</div>') +
      '<div class="field"><label>' + tr('Add an item') + '</label><input id="tfQ" placeholder="' + esc(tr('Search the menu and drinks')) + '" autocomplete="off"></div><div id="tfRes"></div>' +
      '<div class="actions" style="flex-wrap:wrap;"><button class="btn btn-ghost" id="tfSave" type="button">' + tr('Save tab') + '</button>' + (t.items.length ? '<button class="btn btn-primary" id="tfCharge" type="button">' + tr('Charge the tab') + '</button>' : '') + '<button class="btn btn-ghost" id="tfBack" type="button">' + tr('Back') + '</button></div>';
    var q = ov.querySelector('#tfQ');
    q.addEventListener('input', function(){
      var s = q.value.toLowerCase().trim(), hits = s ? prods.filter(function(p){ return String(p.name).toLowerCase().indexOf(s) > -1; }).slice(0, 8) : [];
      ov.querySelector('#tfRes').innerHTML = hits.length ? '<div class="rowlist">' + hits.map(function(p){ return '<button class="row" type="button" data-add="' + p.id + '" style="width:100%;text-align:left;"><div class="main"><div class="title">' + esc(p.name) + '</div></div><div class="trail num">' + fmtMoney(p.sellPrice || 0) + '</div></button>'; }).join('') + '</div>' : '';
      ov.querySelectorAll('[data-add]').forEach(function(b){ b.addEventListener('click', function(){ keep(); var p = prods.find(function(x){ return x.id === b.getAttribute('data-add'); }), ex = t.items.find(function(i){ return i.productId === p.id; }); if(ex) ex.qty++; else t.items.push({ productId:p.id, name:p.name, qty:1, unitPrice:p.sellPrice || 0, cost:p.costPrice || 0 }); paint(); }); });
    });
    ov.querySelectorAll('[data-p]').forEach(function(b){ b.addEventListener('click', function(){ keep(); t.items[+b.getAttribute('data-p')].qty++; paint(); }); });
    ov.querySelectorAll('[data-m]').forEach(function(b){ b.addEventListener('click', function(){ keep(); var i = t.items[+b.getAttribute('data-m')]; i.qty--; if(i.qty <= 0) t.items.splice(+b.getAttribute('data-m'), 1); paint(); }); });
    ov.querySelector('#tfBack').addEventListener('click', function(){ closeModal(); openTabsSheet(); });
    ov.querySelector('#tfSave').addEventListener('click', function(){ if(!persist()) return; closeModal(); openTabsSheet(); });
    var ch = ov.querySelector('#tfCharge'); if(ch) ch.addEventListener('click', function(){
      if(!persist()) return; if(t.bookingId){ toast(tr('This tab is on a room. It is charged when the guest checks out.')); closeModal(); openTabsSheet(); return; }
      if(!vCartIsFree()) return;
      t.items.forEach(function(i){ vCartAdd({ productId:i.productId, name:i.name, unitPrice:i.unitPrice, cost:i.cost || 0, qty:i.qty, tabId:t.id }); }); vOpenCharge();
    });
  }
  function keep(){ var n = ov.querySelector('#tfName'); if(n) t.name = n.value; var r = ov.querySelector('#tfRoom'); if(r) t.bookingId = r.value; }
  function persist(){ keep(); if(!t.name.trim()){ toast(tr('Name the tab first.')); return false; } vSave('hosTabs', t.id, { name:t.name.trim(), items:t.items, status:'open', bookingId:t.bookingId || '', createdAt:t.createdAt, openedBy:t.openedBy }); syncNowSafe(); return true; }
  paint();
}

/* ---- guests and compliance ---- */
function openGuestsSheet(){
  var map = {}; vList('hosBookings').filter(function(b){ return b.status !== 'cancelled'; }).forEach(function(b){ var k = String(b.guestName).toLowerCase(), m = map[k] || (map[k] = { name:b.guestName, phone:b.phone, n:0, last:'', nights:0 }); m.n++; m.nights += vNights(b.checkIn, b.checkOut); if(b.checkIn > m.last) m.last = b.checkIn; });
  var list = Object.keys(map).map(function(k){ return map[k]; }).sort(function(a, b){ return String(b.last).localeCompare(String(a.last)); });
  var html = '<div class="sheet-head"><h2>' + tr('Guests') + '</h2></div>' + (list.length ? '<div class="rowlist">' + list.slice(0, 100).map(function(g){ return '<div class="row"><div class="main"><div class="title">' + esc(g.name) + '</div><div class="sub">' + esc(g.phone || tr('No phone')) + ' · ' + tr('last stay') + ' ' + esc(vDayLabel(g.last)) + '</div></div><div class="trail">' + g.n + ' ' + tr(g.n === 1 ? 'stay' : 'stays') + '<div class="sub">' + g.nights + ' ' + tr('nights') + '</div></div></div>'; }).join('') + '</div>' : '<div class="empty"><div class="t">' + tr('Guests appear here after their first booking.') + '</div></div>') + '<div class="actions"><button class="btn btn-ghost btn-block" id="gsClose" type="button">' + tr('Close') + '</button></div>';
  var ov = openSheet(html); ov.querySelector('#gsClose').addEventListener('click', closeModal);
}
function openComplySheet(){
  var s = State.settings || {}, t = todayKey();
  var html = '<div class="sheet-head"><h2>' + tr('Licences and levy') + '</h2></div><div class="banner" style="display:block;">' + tr('Keep your dates here and Pesa reminds you before they run out. Accommodation places register with the Namibia Tourism Board, which also collects a levy on room fees (the regulations give 2 percent). Selling liquor needs a liquor licence under the Liquor Act, and a local authority fitness certificate comes first. Rules and rates change, so confirm them with the relevant authorities and entities of Namibia.') + '</div>' +
    vField('Namibia Tourism Board registration number', '<input id="cpNtb" value="' + esc(s.ntbNumber || '') + '">') + vField('Liquor licence number', '<input id="cpLiq" value="' + esc(s.liquorNumber || '') + '">') + vField('Liquor licence renewal date', '<input id="cpLiqD" type="date" value="' + esc(s.liquorExpiry || '') + '">') + vField('Health certificate renewal date (kitchen)', '<input id="cpHcD" type="date" value="' + esc(s.healthExpiry || '') + '">') +
    '<div class="actions"><button class="btn btn-primary" id="cpSave" type="button">' + tr('Save') + '</button><button class="btn btn-ghost" id="cpClose" type="button">' + tr('Close') + '</button></div>';
  var ov = openSheet(html); ov.querySelector('#cpClose').addEventListener('click', closeModal);
  ov.querySelector('#cpSave').addEventListener('click', function(){ btSave({ ntbNumber:ov.querySelector('#cpNtb').value.trim(), liquorNumber:ov.querySelector('#cpLiq').value.trim(), liquorExpiry:ov.querySelector('#cpLiqD').value, healthExpiry:ov.querySelector('#cpHcD').value }); toast(tr('Saved')); closeModal(); });
}
/* alerts for the Alert centre */
function vertAlerts(){
  var out = [], t = todayKey(), type = bizType();
  if(type === 'hospitality'){
    var s = State.settings || {};
    [['liquorExpiry', 'Liquor licence'], ['healthExpiry', 'Health certificate']].forEach(function(p){ var d = s[p[0]]; if(!d) return; var left = Math.round((new Date(d + 'T12:00:00') - new Date(t + 'T12:00:00')) / 86400000);
      if(left <= 30) out.push({ id:'v-' + p[0], level: left <= 7 ? 'high' : 'med', title:p[1] + (left < 0 ? ' has expired' : ' renews in ' + left + ' days'), body:'Renewal date ' + d + '. Check with the relevant authority.', go:'', label:'' }); });
    var due = vList('hosBookings').filter(function(b){ return b.status === 'in' && b.checkOut < t; });
    if(due.length) out.push({ id:'v-overstay', level:'med', title:due.length + ' guest' + (due.length === 1 ? ' is' : 's are') + ' past the check out date', body:due.slice(0, 3).map(function(b){ return b.guestName + ' (' + b.roomName + ')'; }).join(', '), go:'', label:'' });
  } else if(type === 'beauty'){
    var late = vApptsOn(t).filter(function(a){ return a.status === 'booked' && String(a.time) < new Date(Date.now() - 20 * 60000).toTimeString().slice(0, 5); });
    if(late.length) out.push({ id:'v-late', level:'med', title:late.length + ' client' + (late.length === 1 ? ' is' : 's are') + ' running late', body:late.slice(0, 3).map(function(a){ return a.time + ' ' + a.clientName; }).join(', '), go:'', label:'' });
  }
  return out;
}
