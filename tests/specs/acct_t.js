const { chromium } = require('playwright'); const fs=require('fs');
const D=(process.env.PESA_OUT||'/tmp/pesa-tests/');
let fail=0; const ck=(n,c,x)=>{ console.log((c?'  ok   ':'  FAIL ')+n+(!c&&x!==undefined?'  -> '+JSON.stringify(x):'')); if(!c){fail++;} };
(async()=>{
  const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{ if(m.type()==='error' && !/ERR_TUNNEL|ERR_NAME|Failed to load resource/.test(m.text())) errs.push('console:'+m.text()); });
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
  await p.waitForTimeout(500);
  // ---- engine on real data ----
  const R1=await p.evaluate(async()=>{
    const T=window.__t; const G=await T.acctGather(), B=T.acctBuild(G);
    const toDate=T.acctView(G,B,'2026-08-01','2026-10-04'); const sep=T.acctView(G,B,'2026-09-01','2026-09-30'); sep.checks=sep.checks.concat(toDate.checks), aug=T.acctView(G,B,'2026-08-01','2026-08-31');
    return { nJ:B.journals.length, sep:{pl:sep.pl,vat:sep.vat,tb:{dr:sep.tb.totalDr,cr:sep.tb.totalCr,net:sep.tb.closeNet},bs:{a:sep.bs.totalAssets,l:sep.bs.totalLiabilities,e:sep.bs.totalEquity},checks:sep.checks.map(c=>c.level+':'+c.text.slice(0,60))}, aug:{pl:aug.pl,vat:aug.vat}, flags:B.flags, G:{custOwed:G.customersOwed,supOwed:G.suppliersOwed} };
  });
  console.log(JSON.stringify(R1.sep.pl), JSON.stringify(R1.sep.vat));
  // hand calc September: sales 140+120+(120+30=150)+33.33 ; std part: milk 90 + 120 + 30 + 33.33 = 273.33 -> vat = round(27333*1500/11500)=3565 ; zero 120 ; exempt 50
  ck('Sep sales gross components', R1.sep.pl.salesZero===12000 && R1.sep.pl.salesExempt===5000, R1.sep.pl);
  ck('Sep VAT output exact', R1.sep.vat.outputVat===Math.round(27333*1500/11500) && R1.sep.pl.salesStandard===27333-3565, R1.sep.vat);
  ck('Sep input VAT from electricity only', R1.sep.vat.inputVat===4500, R1.sep.vat);
  ck('Aug input VAT = rent 150 + supplier invoice 150', R1.aug.vat.inputVat===30000, R1.aug.vat);
  ck('trial balance agrees', R1.sep.tb.dr===R1.sep.tb.cr && R1.sep.tb.net===0, R1.sep.tb);
  ck('balance sheet balances', R1.sep.bs.a===R1.sep.bs.l+R1.sep.bs.e, R1.sep.bs);
  ck('customer credit agrees with list', R1.sep.checks.some(c=>/^ok:Customer credit in the books agrees/.test(c)), R1.sep.checks);
  ck('wastage estimate flagged (w2 has no unit cost)', R1.flags.WASTAGE_COST_ESTIMATED===1, R1.flags);
  // wastage: 2*20 + 1*20(current cost)=60.00
  ck('wastage value 60.00', R1.sep.pl.wastage===6000, R1.sep.pl.wastage);
  // ---- filing, chain, verify ----
  const F=await p.evaluate(async()=>{
    const T=window.__t; const n=await T.acctFileMissing('auto'); await new Promise(r=>setTimeout(r,400));
    const per=T.acctPeriods(); const out=[]; for(const r of per){ out.push({k:r.periodKey,rev:r.revision,prev:r.prevHash,hash:r.hash,ok:await T.acctVerify(r),size:JSON.stringify(r).length}); }
    const n2=await T.acctFileMissing('auto');
    return {n,n2,out,state:T.State.accountingPeriods.length};
  });
  ck('two finished months filed, none for current month', F.n===2 && F.out.map(x=>x.k).join()==='2026-08,2026-09', F);
  ck('second run files nothing', F.n2===0);
  ck('chain: Aug is genesis, Sep points at Aug', F.out[0].prev==='GENESIS' && F.out[1].prev===F.out[0].hash);
  ck('hashes verify', F.out.every(x=>x.ok));
  ck('record size is small (< 60 KB)', F.out.every(x=>x.size<60000), F.out.map(x=>x.size));
  // ---- change source data, flag, re-run, tamper ----
  const C=await p.evaluate(async()=>{
    const T=window.__t; const G0=await T.acctGather(), B0=T.acctBuild(G0); const aug=T.acctPeriods()[0];
    const before=await T.acctFingerprint(B0,aug.from,aug.to);
    await T.refs.sales.doc('s2').update({total:35});
    const G=await T.acctGather(), B=T.acctBuild(G); const after=await T.acctFingerprint(B,aug.from,aug.to);
    const stillOk=await T.acctVerify(aug);
    const cur=T.State.accountingPeriods.find(r=>r.periodKey==='2026-08');
    const nr=await T.acctMakeRecord(G,B,'2026-08',null,cur,'manual',new Date()); await T.refs.accountingPeriods.doc('2026-08').set(nr); await new Promise(r=>setTimeout(r,300));
    const nowRec=T.State.accountingPeriods.find(r=>r.periodKey==='2026-08');
    const tampered=JSON.parse(JSON.stringify(nowRec)); tampered.pl.revenue+=1;
    return { same:before===aug.fingerprint, changed:after!==aug.fingerprint, stillOk, rev:nowRec.revision, hist:nowRec.history.length, histHash:nowRec.history[0].hash===aug.hash, ok2:await T.acctVerify(nowRec), tamperOk:await T.acctVerify(tampered) };
  });
  ck('fingerprint matched before change', C.same); ck('fingerprint changes when a sale is edited', C.changed);
  ck('filed copy still verifies after source edit', C.stillOk); ck('re-run makes revision 2 and keeps old hash', C.rev===2 && C.hist===1 && C.histHash, C);
  ck('new revision verifies, tampered copy does not', C.ok2 && !C.tamperOk);
  // restore the sale
  await p.evaluate(async()=>{ await window.__t.refs.sales.doc('s2').update({total:30}); });
  // ---- parity with the TS reference engine ----
  const src=await p.evaluate(async()=>{ const T=window.__t; const G=await T.acctGather(), B=T.acctBuild(G);
    const tb=T.acctView(G,B,'2026-08-01','2026-09-30').tb.rows.map(r=>[r.code,r.dr,r.cr]);
    return { tb, sales:G.sales.map(s=>({id:s.id,createdAt:s.createdAt,total:s.total,cost:s.cost,paymentMethod:s.paymentMethod,cashBack:s.cashBack,items:(s.items||[]).map(i=>({lineTotal:i.lineTotal,qty:i.qty,unitPrice:i.unitPrice,taxCategory:i.taxCategory}))})),
      expenses:G.expenses, supInv:G.supInv.map(i=>({id:i.id,date:i.date,amount:i.amount,vat:i.vat,number:i.number,supplierName:G.sup[i.supplierId]})), supPay:G.supPay.map(x=>({id:x.id,date:x.date,amount:x.amount,method:x.method,ref:x.ref,supplierName:G.sup[x.supplierId]})),
      wastage:G.wastage.map(w=>({id:w.id,createdAt:w.createdAt,qty:w.qty,unitCost:w.unitCost,productName:w.productName,reason:w.reason,cur:(G.byId[w.productId]||{}).costPrice||0})), ent:G.custEntries }; });
  const A=require('./tsc/out/pesaAccountant.js'); const tctx={vatVendor:true,vatRatePct:15,dateKey:iso=>iso.slice(0,10)}; const core=new A.PesaAccountantCore();
  src.sales.forEach(s=>core.postJournalEntry(A.saleJournal(s,tctx))); src.expenses.forEach(e=>core.postJournalEntry(A.expenseJournal(e,tctx))); src.supInv.forEach(i=>core.postJournalEntry(A.supplierInvoiceJournal(i,tctx))); src.supPay.forEach(x=>core.postJournalEntry(A.supplierPaymentJournal(x)));
  src.wastage.forEach(w=>core.postJournalEntry(A.wastageJournal(w,w.cur,tctx))); src.ent.forEach(c=>{ const j=A.customerEntryJournal(c,tctx); if(j) core.postJournalEntry(j); });
  const t=core.trialBalance('2026-08-01','2026-09-30').rows.map(r=>[r.code,r.dr,r.cr]);
  ck('page engine and TypeScript engine give identical trial balance', JSON.stringify(t)===JSON.stringify(src.tb), {page:src.tb,ts:t});
  // ---- documents ----
  const DOC=await p.evaluate(async()=>{ const T=window.__t; const d1=await T.acctPackPdfLive('2026-09-01','2026-09-30',false); const d2=await T.acctPackPdfLive('2026-10-01','2026-10-04',true);
    const rec=T.acctPeriods()[1]; const rdoc=T.acctDrawPdf(rec,{periodKey:rec.periodKey,revision:rec.revision,shopName:rec.shopName,tin:rec.tin,vatNumber:rec.vatNumber,vatVendor:rec.vatVendor,vatRatePct:rec.vatRatePct,generatedAt:rec.generatedAt,generatedBy:rec.generatedBy,hash:rec.hash,prevHash:rec.prevHash,interim:false,from:rec.from,to:rec.to});
    const periods=T.acctVatPeriodsFor('B','2026-10',['2026-08','2026-09','2026-10']); const v=await T.acctVatDoc(periods.find(x=>x.end==='2026-10'));
    const csv=await T.acctJournalCsv('2026-09-01','2026-09-30',rec); const tbcsv=T.acctTbCsv(rec);
    window.__pdfs={live:d1.output('datauristring'),filed:rdoc.output('datauristring'),vat:v.output('datauristring'),interim:d2.output('datauristring')};
    return { pages:[d1.getNumberOfPages(),rdoc.getNumberOfPages(),v.getNumberOfPages(),d2.getNumberOfPages()], periods:periods.map(x=>x.start+'>'+x.end+' due '+x.due), csvHead:csv.split('\r\n').slice(0,12), csvLines:csv.split('\r\n').length, tbcsv:tbcsv.split('\r\n').length }; });
  console.log(JSON.stringify(DOC.periods), DOC.pages);
  ck('pdfs built', DOC.pages.every(n=>n>=1)); ck('VAT periods category B (Sep+Oct ends Oct, due 25 Nov)', DOC.periods[0]==='2026-09>2026-10 due 2026-11-25', DOC.periods);
  ck('journal csv says it matches the filed copy', DOC.csvHead.some(l=>/Matches the filed copy,yes/.test(l)), DOC.csvHead);
  for(const k of ['live','filed','vat','interim']){ const u=await p.evaluate(k=>window.__pdfs[k],k); fs.writeFileSync(D+'acct_'+k+'.pdf',Buffer.from(u.split(',')[1].replace(/^filename=[^;]*;/,''),'base64')); }
  // ---- UI ----
  await p.evaluate(()=>window.__t.openAccountantSheet()); await p.waitForSelector('[data-acct]'); await p.waitForFunction(()=>!/Checking/.test(document.querySelector('#acStatus').textContent),null,{timeout:8000});
  const ui=await p.innerText('.sheet'); ck('page lists both months', /September 2026/.test(ui)&&/August 2026/.test(ui));
  ck('page offers Run report now and opening balances', !!(await p.$('#acRun'))&&!!(await p.$('#acOpen')));
  await p.screenshot({path:D+'acct_page.png',fullPage:false});
  await p.selectOption('#acVatCat','B'); await p.waitForSelector('[data-acct-vat]'); ck('VAT periods appear after choosing a category', true);
  await p.evaluate(()=>{ document.querySelectorAll('.xp-back').forEach(e=>e.remove()); });
  await p.click('[data-acct="2026-09"] [data-acct-act="view"]'); await p.waitForSelector('#acVer'); await p.waitForFunction(()=>/match their hash/.test(document.querySelector('#acVer').textContent)); ck('detail shows hash verified', true); await p.screenshot({path:D+'acct_detail.png'});
  await p.evaluate(()=>window.__t.closeModal());
  // menu + hub
  await p.evaluate(()=>{ window.__t.closeModal(); }); 
  const menu=await p.evaluate(()=>{ return typeof window.__t.drawerRowsHtml==='function' ? window.__t.drawerRowsHtml() : ''; });
  // opening balances
  await p.evaluate(()=>window.__t.openAcctOpeningSheet()); await p.fill('#opDate','2026-08-01'); await p.fill('#opCash','500'); await p.fill('#opInv','1000.50'); await p.fill('#opPay','200'); await p.click('#opSave'); await p.waitForTimeout(400);
  const O=await p.evaluate(async()=>{ const T=window.__t; const G=await T.acctGather(), B=T.acctBuild(G); const v=T.acctView(G,B,'2026-08-01','2026-08-31'); const eq=v.tb.rows.find(r=>r.code==='3000'); return { eq:eq&&eq.close, ok:v.tb.totalDr===v.tb.totalCr && v.bs.totalAssets===v.bs.totalLiabilities+v.bs.totalEquity, inv:v.tb.rows.find(r=>r.code==='1200').open }; });
  ck('opening balances: equity = 500 + 1000.50 - 200, books still balance', O.ok && O.eq===-130050, O);
  // not a VAT vendor
  const NV=await p.evaluate(async()=>{ const T=window.__t; const co=T.State.company; await T.refs.company.set(Object.assign({},co,{vatNumber:''})); await new Promise(r=>setTimeout(r,300)); const G=await T.acctGather(), B=T.acctBuild(G); const v=T.acctView(G,B,'2026-09-01','2026-09-30'); return { vat:v.vat, std:v.pl.salesStandard, chk:v.checks.some(c=>/no VAT has been posted/.test(c.text)) }; });
  ck('not VAT registered: no VAT posted, all sales in 4000 except none zero/exempt', NV.vat.outputVat===0 && NV.std===44333, NV);
  // backup includes periods
  const bk=await p.evaluate(()=>window.__t.backupPayload().accountingPeriods.length); ck('backup carries the monthly packs', bk===2, bk);
  // empty business does not crash
  ck('no page errors', errs.length===0, errs);
  console.log(fail?('FAILED '+fail):'ALL OK'); await b.close(); process.exit(fail?1:0);
})();
