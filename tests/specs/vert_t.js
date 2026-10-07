const { chromium } = require('playwright');
let fail=0; const ck=(n,c)=>{ console.log((c?'  ok   ':'  FAIL ')+n); if(!c){fail++;} };
async function signup(b, type, name){
  const ctx=await b.newContext({viewport:{width:390,height:900},serviceWorkers:'block'}); const p=await ctx.newPage(); p.__errs=[]; p.on('pageerror',e=>p.__errs.push(e.message));
  await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
  if(type!=='retail') await p.click('.rt-card:has(input[value="'+type+'"])');
  await p.fill('#rcCompanyName',name); await p.fill('#rcOwnerName','Owner'); await p.fill('#rcOwnerEmail','o@x.com'); await p.fill('#rcOwnerPassword','aaaa1111'); await p.fill('#rcOwnerPassword2','aaaa1111'); await p.click('#rcSubmit');
  await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.dkd, .hero-card');
  await p.evaluate(()=>{ try{ window.__t.btSave({ setupHidden:true }); window.__t.pfSave({ remindAt:Date.now() }); }catch(e){} });
  return p;
}
const charge = async p => { await p.waitForSelector('[data-pm="cash"]'); await p.click('[data-pm="cash"]'); await p.fill('#cashRecv','5000'); await p.click('#confirmChargeBtn'); await p.waitForTimeout(700); };
(async()=>{ const b=await chromium.launch();
 // ---------- the sign up page offers the three types, retail by default
 { const ctx=await b.newContext({viewport:{width:390,height:900},serviceWorkers:'block'}); const p=await ctx.newPage(); await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
   const t = await p.evaluate(()=>({ n:document.querySelectorAll('input[name="rcBizType"]').length, def:document.querySelector('input[name="rcBizType"]:checked').value, txt:[...document.querySelectorAll('.rt-t b')].map(x=>x.textContent) }));
   console.log(t); ck('three business types, retail preselected', t.n===3 && t.def==='retail' && /Barbershop/.test(t.txt[0]) && /Retail/.test(t.txt[1]) && /Hospitality/.test(t.txt[2])); await ctx.close(); }
 // ---------- retail keeps the full dashboard
 { const p=await signup(b,'retail','Shop One'); const r=await p.evaluate(()=>({ type:window.__t.bizType(), hero:!!document.querySelector('.hero-card'), vq:!!document.querySelector('[data-vq="appts"]') }));
   ck('retail gets the full Pesa dashboard', r.type==='retail' && r.hero && !r.vq); ck('retail: no page errors', p.__errs.length===0); }
 // ---------- barbershop and salon
 { const p=await signup(b,'beauty','Fade Masters'); 
   let r=await p.evaluate(()=>({ type:window.__t.bizType(), vq:!!document.querySelector('[data-vq="appts"]'), txt:document.body.innerText }));
   ck('salon gets its own dashboard', r.type==='beauty' && r.vq && /today.s takings/i.test(r.txt) && /set up services/i.test(r.txt));
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
   ck('hospitality: no page errors', p.__errs.length===0); if(p.__errs.length) console.log(p.__errs.slice(0,3)); }
 await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
