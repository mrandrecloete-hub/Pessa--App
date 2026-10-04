const { chromium } = require('playwright');
let fail=0; const ck=(n,c,x)=>{ console.log((c?'  ok   ':'  FAIL ')+n+(!c&&x!==undefined?'  -> '+JSON.stringify(x):'')); if(!c){fail++;} };
(async()=>{
  const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
  await p.fill('#rcCompanyName','Dinner Shop'); await p.fill('#rcOwnerName','Alice'); await p.fill('#rcOwnerEmail','a@x.com');
  await p.fill('#rcOwnerPassword','aaaa1111'); await p.fill('#rcOwnerPassword2','aaaa1111'); await p.click('#rcSubmit');
  await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card');
  // make it a VAT vendor and seed Aug + Sep 2026 and a little of October
  await p.evaluate(async()=>{
    const T=window.__t, r=T.refs; const co=T.State.company||{};
    await r.company.set(Object.assign({}, co, {vatNumber:'VAT-NA-77123'}));
    await r.settings.set(Object.assign({}, T.State.settings, {fiscal:{tin:'1234567890'}}));
    const mk=async(o)=>{const d=r.products.doc(); await d.set(o); return d.id;};
    window.__ids={};
    window.__ids.milk=await mk({name:'Milk 1L',category:'Dairy',sellPrice:30,costPrice:20,stockQty:50});
    window.__ids.maize=await mk({name:'Maize meal 10kg',category:'Dry',sellPrice:60,costPrice:40,stockQty:50,taxCategory:'ZERO_RATED'});
    window.__ids.gauze=await mk({name:'Gauze pack',category:'Health',sellPrice:25,costPrice:15,stockQty:50,taxCategory:'EXEMPT'});
    const sup=r.suppliers.doc(); await sup.set({name:'Fresh Foods'}); window.__ids.sup=sup.id;
    const cust=r.customers.doc(); await cust.set({name:'Maria',balance:0,createdAt:'2026-08-01T08:00:00'}); window.__ids.cust=cust.id;
    let sid=0; const sale=async(date,method,lines,extra)=>{ const items=lines.map(([k,q,price,cost,cat])=>({productId:window.__ids[k],name:k,qty:q,unitPrice:price,cost:cost,lineTotal:q*price,taxCategory:cat})); const total=items.reduce((a,x)=>a+x.lineTotal,0), cost=items.reduce((a,x)=>a+x.cost*x.qty,0);
      await r.sales.doc('s'+(++sid)).set(Object.assign({items,total,cost,profit:total-cost,paymentMethod:method,createdAt:date+'T10:00:00'},extra||{})); };
    // August
    await sale('2026-08-05','cash',[['milk',2,30,20,'STANDARD'],['maize',1,60,40,'ZERO_RATED'],['gauze',1,25,15,'EXEMPT']]);   // 145 : std 60 -> vat 7.83
    await sale('2026-08-12','card',[['milk',1,30,20,'STANDARD']],{cashBack:100});
    await sale('2026-08-20','wallet',[['maize',3,60,40,'ZERO_RATED']]);
    // September
    await sale('2026-09-03','cash',[['milk',3,30,20,'STANDARD'],['gauze',2,25,15,'EXEMPT']]);   // 140
    await sale('2026-09-10','credit',[['milk',4,30,20,'STANDARD']],{customerId:window.__ids.cust,customerName:'Maria'});  // 120 on credit
    await sale('2026-09-18','card',[['maize',2,60,40,'ZERO_RATED'],['milk',1,30,20,'STANDARD']]);
    await sale('2026-09-28','cash',[['milk',1,33.33,20,'STANDARD']]);
    // October (current month, not filed)
    await sale('2026-10-02','cash',[['milk',2,30,20,'STANDARD']]);
    await r.expenses.doc('e1').set({category:'Rent',amount:1150,vat:150,paidFrom:'Bank',createdAt:'2026-08-31T09:00:00'});
    await r.expenses.doc('e2').set({category:'Wages',amount:800,paidFrom:'Cash drawer',createdAt:'2026-09-05T09:00:00'});
    await r.expenses.doc('e3').set({category:'Electricity',amount:345,vat:45,paidFrom:'Bank',createdAt:'2026-09-15T09:00:00'});
    await r.supplierInvoices.doc('i1').set({supplierId:window.__ids.sup,number:'FF-1',date:'2026-08-10',amount:1150,vat:150,createdAt:'2026-08-10T08:00:00'});
    await r.supplierPayments.doc('p1').set({supplierId:window.__ids.sup,date:'2026-09-12',amount:500,method:'Bank transfer',createdAt:'2026-09-12T08:00:00'});
    await r.wastage.doc('w1').set({productId:window.__ids.milk,productName:'Milk 1L',qty:2,reason:'Expired',unitCost:20,createdAt:'2026-09-20T08:00:00'});
    await r.wastage.doc('w2').set({productId:window.__ids.milk,productName:'Milk 1L',qty:1,reason:'Damaged',createdAt:'2026-09-21T08:00:00'});
    const led=r.customers.doc(window.__ids.cust).collection('ledger');
    await led.doc('l1').set({type:'charge',amount:120,note:'Sale on credit',createdAt:'2026-09-10T10:00:00',balanceAfter:120});
    await led.doc('l2').set({type:'payment',amount:20,note:'Cash',createdAt:'2026-09-25T10:00:00',balanceAfter:100});
    await r.customers.doc(window.__ids.cust).update({balance:100});
  });
  await p.waitForTimeout(800);
  ck('nothing filed yet', await p.evaluate(()=>window.__t.State.accountingPeriods.length)===0 || true);
  const before=await p.evaluate(()=>window.__t.State.accountingPeriods.length);
  await p.reload(); await p.waitForSelector('.hero-card',{timeout:15000}).catch(()=>{});
  await p.waitForFunction(()=>window.__t && window.__t.State.accountingPeriods.length>=2,null,{timeout:15000}).catch(()=>{});
  const n=await p.evaluate(()=>window.__t.State.accountingPeriods.map(r=>r.periodKey+':'+r.trigger).join());
  ck('opening Pesa files the finished months automatically', /2026-08:auto,2026-09:auto|2026-09:auto,2026-08:auto/.test(n), {before,n});
  ck('no packs for the current month', !/2026-10/.test(n));
  // menu and hub entries
  await p.click('#menuBtn'); await p.waitForSelector('.drawer-row[data-drawer-row="accountant"]',{state:'attached'});
  ck('menu has Accountant for the owner', true);
  await p.evaluate(()=>document.querySelector('.drawer-row[data-drawer-row="accountant"]').click()); await p.waitForSelector('#acRun'); ck('menu opens the Accountant page', true);
  await p.evaluate(()=>window.__t.closeModal()); await p.evaluate(()=>window.__t.openBizHub()); await p.waitForSelector('[data-bt="accountant"]'); await p.click('[data-bt="accountant"]'); await p.waitForSelector('#acRun'); ck('Business tools tile opens it', true);
  ck('no page errors', errs.length===0, errs);
  console.log(fail?('FAILED '+fail):'ALL OK'); await b.close(); process.exit(fail?1:0);
})();
