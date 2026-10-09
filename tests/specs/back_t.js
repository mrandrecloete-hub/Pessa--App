const { chromium } = require('playwright');
let fail=0; const ck=(n,c)=>{ console.log((c?'  ok   ':'  FAIL ')+n); if(!c)fail++; };
(async()=>{ const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'})).newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await require('./biz_boot.js')(p); await p.evaluate(()=>{ window.__t.btSave({ setupHidden:true }); window.__t.pfSave({ remindAt:Date.now() }); }); // the first run setup guide opens by itself after about 2 seconds and would race with the sheets below
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
 // regression: Back must never leave the app. A sheet is open but the history entry under it is the base entry (as after rapid open and close).
 await p.evaluate(()=>{ window.__marker='alive'; window.__t.openSettingsSheet(); history.replaceState({pesa:'base'},''); }); await p.waitForTimeout(200);
 await p.evaluate(()=>window.__t.NavBack.back()); await p.waitForTimeout(500);
 ck('Back from a sheet over the base entry closes the sheet', !(await sheet()));
 ck('and the app is still there (no blank page)', await p.evaluate(()=>window.__marker)==='alive');
 await p.evaluate(()=>{ window.__t.openSettingsSheet(); history.replaceState({pesa:'base'},''); window.__t.closeModal(); }); await p.waitForTimeout(500);
 ck('closing a sheet over the base entry does not go back', await p.evaluate(()=>window.__marker)==='alive');
 console.log('errors',errs); console.log(fail?'FAILED':'ALL OK'); await b.close(); })();
