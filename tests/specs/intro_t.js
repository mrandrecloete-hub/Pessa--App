const { chromium } = require('playwright');
let fail=0; const ck=(n,c,x)=>{ console.log((c?'  ok   ':'  FAIL ')+n+(!c&&x!==undefined?'  -> '+JSON.stringify(x).slice(0,300):'')); if(!c) fail++; };
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:412,height:915},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[];
 p.on('pageerror',e=>errs.push(e.message));
 await p.addInitScript(()=>{ window.__splashSeen=false; setInterval(()=>{ if(document.querySelector('.splash-wrap')) window.__splashSeen=true; },50); });
 await p.goto('http://localhost:8933/index.html?intro=force');
 await p.waitForSelector('#introVeil'); ck('the opening animation starts', true);
 await p.waitForTimeout(800); ck('a restart in the middle of it would not replay it (marked as seen at the start)', (await p.evaluate(()=>sessionStorage.getItem('pesa_intro_seen')))==='1');
 await p.waitForFunction(()=>!document.getElementById('introVeil'),null,{timeout:20000}); ck('the opening animation ends by itself within 20 s', true);
 await p.waitForTimeout(3000);
 ck('no second splash follows it', !(await p.evaluate(()=>window.__splashSeen)));
 ck('the welcome page is showing', /Register your business|Sign in|Welcome/i.test(await p.innerText('#authScreen')));
 for(const t of [0.5,1.5,2.5]){ await p.goto('http://localhost:8933/index.html?intro=force&introT='+t); await p.waitForFunction(()=>window.__introReady===true,null,{timeout:8000}); }
 ck('still frames render', true);
 ck('no page errors', errs.length===0, errs);
 await b.close(); console.log(fail?'FAILED':'ALL OK'); process.exit(fail?1:0);
})();
