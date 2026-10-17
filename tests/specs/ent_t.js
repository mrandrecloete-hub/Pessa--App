const { chromium } = require('playwright');
const boot = require('./biz_boot.js');
let fail=0; const ck=(n,c)=>{ console.log((c?'  ok   ':'  FAIL ')+n); if(!c){fail++;} };
(async()=>{ const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:900},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.route('https://shop.example.com/**', r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
 await boot(p,{demo:true});
 // ---------- the hub is a Business tools tile
 let r=await p.evaluate(()=>{ window.__t.openBizHub(); return document.body.innerText; });
 ck('Enterprise tools tile is in Business tools', /Enterprise tools/.test(r));
 await p.evaluate(()=>{ window.__t.closeModal(); window.__t.openEnterpriseSheet(); });
 r=await p.evaluate(()=>document.body.innerText);
 ck('hub lists the four tools', ['Product families','Branch dashboard','Stock transfers between branches','Sales channels and online shop'].every(x=>r.indexOf(x)>-1));
 await p.evaluate(()=>window.__t.closeModal());
 // ---------- product families: 2 colours x 3 sizes = 6 products, no duplicates on a second run
 r=await p.evaluate(()=>{ const T=window.__t; const o={name:'Work shirt',category:'Clothes',ax1:'Colour',v1:'Blue, Red',ax2:'Size',v2:'S, M, L',ax3:'',v3:'',cost:'50',sell:'120',qty:'4',low:'1',prefix:'SH'}; const a=T.entCreateFamily(o); const b2=T.entCreateFamily(o); return {a,b2, kids:T.State.products.filter(p=>p.parentId===a.parentId).map(p=>[p.name,p.stockQty,p.barcode,p.sellPrice])}; });
 ck('6 variants made with stock, price and barcode', r.a.made===6 && r.kids.length===6 && r.kids.every(k=>k[1]===4 && k[3]===120 && /^SH\d{3}$/.test(k[2])));
 ck('variant names carry the options', r.kids.some(k=>k[0]==='Work shirt Blue / M'));
 ck('running it again makes no duplicates', r.b2.made===0 && r.b2.skipped===6);
 r=await p.evaluate(()=>window.__t.entCreateFamily({name:'Big',ax1:'A',v1:Array.from({length:15},(_,i)=>'a'+i).join(','),ax2:'B',v2:Array.from({length:15},(_,i)=>'b'+i).join(',')}));
 ck('more than 200 variants is refused', !!r.error);
 await p.evaluate(()=>{ const T=window.__t; T.openFamiliesSheet(); }); await p.waitForTimeout(200);
 r=await p.evaluate(()=>({txt:document.body.innerText, fam:!!document.querySelector('[data-fam]')}));
 ck('family list shows the family and stock', r.fam && /Work shirt/.test(r.txt) && /24 in stock/.test(r.txt));
 await p.click('[data-fam]'); await p.waitForTimeout(200);
 r=await p.evaluate(()=>document.querySelector('.sheet, .modal, .overlay') ? document.body.innerText : '');
 ck('family page shows the colour by size grid', /Colour \/ Size/.test(r) && /Apply to all/.test(r));
 await p.fill('#fpSell','135'); await p.click('#fpSave'); await p.waitForTimeout(400);
 r=await p.evaluate(()=>window.__t.State.products.filter(p=>p.parentName==='Work shirt').every(p=>p.sellPrice===135));
 ck('one price change updates every variant', r);
 await p.evaluate(()=>window.__t.closeModal());
 // ---------- branches: dashboard and transfers
 r=await p.evaluate(async()=>{ const T=window.__t; T.refs.branches.doc('b1').set({name:'Windhoek'}); T.refs.branches.doc('b2').set({name:'Oshakati'}); T.State.branches=[{id:'b1',name:'Windhoek'},{id:'b2',name:'Oshakati'}];
   T.refs.products.doc('pa').set({name:'Maize 10kg',category:'Food',costPrice:60,sellPrice:90,stockQty:10,barcode:'MZ10',branchId:'b1',createdAt:new Date().toISOString()});
   await new Promise(r=>setTimeout(r,400));
   const bad1=T.entTransferSend('b1','b1','pa',1), bad2=T.entTransferSend('b1','b2','pa',99), ok=T.entTransferSend('b1','b2','pa',4);
   const src=T.State.products.find(x=>x.id==='pa'); const inTransit=T.State.products.filter(x=>x.branchId==='b2'&&x.name==='Maize 10kg').length;
   const rc=T.entTransferReceive(ok.transfer.id); await new Promise(r=>setTimeout(r,300));
   const dest=T.State.products.find(x=>x.branchId==='b2'&&x.name==='Maize 10kg'); const again=T.entTransferReceive(ok.transfer.id);
   return {bad1:bad1.error,bad2:bad2.error,srcQty:src.stockQty,inTransit,rc,destQty:dest&&dest.stockQty,destBarcode:dest&&dest.barcode,again:again.error,status:T.State.entTransfers.find(x=>x.id===ok.transfer.id).status}; });
 ck('transfer refuses the same branch and too many', !!r.bad1 && /Only 10/.test(r.bad2));
 ck('sending takes stock off the first branch and nothing arrives yet', r.srcQty===6 && r.inTransit===0);
 ck('receiving adds it to the second branch (new product copy with barcode)', r.rc.ok && r.destQty===4 && r.destBarcode==='MZ10' && r.status==='received');
 ck('a transfer cannot be received twice', !!r.again);
 r=await p.evaluate(()=>{ const T=window.__t; const rows=T.entBranchRows('year'); return rows.map(x=>[x.name,x.items,x.stockCost]); });
 ck('branch dashboard counts stock per branch', r.some(x=>x[0]==='Windhoek'&&x[2]===360) && r.some(x=>x[0]==='Oshakati'&&x[2]===240));
 await p.evaluate(()=>window.__t.openBranchDashSheet('month')); await p.waitForTimeout(200);
 r=await p.evaluate(()=>document.body.innerText); ck('branch dashboard shows branches and a CSV button', /Windhoek/.test(r) && /Oshakati/.test(r) && /Download CSV/.test(r));
 await p.evaluate(()=>window.__t.closeModal());
 // ---------- sales channels
 r=await p.evaluate(()=>{ const T=window.__t; const woo=JSON.stringify([{id:501,number:'501',billing:{first_name:'Ann',last_name:'K'},line_items:[{sku:'SH001',name:'x',quantity:2,price:'135'}]}]);
   const shop=JSON.stringify({orders:[{id:9,name:'#9',line_items:[{sku:'NOPE',title:'Ghost',quantity:1,price:'10'}]}]}); const csv='order,sku,qty,price\nA1,SH002,1,135\nA1,SH003,2,135\nA2,MZ10,1,90';
   return {woo:T.entParseOrders(woo), shop:T.entParseOrders(shop), csv:T.entParseOrders(csv), bad:T.entParseOrders('{nope')}; });
 ck('WooCommerce, Shopify and CSV orders are read', r.woo.length===1 && r.woo[0].lines[0].qty===2 && r.woo[0].customer==='Ann K' && r.shop.length===1 && r.csv.length===2 && r.csv[0].lines.length===2 && r.bad===null);
 r=await p.evaluate(()=>{ const T=window.__t; const o=T.entParseOrders(JSON.stringify([{id:501,number:'501',line_items:[{sku:'SH001',quantity:2,price:'135'}]}]))[0]; const miss=T.entRecordOrder('WooCommerce',{id:'7',ref:'7',lines:[{sku:'ZZ',name:'Ghost',qty:1,price:1}]}); const rec=T.entRecordOrder('WooCommerce',o); return {miss:miss.error, rec:!!rec.log, cart:T.State.cart.map(c=>[c.name,c.qty,c.unitPrice,c.channelOrderId])}; });
 ck('an unmatched item blocks the order', /do not match/.test(r.miss));
 ck('a matched order fills the cart at the online price', r.rec && r.cart.length===1 && r.cart[0][1]===2 && r.cart[0][2]===135 && r.cart[0][3]==='501');
 r=await p.evaluate(()=>{ const T=window.__t; try{ T.finalizeSale('cash', null, { amountReceived:1000 }); }catch(e){ return {err:String(e)}; } return new Promise(res=>setTimeout(()=>{ const s=T.State.sales.slice(-1)[0]; const l=T.State.channelLogs.find(x=>x.externalOrderId==='501'); res({sale:s&&[s.channelOrderId,s.channel,s.total], log:l&&l.status, again:T.entRecordOrder('WooCommerce',{id:'501',ref:'501',lines:[{sku:'SH001',qty:1,price:1}]}).error}); },500)); });
 ck('the sale carries the online order number and platform', r.sale && r.sale[0]==='501' && r.sale[1]==='WooCommerce' && r.sale[2]===270);
 ck('the log shows recorded and the same order cannot be recorded twice', r.log==='recorded' && /already recorded/.test(r.again));
 r=await p.evaluate(()=>{ const T=window.__t; T.btSave({entChannel:{platform:'WooCommerce',endpoint:'https://shop.example.com/stock'}}); const n=T.entQueueStockAll(); const n2=T.entQueueStockAll(); return new Promise(res=>setTimeout(()=>T.entPushQueue(x=>res({n,n2,x,left:T.State.channelLogs.filter(l=>l.type==='stock'&&l.status!=='sent').length,sent:T.State.channelLogs.filter(l=>l.status==='sent').length})),400)); });
 ck('stock is queued once per product and sent to the shop address', r.n>5 && r.n2===0 && r.x.sent===r.n && r.left===0);
 r=await p.evaluate(()=>{ const T=window.__t; T.btSave({entChannel:{platform:'Shopify',endpoint:'http://insecure.example.com'}}); return new Promise(res=>T.entPushQueue(x=>res(x))); });
 ck('a plain http address is refused', /https/.test(r.error||''));
 // ---------- shift breaks
 r=await p.evaluate(()=>{ const T=window.__t; const u=T.tmMe(); T.clockIn(u); return new Promise(res=>setTimeout(()=>{ const open=T.clockOpenLog(u.id); const t0=Date.now();
   open.inAt=new Date(t0-3*3600000).toISOString(); T.entToggleBreak(u); open.breaks[0].from=new Date(t0-2*3600000).toISOString(); const onB=T.entOnBreak(open); open.breaks[0].to=new Date(t0-3600000).toISOString(); const afterEnd=T.entOnBreak(open);
   res({onB,afterEnd,hours:Math.round(T.clockMs(open)/360000)/10,brk:Math.round(T.entBreakMs(open)/360000)/10}); },400)); });
 ck('a break is recorded and taken off the hours worked', r.onB===true && r.afterEnd===false && r.brk===1 && r.hours===2);
 r=await p.evaluate(()=>{ const T=window.__t; const u=T.tmMe(); const open=T.clockOpenLog(u.id); T.entToggleBreak(u); const on=T.entOnBreak(T.clockOpenLog(u.id)); T.clockOut(u); return new Promise(res=>setTimeout(()=>{ const l=T.State.clockLogs.find(x=>x.id===open.id); res({on, closed:l&&l.outAt&&!T.entOnBreak(l)}); },400)); });
 ck('clocking out ends an open break', r.on===true && r.closed===true);
 await p.evaluate(()=>{ window.__t.closeModal(); });
 r=await p.evaluate(()=>{ const T=window.__t; return T.tmCardHtml(); }); ck('shift card has no break button when not clocked in', !/data-tm="break"/.test(r));
 await p.evaluate(()=>{ const T=window.__t; T.clockIn(T.tmMe()); }); await p.waitForTimeout(400);
 r=await p.evaluate(()=>window.__t.tmCardHtml()); ck('shift card offers Start break when clocked in', /data-tm="break"[^>]*>Start break/.test(r));

 // ---------- the hub function exists
 r=await p.evaluate(()=>{ const T=window.__t; const was=T.isManagerOrOwner; return typeof T.openEnterpriseSheet==='function'; }); ck('hub function exists', r);
 ck('no page errors', errs.length===0); if(errs.length) console.log(errs.slice(0,3));
 await b.close(); console.log(fail?('FAILED '+fail):'ALL OK'); process.exit(fail?1:0); })();
