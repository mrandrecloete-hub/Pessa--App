const { chromium } = require('playwright'); const fs=require('fs');
const D=(process.env.PESA_OUT||require('os').tmpdir()+'/pesa-tests/');
(async()=>{
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:390,height:900}, serviceWorkers:'block'}); await ctx.addInitScript(()=>{ try{ new MutationObserver(()=>{ document.querySelectorAll('.st-grp').forEach(d=>{ if(!d.open) d.open=true; }); }).observe(document,{childList:true,subtree:true}); }catch(e){} });
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
  await p.fill('#rcCompanyName','Dinner'); await p.fill('#rcOwnerName','Alice'); await p.fill('#rcOwnerEmail','a@x.com');
  await p.fill('#rcOwnerPassword','aaaa1111'); await p.fill('#rcOwnerPassword2','aaaa1111'); await p.click('#rcSubmit');
  await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card'); await p.evaluate(()=>{ try{ window.__t.btSave({ setupHidden:true }); window.__t.pfSave({ remindAt:Date.now() }); }catch(e){} });
  await p.evaluate(async()=>{ const r=window.__t.refs; await r.products.doc().set({name:'Bread',sellPrice:17.99,costPrice:13,stockQty:2,createdAt:new Date().toISOString()}); });
  const txt = async()=> (await p.evaluate(()=>document.body.innerText)).slice(0,400).replace(/\n+/g,' | ');
  console.log('EN:', await txt());
  // via the settings UI
  await p.evaluate(()=>document.getElementById('settingsBtn').click()); await p.waitForSelector('#stLang'); 
  await p.selectOption('#stLang','de'); await p.click('#stSave'); await p.waitForTimeout(800);
  console.log('DE:', await txt()); await p.screenshot({path:D+'lang_de.png'});
  await p.evaluate(()=>document.getElementById('settingsBtn').click()); await p.waitForSelector('#stLang'); await p.waitForTimeout(300); await p.screenshot({path:D+'lang_de_settings.png'});
  await p.selectOption('#stLang','af'); await p.click('#stSave'); await p.waitForTimeout(800);
  console.log('AF:', await txt()); await p.screenshot({path:D+'lang_af.png'});
  await p.evaluate(()=>document.getElementById('settingsBtn').click()); await p.waitForSelector('#stLang'); await p.selectOption('#stLang','en'); await p.click('#stSave'); await p.waitForTimeout(800);
  console.log('EN again:', await txt());
  // PDFs in German
  await p.evaluate(()=>{ const S=window.__t.State; S.settings=Object.assign({},S.settings,{language:'de'}); });
  const out = await p.evaluate(async()=>{ await window.__t.ensureJsPDF(); const d={number:'INV-1',billToName:'Mama',billToContact:'',dateStr:new Date().toISOString().slice(0,10),dueDateStr:'',notes:'',payMethod:'cash',received:100,items:[{desc:'Bread',qty:2,unitPrice:20}]};
    return [window.__t.buildInvoicePdf(d).output('datauristring').split(',')[1], window.__t.buildReceiptPdf(d).output('datauristring').split(',')[1], window.__t.generateAboutPdf().doc.output('datauristring').split(',')[1]]; });
  ['inv','rec','about'].forEach((n,i)=>fs.writeFileSync(D+'de_'+n+'.pdf',Buffer.from(out[i],'base64')));
  console.log(errs); await b.close();
})();
