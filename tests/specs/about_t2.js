const { chromium } = require('playwright');
let fail=0; const ck=(n,c)=>{ console.log((c?'  ok   ':'  FAIL ')+n); if(!c){fail++;} };
(async()=>{ const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block',acceptDownloads:true}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await require('./biz_boot.js')(p);
 const r = await p.evaluate(()=>{ const t=window.__t; const A=t.ABOUT;
   const strs=[]; const walk=a=>a.forEach(x=>{ if(typeof x==='string') strs.push(x); else { strs.push(x.h); x.items.forEach(i=>strs.push(i)); } });
   walk(A.P); walk(A.F); walk(t.ABOUT_INTERNET); walk(t.ABOUT_CONNECTION); walk(t.ABOUT_SMART); strs.push(A.FT,A.CT,A.ST);
   const dash=strs.filter(x=>/[-‐-―−–—]/.test(x));
   const phone=strs.filter(x=>/\bphones?\b/i.test(x));
   return { n:strs.length, dash, phone, features:A.F.length }; });
 console.log('   strings checked:',r.n,'features:',r.features);
 ck('no hyphen or dash anywhere in About text', r.dash.length===0); if(r.dash.length) console.log(r.dash);
 ck('no "phone" in About text', r.phone.length===0); if(r.phone.length) console.log(r.phone);
 // untranslated strings in af and de
 for(const lang of ['af','de']){
   await p.evaluate(l=>{ const S=window.__t.State; S.settings=Object.assign({},S.settings,{language:l}); window.__t.i18nRefresh(); window.__t.openAboutSheet(); }, lang); await p.waitForTimeout(400);
   const miss = await p.evaluate(l=>{ const t=window.__t; const A=t.ABOUT; const strs=[]; const walk=a=>a.forEach(x=>{ if(typeof x==='string') strs.push(x); else { strs.push(x.h); x.items.forEach(i=>strs.push(i)); } }); walk(A.P); walk(A.F); walk(t.ABOUT_INTERNET); walk(t.ABOUT_CONNECTION); walk(t.ABOUT_SMART);
     const body=document.querySelector('.sheet').innerText; return strs.filter(x=>body.indexOf(x)>-1).length+'/'+strs.length; }, lang);
   const [shown,total]=miss.split('/').map(Number); console.log('   '+lang+': English strings still showing on the page: '+shown+' of '+total);
   ck(lang+' About page is translated', shown<=3);
   await p.evaluate(()=>window.__t.closeModal());
 }
 await p.evaluate(()=>{ const S=window.__t.State; S.settings=Object.assign({},S.settings,{language:'en'}); window.__t.i18nRefresh(); });
 // PDF builds, includes new sections, page count
 await p.waitForFunction(()=>true); await p.evaluate(()=>window.__t.ensureJsPDF());
 const pdf = await p.evaluate(async()=>{ const t=window.__t; const out=t.generateAboutPdf(); const doc=out.doc||out; const txt=[]; let all=''; 
   return { pages: doc.getNumberOfPages(), id: !!(out.verification&&out.verification.id) }; });
 console.log('   about pdf pages:',pdf.pages); ck('PDF builds with a verification stamp', pdf.pages>3 && pdf.id);
 await p.evaluate(()=>window.__t.openAboutSheet()); await p.waitForTimeout(300);
 const body = await p.innerText('.sheet');
 ck('page lists business tools', /Business tools \(Owner and Manager/.test(body) && /Import cost calculator:/.test(body) && /Speed check and test products:/.test(body));
 ck('page lists honest limits', /cannot confirm it with BIPA/.test(body) && /to be confirmed with the relevant authorities of Namibia/.test(body));
 await p.evaluate(()=>{ document.querySelector('.sheet').scrollTop=0; }); await p.screenshot({path:'about_new_1.png'});
 ck('no page errors', errs.length===0); if(errs.length) console.log(errs.slice(0,3));
 await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0); })();
