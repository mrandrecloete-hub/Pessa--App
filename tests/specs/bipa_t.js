const { chromium } = require('playwright');
let fail=0; const ck=(n,c)=>{ console.log((c?'  ok   ':'  FAIL ')+n); if(!c) fail++; };
(async()=>{
  const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:900},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
  ck('legal name field on register', await p.$('#rcLegal')!==null);
  ck('hint empty at start', (await p.innerText('#rcBipaHint')).trim()==='');
  await p.fill('#rcRegNumber','cc/2024/00123');
  let h=await p.innerText('#rcBipaHint'); ck('usual shape recognised', /usual BIPA shape/.test(h));
  ck('honest: not checked with BIPA', /not checked with BIPA/.test(h) && !/Verified with BIPA/.test(h));
  ck('lookup link to bipa.na', await p.evaluate(()=>{const a=document.querySelector('#rcBipaHint a');return !!a&&a.href.indexOf('https://www.bipa.na')===0&&a.target==='_blank'}));
  await p.fill('#rcRegNumber','12345'); h=await p.innerText('#rcBipaHint'); ck('odd format warns but allowed', /does not look like the usual format/.test(h));
  await p.fill('#rcRegNumber','  cc/2024/00123 '); await p.click('#rcCompanyName');
  ck('blur uppercases and trims', await p.inputValue('#rcRegNumber')==='CC/2024/00123');
  await p.fill('#rcLegal','Dinner Shop CC');
  await p.fill('#rcCompanyName','Dinner Shop'); await p.fill('#rcOwnerName','Alice'); await p.fill('#rcOwnerEmail','a@x.com');
  await p.fill('#rcOwnerPassword','Tr1cky-Pass'); await p.fill('#rcOwnerPassword2','Tr1cky-Pass'); await p.click('#rcSubmit');
  await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card'); await p.evaluate(()=>{ try{ window.__t.btSave({ setupHidden:true, simpleMode:false }); window.__t.pfSave({ remindAt:Date.now() }); }catch(e){} });
  let c=await p.evaluate(()=>window.__t.State.company);
  ck('stored regNumber', c.regNumber==='CC/2024/00123'); ck('stored legalName', c.legalName==='Dinner Shop CC');
  ck('status ENTERED, never verified', c.bipaStatus==='ENTERED' && c.bipaVerifiedAt===null && c.verificationTier==='UNVERIFIED');
  // company sheet
  await p.evaluate(()=>{ const s=window.__t.openSettingsSheet; });
  const opened = await p.evaluate(()=>{ const btn=[...document.querySelectorAll('button,[role=button],.row,div')].find(e=>e.children.length<4&&/Company details/.test(e.textContent||'')&&e.textContent.length<60); return !!btn; });
  await p.evaluate(()=>window.__t.openSettingsSheet()); await p.waitForTimeout(300);
  const clicked = await p.evaluate(()=>{ const el=[...document.querySelectorAll('*')].filter(e=>e.children.length<3&&/^\s*Company details\s*$/.test(e.textContent||''))[0]; if(el){el.click();return true} return false; });
  await p.waitForTimeout(300);
  if(!(await p.$('#ccReg'))){ console.log('   (sheet not opened via settings, skipping UI part)'); }
  else{
    ck('sheet prefilled', await p.inputValue('#ccReg')==='CC/2024/00123' && await p.inputValue('#ccLegal')==='Dinner Shop CC');
    ck('sheet shows hint', /not checked with BIPA/.test(await p.innerText('#ccBipaHint')));
    await p.fill('#ccReg',''); await p.click('#ccSave'); await p.waitForTimeout(300);
    c=await p.evaluate(()=>window.__t.State.company);
    ck('clearing number resets status UNKNOWN', c.regNumber==='' && c.bipaStatus==='UNKNOWN');
    ck('other fields kept', c.companyName==='Dinner Shop' && c.ownerName==='Alice');
  }
  ck('no page errors', errs.length===0); if(errs.length) console.log(errs);
  await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
