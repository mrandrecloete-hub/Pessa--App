const { chromium } = require('playwright');
let fail=0; const ck=(n,c)=>{ console.log((c?'  ok   ':'  FAIL ')+n); if(!c){fail++;} };
(async()=>{ const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.addInitScript(()=>{ window.__loginSeen=false; const chk=()=>{ const a=document.getElementById('authScreen'); if(a && a.style.display!=='none' && a.querySelector('#loginSubmit,#lgPassword,#lgSubmit,input[type=password]') && !a.querySelector('#rcCompanyName')) window.__loginSeen=true; }; new MutationObserver(chk).observe(document,{childList:true,subtree:true,attributes:true}); });
 await require('./biz_boot.js')(p,{demo:true});
 await p.waitForFunction(()=>window.__t.State.ready.products);
 await p.evaluate(()=>{ const t=window.__t; t.addToCart(t.State.products[0].id); t.addToCart(t.State.products[1].id); });
 const n0 = await p.evaluate(()=>window.__t.State.cart.length);
 // an update reload: stay signed in, no sign in page, sale in progress kept
 await p.evaluate(()=>{ window.__loginSeen=false; window.__t.pesaKeepForReload(); location.reload(); });
 await p.waitForLoadState('load'); await p.waitForTimeout(500);
 await p.waitForFunction(()=>window.__t && window.__t.State.session, null, {timeout:15000}).catch(()=>{});
 const r = await p.evaluate(()=>({ session: !!window.__t.State.session, loginSeen: window.__loginSeen, authShown: getComputedStyle(document.getElementById('authScreen')).display!=='none' }));
 console.log(r);
 ck('still signed in after an update reload', r.session && !r.authShown);
 ck('the sign in page never flashed', !r.loginSeen);
 await p.waitForTimeout(3500);
 const n1 = await p.evaluate(()=>window.__t.State.cart.length);
 ck('sale in progress is kept ('+n0+' items)', n1===n0 && n0>=1);
 // a plain reload while signed in also keeps the sign in
 await p.reload(); await p.waitForFunction(()=>window.__t && window.__t.State.session, null, {timeout:15000}).catch(()=>{});
 ck('plain reload keeps the sign in', await p.evaluate(()=>!!window.__t.State.session));
 ck('no page errors', errs.length===0); if(errs.length) console.log(errs.slice(0,3));
 await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
