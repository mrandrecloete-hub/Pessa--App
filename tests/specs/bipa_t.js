// Registration number and legal name: not on the short sign up page any more, added later in Company details. The hint stays honest (entered, never verified).
const { chromium } = require('playwright');
let fail=0; const ck=(n,c)=>{ console.log((c?'  ok   ':'  FAIL ')+n); if(!c) fail++; };
(async()=>{
  const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:900},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
  // the sign up page is short: a business name and a password, nothing personal
  ck('no registration number, legal name or other company extras on sign up', (await p.$('#rcRegNumber'))===null && (await p.$('#rcLegal'))===null && (await p.$('#rcVatNumber'))===null && (await p.$('#rcAddress'))===null);
  ck('no personal details on sign up (owner name, owner email or phone)', (await p.$('#rcOwnerName'))===null && (await p.$('#rcOwnerEmail'))===null && (await p.$('#rcPhone'))===null);
  ck('only the business name, a password and a confirmation are asked', (await p.$$('.regpage input:not([type=hidden])')).length>=3 && await p.$('#rcCompanyName')!==null && await p.$('#rcOwnerPassword')!==null && await p.$('#rcOwnerPassword2')!==null);
  await p.fill('#rcCompanyName','Dinner Shop');
  await p.fill('#rcOwnerPassword','Tr1cky-Pass'); await p.fill('#rcOwnerPassword2','Tr1cky-Pass'); await p.click('#rcSubmit');
  await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card'); await p.evaluate(()=>{ try{ window.__t.btSave({ setupHidden:true }); window.__t.pfSave({ remindAt:Date.now() }); }catch(e){} });
  let c=await p.evaluate(()=>window.__t.State.company);
  ck('the business is saved with only a name', c.companyName==='Dinner Shop' && c.regNumber==='' && c.vatNumber==='' && c.address==='');
  ck('status is not entered and never verified', c.bipaVerifiedAt===null && c.verificationTier==='UNVERIFIED');
  ck('the owner is simply called Owner until a name is added in the profile', await p.evaluate(()=>window.__t.State.session.name==='Owner' && window.__t.State.users.length===1 && window.__t.State.users[0].email===''));
  // company details sheet: the registration number is added here
  await p.evaluate(()=>window.__t.openCompanyDetailsSheet()); await p.waitForSelector('#ccReg');
  ck('hint empty at start', (await p.innerText('#ccBipaHint')).trim()==='');
  await p.fill('#ccReg','cc/2024/00123'); await p.fill('#ccLegal','Dinner Shop CC');
  let h=await p.innerText('#ccBipaHint'); ck('usual shape recognised', /usual BIPA shape/.test(h));
  ck('honest: not checked with BIPA', /not checked with BIPA/.test(h) && !/Verified with BIPA/.test(h));
  ck('lookup link to bipa.na', await p.evaluate(()=>{const a=document.querySelector('#ccBipaHint a');return !!a&&a.href.indexOf('https://www.bipa.na')===0&&a.target==='_blank'}));
  await p.fill('#ccReg','ABC-999'); h=await p.innerText('#ccBipaHint'); ck('odd format warns but allowed', /does not look like the usual format/.test(h));
  await p.fill('#ccReg','cc/2024/00123'); await p.click('#ccName');
  ck('blur uppercases and trims', await p.inputValue('#ccReg')==='CC/2024/00123');
  await p.click('#ccSave'); await p.waitForTimeout(400);
  c=await p.evaluate(()=>window.__t.State.company);
  ck('stored regNumber and legalName', c.regNumber==='CC/2024/00123' && c.legalName==='Dinner Shop CC');
  ck('status ENTERED, never verified', c.bipaStatus==='ENTERED' && c.bipaVerifiedAt===null && c.verificationTier==='UNVERIFIED');
  await p.evaluate(()=>window.__t.openCompanyDetailsSheet()); await p.waitForSelector('#ccReg');
  ck('the sheet is prefilled', await p.inputValue('#ccReg')==='CC/2024/00123' && await p.inputValue('#ccLegal')==='Dinner Shop CC');
  await p.fill('#ccReg',''); await p.click('#ccSave'); await p.waitForTimeout(400);
  c=await p.evaluate(()=>window.__t.State.company);
  ck('clearing the number resets status UNKNOWN', c.regNumber==='' && c.bipaStatus==='UNKNOWN');
  ck('other fields kept', c.companyName==='Dinner Shop');
  ck('no page errors', errs.length===0); if(errs.length) console.log(errs);
  await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
