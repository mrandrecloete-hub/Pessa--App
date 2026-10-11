const { chromium } = require('playwright');
let fail=0; const ck=(n,c,x)=>{ console.log((c?'  ok   ':'  FAIL ')+n+(!c&&x!==undefined?'  -> '+JSON.stringify(x).slice(0,300):'')); if(!c) fail++; };
(async()=>{
  const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:412,height:900},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await require('./biz_boot.js')(p,{demo:true});
  const ratio=()=>p.evaluate(()=>{ window.__t.toast('New message from Pesa AI Assistant: Reorder draft is ready'); const cs=getComputedStyle(document.querySelector('.toast')); const rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number); const lum=c=>{ const a=c.map(v=>{ v/=255; return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4); }); return .2126*a[0]+.7152*a[1]+.0722*a[2]; }; const L1=lum(rgb(cs.backgroundColor)), L2=lum(rgb(cs.color)); return { r:(Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05), bg:cs.backgroundColor, fg:cs.color }; });
  let r=await ratio(); ck('the pop up is readable in the dark teal skin (contrast at least 7 to 1)', r.r>=7, r);
  ck('it is a dark box with light words, not a white box', /rgb\(11, 59, 44\)/.test(r.bg) && /rgb\(246, 255, 250\)/.test(r.fg), r);
  await p.evaluate(()=>{ document.documentElement.className=''; document.documentElement.setAttribute('data-theme','dark'); }); r=await ratio(); ck('readable in the dark theme too', r.r>=7, r);
  await p.evaluate(()=>{ document.documentElement.removeAttribute('data-theme'); document.documentElement.className=''; }); r=await ratio(); ck('readable in the light theme', r.r>=7, r);
  ck('no page errors', errs.length===0, errs);
  await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
