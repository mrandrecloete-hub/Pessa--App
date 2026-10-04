const { chromium } = require('playwright');
const D=(process.env.PESA_OUT||'/tmp/pesa-tests/');
(async()=>{ const b=await chromium.launch(); const e=[];
 for(const [w,h,n] of [[390,844,'m'],[360,740,'s'],[1366,768,'d']]){
  const ctx=await b.newContext({viewport:{width:w,height:h},serviceWorkers:'block',timezoneId:'Africa/Windhoek'}); const p=await ctx.newPage(); p.on('pageerror',x=>e.push(x.message));
  await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
  await p.fill('#rcCompanyName','Dinner Time Foods'); await p.fill('#rcOwnerName','Alice'); await p.fill('#rcOwnerEmail','a@x.com'); await p.fill('#rcOwnerPassword','aaaa1111'); await p.fill('#rcOwnerPassword2','aaaa1111'); await p.click('#rcSubmit');
  await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card'); await p.waitForTimeout(500);
  console.log(n, await p.evaluate(()=>document.getElementById('glassClock').innerText.replace(/\n/g,' | ')), await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
  await p.screenshot({path:D+`gc_${n}.png`,clip:{x:0,y:0,width:w,height:100}});
  await ctx.close(); }
 console.log(e); await b.close(); })();
