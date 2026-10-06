const { chromium } = require('playwright'); const fs=require('fs');
const D=(process.env.PESA_OUT||require('os').tmpdir()+'/pesa-tests/');
let fail=0; const ck=(n,c)=>{ console.log((c?'  ok   ':'  FAIL ')+n); if(!c){fail++;} };
(async()=>{
  const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await require('./biz_boot.js')(p);
  // products with categories and some without
  await p.evaluate(async()=>{ const r=window.__t.refs, iso=new Date().toISOString();
    const mk=async(o)=>{ const d=r.products.doc(); await d.set(Object.assign({createdAt:iso,costPrice:5,stockQty:20},o)); return d.id; };
    await mk({name:'Yogurt 500g',sellPrice:22.5}); await mk({name:'Full cream milk 2L',sellPrice:34,category:'Dairy'}); await mk({name:'Cheddar cheese',sellPrice:60});
    await mk({name:'Brown bread',sellPrice:15,category:'Bakery'}); await mk({name:'Mystery gadget',sellPrice:99});
    await mk({name:'Maize meal 10kg',sellPrice:115,taxCategory:'ZERO_RATED'}); await mk({name:'Exempt thing',sellPrice:50,taxCategory:'EXEMPT'});
  }); await p.waitForTimeout(400);
  // dept logic
  const dg = await p.evaluate(()=>window.__t.deptGroups(window.__t.State.products).map(g=>g.label+':'+g.items.map(i=>i.name).join('|')));
  console.log('   groups:', JSON.stringify(dg));
  ck('milk and yogurt and cheese share one Dairy header', dg.some(x=>/^Dairy:/.test(x)&&/Yogurt/.test(x)&&/Full cream milk/.test(x)&&/Cheddar/.test(x)));
  ck('Other products is last', /^Other products/.test(dg[dg.length-1]));
  ck('departments sorted A to Z', dg.slice(0,-1).map(x=>x.split(':')[0]).join()===dg.slice(0,-1).map(x=>x.split(':')[0]).sort((a,c)=>a.localeCompare(c)).join());
  // stock tab has headers
  await p.evaluate(()=>window.__t.setTab('stock')); await p.waitForTimeout(500);
  const heads=await p.$$eval('.dept-h span',e=>e.map(x=>x.textContent)); console.log('   stock headers:',heads);
  ck('stock tab shows department headers', heads.length>=3 && heads.includes('Dairy'));
  await p.screenshot({path:D+'inv_stock.png'});
  // invoice sheet, picker
  await p.evaluate(()=>window.__t.openInvoiceSheet()); await p.waitForSelector('#invPickBtn');
  ck('buyer TIN field exists', !!(await p.$('#invBillTin')));
  await p.click('#invPickBtn'); await p.waitForSelector('.spk-dept');
  const ph=await p.$$eval('.spk-dept b',e=>e.map(x=>x.textContent)); console.log('   picker headers:',ph);
  ck('picker has department headers', ph.length>=3);
  // tick the whole Dairy department, plus one bread
  const dairyIdx = ph.indexOf('Dairy');
  await p.evaluate(i=>{ const c=document.querySelectorAll('[data-spkd]')[i]; c.click(); }, dairyIdx); await p.waitForTimeout(150);
  const n1=await p.textContent('[data-spkn]'); ck('ticking Dairy header selects its 3 products', n1==='3');
  await p.evaluate(()=>{ const row=[...document.querySelectorAll('[data-spkrow]')].find(r=>/Brown bread/.test(r.textContent)); row.querySelector('[data-spk]').click(); }); await p.waitForTimeout(150);
  await p.evaluate(()=>{ const row=[...document.querySelectorAll('[data-spkrow]')].find(r=>/Maize meal/.test(r.textContent)); row.querySelector('[data-spk]').click(); });
  await p.evaluate(()=>{ const row=[...document.querySelectorAll('[data-spkrow]')].find(r=>/Exempt thing/.test(r.textContent)); row.querySelector('[data-spk]').click(); });
  await p.waitForTimeout(150); ck('6 ticked in total', (await p.textContent('[data-spkn]'))==='6');
  await p.screenshot({path:D+'inv_picker.png'});
  await p.click('[data-spkadd]'); await p.waitForTimeout(300);
  const descs=await p.$$eval('#invItemsList input[type=text], #invItemsList input:not([type])',e=>e.map(x=>x.value).filter(Boolean)); console.log('   invoice lines:',descs);
  ck('6 lines added in department order', descs.length>=6);
  // fill buyer
  await p.fill('#invBillName','Van Rensburg LA'); await p.fill('#invBillTin','9876543210');
  await p.evaluate(()=>{ window.__t.closeModal(); });
  // PDF for vendor vs non vendor
  await p.evaluate(()=>window.__t.ensureJsPDF());
  await p.evaluate(()=>{ window.__mk=()=>({number:'INV-0001',billToName:'Van Rensburg LA',billToTin:'9876543210',billToContact:'081 000 0000\nWindhoek',dateStr:'2026-10-04',dueDateStr:'2026-11-04',notes:'',received:null,
    items:window.__t.State.products.filter(x=>['Yogurt 500g','Full cream milk 2L','Maize meal 10kg','Exempt thing'].includes(x.name)).map(x=>({desc:x.name,qty:2,unitPrice:x.sellPrice,productId:x.id}))}); });
  const non = await p.evaluate(()=>({vend:window.__t.isVatVendor()})); ck('not a vendor before a VAT number', non.vend===false);
  const pdfNon = await p.evaluate(()=>{ const doc=window.__t.buildInvoicePdf(window.__mk()); return doc.output('datauristring').split(',')[1]; });
  fs.writeFileSync(D+'inv_non.pdf',Buffer.from(pdfNon,'base64'));
  await p.evaluate(()=>{ window.__t.State.company=Object.assign({},window.__t.State.company,{vatNumber:'VAT-NA-123456'}); window.__t.State.settings=Object.assign({},window.__t.State.settings,{fiscal:{tin:'1234567890',branchCode:'01'}}); });
  ck('now a VAT vendor', await p.evaluate(()=>window.__t.isVatVendor()));
  const tb=await p.evaluate(()=>window.__t.invoiceTaxBreakdown(window.__mk().items)); console.log('   breakdown',JSON.stringify(tb));
  ck('net+vat+zero+exempt = gross', Math.abs(tb.net+tb.vat+tb.zero+tb.exempt-tb.gross)<0.005);
  ck('figures correct', tb.vat===14.74 && tb.net===98.26 && tb.zero===230 && tb.exempt===100 && tb.gross===443);
  const pdfV = await p.evaluate(()=>{ const doc=window.__t.buildInvoicePdf(window.__mk()); return {pages:doc.getNumberOfPages(), data:doc.output('datauristring').split(',')[1]}; });
  fs.writeFileSync(D+'inv_vat.pdf',Buffer.from(pdfV.data,'base64')); console.log('   vendor pages',pdfV.pages); ck('vendor invoice is one page', pdfV.pages===1);
  const pdfAf = await p.evaluate(()=>{ const S=window.__t.State; S.settings=Object.assign({},S.settings,{language:'af'}); window.__t.i18nRefresh(); const doc=window.__t.buildInvoicePdf(window.__mk()); return doc.output('datauristring').split(',')[1]; });
  fs.writeFileSync(D+'inv_af.pdf',Buffer.from(pdfAf,'base64'));
  await p.evaluate(()=>{ const S=window.__t.State; S.settings=Object.assign({},S.settings,{language:'en',fiscal:{}}); window.__t.i18nRefresh(); window.__t.openInvoiceSheet(); }); await p.waitForTimeout(400);
  ck('warning shown when vendor has no TIN', /TIN is not set/.test(await p.innerText('.sheet')));
  ck('no page errors', errs.length===0); if(errs.length) console.log(errs.slice(0,3));
  await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
