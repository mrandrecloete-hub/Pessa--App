const { chromium } = require('playwright');
(async()=>{
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:1280,height:800}, serviceWorkers:'block'});
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
  await p.fill('#rcCompanyName','Dinner Shop'); await p.fill('#rcOwnerName','Alice'); await p.fill('#rcOwnerEmail','a@x.com');
  await p.fill('#rcOwnerPassword','aaaa1111'); await p.fill('#rcOwnerPassword2','aaaa1111'); await p.click('#rcSubmit');
  await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card');
  await p.waitForTimeout(800);
  console.log(await p.evaluate(()=>{ const i=document.querySelector('#appSidebar .soon img'); const sb=document.getElementById('appSidebar'); return {has:!!i, nat:i&&i.naturalWidth, w:i&&i.clientWidth, h:i&&i.clientHeight, sh:sb.scrollHeight, ch:sb.clientHeight}; }));
  await p.evaluate(()=>{ const sb=document.getElementById('appSidebar'); sb.scrollTop=sb.scrollHeight; }); await p.waitForTimeout(300);
  console.log(await p.evaluate(()=>{const sb=document.getElementById('appSidebar');const i=sb.querySelector('.soon');const r=i.getBoundingClientRect();return {st:sb.scrollTop,top:r.top,h:r.height,kids:sb.children.length}})); await p.screenshot({path:'cs_desk.png',clip:{x:0,y:0,width:640,height:800}}); console.log(errs); await b.close();
})();
