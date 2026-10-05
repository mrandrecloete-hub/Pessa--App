const { chromium } = require('playwright');
let fail=0; const ck=(n,c,x)=>{ console.log((c?'  ok   ':'  FAIL ')+n+(!c&&x!==undefined?'  -> '+JSON.stringify(x).slice(0,300):'')); if(!c) fail++; };
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:412,height:900},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
 const r=await p.evaluate(()=>{
  const t=window.__t; const out={};
  function mk(draw){const c=document.createElement('canvas');c.width=300;c.height=300;const x=c.getContext('2d');draw(x);return c;}
  function alphaAt(c,x,y){return c.getContext('2d').getImageData(x,y,1,1).data[3];}
  // 1 white square with coloured logo
  let c1=mk(x=>{x.fillStyle='#fff';x.fillRect(0,0,300,300);x.fillStyle='#d4380d';x.beginPath();x.arc(150,150,80,0,7);x.fill();x.fillStyle='#1d3557';x.fillRect(130,130,40,40);});
  let r1=t.logoCleanCanvas(c1); out.white={changed:r1.changed,corner:alphaAt(r1.canvas,1,1),w:r1.canvas.width,h:r1.canvas.height};
  // 2 framed: white bg, dark inset line, logo inside
  let c2=mk(x=>{x.fillStyle='#fff';x.fillRect(0,0,300,300);x.strokeStyle='#222';x.lineWidth=6;x.strokeRect(20,20,260,260);x.fillStyle='#0a9396';x.beginPath();x.arc(150,150,70,0,7);x.fill();});
  let r2=t.logoCleanCanvas(c2); out.framed={changed:r2.changed,w:r2.canvas.width,h:r2.canvas.height};
  // 3 solid badge
  let c3=mk(x=>{x.fillStyle='#0b3d91';x.fillRect(0,0,300,300);x.fillStyle='#ffd60a';x.beginPath();x.arc(150,150,80,0,7);x.fill();});
  let r3=t.logoCleanCanvas(c3); out.badge={changed:r3.changed,kept:!r3.changed};
  // 4 transparent
  let c4=mk(x=>{x.fillStyle='#d4380d';x.beginPath();x.arc(150,150,60,0,7);x.fill();});
  let r4=t.logoCleanCanvas(c4); out.transp={changed:r4.changed,w:r4.canvas?r4.canvas.width:300};
  return out;});
 console.log(JSON.stringify(r));
 ck('white square: removed', r.white.changed&&r.white.corner===0&&r.white.w<260, r.white);
 ck('framed: frame removed and trimmed', r2ok(r.framed), r.framed);
 ck('badge handled (no crash)', r.badge.kept, r.badge);
 ck('transparent stays', r.transp.w<=300, r.transp);
 function r2ok(f){return f.changed&&f.w<235;}
 ck('no page errors', errs.length===0, errs);
 await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
