const { chromium } = require('playwright'); const fs=require('fs');
const D=(process.env.PESA_OUT||require('os').tmpdir()+'/pesa-tests/');
(async()=>{
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:390,height:900}, serviceWorkers:'block'});
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
  await p.fill('#rcCompanyName','Dinner'); await p.fill('#rcOwnerName','Alice'); await p.fill('#rcOwnerEmail','a@x.com');
  await p.fill('#rcOwnerPassword','aaaa1111'); await p.fill('#rcOwnerPassword2','aaaa1111'); await p.click('#rcSubmit');
  await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card'); await p.evaluate(()=>{ try{ window.__t.btSave({ setupHidden:true, simpleMode:false }); window.__t.pfSave({ remindAt:Date.now() }); }catch(e){} });
  await p.evaluate(()=>window.__t.openAboutSheet()); await p.waitForTimeout(500);
  const h = await p.evaluate(()=>{ const s=document.querySelector('.sheet')||document.querySelector('#modalRoot'); const sc=[...document.querySelectorAll('#modalRoot *')].find(e=>e.scrollHeight>e.clientHeight+50&&getComputedStyle(e).overflowY!=='visible'); return sc? sc.scrollHeight:0; });
  console.log('scrollH',h);
  await p.screenshot({path:D+'about_a1.png'});
  await p.evaluate(()=>{ const sc=[...document.querySelectorAll('#modalRoot *')].find(e=>e.scrollHeight>e.clientHeight+50&&getComputedStyle(e).overflowY!=='visible'); sc.scrollTop=1100; }); await p.waitForTimeout(200); await p.screenshot({path:D+'about_a2.png'});
  const pdf = await p.evaluate(async()=>{ await window.__t.ensureJsPDF(); return window.__t.generateAboutPdf().doc.output('datauristring').split(',')[1]; });
  fs.writeFileSync(D+'about_en.pdf',Buffer.from(pdf,'base64')); console.log(errs); await b.close();
})();
