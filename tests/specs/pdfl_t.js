const { chromium } = require('playwright'); const fs=require('fs');
(async()=>{
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:1100,height:844}, serviceWorkers:'block'});
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
  await p.fill('#rcCompanyName','Dinner Shop'); await p.fill('#rcOwnerName','Alice'); await p.fill('#rcOwnerEmail','a@x.com');
  await p.fill('#rcOwnerPassword','aaaa1111'); await p.fill('#rcOwnerPassword2','aaaa1111'); await p.click('#rcSubmit');
  await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card'); await p.evaluate(()=>{ try{ window.__t.btSave({ setupHidden:true, simpleMode:false }); window.__t.pfSave({ remindAt:Date.now() }); }catch(e){} });
  await p.evaluate(async()=>{ await window.__t.ensureJsPDF(); });
  const draft={number:'INV-001',dateStr:'2026-10-02',billToName:'Bob',items:[{desc:'Milk',name:'Milk',qty:2,unitPrice:30}],notes:''};
  for(const [name,w,h] of [['none',0,0],['wide',400,100],['square',300,300],['tall',150,300]]){
    await p.evaluate(({w,h})=>{ const S=window.__t.State; S.settings.businessSlogan='Quality you can trust'; S.settings.businessContact='Windhoek\n+264 81 000 0000';
      if(w){ const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle='#d9531e';x.fillRect(0,0,w,h);x.fillStyle='#fff';x.font='bold '+Math.round(Math.min(w,h)*0.3)+'px sans-serif';x.textAlign='center';x.fillText('LOGO',w/2,h*0.6);
        S.settings.logoDataUrl=c.toDataURL('image/jpeg',0.9); S.settings.logoImgMeta={w:w,h:h}; } else { S.settings.logoDataUrl=null; S.settings.logoImgMeta=null; } },{w,h});
    const out = await p.evaluate(async(d)=>{ const t=window.__t; const a=t.buildInvoicePdf(d).output('datauristring'); const r=t.buildReceiptPdf(d).output('datauristring');
      const doc=await t.customReportPdf('2026-01-01','2026-12-31','all'); return {a,r,c:doc.output('datauristring')}; },draft);
    for(const k of ['a','r','c']) fs.writeFileSync(`out_${name}_${k}.pdf`, Buffer.from(out[k].split(',')[1],'base64'));
  }
  console.log('errs',errs); await b.close();
})();
