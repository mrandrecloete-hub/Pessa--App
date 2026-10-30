const { chromium } = require('playwright');
let fail=0; const ck=(n,c,x)=>{ console.log((c?'  ok   ':'  FAIL ')+n+(!c&&x!==undefined?'  -> '+JSON.stringify(x).slice(0,300):'')); if(!c) fail++; };
(async()=>{
  const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1200,height:900},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await require('./biz_boot.js')(p,{demo:true});
  const T=(f,...a)=>p.evaluate(([f,a])=>{ const v=window.__t[f]; return typeof v==='function'? v.apply(null,a) : v; },[f,a]);
  const dash=async()=>{ await p.evaluate(()=>window.__t.render()); await p.waitForTimeout(300); };
  ck('a new shop has no copy outside this device', (await T('bkOutsideSafe')).safe===false);
  await dash(); ck('the dashboard has no safe copy banner', (await p.locator('#bkSafeBanner').count())===0 && (await T('bkBannerHtml'))==='');
  ck('the alert centre has no backup entries', !(await T('smartAlerts')).some(a=>['noextcopy','nobackup','oldbackup','folderperm'].includes(a.id)));
  await p.evaluate(()=>{ window.__t._bkSafety.folder='permission'; }); await dash();
  ck('even a lapsed folder permission shows nothing on the dashboard or alerts', (await p.locator('#bkSafeBanner').count())===0 && !(await T('smartAlerts')).some(a=>a.id==='folderperm'));
  await p.evaluate(()=>{ window.__t._bkSafety.folder='ready'; });
  await p.evaluate(()=>window.__t.bkMarkOutside());
  ck('a copy that left the device still counts', (await T('bkOutsideSafe')).safe===true);
  await p.evaluate(()=>{ window.__t.Sync.status=function(){ return { state:'ok' }; }; }); ck('cloud sync counts as a copy outside the device', (await T('bkOutsideSafe')).safe===true);
  ck('no page errors', errs.length===0, errs);
  await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
