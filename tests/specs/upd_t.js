const { chromium } = require('playwright');
let fail=0; const ck=(n,c,x)=>{ console.log((c?'  ok   ':'  FAIL ')+n+(!c&&x!==undefined?'  -> '+JSON.stringify(x).slice(0,300):'')); if(!c) fail++; };
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:412,height:900},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 let newer=true; await p.route('**/version.json*',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({version:newer?'2099.1.1':'1.0.0'})}));
 await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
 ck('compare helper', await p.evaluate(()=>{const t=window.__t; return t.pesaVerNewer('2026.10.75','2026.10.74')&&!t.pesaVerNewer('2026.10.74','2026.10.74')&&!t.pesaVerNewer('2026.9.99','2026.10.1');}));
 await p.evaluate(()=>window.__t.pesaCheckVersion(false)); await p.waitForSelector('#pesaUpdBar',{timeout:5000});
 ck('update bar shown when a newer version exists', await p.isVisible('#pesaUpdBar'));
 await p.click('#pesaUpdX'); ck('bar can be dismissed', !(await p.$('#pesaUpdBar')));
 newer=false; await p.evaluate(()=>window.__t.pesaCheckVersion(false)); await p.waitForTimeout(600);
 ck('no bar when up to date', !(await p.$('#pesaUpdBar')));
 ck('no page errors', errs.length===0, errs);
 await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
