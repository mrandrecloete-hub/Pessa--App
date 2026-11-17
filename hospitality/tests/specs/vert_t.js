const { chromium } = require('playwright');
let fail=0; const ck=(n,c)=>{ console.log((c?'  ok   ':'  FAIL ')+n); if(!c){fail++;} };
async function signup(b, type, name){
  const ctx=await b.newContext({viewport:{width:390,height:900},serviceWorkers:'block'}); const p=await ctx.newPage(); p.__errs=[]; p.on('pageerror',e=>p.__errs.push(e.message));
  await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
  await p.fill('#rcCompanyName',name); await p.fill('#rcOwnerName','Owner'); await p.fill('#rcOwnerEmail','o@x.com'); await p.fill('#rcOwnerPassword','aaaa1111'); await p.fill('#rcOwnerPassword2','aaaa1111'); await p.click('#rcSubmit');
  await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.dkd, .hero-card');
  await p.evaluate(()=>{ try{ window.__t.btSave({ setupHidden:true }); window.__t.pfSave({ remindAt:Date.now() }); }catch(e){} });
  return p;
}
const RETAIL_ONLY = ['tab-sell','tab-credit','terminal','tab-reconcile','suppliers','pos','stocktake','wastage','branches','pesaad'];
const menuKeys = (p) => p.evaluate(()=>{ const d=document.createElement('div'); d.innerHTML=(function(t){ return (function(t){ return t.menuRowsHtml() + ['hub-tools','hub-stock','hub-money','hub-team','hub-pesa'].map(function(h){ return t.menuHubItems(h).map(function(i){ return t.drawerRowHtml(i.k,i.icon,i.label,i.count); }).join(''); }).join(''); })(t) + ['hub-tools','hub-stock','hub-money','hub-team','hub-pesa'].map(function(h){ return t.menuHubItems(h).map(function(i){ return t.drawerRowHtml(i.k,i.icon,i.label,i.count); }).join(''); }).join(''); })(window.__t); return [...d.querySelectorAll('[data-drawer-row]')].map(e=>e.getAttribute('data-drawer-row')); });
async function addStaff(p, name, job){
  await p.evaluate(()=>{ window.__t.closeModal(); }); await p.click('[data-vq="addstaff"]'); await p.waitForSelector('#sfName');
  await p.fill('#sfName',name); await p.fill('#sfJob',job); await p.click('[data-sfmode="direct"]'); await p.fill('#sfPass','4821'); await p.click('#sfSave'); await p.waitForTimeout(800);
}
async function asEmployee(p, name){
  await p.evaluate(()=>{ window.__t.closeModal(); window.__t.logout(); }); await p.waitForTimeout(500);
  await p.evaluate(()=>{ const b=[...document.querySelectorAll('.sheet button,.overlay button')].find(x=>/^Log out$/.test(x.textContent.trim())); b.click(); }); await p.waitForTimeout(600);
  await p.click('text=Log in again'); await p.click('[data-staff]:has-text("'+name+'")'); await p.fill('#loginPass','4821'); await p.click('#loginUnlockBtn');
  await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForTimeout(1200);
}
const charge = async p => { await p.waitForSelector('[data-pm="cash"]'); await p.click('[data-pm="cash"]'); await p.fill('#cashRecv','5000'); await p.click('#confirmChargeBtn'); await p.waitForTimeout(700); };
(async()=>{ const b=await chromium.launch();
 // ---------- the sign up page has no choice of business type: Pesa Hospitality is for hospitality
 { const ctx=await b.newContext({viewport:{width:390,height:900},serviceWorkers:'block'}); const p=await ctx.newPage(); await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
   ck('there is no business type choice on sign up', (await p.$$('input[name="rcBizType"]')).length===0 && !(await p.$('#regTypeBox'))); await ctx.close(); }
 // ---------- hospitality
 { const p=await signup(b,'hospitality','Oryx Guest House');
   let r=await p.evaluate(()=>({ type:window.__t.bizType(), vq:!!document.querySelector('[data-vq="bookings"]'), txt:document.body.innerText }));
   ck('hospitality gets its own dashboard', r.type==='hospitality' && r.vq && /arriving today/i.test(r.txt) && /tourism board/i.test(r.txt));
   await p.evaluate(()=>window.__t.openRoomForm(null)); await p.fill('#rfName','Room 1'); await p.fill('#rfRate','850'); await p.click('#rfSave'); await p.waitForTimeout(500);
   await p.evaluate(()=>window.__t.closeModal()); await p.evaluate(()=>window.__t.openRoomForm(null)); await p.fill('#rfName','Room 2'); await p.fill('#rfRate','650'); await p.click('#rfSave'); await p.waitForTimeout(500);
   ck('two rooms added', await p.evaluate(()=>window.__t.State.hosRooms.length===2));
   await p.evaluate(()=>window.__t.closeModal()); await p.evaluate(()=>window.__t.openStayForm(null));
   await p.fill('#sfGuest','Hans Muller'); await p.fill('#sfPhone','0811112222'); await p.evaluate(()=>{ const d=window.__t.todayKey(); document.querySelector('#sfIn').value=d; document.querySelector('#sfOut').value=window.__t.vAddDays(d,2); document.querySelector('#sfRoom').selectedIndex=0; document.querySelector('#sfRoom').dispatchEvent(new Event('change')); }); await p.fill('#sfDep','500');
   await p.click('#sfSave'); await p.waitForTimeout(600);
   ck('room booking saved at the room rate', await p.evaluate(()=>{ const b=window.__t.State.hosBookings[0]; return b && b.rate===850 && b.status==='reserved' && b.deposit===500; }));
   // double booking is refused
   await p.evaluate(()=>window.__t.closeModal()); await p.evaluate(()=>window.__t.openStayForm(null)); await p.fill('#sfGuest','Other Guest'); await p.evaluate(()=>{ const d=window.__t.todayKey(); document.querySelector('#sfIn').value=d; document.querySelector('#sfOut').value=window.__t.vAddDays(d,1); document.querySelector('#sfRoom').selectedIndex=0; document.querySelector('#sfRoom').dispatchEvent(new Event('change')); }); await p.click('#sfSave'); await p.waitForTimeout(400);
   ck('the same room cannot be double booked', await p.evaluate(()=>window.__t.State.hosBookings.length===1 && /already booked/.test(document.querySelector('#sfErr').innerText)));
   await p.evaluate(()=>window.__t.closeModal());
   const bk = await p.evaluate(()=>window.__t.State.hosBookings[0]); await p.evaluate(b=>window.__t.openStayView(b), bk); await p.click('[data-sa="in"]'); await p.waitForTimeout(600);
   ck('check in', await p.evaluate(()=>window.__t.State.hosBookings[0].status==='in'));
   // a tab on the room
   await p.evaluate(async()=>{ await window.__t.refs.products.add({ name:'Castle Lager', sellPrice:25, costPrice:15, stockQty:50, createdAt:new Date().toISOString() }); });
   await p.waitForTimeout(500);
   await p.evaluate(()=>window.__t.closeModal()); await p.evaluate(b=>window.__t.openTabForm(null,b), await p.evaluate(()=>window.__t.State.hosBookings[0]));
   await p.fill('#tfQ','castle'); await p.waitForSelector('[data-add]'); await p.click('[data-add]'); await p.click('[data-p]'); await p.click('#tfSave'); await p.waitForTimeout(500);
   ck('tab saved on the room with two beers', await p.evaluate(()=>{ const t=window.__t.State.hosTabs[0]; return t && t.items[0].qty===2 && !!t.bookingId; }));
   await p.evaluate(()=>window.__t.closeModal());
   const bk2 = await p.evaluate(()=>window.__t.State.hosBookings[0]); await p.evaluate(b=>window.__t.openStayView(b), bk2);
   ck('folio shows the deposit and the balance', /Balance to collect/.test(await p.evaluate(()=>document.body.innerText)));
   await p.click('[data-sa="out"]'); await charge(p);
   const f = await p.evaluate(()=>({ b:window.__t.State.hosBookings[0], t:window.__t.State.hosTabs[0], s:window.__t.State.sales[0], stock:window.__t.State.products.find(x=>x.name==='Castle Lager').stockQty }));
   console.log({ total:f.s && f.s.total, status:f.b.status, tab:f.t.status, stock:f.stock });
   ck('check out charges rooms and the tab as one sale (2 nights x 850 + 2 x 25 = 1750)', f.s && Math.round(f.s.total)===1750 && f.s.bookingId===f.b.id);
   ck('booking checked out, tab closed, stock taken off', f.b.status==='out' && f.t.status==='closed' && f.stock===48);
   await p.evaluate(()=>window.__t.render());
   ck('dashboard shows room fees and the levy estimate', /room fees this month/i.test(await p.evaluate(()=>document.body.innerText)) && /1,?700/.test(await p.evaluate(()=>document.body.innerText)));
   const own = await p.evaluate(()=>{ window.__t.render(); return { team:!!document.querySelector('[data-vq="team"]'), add:!!document.querySelector('[data-vq="addstaff"]'), sup:!document.querySelector('[data-vq="suppliers"]') && !document.querySelector('[data-vq="till"]') && !document.querySelector('[data-vq="sell"]') && !document.querySelector('[data-vq="assistant"]'), stock:!!document.querySelector('[data-vq="stock"]') }; });
   ck('owner dashboard has Team, Add employee and Menu and stock, and no retail tiles (Sell, Suppliers, Till, AI)', own.team && own.add && own.sup && own.stock);
   const hm = await p.evaluate(()=>({ menu:(function(t){ return (function(t){ return t.menuRowsHtml() + ['hub-tools','hub-stock','hub-money','hub-team','hub-pesa'].map(function(h){ return t.menuHubItems(h).map(function(i){ return t.drawerRowHtml(i.k,i.icon,i.label,i.count); }).join(''); }).join(''); })(t) + ['hub-tools','hub-stock','hub-money','hub-team','hub-pesa'].map(function(h){ return t.menuHubItems(h).map(function(i){ return t.drawerRowHtml(i.k,i.icon,i.label,i.count); }).join(''); }).join(''); })(window.__t) }));
   { const k = await menuKeys(p); ck('hospitality menu has its own pages and none of the retail ones', ['v-bookings','v-rooms','v-tabs','v-guests','v-comply','tab-invoices','tab-reports','tab-expenses','tab-team','accountant','settings'].every(x=>k.indexOf(x)>-1) && RETAIL_ONLY.concat(['tab-till','tab-credit']).every(x=>k.indexOf(x)<0)); }
   await p.evaluate(()=>window.__t.closeModal()); await p.click('[data-vq="addstaff"]'); await p.waitForSelector('#sfName');
   ck('staff form uses hospitality job names', /Front desk, Waiter or Bar staff/.test(await p.evaluate(()=>[...document.querySelectorAll('#sfRole option')].map(o=>o.textContent).join('|')))); await p.evaluate(()=>window.__t.closeModal());
   await addStaff(p,'Selma Waiter','Waiter'); await asEmployee(p,'Selma');
   const emp = await p.evaluate(()=>({ txt:document.body.innerText, menu:(function(t){ return (function(t){ return t.menuRowsHtml() + ['hub-tools','hub-stock','hub-money','hub-team','hub-pesa'].map(function(h){ return t.menuHubItems(h).map(function(i){ return t.drawerRowHtml(i.k,i.icon,i.label,i.count); }).join(''); }).join(''); })(t) + ['hub-tools','hub-stock','hub-money','hub-team','hub-pesa'].map(function(h){ return t.menuHubItems(h).map(function(i){ return t.drawerRowHtml(i.k,i.icon,i.label,i.count); }).join(''); }).join(''); })(window.__t) }));
   ck('front desk employee sees Front desk today', /front desk today/i.test(emp.txt));
   ck('their menu has bookings and tabs but not licences', /Room bookings/.test(emp.menu) && /Tables and tabs/.test(emp.menu) && !/Licences and levy/.test(emp.menu));
   ck('hospitality: no page errors', p.__errs.length===0); if(p.__errs.length) console.log(p.__errs.slice(0,3)); }
 await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
