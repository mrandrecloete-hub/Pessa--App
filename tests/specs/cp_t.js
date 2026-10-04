const { chromium } = require('playwright');
(async()=>{
  const b = await chromium.launch();
  // 1. pure sha256 equals built in
  { const ctx = await b.newContext({serviceWorkers:'block'}); const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
    const r = await p.evaluate(async()=>{ const t=window.__t, out=[]; for(const x of ['','abc','aaaa1111','Tr1cky-Pass','ñandú ✓ 日本語','a'.repeat(55),'a'.repeat(56),'a'.repeat(64),'a'.repeat(1000)]){ const a=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x)); const h=Array.from(new Uint8Array(a)).map(v=>v.toString(16).padStart(2,'0')).join(''); out.push(h===t.sha256Pure(x)); } return out; });
    console.log('sha pure matches subtle:', r.every(Boolean), r.length); console.log(errs); await ctx.close(); }
  // 2. no crypto.subtle (plain http address): register, log out, log in
  { const ctx = await b.newContext({serviceWorkers:'block'}); const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    await p.addInitScript(()=>{ try{ Object.defineProperty(window.crypto,'subtle',{value:undefined,configurable:true}); }catch(e){} });
    await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
    console.log('subtle gone:', await p.evaluate(()=>typeof crypto.subtle));
    await p.fill('#rcCompanyName','Dinner Shop'); await p.fill('#rcOwnerName','Alice'); await p.fill('#rcOwnerEmail','a@x.com');
    await p.fill('#rcOwnerPassword','Tr1cky-Pass'); await p.fill('#rcOwnerPassword2','Tr1cky-Pass'); await p.click('#rcSubmit');
    await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card');
    console.log('registered without subtle, hash ok:', await p.evaluate(async()=>{ const u=window.__t.State.users[0]; return u.passHash===window.__t.sha256Pure('Tr1cky-Pass'); }));
    await p.evaluate(()=>window.__t.openCompatSheet()); await p.waitForTimeout(300); console.log((await p.innerText('.sheet')).split('\n').filter(x=>/Secure|secure/.test(x)).slice(0,2));
    console.log(errs); await ctx.close(); }
  // 3. old browser guard: main script cannot be read
  for(const [loc,port] of [['en-US',8934],['af-ZA',8934],['de-DE',8934]]){ const ctx = await b.newContext({serviceWorkers:'block', locale:loc}); const p = await ctx.newPage();
    await p.goto('http://localhost:'+port+'/index.html'); await p.waitForSelector('#pesaOldBrowser',{timeout:6000}); console.log('guard',loc,'->',(await p.innerText('#pesaOldBrowser')).split('\n')[1]); if(loc==='en-US') await p.screenshot({path:'old_browser.png'}); await ctx.close(); }
  // 3b. basics missing (no fetch) -> immediate
  { const ctx = await b.newContext({serviceWorkers:'block'}); const p = await ctx.newPage(); await p.addInitScript(()=>{ delete window.fetch; });
    await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#pesaOldBrowser',{timeout:4000}); console.log('guard shown when fetch missing'); await ctx.close(); }
  // 3c. normal run must NOT show the guard
  { const ctx = await b.newContext({serviceWorkers:'block'}); const p = await ctx.newPage(); await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName'); await p.waitForTimeout(2500); console.log('guard absent in normal run:', (await p.locator('#pesaOldBrowser').count())===0); await ctx.close(); }
  // 4. lite mode (weak computer)
  { const ctx = await b.newContext({serviceWorkers:'block'}); const p = await ctx.newPage();
    await p.addInitScript(()=>{ Object.defineProperty(navigator,'deviceMemory',{value:1,configurable:true}); });
    await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
    console.log('lite auto on weak pc:', await p.evaluate(()=>document.documentElement.className));
    await p.fill('#rcCompanyName','Dinner Shop'); await p.fill('#rcOwnerName','Alice'); await p.fill('#rcOwnerEmail','a@x.com');
    await p.fill('#rcOwnerPassword','Tr1cky-Pass'); await p.fill('#rcOwnerPassword2','Tr1cky-Pass'); await p.click('#rcSubmit');
    await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card');
    await p.click('#settingsBtn'); await p.waitForSelector('#perfLite'); console.log('checkbox reflects auto:', await p.isChecked('#perfLite'));
    await p.uncheck('#perfLite'); console.log('after untick class:', JSON.stringify(await p.evaluate(()=>document.documentElement.className)), 'stored', await p.evaluate(()=>localStorage.getItem('pesa_lite')));
    await p.check('#perfLite'); console.log('after tick:', await p.evaluate(()=>document.documentElement.className));
    await p.click('#acctCompat'); await p.waitForTimeout(300); await p.screenshot({path:'compat_sheet.png'});
    console.log('compat text has Look and speed:', /Look and speed/.test(await p.innerText('.sheet')));
    await ctx.close(); }
  await b.close();
})();
