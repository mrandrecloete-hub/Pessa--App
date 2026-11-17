/* ============================== HOSPITALITY TOOLS ==============================
 * Added on top of the rooms, bookings, tabs and guests in verticals.js. Everything here is saved on the device like the rest of Pesa Hospitality.
 *  - Room calendar: every room by night for two weeks, tap an empty night to book that room.
 *  - Find a free room: rooms free for the dates, grouped by type.
 *  - Waiting list: guests who want dates that are full, checked against free rooms, offered on WhatsApp.
 *  - Housekeeping: dirty, being cleaned, ready and out of order, with who cleaned and when.
 *  - Split bill: move chosen items of a tab to its own bill, or share a bill equally, or merge two tabs.
 *  - Recipes and food cost: ingredients per portion from the stock list, cost, margin and a food cost report.
 *  - Team clock and ratings: clock in and out, hours per month, a monthly rating sheet.
 *  - Occupancy and rates: occupancy, average rate per night, revenue per available room, by room type, as a CSV too.
 *  - Guest messages: ready made wording for each stage of a stay, sent one tap at a time on WhatsApp.
 * Wording avoids dashes on purpose. Tax and levy figures are estimates, to be confirmed with the relevant authorities. */
var HC = { start:'' };
VH_STATUS.cleaning = 'Being cleaned';
function hDaysFrom(start, n){ var a = []; for(var i = 0; i < n; i++) a.push(vAddDays(start, i)); return a; }
function hBookingOn(roomId, day){ return vStaysOn(day).find(function(x){ return x.roomId === roomId; }); }
function hRoomOut(r){ return r.status === 'maintenance'; }
function hStayFor(roomId, date, nights){
  openStayForm(null);
  var ov = document.querySelector('.overlay'); if(!ov) return;
  var rm = ov.querySelector('#sfRoom'), a = ov.querySelector('#sfIn'), c = ov.querySelector('#sfOut');
  if(roomId && rm){ rm.value = roomId; rm.dispatchEvent(new Event('change')); }
  if(a && date) a.value = date; if(c && date) c.value = vAddDays(date, nights || 1);
}
function hBack(ov, fn){ var b = ov.querySelector('[data-hback]'); if(b) b.addEventListener('click', function(){ closeModal(); if(fn) fn(); }); }
function hCloseBtn(){ return '<button class="btn btn-ghost" data-hback type="button">' + tr('Close') + '</button>'; }
function hDownload(name, rows){
  var text = rows.map(function(r){ return r.map(function(v){ v = csvGuard(String(v == null ? '' : v)); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\n');
  downloadTextFile(name, text);
}
function hMonthStart(d){ return (d || todayKey()).slice(0, 7) + '-01'; }

/* ---- room calendar ---- */
function openRoomCalendarSheet(start){
  var t = todayKey(), rooms = vRooms(); HC.start = start || HC.start || t;
  var days = hDaysFrom(HC.start, 14);
  var head = '<tr><th style="text-align:left;padding:3px 6px;">' + tr('Room') + '</th>' + days.map(function(d){ return '<th style="padding:3px 2px;font-weight:' + (d === t ? '800' : '500') + ';">' + d.slice(8) + '<div style="font-size:9px;opacity:.7;">' + esc(vDayLabel(d).slice(0, 2)) + '</div></th>'; }).join('') + '</tr>';
  var body = rooms.map(function(r){
    return '<tr><td style="padding:3px 6px;white-space:nowrap;">' + esc(r.name) + (hRoomOut(r) ? ' <span style="opacity:.7;">(' + esc(tr('out of order')) + ')</span>' : '') + '</td>' + days.map(function(d){
      var b = hBookingOn(r.id, d);
      if(b) return '<td style="padding:0;"><button type="button" data-hcb="' + b.id + '" title="' + esc(b.guestName) + '" style="display:block;width:100%;height:24px;min-width:20px;margin:1px 0;border:0;border-radius:5px;background:' + (b.status === 'in' ? 'var(--primary)' : 'var(--accent)') + ';"></button></td>';
      if(hRoomOut(r)) return '<td style="padding:0;"><div style="height:24px;min-width:20px;margin:1px 0;border-radius:5px;background:var(--surface-3);"></div></td>';
      return '<td style="padding:0;"><button type="button" data-hce="' + r.id + '|' + d + '" style="display:block;width:100%;height:24px;min-width:20px;margin:1px 0;border:1px solid var(--border);border-radius:5px;background:transparent;"></button></td>';
    }).join('') + '</tr>';
  }).join('');
  var occ = '<tr><td style="padding:3px 6px;font-size:10px;opacity:.8;">' + tr('Occupied') + '</td>' + days.map(function(d){ var n = vStaysOn(d).length; return '<td style="text-align:center;font-size:10px;opacity:.85;">' + (rooms.length ? Math.round(n * 100 / rooms.length) : 0) + '</td>'; }).join('') + '</tr>';
  var html = '<div class="sheet-head"><h2>' + tr('Room calendar') + '</h2></div>' +
    (rooms.length ? '<div style="overflow-x:auto;margin:6px 0 8px;"><table style="border-collapse:collapse;font-size:11px;min-width:100%;color:var(--text);">' + head + body + occ + '</table></div>' +
      '<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;"><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--primary);"></span> ' + tr('In house') + ' &nbsp; <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--accent);"></span> ' + tr('Booked') + ' &nbsp; ' + tr('Tap an empty night to book that room. The last row is the percent of rooms taken.') + '</div>' :
      '<div class="empty" style="padding:18px 8px;">' + tr('Add your rooms first.') + '</div>') +
    '<div class="actions" style="flex-wrap:wrap;"><button class="btn btn-ghost" id="hcPrev" type="button">' + tr('Earlier') + '</button><button class="btn btn-ghost" id="hcToday" type="button">' + tr('Today') + '</button><button class="btn btn-ghost" id="hcNext" type="button">' + tr('Later') + '</button></div>' +
    '<div class="actions"><button class="btn btn-primary" id="hcFree" type="button">' + tr('Find a free room') + '</button>' + hCloseBtn() + '</div>';
  var ov = openSheet(html); hBack(ov);
  ov.querySelector('#hcPrev').addEventListener('click', function(){ closeModal(); openRoomCalendarSheet(vAddDays(HC.start, -7)); });
  ov.querySelector('#hcNext').addEventListener('click', function(){ closeModal(); openRoomCalendarSheet(vAddDays(HC.start, 7)); });
  ov.querySelector('#hcToday').addEventListener('click', function(){ closeModal(); openRoomCalendarSheet(todayKey()); });
  ov.querySelector('#hcFree').addEventListener('click', function(){ closeModal(); openFreeRoomsSheet(); });
  ov.querySelectorAll('[data-hcb]').forEach(function(b){ b.addEventListener('click', function(){ var bk = vList('hosBookings').find(function(x){ return x.id === b.getAttribute('data-hcb'); }); closeModal(); if(bk) openStayView(bk); }); });
  ov.querySelectorAll('[data-hce]').forEach(function(b){ b.addEventListener('click', function(){ var p = b.getAttribute('data-hce').split('|'); closeModal(); hStayFor(p[0], p[1], 1); }); });
}

/* ---- find a free room ---- */
function hFreeRooms(a, c, guests){
  return vRooms().filter(function(r){ return !hRoomOut(r) && (Number(r.capacity) || 2) >= (guests || 1) && vRoomFree(r.id, a, c); });
}
function openFreeRoomsSheet(a, c, g){
  var t = todayKey(); a = a || t; c = c || vAddDays(t, 1); g = g || 2;
  var free = hFreeRooms(a, c, g), types = {};
  free.forEach(function(r){ (types[r.type || 'Room'] = types[r.type || 'Room'] || []).push(r); });
  var html = '<div class="sheet-head"><h2>' + tr('Find a free room') + '</h2></div>' +
    '<div class="field-row">' + vField('Check in', '<input id="frIn" type="date" value="' + a + '">') + vField('Check out', '<input id="frOut" type="date" value="' + c + '">') + vField('Guests', '<input id="frG" type="number" inputmode="numeric" value="' + g + '">') + '</div>' +
    '<div class="actions"><button class="btn btn-primary" id="frGo" type="button">' + tr('Check') + '</button></div>' +
    (c <= a ? '<div class="banner">' + tr('Check out must be after check in.') + '</div>' :
      free.length ? Object.keys(types).map(function(k){ return '<div class="section-title">' + esc(k) + ' (' + types[k].length + ' ' + tr('free') + ')</div><div class="rowlist">' + types[k].map(function(r){ return '<button class="row" type="button" data-frb="' + r.id + '" style="width:100%;text-align:left;"><div class="main"><div class="title">' + esc(r.name) + '</div><div class="sub">' + tr('Sleeps') + ' ' + (r.capacity || 2) + '</div></div><div class="trail num">' + fmtMoney(r.rate || 0) + '</div></button>'; }).join('') + '</div>'; }).join('') :
      '<div class="banner" style="display:block;">' + tr('No room is free for those dates.') + '</div><div class="actions"><button class="btn btn-accent btn-block" id="frWait" type="button">' + tr('Add this guest to the waiting list') + '</button></div>') +
    '<div class="actions">' + hCloseBtn() + '</div>';
  var ov = openSheet(html); hBack(ov);
  function vals(){ return [ov.querySelector('#frIn').value, ov.querySelector('#frOut').value, parseInt(ov.querySelector('#frG').value, 10) || 1]; }
  ov.querySelector('#frGo').addEventListener('click', function(){ var v = vals(); closeModal(); openFreeRoomsSheet(v[0], v[1], v[2]); });
  ov.querySelectorAll('[data-frb]').forEach(function(b){ b.addEventListener('click', function(){ var v = vals(); closeModal(); hStayFor(b.getAttribute('data-frb'), v[0], vNights(v[0], v[1])); }); });
  var w = ov.querySelector('#frWait'); if(w) w.addEventListener('click', function(){ var v = vals(); closeModal(); openWaitForm(null, { from:v[0], to:v[1], guests:v[2] }); });
}

/* ---- waiting list ---- */
function hWaitMatches(w){ return w.status === 'waiting' ? hFreeRooms(w.from, w.to, w.guests || 1).filter(function(r){ return !w.roomType || r.type === w.roomType; }) : []; }
function openWaitSheet(){
  var list = vList('hosWait').filter(function(w){ return w.status === 'waiting' || w.status === 'offered'; }).sort(function(a, b){ return String(a.createdAt).localeCompare(String(b.createdAt)); });
  var html = '<div class="sheet-head"><h2>' + tr('Waiting list') + '</h2></div><div class="banner" style="display:block;">' + tr('When a room frees up for dates on the list, it shows here with a button to offer it on WhatsApp. The first guest in line is shown first.') + '</div>' +
    (list.length ? '<div class="rowlist">' + list.map(function(w){ var m = hWaitMatches(w);
      return '<div class="row" style="display:block;"><div style="display:flex;justify-content:space-between;gap:8px;"><div class="main"><div class="title">' + esc(w.guestName) + '</div><div class="sub">' + esc(vDayLabel(w.from)) + ' to ' + esc(vDayLabel(w.to)) + ' · ' + (w.guests || 1) + ' ' + tr('guests') + (w.roomType ? ' · ' + esc(w.roomType) : '') + (w.status === 'offered' ? ' · ' + tr('offered') : '') + '</div></div>' +
        '<div class="trail">' + (m.length ? '<span class="rolebadge">' + tr('Room free') + '</span>' : '') + '</div></div>' +
        '<div class="actions" style="margin-top:6px;flex-wrap:wrap;">' + (m.length ? '<button class="btn btn-primary" data-wb="' + w.id + '" type="button">' + tr('Book') + ' ' + esc(m[0].name) + '</button>' : '') + (m.length && w.phone ? '<button class="btn btn-ghost" data-wo="' + w.id + '" type="button">' + tr('Offer on WhatsApp') + '</button>' : '') + '<button class="btn btn-ghost" data-wc="' + w.id + '" type="button">' + tr('Remove') + '</button></div></div>'; }).join('') + '</div>' : '<div class="empty" style="padding:18px 8px;">' + tr('Nobody is waiting.') + '</div>') +
    '<div class="actions"><button class="btn btn-primary" id="wlNew" type="button">' + tr('Add a guest') + '</button>' + hCloseBtn() + '</div>';
  var ov = openSheet(html); hBack(ov);
  ov.querySelector('#wlNew').addEventListener('click', function(){ closeModal(); openWaitForm(null, null); });
  ov.querySelectorAll('[data-wb]').forEach(function(b){ b.addEventListener('click', function(){ var w = vList('hosWait').find(function(x){ return x.id === b.getAttribute('data-wb'); }), m = hWaitMatches(w); closeModal(); vPatch('hosWait', w.id, { status:'booked' }); hStayFor(m[0].id, w.from, vNights(w.from, w.to));
    setTimeout(function(){ var g = document.querySelector('#sfGuest'), p = document.querySelector('#sfPhone'); if(g) g.value = w.guestName; if(p) p.value = w.phone || ''; }, 0); }); });
  ov.querySelectorAll('[data-wo]').forEach(function(b){ b.addEventListener('click', function(){ var w = vList('hosWait').find(function(x){ return x.id === b.getAttribute('data-wo'); }), m = hWaitMatches(w);
    var l = vWaLink(w.phone, 'Hello ' + w.guestName + ', good news from ' + vShop() + ': a room is now free for ' + vDayLabel(w.from) + ' to ' + vDayLabel(w.to) + ' (' + m[0].name + ', ' + fmtMoney(m[0].rate || 0) + ' per night). Reply to confirm and we will hold it for you.');
    vPatch('hosWait', w.id, { status:'offered', offeredAt:new Date().toISOString() }); if(l) window.open(l, '_blank', 'noopener'); closeModal(); openWaitSheet(); }); });
  ov.querySelectorAll('[data-wc]').forEach(function(b){ b.addEventListener('click', function(){ vPatch('hosWait', b.getAttribute('data-wc'), { status:'closed' }); closeModal(); openWaitSheet(); }); });
}
function openWaitForm(w, pre){
  pre = pre || {}; var t = todayKey();
  var types = []; vRooms().forEach(function(r){ if(types.indexOf(r.type) < 0) types.push(r.type); });
  var html = '<div class="sheet-head"><h2>' + tr('Add to the waiting list') + '</h2></div>' + vField('Guest name', '<input id="wfName">') + vField('Phone or WhatsApp', '<input id="wfPhone" inputmode="tel">') +
    '<div class="field-row">' + vField('From', '<input id="wfIn" type="date" value="' + (pre.from || t) + '">') + vField('To', '<input id="wfOut" type="date" value="' + (pre.to || vAddDays(t, 1)) + '">') + '</div>' +
    '<div class="field-row">' + vField('Guests', '<input id="wfG" type="number" inputmode="numeric" value="' + (pre.guests || 2) + '">') + vField('Room type (optional)', '<select id="wfType">' + vOpts(types.map(function(x){ return [x, x]; }), '', 'Any room') + '</select>') + '</div>' +
    '<div id="wfErr"></div><div class="actions"><button class="btn btn-primary" id="wfSave" type="button">' + tr('Save') + '</button><button class="btn btn-ghost" id="wfBack" type="button">' + tr('Back') + '</button></div>';
  var ov = openSheet(html, { center:true });
  ov.querySelector('#wfBack').addEventListener('click', function(){ closeModal(); openWaitSheet(); });
  ov.querySelector('#wfSave').addEventListener('click', function(){
    var n = ov.querySelector('#wfName').value.trim(), a = ov.querySelector('#wfIn').value, c = ov.querySelector('#wfOut').value;
    if(!n || !a || !c || c <= a){ ov.querySelector('#wfErr').innerHTML = '<div class="banner">' + esc(tr('Enter the guest name and the dates.')) + '</div>'; return; }
    vSave('hosWait', uid('wl'), { guestName:n, phone:ov.querySelector('#wfPhone').value.trim(), from:a, to:c, guests:parseInt(ov.querySelector('#wfG').value, 10) || 1, roomType:ov.querySelector('#wfType').value, status:'waiting', createdAt:new Date().toISOString() });
    syncNowSafe(); toast(tr('Added to the waiting list')); closeModal(); openWaitSheet();
  });
}

/* ---- housekeeping ---- */
function openHousekeepingSheet(){
  var t = todayKey(), rooms = vRooms(), arriving = {}, leaving = {};
  vList('hosBookings').forEach(function(b){ if(b.status === 'reserved' && b.checkIn === t) arriving[b.roomId] = 1; if(b.status === 'in' && b.checkOut <= t) leaving[b.roomId] = 1; });
  var order = { dirty:0, cleaning:1, maintenance:2, clean:3 };
  var sorted = rooms.slice().sort(function(a, b){ var pa = (order[a.status] == null ? 3 : order[a.status]) - (arriving[a.id] && a.status !== 'clean' ? 5 : 0), pb = (order[b.status] == null ? 3 : order[b.status]) - (arriving[b.id] && b.status !== 'clean' ? 5 : 0); return pa - pb || String(a.name).localeCompare(String(b.name)); });
  var cnt = function(s){ return rooms.filter(function(r){ return (r.status || 'clean') === s; }).length; };
  var staff = vStaff();
  var html = '<div class="sheet-head"><h2>' + tr('Housekeeping') + '</h2></div><div class="stats">' + vStat('Need cleaning', cnt('dirty'), cnt('dirty') ? 'var(--warn,#d98e2b)' : '') + vStat('Being cleaned', cnt('cleaning')) + vStat('Ready', cnt('clean')) + vStat('Out of order', cnt('maintenance')) + '</div>' +
    (sorted.length ? '<div class="rowlist">' + sorted.map(function(r){ var s = r.status || 'clean';
      return '<div class="row" style="display:block;"><div style="display:flex;justify-content:space-between;gap:8px;"><div class="main"><div class="title">' + esc(r.name) + '</div><div class="sub">' + esc(tr(VH_STATUS[s] || s)) + (arriving[r.id] ? ' · ' + tr('arriving today') : '') + (leaving[r.id] ? ' · ' + tr('guest leaving') : '') + (r.cleanedAt && s === 'clean' ? ' · ' + tr('cleaned') + ' ' + esc(String(r.cleanedAt).slice(11, 16)) + (r.cleanedBy ? ' ' + esc(r.cleanedBy) : '') : '') + (r.hkNote ? ' · ' + esc(r.hkNote) : '') + '</div></div></div>' +
        '<div class="actions" style="margin-top:6px;flex-wrap:wrap;">' + (s === 'dirty' ? '<button class="btn btn-primary" data-hk="cleaning|' + r.id + '" type="button">' + tr('Start cleaning') + '</button>' : '') + (s === 'dirty' || s === 'cleaning' ? '<button class="btn btn-accent" data-hk="clean|' + r.id + '" type="button">' + tr('Mark ready') + '</button>' : '') + (s === 'clean' ? '<button class="btn btn-ghost" data-hk="dirty|' + r.id + '" type="button">' + tr('Needs cleaning') + '</button>' : '') +
        (s !== 'maintenance' ? '<button class="btn btn-ghost" data-hk="maintenance|' + r.id + '" type="button">' + tr('Out of order') + '</button>' : '<button class="btn btn-ghost" data-hk="dirty|' + r.id + '" type="button">' + tr('Back in service') + '</button>') + '</div></div>'; }).join('') + '</div>' : '<div class="empty" style="padding:18px 8px;">' + tr('Add your rooms first.') + '</div>') +
    '<div class="actions">' + hCloseBtn() + '</div>';
  var ov = openSheet(html); hBack(ov);
  ov.querySelectorAll('[data-hk]').forEach(function(b){ b.addEventListener('click', function(){
    var p = b.getAttribute('data-hk').split('|'), s = p[0], id = p[1], patch = { status:s };
    if(s === 'clean'){ patch.cleanedAt = new Date().toISOString(); patch.cleanedBy = State.session ? State.session.name : ''; patch.hkNote = ''; }
    if(s === 'maintenance'){ var why = window.prompt ? window.prompt(tr('What is wrong with the room?'), '') : ''; if(why === null) return; patch.hkNote = why; }
    vPatch('hosRooms', id, patch); logAudit('other', 'room', id, 'Room set to ' + s); closeModal(); openHousekeepingSheet();
  }); });
}

/* ---- split bill ---- */
function hTabItems(t){ return JSON.parse(JSON.stringify(t.items || [])); }
function openSplitSheet(tabId){
  var tab = vList('hosTabs').find(function(x){ return x.id === tabId; }); if(!tab){ toast(tr('Tab not found')); return; }
  var others = vList('hosTabs').filter(function(x){ return x.status === 'open' && x.id !== tab.id; });
  var total = vTabTotal(tab);
  var html = '<div class="sheet-head"><h2>' + tr('Split the bill') + ': ' + esc(tab.name) + '</h2></div><div class="banner" style="display:block;">' + tr('Choose how many of each item go on a new bill. The new bill is its own tab and is charged on its own.') + '</div>' +
    '<div class="rowlist">' + (tab.items || []).map(function(i, n){ return '<div class="row"><div class="main"><div class="title">' + esc(i.name) + '</div><div class="sub">' + i.qty + ' x ' + fmtMoney(i.unitPrice) + '</div></div><div class="trail"><input type="number" min="0" max="' + i.qty + '" value="0" data-sq="' + n + '" style="width:64px;" inputmode="numeric"></div></div>'; }).join('') + '</div>' +
    '<div class="actions"><button class="btn btn-primary" id="spGo" type="button">' + tr('Move to a new bill') + '</button></div>' +
    '<div class="section-title">' + tr('Share equally') + '</div><div class="field-row">' + vField('Number of people', '<input id="spN" type="number" inputmode="numeric" value="2">') + '<div class="field"><label>' + tr('Each pays') + '</label><div class="num" id="spEach" style="font-size:20px;font-weight:800;padding-top:6px;">' + fmtMoney(total / 2) + '</div></div></div>' +
    (others.length ? '<div class="section-title">' + tr('Merge another tab into this one') + '</div>' + vField('Tab', '<select id="spMerge">' + vOpts(others.map(function(x){ return [x.id, x.name + ' (' + fmtMoney(vTabTotal(x)) + ')']; }), '', 'Choose a tab') + '</select>') + '<div class="actions"><button class="btn btn-ghost" id="spMg" type="button">' + tr('Merge') + '</button></div>' : '') +
    '<div class="actions"><button class="btn btn-ghost" id="spBack" type="button">' + tr('Back') + '</button></div>';
  var ov = openSheet(html);
  ov.querySelector('#spBack').addEventListener('click', function(){ closeModal(); openTabForm(vList('hosTabs').find(function(x){ return x.id === tab.id; }), null); });
  ov.querySelector('#spN').addEventListener('input', function(){ var n = Math.max(1, parseInt(this.value, 10) || 1); ov.querySelector('#spEach').textContent = fmtMoney(total / n); });
  ov.querySelector('#spGo').addEventListener('click', function(){
    var keep = hTabItems(tab), moved = [];
    ov.querySelectorAll('[data-sq]').forEach(function(inp){
      var n = +inp.getAttribute('data-sq'), m = Math.max(0, Math.min(keep[n].qty, parseInt(inp.value, 10) || 0)); if(!m) return;
      var it = keep[n], sent = Number(it.sentQty) || 0, left = it.qty - m, keptSent = Math.min(sent, left);
      moved.push(Object.assign({}, it, { qty:m, sentQty:sent - keptSent })); it.qty = left; it.sentQty = keptSent;
    });
    if(!moved.length){ toast(tr('Choose at least one item to move.')); return; }
    var rest = keep.filter(function(i){ return i.qty > 0; });
    vPatch('hosTabs', tab.id, { items:rest });
    var id = uid('tb'); vSave('hosTabs', id, { name:tab.name + ' (bill 2)', items:moved, status:'open', bookingId:'', createdAt:new Date().toISOString(), openedBy:State.session ? State.session.name : '' });
    logAudit('other', 'tab', tab.id, 'Bill split: ' + moved.length + ' items moved to a new tab'); syncNowSafe(); toast(tr('New bill made')); closeModal(); openTabsSheet();
  });
  var mg = ov.querySelector('#spMg'); if(mg) mg.addEventListener('click', function(){
    var oid = ov.querySelector('#spMerge').value; if(!oid) return; var o = vList('hosTabs').find(function(x){ return x.id === oid; }); if(!o) return;
    var items = hTabItems(tab); (o.items || []).forEach(function(i){ var ex = items.find(function(x){ return x.productId === i.productId && x.unitPrice === i.unitPrice; }); if(ex){ ex.qty += i.qty; ex.sentQty = (Number(ex.sentQty) || 0) + (Number(i.sentQty) || 0); } else items.push(JSON.parse(JSON.stringify(i))); });
    vPatch('hosTabs', tab.id, { items:items }); vPatch('hosTabs', o.id, { status:'closed', items:[], closedAt:new Date().toISOString() }); logAudit('other', 'tab', tab.id, 'Merged ' + o.name + ' into ' + tab.name); syncNowSafe(); toast(tr('Tabs merged')); closeModal(); openTabForm(Object.assign({}, tab, { items:items }), null);
  });
}

/* ---- recipes and food cost ---- */
function hRecipeCost(rc){ return vSum(rc.ingredients || [], function(i){ var p = (State.products || []).find(function(x){ return x.id === i.productId; }); return (Number(i.qty) || 0) * (p ? Number(p.costPrice) || 0 : Number(i.cost) || 0); }) / (Number(rc.portions) || 1); }
function openRecipesSheet(){
  var list = vList('hosRecipes').slice().sort(function(a, b){ return String(a.name).localeCompare(String(b.name)); });
  var html = '<div class="sheet-head"><h2>' + tr('Recipes and food cost') + '</h2></div><div class="banner" style="display:block;">' + tr('Write what goes into one portion, using items from your stock list. Pesa Hospitality works out the cost and the margin. Ingredients are not taken off the stock list when a dish is sold.') + '</div>' +
    (list.length ? '<div class="rowlist">' + list.map(function(rc){ var p = (State.products || []).find(function(x){ return x.id === rc.productId; }), cost = hRecipeCost(rc), price = p ? Number(p.sellPrice) || 0 : 0, mg = price ? Math.round((price - cost) * 100 / price) : 0;
      return '<button class="row" type="button" data-rc="' + rc.id + '" style="width:100%;text-align:left;"><div class="main"><div class="title">' + esc(rc.name) + '</div><div class="sub">' + tr('Cost') + ' ' + fmtMoney(cost) + ' · ' + tr('Price') + ' ' + fmtMoney(price) + '</div></div><div class="trail num">' + mg + '%</div></button>'; }).join('') + '</div>' : '<div class="empty" style="padding:18px 8px;">' + tr('No recipes yet.') + '</div>') +
    '<div class="actions" style="flex-wrap:wrap;"><button class="btn btn-primary" id="rcNew" type="button">' + tr('New recipe') + '</button><button class="btn btn-ghost" id="rcRep" type="button">' + tr('Food cost report') + '</button>' + hCloseBtn() + '</div>';
  var ov = openSheet(html); hBack(ov);
  ov.querySelector('#rcNew').addEventListener('click', function(){ closeModal(); openRecipeForm(null); });
  ov.querySelector('#rcRep').addEventListener('click', function(){ closeModal(); openFoodCostSheet(); });
  ov.querySelectorAll('[data-rc]').forEach(function(b){ b.addEventListener('click', function(){ closeModal(); openRecipeForm(vList('hosRecipes').find(function(x){ return x.id === b.getAttribute('data-rc'); })); }); });
}
function openRecipeForm(rc){
  var r = rc ? JSON.parse(JSON.stringify(rc)) : { id:uid('rc'), productId:'', name:'', portions:1, ingredients:[] };
  var prods = (State.products || []).filter(function(p){ return !p.isService && !p.hidden && !p.archived; }).sort(function(a, b){ return String(a.name).localeCompare(String(b.name)); });
  var ov = openSheet('<div id="rcBody"></div>');
  function keep(){ var n = ov.querySelector('#rcDish'); if(n) r.productId = n.value; var po = ov.querySelector('#rcPor'); if(po) r.portions = Math.max(1, parseFloat(po.value) || 1); }
  function paint(){
    var cost = hRecipeCost(r), p = prods.find(function(x){ return x.id === r.productId; }), price = p ? Number(p.sellPrice) || 0 : 0;
    ov.querySelector('#rcBody').innerHTML = '<div class="sheet-head"><h2>' + tr('Recipe') + '</h2></div>' + vField('Menu item this recipe is for', '<select id="rcDish">' + vOpts(prods.map(function(x){ return [x.id, x.name]; }), r.productId, 'Choose an item') + '</select>') +
      vField('Portions this recipe makes', '<input id="rcPor" type="number" inputmode="decimal" step="0.5" value="' + r.portions + '">') +
      '<div class="section-title">' + tr('Ingredients') + '</div>' + (r.ingredients.length ? '<div class="rowlist">' + r.ingredients.map(function(i, n){ var pr = prods.find(function(x){ return x.id === i.productId; }); return '<div class="row"><div class="main"><div class="title">' + esc(i.name) + '</div><div class="sub">' + fmtMoney(pr ? Number(pr.costPrice) || 0 : 0) + ' ' + tr('each') + '</div></div><div class="trail" style="display:flex;gap:6px;align-items:center;"><input type="number" step="0.01" min="0" value="' + i.qty + '" data-iq="' + n + '" style="width:70px;" inputmode="decimal"><button class="btn btn-ghost" data-ix="' + n + '" type="button">x</button></div></div>'; }).join('') + '</div>' : '') +
      '<div class="field"><label>' + tr('Add an ingredient') + '</label><input id="rcQ" placeholder="' + esc(tr('Search the stock list')) + '" autocomplete="off"></div><div id="rcRes"></div>' +
      '<div class="banner" style="display:block;">' + tr('Cost per portion') + ': <b>' + fmtMoney(cost) + '</b>' + (price ? ' · ' + tr('Price') + ' ' + fmtMoney(price) + ' · ' + tr('Margin') + ' <b>' + Math.round((price - cost) * 100 / price) + '%</b>' : '') + '</div>' +
      '<div id="rcErr"></div><div class="actions" style="flex-wrap:wrap;"><button class="btn btn-primary" id="rcSave" type="button">' + tr('Save recipe') + '</button>' + (p ? '<button class="btn btn-ghost" id="rcApply" type="button">' + tr('Use as the cost price') + '</button>' : '') + (rc ? '<button class="btn btn-ghost" id="rcDel" type="button">' + tr('Delete') + '</button>' : '') + '<button class="btn btn-ghost" id="rcBack" type="button">' + tr('Back') + '</button></div>';
    var q = ov.querySelector('#rcQ');
    q.addEventListener('input', function(){
      var s = q.value.toLowerCase().trim(), hits = s ? prods.filter(function(x){ return String(x.name).toLowerCase().indexOf(s) > -1; }).slice(0, 8) : [];
      ov.querySelector('#rcRes').innerHTML = hits.length ? '<div class="rowlist">' + hits.map(function(x){ return '<button class="row" type="button" data-ra="' + x.id + '" style="width:100%;text-align:left;"><div class="main"><div class="title">' + esc(x.name) + '</div></div><div class="trail num">' + fmtMoney(Number(x.costPrice) || 0) + '</div></button>'; }).join('') + '</div>' : '';
      ov.querySelectorAll('[data-ra]').forEach(function(b){ b.addEventListener('click', function(){ keep(); var x = prods.find(function(y){ return y.id === b.getAttribute('data-ra'); }); if(!r.ingredients.some(function(i){ return i.productId === x.id; })) r.ingredients.push({ productId:x.id, name:x.name, qty:1, cost:Number(x.costPrice) || 0 }); paint(); }); });
    });
    ov.querySelectorAll('[data-iq]').forEach(function(i){ i.addEventListener('change', function(){ keep(); r.ingredients[+i.getAttribute('data-iq')].qty = Math.max(0, parseFloat(i.value) || 0); paint(); }); });
    ov.querySelectorAll('[data-ix]').forEach(function(b){ b.addEventListener('click', function(){ keep(); r.ingredients.splice(+b.getAttribute('data-ix'), 1); paint(); }); });
    ov.querySelector('#rcDish').addEventListener('change', function(){ keep(); paint(); });
    ov.querySelector('#rcPor').addEventListener('change', function(){ keep(); paint(); });
    ov.querySelector('#rcBack').addEventListener('click', function(){ closeModal(); openRecipesSheet(); });
    ov.querySelector('#rcSave').addEventListener('click', function(){
      keep(); var pp = prods.find(function(x){ return x.id === r.productId; });
      if(!pp){ ov.querySelector('#rcErr').innerHTML = '<div class="banner">' + esc(tr('Choose the menu item first.')) + '</div>'; return; }
      vSave('hosRecipes', r.id, { productId:r.productId, name:pp.name, portions:r.portions, ingredients:r.ingredients.map(function(i){ return { productId:i.productId, name:i.name, qty:i.qty, cost:i.cost }; }), updatedAt:new Date().toISOString() });
      syncNowSafe(); toast(tr('Recipe saved')); closeModal(); openRecipesSheet();
    });
    var ap = ov.querySelector('#rcApply'); if(ap) ap.addEventListener('click', function(){ keep(); var c = Math.round(hRecipeCost(r) * 100) / 100; try{ refs.products.doc(p.id).update({ costPrice:c }); p.costPrice = c; }catch(e){} logAudit('update', 'product', p.id, 'Cost price set from recipe: ' + fmtMoney(c)); toast(tr('Cost price updated')); paint(); });
    var dl = ov.querySelector('#rcDel'); if(dl) dl.addEventListener('click', function(){ try{ refs.hosRecipes.doc(r.id).delete(); State.hosRecipes = vList('hosRecipes').filter(function(x){ return x.id !== r.id; }); }catch(e){} closeModal(); openRecipesSheet(); });
  }
  paint();
}
function openFoodCostSheet(from, to){
  var m0 = hMonthStart(); from = from || m0; to = to || todayKey();
  var rec = vList('hosRecipes'), rows = [], tr_ = 0, tc = 0;
  var sold = {}; (State.sales || []).forEach(function(s){ var d = String(s.createdAt).slice(0, 10); if(d < from || d > to) return; (s.items || []).forEach(function(i){ sold[i.productId] = (sold[i.productId] || 0) + (Number(i.qty) || 0); }); });
  rec.forEach(function(rc){ var q = sold[rc.productId] || 0; if(!q) return; var p = (State.products || []).find(function(x){ return x.id === rc.productId; }), price = p ? Number(p.sellPrice) || 0 : 0, cost = hRecipeCost(rc); rows.push([rc.name, q, q * price, q * cost]); tr_ += q * price; tc += q * cost; });
  var html = '<div class="sheet-head"><h2>' + tr('Food cost report') + '</h2></div><div class="field-row">' + vField('From', '<input id="fcFrom" type="date" value="' + from + '">') + vField('To', '<input id="fcTo" type="date" value="' + to + '">') + '</div>' +
    '<div class="actions"><button class="btn btn-ghost" id="fcGo" type="button">' + tr('Show') + '</button></div>' +
    '<div class="stats">' + vStat('Dish sales', fmtMoney(tr_)) + vStat('Cost of those dishes', fmtMoney(tc)) + vStat('Food cost', (tr_ ? Math.round(tc * 100 / tr_) : 0) + '%') + '</div>' +
    (rows.length ? '<div class="rowlist">' + rows.map(function(r){ return '<div class="row"><div class="main"><div class="title">' + esc(r[0]) + '</div><div class="sub">' + r[1] + ' ' + tr('sold') + '</div></div><div class="trail num">' + fmtMoney(r[2]) + '<div style="font-size:11px;opacity:.75;">' + tr('cost') + ' ' + fmtMoney(r[3]) + '</div></div></div>'; }).join('') + '</div>' : '<div class="empty" style="padding:18px 8px;">' + tr('No dishes with a recipe were sold in these dates.') + '</div>') +
    '<div class="banner" style="display:block;">' + tr('Worked out from the recipes and the cost prices in your stock list, not from what was really used. Waste and stock counts are in the stock pages.') + '</div>' +
    '<div class="actions"><button class="btn btn-ghost" id="fcBack" type="button">' + tr('Back') + '</button></div>';
  var ov = openSheet(html);
  ov.querySelector('#fcBack').addEventListener('click', function(){ closeModal(); openRecipesSheet(); });
  ov.querySelector('#fcGo').addEventListener('click', function(){ var a = ov.querySelector('#fcFrom').value, b = ov.querySelector('#fcTo').value; closeModal(); openFoodCostSheet(a, b); });
}

/* ---- team clock and ratings ---- */
var HR_CRITERIA = ['Punctuality', 'Guest service', 'Teamwork', 'Quality of work', 'Attitude'];
function hClockOpen(userId){ return vList('hosClock').find(function(c){ return c.userId === userId && !c.outAt; }); }
function hHours(c){ var a = new Date(c.inAt).getTime(), b = c.outAt ? new Date(c.outAt).getTime() : Date.now(); return Math.max(0, (b - a) / 3600000); }
function openClockSheet(){
  var staff = vStaff(), me = State.session ? State.session.userId : '', mgr = isManagerOrOwner(), m = todayKey().slice(0, 7);
  var html = '<div class="sheet-head"><h2>' + tr('Team clock') + '</h2></div>' +
    '<div class="rowlist">' + staff.filter(function(u){ return mgr || u.id === me; }).map(function(u){
      var open = hClockOpen(u.id), mine = vList('hosClock').filter(function(c){ return c.userId === u.id && String(c.inAt).slice(0, 7) === m; }), hrs = vSum(mine, hHours), long = open && hHours(open) > 16;
      return '<div class="row"><div class="main"><div class="title">' + esc(u.name) + '</div><div class="sub">' + (open ? tr('Clocked in at') + ' ' + esc(String(open.inAt).slice(11, 16)) + (long ? ' · ' + tr('open for over 16 hours, check it') : '') : tr('Clocked out')) + ' · ' + hrs.toFixed(1) + ' ' + tr('hours this month') + '</div></div><div class="trail"><button class="btn ' + (open ? 'btn-primary' : 'btn-accent') + '" data-ck="' + u.id + '" type="button">' + tr(open ? 'Clock out' : 'Clock in') + '</button></div></div>'; }).join('') + '</div>' +
    '<div class="actions" style="flex-wrap:wrap;">' + (mgr ? '<button class="btn btn-ghost" id="ckRate" type="button">' + tr('Rate the team') + '</button><button class="btn btn-ghost" id="ckPerf" type="button">' + tr('Hours and ratings') + '</button>' : '') + hCloseBtn() + '</div>';
  var ov = openSheet(html); hBack(ov);
  ov.querySelectorAll('[data-ck]').forEach(function(b){ b.addEventListener('click', function(){
    var id = b.getAttribute('data-ck'), u = staff.find(function(x){ return x.id === id; }), open = hClockOpen(id);
    if(open) vPatch('hosClock', open.id, { outAt:new Date().toISOString() });
    else vSave('hosClock', uid('ck'), { userId:id, name:u.name, inAt:new Date().toISOString(), outAt:'' });
    logAudit('other', 'clock', id, (open ? 'Clocked out ' : 'Clocked in ') + u.name); syncNowSafe(); closeModal(); openClockSheet();
  }); });
  var r = ov.querySelector('#ckRate'); if(r) r.addEventListener('click', function(){ closeModal(); openStaffRatingSheet(); });
  var p = ov.querySelector('#ckPerf'); if(p) p.addEventListener('click', function(){ closeModal(); openPerformanceSheet(); });
}
function openStaffRatingSheet(){
  var staff = vStaff(), me = State.session ? State.session.userId : '', m = todayKey().slice(0, 7), people = staff.filter(function(u){ return u.id !== me; });
  var html = '<div class="sheet-head"><h2>' + tr('Rate the team') + ' (' + m + ')</h2></div><div class="banner" style="display:block;">' + tr('Score each person from 1 to 5. One rating per person each month from you. Saving again replaces it. You cannot rate yourself.') + '</div>' +
    (people.length ? vField('Person', '<select id="rtWho">' + vOpts(people.map(function(u){ return [u.id, u.name]; }), people[0].id) + '</select>') + HR_CRITERIA.map(function(c, i){ return vField(c, '<select data-rt="' + i + '">' + [5, 4, 3, 2, 1].map(function(n){ return '<option value="' + n + '"' + (n === 3 ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select>'); }).join('') + '<div class="actions"><button class="btn btn-primary" id="rtSave" type="button">' + tr('Save rating') + '</button><button class="btn btn-ghost" id="rtBack" type="button">' + tr('Back') + '</button></div>' : '<div class="empty" style="padding:18px 8px;">' + tr('There is nobody else to rate yet.') + '</div><div class="actions"><button class="btn btn-ghost" id="rtBack" type="button">' + tr('Back') + '</button></div>');
  var ov = openSheet(html);
  ov.querySelector('#rtBack').addEventListener('click', function(){ closeModal(); openClockSheet(); });
  var sv = ov.querySelector('#rtSave'); if(sv) sv.addEventListener('click', function(){
    var who = ov.querySelector('#rtWho').value, scores = [].slice.call(ov.querySelectorAll('[data-rt]')).map(function(s){ return parseInt(s.value, 10) || 3; });
    var id = 'rt_' + m + '_' + who + '_' + me;   // one rating per rater, person and month
    vSave('hosRatings', id, { userId:who, raterId:me, raterName:State.session ? State.session.name : '', month:m, scores:scores, avg:scores.reduce(function(a, b){ return a + b; }, 0) / scores.length, createdAt:new Date().toISOString() });
    logAudit('other', 'rating', who, 'Monthly rating saved'); syncNowSafe(); toast(tr('Rating saved')); closeModal(); openClockSheet();
  });
}
function openPerformanceSheet(){
  var m = todayKey().slice(0, 7), prev = (function(){ var d = new Date(m + '-01T12:00:00'); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); })();
  function hrs(u, mm){ return vSum(vList('hosClock').filter(function(c){ return c.userId === u && String(c.inAt).slice(0, 7) === mm; }), hHours); }
  function days(u, mm){ var o = {}; vList('hosClock').forEach(function(c){ if(c.userId === u && String(c.inAt).slice(0, 7) === mm) o[String(c.inAt).slice(0, 10)] = 1; }); return Object.keys(o).length; }
  function avg(u, mm){ var l = vList('hosRatings').filter(function(r){ return r.userId === u && r.month === mm; }); return l.length ? vSum(l, function(r){ return r.avg; }) / l.length : null; }
  var rows = vStaff().map(function(u){ var a = avg(u.id, m), b = avg(u.id, prev); return [u.name, hrs(u.id, m), days(u.id, m), a, b]; });
  var html = '<div class="sheet-head"><h2>' + tr('Hours and ratings') + ' (' + m + ')</h2></div>' +
    '<div class="rowlist">' + rows.map(function(r){ return '<div class="row"><div class="main"><div class="title">' + esc(r[0]) + '</div><div class="sub">' + r[1].toFixed(1) + ' ' + tr('hours') + ' · ' + r[2] + ' ' + tr('days') + '</div></div><div class="trail num">' + (r[3] == null ? tr('not rated') : r[3].toFixed(1) + ' / 5' + (r[4] != null ? ' (' + (r[3] - r[4] >= 0 ? '+' : '') + (r[3] - r[4]).toFixed(1) + ')' : '')) + '</div></div>'; }).join('') + '</div>' +
    '<div class="banner" style="display:block;">' + tr('Counted from clock entries and ratings only. How long to keep this personal data, and how ratings may be used in employment decisions, is to be confirmed with the relevant legal bodies, authorities and entities of Namibia.') + '</div>' +
    '<div class="actions"><button class="btn btn-ghost" id="pfCsv" type="button">' + tr('Download CSV') + '</button><button class="btn btn-ghost" id="pfBack" type="button">' + tr('Back') + '</button></div>';
  var ov = openSheet(html);
  ov.querySelector('#pfBack').addEventListener('click', function(){ closeModal(); openClockSheet(); });
  ov.querySelector('#pfCsv').addEventListener('click', function(){ hDownload('team-hours-' + m + '.csv', [['Name', 'Hours', 'Days worked', 'Average rating']].concat(rows.map(function(r){ return [r[0], r[1].toFixed(2), r[2], r[3] == null ? '' : r[3].toFixed(2)]; }))); });
}

/* ---- occupancy and rates ---- */
function hOccupancy(from, to){
  var rooms = vRooms(), days = Math.max(1, vNights(from, vAddDays(to, 1))), avail = rooms.length * days, sold = 0, rev = 0, byType = {}, stays = 0, nightsSum = 0, cancelled = 0;
  rooms.forEach(function(r){ var k = r.type || 'Room'; byType[k] = byType[k] || { rooms:0, avail:0, sold:0, rev:0 }; byType[k].rooms++; byType[k].avail += days; });
  vList('hosBookings').forEach(function(b){
    if(b.checkIn <= to && b.checkOut > from && b.status === 'cancelled') cancelled++;
    if(b.status === 'cancelled' || b.checkIn > to || b.checkOut <= from) return;
    var a = b.checkIn < from ? from : b.checkIn, e = b.checkOut > vAddDays(to, 1) ? vAddDays(to, 1) : b.checkOut, n = Math.max(0, Math.round((new Date(e + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000));
    var room = vList('hosRooms').find(function(r){ return r.id === b.roomId; }), k = (room && room.type) || 'Room'; byType[k] = byType[k] || { rooms:0, avail:0, sold:0, rev:0 };
    sold += n; rev += n * (Number(b.rate) || 0); byType[k].sold += n; byType[k].rev += n * (Number(b.rate) || 0); stays++; nightsSum += vNights(b.checkIn, b.checkOut);
  });
  return { days:days, avail:avail, sold:sold, rev:rev, occ:avail ? sold * 100 / avail : 0, adr:sold ? rev / sold : 0, revpar:avail ? rev / avail : 0, byType:byType, stays:stays, los:stays ? nightsSum / stays : 0, cancelled:cancelled };
}
function openOccupancySheet(from, to){
  from = from || hMonthStart(); to = to || todayKey(); var o = hOccupancy(from, to);
  var html = '<div class="sheet-head"><h2>' + tr('Occupancy and rates') + '</h2></div><div class="field-row">' + vField('From', '<input id="ocFrom" type="date" value="' + from + '">') + vField('To', '<input id="ocTo" type="date" value="' + to + '">') + '</div><div class="actions"><button class="btn btn-ghost" id="ocGo" type="button">' + tr('Show') + '</button></div>' +
    '<div class="stats">' + vStat('Occupancy', o.occ.toFixed(1) + '%') + vStat('Average rate per night', fmtMoney(o.adr)) + vStat('Revenue per available room', fmtMoney(o.revpar)) + vStat('Room revenue', fmtMoney(o.rev)) + vStat('Nights sold', o.sold + ' / ' + o.avail) + vStat('Average stay', o.los.toFixed(1) + ' ' + tr('nights')) + '</div>' +
    '<div class="section-title">' + tr('By room type') + '</div><div class="rowlist">' + Object.keys(o.byType).map(function(k){ var t = o.byType[k]; return '<div class="row"><div class="main"><div class="title">' + esc(k) + '</div><div class="sub">' + t.rooms + ' ' + tr('rooms') + ' · ' + t.sold + ' / ' + t.avail + ' ' + tr('nights') + '</div></div><div class="trail num">' + (t.avail ? (t.sold * 100 / t.avail).toFixed(0) : 0) + '%<div style="font-size:11px;opacity:.75;">' + fmtMoney(t.rev) + '</div></div></div>'; }).join('') + '</div>' +
    '<div class="banner" style="display:block;">' + tr('Room revenue is the booked rate for each night. Cancelled bookings in these dates') + ': ' + o.cancelled + '. ' + tr('Levy and tax are not included.') + '</div>' +
    '<div class="actions"><button class="btn btn-ghost" id="ocCsv" type="button">' + tr('Download CSV') + '</button>' + hCloseBtn() + '</div>';
  var ov = openSheet(html); hBack(ov);
  ov.querySelector('#ocGo').addEventListener('click', function(){ var a = ov.querySelector('#ocFrom').value, b = ov.querySelector('#ocTo').value; if(a && b && b >= a){ closeModal(); openOccupancySheet(a, b); } });
  ov.querySelector('#ocCsv').addEventListener('click', function(){ hDownload('occupancy-' + from + '-to-' + to + '.csv', [['Room type', 'Rooms', 'Nights available', 'Nights sold', 'Occupancy percent', 'Room revenue']].concat(Object.keys(o.byType).map(function(k){ var t = o.byType[k]; return [k, t.rooms, t.avail, t.sold, t.avail ? (t.sold * 100 / t.avail).toFixed(1) : '0', t.rev.toFixed(2)]; })).concat([['Total', vRooms().length, o.avail, o.sold, o.occ.toFixed(1), o.rev.toFixed(2)]])); });
}

/* ---- guest messages ---- */
var HM_TEMPLATES = [
  { k:'confirm', name:'Booking confirmation', who:'reserved', text:'Hello {name}, your booking at {property} is confirmed: {room}, {dates}. We look forward to welcoming you.' },
  { k:'before', name:'Day before arrival', who:'tomorrow', text:'Hello {name}, we look forward to seeing you tomorrow at {property} ({room}). Please tell us your arrival time and anything you need.' },
  { k:'inhouse', name:'Welcome in house', who:'in', text:'Hello {name}, welcome to {property}. If you need anything during your stay, message us here.' },
  { k:'thanks', name:'Thank you after the stay', who:'out', text:'Hello {name}, thank you for staying at {property}. We hope to see you again soon.' },
  { k:'alert', name:'Guest alert (all guests in house)', who:'in', text:'Hello {name}, a short notice from {property}: ' }
];
function openGuestMessagesSheet(k){
  k = k || 'confirm'; var tpl = HM_TEMPLATES.find(function(x){ return x.k === k; }), t = todayKey(), tm = vAddDays(t, 1), y = vAddDays(t, -1);
  var all = vList('hosBookings'), guests = all.filter(function(b){
    if(tpl.who === 'reserved') return b.status === 'reserved'; if(tpl.who === 'tomorrow') return b.status === 'reserved' && b.checkIn === tm;
    if(tpl.who === 'in') return b.status === 'in'; return b.status === 'out' && (b.checkOut === t || b.checkOut === y);
  });
  var html = '<div class="sheet-head"><h2>' + tr('Guest messages') + '</h2></div>' + vField('Message', '<select id="gmK">' + vOpts(HM_TEMPLATES.map(function(x){ return [x.k, x.name]; }), k) + '</select>') + vField('Wording (you can change it)', '<textarea id="gmT" rows="4">' + esc(tpl.text) + '</textarea>') +
    '<div class="section-title">' + tr('Guests') + ' (' + guests.length + ')</div>' + (guests.length ? '<div class="rowlist">' + guests.map(function(b){ return '<div class="row"><div class="main"><div class="title">' + esc(b.guestName) + '</div><div class="sub">' + esc(b.roomName || '') + ' · ' + esc(vDayLabel(b.checkIn)) + ' to ' + esc(vDayLabel(b.checkOut)) + (b.phone ? '' : ' · ' + tr('no phone')) + '</div></div><div class="trail">' + (b.phone ? '<button class="btn btn-accent" data-gm="' + b.id + '" type="button">WhatsApp</button>' : '') + '</div></div>'; }).join('') + '</div>' : '<div class="empty" style="padding:18px 8px;">' + tr('No guests match this message today.') + '</div>') +
    '<div class="banner" style="display:block;">' + tr('Each tap opens WhatsApp with the message ready. You press send. Guests who asked not to be messaged should be skipped.') + '</div><div class="actions">' + hCloseBtn() + '</div>';
  var ov = openSheet(html); hBack(ov);
  ov.querySelector('#gmK').addEventListener('change', function(){ var v = this.value; closeModal(); openGuestMessagesSheet(v); });
  ov.querySelectorAll('[data-gm]').forEach(function(b){ b.addEventListener('click', function(){
    var bk = vList('hosBookings').find(function(x){ return x.id === b.getAttribute('data-gm'); }); if(!bk) return;
    var txt = ov.querySelector('#gmT').value.replace(/\{name\}/g, bk.guestName).replace(/\{property\}/g, vShop()).replace(/\{room\}/g, bk.roomName || 'your room').replace(/\{dates\}/g, vDayLabel(bk.checkIn) + ' to ' + vDayLabel(bk.checkOut));
    var l = vWaLink(bk.phone, txt); if(l) window.open(l, '_blank', 'noopener'); b.textContent = tr('Opened'); b.disabled = true;
  }); });
}

/* ---- menu, tiles, alerts ---- */
var HOSP_PAGES = {
  'v-calendar':function(){ openRoomCalendarSheet(); }, 'v-free':function(){ openFreeRoomsSheet(); }, 'v-wait':openWaitSheet, 'v-hk':openHousekeepingSheet, 'v-recipes':openRecipesSheet,
  'v-clock':openClockSheet, 'v-occ':openOccupancySheet, 'v-msgs':openGuestMessagesSheet, 'v-tools':openHospToolsSheet
};
var HOSP_MGR = { 'v-recipes':1, 'v-occ':1 };
/* ---- one page that lists every hospitality tool ---- */
var HOSP_LIST = [['v-calendar', 'Room calendar', 'Every room by night, tap an empty night to book'], ['v-free', 'Find a free room', 'Free rooms for dates and guests'], ['v-wait', 'Waiting list', 'Guests waiting for a room, offered on WhatsApp'],
  ['v-hk', 'Housekeeping', 'Needs cleaning, being cleaned, ready, out of order'], ['v-msgs', 'Guest messages', 'Confirmation, day before, welcome, thank you, alerts'], ['v-clock', 'Team clock', 'Clock in and out, hours, monthly ratings'],
  ['v-recipes', 'Recipes and food cost', 'Ingredients per portion, cost and margin'], ['v-occ', 'Occupancy and rates', 'Occupancy, average rate, revenue per room, CSV']];
function openHospToolsSheet(){
  var html = '<div class="sheet-head"><h2>' + tr('Hospitality tools') + '</h2></div><div class="rowlist">' + HOSP_LIST.filter(function(x){ return !HOSP_MGR[x[0]] || isManagerOrOwner(); }).map(function(x){ return '<button class="row" type="button" data-ht="' + x[0] + '" style="width:100%;text-align:left;"><div class="main"><div class="title">' + tr(x[1]) + '</div><div class="sub">' + tr(x[2]) + '</div></div></button>'; }).join('') + '</div><div class="actions">' + hCloseBtn() + '</div>';
  var ov = openSheet(html); hBack(ov);
  ov.querySelectorAll('[data-ht]').forEach(function(b){ b.addEventListener('click', function(){ closeModal(); HOSP_PAGES[b.getAttribute('data-ht')](); }); });
}

(function(){
  try{
    VERT_PAGES.hospitality = VERT_PAGES.hospitality.concat([['v-tools', 'Hospitality tools', 'clipboard']]);
    Object.keys(HOSP_MGR).forEach(function(k){ VERT_MGR[k] = 1; });
    var _da = vertDrawerAction; vertDrawerAction = function(key){ if(HOSP_PAGES[key]){ if(HOSP_MGR[key] && !isManagerOrOwner()){ toast(tr('That page is for owners and managers.')); return true; } HOSP_PAGES[key](); return true; } return _da(key); };
    var _hd = vHospDash; vHospDash = function(){
      var h = _hd(), dirty = vRooms().filter(function(r){ return r.status === 'dirty'; }).length, wait = vList('hosWait').filter(function(w){ return hWaitMatches(w).length; }).length;
      return h + '<div class="section-title">' + tr('Hospitality tools') + '</div><div class="qa-row">' + vTile('h-calendar', 'clock', 'Room calendar') + vTile('h-hk', 'check', 'Housekeeping', dirty ? dirty + ' ' + tr('to clean') : '') + vTile('h-wait', 'people', 'Waiting list', wait ? wait + ' ' + tr('can be offered') : '') + '</div><div class="qa-row">' + vTile('h-free', 'search', 'Find a free room') + vTile('h-msgs', 'receipt', 'Guest messages') + vTile('h-clock', 'clock', 'Team clock') + '</div><div class="qa-row">' + vTile('h-tools', 'clipboard', 'All hospitality tools') + '</div>';
    };
    document.addEventListener('click', function(e){
      var el = e.target && e.target.closest ? e.target.closest('[data-vq^="h-"]') : null; if(!el) return;
      var key = 'v-' + el.getAttribute('data-vq').slice(2); if(HOSP_PAGES[key]){ e.preventDefault(); HOSP_PAGES[key](); }
    });
    var _va = vertAlerts; vertAlerts = function(){
      var out = _va(), t = todayKey();
      var wait = vList('hosWait').filter(function(w){ return hWaitMatches(w).length; });
      if(wait.length) out.push({ id:'h-wait', level:'med', title:wait.length + ' waiting list guest' + (wait.length === 1 ? ' can' : 's can') + ' be offered a room', body:wait.slice(0, 3).map(function(w){ return w.guestName; }).join(', '), go:'', label:'' });
      var dirtyToday = vList('hosBookings').filter(function(b){ return b.status === 'reserved' && b.checkIn === t; }).filter(function(b){ var r = vList('hosRooms').find(function(x){ return x.id === b.roomId; }); return r && r.status !== 'clean'; });
      if(dirtyToday.length) out.push({ id:'h-hk', level:'med', title:dirtyToday.length + ' room' + (dirtyToday.length === 1 ? '' : 's') + ' for today\'s arrivals not ready', body:dirtyToday.slice(0, 3).map(function(b){ return b.roomName + ' (' + b.guestName + ')'; }).join(', '), go:'', label:'' });
      var longClock = vList('hosClock').filter(function(c){ return !c.outAt && hHours(c) > 16; });
      if(longClock.length) out.push({ id:'h-clock', level:'low', title:longClock.length + ' clock entr' + (longClock.length === 1 ? 'y' : 'ies') + ' open for over 16 hours', body:longClock.slice(0, 3).map(function(c){ return c.name; }).join(', '), go:'', label:'' });
      return out;
    };
  }catch(e){}
})();
