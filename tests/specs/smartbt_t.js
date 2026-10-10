const { chromium } = require('playwright');
let fail=0; const ck=(n,c)=>{ console.log((c?'  ok   ':'  FAIL ')+n); if(!c){fail++;} };
(async()=>{
  const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:900},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await require('./biz_boot.js')(p,{demo:true});
  const T=(f,...a)=>p.evaluate(([f,a])=>{ const r=window.__t[f].apply(null,a); return r; },[f,a]);
  ck('a new retail shop with no history gets no suggestion', (await T('bizTypeSuggest'))===null);
  // a retail shop that was set to Hospitality by mistake: lots of sales, no rooms
  await p.evaluate(()=>{ const t=window.__t; t.vSetBizType('hospitality'); const iso=new Date().toISOString(); t.State.sales=Array.from({length:12},(_,i)=>({id:'s'+i,total:20,createdAt:iso,items:[]})); });
  const s1 = await T('bizTypeSuggest'); ck('suggests Retail for a hospitality shop that only sells stock', s1 && s1.type==='retail');
  await p.evaluate(()=>window.__t.render()); await p.waitForSelector('#btSmartCard');
  ck('owner sees the card on the dashboard', true);
  // employees do not get asked
  const staffCard = await p.evaluate(()=>{ const t=window.__t, u=t.State.users.find(x=>x.id===t.State.session.userId), r=u.role; u.role='cashier'; const h=t.vSmartTypeCard(); u.role=r; return h; });
  ck('employees are not asked', staffCard==='');
  // keep it dismisses
  await p.click('[data-btsmart=keep]'); await p.waitForTimeout(150);
  ck('Keep it as it is hides the card', (await p.locator('#btSmartCard').count())===0 && (await p.evaluate(()=>window.__t.vSmartTypeCard()))==='');
  await p.evaluate(()=>{ Object.keys(localStorage).filter(k=>k.indexOf('pesa_bt_nudge_')===0).forEach(k=>localStorage.removeItem(k)); window.__t.render(); }); await p.waitForSelector('#btSmartCard');
  await p.click('[data-btsmart=accept]'); await p.waitForTimeout(300);
  ck('accepting switches the saved type to Retail for everyone', await p.evaluate(()=>{ const t=window.__t; return t.bizType()==='retail' && t.State.company.businessType==='retail' && !!t.State.company.businessTypeAt; }));
  await p.evaluate(()=>window.__t.vSetBizType('hospitality'));
  ck('an owner sees the Business type row at the top of a non retail menu', await p.evaluate(()=>{ const d=document.createElement('div'); d.innerHTML=window.__t.menuRowsHtml(); const rows=[...d.querySelectorAll('.drawer-row,.drawer-sub')].map(e=>e.textContent.trim()); return /Business type: Hospitality/.test(rows[2]||rows[1]||''); }));
  ck('a cashier does not see that row', await p.evaluate(()=>{ const t=window.__t, u=t.State.users.find(x=>x.id===t.State.session.userId), r=u.role; u.role='cashier'; const h=t.vertMenuRows(); u.role=r; return !/Business type:/.test(h); }));
  await p.evaluate(()=>window.__t.vSetBizType('retail'));
  ck('retail menu has no hospitality pages', await p.evaluate(()=>!/Room bookings|Tables and tabs|Licences and levy/.test(window.__t.menuRowsHtml())));
  // data that really is hospitality
  await p.evaluate(()=>{ const t=window.__t; t.State.hosRooms=[{id:'r1',name:'Room 1',active:true}]; });
  const s2 = await T('bizTypeSuggest'); ck('rooms point to Hospitality', s2 && s2.type==='hospitality');
  await p.evaluate(()=>{ const t=window.__t; t.State.hosRooms=[]; t.State.appointments=[{id:'a1'}]; });
  const s3 = await T('bizTypeSuggest'); ck('appointments point to Barbershop and Salon', s3 && s3.type==='beauty');
  ck('no page errors', errs.length===0); if(errs.length) console.log(errs.join(' | '));
  await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
