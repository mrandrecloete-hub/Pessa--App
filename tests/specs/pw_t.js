const { chromium } = require('playwright'); const boot=require('./biz_boot.js');
(async()=>{
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:1100,height:900}, serviceWorkers:'block'});
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await boot(p);
  const owner = ()=>p.evaluate(()=>{ const u=window.__t.State.users.find(x=>x.role==='owner'); return {id:u.id, h:u.passHash}; });
  let o = await owner(); console.log('new owner hash format', /^p1\$150000\$/.test(o.h), o.h.length);
  console.log('check right/wrong', await p.evaluate(async(h)=>[await window.__t.pwCheck('Tr1cky-Pass',h), await window.__t.pwCheck('Tr1cky-Pasx',h), await window.__t.pwCheck('Tr1cky-Pass','')],o.h));
  console.log('two hashes differ (salted)', await p.evaluate(async()=> (await window.__t.pwHash('same'))!==(await window.__t.pwHash('same'))));
  console.log('timing ms', await p.evaluate(async()=>{ const t=performance.now(); await window.__t.pwHash('x'); return Math.round(performance.now()-t); }));
  // downgrade owner to legacy sha256 and sign in again
  await p.evaluate(async(id)=>{ const e=new TextEncoder().encode('Tr1cky-Pass'); const d=await crypto.subtle.digest('SHA-256',e); const hex=[...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join(''); await window.__t.refs.users.doc(id).update({passHash:hex}); },o.id);
  await p.waitForTimeout(300); console.log('legacy now', (await owner()).h.length);
  // sign out via state and log in with the UI
  await p.evaluate(()=>{ window.__t.State.session=null; localStorage.removeItem('pesa_session'); });
  await p.evaluate(()=>window.__t.showAuthScreen('login')); await p.waitForTimeout(600);
  const vis = await p.evaluate(()=>document.getElementById('authScreen').innerText.slice(0,80).replace(/\n/g,' ')); console.log('screen:', vis);
  if(await p.locator('#soLoginBtn').count()) await p.click('#soLoginBtn');
  await p.waitForSelector('[data-staff],#loginPass'); if(await p.locator('[data-staff]').count()) await p.click('[data-staff]');
  await p.waitForSelector('#loginPass'); await p.fill('#loginPass','wrongpass1'); await p.click('#loginUnlockBtn'); await p.waitForTimeout(500);
  console.log('wrong pw error:', (await p.innerText('#loginError')).trim().slice(0,60));
  await p.fill('#loginPass','Tr1cky-Pass'); await p.click('#loginUnlockBtn'); await p.waitForSelector('.hero-card',{timeout:6000}); console.log('signed in (legacy hash)');
  await p.waitForTimeout(800); o = await owner(); console.log('upgraded to p1', /^p1\$/.test(o.h));
  // cashier pin legacy + manager verify
  const r = await p.evaluate(async()=>{ const t=window.__t; const h=await (async()=>{const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('1234'));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('');})();
    const ref=t.refs.users.doc(); await ref.set({name:'Mgr',role:'manager',passHash:h,active:true,createdAt:new Date().toISOString()}); await new Promise(r=>setTimeout(r,200));
    const ok = await t.pwCheck('1234',h), bad = await t.pwCheck('1235',h);
    const mgr = t.State.users.find(x=>x.name==='Mgr'); t.pwUpgrade(mgr,'1234'); await new Promise(r=>setTimeout(r,900));
    return {ok,bad,after:t.State.users.find(x=>x.name==='Mgr').passHash.slice(0,3)}; });
  console.log('legacy PIN check', r);
  console.log('errs', errs); await b.close();
})();
