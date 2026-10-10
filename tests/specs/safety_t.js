const { chromium } = require('playwright');
let fail=0; const ck=(n,c,x)=>{ console.log((c?'  ok   ':'  FAIL ')+n+(!c&&x!==undefined?'  -> '+JSON.stringify(x).slice(0,300):'')); if(!c) fail++; };
(async()=>{
  const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1200,height:900},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await require('./biz_boot.js')(p,{demo:true});
  const T=(f,...a)=>p.evaluate(([f,a])=>{ const v=window.__t[f]; return typeof v==='function'? v.apply(null,a) : v; },[f,a]);
  const dash=async()=>{ await p.evaluate(()=>window.__t.render()); await p.waitForTimeout(300); };
  ck('a new shop has no copy outside this device', (await T('bkOutsideSafe')).safe===false);
  await dash(); ck('the dashboard warns that the data is only on this computer', await p.isVisible('#bkSafeBanner') && /only on this computer/.test(await p.innerText('#bkSafeBanner')));
  ck('the alert centre lists it too', (await T('smartAlerts')).some(a=>a.id==='noextcopy'));
  await p.click('[data-bksafe=later]'); ck('Remind me tomorrow hides the warning for a day', (await p.locator('#bkSafeBanner').count())===0);
  await p.evaluate(()=>{ Object.keys(localStorage).filter(k=>k.indexOf('pesa_bk_later_')===0).forEach(k=>localStorage.removeItem(k)); });
  // an outside copy is made: the warning goes away
  await p.evaluate(()=>window.__t.bkMarkOutside()); await dash();
  ck('a copy that left the device clears the warning', (await T('bkOutsideSafe')).safe===true && (await p.locator('#bkSafeBanner').count())===0 && !(await T('smartAlerts')).some(a=>a.id==='noextcopy'));
  // the copy gets old
  await p.evaluate(()=>{ const k=Object.keys(localStorage).find(k=>k.indexOf('pesa_ext_copy_')===0); localStorage.setItem(k,String(Date.now()-15*86400000)); }); ck('a copy older than 14 days no longer counts', (await T('bkOutsideSafe')).safe===false);
  // folder permission lapses
  await p.evaluate(()=>{ window.__t._bkSafety.folder='permission'; }); await dash();
  ck('a lapsed folder permission is a clear red warning with an Allow button', await p.isVisible('#bkSafeBanner') && /needs your permission/.test(await p.innerText('#bkSafeBanner')) && (await p.locator('[data-bksafe=allow]').count())===1);
  ck('and an alert', (await T('smartAlerts')).some(a=>a.id==='folderperm' && a.level==='high'));
  await p.evaluate(()=>{ window.__t._bkSafety.folder='ready'; }); await p.evaluate(()=>{ const k=Object.keys(localStorage).find(k=>k.indexOf('pesa_ext_copy_')===0); if(k) localStorage.removeItem(k); });
  // cloud sync counts as a safe copy
  await p.evaluate(()=>{ const t=window.__t; t.Sync.status=function(){ return { state:'ok' }; }; }); ck('cloud sync counts as a copy outside the device', (await T('bkOutsideSafe')).safe===true);
  // staff are not nagged
  await p.evaluate(()=>{ window.__t.Sync.status=function(){ return { state:'off' }; }; });
  ck('cashiers never see the warning', await p.evaluate(()=>{ const t=window.__t, u=t.State.users.find(x=>x.id===t.State.session.userId), r=u.role; u.role='cashier'; const h=t.bkBannerHtml(); u.role=r; return h===''; }));
  ck('no page errors', errs.length===0, errs);
  await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
