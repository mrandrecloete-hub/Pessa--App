const { chromium } = require('playwright'); const fs=require('fs'); const boot=require('./biz_boot.js');
const D=''+(process.env.PESA_OUT||'/tmp/pesa-tests/')+'pdfout/'; fs.mkdirSync(D,{recursive:true});
const logo = process.argv[2]==='logo'; const tpl = process.argv[3]||'classic';
(async()=>{
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:390,height:900}, serviceWorkers:'block', acceptDownloads:true});
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{ if(m.type()==='error' && !/TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await boot(p);
  await p.evaluate(([logo,tpl])=>{
    const t=window.__t; t.State.settings = Object.assign({}, t.State.settings, { businessContact:'Phone: +264 81 234 5678\nEmail: hello@dinnershop.na\nwww.dinnershop.na\n12 Independence Ave, Windhoek', businessSlogan:'Fresh every day', invoiceTemplate: tpl });
    if(logo){ const c=document.createElement('canvas'); c.width=300; c.height=120; const g=c.getContext('2d'); g.fillStyle='#fff'; g.fillRect(0,0,300,120); g.fillStyle='#c9482a'; g.fillRect(10,10,100,100); g.fillStyle='#222'; g.font='bold 40px sans-serif'; g.fillText('DINNER',120,75); t.State.settings.logoDataUrl=c.toDataURL('image/jpeg'); t.State.settings.logoImgMeta={w:300,h:120}; }
  }, [logo,tpl]);
  await p.evaluate(()=>{ window.__b64=(r)=>{ const d = r && r.doc ? r.doc : r; return d.output('datauristring').split(',')[1]; }; });
  const save=(name,data)=>{ fs.writeFileSync(D+name+'.pdf', Buffer.from(data,'base64')); console.log('wrote',name); };
  const sfx = (logo?'_logo':'')+(tpl!=='classic'?'_'+tpl:'');
  const mkItems = n=>Array.from({length:n},(_,i)=>({desc:i%5===0?'Cooking Oil 750ml sunflower with a long descriptive name that will wrap to a second line in the table':'Item '+(i+1),qty:i+1,unitPrice:12.5*(i+1)}));
  save('invoice_s'+sfx, await p.evaluate(async(items)=>{ const t=window.__t; await t.ensureJsPDF(); return window.__b64(t.buildInvoicePdf({number:'INV-0042',dateStr:'2026-10-04',dueDateStr:'2026-11-03',billToName:'Maria Nghi',billToContact:'0812345678\nmaria@mail.com\n5 Sunset Road',items:items,notes:'',payMethod:'cash',received:300})); }, mkItems(4)));
  save('invoice_long'+sfx, await p.evaluate(async(items)=>{ const t=window.__t; await t.ensureJsPDF(); return window.__b64(t.buildInvoicePdf({number:'INV-0043',dateStr:'2026-10-04',billToName:'Peter K',billToContact:'',items:items,notes:'Please pay within 30 days.',payMethod:'credit'})); }, mkItems(34)));
  save('quote'+sfx, await p.evaluate(async(items)=>{ const t=window.__t; await t.ensureJsPDF(); return window.__b64(await t.btQuotePdf({number:'QUO-0007',dateStr:'2026-10-04',validUntil:'2026-10-18',billToName:'Peter K',billToContact:'0819999999',items:items,total:187.5,notes:'Delivery included within Windhoek.',status:'open'})); }, mkItems(5)));
  save('report_live'+sfx, await p.evaluate(async()=>{ const t=window.__t; await t.ensureJsPDF(); return window.__b64(t.buildReportPdf(new Date(Date.now()-30*86400000), new Date(Date.now()+86400000), 'October 2026')); }));
  save('report_custom'+sfx, await p.evaluate(async()=>{ const t=window.__t; await t.ensureJsPDF(); const d=new Date(); const f=new Date(Date.now()-30*86400000).toISOString().slice(0,10); return window.__b64(await t.customReportPdf(f, d.toISOString().slice(0,10),'all')); }));
  save('work'+sfx, await p.evaluate(async()=>{ const t=window.__t; await t.ensureJsPDF(); const u=t.State.users[0]; const per=new Date().toISOString().slice(0,7); const snap=t.workReportSnapshot(u,'monthly',per); return window.__b64(await t.workReportPdf(Object.assign({kind:'monthly',period:per,userName:u.name,jobTitle:'Owner',employeeNo:'E001',generatedAt:new Date().toISOString(),generatedBy:'Alice',role:'owner'}, snap))); }));
  save('about'+sfx, await p.evaluate(async()=>{ const t=window.__t; await t.ensureJsPDF(); return window.__b64(t.generateAboutPdf()); }));
  // VAT via the sheet
  await p.evaluate(()=>{ window.__t.closeModal && window.__t.closeModal(); });
  console.log(errs); await b.close();
})();
