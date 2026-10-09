const { chromium } = require('playwright'); const fs=require('fs');
const D=(process.env.PESA_OUT||require('os').tmpdir()+'/pesa-tests/');
let fail=0; const ck=(n,c)=>{ console.log((c?'  ok   ':'  FAIL ')+n); if(!c){fail++;} };
(async()=>{
  const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
  await p.fill('#rcCompanyName','Dinner Shop'); await p.fill('#rcOwnerName','Alice'); await p.fill('#rcOwnerEmail','a@x.com');
  await p.fill('#rcOwnerPassword','aaaa1111'); await p.fill('#rcOwnerPassword2','aaaa1111'); await p.click('#rcSubmit');
  await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card'); await p.evaluate(()=>{ try{ window.__t.btSave({ setupHidden:true }); window.__t.pfSave({ remindAt:Date.now() }); }catch(e){} });
  // owner home shows the reminder note
  ck('owner home shows reminder note', !!(await p.$('.hero-card')) && /Please fill in the pilot feedback form/.test(await p.innerText('#content')));
  await p.evaluate(()=>window.__t.pfSave({remindAt:0}));
  // owner: start the clock from the sheet
  await p.evaluate(()=>window.__t.openPilotFormSheet()); await p.waitForSelector('#pvStartNow'); await p.click('#pvStartNow'); await p.waitForTimeout(400);
  const t1=await p.innerText('.sheet'); ck('48 hour clock started and shown', /The pilot ends in 48 hours/.test(t1)); await p.screenshot({path:D+'pf2_owner_sheet.png'});
  await p.evaluate(()=>window.__t.closeModal());
  // invite cashier + sign up
  await p.evaluate(()=>window.__t.openStaffSheet(null)); await p.waitForSelector('#sfName'); await p.fill('#sfName','Sam'); await p.selectOption('#sfRole','cashier'); await p.fill('#sfJob','Front till'); await p.click('#sfSave'); await p.waitForSelector('#invWa'); await p.evaluate(()=>window.__t.closeModal());
  const code=await p.evaluate(()=>window.__t.State.users.find(u=>u.name==='Sam').inviteCode);
  await p.evaluate(()=>{ localStorage.removeItem('pesa_session_v2'); window.__t.State.session=null; window.__t.showAuthScreen('login'); }); await p.waitForTimeout(300);
  await p.click('#empSignupBtn'); await p.fill('#empCode',code); await p.click('#empNext'); await p.waitForSelector('#empPw');
  await p.fill('#empPw','4321'); await p.fill('#empPw2','4321'); await p.click('#empCreate');
  await p.waitForSelector('#cnAgree, .me-hero',{state:'visible',timeout:8000}).catch(()=>{}); if(await p.$('#cnAgree')){ await p.click('#cnAgree'); await p.click('#cnAccept'); } await p.waitForSelector('.me-hero');
  ck('cashier dashboard card is the urgent reminder', /Please fill in the pilot feedback form/.test(await p.innerText('.me-msg.urgent')) && await p.$('.me-msg.urgent[data-me="pilotform"]')!==null);
  ck('card shows hours left', /pilot ends in/i.test(await p.innerText('[data-me="pilotform"]')));
  await p.screenshot({path:D+'pf2_dash.png'});
  // reminder pop up on open (after 5s)
  await p.evaluate(()=>window.__t.pfSave({remindAt:0})); await p.evaluate(()=>window.__t.closeModal());
  await p.evaluate(()=>window.__t.pfRemindStart(0)); await p.waitForSelector('#prgo',{timeout:3000});
  ck('reminder pop up appears', true); await p.screenshot({path:D+'pf2_remind.png'});
  await p.click('#prlater'); await p.waitForTimeout(200);
  await p.evaluate(()=>window.__t.pfRemindStart(0)); await p.waitForTimeout(300);
  ck('no second pop up within 6 hours', !(await p.$('#prgo')));
  // snack nudge
  await p.evaluate(()=>window.__t.pfSave({remindAt:Date.now()-3*3600000})); await p.evaluate(()=>window.__t.pfTick()); await p.waitForSelector('#pfSnack',{timeout:2000}); ck('2 hour nudge shows a snack bar', true); await p.screenshot({path:D+'pf2_snack.png'});
  await p.click('#pfSnack [data-pfopen]'); await p.waitForSelector('#pfSubmit'); ck('snack opens the form', !(await p.$('#pfSnack')));
  // fill in
  await p.click('[data-pdev="1"]'); await p.fill('#pfShifts','Mon morning, Tue full day');
  for(const [q,k] of [[0,4],[1,5],[2,3],[3,4],[4,5],[5,2],[6,4],[7,4]]) await p.click('[data-pr="'+q+':'+k+'"]');
  await p.click('[data-pr="7:4"]'); await p.click('[data-pr="7:4"]'); // toggle off then on
  ck('toggling a rating twice clears then sets', await p.evaluate(()=>document.querySelector('[data-pr="7:4"]').classList.contains('on')));
  const nums=['40','3','1','2','0','1']; for(let i=0;i<6;i++) await p.fill('[data-pc="'+i+'"]',nums[i]);
  await p.click('[data-po="0:1"]'); await p.click('[data-po="1:0"]');
  await p.fill('#pfLDo','Scanning milk'); await p.fill('#pfLWrong','Scanner did not beep and the item was not added'); await p.click('[data-pb="A"]'); await p.click('#pfLAdd');
  await p.fill('#pfLWrong','Receipt would not print'); await p.click('[data-pb="X"]'); await p.click('#pfLAdd');
  await p.fill('[data-pw="0"]','Fast checkout and easy to learn.'); await p.fill('[data-pw="3"]','Make the barcode scanner faster.');
  await p.click('[data-pv="0:0"]'); await p.click('[data-pv="1:1"]');
  ck('two problems listed', (await p.$$('#pfLog .row')).length===2);
  await p.screenshot({path:D+'pf2_fill.png',fullPage:false});
  // draft persists across reload
  await p.waitForTimeout(500);
  const d1=await p.evaluate(()=>window.__t.pfMine().draft); ck('draft saved as you go', d1 && d1.ratings[0]===4 && d1.log.length===2 && d1.words[3].length>5);
  await p.evaluate(()=>window.__t.closeModal()); await p.evaluate(()=>window.__t.openPilotFillSheet()); await p.waitForSelector('#pfSubmit');
  ck('draft reloads into the form', await p.evaluate(()=>document.querySelector('[data-pr="0:4"]').classList.contains('on') && document.querySelectorAll('#pfLog .row').length===2 && document.querySelector('[data-pw="0"]').value.indexOf('Fast')===0));
  // submit
  await p.click('#pfSubmit'); await p.waitForSelector('#pfWa',{timeout:4000}); ck('thank you sheet shows send buttons', !!(await p.$('#pfMail')) && !!(await p.$('#pfPdf')));
  await p.screenshot({path:D+'pf2_sent.png'});
  const hrefs=await p.evaluate(()=>({wa:document.getElementById('pfWa').href, mail:document.getElementById('pfMail').href}));
  ck('WhatsApp link goes to the developer number', /wa\.me\/264818211692\?text=/.test(hrefs.wa)); ck('email link goes to the developer address', /^mailto:ecrypted5@gmail\.com\?subject=/.test(hrefs.mail));
  const wtxt=decodeURIComponent(hrefs.wa.split('text=')[1]); ck('message carries the answers', /Pesa pilot feedback/.test(wtxt) && /From: Sam/.test(wtxt) && /Scanner did not beep/.test(wtxt) && /Make the barcode scanner faster/.test(wtxt)); console.log('   message length',wtxt.length);
  const mine=await p.evaluate(()=>window.__t.pfMine()); ck('submission stored, draft cleared', mine.subs.length===1 && mine.draft===null);
  ck('no longer due after submitting', await p.evaluate(()=>window.__t.pfDue())===false);
  // honest status: only after tapping
  ck('nothing marked sent before tapping', !(await p.evaluate(()=>window.__t.pfMine().subs[0].sent.wa)));
  const [pop]=await Promise.all([ctx.waitForEvent('page',{timeout:5000}).catch(()=>null), p.click('#pfWa')]); if(pop) await pop.close().catch(()=>{});
  await p.waitForTimeout(300); ck('tapping WhatsApp records that it was opened', !!(await p.evaluate(()=>window.__t.pfMine().subs[0].sent.wa)) && /WhatsApp opened/.test(await p.innerText('#pfSentNote')));
  // PDF copy
  await p.evaluate(()=>window.__t.ensureJsPDF());
  const pdf=await p.evaluate(()=>{ const a=window.__t.pfMine().subs[0].ans; const d=window.__t.pilotFormPdf({name:a.name,shop:a.shop,start:a.start?new Date(a.start):null,ans:a}); return {pages:d.getNumberOfPages(), data:d.output('datauristring').split(',')[1]}; });
  fs.writeFileSync(D+'pf2_filled.pdf',Buffer.from(pdf.data,'base64')); console.log('   filled pdf pages',pdf.pages);
  // dashboard now calm
  await p.evaluate(()=>{ window.__t.closeModal(); window.__t.render(); }); await p.waitForTimeout(300);
  ck('card now says submitted, no urgent style', /submitted/i.test(await p.innerText('[data-me="pilotform"]')) && !(await p.$('.me-msg.urgent[data-me="pilotform"]')));
  // af
  await p.evaluate(()=>{ const S=window.__t.State; S.settings=Object.assign({},S.settings,{language:'af'}); window.__t.langEnsure('af'); }); await p.waitForTimeout(800);
  await p.evaluate(()=>{ window.__t.i18nRefresh(); window.__t.pfSave({subs:[],draft:null}); window.__t.openPilotFillSheet(); }); await p.waitForSelector('#pfSubmit');
  const af=await p.innerText('.sheet'); ck('Afrikaans form', /Tik jou antwoorde/.test(af) && /Voeg hierdie probleem by/.test(af) && /Stoor en dien in/.test(af));
  await p.evaluate(()=>{ window.__t.closeModal(); const S=window.__t.State; S.settings=Object.assign({},S.settings,{language:'en'}); window.__t.i18nRefresh(); });
  ck('no page errors', errs.length===0); if(errs.length) console.log(errs.slice(0,3));
  await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
