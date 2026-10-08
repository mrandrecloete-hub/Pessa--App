const { chromium } = require('playwright');
const VPS=[[800,600,1],[1024,600,1],[1024,768,1],[1280,720,1],[1366,768,1],[1536,864,1.25],[1920,1080,1],[2560,1440,1],[3840,2160,1],[960,540,2],[768,1024,2],[390,844,3],[360,640,2]];
(async()=>{
  const b = await chromium.launch(); const issues=[];
  for(const [w,h,dpr] of VPS){
    const ctx = await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:dpr, serviceWorkers:'block', hasTouch:w<800}); const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
    await p.fill('#rcCompanyName','Dinner Shop'); await p.fill('#rcOwnerName','Alice'); await p.fill('#rcOwnerEmail','a@x.com');
    await p.fill('#rcOwnerPassword','Tr1cky-Pass'); await p.fill('#rcOwnerPassword2','Tr1cky-Pass'); await p.click('#rcSubmit');
    await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card'); await p.evaluate(()=>{ try{ window.__t.btSave({ setupHidden:true, simpleMode:false }); window.__t.pfSave({ remindAt:Date.now() }); }catch(e){} });
    await p.evaluate(async()=>{ const r=window.__t.refs; for(let i=0;i<12;i++) await r.products.doc().set({name:'Product number '+i+' with a long name',sellPrice:30+i,costPrice:20,stockQty:50,createdAt:new Date().toISOString()}); });
    const check = async(label)=>{
      const r = await p.evaluate(()=>{ const iw=window.innerWidth, over=document.documentElement.scrollWidth-iw; const off=[]; document.querySelectorAll('body *').forEach(el=>{ const cs=getComputedStyle(el); if(cs.display==='none'||cs.visibility==='hidden') return; const r=el.getBoundingClientRect(); if(r.width>0&&r.height>0&&r.right>iw+2&&r.left<iw){ // skip if inside a horizontal scroller
          let a=el.parentElement, scroll=false; while(a&&a!==document.body){ const c=getComputedStyle(a); if((c.overflowX==='auto'||c.overflowX==='scroll'||c.overflowX==='hidden')&&a.scrollWidth>a.clientWidth){scroll=true;break;} a=a.parentElement;} if(!scroll&&off.length<3) off.push((el.className||el.tagName)+'|'+Math.round(r.right-iw)); } }); return {over,off}; });
      if(r.over>1||r.off.length) issues.push(`${w}x${h}@${dpr} ${label}: overflow=${r.over} ${JSON.stringify(r.off)}`);
    };
    for(const t of ['dashboard','sell','stock','credit','invoices','reports','expenses','till']){ await p.evaluate(x=>window.__t.setTab(x),t); await p.waitForTimeout(120); await check('tab '+t); }
    for(const [nm,fn] of [['settings',()=>window.__t.openSettingsSheet()],['security',()=>window.__t.openSecuritySheet()],['compat',()=>window.__t.openCompatSheet()],['invoice',()=>window.__t.openInvoiceSheet&&window.__t.openInvoiceSheet()]]){
      await p.evaluate(fn); await p.waitForTimeout(250); await check('sheet '+nm);
      const sh = await p.evaluate(()=>{ const s=document.querySelector('.sheet'); if(!s) return null; const r=s.getBoundingClientRect(); return {top:Math.round(r.top),bottom:Math.round(r.bottom),h:window.innerHeight,left:Math.round(r.left),right:Math.round(r.right),w:window.innerWidth,scrollable:s.scrollHeight>s.clientHeight}; });
      if(sh && (sh.top<0||sh.bottom>sh.h+1||sh.left<0||sh.right>sh.w+1)) issues.push(`${w}x${h}@${dpr} sheet ${nm} outside viewport ${JSON.stringify(sh)}`);
      await p.evaluate(()=>window.__t.closeModal());
    }
    if(w>=1024){ const sb = await p.evaluate(()=>{ const e=document.getElementById('appSidebar'); return e&&getComputedStyle(e).display!=='none'; }); if(!sb) issues.push(`${w}x${h} no sidebar`); }
    else { const mb = await p.evaluate(()=>{ const e=document.getElementById('menuBtn'); return e&&getComputedStyle(e).display!=='none'; }); if(!mb) issues.push(`${w}x${h} no menu button`); }
    if([1024,768].includes(h)||w===1366||w===3840||w===360) await p.screenshot({path:`mx_${w}x${h}.png`});
    if(errs.length) issues.push(`${w}x${h} JS errors: ${errs.join(' | ')}`);
    await ctx.close();
  }
  console.log(issues.length? issues.join('\n') : 'NO LAYOUT ISSUES'); await b.close();
})();
