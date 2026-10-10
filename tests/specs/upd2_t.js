const { chromium } = require('playwright');
let fail=0; const ck=(n,c,x)=>{ console.log((c?'  ok   ':'  FAIL ')+n+(!c&&x!==undefined?'  -> '+JSON.stringify(x).slice(0,300):'')); if(!c) fail++; };
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:412,height:900},serviceWorkers:'block'});
 await ctx.addInitScript(()=>{ window.__off=0; const rn=Date.now.bind(Date); Date.now=()=>rn()+window.__off; try{ if(!sessionStorage.getItem('pesa_t_off')) sessionStorage.setItem('pesa_t_off','0'); window.__off=+sessionStorage.getItem('pesa_t_off'); }catch(e){} });
 const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); let loads=0; p.on('load',()=>loads++);
 await p.route('**/version.json*',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({version:'2099.1.1'})}));
 await require('./biz_boot.js')(p,{demo:true}); loads=0;
 const key=()=>p.evaluate(()=>sessionStorage.getItem('pesa_auto_upd_2099.1.1'));
 const age=ms=>p.evaluate(ms=>{ window.__off+=ms; sessionStorage.setItem('pesa_t_off',String(window.__off)); },ms);
 // 1. just used the app: the bar appears but the app does not restart
 await p.evaluate(()=>window.__t.pesaCheckVersion(false)); await p.waitForSelector('#pesaUpdBar',{timeout:5000}); await p.waitForTimeout(1500);
 ck('the update bar shows and the app does not restart while it is in use', (await key())===null && loads===0);
 // 2. a sheet is open and the person has been idle: still no restart
 await p.evaluate(()=>window.__t.openSheet('<div id="tsheet">Editing</div>')); await age(120000); await p.waitForTimeout(16000);
 ck('an open sheet or form is never interrupted', (await key())===null && loads===0 && await p.isVisible('#tsheet'));
 // 3. sheet closed and idle: updates by itself, once
 await p.evaluate(()=>window.__t.closeModal()); await p.waitForTimeout(600); await p.evaluate(()=>{ window.__t.State.cart=[]; });
 const nav=p.waitForEvent('load',{timeout:25000}).catch(()=>null);
 await nav;
 ck('when nothing is open and the person has paused it updates by itself', (await key())==='1' && loads>=1);
 await p.waitForSelector('.hero-card,#rcCompanyName,#loginForm,body',{timeout:8000}); const before=loads; await p.waitForTimeout(4000);
 ck('it does not keep reloading for the same version', loads===before);
 ck('no page errors', errs.length===0, errs);
 await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
