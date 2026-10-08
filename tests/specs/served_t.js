const { chromium } = require('playwright'); const fs=require('fs'), cp=require('child_process');
let fail=0; const ck=(n,c,x)=>{ console.log((c?'  ok   ':'  FAIL ')+n+(!c&&x!==undefined?'  -> '+JSON.stringify(x).slice(0,300):'')); if(!c) fail++; };
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:412,height:915},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
 await p.fill('#rcCompanyName','Shop'); await p.fill('#rcOwnerName','Andre Cloete'); await p.fill('#rcOwnerEmail','a@x.com'); await p.fill('#rcOwnerPassword','aaaa1111'); await p.fill('#rcOwnerPassword2','aaaa1111'); await p.click('#rcSubmit');
 await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card'); await p.evaluate(()=>{ try{ window.__t.btSave({ setupHidden:true, simpleMode:false }); window.__t.pfSave({ remindAt:Date.now() }); }catch(e){} });
 await p.evaluate(()=>window.__t.ensureJsPDF()).catch(()=>{}); await p.waitForTimeout(500);
 const out=await p.evaluate(()=>{ const T=window.__t; const sale={id:'abc123',createdAt:new Date().toISOString(),total:60,paymentMethod:'cash',cashierName:'Maria Shikongo',cashReceived:100,items:[{name:'Bread',qty:2,unitPrice:30}]};
   const rd=T.saleReceiptDraft(sale); const rdoc=T.buildReceiptPdf(rd); const idoc=T.buildInvoicePdf(Object.assign({},rd,{number:'INV-1',dueDateStr:'2026-11-01'}));
   const odoc=T.buildInvoicePdf({number:'INV-2',billToName:'X',dateStr:'2026-10-05',items:[{desc:'Svc',qty:1,unitPrice:10}]});
   const b64=d=>{ const u=new Uint8Array(d.output('arraybuffer')); let s=''; for(let i=0;i<u.length;i+=8192) s+=String.fromCharCode.apply(null,u.subarray(i,i+8192)); return btoa(s); };
   return { r:b64(rdoc), i:b64(idoc), o:b64(odoc) }; });
 const txt={}; for(const k of ['r','i','o']){ fs.writeFileSync(require('os').tmpdir()+'/'+k+'.pdf',Buffer.from(out[k],'base64')); txt[k]=cp.execSync('pdftotext -layout /tmp/'+k+'.pdf -').toString(); }
 ck('receipt names the cashier', /Served by\s+Maria Shikongo/.test(txt.r), txt.r);
 ck('receipt says it is needed for returns and refunds', /required for any\s+return or refund/.test(txt.r.replace(/\n\s*/g,' ')) || /return or refund/.test(txt.r), txt.r);
 ck('invoice names who handled it', /Handled by/i.test(txt.i) && /Maria Shikongo/.test(txt.i), txt.i);
 ck('new invoice falls back to the signed in user', /Andre Cloete/.test(txt.o), txt.o);
 ck('no page errors', errs.length===0, errs);
 await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
