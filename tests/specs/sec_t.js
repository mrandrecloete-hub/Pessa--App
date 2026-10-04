const { chromium } = require('playwright');
(async()=>{
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:1100,height:900}, serviceWorkers:'block'});
  const p = await ctx.newPage(); const errs=[], cons=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{ if(/Content Security Policy|Refused to/i.test(m.text())) cons.push(m.text().slice(0,160)); });
  await p.addInitScript(()=>{ window.__csp=[]; window.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective+' '+e.blockedURI)); });
  await p.clock.install();
  await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
  console.log('csp meta', await p.evaluate(()=>{const m=document.querySelector('meta[http-equiv="Content-Security-Policy"]');return !!m && m.content.length}));
  // password rules at registration
  await p.fill('#rcCompanyName','Dinner Shop'); await p.fill('#rcOwnerName','Alice'); await p.fill('#rcOwnerEmail','a@x.com');
  for(const bad of ['abc','password','aaaaaaaa']){ await p.fill('#rcOwnerPassword',bad); await p.fill('#rcOwnerPassword2',bad); await p.click('#rcSubmit'); await p.waitForTimeout(150); console.log('reg', bad, '->', (await p.innerText('#rcError')).trim()); }
  await p.fill('#rcOwnerPassword','Tr1cky-Pass'); await p.fill('#rcOwnerPassword2','Tr1cky-Pass'); await p.click('#rcSubmit');
  await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card');
  // exercise features for CSP
  await p.evaluate(async()=>{ const r=window.__t.refs; await r.products.doc().set({name:'Milk',sellPrice:30,costPrice:20,stockQty:50,createdAt:new Date().toISOString()}); });
  for(const tab of ['sell','stock','credit','invoices','reports','expenses','till','dashboard']){ await p.evaluate(t=>window.__t.setTab(t),tab); await p.waitForTimeout(150); }
  await p.evaluate(async()=>{ await window.__t.ensureJsPDF(); const d={number:'INV-1',dateStr:'2026-10-03',billToName:'Bob',items:[{desc:'Milk',name:'Milk',qty:1,unitPrice:30}],notes:''}; window.__t.buildInvoicePdf(d).output('datauristring'); window.__t.buildReceiptPdf(d).output('bloburl'); });
  await p.click('#settingsBtn'); await p.waitForTimeout(500); await p.evaluate(()=>window.__t.closeModal());
  await p.evaluate(()=>window.__t.openSmartToolsSheet()); await p.waitForTimeout(300); await p.evaluate(()=>window.__t.closeModal());
  await p.evaluate(()=>window.__t.posOpen()); await p.waitForTimeout(400); await p.evaluate(()=>{window.__t.closeModal(); window.__t.POS.open=false; document.getElementById('posRoot').style.display='none';});
  console.log('CSP violations after features:', JSON.stringify(await p.evaluate(()=>window.__csp)), cons);
  // security sheet
  await p.evaluate(()=>window.__t.openSecuritySheet()); await p.waitForSelector('#secIdle'); await p.screenshot({path:'sec_sheet.png'});
  await p.selectOption('#secIdle','5'); await p.waitForTimeout(400); console.log('autoLogoutMin', await p.evaluate(()=>window.__t.State.settings.autoLogoutMin));
  await p.evaluate(()=>window.__t.closeModal());
  // idle auto sign-out
  await p.clock.fastForward('06:00'); await p.waitForTimeout(500);
  console.log('after idle: signed out?', await p.evaluate(()=>!window.__t.State.session), 'login/signedout screen', await p.locator('#soLoginBtn,[data-staff]').count());
  console.log('audit has auto sign out', await p.evaluate(()=>window.__t.State.auditLog.some(a=>/automatically/.test(a.summary||''))));
  // lockout
  await p.click('#soLoginBtn'); await p.waitForSelector('[data-staff]'); await p.click('[data-staff]'); await p.waitForSelector('#loginPass');
  const att = async(v)=>{ await p.fill('#loginPass',v); await p.click('#loginUnlockBtn'); await p.waitForTimeout(350); return (await p.innerText('#loginError')).trim(); };
  console.log('wrong1:', await att('nope1111')); console.log('wrong2:', await att('nope2222')); console.log('wrong3:', await att('nope3333'));
  console.log('right while locked:', await att('Tr1cky-Pass')); console.log('still signed out', await p.evaluate(()=>!window.__t.State.session));
  console.log('audit lock entry', await p.evaluate(()=>window.__t.State.auditLog.some(a=>/Sign in locked/.test(a.summary||''))));
  await p.screenshot({path:'sec_lock.png'});
  // after lock expires
  await p.clock.fastForward('01:05'); await p.fill('#loginPass','Tr1cky-Pass'); await p.click('#loginUnlockBtn'); await p.waitForSelector('.hero-card',{timeout:5000}); console.log('signed in after lock expired');
  console.log('final CSP violations', JSON.stringify(await p.evaluate(()=>window.__csp)), 'errs', errs);
  await b.close();
})();
