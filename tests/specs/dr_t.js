const { chromium } = require('playwright');
(async()=>{
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:390,height:844}, serviceWorkers:'block'});
  await ctx.addInitScript(()=>{ window.__w=[]; const ch={properties:{write:true,writeWithoutResponse:false},writeValue:async v=>{window.__w.push(Array.from(v));}};
    navigator.bluetooth={requestDevice:async()=>({gatt:{connect:async()=>({getPrimaryService:async()=>({getCharacteristics:async()=>[ch]})})}})}; });
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
  await p.fill('#rcCompanyName','Dinner'); await p.fill('#rcOwnerName','Alice'); await p.fill('#rcOwnerEmail','a@x.com');
  await p.fill('#rcOwnerPassword','aaaa1111'); await p.fill('#rcOwnerPassword2','aaaa1111'); await p.click('#rcSubmit');
  await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card');
  await p.evaluate(async()=>{ const r=window.__t.refs; await r.products.doc().set({name:'Milk',sellPrice:30,costPrice:20,stockQty:50,createdAt:new Date().toISOString()}); });
  await p.waitForTimeout(300);
  await p.evaluate(()=>document.getElementById('settingsBtn').click()); await p.waitForSelector('#stDrawerTest'); await p.click('#stDrawerTest'); await p.waitForTimeout(300);
  console.log('test kick', JSON.stringify(await p.evaluate(()=>window.__w))); await p.evaluate(()=>{window.__w=[]; window.__t.closeModal();});
  // till
  await p.evaluate(async()=>{ const S=window.__t.State; const ref=window.__t.refs.tills.doc(); await ref.set({cashierId:S.session.userId,cashierName:'Alice',openingFloat:100,openedAt:new Date().toISOString(),status:'open'}); S.till.current={id:ref.id,cashierId:S.session.userId,cashierName:'Alice',openingFloat:100,openedAt:new Date().toISOString(),status:'open'}; });
  // cash sale
  await p.evaluate(()=>{ const S=window.__t.State; window.__t.addToCart(S.products[0].id); window.__t.openChargeSheet(); });
  await p.click('#confirmChargeBtn'); await p.waitForTimeout(300);
  console.log('cash kick', JSON.stringify(await p.evaluate(()=>window.__w))); await p.evaluate(()=>{window.__w=[]; window.__t.closeModal();});
  // card + cash back
  await p.evaluate(()=>{ const S=window.__t.State; window.__t.addToCart(S.products[0].id); window.__t.openChargeSheet(); });
  await p.click('[data-pm=card]'); await p.fill('#cashBack','20'); await p.waitForTimeout(100); console.log('info', await p.textContent('#cbInfo'));
  await p.click('#confirmChargeBtn'); await p.waitForTimeout(300);
  console.log('cb kick', JSON.stringify(await p.evaluate(()=>window.__w)), JSON.stringify(await p.evaluate(()=>{const s=window.__t.State.sales[0];return {cb:s.cashBack,ch:s.cardCharged,t:s.total}})));
  await p.evaluate(()=>{window.__w=[]; window.__t.closeModal();});
  // card plain: no kick
  await p.evaluate(()=>{ const S=window.__t.State; window.__t.addToCart(S.products[0].id); window.__t.openChargeSheet(); });
  await p.click('[data-pm=card]'); await p.click('#confirmChargeBtn'); await p.waitForTimeout(300);
  console.log('card no kick', JSON.stringify(await p.evaluate(()=>window.__w))); await p.evaluate(()=>window.__t.closeModal());
  // till expected = 100 + 30 - 20
  const t = await p.evaluate(()=>{ return null; });
  await p.evaluate(()=>window.__t.setTab('till')); await p.waitForTimeout(300); console.log('till', (await p.innerText('body')).replace(/\n+/g,' | ').match(/N\$1[0-9][0-9]\.00 \| cash expected/));
  console.log(errs); await b.close();
})();
