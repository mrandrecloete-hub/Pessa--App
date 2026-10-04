const { chromium } = require('playwright');
let fail=0; const ck=(n,c)=>{ console.log((c?'  ok   ':'  FAIL ')+n); if(!c)fail++; };
(async()=>{ const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'})).newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await require('./biz_boot.js')(p);
 const tab=()=>p.evaluate(()=>window.__t.State.tab), sheet=()=>p.evaluate(()=>!!document.querySelector('#modalRoot .sheet')), hl=()=>p.evaluate(()=>history.length);
 ck('start on dashboard', await tab()==='dashboard');
 ck('no back button on home', await p.evaluate(()=>getComputedStyle(document.getElementById('backBtn')).display==='none'));
 await p.evaluate(()=>window.__t.setTab('stock')); await p.waitForTimeout(200);
 ck('back button on other page', await p.evaluate(()=>getComputedStyle(document.getElementById('backBtn')).display!=='none'));
 await p.evaluate(()=>window.__t.openSettingsSheet()); await p.waitForTimeout(300);
 ck('sheet has Back row', await p.locator('.sheet-backrow').count()===1);
 await p.goBack(); await p.waitForTimeout(300);
 ck('device Back closes the sheet, stays on page', !(await sheet()) && await tab()==='stock');
 await p.goBack(); await p.waitForTimeout(300);
 ck('device Back returns to dashboard', await tab()==='dashboard');
 // sheet via visible Back row then device history clean
 await p.evaluate(()=>window.__t.openSettingsSheet()); await p.waitForTimeout(300);
 await p.click('.sheet-backrow'); await p.waitForTimeout(400);
 ck('Back row closes sheet', !(await sheet()));
 // programmatic close then tab change
 await p.evaluate(()=>{ window.__t.openSettingsSheet(); }); await p.waitForTimeout(200);
 await p.evaluate(()=>{ window.__t.closeModal(); window.__t.setTab('credit'); }); await p.waitForTimeout(400);
 ck('closing then switching page works', await tab()==='credit' && !(await sheet()));
 await p.click('#backBtn'); await p.waitForTimeout(400);
 ck('top Back button goes to previous page', await tab()==='dashboard');
 // sheet to sheet
 await p.evaluate(()=>window.__t.openSettingsSheet()); await p.waitForTimeout(200);
 await p.evaluate(()=>{ window.__t.closeModal(); window.__t.openTrainingSheet(); }); await p.waitForTimeout(400);
 ck('sheet to sheet stays open', await sheet());
 await p.goBack(); await p.waitForTimeout(300);
 ck('one device Back closes it', !(await sheet()) && await tab()==='dashboard');
 console.log('errors',errs); console.log(fail?'FAILED':'ALL OK'); await b.close(); })();
