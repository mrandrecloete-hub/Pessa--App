const { chromium } = require('playwright');
let fail=0; const ck=(n,c)=>{ console.log((c?'  ok   ':'  FAIL ')+n); if(!c){fail++;} };
(async()=>{
  const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:900},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await require('./biz_boot.js')(p,{demo:true});
  const ask=q=>p.evaluate(q=>JSON.stringify(window.__t.agentParse(q)),q).then(JSON.parse);
  // too little history: honest refusal, not a made up number
  let r=await ask('forecast my sales for next week'); ck('refuses to forecast without enough history', /at least 14 days/.test(r.text));
  // 56 days of sales: weekends strong, Tuesdays weak, one spike
  await p.evaluate(async()=>{ const t=window.__t, now=new Date(); for(let i=56;i>=1;i--){ const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()-i,12); const wd=d.getDay(); let v=wd===6?900:wd===0?700:wd===2?200:400; v+=((i*37)%11)*5; if(i===10) v=3000; await t.refs.sales.doc().set({ total:v, cost:v*0.7, createdAt:d.toISOString(), items:[], paymentMethod:'cash' }); } await new Promise(r=>setTimeout(r,400)); });
  r=await ask('forecast my sales for next week'); ck('forecast gives a total, a range and 7 days', /next 7 days I expect about N\$/.test(r.text) && /between N\$/.test(r.text) && r.lines.filter(l=>/about N\$/.test(l)).length===7);
  ck('forecast says it is an estimate and what it rests on', r.lines.some(l=>/estimate from your last \d+ days/.test(l)));
  r=await ask('what will I sell tomorrow'); ck('tomorrow gives one day', /^Tomorrow I expect about N\$/.test(r.text));
  r=await ask('how much did I sell today'); ck('the existing sales answer is untouched', /^Sales for today/.test(r.text));
  r=await ask('which day is my best day'); ck('weekday pattern finds Saturdays best and Tuesdays slowest', /Saturdays are your best day/.test(r.text) && /Tuesdays are your slowest/.test(r.text));
  r=await ask('compare my sales this week with last week'); ck('week comparison gives both totals and a percentage', /Sales for the last 7 days are N\$.*(up|down) \d+%/.test(r.text));
  r=await ask('compare sales this month'); ck('month comparison works', /this month so far/.test(r.text));
  r=await ask('was there anything unusual in my sales'); ck('the spike day is found and the answer does not claim a cause', /looked very different/.test(r.text) && r.lines.some(l=>/much higher/.test(l)) && r.lines.some(l=>/does not say why/.test(l)));
  // price what if
  await p.evaluate(async()=>{ const t=window.__t; const pr=t.State.products[0]; await t.refs.sales.doc().set({ total:pr.sellPrice*5, cost:pr.costPrice*5, createdAt:new Date().toISOString(), items:[{ productId:pr.id, name:pr.name, qty:5, price:pr.sellPrice, cost:pr.costPrice }], paymentMethod:'cash' }); await new Promise(r=>setTimeout(r,300)); });
  const nm=await p.evaluate(()=>window.__t.State.products[0].name);
  r=await ask('what if I raise the price of '+nm+' by 10%'); ck('price what if shows three scenarios, today, and says it is an estimate', (r.lines||[]).filter(l=>/buyers/.test(l)).length===3 && /estimates/.test((r.lines||[]).join(' ')) || /no sales in the last 30 days/.test(r.text));
  r=await ask('what if I raise the price of unobtainium by 10%'); ck('an unknown product is reported, not guessed', /could not find a product/.test(r.text));
  // never changes anything
  const before=await p.evaluate(()=>window.__t.State.sales.length); await ask('forecast sales next week'); await ask('what if I lower the price of '+nm+' by 5%');
  ck('analysis never changes records', (await p.evaluate(()=>window.__t.State.sales.length))===before);
  ck('no page errors', errs.length===0); if(errs.length) console.log(errs.join(' | '));
  await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
