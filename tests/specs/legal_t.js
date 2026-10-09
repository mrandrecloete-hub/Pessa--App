const { chromium } = require('playwright');
(async()=>{
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:430,height:900}, serviceWorkers:'block'});
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
  await p.fill('#rcCompanyName','Dinner Shop'); await p.fill('#rcOwnerName','Alice'); await p.fill('#rcOwnerEmail','a@x.com');
  await p.fill('#rcOwnerPassword','Tr1cky-Pass'); await p.fill('#rcOwnerPassword2','Tr1cky-Pass'); await p.click('#rcSubmit');
  await p.waitForSelector('#cnAgree');
  await p.screenshot({path:'consent.png'});
  await p.click('#cnTerms'); await p.waitForSelector('#cnTermsOk'); console.log('terms in consent', (await p.innerText('.sheet')).slice(0,80).replace(/\n/g,' '));
  await p.click('#cnTermsOk'); await p.waitForTimeout(200);
  await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card'); await p.evaluate(()=>{ try{ window.__t.btSave({ setupHidden:true }); window.__t.pfSave({ remindAt:Date.now() }); }catch(e){} });
  await p.evaluate(()=>window.__t.openLegalSheet()); await p.waitForSelector('[data-legal]'); await p.screenshot({path:'legal_sheet.png'});
  for(const k of ['terms','privacy','refunds','support']){ await p.click('[data-legal="'+k+'"]'); await p.waitForSelector('#lgBack'); const t=await p.innerText('.sheet'); console.log(k, t.length, t.slice(0,40).replace(/\n/g,' ')); if(k==='terms') await p.screenshot({path:'legal_terms.png'}); await p.click('#lgBack'); await p.waitForSelector('[data-legal]'); }
  console.log('settings has legal row', await p.evaluate(()=>{ window.__t.openSettingsSheet(); const r=!!document.querySelector('[data-more="legal"]'); window.__t.closeModal(); return r; }));
  console.log('errs',errs); await b.close();
})();
