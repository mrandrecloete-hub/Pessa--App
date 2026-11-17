const { chromium } = require('playwright');
let fail=0; const ck=(n,c)=>{ console.log((c?'  ok   ':'  FAIL ')+n); if(!c){fail++;} };
(async()=>{ const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await require('./biz_boot.js')(p,{demo:true});
 const realN = await p.evaluate(()=>window.__t.State.products.length);
 // open from the health check sheet
 await p.evaluate(()=>window.__t.openHealthSheet()); await p.waitForSelector('#hcSpeed'); await p.click('#hcSpeed'); await p.waitForSelector('#spLoad');
 ck('speed sheet opens from the health check', true);
 await p.selectOption('#spN','10000'); const t0=Date.now(); await p.click('#spLoad'); await p.waitForFunction(()=>window.__t.MockStock.items.length===10000); console.log('   load 10,000 took', Date.now()-t0,'ms incl. render');
 await p.waitForTimeout(300);
 ck('10,000 test products in the app', await p.evaluate(n=>window.__t.State.products.length===n+10000, realN));
 ck('banner pill shown', await p.evaluate(()=>!!document.getElementById('mockPill')));
 const g = await p.evaluate(async()=>{ const t=window.__t,S=t.State; const o={};
   const m=S.products.find(x=>x.isMock); o.scan=(t.findProductByBarcode(m.barcode)||{}).id===m.id;
   o.validEan=/^\d{13}$/.test(m.barcode);
   const codes=new Set(S.products.filter(x=>x.isMock).map(x=>x.barcode)); o.unique=codes.size===10000;
   const raw=t.refs && JSON.stringify(Object.keys(window.__t.State.products.length?{}:{}));
   // nothing written to the store
   o.stored = 0; return o; });
 ck('scan finds a test product', g.scan); ck('barcodes are valid 13-digit and unique', g.validEan && g.unique);
 // not stored: check the persisted collection
 const stored = await p.evaluate(async()=>{ const t=window.__t; const bk=await t.backupPayload(); const s=JSON.stringify(bk); const raw=t.Store.raw.read(); const k=Object.keys(raw).filter(x=>/products$/.test(x)); return { hasMock: s.indexOf('mock_')>-1, rawMock: k.some(c=>Object.keys(raw[c]||{}).some(id=>id.indexOf('mock_')===0)) }; });
 ck('backup contains no test products', !stored.hasMock); ck('saved data has no test products', !stored.rawMock);
 // writes to a test product are ignored
 await p.evaluate(async()=>{ const t=window.__t; await t.refs.products.doc('mock_5').update({stockQty:1}); await t.refs.products.doc('mock_5').set({name:'x'}); await t.refs.products.doc('mock_6').delete(); });
 const stored2 = await p.evaluate(async()=>{ const raw=window.__t.Store.raw.read(); const k=Object.keys(raw).filter(x=>/products$/.test(x)); return k.some(c=>Object.keys(raw[c]||{}).some(id=>id.indexOf('mock_')===0)); });
 ck('writes to a test product are ignored', !stored2);
 // real product edit keeps test products
 await p.evaluate(async()=>{ const t=window.__t; const r=t.State.products.find(x=>!x.isMock); await t.refs.products.doc(r.id).update({sellPrice:99}); });
 await p.waitForTimeout(300);
 ck('real edit keeps the test products loaded', await p.evaluate(n=>window.__t.State.products.length===n+10000, realN));
 // cannot sell
 const sold = await p.evaluate(async()=>{ const t=window.__t; const before=t.State.sales.length; const m=t.State.products.find(x=>x.isMock&&x.stockQty>10); t.addToCart(m.id); t.openChargeSheet(); const sheet=!!document.querySelector('#confirmChargeBtn'); t.finalizeSale('cash',null,{}); await new Promise(r=>setTimeout(r,300)); return { sheet, added:t.State.cart.length, after:t.State.sales.length-before }; });
 ck('cart accepts a test product', sold.added===1); ck('charge sheet refuses to open', !sold.sheet); ck('no sale is created', sold.after===0);
 // speed check run
 await p.evaluate(()=>window.__t.openSpeedSheet()); await p.waitForSelector('#spRun'); await p.click('#spRun'); await p.waitForFunction(()=>/Draw the first page/.test(document.getElementById('spOut').innerText),{timeout:30000});
 const out = await p.innerText('#spOut'); console.log(out.replace(/\n+/g,' | ').slice(0,700));
 ck('results for own, test and big shop', /Your own products/.test(out) && /Test products you loaded/.test(out) && /30,000/.test(out));
 ck('no slow results on this machine', !/\bSlow\b/.test(out));
 await p.screenshot({path:'speed_1.png'});
 await p.evaluate(()=>document.getElementById('spOut').scrollIntoView()); await p.waitForTimeout(200); await p.screenshot({path:'speed_2.png'});
 // remove
 await p.click('#spRemove'); await p.waitForTimeout(300);
 ck('removed: back to own products only', await p.evaluate(n=>window.__t.State.products.length===n && !document.getElementById('mockPill'), realN));
 ck('cart cleaned of test products', await p.evaluate(()=>window.__t.State.cart.length===0));
 // reload: gone
 await p.evaluate(()=>window.__t.mockLoad(1000)); await p.reload(); await p.waitForTimeout(1500);
 ck('reload removes test products', await p.evaluate(()=>!document.getElementById('mockPill')));
 ck('no page errors', errs.length===0); if(errs.length) console.log(errs.slice(0,3));
 await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0); })();
