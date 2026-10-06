const { chromium } = require('playwright'); const fs=require('fs'); const boot=require('./biz_boot.js');
const D=''+(process.env.PESA_OUT||require('os').tmpdir()+'/pesa-tests/')+'xpout/'; fs.mkdirSync(D,{recursive:true});
(async()=>{
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:390,height:900}, serviceWorkers:'block', acceptDownloads:true});
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{ if(m.type()==='error' && !/TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await boot(p);
  await p.evaluate(()=>{ const t=window.__t; t.State.settings = Object.assign({}, t.State.settings, { shopName:'Dinner Shop', businessContact:'Phone: +264 81 234 5678\nEmail: hello@dinnershop.na\n12 Independence Ave, Windhoek' }); });
  await p.evaluate(()=>{ try{ new Function('return 1')(); }catch(e){} }).catch(()=>{});
  const fmts=['docx','xlsx','csv','html','rtf','txt','png','jpg'];
  const names=['invoice','quote','report','receipt','about'];
  for(const name of names){
    for(const f of fmts){
      const r = await p.evaluate(async([f,name])=>{ const t=window.__t; await t.ensureJsPDF(); const items=Array.from({length:6},(_,i)=>({desc:i%4===0?'Cooking Oil 750ml sunflower with a long descriptive name that wraps':'Item '+(i+1),qty:i+1,unitPrice:12.5*(i+1)}));
        const mk={
          invoice:async()=>t.buildInvoicePdf({number:'INV-0042',dateStr:'2026-10-04',dueDateStr:'2026-11-03',billToName:'Maria Nghi',billToContact:'0812345678\nmaria@mail.com\n5 Sunset Road',items:items,notes:'Thank you',payMethod:'cash',received:300}),
          quote:async()=>t.btQuotePdf({number:'QUO-0007',dateStr:'2026-10-04',validUntil:'2026-10-18',billToName:'Peter K',billToContact:'0819999999',items:items,total:187.5,notes:'Delivery included.',status:'open'}),
          report:async()=>t.buildReportPdf(new Date(Date.now()-30*86400000), new Date(Date.now()+86400000), 'October 2026'),
          receipt:async()=>t.buildReceiptPdf({number:'R-0001',dateStr:'2026-10-04',billToName:'Customer',items:items,payMethod:'cash',received:500}),
          about:async()=>t.generateAboutPdf()
        };
        let doc = await mk[name](); if(doc&&doc.doc) doc=doc.doc;
        const blob = await t.xpBlob(doc,f,name+'.pdf'); if(!blob) return null;
        const buf = new Uint8Array(await blob.arrayBuffer()); let s=''; for(let i=0;i<buf.length;i+=8192) s+=String.fromCharCode.apply(null,buf.subarray(i,i+8192)); return {b64:btoa(s),type:blob.type,size:blob.size}; },[f,name]).catch(e=>({err:String(e).slice(0,300)}));
      if(!r||r.err){ console.log(name,f,'FAIL',r&&r.err); continue; }
      fs.writeFileSync(D+name+'.'+f, Buffer.from(r.b64,'base64')); console.log(name,f,r.size,r.type);
    }
  }
  console.log('errs',JSON.stringify(errs)); await b.close();
})();
