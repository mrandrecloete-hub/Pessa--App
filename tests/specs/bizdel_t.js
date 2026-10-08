const { chromium } = require('playwright');
let fail=0; const ck=(n,c,x)=>{ console.log((c?'  ok   ':'  FAIL ')+n+(!c&&x!==undefined?'  -> '+JSON.stringify(x).slice(0,300):'')); if(!c) fail++; };
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
 await p.fill('#rcCompanyName','Alpha Shop'); await p.fill('#rcOwnerName','Ann'); await p.fill('#rcOwnerEmail','a@x.com'); await p.fill('#rcOwnerPassword','secret99'); await p.fill('#rcOwnerPassword2','secret99'); await p.click('#rcSubmit');
 await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card'); await p.evaluate(()=>{ try{ window.__t.btSave({ setupHidden:true, simpleMode:false }); window.__t.pfSave({ remindAt:Date.now() }); }catch(e){} });
 await p.waitForTimeout(800);
 await p.evaluate(()=>window.__t.startNewBusiness()); await p.waitForSelector('#rcCompanyName'); await p.waitForTimeout(800);
 ck('delete button shown on register page', await p.isVisible('[data-wsdel]'));
 await p.click('[data-wsdel]'); await p.waitForSelector('#dbPass');
 await p.fill('#dbPass','wrongpass'); await p.click('#dbGo'); await p.waitForTimeout(600);
 ck('wrong password refused', (await p.innerText('#dbErr')).length>0 && await p.isVisible('[data-wsdel]',{timeout:100}).catch(()=>true));
 const still=await p.evaluate(()=>window.__t.WS.others().length); ck('business still there', still===1, still);
 await p.fill('#dbPass','secret99'); await p.click('#dbGo');
 await p.waitForLoadState('load'); await p.waitForSelector('#rcCompanyName'); await p.waitForTimeout(1200);
 const after=await p.evaluate(()=>({o:window.__t.WS.others().length, l:window.__t.WS.list().map(x=>x.name)}));
 ck('business deleted', after.o===0, after);
 ck('no delete button left', !(await p.isVisible('[data-wsdel]')));
 // current business on the sign-in page
 await p.fill('#rcCompanyName','Beta Shop'); await p.fill('#rcOwnerName','Ben'); await p.fill('#rcOwnerPassword','beta1234'); await p.fill('#rcOwnerPassword2','beta1234'); await p.click('#rcSubmit');
 await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card'); await p.evaluate(()=>{ try{ window.__t.btSave({ setupHidden:true, simpleMode:false }); window.__t.pfSave({ remindAt:Date.now() }); }catch(e){} }); await p.waitForTimeout(800);
 await p.evaluate(()=>window.__t.openSettingsSheet()); await p.waitForSelector('#stDelBiz',{timeout:15000}).catch(()=>{});
 ck('the owner finds Delete this business in Settings', await p.isVisible('#stDelBiz'));
 await p.evaluate(()=>window.__t.signedOutPending=false);
 if(await p.isVisible('#stDelBiz')){ await p.click('#stDelBiz'); await p.waitForSelector('#dbPass'); await p.fill('#dbPass','beta1234'); await p.click('#dbGo'); await p.waitForLoadState('load'); await p.waitForSelector('#rcCompanyName',{timeout:15000}); await p.waitForTimeout(800);
  const gone=await p.evaluate(()=>window.__t.WS.list().filter(x=>x.name).length); ck('current business deleted, back to register', gone===0, gone); }
 ck('no page errors', errs.length===0, errs);
 await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
