const { chromium } = require('playwright');
const D=(process.env.PESA_OUT||'/tmp/pesa-tests/');
(async()=>{
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:390,height:844}, serviceWorkers:'block', acceptDownloads:true});
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
  await p.fill('#rcCompanyName','Dinner'); await p.fill('#rcOwnerName','Alice'); await p.fill('#rcOwnerEmail','a@x.com');
  await p.fill('#rcOwnerPassword','aaaa1111'); await p.fill('#rcOwnerPassword2','aaaa1111'); await p.click('#rcSubmit');
  await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card');
  await p.evaluate(async()=>{ const r=window.__t.refs; await r.products.doc().set({name:'Bread',sellPrice:17.99,costPrice:13,stockQty:2,createdAt:new Date().toISOString()}); await r.products.doc().set({name:'Milk',sellPrice:20,costPrice:12,stockQty:0,createdAt:new Date().toISOString()}); });
  await p.evaluate(()=>window.__t.openStaffSheet(null)); await p.waitForSelector('#sfName');
  await p.fill('#sfName','Sam'); await p.selectOption('#sfRole','cashier'); await p.fill('#sfJob','Front till'); await p.click('#sfSave'); await p.waitForSelector('#invWa');
  await p.evaluate(()=>window.__t.closeModal());
  const code = await p.evaluate(()=>window.__t.State.users.find(u=>u.name==='Sam').inviteCode);
  console.log('approvedBy', await p.evaluate(()=>{const u=window.__t.State.users.find(u=>u.name==='Sam');return u.approvedBy+' pos:'+u.posAccess;}));
  await p.evaluate(()=>{ localStorage.clear(); window.__t.State.session=null; window.__t.showAuthScreen('login'); }); await p.waitForTimeout(300);
  await p.click('#empSignupBtn'); await p.fill('#empCode',code); await p.click('#empNext'); await p.waitForSelector('#empPw');
  await p.fill('#empPhone','0811112222'); await p.fill('#empPw','4321'); await p.fill('#empPw2','4321'); await p.click('#empCreate');
  await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.me-hero');
  console.log('cashier menu', await p.evaluate(()=>{document.querySelector('#menuBtn').click(); return null;}));
  await p.waitForTimeout(300); console.log(await p.$$eval('[data-drawer-row]',e=>e.map(x=>x.textContent.trim().replace(/\s+/g,' ').slice(0,22)))); await p.evaluate(()=>document.querySelector('#drawerCloseBtn').click());
  await p.screenshot({path:D+'tm1_cashier_dash.png'});
  // POS tile for Sam with PIN
  await p.evaluate(()=>{ window.__t.State.session=null; window.__t.posOpen(); }); await p.waitForTimeout(400);
  console.log('pos tiles', await p.$$eval('[data-pu]',e=>e.map(x=>x.textContent.trim().slice(0,12))));
  await p.evaluate(()=>{ window.__t.POS.open && 0; });
  await p.evaluate(()=>{ const T=window.__t; const o=T.State.users.find(x=>x.role==='owner'); T.State.session={userId:o.id,name:o.name,role:'owner'}; T.POS.open=false; document.querySelector('#posRoot').style.display='none'; document.querySelector('#posRoot').innerHTML=''; });
  // data: a till + sales for Sam
  await p.evaluate(async()=>{ const T=window.__t, r=T.refs, u=T.State.users.find(x=>x.name==='Sam'); const now=new Date().toISOString();
    const t=r.tills.doc(); await t.set({cashierId:u.id,cashierName:'Sam',openingFloat:100,openedAt:now,status:'open'});
    for(const m of ['cash','card','cash']) await r.sales.doc().set({items:[{name:'Bread',qty:2,unitPrice:17.99,lineTotal:35.98}],total:35.98,cost:26,profit:9.98,paymentMethod:m,cashierName:'Sam',createdAt:now,tillId:t.id,payerName:m==='card'?'Bob':''}); });
  await p.waitForTimeout(400);
  // owner session
  await p.evaluate(()=>{ const T=window.__t; const o=T.State.users.find(x=>x.role==='owner'); T.State.session={userId:o.id,name:o.name,role:'owner'}; document.querySelector('#posRoot').style.display='none'; T.POS.open=false; document.getElementById('app').style.display=''; document.getElementById('authScreen').style.display='none'; T.setTab('team'); });
  await p.waitForTimeout(500); console.log('team tab text:', (await p.innerText('#content')).replace(/\n+/g,' | ').slice(0,420));
  await p.screenshot({path:D+'tm2_owner_team.png'});
  await p.click('[data-trku]'); await p.waitForTimeout(300); await p.screenshot({path:D+'tm3_detail.png'}); await p.click('#sdMsg'); await p.waitForSelector('#cmBody');
  await p.fill('#cmTitle','Closing'); await p.fill('#cmBody','Please count the bread before closing.'); await p.click('[data-cmk=instruction]'); await p.click('#cmUrgent'); await p.click('#cmSend'); await p.waitForTimeout(400);
  console.log('messages', await p.evaluate(()=>JSON.stringify(window.__t.State.messages.map(m=>[m.to,m.toName,m.kind,m.urgent]))));
  // broadcast
  await p.click('[data-trkmsg=all]'); await p.waitForSelector('#cmBody'); await p.fill('#cmBody','Meeting at 8.'); await p.click('#cmSend'); await p.waitForTimeout(300);
  // switch to Sam
  await p.evaluate(()=>{ const T=window.__t; const u=T.State.users.find(x=>x.name==='Sam'); T.State.session={userId:u.id,name:u.name,role:'cashier'}; T.State.till.current=T.State.tillSessions.find(t=>t.cashierId===u.id&&t.status==='open'); T.setTab('me'); });
  await p.waitForTimeout(500); await p.screenshot({path:D+'tm4_sam_dash.png'});
  console.log('unread', await p.evaluate(()=>window.__t.State.messages.length), (await p.$$eval('.me-msg',e=>e.map(x=>x.textContent.trim().slice(0,90)))));
  await p.click('.me-msg[data-me=inbox]'); await p.waitForTimeout(300); await p.screenshot({path:D+'tm5_inbox.png'}); await p.click('[data-msg]'); await p.waitForTimeout(300); await p.click('#msOk'); await p.waitForTimeout(300);
  console.log('readBy', await p.evaluate(()=>JSON.stringify(window.__t.State.messages.map(m=>Object.keys(m.readBy||{}).length))));
  // work report
  await p.click('[data-me=report]'); await p.waitForSelector('#wrDl'); await p.screenshot({path:D+'tm6_report.png'});
  const [dl]=await Promise.all([p.waitForEvent('download',{timeout:15000}).catch(()=>null), p.click('#wrDl')]); await p.waitForTimeout(1500);
  console.log('download', dl && dl.suggestedFilename(), 'workReports', await p.evaluate(()=>window.__t.State.workReports.length));
  if(dl) await dl.saveAs(D+'tm_workreport.pdf');
  await p.evaluate(()=>window.__t.closeModal());
  await p.evaluate(()=>window.__t.setTab('records')); await p.waitForTimeout(400); await p.screenshot({path:D+'tm7_records.png'});
  console.log('records:', (await p.innerText('#content')).replace(/\n+/g,' | ').slice(0,300));
  await p.click('[data-recrep]'); await p.waitForSelector('#rdDl'); console.log('record sheet buttons', await p.$$eval('.modal button, .sheet button, #modalRoot button',e=>e.map(x=>x.textContent.trim()))); await p.screenshot({path:D+'tm8_recdoc.png'}); await p.evaluate(()=>window.__t.closeModal());
  await p.click('[data-recsec=receipts]'); await p.waitForTimeout(200); await p.click('[data-recsale]'); await p.waitForSelector('#rdDl'); await p.evaluate(()=>window.__t.closeModal());
  console.log('forbidden team tab for cashier ->', await p.evaluate(()=>{window.__t.setTab('team'); return window.__t.State.tab;}));
  console.log(errs); await b.close();
})();
