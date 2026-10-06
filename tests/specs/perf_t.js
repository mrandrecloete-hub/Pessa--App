const { chromium } = require('playwright');
let fail=0; const ck=(n,c)=>{ console.log((c?'  ok   ':'  FAIL ')+n); if(!c){fail++;} };
(async()=>{
  const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1100,height:900},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await require('./biz_boot.js')(p,{demo:true});
  // correctness of the index
  const c = await p.evaluate(()=>{ const t=window.__t, S=t.State; const out={};
    out.hit = (t.findProductByBarcode('6001234567890')||{}).name;
    out.trim = (t.findProductByBarcode('  6001234567890 ')||{}).name;
    out.miss = t.findProductByBarcode('0000');
    out.empty = t.findProductByBarcode('');
    // edit in place: barcode changed without replacing the array
    const m=S.products.find(x=>x.name==='Rice 2kg'); m.barcode='NEWCODE1'; out.edited=(t.findProductByBarcode('NEWCODE1')||{}).name; S.products.find(x=>x.name==='Milk 1L').barcode='MILK2';
    out.oldGone = t.findProductByBarcode('6001234567890')===null ? 'gone' : 'STALE'; out.milkNew=(t.findProductByBarcode('MILK2')||{}).name;
    // add in place
    S.products.push({id:'zz1',name:'Zed',barcode:'ZED9',sellPrice:1,costPrice:0}); out.added=(t.findProductByBarcode('ZED9')||{}).name;
    // duplicates: first wins like before
    S.products.push({id:'zz2',name:'Zed Two',barcode:'ZED9'}); out.dup=(t.findProductByBarcode('ZED9')||{}).name;
    // numeric barcode
    S.products.push({id:'zz3',name:'Num',barcode:12345}); out.num=(t.findProductByBarcode('12345')||{}).name;
    return out; });
  ck('hit', c.hit==='Milk 1L'); ck('trimmed input', c.trim==='Milk 1L'); ck('miss null', c.miss===null); ck('empty null', c.empty===null);
  ck('barcode edited in place is found', c.edited==='Rice 2kg'); ck('old barcode no longer finds it', c.oldGone==='gone'); ck('new barcode finds it', c.milkNew==='Milk 1L');
  ck('added in place', c.added==='Zed'); ck('duplicate: first wins', c.dup==='Zed'); ck('numeric barcode', c.num==='Num');
  // stress: 20,000 products, 30,000 sales
  const T = await p.evaluate(()=>{ const t=window.__t, S=t.State; const now=Date.now(); const res={};
    const prods=[]; for(let i=0;i<20000;i++) prods.push({id:'p'+i,name:'Product '+i+' '+['Maize','Rice','Oil','Milk','Soap'][i%5],category:['Dry','Dairy','Home'][i%3],sellPrice:10+i%90,costPrice:5+i%40,stockQty:i%7?50:0,lowStock:5,barcode:String(7000000000000+i),createdAt:new Date(now).toISOString()});
    S.products=prods;
    const sales=[]; for(let i=0;i<30000;i++){ const pr=prods[(i*7)%20000]; sales.push({id:'s'+i,items:[{productId:pr.id,name:pr.name,qty:1,unitPrice:pr.sellPrice,cost:pr.costPrice,lineTotal:pr.sellPrice}],total:pr.sellPrice,cost:pr.costPrice,profit:pr.sellPrice-pr.costPrice,paymentMethod:['cash','card','wallet','credit'][i%4],cashierName:'Alice',createdAt:new Date(now-(i%60)*86400000).toISOString()}); }
    S.sales=sales;
    let t0=performance.now(); for(let i=0;i<200;i++) t.findProductByBarcode(String(7000000000000+19999-i)); res.scan200=performance.now()-t0;
    t0=performance.now(); const h=t.posGridHtml; res.posGridLen=0; S.cart=[]; return res; });
  console.log('   200 scans over 20,000 products:',T.scan200.toFixed(1),'ms');
  ck('200 scans under 50 ms total', T.scan200<50);
  async function timed(label, fn, limit){ const ms = await p.evaluate(async fn=>{ const f=new Function('t','return ('+fn+')(t)'); const t0=performance.now(); await f(window.__t); return performance.now()-t0; }, fn); console.log('   '+label+': '+ms.toFixed(0)+' ms'); ck(label+' under '+limit+' ms', ms<limit); return ms; }
  await timed('Sell tab render', "t=>{ t.setTab('sell'); }", 600);
  await timed('Stock tab render', "t=>{ t.setTab('stock'); }", 600);
  await timed('Dashboard render', "t=>{ t.setTab('home'); }", 1500);
  await timed('POS grid html (capped)', "t=>{ return t.posGridHtml().length; }", 100);
  const len = await p.evaluate(()=>window.__t.posGridHtml().length); ck('POS grid stays small (<200 KB) with 20,000 products', len<200000);
  await timed('Reports tab render', "t=>{ t.setTab('reports'); }", 4000);
  await timed('Smart alerts', "t=>{ return t.smartAlerts(); }", 3000);
  await timed('Health checks', "t=>{ return t.healthChecks(); }", 3000);
  // typing in the Sell search stays responsive
  await p.evaluate(()=>window.__t.setTab('sell')); await p.waitForSelector('#sellSearchInput');
  const t0=Date.now(); await p.type('#sellSearchInput','Product 1999',{delay:40}); await p.waitForTimeout(500); console.log('   typed+rendered in',Date.now()-t0,'ms');
  ck('sell search shows results', (await p.innerText('#content')).indexOf('Product 1999')>-1);
  ck('no page errors', errs.length===0); if(errs.length) console.log(errs.slice(0,3));
  await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
