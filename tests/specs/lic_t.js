const { chromium } = require('playwright'); const boot=require('./biz_boot.js');
(async()=>{
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:430,height:900}, serviceWorkers:'block'});
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  const iss = await ctx.newPage(); iss.on('pageerror',e=>errs.push('issuer '+e.message));
  await iss.goto('http://localhost:8933/tools/issuer.html'); await iss.click('#kGen'); await iss.waitForFunction(()=>document.getElementById('kPub').value.length>20);
  const pub = JSON.parse(await iss.inputValue('#kPub')); console.log('public key', Object.keys(pub).join(','));
  await boot(p);
  const st = ()=>p.evaluate(()=>{ const s=window.__t.licStatus(); return JSON.stringify(s); });
  console.log('off by default:', await st());
  await p.evaluate(pub=>window.__t.setLic({pub}),pub);
  console.log('trial:', await st());
  const ref = await p.evaluate(()=>window.__t.licRef()); console.log('ref', ref, /^PESA-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(ref));
  console.log('banner html', (await p.evaluate(()=>window.__t.licBannerHtml())).replace(/<[^>]+>/g,'').slice(0,90));
  // issue a key with the issuer UI
  const issue = async(ref,plan,months,from)=>{ await iss.fill('#iRef',ref); await iss.selectOption('#iPlan',plan); await iss.selectOption('#iMonths',String(months)); await iss.fill('#iFrom',from||''); await iss.click('#iGo'); await iss.waitForFunction(()=>document.getElementById('iOut').value.startsWith('PESA1.')); return iss.inputValue('#iOut'); };
  const key1 = await issue(ref,'starter',1); console.log('key len', key1.length, key1.slice(0,12));
  console.log('issuer message:', (await iss.innerText('#issueMsg')).slice(0,120));
  console.log('issuer check:', await (async()=>{ await iss.fill('#cKey',key1); await iss.click('#cGo'); await iss.waitForTimeout(300); return (await iss.innerText('#checkMsg')).slice(0,100); })());
  // expire the trial: make company 20 days old (the reference changes with it)
  await p.evaluate(async()=>{ await window.__t.refs.company.update({createdAt:new Date(Date.now()-20*864e5).toISOString()}); }); await p.waitForTimeout(300);
  const ref2 = await p.evaluate(()=>window.__t.licRef()); console.log('ref changed', ref!==ref2);
  await p.evaluate(()=>window.__t.licCheck()); await p.waitForTimeout(500);
  console.log('expired trial:', await st(), 'gate shown', await p.locator('#licGate').count());
  await p.screenshot({path:'lic_gate.png'});
  // wrong-business key is refused
  await p.click('#lgKey'); await p.waitForSelector('#lcKey');
  await p.fill('#lcKey', key1); await p.click('#lcGo'); await p.waitForTimeout(500); console.log('wrong business:', (await p.innerText('#lcMsg')).slice(0,100));
  // tampered key
  const key2 = await issue(ref2,'starter',1);
  const tam = key2.slice(0,-3) + (key2.endsWith('AAA')?'BBB':'AAA');
  await p.fill('#lcKey', tam); await p.click('#lcGo'); await p.waitForTimeout(500); console.log('tampered:', (await p.innerText('#lcMsg')).slice(0,100));
  await p.fill('#lcKey','hello'); await p.click('#lcGo'); await p.waitForTimeout(300); console.log('junk:', (await p.innerText('#lcMsg')).slice(0,100));
  // correct key
  await p.fill('#lcKey', key2); await p.click('#lcGo'); await p.waitForTimeout(900);
  console.log('after activate:', await st(), 'gate', await p.locator('#licGate').count(), 'key saved', await p.evaluate(()=>!!window.__t.State.settings.licenseKey));
  // plan limits (starter: 3 users)
  const lim = await p.evaluate(async()=>{ const t=window.__t, out=[]; for(let i=0;i<4;i++){ const ok=t.licAllow('users'); out.push(ok); if(ok) await t.refs.users.doc().set({name:'U'+i,role:'cashier',passHash:'x',active:true}); await new Promise(r=>setTimeout(r,80)); } return out; });
  console.log('user limit pattern (owner counts)', JSON.stringify(lim), 'branch allowed', await p.evaluate(()=>[window.__t.licAllow('branches')]));
  // grace and expired subscription via keys signed with the issuer's own private key
  const mk = (exp)=>p.evaluate(async([ref,exp])=>{ const j=JSON.parse(localStorage.getItem('pesa_issuer_private_v1')); const k=await crypto.subtle.importKey('jwk',j,{name:'ECDSA',namedCurve:'P-256'},false,['sign']); const data=new TextEncoder().encode(JSON.stringify({v:1,ref,plan:'business',exp,iat:'2026-01-01'})); const sig=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},k,data)); const b=u=>btoa(String.fromCharCode(...u)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); return 'PESA1.'+b(data)+'.'+b(sig); },[ref2,exp]);
  const day=d=>new Date(Date.now()+d*864e5).toISOString().slice(0,10);
  for(const [lbl,d] of [['2 days ago',-2],['10 days ago',-10],['in 5 days',5]]){
    const k = await mk(day(d));
    await p.evaluate(async(k)=>{ window.__t.State.settings=Object.assign({},window.__t.State.settings,{licenseKey:k}); window.__t.setLic({}); await window.__t.refs.settings.set(window.__t.State.settings); },k);
    await p.evaluate(()=>window.__t.licCheck()); await p.waitForTimeout(500);
    console.log(lbl, await st(), 'gate', await p.locator('#licGate').count());
  }
  // a key that ends earlier than the current one is refused; renewal from the issuer extends
  const keyR = await issue(ref2,'business',3, day(5)); const payload = JSON.parse(Buffer.from(keyR.split('.')[1],'base64url').toString()); console.log('renewal exp', payload.exp, 'expected ~', day(5), '+3 months');
  // clock rollback
  await p.evaluate(()=>localStorage.setItem('pesa_lic_seen', String(Date.now()+30*864e5)));
  console.log('rolled back clock sees:', await st());
  console.log('errs', errs); await b.close();
})();
