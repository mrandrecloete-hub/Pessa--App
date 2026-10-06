const { chromium } = require('playwright');
(async()=>{
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:1100,height:900}, serviceWorkers:'block'}); await ctx.addInitScript(()=>{ try{ new MutationObserver(()=>{ document.querySelectorAll('.st-grp').forEach(d=>{ if(!d.open) d.open=true; }); }).observe(document,{childList:true,subtree:true}); }catch(e){} });
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
  await p.fill('#rcCompanyName','Dinner Shop'); await p.fill('#rcOwnerName','Alice'); await p.fill('#rcOwnerEmail','a@x.com');
  await p.fill('#rcOwnerPassword','aaaa1111'); await p.fill('#rcOwnerPassword2','aaaa1111'); await p.click('#rcSubmit');
  await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card'); await p.evaluate(()=>{ try{ window.__t.btSave({ setupHidden:true }); window.__t.pfSave({ remindAt:Date.now() }); }catch(e){} });
  await p.evaluate(()=>document.getElementById('settingsBtn').click()); await p.waitForSelector('#stDrawerTest');
  const t=await p.innerText('body'); console.log('letterhead mentions:', /letterhead/i.test(t), 'logoInput:', await p.locator('input[type=file]').count());
  await p.evaluate(()=>{ const m=document.querySelector('.modal-body, .sheet, .modal')||document.body; });
  const inp = p.locator('input[type=file]').first();
  const id = await inp.getAttribute('id'); console.log('file input', id);
  const buf = await p.evaluate(()=>{const c=document.createElement('canvas');c.width=200;c.height=80;const x=c.getContext('2d');x.fillStyle='#07a';x.fillRect(0,0,200,80);return c.toDataURL('image/png').split(',')[1];});
  await inp.setInputFiles({name:'l.png',mimeType:'image/png',buffer:Buffer.from(buf,'base64')}); await p.waitForTimeout(800);
  console.log('logo set', await p.evaluate(()=>!!window.__t.State.settings.logoDataUrl), await p.evaluate(()=>window.__t.State.settings.logoImgMeta));
  await p.locator('#settingsSheet, .modal-content').first().screenshot({path:'st.png'}).catch(()=>p.screenshot({path:'st.png'}));
  console.log(errs); await b.close();
})();
