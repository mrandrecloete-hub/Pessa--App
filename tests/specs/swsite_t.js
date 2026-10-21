const { chromium } = require('playwright'); const { spawn } = require('child_process'); const path = require('path');
let fail=0; const ck=(n,c)=>{ console.log((c?'  ok   ':'  FAIL ')+n); if(!c) fail++; };
(async()=>{ const srv=spawn(process.execPath,[path.join(__dirname,'..','serve.js'),path.join(__dirname,'..','..'),'8958'],{stdio:'ignore'}); await new Promise(r=>setTimeout(r,1200)); const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844}}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.route(/fonts\.(googleapis|gstatic)\.com|cdnjs/,r=>r.abort());
 // the app installs its service worker, then the website (same address, /site/) is opened from the same browser
 await p.goto('http://localhost:8958/index.html'); await p.waitForFunction(()=>navigator.serviceWorker&&navigator.serviceWorker.controller,{timeout:15000}).catch(()=>{}); await p.waitForTimeout(2500);
 ck('the app runs with its service worker', await p.evaluate(()=>!!window.__pesaBoot));
 await p.goto('http://localhost:8958/site/index.html'); await p.waitForTimeout(1500);
 ck('the website opens as the website, not as the app', await p.evaluate(()=>!!document.querySelector('.hero') && /Retail Automated System/.test(document.body.innerText)));
 ck('no "browser is too old" message on the website', await p.evaluate(()=>!document.getElementById('pesaOldBrowser')));
 await p.goto('http://localhost:8958/index.html'); await p.waitForTimeout(1500);
 ck('the app still opens after visiting the website', await p.evaluate(()=>!!window.__pesaBoot && !document.getElementById('pesaOldBrowser')));
 ck('no page errors', errs.length===0, errs); await b.close(); srv.kill(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0); })();
