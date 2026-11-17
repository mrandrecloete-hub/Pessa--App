const { chromium } = require('playwright'); const fs=require('fs'); const boot=require('./biz_boot.js');
const D=''+(process.env.PESA_OUT||require('os').tmpdir()+'/pesa-tests/')+'pdfout/';
(async()=>{
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:390,height:900}, serviceWorkers:'block', acceptDownloads:true});
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await boot(p);
  await p.evaluate(()=>window.__t.openVatSummarySheet()); await p.waitForSelector('#vatDownloadBtn');
  await p.click('#vatDownloadBtn'); await p.waitForSelector('#xpSel'); await p.selectOption('#xpSel','xlsx'); const [dl] = await Promise.all([p.waitForEvent('download',{timeout:20000}), p.click('#xpGo')]); console.log('name',dl.suggestedFilename());
  await dl.saveAs(D+'vat.xlsx'); console.log('vat saved', errs); await b.close();
})();
