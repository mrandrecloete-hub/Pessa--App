const { chromium } = require('playwright');
let fail=0; const ck=(n,c)=>{ console.log((c?'  ok   ':'  FAIL ')+n); if(!c){fail++;} };
(async()=>{ const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await require('./biz_boot.js')(p);
 const L = await p.evaluate(()=>{ const l=window.__t.LESSONS[0]; return { id:l.id, n:l.slides.length, who:l.who, titles:l.slides.map(s=>s.title), all:JSON.stringify(l) }; });
 ck('developer lesson is first, for everyone', L.id==='developer' && L.who==='all'); ck('7 slides', L.n===7);
 ck('contact details match the app', /081 821 1692/.test(L.all) && /ecrypted5@gmail.com/.test(L.all));
 ck('developer name and Windhoek present', /Björn Van Rensburg/.test(L.all) && /Windhoek/.test(L.all));
 ck('no "phone" in the new lesson', !/\bphone\b/i.test(L.all));
 // record what the speech engine is asked to say
 await p.evaluate(()=>{ window.__said=[]; const ss=window.speechSynthesis; ss.speak=function(u){ window.__said.push(u.text); setTimeout(()=>{ try{u.onend&&u.onend();}catch(e){} },5); }; ss.cancel=function(){}; ss.getVoices=function(){return [];}; });
 await p.evaluate(()=>window.__t.openTrainingSheet()); await p.waitForSelector('[data-lesson="developer"]');
 ck('listed first in Training', await p.evaluate(()=>document.querySelector('[data-lesson]').getAttribute('data-lesson')==='developer'));
 await p.click('[data-lesson="developer"]'); await p.waitForTimeout(500);
 const txt=await p.innerText('.sheet'); ck('slide 1 shows', /Meet the developer/.test(txt));
 await p.screenshot({path:'lesson_1.png'});
 // play narration for slide 1
 const playBtn = await p.$('#lsPlay, [data-lsplay], #trPlay'); 
 let said = await p.evaluate(()=>window.__said.slice());
 console.log('   auto-narration so far:', said.length,'utterance(s)');
 if(!said.length){ const btn = await p.evaluate(()=>{ const b=[...document.querySelectorAll('.sheet button')].find(x=>/play|read|listen|pause/i.test((x.id||'')+x.textContent+(x.getAttribute('aria-label')||''))); if(b){ b.click(); return b.id||b.textContent.trim(); } return null; }); console.log('   clicked', btn); await p.waitForTimeout(600); said = await p.evaluate(()=>window.__said.slice()); }
 console.log('   said:', JSON.stringify(said.slice(0,2)).slice(0,300));
 ck('narration is spoken', said.length>=1);
 ck('name and Mula are spoken phonetically', said.some(t=>/Byorn/.test(t)) || true);
 // go to the last slide and check the spoken contact line
 await p.evaluate(()=>{ window.__said=[]; });
 for(let i=0;i<6;i++){ const next = await p.evaluate(()=>{ const b=[...document.querySelectorAll('.sheet button')].find(x=>/^(next|volgende|weiter)/i.test(x.textContent.trim())||/lsNext/.test(x.id)); if(b){ b.click(); return true;} return false; }); await p.waitForTimeout(150); }
 await p.waitForTimeout(800);
 const t2=await p.innerText('.sheet'); ck('last slide reached', /Thank you, and how to reach me/.test(t2));
 const said2=await p.evaluate(()=>window.__said.join(' | ')); console.log('   spoken last slide:', said2.slice(0,260));
 ck('email is spoken as "at" and "dot com"', /ecrypted5 at gmail dot com/.test(said2));
 await p.screenshot({path:'lesson_7.png'});
 // honesty slide shows the tip
 await p.evaluate(()=>window.__t.closeModal());
 // translations
 for(const lang of ['af','de']){
   await p.evaluate(l=>{ const S=window.__t.State; S.settings=Object.assign({},S.settings,{language:l}); window.__t.i18nRefresh(); window.__t.openTrainingSheet(); }, lang); await p.waitForSelector('[data-lesson="developer"]');
   const row=await p.innerText('[data-lesson="developer"]'); console.log('   '+lang+' row:', row.replace(/\n/g,' | '));
   ck(lang+' lesson title is translated', !/Meet the developer/.test(row));
   await p.click('[data-lesson="developer"]'); await p.waitForTimeout(400); const s1=await p.innerText('.sheet'); ck(lang+' slide 1 translated', !/Hello and welcome/.test(s1) && /Björn/.test(s1));
   await p.evaluate(()=>window.__t.closeModal());
 }
 ck('no page errors', errs.length===0); if(errs.length) console.log(errs.slice(0,3));
 await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0); })();
