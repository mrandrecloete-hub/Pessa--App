const { chromium } = require('playwright');
(async()=>{
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:1100,height:900}, serviceWorkers:'block'}); await ctx.addInitScript(()=>{ try{ new MutationObserver(()=>{ document.querySelectorAll('.st-grp').forEach(d=>{ if(!d.open) d.open=true; }); }).observe(document,{childList:true,subtree:true}); }catch(e){} });
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  const cdp = await ctx.newCDPSession(p); await cdp.send('WebAuthn.enable');
  const {authenticatorId} = await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:false,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
  const reg = async()=>{ await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
    await p.fill('#rcCompanyName','Dinner Shop'); await p.fill('#rcOwnerName','Alice'); await p.fill('#rcOwnerEmail','a@x.com');
    await p.fill('#rcOwnerPassword','aaaa1111'); await p.fill('#rcOwnerPassword2','aaaa1111'); await p.click('#rcSubmit');
    await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card'); await p.evaluate(()=>{ try{ window.__t.btSave({ setupHidden:true, simpleMode:false }); window.__t.pfSave({ remindAt:Date.now() }); }catch(e){} }); };
  await reg();
  console.log('supported', await p.evaluate(()=>PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()));
  await p.evaluate(()=>document.getElementById('settingsBtn').click()); await p.waitForSelector('#bioSetup',{timeout:5000});
  await p.click('#bioSetup'); await p.waitForSelector('#bioTest',{timeout:5000});
  console.log('enrolled', await p.evaluate(()=>Object.keys(window.__t.bioData().creds).length), 'hasPk', await p.evaluate(()=>!!Object.values(window.__t.bioData().creds)[0].pk));
  await p.click('#bioTest'); await p.waitForTimeout(500); console.log('test msg:', (await p.innerText('#bioMsg')).trim());
  await p.check('#bioLock'); await p.check('#bioApprove'); await p.waitForTimeout(300);
  console.log('flags', await p.evaluate(()=>({lock:window.__t.bioData().lock, ap:window.__t.State.settings.bioApprove})));
  // fails when device says not verified
  await cdp.send('WebAuthn.setUserVerified',{authenticatorId,isUserVerified:false});
  await p.click('#bioTest'); await p.waitForTimeout(600); console.log('unverified msg:', (await p.innerText('#bioMsg')).trim());
  await cdp.send('WebAuthn.setUserVerified',{authenticatorId,isUserVerified:true});
  await p.keyboard.press('Escape'); await p.evaluate(()=>window.__t.closeModal());
  // sensitive gate: ok path
  let ran=0; await p.evaluate(()=>{ window.__ran=0; window.__t.confirmSheet('Delete test?','x','Delete',function(){ window.__ran++; },true,true); });
  await p.click('#cfOk'); await p.waitForTimeout(700); console.log('gate ok ran', await p.evaluate(()=>window.__ran));
  // gate: unverified -> password fallback
  await cdp.send('WebAuthn.setUserVerified',{authenticatorId,isUserVerified:false});
  await p.evaluate(()=>{ window.__t.confirmSheet('Delete test?','x','Delete',function(){ window.__ran++; },true,true); });
  await p.click('#cfOk'); await p.waitForSelector('#apPass',{timeout:4000}); console.log('ran after fail (should be 1)', await p.evaluate(()=>window.__ran));
  await p.fill('#apPass','wrongwrong'); await p.click('#apOk'); await p.waitForTimeout(300); console.log('wrong pw err', (await p.innerText('#apErr')).trim());
  await p.fill('#apPass','aaaa1111'); await p.click('#apOk'); await p.waitForTimeout(400); console.log('ran after pw (should be 2)', await p.evaluate(()=>window.__ran));
  await cdp.send('WebAuthn.setUserVerified',{authenticatorId,isUserVerified:true});
  // reload -> lock screen -> auto unlock
  await p.reload(); await p.waitForTimeout(1800);
  console.log('after reload app visible', await p.locator('.hero-card').isVisible().catch(()=>false), 'lock screen', await p.locator('#blGo').count());
  // lock with verification failing -> stays locked, button shows message
  await cdp.send('WebAuthn.setUserVerified',{authenticatorId,isUserVerified:false});
  await p.reload(); await p.waitForSelector('#blGo',{timeout:5000}); await p.waitForTimeout(800); console.log('locked while unverified:', await p.locator('#blGo').isVisible(), 'app hidden', !(await p.locator('.hero-card').isVisible().catch(()=>false)));
  await p.click('#blGo'); await p.waitForTimeout(600); console.log('lock msg:', (await p.innerText('#blMsg')).trim());
  await p.screenshot({path:'bio_lock.png'});
  await cdp.send('WebAuthn.setUserVerified',{authenticatorId,isUserVerified:true});
  await p.click('#blGo'); await p.waitForSelector('.hero-card',{timeout:5000}); console.log('unlocked via button');
  // use password instead
  await p.reload(); await p.waitForSelector('#blOther',{timeout:5000}); await cdp.send('WebAuthn.setUserVerified',{authenticatorId,isUserVerified:false}); await p.click('#blOther'); await p.waitForSelector('#soLoginBtn'); await p.click('#soLoginBtn'); await p.waitForSelector('[data-staff]'); console.log('went to login');
  // bio login button
  await cdp.send('WebAuthn.setUserVerified',{authenticatorId,isUserVerified:true});
  await p.waitForTimeout(2500); await p.click('[data-staff]'); await p.waitForSelector('#loginBioBtn'); await p.waitForTimeout(800); await p.screenshot({path:'bio_login.png'});
  await p.click('#loginBioBtn'); await p.waitForSelector('.hero-card',{timeout:5000}); console.log('signed in with bio');
  // remove
  await p.evaluate(()=>document.getElementById('settingsBtn').click()); await p.waitForSelector('#bioDel'); await p.screenshot({path:'bio_settings.png'}); await p.click('#bioDel'); await p.waitForSelector('#bioSetup'); console.log('removed ->', await p.evaluate(()=>Object.keys(window.__t.bioData().creds).length));
  console.log('errs',errs); await b.close();
})();
