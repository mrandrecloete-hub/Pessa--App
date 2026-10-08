const { chromium } = require('playwright');
let fail=0; const ck=(n,c)=>{ console.log((c?'  ok   ':'  FAIL ')+n); if(!c){fail++;} };
async function signup(b, type, name){
  const ctx=await b.newContext({viewport:{width:390,height:900},serviceWorkers:'block'}); const p=await ctx.newPage(); p.__errs=[]; p.on('pageerror',e=>p.__errs.push(e.message));
  if(type!=='retail') await p.addInitScript(()=>{ window.__forceSimple=true; });   // the real gate: barbershop and hospitality get only their own menus
  await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
  if(type!=='retail') await p.click('.rt-card:has(input[value="'+type+'"])');
  await p.fill('#rcCompanyName',name); await p.fill('#rcOwnerName','Owner'); await p.fill('#rcOwnerEmail','o@x.com'); await p.fill('#rcOwnerPassword','aaaa1111'); await p.fill('#rcOwnerPassword2','aaaa1111'); await p.click('#rcSubmit');
  await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.dkd, .hero-card');
  await p.evaluate(()=>{ try{ window.__t.btSave({ setupHidden:true, simpleMode:false }); window.__t.pfSave({ remindAt:Date.now() }); }catch(e){} });
  return p;
}
const RETAIL_ONLY = ['tab-sell','tab-credit','terminal','insights','bizhub','smart','agent','tab-reconcile','suppliers','pos','stocktake','wastage','branches','pesaad'];
const menuKeys = (p) => p.evaluate(()=>{ const d=document.createElement('div'); d.innerHTML=window.__t.menuRowsHtml(); return [...d.querySelectorAll('[data-drawer-row]')].map(e=>e.getAttribute('data-drawer-row')); });
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
 // ---------- the sign up page offers the three types, retail by default
 { const ctx=await b.newContext({viewport:{width:390,height:900},serviceWorkers:'block'}); const p=await ctx.newPage(); await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
   const t = await p.evaluate(()=>({ n:document.querySelectorAll('input[name="rcBizType"]').length, def:document.querySelector('input[name="rcBizType"]:checked').value, txt:[...document.querySelectorAll('.rt-t b')].map(x=>x.textContent) }));
   console.log(t); ck('three business types, retail preselected', t.n===3 && t.def==='retail' && /Barbershop/.test(t.txt[0]) && /Retail/.test(t.txt[1]) && /Hospitality/.test(t.txt[2])); await ctx.close(); }
 // ---------- retail keeps the full dashboard
 { const p=await signup(b,'retail','Shop One'); const r=await p.evaluate(()=>({ type:window.__t.bizType(), hero:!!document.querySelector('.hero-card'), vq:!!document.querySelector('[data-vq="appts"]') }));
   ck('retail gets the full Pesa dashboard', r.type==='retail' && r.hero && !r.vq); const rm = await p.evaluate(()=>{ window.__t.openBizHub(); const biz=document.body.innerText; window.__t.closeModal(); return { menu:window.__t.menuRowsHtml(), tabs:window.__t.roleTabs('owner'), biz }; });
   ck('retail keeps everything: POS, invoices, purchase orders, stock take, wastage, branches', ['Point of sale','Invoices','Purchase orders','Stock take','Wastage','Branches'].every(x=>rm.menu.indexOf(x)>-1) && rm.tabs.indexOf('invoices')>-1);
   ck('retail business tools keep barcode labels and quotes', /barcode labels/i.test(rm.biz) && /quotes and recurring/i.test(rm.biz));
   ck('retail: no page errors', p.__errs.length===0); }
 // ---------- barbershop and salon
 { const p=await signup(b,'beauty','Fade Masters'); 
   let r=await p.evaluate(()=>({ type:window.__t.bizType(), vq:!!document.querySelector('[data-vq="appts"]'), txt:document.body.innerText }));
   ck('salon gets its own dashboard', r.type==='beauty' && r.vq && /today.s takings/i.test(r.txt) && /add your services/i.test(r.txt) && /get started/i.test(r.txt));
   await p.evaluate(()=>window.__t.openServicesSheet()); await p.click('#svStarter'); await p.waitForTimeout(900);
   const n = await p.evaluate(()=>window.__t.State.products.filter(x=>x.isService).length); ck('starter services added ('+n+')', n>=15);
   await p.evaluate(async()=>{ const t=window.__t; await t.refs.users.add({name:'Sam Barber',role:'cashier',active:true,passHash:'x',createdAt:new Date().toISOString()}); });
   await p.waitForTimeout(500);
   await p.evaluate(()=>window.__t.openApptForm(null, window.__t.todayKey()));
   await p.fill('#apName','Peter Nghipandulwa'); await p.fill('#apPhone','0811234567'); await p.check('#apSvc [data-s]:nth-of-type(1)').catch(()=>{});
   await p.evaluate(()=>{ const c=document.querySelector('#apSvc input[type=checkbox]'); c.checked=true; const o=[...document.querySelectorAll('#apStaff option')].find(x=>/Sam/.test(x.textContent)); document.querySelector('#apStaff').value=o.value; });
   await p.click('#apSave'); await p.waitForTimeout(700);
   let a = await p.evaluate(()=>window.__t.State.appointments.map(x=>({s:x.status,n:x.clientName,sty:x.stylistName,t:x.total})));
   console.log(a); ck('booking saved with the barber', a.length===1 && a[0].s==='booked' && a[0].sty==='Sam Barber' && a[0].t>0);
   await p.click('[data-ap="arrived"]'); await p.waitForTimeout(500); await p.click('[data-ap="start"]'); await p.waitForTimeout(500);
   ck('arrived then in the chair', await p.evaluate(()=>window.__t.State.appointments[0].status==='inchair'));
   await p.click('[data-ap="charge"]'); await charge(p);
   const done = await p.evaluate(()=>({ ap:window.__t.State.appointments[0], sale:window.__t.State.sales[0] }));
   ck('charging records a normal sale linked to the booking', done.sale && done.sale.appointmentId===done.ap.id && done.sale.stylistName==='Sam Barber' && done.ap.status==='done');
   // walk in
   await p.evaluate(()=>window.__t.openQueueSheet()); await p.fill('#qName','Walk In Guy'); await p.evaluate(()=>{ const s=document.querySelector('#qSvc'); s.selectedIndex=2; }); await p.click('#qAdd'); await p.waitForTimeout(600);
   ck('walk in queue works', await p.evaluate(()=>window.__t.State.appointments.some(x=>x.kind==='walkin'&&x.status==='waiting')));
   await p.evaluate(()=>window.__t.closeModal());
   // earnings
   await p.evaluate(()=>window.__t.openEarningsSheet()); await p.waitForTimeout(300);
   ck('earnings page lists the barber and the takings', /Sam Barber/.test(await p.evaluate(()=>document.body.innerText)));
   await p.evaluate(()=>window.__t.closeModal());
   await p.evaluate(()=>window.__t.render()); await p.waitForTimeout(300);
   ck('dashboard shows today takings after the sale', await p.evaluate(()=>/N\$/.test(document.querySelector('.hero-val').textContent) && !/N\$0\.00/.test(document.querySelector('.hero-val').textContent)));
   ck('menu has the salon pages', await p.evaluate(()=>/Appointments/.test(window.__t.menuRowsHtml()) && /Stylist earnings/.test(window.__t.menuRowsHtml())));
   // the owner runs the business from this dashboard: team, expenses and the rest are right there, and employees can be added
   const own = await p.evaluate(()=>{ window.__t.render(); const t=document.body.innerText.toLowerCase(); return { team:!!document.querySelector('[data-vq="team"]'), add:!!document.querySelector('[data-vq="addstaff"]'), exp:!!document.querySelector('[data-vq="expenses"]'), acc:!!document.querySelector('[data-vq="accountant"]'), get:t.indexOf('get started')>-1 }; });
   console.log(own); ck('owner dashboard has Team, Add employee, Expenses and Accountant right on it', own.team && own.add && own.exp && own.acc);
   await p.evaluate(()=>window.__t.closeModal());
   const sm = await p.evaluate(()=>{ const t=window.__t; t.logout&&0; return { menu:t.menuRowsHtml(), tabs:t.roleTabs('owner') }; });
   ck('salon menu has no POS, invoices, purchase orders, stock take, wastage or branches', ['Point of sale','Invoices','Purchase orders','Stock take','Wastage','Branches'].every(x=>sm.menu.indexOf(x)<0) && sm.tabs.indexOf('invoices')<0);
   ck('salon menu keeps its own pages and the basics', ['Appointments','Messages','Stock','Reports','Expenses','Employee tracking','Accountant','Settings'].every(x=>sm.menu.indexOf(x)>-1));
   { const k = await menuKeys(p); console.log(k.join(',')); ck('salon menu and dashboard have the Developer panel', k.indexOf('v-dev')>-1 && await p.evaluate(()=>!!document.querySelector('[data-vq="dev"]')));
   ck('salon menu has none of the retail pages (Sell, Credit, Till, Insights, tools, suppliers, stock take...)', RETAIL_ONLY.concat(['tab-till','tab-invoices']).every(x=>k.indexOf(x)<0)); }
   await p.evaluate(()=>window.__t.openBizHub()); const sb = await p.evaluate(()=>document.body.innerText); await p.evaluate(()=>window.__t.closeModal());
   ck('salon business tools: no barcode labels, quotes or currency, but payroll, tips and attendance stay', !/barcode labels/i.test(sb) && !/quotes and recurring/i.test(sb) && !/currency and converter/i.test(sb) && /payroll/i.test(sb) && /staff tips/i.test(sb) && /attendance/i.test(sb));
   await p.evaluate(()=>window.__t.openStaffSheet(null)); await p.waitForSelector('#sfRole'); ck('salon staff form has no stock clerk option', await p.evaluate(()=>![...document.querySelectorAll('#sfRole option')].some(o=>o.value==='stockclerk'))); await p.evaluate(()=>window.__t.closeModal());
   ck('salon dashboard has no link back to the retail dashboard', await p.evaluate(()=>{ window.__t.render(); return !document.querySelector('[data-vq="retail"]'); }));
   await p.evaluate(()=>window.__t.closeModal()); await p.click('[data-vq="addstaff"]'); await p.waitForSelector('#sfName');
   const roleTxt = await p.evaluate(()=>[...document.querySelectorAll('#sfRole option')].map(o=>o.textContent).join('|')); ck('staff form uses salon job names', /Barber, Stylist or Receptionist/.test(roleTxt)); await p.evaluate(()=>window.__t.closeModal());
   await addStaff(p,'Thandi Braider','Braider');
   ck('the employee was registered with a PIN login', await p.evaluate(()=>window.__t.State.users.some(u=>u.name==='Thandi Braider' && u.role==='cashier' && u.jobTitle==='Braider' && u.passHash)));
   await asEmployee(p,'Thandi');
   const emp = await p.evaluate(()=>({ txt:document.body.innerText, menu:window.__t.menuRowsHtml(), role:window.__t.State.session.role }));
   ck('employee signs in and sees their own page with My clients today', emp.role==='cashier' && /my clients today/i.test(emp.txt));
   ck('employee menu has appointments but not earnings or services admin', /Appointments/.test(emp.menu) && !/Stylist earnings/.test(emp.menu) && !/Services and prices/.test(emp.menu) && !/Business type/.test(emp.menu));
   ck('salon: no page errors', p.__errs.length===0); if(p.__errs.length) console.log(p.__errs.slice(0,3)); }
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
   const hm = await p.evaluate(()=>({ menu:window.__t.menuRowsHtml() }));
   { const k = await menuKeys(p); console.log(k.join(',')); ck('hospitality menu and dashboard have the Developer panel', k.indexOf('v-dev')>-1 && await p.evaluate(()=>!!document.querySelector('[data-vq="dev"]')));
   ck('hospitality menu has its own pages and none of the retail ones', ['v-bookings','v-rooms','v-tabs','v-guests','v-comply','tab-invoices','tab-reports','tab-expenses','tab-team','accountant','settings'].every(x=>k.indexOf(x)>-1) && RETAIL_ONLY.concat(['tab-till','tab-credit']).every(x=>k.indexOf(x)<0)); }
   await p.evaluate(()=>window.__t.closeModal()); await p.click('[data-vq="addstaff"]'); await p.waitForSelector('#sfName');
   ck('staff form uses hospitality job names', /Front desk, Waiter or Bar staff/.test(await p.evaluate(()=>[...document.querySelectorAll('#sfRole option')].map(o=>o.textContent).join('|')))); await p.evaluate(()=>window.__t.closeModal());
   await addStaff(p,'Selma Waiter','Waiter'); await asEmployee(p,'Selma');
   const emp = await p.evaluate(()=>({ txt:document.body.innerText, menu:window.__t.menuRowsHtml() }));
   ck('front desk employee sees Front desk today', /front desk today/i.test(emp.txt));
   ck('their menu has bookings and tabs but not licences', /Room bookings/.test(emp.menu) && /Tables and tabs/.test(emp.menu) && !/Licences and levy/.test(emp.menu));
   ck('hospitality: no page errors', p.__errs.length===0); if(p.__errs.length) console.log(p.__errs.slice(0,3)); }
 await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
