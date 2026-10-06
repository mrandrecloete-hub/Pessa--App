const { chromium } = require('playwright');
let fail=0; const ck=(n,c,x)=>{ console.log((c?'  ok   ':'  FAIL ')+n+(!c&&x!==undefined?'  -> '+JSON.stringify(x).slice(0,300):'')); if(!c) fail++; };
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:412,height:915},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await require('./biz_boot.js')(p);
 await p.evaluate(()=>window.__t.openAccountantSheet()); await p.waitForSelector('[data-acdoc]');
 await p.waitForFunction(()=>!/Checking/.test(document.querySelector('#acStatus').textContent),null,{timeout:8000});
 ck('four documents listed', (await p.$$('[data-acdoc]')).length===4);
 const t=await p.innerText('.sheet'); ck('has labelled sections', /More documents/i.test(t)&&/Profit and Loss/i.test(t)&&/Filed months/i.test(t)&&/Settings/i.test(t));
 ck('status shows a result', /All passed|review|Failed/.test(await p.innerText('#acStatus')));

 const L=await p.evaluate(()=>{const f=window.__t.acctVatLatest; const o=(c,y,m,d)=>{const r=f(c,new Date(y,m,d)); return r.start+'>'+r.end+' due '+r.due+' d'+r.days;}; return [o('A',2026,9,5),o('B',2026,9,5),o('A',2027,0,10),o('B',2027,0,10),o('A',2026,0,31)];});
 ck('VAT A period in October', L[0]==='2026-08>2026-09 due 2026-10-25 d20', L[0]);
 ck('VAT B period in October is overdue', L[1]==='2026-07>2026-08 due 2026-09-25 d-10', L[1]);
 ck('VAT A in January crosses the year', L[2]==='2026-10>2026-11 due 2026-12-25 d-16', L[2]);
 ck('VAT B in January crosses the year', L[3]==='2026-11>2026-12 due 2027-01-25 d15', L[3]);
 ck('VAT A on 31 Jan 2026', L[4]==='2025-10>2025-11 due 2025-12-25 d-37', L[4]);
 ck('smart section shows live figures and suggestions', /Your books right now/i.test(await p.innerText('.sheet'))&&/Pesa suggests/i.test(await p.innerText('.sheet'))&&(await p.$$('.ac-tile')).length===6);
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
