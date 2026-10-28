const { chromium } = require('playwright');
let fail=0; const ck=(n,c,x)=>{ console.log((c?'  ok   ':'  FAIL ')+n+(!c&&x!==undefined?'  -> '+JSON.stringify(x).slice(0,300):'')); if(!c) fail++; };
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:412,height:915},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[];
 p.on('pageerror',e=>errs.push(e.message));
 const at=async t=>{ await p.goto('http://localhost:8933/index.html?bootHold=1&bootT='+t); await p.waitForFunction(()=>window.__bootReady===true,null,{timeout:10000}); return p.evaluate(()=>window.PesaImpact.probe()); };
 let s=await at(0.35);
 ck('the reload screen draws the impact scene on a canvas', await p.evaluate(()=>!!document.querySelector('#pesaBootMsg canvas')));
 ck('the emblem is falling, still above the word', !s.hit && s.embY < s.restY, s);
 s=await at(0.53); ck('the emblem lands on top of the letters', s.hit && Math.abs(s.embY-s.restY)<30, s);
 s=await at(0.8); ck('the word breaks into many pieces that fly apart and spin', s.broke && s.shards>=24 && s.moved>=s.shards*.6 && s.spinning>=s.shards*.4, s);
 ck('dust, sparks and chips are flying', s.parts>150, s.parts);
 s=await at(1.25); ck('pieces have fallen and settle on the floor', s.onFloor>=s.shards*.4, s);
 s=await at(2.3); ck('the word PESA reforms under the emblem', s.reformed && s.hit, s);
 // a normal reload: the screen plays, then fades out by itself once the app is ready, and the app works
 await p.goto('http://localhost:8933/index.html?bootFx=force');
 await p.waitForTimeout(400); ck('on a reload the animation plays', await p.evaluate(()=>!!document.querySelector('#pesaBootMsg.bm-impact canvas')));
 await p.waitForFunction(()=>!document.getElementById('pesaBootMsg'),null,{timeout:6000}); ck('the screen goes away by itself within a few seconds', true);
 await p.waitForFunction(()=>/Register your business|Sign in|Welcome/i.test((document.getElementById('authScreen')||{}).innerText||''),null,{timeout:8000}).catch(()=>{});
 ck('the welcome page is showing', /Register your business|Sign in|Welcome/i.test(await p.innerText('#authScreen')));
 // tap to skip
 await p.goto('http://localhost:8933/index.html?bootFx=force'); await p.waitForTimeout(250);
 await p.mouse.click(200,400); await p.waitForFunction(()=>!document.getElementById('pesaBootMsg'),null,{timeout:2000}); ck('a tap skips it', true);
 ck('no page errors', errs.length===0, errs);
 await b.close(); console.log(fail?'FAILED':'ALL OK'); process.exit(fail?1:0);
})();
