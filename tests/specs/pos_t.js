const { chromium } = require('playwright');
const D=(process.env.PESA_OUT||require('os').tmpdir()+'/pesa-tests/');
(async()=>{
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:390,height:844}, serviceWorkers:'block'});
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('C:'+m.text())});
  await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
  await p.fill('#rcCompanyName','Dinner'); await p.fill('#rcOwnerName','Alice'); await p.fill('#rcOwnerEmail','a@x.com');
  await p.fill('#rcOwnerPassword','aaaa1111'); await p.fill('#rcOwnerPassword2','aaaa1111'); await p.click('#rcSubmit');
  await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card'); await p.evaluate(()=>{ try{ window.__t.btSave({ setupHidden:true }); window.__t.pfSave({ remindAt:Date.now() }); }catch(e){} });
  // data: product, cashier w/ PIN 1234
  await p.evaluate(async()=>{ const r=window.__t.refs; await r.products.doc().set({name:'Bread',sellPrice:17.99,costPrice:13,stockQty:50,createdAt:new Date().toISOString()});
    await r.products.doc().set({name:'Milk',sellPrice:30,costPrice:20,stockQty:50,createdAt:new Date().toISOString()});
    const enc=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(b=>b.toString(16).padStart(2,'0')).join('');
    await r.users.doc().set({name:'Cathy',role:'cashier',passHash:await enc('1234'),active:true,createdAt:new Date().toISOString()}); });
  await p.waitForTimeout(400);
  // open POS from drawer via function
  await p.evaluate(()=>{const S=window.__t.State;S.settings=Object.assign({},S.settings,{language:'en'});window.__t.i18nRefresh();window.__t.posOpen();}); await p.waitForTimeout(300);
  await p.screenshot({path:D+'pos1_lock.png'});
  // owner login
  await p.click('[data-pu]:has-text("Alice")'); await p.fill('#posPw','aaaa1111'); await p.click('#posPwOk'); await p.waitForSelector('#posTabBody');
  await p.screenshot({path:D+'pos2_home.png'});
  // add device via sheet with limits
  await p.click('[data-ptab=summary]'); await p.click('#posMgr'); await p.waitForSelector('#posAddBtn'); await p.click('#posAddBtn');
  await p.fill('#pdName','Counter 1'); await p.fill('#pdTid','T0001'); await p.fill('#pdPer','100'); await p.fill('#pdDayN','2'); await p.fill('#pdDay','250'); await p.fill('#pdTap','50');
  await p.click('#pdSave'); await p.waitForSelector('#pdSettle'); await p.screenshot({path:D+'pos3_dev.png'});
  const code = await p.evaluate(()=>window.__t.State.posDevices[0].linkCode); console.log('code',code);
  await p.evaluate(()=>window.__t.closeModal());
  // link
  await p.click('[data-ptab=summary]'); await p.click('#posLinkBtn'); await p.fill('#plCode','000000'); await p.click('#plOk'); console.log('bad:',await p.textContent('#plErr'));
  await p.fill('#plCode',code); await p.click('#plOk'); await p.waitForTimeout(500);
  console.log('bound', await p.evaluate(()=>!!localStorage.getItem('pesa_pos_device_'+window.__t.WS.id)));
  await p.click('[data-ptab=summary]'); await p.screenshot({path:D+'pos4_sum.png'});
  // sell: bread x7 =125.93 -> card over per swipe 100
  await p.click('[data-ptab=sell]'); for(let i=0;i<6;i++) await p.click('[data-padd]:has-text("Milk")'); // 180
  await p.screenshot({path:D+'pos5_sell.png'});
  await p.click('#posCharge'); await p.click('[data-pm=card]'); await p.waitForSelector('#posDev'); await p.screenshot({path:D+'pos6_charge.png'});
  await p.click('#confirmChargeBtn'); await p.waitForTimeout(400); console.log('ovbox', (await p.textContent('#posOverrideBox')).slice(0,80));
  await p.screenshot({path:D+'pos7_over.png'});
  await p.fill('#payerName','John Smith'); await p.click('#posOvBtn'); await p.waitForTimeout(500);
  console.log('sale', JSON.stringify(await p.evaluate(()=>{const s=window.__t.State.sales[0]; return {m:s.paymentMethod,d:s.posDeviceName,o:s.overrideBy,mode:s.entryMode,t:s.total};})));
  await p.click('#saleSkipBtn').catch(()=>{});
  // keypad quick amount 40 card
  await p.click('[data-ptab=keypad]'); for(const k of ['4','0']) await p.click('[data-ak="'+k+'"]'); await p.click('#posAmtAdd'); await p.click('#posCharge'); await p.click('[data-pm=card]'); await p.fill('#posAuth','A1'); await p.fill('#posLast4','4242');
  await p.click('#confirmChargeBtn'); await p.waitForTimeout(500); await p.click('#saleSkipBtn').catch(()=>{});
  // third swipe should hit daily count 2 (now 2 done) 
  await p.click('[data-ptab=keypad]'); for(const k of ['1','0']) await p.click('[data-ak="'+k+'"]'); await p.click('#posAmtAdd'); await p.click('#posCharge'); await p.click('[data-pm=card]');
  console.log('limit txt', (await p.textContent('#posLimitInfo')).slice(0,200)); await p.screenshot({path:D+'pos8_cnt.png'});
  await p.evaluate(()=>window.__t.closeModal()); 
  // settle
  await p.click('[data-ptab=summary]'); await p.click('#posSettle'); await p.fill('#sbTotal','220'); await p.screenshot({path:D+'pos9_settle.png'}); await p.click('#sbSave'); await p.waitForTimeout(300);
  console.log('batches', await p.evaluate(()=>window.__t.State.posBatches.length));
  await p.evaluate(()=>window.__t.closeModal());
  await p.click('[data-ptab=records]'); await p.waitForTimeout(200); await p.screenshot({path:D+'pos11_rec.png'});
  await p.click('[data-rcat=card]'); await p.click('[data-rsale]'); await p.waitForTimeout(200); await p.screenshot({path:D+'pos12_det.png'}); await p.evaluate(()=>window.__t.closeModal());
  await p.click('[data-ptab=summary]'); await p.click('#posStaff'); await p.waitForSelector('#teamAddBtn'); await p.click('#teamAddBtn'); await p.fill('#sfName','Dave'); await p.click('[data-sfmode=direct]'); await p.selectOption('#sfRole','cashier'); await p.fill('#sfPass','5555'); await p.click('#sfSave'); await p.waitForTimeout(500);
  console.log('users', await p.evaluate(()=>window.__t.State.users.map(u=>u.name).join()));
  await p.evaluate(()=>window.__t.closeModal());
  // lock then cashier wrong pin x3
  await p.click('#posLockBtn'); await p.click('[data-pu]:has-text("Cathy")');
  for(let i=0;i<3;i++){ for(const k of ['9','9','9','9']) await p.click('[data-k="'+k+'"]'); await p.waitForTimeout(250); }
  await p.screenshot({path:D+'pos10_lockout.png'}); console.log('lockout', (await p.textContent('.pos-body')).slice(0,120));
  await p.evaluate(()=>{ localStorage.removeItem('pesa_pos_lock_'+window.__t.WS.id); }); await p.click('#posBackTiles'); await p.click('[data-pu]:has-text("Cathy")');
  console.log('pre', (await p.textContent('.pos-body')).slice(0,100)); for(const k of ['1','2','3','4']) await p.click('[data-k="'+k+'"]'); await p.waitForSelector('#posTabBody');
  console.log('cashier in', await p.evaluate(()=>window.__t.State.session.name));
  await p.click('#posExitBtn'); await p.waitForTimeout(300); console.log('restored', await p.evaluate(()=>window.__t.State.session.name));
  console.log(errs); await b.close();
})();
