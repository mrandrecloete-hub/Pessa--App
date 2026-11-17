const { chromium } = require('playwright');
const D=(process.env.PESA_OUT||require('os').tmpdir()+'/pesa-tests/');
(async()=>{
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:390,height:844}, serviceWorkers:'block'});
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
  await p.fill('#rcCompanyName','Dinner'); await p.fill('#rcOwnerName','Alice'); await p.fill('#rcOwnerEmail','a@x.com');
  await p.fill('#rcOwnerPassword','aaaa1111'); await p.fill('#rcOwnerPassword2','aaaa1111'); await p.click('#rcSubmit');
  await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card'); await p.evaluate(()=>{ try{ window.__t.btSave({ setupHidden:true }); window.__t.pfSave({ remindAt:Date.now() }); }catch(e){} });
  await p.evaluate(async()=>{ const r=window.__t.refs; await r.products.doc().set({name:'Bread',sellPrice:17.99,costPrice:13,stockQty:2,createdAt:new Date().toISOString()}); await r.products.doc().set({name:'Milk',sellPrice:30,costPrice:20,stockQty:50,createdAt:new Date().toISOString()}); });
  // owner invites two employees via UI
  async function invite(name, role, job){
    await p.evaluate(()=>window.__t.openStaffSheet(null)); await p.waitForSelector('#sfName');
    await p.fill('#sfName',name); await p.selectOption('#sfRole',role); await p.fill('#sfJob',job); await p.click('#sfSave'); await p.waitForSelector('#invWa');
    if(name==='Sam') await p.screenshot({path:D+'emp1_invite.png'});
    await p.evaluate(()=>window.__t.closeModal());
    return p.evaluate((n)=>window.__t.State.users.find(u=>u.name===n).inviteCode, name);
  }
  const c1 = await invite('Sam','cashier','Front till cashier'); const c2 = await invite('Stella','stockclerk','Stock room');
  console.log('codes',c1,c2);
  // pending shouldn't be on login
  await p.evaluate(()=>{ localStorage.clear(); window.__t.State.session=null; window.__t.showAuthScreen('login'); }); await p.waitForTimeout(300);
  console.log('login tiles', await p.$$eval('[data-staff]',e=>e.map(x=>x.textContent.trim().slice(0,12))));
  async function signup(code, pw, shot){
    await p.click('#empSignupBtn'); await p.fill('#empCode','000000'); await p.click('#empNext'); console.log('bad:', (await p.textContent('#empErr')).slice(0,50));
    await p.fill('#empCode',code); await p.click('#empNext'); await p.waitForSelector('#empPw');
    if(shot) await p.screenshot({path:D+'emp2_signup.png'});
    await p.fill('#empPhone','0811112222'); await p.fill('#empPw',pw); await p.fill('#empPw2',pw); await p.click('#empCreate');
    await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.me-hero');
  }
  await signup(c1,'4321',true);
  console.log('tab', await p.evaluate(()=>window.__t.State.tab), 'session', await p.evaluate(()=>JSON.stringify(window.__t.State.session)));
  await p.screenshot({path:D+'emp3_cashier_dash.png',fullPage:false});
  // sell something via POS tab; check drawer menu
  await p.click('#menuBtn'); await p.waitForTimeout(300); console.log('cashier menu', await p.$$eval('[data-drawer-row]',e=>e.map(x=>x.textContent.trim().replace(/\s+/g,' ').slice(0,22)))); await p.screenshot({path:D+'emp4_menu.png'});
  await p.evaluate(()=>{document.querySelector('#drawerCloseBtn').click();});
  // try forbidden tab
  await p.evaluate(()=>{window.__t.setTab('reports')}); await p.waitForTimeout(200); console.log('forbidden tab shows:', (await p.innerText('#content')).slice(0,60).replace(/\n/g,' '));
  // logout cashier then stock clerk signup
  await p.evaluate(()=>{ localStorage.removeItem('pesa_session_v2'); window.__t.State.session=null; window.__t.showAuthScreen('login'); }); await p.waitForTimeout(200);
  await signup(c2,'stock123',false);
  await p.screenshot({path:D+'emp5_stock_dash.png'});
  await p.click('#menuBtn'); await p.waitForTimeout(300); console.log('stock menu', await p.$$eval('[data-drawer-row]',e=>e.map(x=>x.textContent.trim().replace(/\s+/g,' ').slice(0,22))));
  await p.evaluate(()=>{document.querySelector('#drawerCloseBtn').click();});
  await p.click('[data-me=profile]'); await p.waitForTimeout(200); await p.screenshot({path:D+'emp6_profile.png'});
  console.log(errs); await b.close();
})();
