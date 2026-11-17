// Hospitality tools: room calendar, find a free room, waiting list, housekeeping, split bill, recipes, team clock, occupancy, guest messages.
const { chromium } = require('playwright');
let fail = 0; const ck = (n, c, x) => { console.log((c ? '  ok   ' : '  FAIL ') + n + (c ? '' : '  -> ' + JSON.stringify(x))); if (!c) fail++; };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: 'block' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await require('./biz_boot.js')(p);
  await p.evaluate(async () => {
    const T = window.__t, t = T.todayKey(), d1 = T.vAddDays(t, 1), d3 = T.vAddDays(t, 3);
    await T.refs.hosRooms.doc('r1').set({ name: 'Room 1', type: 'Double', capacity: 2, rate: 800, status: 'clean', active: true });
    await T.refs.hosRooms.doc('r2').set({ name: 'Room 2', type: 'Double', capacity: 2, rate: 700, status: 'dirty', active: true });
    await T.refs.hosRooms.doc('r3').set({ name: 'Suite', type: 'Suite', capacity: 4, rate: 1500, status: 'clean', active: true });
    await T.refs.hosBookings.doc('b1').set({ guestName: 'Hans', roomId: 'r1', roomName: 'Room 1', checkIn: t, checkOut: d3, rate: 800, status: 'in', phone: '0811112222' });
    await T.refs.hosBookings.doc('b2').set({ guestName: 'Anna', roomId: 'r2', roomName: 'Room 2', checkIn: d1, checkOut: d3, rate: 700, status: 'reserved', phone: '0811113333' });
    await T.refs.products.doc('m1').set({ name: 'Steak', category: 'Food', sellPrice: 120, costPrice: 0, stockQty: 50 });
    await T.refs.products.doc('i1').set({ name: 'Beef kg', category: 'Kitchen', sellPrice: 0, costPrice: 100, stockQty: 20 });
    await T.refs.products.doc('i2').set({ name: 'Chips kg', category: 'Kitchen', sellPrice: 0, costPrice: 20, stockQty: 20 });
    await T.refs.hosTabs.doc('tb1').set({ name: 'Table 4', status: 'open', bookingId: '', createdAt: new Date().toISOString(), items: [{ productId: 'm1', name: 'Steak', qty: 3, unitPrice: 120, sentQty: 3 }, { productId: 'i2', name: 'Chips', qty: 2, unitPrice: 30, sentQty: 0 }] });
  });
  await p.waitForTimeout(300);
  // calendar
  await p.evaluate(() => window.__t.openRoomCalendarSheet());
  await p.waitForSelector('[data-hcb]');
  ck('the calendar shows booked nights and empty nights', (await p.$$('[data-hcb]')).length >= 3 && (await p.$$('[data-hce]')).length > 20);
  const emp = await p.$eval('[data-hce^="r3|"]', e => e.getAttribute('data-hce'));
  await p.click('[data-hce^="r3|"]'); await p.waitForSelector('#sfRoom');
  const f = await p.evaluate(() => ({ room: document.querySelector('#sfRoom').value, a: document.querySelector('#sfIn').value, c: document.querySelector('#sfOut').value }));
  ck('tapping an empty night opens the booking for that room and date', f.room === 'r3' && f.a === emp.split('|')[1] && f.c > f.a, f);
  await p.evaluate(() => window.__t.closeModal());
  // free rooms
  const free = await p.evaluate(() => { const T = window.__t, t = T.todayKey(); return { both: T.hFreeRooms(T.vAddDays(t, 1), T.vAddDays(t, 3), 2).map(r => r.id), big: T.hFreeRooms(T.vAddDays(t, 1), T.vAddDays(t, 3), 3).map(r => r.id) }; });
  ck('free rooms respect bookings and the number of guests', free.both.join() === 'r3' && free.big.join() === 'r3', free);
  // waiting list
  await p.evaluate(() => { const T = window.__t; T.vSave('hosWait', 'w1', { guestName: 'Kai', phone: '0811114444', from: T.vAddDays(T.todayKey(), 1), to: T.vAddDays(T.todayKey(), 3), guests: 2, roomType: 'Suite', status: 'waiting', createdAt: new Date().toISOString() });
    T.vSave('hosWait', 'w2', { guestName: 'Lea', from: T.vAddDays(T.todayKey(), 1), to: T.vAddDays(T.todayKey(), 3), guests: 2, roomType: 'Double', status: 'waiting', createdAt: new Date().toISOString() }); });
  const wm = await p.evaluate(() => { const T = window.__t; return { kai: T.hWaitMatches(T.vList('hosWait').find(w => w.id === 'w1')).length, lea: T.hWaitMatches(T.vList('hosWait').find(w => w.id === 'w2')).length }; });
  ck('the waiting list matches a free suite but not a full double', wm.kai === 1 && wm.lea === 0, wm);
  await p.evaluate(() => window.__t.openWaitSheet()); await p.waitForSelector('[data-wb]');
  ck('the waiting list page offers to book the free room', (await p.$$('[data-wb]')).length === 1);
  await p.evaluate(() => window.__t.closeModal());
  // housekeeping
  await p.evaluate(() => window.__t.openHousekeepingSheet()); await p.waitForSelector('[data-hk="cleaning|r2"]');
  await p.click('[data-hk="cleaning|r2"]'); await p.waitForSelector('[data-hk="clean|r2"]'); await p.click('[data-hk="clean|r2"]'); await p.waitForTimeout(300);
  const r2 = await p.evaluate(() => window.__t.vList('hosRooms').find(r => r.id === 'r2'));
  ck('housekeeping takes a room from dirty to being cleaned to ready, with the time', r2.status === 'clean' && !!r2.cleanedAt, r2);
  await p.evaluate(() => window.__t.closeModal());
  // split bill
  await p.evaluate(() => window.__t.openSplitSheet('tb1')); await p.waitForSelector('[data-sq="0"]');
  await p.fill('[data-sq="0"]', '1'); await p.fill('[data-sq="1"]', '2'); await p.click('#spGo'); await p.waitForTimeout(400);
  const tabs = await p.evaluate(() => window.__t.vList('hosTabs').map(x => ({ n: x.name, st: x.status, tot: window.__t.vTabTotal(x), items: x.items.map(i => i.name + ':' + i.qty + ':' + (i.sentQty || 0)) })));
  const a = tabs.find(x => x.n === 'Table 4'), c = tabs.find(x => /bill 2/.test(x.n));
  ck('the split moves the chosen items to a new bill and the totals still add up', a && c && a.tot === 240 && c.tot === 180 && a.tot + c.tot === 420, tabs);
  ck('items already sent to the kitchen are not sent again', a && c && a.items.join() === 'Steak:2:2' && c.items.join() === 'Steak:1:1,Chips:2:0', tabs);
  await p.evaluate(() => window.__t.closeModal());
  // recipes
  await p.evaluate(() => { const T = window.__t; T.vSave('hosRecipes', 'rc1', { productId: 'm1', name: 'Steak', portions: 1, ingredients: [{ productId: 'i1', name: 'Beef kg', qty: 0.3, cost: 100 }, { productId: 'i2', name: 'Chips kg', qty: 0.25, cost: 20 }] }); });
  const cost = await p.evaluate(() => window.__t.hRecipeCost(window.__t.vList('hosRecipes')[0]));
  ck('recipe cost per portion is worked out from the stock cost prices (0.3 x 100 + 0.25 x 20 = 35)', Math.abs(cost - 35) < 1e-9, cost);
  await p.evaluate(() => window.__t.openRecipeForm(window.__t.vList('hosRecipes')[0])); await p.waitForSelector('#rcApply'); await p.click('#rcApply'); await p.waitForTimeout(300);
  ck('use as the cost price writes the cost onto the menu item', await p.evaluate(() => window.__t.State.products.find(x => x.id === 'm1').costPrice === 35));
  await p.evaluate(() => window.__t.closeModal());
  // team clock
  const clock = await p.evaluate(() => { const T = window.__t, me = T.State.session.userId, u = T.vStaff().find(x => x.id === me) || T.vStaff()[0];
    T.vSave('hosClock', 'c1', { userId: u.id, name: u.name, inAt: new Date(Date.now() - 3600000 * 2).toISOString(), outAt: '' });
    const open = T.hClockOpen(u.id); const h = T.hHours(open); T.vPatch('hosClock', 'c1', { outAt: new Date().toISOString() }); return { open: !!open, h: Math.round(h), closed: !T.hClockOpen(u.id) }; });
  ck('clocking in is found as open, hours are counted, clocking out closes it', clock.open && clock.h === 2 && clock.closed, clock);
  // occupancy
  const occ = await p.evaluate(() => { const T = window.__t, tt = T.todayKey(); return T.hOccupancy(tt, T.vAddDays(tt, 2)); });
  ck('occupancy counts the nights sold and the average rate', occ.avail === 9 && occ.sold === 5 && occ.rev === 800 * 3 + 700 * 2 && Math.round(occ.adr) === 760, occ);
  // guest messages
  await p.evaluate(() => window.__t.openGuestMessagesSheet('inhouse')); await p.waitForSelector('[data-gm]');
  ck('guest messages list the guests in house', (await p.$$('[data-gm]')).length === 1);
  await p.evaluate(() => window.__t.closeModal());
  // menu and dashboard
  const m = await p.evaluate(() => { const T = window.__t; return { dash: /Hospitality tools/.test(T.vHospDash()), pages: T.VERT_PAGES.hospitality.map(x => x[0]).join() }; });
  ck('the dashboard and menu carry the new pages', m.dash && /v-tools/.test(m.pages), m);
  ck('no page errors', errs.length === 0, errs);
  await b.close(); console.log(fail ? 'FAILED ' + fail : 'all ok'); process.exit(fail ? 1 : 0);
})();
