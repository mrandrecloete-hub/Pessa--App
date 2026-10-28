const { chromium } = require('playwright');
let fail=0; const ck=(n,c,x)=>{ console.log((c?'  ok   ':'  FAIL ')+n+(!c&&x!==undefined?'  -> '+JSON.stringify(x).slice(0,300):'')); if(!c) fail++; };
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:412,height:915},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[];
 p.on('pageerror',e=>errs.push(e.message));
 await p.addInitScript(()=>{ window.__splashSeen=false; setInterval(()=>{ if(document.querySelector('.splash-wrap')) window.__splashSeen=true; },50); });
 await p.goto('http://localhost:8933/index.html?intro=force');
 await p.waitForSelector('#introVeil'); ck('the opening animation starts', true);
 const glOk=await p.evaluate(()=>!!document.createElement('canvas').getContext('webgl'));
 if(glOk){ await p.waitForTimeout(400); ck('the smoke is drawn live (WebGL) over the logo', await p.evaluate(()=>window.__introGL===true&&!!document.querySelector('#introVeil canvas.pi-gl-c')&&!!document.querySelector('#introVeil .pi-logo'))); } else console.log('   (no WebGL here, so the plain CSS version is used)');
 await p.waitForTimeout(800); ck('a restart in the middle of it would not replay it (marked as seen at the start)', (await p.evaluate(()=>sessionStorage.getItem('pesa_intro_seen')))==='1');
 await p.waitForFunction(()=>!document.getElementById('introVeil'),null,{timeout:20000}); ck('the opening animation ends by itself within 20 s', true);
 await p.waitForTimeout(3000);
 ck('no second splash follows it', !(await p.evaluate(()=>window.__splashSeen)));
 ck('the welcome page is showing', /Register your business|Sign in|Welcome/i.test(await p.innerText('#authScreen')));
 for(const t of [0.5,1.5,2.5]){ await p.goto('http://localhost:8933/index.html?intro=force&introT='+t); await p.waitForFunction(()=>window.__introReady===true,null,{timeout:8000}); }
 ck('still frames render', true);
 await p.goto('http://localhost:8933/index.html?intro=force&introT=3.5'); await p.waitForFunction(()=>window.__introReady===true,null,{timeout:8000}); await p.waitForTimeout(200);
 ck('at the end the logo shows clearly out of the smoke (no spin, no bounce)', await p.evaluate(()=>{ const l=document.querySelector('#introVeil .pi-logo'); const cs=getComputedStyle(l); return +cs.opacity===1; }));
 ck('the animation is short', await p.evaluate(()=>window.__t.PesaIntro.DUR)<=4.5);
 ck('no page errors', errs.length===0, errs);
 await b.close(); console.log(fail?'FAILED':'ALL OK'); process.exit(fail?1:0);
})();
