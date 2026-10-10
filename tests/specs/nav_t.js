const { chromium } = require('playwright');
let fail=0; const ck=(n,c,x)=>{ console.log((c?'  ok   ':'  FAIL ')+n+(!c&&x!==undefined?'  -> '+JSON.stringify(x).slice(0,300):'')); if(!c) fail++; };
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:412,height:915},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
 await p.fill('#rcCompanyName','Nav'); await p.fill('#rcOwnerName','A'); await p.fill('#rcOwnerEmail','a@x.com'); await p.fill('#rcOwnerPassword','aaaa1111'); await p.fill('#rcOwnerPassword2','aaaa1111'); await p.click('#rcSubmit');
 await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card'); await p.evaluate(()=>{ try{ window.__t.btSave({ setupHidden:true }); window.__t.pfSave({ remindAt:Date.now() }); }catch(e){} });
 ck('top bar gear is gone', !(await p.isVisible('#settingsBtn')));

 await p.waitForTimeout(500);
 const keys=await p.evaluate(()=>{ const t=window.__t, top=[...document.querySelectorAll('#appSidebar [data-drawer-row]')].map(e=>e.getAttribute('data-drawer-row')); return top.concat(...top.filter(k=>/^hub-/.test(k)).map(h=>t.menuHubItems(h).map(i=>i.k))); });
 ck('Settings is the last menu row', (await p.evaluate(()=>{ const r=[...document.querySelectorAll('#appSidebar [data-drawer-row]')]; return r[r.length-1].getAttribute('data-drawer-row'); }))==='settings', keys);
 for(const k of ['audit','security','licence','setup','training','helpsearch','display','compat','pilotform','legal','about']) ck('menu no longer lists '+k, !keys.includes(k));
 for(const k of ['tab-sell','tab-stock','inbox','tab-reports','bizhub','smart','tab-reconcile','suppliers','vat','accountant']) ck('menu still lists '+k, keys.includes(k));
 console.log('   menu rows:',keys.length);
 await p.click('#menuBtn'); await p.waitForTimeout(300); await p.evaluate(()=>[...document.querySelectorAll('[data-drawer-row="settings"]')].filter(e=>e.offsetParent).pop().click()); await p.waitForSelector('.st-grp');
 const more=await p.evaluate(()=>{ [...document.querySelectorAll('.st-grp')].forEach(d=>d.open=true); return [...document.querySelectorAll('[data-more]')].map(e=>e.getAttribute('data-more')); });
 for(const k of ['audit','security','setup','training','helpsearch','display','compat','pilotform','legal','about']) ck('Settings lists '+k, more.includes(k), more);
 for(const k of ['training','legal','about','audit','security','display']){
   await p.evaluate(()=>{ const s=document.querySelector('.st-grp'); }); 
   await p.evaluate(k=>document.querySelector('[data-more="'+k+'"]').click(),k); await p.waitForTimeout(400);
   const open=await p.evaluate(()=>!!document.querySelector('.sheet,.modal'));
   ck(k+' opens from Settings', open);
   await p.evaluate(()=>window.__t.closeModal()); await p.waitForTimeout(150);
   await p.evaluate(()=>window.__t.openSettingsSheet()); await p.waitForTimeout(250);
   await p.evaluate(()=>[...document.querySelectorAll('.st-grp')].forEach(d=>d.open=true));
 }
 ck('no page errors', errs.length===0, errs);
 await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
