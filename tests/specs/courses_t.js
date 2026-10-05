const { chromium } = require('playwright'); const boot=require('./biz_boot.js'); const fs=require('fs');
let fail=0; const ck=(n,c,x)=>{ console.log((c?'  ok   ':'  FAIL ')+n+(!c&&x!==undefined?'  -> '+JSON.stringify(x).slice(0,300):'')); if(!c) fail++; };
const OUT=process.env.CRS_OUT||'/tmp/claude-0/crs';
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:412,height:900},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[];
 p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{ if(m.type()==='error' && !/TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
 await boot(p);
 // content sanity
 const info=await p.evaluate(()=>{ const C=window.__t.COURSES||[]; let q=0,bad=[],dash=0; C.forEach(c=>c.modules.forEach(m=>{ q+=m.quiz.length+m.exam.length; m.quiz.concat(m.exam).forEach(x=>{ if(x.a<0||x.a>=x.o.length) bad.push(x.q); }); })); return {n:C.length,q:q,bad:bad}; });
 ck('courses defined with valid answers', info.n>=3 && info.q>=50 && info.bad.length===0, info);
 await p.evaluate(()=>window.__t.openTrainingSheet()); await p.waitForSelector('#trCourses'); ck('Training has Real practical training button', /Real practical training/.test(await p.innerText('body')));
 await p.click('#trCourses'); await p.waitForSelector('[data-course]'); ck('course list shows', /Customer Service/i.test(await p.innerText('body')) && /Free courses/i.test(await p.innerText('body')));
 await p.click('[data-course="cs101"]'); await p.waitForSelector('[data-mod]'); ck('final exam locked at start', await p.evaluate(()=>document.querySelector('#cFinal').disabled && document.querySelector('#cCert').disabled && document.querySelector('#cAtt').disabled));
 const mods=await p.evaluate(()=>window.__t.crsCourse('cs101').modules.map(m=>m.id));
 const answer=async()=>{ // answer every question correctly by text lookup
  for(;;){ const done=await p.$('#qzDone'); if(done) return; await p.waitForSelector('[data-qo]'); const idx=await p.evaluate(()=>{ const C=window.__t.COURSES; const qt=document.querySelector('#qzBody div[style*="Georgia"]').textContent; let ans=null; C.forEach(c=>c.modules.forEach(m=>m.quiz.concat(m.exam).forEach(q=>{ if(window.__t.tr(q.q)===qt) ans=window.__t.tr(q.o[q.a]); }))); const bs=[].slice.call(document.querySelectorAll('[data-qo]')); return bs.findIndex(x=>x.textContent.trim()===ans); }); await p.click('[data-qo="'+idx+'"]'); await p.click('#qzNext'); await p.waitForTimeout(50); }
 };
 // first module: do it through the UI
 await p.click('[data-mod="'+mods[0]+'"]'); await p.waitForSelector('#mdRead'); await p.click('#mdRead'); await p.waitForSelector('#slView'); ck('slides view', /1 \/ \d+/.test(await p.innerText('#slView')));
 await p.click('[data-mt="practical"]'); await p.waitForSelector('#mdPrac'); await p.click('#mdPrac'); await p.waitForTimeout(200); ck('practical needs ticks', !(await p.evaluate(()=>window.__t.crsModState(window.__t.crsMeId(),'cs101',window.__t.crsCourse('cs101').modules[0].id).practical)));
 for(const e of await p.$$('[data-pt]')) await e.check(); await p.fill('#mdRef','I greeted three customers and listened carefully to each one.'); await p.click('#mdPrac'); await p.waitForSelector('#mdQuiz'); await p.click('#mdQuiz'); await answer(); await p.click('#qzDone'); await p.waitForSelector('#mdQuiz');
 ck('module 1 done by UI', await p.evaluate((m)=>{ const t=window.__t; return t.crsModDone(t.crsModState(t.crsMeId(),'cs101',m)); }, mods[0]));
 await p.evaluate(()=>window.__t.closeModal());
 // attendance not yet; complete read+practical for the rest directly
 await p.evaluate((ms)=>{ const t=window.__t; const me=t.crsMeId(); t.crsMut(me,p=>{ const c=p.courses.cs101; ms.slice(1).forEach(id=>{ c.modules[id]={read:true,practical:true,reflection:'Done at work with real customers today.'}; }); }); }, mods);
 const s1=await p.evaluate(()=>{ const t=window.__t; const s=t.crsSummary(t.crsMeId(),'cs101'); return {allRead:s.allRead,complete:s.complete,done:s.done}; }); ck('attendance unlocked, completion not', s1.allRead && !s1.complete, s1);
 // fail a quiz on purpose for module 2 then pass
 await p.evaluate(()=>window.__t.openModuleSheet('cs101', window.__t.crsCourse('cs101').modules[1].id,'quiz')); await p.waitForSelector('#mdQuiz'); await p.click('#mdQuiz');
 for(let i=0;i<4;i++){ await p.waitForSelector('[data-qo]'); const idx=await p.evaluate(()=>{ const C=window.__t.COURSES; const qt=document.querySelector('#qzBody div[style*="Georgia"]').textContent; let ans=null; C.forEach(c=>c.modules.forEach(m=>m.quiz.concat(m.exam).forEach(q=>{ if(window.__t.tr(q.q)===qt) ans=window.__t.tr(q.o[q.a]); }))); const bs=[].slice.call(document.querySelectorAll('[data-qo]')); return bs.findIndex(x=>x.textContent.trim()!==ans); }); await p.click('[data-qo="'+idx+'"]'); await p.click('#qzNext'); }
 await p.waitForSelector('#qzDone'); ck('all wrong shows FAIL', /FAIL/.test(await p.innerText('#qzBody')) && /0%/.test(await p.innerText('#qzBody'))); await p.click('#qzDone'); await p.waitForSelector('#mdQuiz'); await p.click('#mdQuiz'); await answer(); await p.click('#qzDone'); await p.waitForSelector('#mdQuiz'); await p.evaluate(()=>window.__t.closeModal());
 // set the rest of module quizzes
 await p.evaluate((ms)=>{ const t=window.__t; t.crsMut(t.crsMeId(),p=>{ const c=p.courses.cs101; ms.slice(2).forEach((id,i)=>{ c.modules[id].best=[100,85,75,65][i%4]; c.modules[id].attempts=1; }); }); }, mods);
 const s2=await p.evaluate(()=>{ const t=window.__t; const s=t.crsSummary(t.crsMeId(),'cs101'); return {done:s.done,total:s.total,complete:s.complete}; }); ck('all modules done, exam still needed', s2.done===s2.total && !s2.complete, s2);
 await p.evaluate(()=>window.__t.openCourseSheet('cs101')); await p.waitForSelector('#cFinal'); ck('final exam unlocked', await p.evaluate(()=>!document.querySelector('#cFinal').disabled)); await p.click('#cFinal'); await answer(); await p.click('#qzDone'); await p.waitForSelector('#cCert');
 const s3=await p.evaluate(()=>{ const t=window.__t; const s=t.crsSummary(t.crsMeId(),'cs101'); return {complete:s.complete,overall:s.overall,fin:s.finBest}; }); ck('course complete after exam', s3.complete && s3.overall>=60 && s3.fin===100, s3);
 ck('certificate buttons enabled', await p.evaluate(()=>!document.querySelector('#cCert').disabled && !document.querySelector('#cAtt').disabled));
 ck('grade scale', await p.evaluate(()=>{ const g=window.__t.crsGrade; return g(85).sym==='A'&&g(72).sym==='B'&&g(60).sym==='C'&&g(55).pass===false&&g(20).word==='Fail'; }));
 await p.evaluate(()=>window.__t.closeModal());
 // signature
 await p.evaluate(()=>window.__t.openSignatureSheet()); await p.waitForSelector('#sgPad'); const bb=await (await p.$('#sgPad')).boundingBox();
 await p.mouse.move(bb.x+40,bb.y+bb.height*0.6); await p.mouse.down(); for(let i=0;i<30;i++) await p.mouse.move(bb.x+40+i*8,bb.y+bb.height*(0.5+0.25*Math.sin(i/3))); await p.mouse.up(); await p.click('#sgSave'); await p.waitForTimeout(500);
 ck('owner signature saved', await p.evaluate(()=>/^data:image\/png/.test(window.__t.State.settings.ownerSignature||'')&&window.__t.State.settings.ownerSignatureAspect>0));
 // PDFs
 const pdfs=await p.evaluate(async()=>{ const t=window.__t, me=t.crsMeId(), c=t.crsCourse('cs101'), o={}; const g=async(k,f)=>{ const d=await f(); o[k]=d.output('datauristring').split(',')[1]; }; await g('cert',()=>t.crsCertPdf(me,'cs101','completion')); await g('att',()=>t.crsCertPdf(me,'cs101','attendance')); await g('stmt',()=>t.crsStatementPdf(me,'cs101')); await g('slides',()=>t.crsSlidesPdf(c,c.modules[0])); await g('notes',()=>t.crsNotesPdf(c,c.modules[0])); await g('work',()=>t.crsWorkbookPdf(c)); o.nos=Object.keys(t.crsCP(me,'cs101').certs||{}); return o; });
 for(const k of ['cert','att','stmt','slides','notes','work']){ fs.writeFileSync(OUT+'/'+k+'.pdf',Buffer.from(pdfs[k],'base64')); ck('pdf '+k+' generated', pdfs[k].length>3000); }
 ck('certificate numbers issued once', pdfs.nos.length===2, pdfs.nos);
 // external courses & team
 await p.evaluate(()=>window.__t.openCoursesSheet()); await p.waitForSelector('[data-extmark]'); await p.click('[data-extmark]'); await p.waitForTimeout(400); ck('external course marked', await p.evaluate(()=>Object.keys(window.__t.crsProgOf(window.__t.crsMeId()).ext||{}).length===1));
 await p.evaluate(()=>window.__t.closeModal()); await p.evaluate(()=>window.__t.openCourseTeamSheet()); await p.waitForSelector('[data-cu]'); ck('team progress lists staff', await p.evaluate(()=>document.querySelectorAll('[data-cu]').length>=1));
 ck('no page errors', errs.length===0, errs);
 await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
