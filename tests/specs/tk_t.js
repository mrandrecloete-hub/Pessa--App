const { chromium } = require('playwright');
const D=(process.env.PESA_OUT||require('os').tmpdir()+'/pesa-tests/');
(async()=>{ const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'})).newPage(); const e=[]; p.on('pageerror',x=>e.push(x.message));
 await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
 await p.fill('#rcCompanyName','D'); await p.fill('#rcOwnerName','Alice'); await p.fill('#rcOwnerEmail','a@x.com'); await p.fill('#rcOwnerPassword','aaaa1111'); await p.fill('#rcOwnerPassword2','aaaa1111'); await p.click('#rcSubmit');
 await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card'); await p.evaluate(()=>{ try{ window.__t.btSave({ setupHidden:true }); window.__t.pfSave({ remindAt:Date.now() }); }catch(e){} });
 await p.evaluate(async()=>{const r=window.__t.refs; const names=['Bread','Milk','Eggs','Rice','Sugar','Tea']; for(const n of names) await r.products.doc().set({name:n,sellPrice:10+n.length,costPrice:6,stockQty:n==='Tea'?0:20,createdAt:new Date().toISOString()});});
 await p.evaluate(()=>window.__t.setTab('sell')); await p.waitForTimeout(400);
 const cnt=()=>p.evaluate(()=>[window.__t.State.cart.length, document.querySelectorAll('.tick.on').length, document.querySelector('[data-tickcount]').textContent]);
 await p.click('[data-tick]'); console.log('tick one', await cnt());
 await p.click('[data-tickall]'); console.log('select all', await cnt()); await p.screenshot({path:D+'tk1_sell.png'});
 await p.click('[data-tickclear]'); console.log('deselect all', await cnt());
 // invoice picker
 await p.evaluate(()=>window.__t.openInvoiceSheet()); await p.waitForSelector('#invPickBtn'); await p.click('#invPickBtn'); await p.waitForSelector('[data-spkall]');
 await p.click('[data-spkall]'); await p.fill('[data-spkq]','3'); await p.dispatchEvent('[data-spkq]','input'); await p.screenshot({path:D+'tk2_picker.png'});
 await p.click('[data-spkadd]'); await p.waitForTimeout(300);
 console.log('invoice lines', await p.$$eval('[data-invrow]',x=>x.length), await p.evaluate(()=>document.getElementById('invTotalDisplay').textContent));
 await p.screenshot({path:D+'tk3_invoice.png'}); await p.evaluate(()=>window.__t.closeModal());
 console.log(e); await b.close(); })();
