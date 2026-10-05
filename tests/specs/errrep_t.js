const { chromium } = require('playwright');
let fail=0; const ck=(n,c,x)=>{ console.log((c?'  ok   ':'  FAIL ')+n+(!c&&x!==undefined?'  -> '+JSON.stringify(x).slice(0,200):'')); if(!c) fail++; };
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:412,height:915},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await require('./biz_boot.js')(p);
 await p.evaluate(()=>window.__t.openLegalSheet()); await p.waitForTimeout(200);
 ck('no error button when there is no error', !(await p.$('#lgErrReport')));
 await p.evaluate(()=>{ window.__t.closeModal(); localStorage.setItem('pesa_lasterr','2026-10-05T10:00:00Z TypeError: x is undefined @ index.html:1'); window.__t.openLegalSheet(); }); await p.waitForSelector('#lgErrReport');
 const href=await p.getAttribute('#lgErrReport','href'); const txt=decodeURIComponent(href.split('text=')[1]||'');
 ck('opens WhatsApp to the Pesa number', /wa\.me\/264/.test(href), href);
 ck('message has version, error and browser', /Version 2026/.test(txt)&&/TypeError/.test(txt)&&/Browser:/.test(txt), txt);
 ck('message carries no shop records', !/Test Bakery|owner@test/.test(txt), txt);
 ck('no page errors', errs.length===0, errs);
 await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
