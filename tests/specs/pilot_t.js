const { chromium } = require('playwright'); const fs=require('fs');
const D=(process.env.PESA_OUT||'/tmp/pesa-tests/');
let fail=0; const ck=(n,c)=>{ console.log((c?'  ok   ':'  FAIL ')+n); if(!c){fail++;} };
(async()=>{
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:390,height:844}, serviceWorkers:'block'});
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
  await p.fill('#rcCompanyName','Dinner Shop'); await p.fill('#rcOwnerName','Alice'); await p.fill('#rcOwnerEmail','a@x.com');
  await p.fill('#rcOwnerPassword','aaaa1111'); await p.fill('#rcOwnerPassword2','aaaa1111'); await p.click('#rcSubmit');
  await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card');
  // owner: menu row + sheet + card toggle
  await p.click('#menuBtn'); await p.waitForTimeout(300);
  const rows=await p.$$eval('[data-drawer-row]',e=>e.map(x=>x.textContent.trim().replace(/\s+/g,' ')));
  ck('owner menu has Pilot feedback form', rows.some(r=>/Pilot feedback form/.test(r)));
  await p.evaluate(()=>{ const b=[...document.querySelectorAll('[data-drawer-row="pilotform"]')].find(x=>x.offsetParent!==null)||document.querySelector('[data-drawer-row="pilotform"]'); b.click(); }); await p.waitForSelector('#pvGo');
  ck('owner sees card toggle', !!(await p.$('#pvCard')));
  ck('owner prefill not ticked by default', !(await p.isChecked('#pvPrefill')));
  await p.screenshot({path:D+'pf_sheet_owner.png'});
  await p.evaluate(()=>window.__t.closeModal());
  // invite cashier
  async function invite(name, role, job){
    await p.evaluate(()=>window.__t.openStaffSheet(null)); await p.waitForSelector('#sfName');
    await p.fill('#sfName',name); await p.selectOption('#sfRole',role); await p.fill('#sfJob',job); await p.click('#sfSave'); await p.waitForSelector('#invWa');
    await p.evaluate(()=>window.__t.closeModal());
    return p.evaluate((n)=>window.__t.State.users.find(u=>u.name===n).inviteCode, name);
  }
  const c1 = await invite('Sam','cashier','Front till'); const c2 = await invite('Stella','stockclerk','Stock room');
  async function signupFlow(code,pw){
    await p.evaluate(()=>{ localStorage.removeItem('pesa_session_v2'); window.__t.State.session=null; window.__t.showAuthScreen('login'); }); await p.waitForTimeout(300);
    await p.click('#empSignupBtn'); await p.fill('#empCode',code); await p.click('#empNext'); await p.waitForSelector('#empPw');
    await p.fill('#empPhone','0811112222'); await p.fill('#empPw',pw); await p.fill('#empPw2',pw); await p.click('#empCreate');
    await p.waitForTimeout(1500); await p.screenshot({path:D+'pf_dbg_'+code+'.png'}); await p.waitForSelector('#cnAgree, .me-hero',{state:'visible',timeout:8000}).catch(()=>{}); if(await p.$('#cnAgree')){ await p.click('#cnAgree'); await p.click('#cnAccept'); } await p.waitForSelector('.me-hero');
  }
  for(const [who,code] of [['cashier',c1],['stockclerk',c2]]){
    await signupFlow(code, who==='cashier'?'4321':'aaaa1111');
    ck(who+': dashboard card shown', !!(await p.$('[data-me="pilotform"]')));
    if(who==='cashier') await p.screenshot({path:D+'pf_dash.png',fullPage:true});
    await p.click('[data-me="pilotform"]'); await p.waitForSelector('#pfSubmit'); ck(who+': card opens the on screen form', true); await p.evaluate(()=>{ window.__t.closeModal(); window.__t.openPilotFormSheet(); }); await p.waitForSelector('#pvGo');
    ck(who+': prefill ticked', await p.isChecked('#pvPrefill'));
    ck(who+': no card toggle', !(await p.$('#pvCard')));
    if(who==='cashier') await p.screenshot({path:D+'pf_sheet_cashier.png'});
    // build via the button -> format dropdown appears
    await p.fill('#pvStart','2026-10-05T08:00'); await p.click('#pvGo'); await p.waitForTimeout(1500);
    const txt=await p.innerText('body'); ck(who+': download choices appear after Build', /PDF|Word|Excel/i.test(txt));
    await p.screenshot({path:D+'pf_dl_'+who+'.png'});
    await p.evaluate(()=>{ document.querySelectorAll('.xp-back').forEach(x=>x.remove()); window.__t.closeModal(); });
    await p.click('#menuBtn'); await p.waitForTimeout(250);
    ck(who+': menu row present', (await p.$$('[data-drawer-row="pilotform"]')).length>=1);
    await p.evaluate(()=>document.querySelector('#drawerCloseBtn').click());
  }
  // owner back in: PDF content
  await p.evaluate(()=>{ localStorage.removeItem('pesa_session_v2'); window.__t.State.session=null; location.reload(); }); 
  await p.waitForTimeout(1500);
  // generate PDFs directly (multi-lang)
  for(const lang of ['en','af','de']){
    await p.evaluate(l=>{ const S=window.__t.State; S.settings=Object.assign({},S.settings,{language:l}); window.__t.i18nRefresh(); },lang);
    await p.evaluate(()=>window.__t.ensureJsPDF());
    const b64=await p.evaluate(()=>{ const d=window.__t.pilotFormPdf({name:'Sam',shop:'Dinner Shop',start:'2026-10-05T08:00'}); return {pages:d.getNumberOfPages(), data:d.output('datauristring').split(',')[1]}; });
    fs.writeFileSync(D+'pilot_'+lang+'.pdf',Buffer.from(b64.data,'base64')); console.log('   '+lang+' pages',b64.pages);
    ck(lang+' pdf is at most 3 pages', b64.pages>=1 && b64.pages<=3);
  }
  // toggle card off (owner)
  await p.evaluate(()=>{ window.__t.State.settings=Object.assign({},window.__t.State.settings,{pilotCard:false}); });
  ck('card hidden when pilotCard false', await p.evaluate(()=>window.__t.pilotCardHtml()===''));
  ck('no page errors', errs.length===0); if(errs.length) console.log(errs.slice(0,3));
  await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
