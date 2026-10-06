const { chromium } = require('playwright');
let fail=0; const ck=(n,c,x)=>{ console.log((c?'  ok   ':'  FAIL ')+n+(!c&&x!==undefined?'  -> '+JSON.stringify(x).slice(0,300):'')); if(!c) fail++; };
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:412,height:915},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await require('./biz_boot.js')(p);
 const ids=await p.evaluate(async()=>{ const t=window.__t, R=t.refs;
   const pr=R.products.doc(); await pr.set({name:'Bread',sellingPrice:10,costPrice:5,stockQty:5});
   const w=R.wastage.doc(); await w.set({productId:pr.id,productName:'Bread',qty:2,reason:'expired',createdAt:new Date().toISOString(),recordedBy:'Owner'});
   const su=R.suppliers.doc(); await su.set({name:'Acme'});
   const po=R.purchaseOrders.doc(); await po.set({supplierId:su.id,items:[{productId:pr.id,name:'Bread',qty:3,cost:5}],status:'draft',createdAt:new Date().toISOString()});
   const cu=R.customers.doc(); await cu.set({name:'Anna',balance:30});
   const le=R.customers.doc(cu.id).collection('ledger'); const lr=await le.add({type:'payment',amount:20,note:'Cash',createdAt:new Date().toISOString(),balanceAfter:30});
   const us=R.users.doc(); await us.set({name:'Gone Guy',role:'cashier',active:false,email:'g@x.com'});
   return {pr:pr.id,w:w.id,po:po.id,cu:cu.id,us:us.id}; });
 await p.waitForTimeout(600);
 // wastage
 await p.evaluate(()=>window.__t.openWastageSheet()); await p.waitForSelector('[data-wdel]'); await p.click('[data-wdel]'); await p.waitForSelector('#wdBack'); await p.click('#wdBack'); await p.waitForTimeout(600);
 const st=await p.evaluate(id=>({stock:window.__t.State.products.find(x=>x.id===id.pr).stockQty, w:window.__t.State.wastage.length}),ids);
 ck('wastage deleted and stock put back', st.stock===7&&st.w===0, st);
 // purchase order
 await p.evaluate(id=>{ const t=window.__t; t.openPODetailSheet(t.State.purchaseOrders.find(x=>x.id===id.po)); },ids); await p.waitForSelector('#poDeleteBtn'); await p.click('#poDeleteBtn'); await p.waitForSelector('#cfOk'); await p.click('#cfOk'); await p.waitForTimeout(800);
 ck('purchase order deleted', (await p.evaluate(()=>window.__t.State.purchaseOrders.length))===0);
 // staff
 await p.evaluate(id=>{ const t=window.__t; t.openStaffSheet(t.State.users.find(x=>x.id===id.us)); },ids); await p.waitForTimeout(300);
 ck('deactivated staff with no records can be deleted', !!(await p.$('#sfDelete')));
 await p.click('#sfDelete'); await p.waitForSelector('#cfOk'); await p.click('#cfOk'); await p.waitForSelector('#apPass'); await p.fill('#apPass','aaaa1111'); await p.click('#apOk'); await p.waitForTimeout(1500); // may ask for biometric gate; fall through if not
 const gone=await p.evaluate(id=>!window.__t.State.users.some(x=>x.id===id.us),ids); ck('staff member deleted', gone);
 // customer payment
 await p.evaluate(()=>window.__t.closeModal()); await p.waitForTimeout(300);
 await p.evaluate(id=>{ const t=window.__t; t.openLedgerSheet(t.State.customers.find(x=>x.id===id.cu)); },ids); await p.waitForTimeout(1200); if(process.env.DBG){ console.log(await p.evaluate(()=>[window.__t.State.customers.length, document.querySelectorAll('.sheet').length, (document.querySelector('.sheet')||{}).innerText&&document.querySelector('.sheet').innerText.slice(0,200)])); await p.screenshot({path:'/tmp/dl.png'}); } await p.waitForSelector('[data-ldel]',{timeout:5000}); await p.click('[data-ldel]'); await p.waitForSelector('#cfOk'); await p.click('#cfOk'); await p.waitForTimeout(800);
 const bal=await p.evaluate(id=>window.__t.State.customers.find(x=>x.id===id.cu).balance,ids); ck('payment removed and balance restored', bal===50, bal);
 ck('no page errors', errs.length===0, errs);
 await b.close(); console.log(fail?'FAILED':'ALL OK'); process.exit(fail?1:0);
})();
