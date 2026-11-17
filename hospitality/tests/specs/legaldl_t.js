const { chromium } = require('playwright'); const fs=require('fs'); const path=require('path');
let fail=0; const ck=(n,c,x)=>{ console.log((c?'  ok   ':'  FAIL ')+n+(!c&&x!==undefined?'  -> '+JSON.stringify(x).slice(0,200):'')); if(!c) fail++; };
(async()=>{
 const jspdf=fs.readFileSync(path.join(__dirname,'..','..','node_modules/jspdf/dist/jspdf.umd.min.js'));
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:412,height:915},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await ctx.route('https://cdnjs.cloudflare.com/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:jspdf}));
 await require('./biz_boot.js')(p);
 for(const k of ['privacy','terms','refunds']){
  await p.evaluate(k=>{ k==='privacy' ? window.__t.openPrivacySheet() : window.__t.openLegalDoc(k); },k); await p.waitForSelector('#legalPdfBtn');
  ck(k+' has a Download button', /Download/.test(await p.innerText('#legalPdfBtn')));
  await p.click('#legalPdfBtn'); await p.waitForTimeout(900);
  ck(k+' offers the save formats', !!(await p.$('.xp-back')) && /PDF/.test(await p.innerText('.xp-back')));
  await p.evaluate(()=>{ document.querySelectorAll('.xp-back').forEach(e=>e.remove()); });
  await p.evaluate(()=>window.__t.closeModal()); await p.waitForTimeout(200);
 }
 const out=await p.evaluate(async()=>{ await window.__t.ensureJsPDF(); const t=window.__t; const pt=t.legalParts('privacy'); const r=t.generateLegalPdf('Confidentiality and privacy',pt.intro,pt.sections); return { pages:r.doc.getNumberOfPages(), id:r.verification.id, uri:r.doc.output('datauristring') }; });
 fs.writeFileSync(require('os').tmpdir()+'/legal_priv.pdf',Buffer.from(out.uri.split(',')[1],'base64'));
 ck('privacy PDF built with a verification id', out.pages>=1 && !!out.id, out);
 ck('no page errors', errs.length===0, errs);
 await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
