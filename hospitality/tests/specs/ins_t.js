const { chromium } = require('playwright');
(async()=>{ const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'})).newPage(); const e=[]; p.on('pageerror',x=>e.push(x.message));
 await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
 await p.fill('#rcCompanyName','D'); await p.fill('#rcOwnerName','Alice'); await p.fill('#rcOwnerEmail','a@x.com'); await p.fill('#rcOwnerPassword','aaaa1111'); await p.fill('#rcOwnerPassword2','aaaa1111'); await p.click('#rcSubmit');
 await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card'); await p.evaluate(()=>{ try{ window.__t.btSave({ setupHidden:true }); window.__t.pfSave({ remindAt:Date.now() }); }catch(e){} });
 const rows=await p.$$eval('[data-drawer-row]',x=>x.map(r=>r.textContent.trim().replace(/\s+/g,' ')).filter(t=>/Install|Training/.test(t))); console.log(rows);
 await p.evaluate(()=>window.__t.handleDrawerAction('install')); await p.waitForTimeout(500); console.log((await p.innerText('body')).match(/Windows, Mac and Chromebook[\s\S]{0,200}/)?.[0].replace(/\n+/g,' | '));
 await p.screenshot({path:'ins.png'}); console.log(e); await b.close(); })();
