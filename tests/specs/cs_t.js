const { chromium } = require('playwright');
(async()=>{
  const b = await chromium.launch();
  for(const [n,w,h] of [['desk',1280,800],['mob',390,844]]){
    const ctx = await b.newContext({viewport:{width:w,height:h}, serviceWorkers:'block'});
    const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
    await p.fill('#rcCompanyName','Dinner Shop'); await p.fill('#rcOwnerName','Alice'); await p.fill('#rcOwnerEmail','a@x.com');
    await p.fill('#rcOwnerPassword','aaaa1111'); await p.fill('#rcOwnerPassword2','aaaa1111'); await p.click('#rcSubmit');
    await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card');
    if(n==='mob'){ await p.click('#menuBtn'); await p.waitForTimeout(500); }
    await p.waitForTimeout(600); await p.evaluate(()=>{ const el=document.querySelector(n_sel()); function n_sel(){return window.innerWidth>=1024?'#appSidebar':'.drawer';} const e=document.querySelector(window.innerWidth>=1024?'#appSidebar':'.drawer'); if(e) e.scrollTop=e.scrollHeight; const d=document.querySelector('.soon'); if(d) d.scrollIntoView(); });
    await p.waitForTimeout(300);
    console.log(n, await p.locator('.soon').count(), await p.locator('.soon').first().isVisible());
    await p.screenshot({path:'cs_'+n+'.png'}); console.log(errs); await ctx.close();
  }
  await b.close();
})();
