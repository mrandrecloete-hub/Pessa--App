const { chromium } = require('playwright');
let fail=0; const ck=(n,c)=>{ console.log((c?'  ok   ':'  FAIL ')+n); if(!c){fail++;} };
(async()=>{
  const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:900},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  const boot=require('./biz_boot.js'); await boot(p,{demo:true});
  // ---- pure maths
  const m = await p.evaluate(()=>{ const t=window.__t;
    const a=t.lcCalc([{name:'A',qty:10,price:10},{name:'B',qty:5,price:20}],{rate:1,freight:100,clearing:50,duty:50});
    const z=t.lcCalc([{name:'A',qty:0,price:10},{name:'B',qty:'',price:5},{name:'C',qty:2,price:''}],{});
    const free=t.lcCalc([{name:'A',qty:2,price:0},{name:'B',qty:2,price:0}],{freight:40});
    const fx=t.lcCalc([{name:'A',qty:4,price:10}],{rate:1.05,freight:20,markup:25});
    const sms=[ 'Bank Windhoek e@syWallet: You have received N$150.00 from 0811234567. Ref: 778899',
      'PayToday: Payment of N$ 1,250.50 received. ID: PT45XY9',
      'Your balance is N$ 20.00',
      'You paid N$30.00 to Shoprite. Ref 123456' ].map(t.mmParse);
    const rc=t.mmReconcile([{id:1,total:150,payRef:'778899',walletProvider:'e@syWallet'},{id:2,total:150,payRef:'',walletProvider:'e@syWallet'},{id:3,total:99,payRef:'',walletProvider:''},{id:4,total:1250.5,payRef:'ZZZ',walletProvider:'PayToday'},{id:5,total:40,payRef:'PT45XY9',walletProvider:'PayToday'}],
      [t.mmParse('e@syWallet received N$150.00 Ref 778899'),t.mmParse('PayToday received N$1,250.50 ID: PT45XY9')].concat([t.mmParse('MTC Maris payment received N$75')]));
    return {a,z,free,fx,sms,rc,sp1:t.mmSplit('a N$5 received\n\nb N$6 received').length,sp2:t.mmSplit('a received N$5\nb received N$6\nc received N$7').length}; });
  const A=m.a; const sumOh=A.reduce((s,x)=>s+x.overheadPerUnit*x.qty,0);
  ck('overhead split sums to 200', Math.abs(sumOh-200)<0.05);
  ck('line A gets 1/2 of overhead (equal spend 100 vs 100)', A[0].overheadPerUnit===10 && A[1].overheadPerUnit===20);
  ck('landed A = 20, B = 40', A[0].landedPerUnit===20 && A[1].landedPerUnit===40);
  ck('zero or blank quantity/price ignored, no NaN', m.z.length===0);
  ck('no spend splits by quantity', m.free.length===2 && m.free[0].overheadPerUnit===10);
  ck('rate and markup', m.fx[0].baseNad===10.5 && m.fx[0].landedPerUnit===15.5 && m.fx[0].suggestedPrice===19.38);
  ck('sms 1 parsed', m.sms[0].amount===150 && m.sms[0].ref==='778899' && m.sms[0].provider==='e@syWallet');
  ck('sms 2 parsed with thousands', m.sms[1].amount===1250.5 && m.sms[1].ref==='PT45XY9' && m.sms[1].provider==='PayToday');
  ck('balance and outgoing messages skipped', m.sms[2]===null && m.sms[3]===null);
  const R=m.rc.rows;
  ck('ref match', R[0].status==='ok' && R[0].how==='reference');
  ck('same amount second receipt is NOT matched to a used message', R[1].status==='unmatched');
  ck('no amount match', R[2].status==='unmatched');
  ck('wrong ref falls back to amount', R[3].status==='ok' && R[3].how==='amount');
  ck('ref match with equal amount (id 5, 40 vs 1250.5) shows differs? no: ref used already', R[4].status==='unmatched');
  ck('leftover message listed', m.rc.extra.length===1 && m.rc.extra[0].amount===75);
  ck('split by blank line and by lines', m.sp1===2 && m.sp2===3);
  // ---- UI
  await p.evaluate(()=>window.__t.openBizHub()); await p.waitForTimeout(300);
  ck('hub tiles present', await p.evaluate(()=>!!document.querySelector('[data-bt=landed]') && !!document.querySelector('[data-bt=momo]')));
  await p.click('[data-bt=landed]'); await p.waitForSelector('#lcLines');
  await p.selectOption('[data-lc="0"] select','');
  const prodId = await p.evaluate(()=>window.__t.State.products.find(x=>x.name==='Rice 2kg').id);
  await p.selectOption('[data-lc="0"] [data-f=productId]', prodId);
  await p.fill('[data-lc="0"] [data-f=qty]','10'); await p.fill('[data-lc="0"] [data-f=price]','50');
  await p.fill('#lcFreight','100'); await p.fill('#lcMark','20');
  await p.waitForTimeout(200);
  let out=await p.innerText('#lcOut'); ck('result shows landed 60.00 each', /60\.00/.test(out) && /72\.00/.test(out));
  await p.click('#lcAdd'); ck('second line added', await p.$('[data-lc="1"]')!==null);
  await p.fill('[data-lc="0"] [data-f=price]','55'); await p.waitForTimeout(100); // typing keeps focus/lines
  ck('input kept after recalculation', await p.inputValue('[data-lc="0"] [data-f=price]')==='55');
  await p.click('[data-use="0"]'); await p.waitForTimeout(300);
  const cp = await p.evaluate(id=>window.__t.State.products.find(x=>x.id===id).costPrice, prodId);
  ck('cost price updated to landed 65', cp===65);
  await p.evaluate(()=>window.__t.closeModal());
  // momo UI
  await p.evaluate(async()=>{ const r=window.__t.refs; await r.sales.doc().set({items:[],total:150,cost:0,profit:150,paymentMethod:'wallet',walletProvider:'e@syWallet',payRef:'778899',cashierName:'Alice',createdAt:new Date().toISOString()}); await r.sales.doc().set({items:[],total:80,cost:0,profit:80,paymentMethod:'wallet',walletProvider:'PayToday',payRef:'',cashierName:'Alice',createdAt:new Date().toISOString()}); });
  await p.waitForTimeout(300);
  await p.evaluate(()=>window.__t.openMomoSheet()); await p.waitForSelector('#mmText');
  await p.fill('#mmText','e@syWallet: You have received N$150.00 Ref: 778899\n\nPayToday: payment of N$ 85.00 received ID: AB12CD');
  await p.click('#mmGo'); await p.waitForTimeout(200);
  out=await p.innerText('#mmOut'); ck('1 of 2 matched', /1\s*of\s*2/.test(out)); ck('unmatched sale flagged', /No message found/i.test(out)); ck('stray message listed', /85\.00/.test(out) && /no matching sale/i.test(out));
  await p.evaluate(()=>window.__t.closeModal());
  // pre-check
  const au = await p.evaluate(()=>{ const t=window.__t; const pr=t.State.products; pr[0].taxCategory='EXEMPT';
    const x=t.eliteAuditCart([{productId:null,name:'Zero',unitPrice:0,cost:0,qty:1},{productId:pr.find(q=>q.name==='Milk 1L').id,name:'Milk 1L',unitPrice:10,cost:20,qty:1},{productId:'zz',name:'Castle Lager beer',unitPrice:20,cost:10,qty:1}]);
    return x.map(y=>y.kind); });
  ck('zero price and below cost flagged', au.indexOf('ZERO_PRICE')>-1 && au.indexOf('NEGATIVE_MARGIN')>-1);
  ck('normal item not flagged', au.length===2);
  // checkout banner
  await p.evaluate(()=>{ const t=window.__t; t.State.cart.push({productId:t.State.products[0].id,name:'Cheap thing',unitPrice:5,cost:9,qty:1}); t.openChargeSheet(); });
  await p.waitForSelector('#confirmChargeBtn'); ck('checkout shows below-cost warning', /priced below its cost/.test(await p.innerText('body')));
  ck('no page errors', errs.length===0); if(errs.length) console.log(errs);
  await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
