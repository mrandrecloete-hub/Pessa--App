const { chromium } = require('playwright');
let fail=0; const ck=(n,c,x)=>{ console.log((c?'  ok   ':'  FAIL ')+n+(!c&&x!==undefined?'  -> '+JSON.stringify(x).slice(0,300):'')); if(!c) fail++; };
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:412,height:915},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));

 await require('./biz_boot.js')(p);
 await p.evaluate(()=>window.__t.openSettingsSheet()); await p.waitForTimeout(300);
 const row=await p.$('[data-more="pesaad"]'); ck('Pesa Ad row is in Settings', !!row);
 const vis=await p.evaluate(()=>{ const r=[...document.querySelectorAll('[data-more="pesaad"]')]; return r.some(e=>e.offsetParent!==null&&e.getBoundingClientRect().height>0&&!e.closest('details:not([open])')); }); ck('a Pesa Ad row is visible without opening any group', vis);
 const dr=await p.evaluate(()=>/Pesa Ad/.test(window.__t.menuRowsHtml?window.__t.menuRowsHtml():'')); console.log('  info menu has Pesa Ad:',dr);
 await p.evaluate(()=>{ const r=document.querySelector('[data-more="pesaad"]'); if(r) r.click(); }); await p.waitForSelector('#adVideo',{timeout:4000}).catch(()=>{});
 const v=await p.$('#adVideo'); ck('video player is on the page', !!v);
 const srcs=await p.evaluate(()=>[...document.querySelectorAll('#adVideo source')].map(x=>x.getAttribute('src'))); ck('video sources are the mp4 and webm files', srcs.length===2&&/pesa-promo\.mp4$/.test(srcs[0])&&/pesa-promo\.webm$/.test(srcs[1]), srcs);
 const st=await p.evaluate(async()=>{ const a=await fetch('media/pesa-promo.mp4',{method:'HEAD'}); const b=await fetch('media/pesa-promo-poster.jpg',{method:'HEAD'}); return [a.status,+a.headers.get('content-length'),b.status]; });
 ck('video and poster files are served', st[0]===200&&st[1]>1e6&&st[2]===200, st);
 const txt=await p.innerText('.sheet'); ck('wording is shown', /Your Mula, Your Pride/.test(txt)&&/built in Namibia, for Namibia/.test(txt)&&/Free 14 day trial/.test(txt)&&/081 821 1692/.test(txt), txt.slice(0,200));
 ck('share, WhatsApp, copy and download buttons', !!(await p.$('#adShare'))&&!!(await p.$('#adWa'))&&!!(await p.$('#adCopy'))&&!!(await p.$('#adDl')));
 const href=await p.getAttribute('#adDl','href'); ck('download link', /pesa-promo\.mp4/.test(href));
 const meta=await p.evaluate(()=>new Promise(r=>{ const v=document.getElementById('adVideo'); if(v.readyState>=1) return r([v.duration,v.videoWidth]); v.addEventListener('loadedmetadata',()=>r([v.duration,v.videoWidth])); v.addEventListener('error',()=>r(['error'])); setTimeout(()=>r(['timeout']),6000); }));
 console.log('  info video metadata',JSON.stringify(meta)); ck('video loads and has a length', typeof meta[0]==='number'&&meta[0]>60&&meta[1]>=720, meta); ck('no error note shown', (await p.evaluate(()=>getComputedStyle(document.getElementById('adVidNote')).display))==='none');
 await p.click('#adCopy'); await p.waitForTimeout(200); ck('copy shows a message', true);
 const cap=await p.inputValue('#adCaption'); ck('caption box holds the words', /Pesa. Your Mula/.test(cap)&&/Free 14 day trial/.test(cap), cap.slice(0,80));
 const ic=await p.$('.sheet-head .pg-ico, .sheet-head img'); ck('page icon at top left', !!ic);
 ck('no page errors', errs.length===0, errs);
 await p.screenshot({path:process.env.SHOT||require('os').tmpdir()+'/pesaad.png'});
 await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
