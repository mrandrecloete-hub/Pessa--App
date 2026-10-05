const { chromium } = require('playwright');
let fail=0; const ck=(n,c,x)=>{ console.log((c?'  ok   ':'  FAIL ')+n+(!c&&x!==undefined?'  -> '+JSON.stringify(x).slice(0,300):'')); if(!c) fail++; };
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:412,height:915},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await require('./biz_boot.js')(p);
 await p.evaluate(()=>window.__t.openAccountantSheet()); await p.waitForSelector('[data-acdoc]');
 await p.waitForFunction(()=>!/Checking/.test(document.querySelector('#acStatus').textContent),null,{timeout:8000});
 ck('four documents listed', (await p.$$('[data-acdoc]')).length===4);
 const t=await p.innerText('.sheet'); ck('has labelled sections', /Get a document/i.test(t)&&/Filed months/i.test(t)&&/Settings/i.test(t));
 ck('status shows a result', /All passed|review|Failed/.test(await p.innerText('#acStatus')));
 ck('no sideways scroll', await p.evaluate(()=>{const s=document.querySelector('.sheet'); return s.scrollWidth<=s.clientWidth+1;}));
 if(process.env.SHOT) await p.screenshot({path:process.env.SHOT+'/acct_main.png'});
 for(const k of ['pack','journal','tb']){ await p.click('[data-acdoc="'+k+'"]'); await p.waitForSelector('#adPrev'); ck(k+' opens the period picker', !!(await p.$('#adCustom'))&&!!(await p.$('#adPick')));
   if(process.env.SHOT&&k==='pack') await p.screenshot({path:process.env.SHOT+'/acct_pick.png'});
   await p.evaluate(()=>window.__t.closeModal()); await p.evaluate(()=>window.__t.openAccountantSheet()); await p.waitForSelector('[data-acdoc]'); }
 await p.click('[data-acdoc="vat"]'); await p.waitForSelector('#acVatCat'); ck('VAT opens the category chooser', true);
 if(process.env.SHOT) await p.screenshot({path:process.env.SHOT+'/acct_vat.png'});
 ck('no page errors', errs.length===0, errs);
 await b.close(); console.log(fail?'FAILED':'ALL OK'); process.exit(fail?1:0);
})();
