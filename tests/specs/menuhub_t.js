const { chromium } = require('playwright');
let fail=0; const ck=(n,c,x)=>{ console.log((c?'  ok   ':'  FAIL ')+n+(!c&&x!==undefined?'  -> '+JSON.stringify(x).slice(0,300):'')); if(!c) fail++; };
(async()=>{
  const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:900},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await require('./biz_boot.js')(p,{demo:true});
  const rows=()=>p.evaluate(()=>{ const d=document.createElement('div'); d.innerHTML=window.__t.menuRowsHtml(); return [...d.querySelectorAll('.drawer-row')].map(e=>({ k:e.getAttribute('data-drawer-row'), t:e.textContent.trim().replace(/\s+/g,' '), icon:!!e.querySelector('.ico img, .ico svg') })); });
  let r=await rows(); const keys=r.map(x=>x.k);
  ck('the owner menu is much shorter (was about 30 rows)', r.length<=18, r.length);
  ck('related features are grouped into five pages', ['hub-tools','hub-stock','hub-money','hub-team','hub-pesa'].every(k=>keys.includes(k)));
  ck('the grouped features are no longer in the main list', ['suppliers','pos','wastage','stocktake','vat','accountant','branches','pay','pesaad','smart','agent','bizhub','insights','tab-team','tab-reconcile'].every(k=>!keys.includes(k)));
  ck('everyday rows stay where they were', ['inbox','tab-dashboard','tab-sell','tab-stock','tab-credit','tab-invoices','tab-reports','tab-expenses','tab-till','terminal','settings'].every(k=>keys.includes(k)));
  ck('every row has an icon', r.every(x=>x.icon), r.filter(x=>!x.icon));
  ck('the page rows use the 3D icons like the other rows', await p.evaluate(()=>{ const d=document.createElement('div'); d.innerHTML=window.__t.menuRowsHtml(); return ['hub-tools','hub-stock','hub-money','hub-team','hub-pesa'].every(k=>!!d.querySelector('[data-drawer-row="'+k+'"] .ico.i3d img')); }));
  // open each page in the real menu: every feature is there, with its icon and count, and opens
  const expect={ 'hub-tools':['insights','bizhub','smart','agent'], 'hub-stock':['stocktake','suppliers','pos','wastage'], 'hub-money':['tab-reconcile','vat','accountant'], 'hub-team':['tab-team','branches'], 'hub-pesa':['pay','pesaad'] };
  for(const h of Object.keys(expect)){
    await p.evaluate(()=>window.__t.closeModal()); await p.waitForTimeout(450);
    await p.click('#menuBtn'); await p.waitForSelector('.drawer-row[data-drawer-row="'+h+'"]',{state:'attached'});
    await p.evaluate(h=>document.querySelector('.drawer-row[data-drawer-row="'+h+'"]').click(),h); await p.waitForSelector('.menu-hub',{timeout:4000});
    const got=await p.evaluate(()=>[...document.querySelectorAll('.menu-hub .drawer-row')].map(e=>({ k:e.getAttribute('data-drawer-row'), img:!!e.querySelector('.ico img, .ico svg') })));
    ck(h+' shows '+expect[h].join(', ')+' with icons', JSON.stringify(got.map(x=>x.k))===JSON.stringify(expect[h]) && got.every(x=>x.img), got);
  }
  // a feature opened from a page still works
  await p.evaluate(()=>window.__t.closeModal()); await p.waitForTimeout(450); await p.evaluate(()=>window.__t.openMenuHub('hub-stock')); await p.waitForSelector('.menu-hub'); await p.evaluate(()=>document.querySelector('.menu-hub [data-drawer-row="suppliers"]').click()); await p.waitForTimeout(700);
  ck('Suppliers opens from the Stock and suppliers page', await p.evaluate(()=>/Suppliers/.test(document.body.innerText) && !document.querySelector('.menu-hub')));
  // cashiers and managers
  const asRole=(role)=>p.evaluate(role=>{ const t=window.__t, u=t.State.users.find(x=>x.id===t.State.session.userId), old=u.role; u.role=role; const d=document.createElement('div'); d.innerHTML=t.menuRowsHtml(); const k=[...d.querySelectorAll('.drawer-row')].map(e=>e.getAttribute('data-drawer-row')); u.role=old; return k; },role);
  const cash=await asRole('cashier'); ck('a cashier sees no management pages', !cash.some(k=>/^hub-/.test(k)), cash);
  const mgr=await asRole('manager'); ck('a manager does not see owner only features (Branches, Pay for Pesa) but keeps their pages', mgr.includes('hub-stock') && mgr.includes('hub-tools'));
  ck('a manager never gets owner only items inside a page', await p.evaluate(()=>{ const t=window.__t, u=t.State.users.find(x=>x.id===t.State.session.userId), old=u.role; u.role='manager'; const a=t.menuHubItems('hub-team').map(i=>i.k), c=t.menuHubItems('hub-pesa').map(i=>i.k); u.role=old; return a.join()==='tab-team' && c.join()==='pesaad'; }));
  // Barbershop/Salon and Hospitality keep their own short menu
  await p.evaluate(()=>window.__t.vSetBizType('hospitality')); const hos=await rows();
  ck('hospitality keeps its short menu, with only the pages that apply', hos.map(x=>x.k).includes('hub-money') && hos.map(x=>x.k).includes('hub-team') && !hos.map(x=>x.k).includes('hub-stock') && !hos.map(x=>x.k).includes('hub-tools') && hos.map(x=>x.k).includes('v-bookings'), hos.map(x=>x.k));
  ck('hospitality page items follow the same rule', await p.evaluate(()=>window.__t.menuHubItems('hub-money').map(i=>i.k).join()==='vat,accountant'));
  await p.evaluate(()=>window.__t.vSetBizType('retail'));
  ck('no page errors', errs.length===0, errs);
  await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
