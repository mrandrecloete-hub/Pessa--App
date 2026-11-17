const { chromium } = require('playwright');
let fail=0; const ck=(n,c)=>{ console.log((c?'  ok   ':'  FAIL ')+n); if(!c){fail++;} };
(async()=>{
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:1200,height:800}, serviceWorkers:'block'});
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
  await p.fill('#rcCompanyName','Key Shop'); await p.fill('#rcOwnerName','Alice'); await p.fill('#rcOwnerEmail','a@x.com');
  await p.fill('#rcOwnerPassword','aaaa1111'); await p.fill('#rcOwnerPassword2','aaaa1111'); await p.click('#rcSubmit');
  await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card'); await p.evaluate(()=>{ try{ window.__t.btSave({ setupHidden:true }); window.__t.pfSave({ remindAt:Date.now() }); }catch(e){} });
  await p.evaluate(async()=>{ const t=window.__t; await t.refs.products.doc('p1').set({id:'p1',name:'Rice',sellPrice:10,costPrice:5,stockQty:50,barcode:'111'}); t.setTab('sell'); });
  await p.waitForSelector('#sellSearchInput');
  await p.click('h1, .hero-card, body', {position:{x:5,y:5}}).catch(()=>{});
  await p.keyboard.press('/');
  ck('slash focuses search', await p.evaluate(()=>document.activeElement&&document.activeElement.id==='sellSearchInput'));
  await p.keyboard.type('a/b');
  ck('slash typed inside the box is kept', (await p.inputValue('#sellSearchInput')).includes('/'));
  await p.keyboard.press('Escape'); await p.evaluate(()=>{ document.activeElement.blur(); });
  await p.keyboard.press('F2');
  ck('F2 focuses search', await p.evaluate(()=>document.activeElement&&document.activeElement.id==='sellSearchInput'));
  await p.evaluate(()=>{ document.activeElement.blur(); window.__t.addToCart('p1'); });
  await p.waitForSelector('#openCartBtn'); await p.keyboard.press('F9');
  await p.waitForSelector('#chargeBtn',{timeout:3000}).then(()=>ck('F9 opens the cart with Charge',true)).catch(()=>ck('F9 opens the cart with Charge',false));
  await p.keyboard.press('/');
  ck('shortcut ignored while a sheet is open', await p.evaluate(()=>document.activeElement.id!=='sellSearchInput'));
  ck('no page errors', errs.length===0);
  console.log(fail?'FAILED':'ALL OK'); await b.close(); process.exit(fail?1:0);
})();

