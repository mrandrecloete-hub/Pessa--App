// Blaze: read only shop tools, the Qwen chat format, tool call parsing, the on device engine (with a pretend model library) and the routing rules.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
let fail=0; const ck=(n,c,x)=>{ console.log((c?'  ok   ':'  FAIL ')+n+(!c&&x!==undefined?'  -> '+JSON.stringify(x).slice(0,300):'')); if(!c) fail++; };
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:412,height:915},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await require('./biz_boot.js')(p,{demo:true});
 const T=JSON.parse(fs.readFileSync(path.join(__dirname,'..','..','tools','blaze_training','tools.json'),'utf8'));
 ck('29 read only tools are listed, including the 8 original ones', T.length===29 && T.every(t=>!t.biz) && ['calc','shop_summary','find_product','low_stock','customers_owing','recall_memory','remember','analyze_csv'].every(n=>T.some(t=>t.name===n)));
 ck('the app and the server list the same tools', await p.evaluate(t=>JSON.stringify(window.__t.BLAZE_TOOLS)===JSON.stringify(t),T));

 // shop data to ask about
 await p.evaluate(()=>{ const S=window.__t.State, now=Date.now(), iso=d=>new Date(now-d*864e5).toISOString(); const P=S.products.slice(0,3);
   S.sales=[]; for(let d=0; d<40; d++){ const n=1+(d%3); for(let k=0;k<n;k++) S.sales.push({id:'s'+d+'_'+k,createdAt:iso(d),total:100+d*3+k*10,cost:60+d*2,paymentMethod:['cash','card','wallet'][k%3],cashierName:['Ndapewa','Tuyeni'][k%2],tillId:'t1',items:[{productId:P[0]&&P[0].id,name:(P[0]||{}).name||'Milk',qty:2,unitPrice:50,cost:30,lineTotal:100}]}); }
   S.sales.push({id:'r1',createdAt:iso(0),total:-40,refundOf:'s0_0',type:'refund',cashierName:'Ndapewa',items:[]});
   S.expenses=[{id:'e1',createdAt:iso(1),amount:250,category:'Rent'},{id:'e2',createdAt:iso(2),amount:80,category:'Transport'}];
   S.customers=[{id:'c1',name:'Mr Shikongo',balance:420,creditLimit:1000},{id:'c2',name:'Mrs Amutenya',balance:0}];
   S.suppliers=[{id:'u1',name:'Windhoek Wholesalers'}]; S.supplierInvoices=[{id:'i1',supplierId:'u1',amount:900,date:iso(3).slice(0,10)}]; S.supplierPayments=[{id:'p1',supplierId:'u1',amount:400,date:iso(2).slice(0,10)}]; S.purchaseOrders=[]; S.supplierStatements=[];
   S.till.current={id:'t1',cashierName:'Ndapewa',openedAt:iso(0)}; S.agentNotes=[{id:'n1',createdAt:iso(0),level:'warn',title:'Milk is running low',body:'Order more.'}];
   S.products.forEach((x,i)=>{ x.stockQty=i===0?0:(i===1?9:30); x.costPrice=x.costPrice||10; x.sellPrice=x.sellPrice||15; }); });
 const inputs={ sales_by_period:{period:'month'}, top_products:{period:'month'}, sales_by_staff:{period:'week'}, payment_methods:{period:'month'}, stock_value:{}, stock_variances:{}, out_of_stock:{}, slow_movers:{}, supplier_balances:{}, supplier_reconciliation:{supplier:'windhoek'}, reconciliation_status:{}, customer_history:{query:'shikongo'}, expenses_summary:{period:'month'}, till_status:{}, refunds_summary:{period:'week'}, vat_summary:{period:'month'}, profit_and_loss:{period:'month'}, forecast:{}, compare_periods:{kind:'week'}, unusual_days:{}, alerts_and_notes:{}, calc:{expression:'12*3+4'}, shop_summary:{period:'today'}, find_product:{query:'milk'}, low_stock:{}, customers_owing:{}, recall_memory:{query:'rent'} };
 for(const t of T){
   if(!inputs[t.name]) continue;
   const r=await p.evaluate(async([n,i])=>{ try{ const o=await window.__t.aiToolRun(n,i); let j=null; try{ j=JSON.parse(o.text.replace(/\.\.\.$/,'')); }catch(e){} return {ok:true,len:o.text.length,json:!!j,nums:Array.isArray(o.numbers)&&o.numbers.every(x=>typeof x==='number'&&isFinite(x)),text:o.text.slice(0,160)}; }catch(e){ return {ok:false,err:String(e.message||e)}; } },[t.name,inputs[t.name]]);
   ck('tool '+t.name+' answers with small JSON and clean numbers', r.ok&&r.len<=3003&&r.json&&r.nums, r);
 }
 const num=await p.evaluate(async()=>{ const a=await window.__t.aiToolRun('sales_by_period',{period:'today'}); const o=JSON.parse(a.text); const S=window.__t.State; const lo=new Date(); lo.setHours(0,0,0,0); const exp=S.sales.filter(s=>window.__t.saleMs(s)>=lo.getTime()).reduce((x,s)=>x+s.total,0); return {got:o.salesAfterRefunds,exp:Math.round(exp*100)/100,nums:a.numbers.includes(o.salesAfterRefunds)}; });
 ck('sales_by_period matches the sales list and offers its numbers for the amount check', Math.abs(num.got-num.exp)<0.011 && num.nums, num);
 const sv=await p.evaluate(async()=>JSON.parse((await window.__t.aiToolRun('stock_value',{})).text)); const exv=await p.evaluate(()=>{ const t=window.__t.stockTotals(); return Math.round(t.cost*100)/100; }); ck('stock_value agrees with the stock page totals', Math.abs(sv.valueAtCost-exv)<0.011, [sv.valueAtCost,exv]);
 ck('customer_history finds the customer', (await p.evaluate(async()=>JSON.parse((await window.__t.aiToolRun('customer_history',{query:'shikongo'})).text))).owes===420);
 ck('out_of_stock lists the empty product', (await p.evaluate(async()=>JSON.parse((await window.__t.aiToolRun('out_of_stock',{})).text))).count>=1);
 ck('vat_summary says plainly when there is no VAT registration', /no VAT registration|vatCollected/.test((await p.evaluate(async()=>(await window.__t.aiToolRun('vat_summary',{period:'month'})).text))));
 ck('vat wording leaves the decision to the authorities', /to be confirmed with the relevant legal bodies, authorities and entities of Namibia/.test(await p.evaluate(async()=>(await window.__t.aiToolRun('vat_summary',{period:'month'})).text)));
 ck('an unknown tool is refused', await p.evaluate(()=>{ try{ window.__t.aiToolRun('delete_all_sales',{}); return false; }catch(e){ return /not available/.test(e.message); } }));
 ck('no tool is able to write: tool names are read only', T.every(t=>!/^(add|delete|remove|set|change|send|record|update)_/.test(t.name)));
 ck('a cashier cannot use the tools', await p.evaluate(()=>{ const S=window.__t.State; const u=S.users.find(x=>x.id===S.session.userId); const r=u.role, r2=S.session.role; u.role='cashier'; S.session.role='cashier'; let blocked=false; try{ window.__t.aiToolRun('stock_value',{}); }catch(e){ blocked=/owner or a manager/.test(e.message); } u.role=r; S.session.role=r2; return blocked; }));


 const pr2=await p.evaluate(()=>{ const t=window.__t.blazePrompt(window.__t.BLAZE_SYSTEM,window.__t.blazeToolsFor(),[{role:'user',content:'hi'}]); return { n:t.split('<tools>').pop().split('</tools>')[0].trim().split('\n').length, biz:/"biz"/.test(t) }; });
 ck('the on device prompt lists the 29 shop tools and never prints an internal business field', pr2.n===29&&!pr2.biz, pr2);
 // the chat format must be identical to the one the training data uses
 const golden=fs.readFileSync(path.join(__dirname,'..','..','tools','blaze_training','golden_prompt.txt'),'utf8');
 const mine=await p.evaluate(t=>window.__t.blazePrompt(window.__t.BLAZE_SYSTEM,t.slice(0,3),[{role:'user',content:'How much did I sell today?'},{role:'assistant',content:'',calls:[{name:'sales_by_period',arguments:{period:'today'}}]},{role:'tool',content:'{"period": "today", "salesAfterRefunds": 1250.5}'},{role:'assistant',content:'You sold N$1,250.50 today.'},{role:'user',content:'thanks'}]),T);
 ck('the prompt the app builds equals the training text (golden file from make_dataset.py)', mine===golden, [mine.length,golden.length]);
 const sys=fs.readFileSync(path.join(__dirname,'..','..','tools','blaze_training','make_dataset.py'),'utf8').match(/SYSTEM = '([^']+)'/)[1];
 ck('the system prompt is the same in the app, the training script and the server', await p.evaluate(s=>window.__t.BLAZE_SYSTEM===s,sys));

 // reading the model's answer
 const parse=await p.evaluate(()=>{ const P=window.__t.blazeParse; return [P('<tool_call>\n{"name": "stock_value", "arguments": {}}\n</tool_call>'),P('Let me look.\n<tool_call>\n{"name": "sales_by_period", "arguments": {"period": "today"}}\n</tool_call>\n<tool_call>\n{"name": "customers_owing", "arguments": {}}\n</tool_call>'),P('Hello there<|im_end|>'),P('<tool_call>\n{"name": "stock_value", "arguments": {}'),P('<tool_call>\nnot json\n</tool_call>'),P('<tool_call>\n{"name": "x", "arguments": "oops"}\n</tool_call>')]; });
 ck('one tool call is read', parse[0].calls.length===1&&parse[0].calls[0].name==='stock_value');
 ck('two tool calls and the words before them are read', parse[1].calls.length===2&&parse[1].text==='Let me look.'&&parse[1].calls[0].arguments.period==='today');
 ck('plain words are kept and end markers removed', parse[2].text==='Hello there'&&parse[2].calls.length===0);
 ck('broken tool calls never crash and never run', parse[3].calls.length===0&&parse[4].calls.length===0&&parse[5].calls[0].arguments&&Object.keys(parse[5].calls[0].arguments).length===0);
 const chk=await p.evaluate(()=>{ const C=window.__t.blazeCheck; return [C('sales_by_period',{period:'today'}),C('sales_by_period',{period:'forever'}),C('sales_by_period',{}),C('nope',{}),C('stock_value',{x:'1'}),C('customer_history',{query:5}),C('supplier_reconciliation',{}),C('top_products',{period:'today'})]; });
 ck('the app checks tool input like the server does', JSON.stringify(chk)===JSON.stringify(['','bad_period','missing_period','unknown_tool','unexpected_x','missing_query','','bad_period']), chk);

 // the real model library ships with Pesa (no internet needed to load it) and has the calls Pesa uses
 const lib=await p.evaluate(async()=>{ const m=await window.__t.blazeLoadLib(); const w=new m.Wllama({default:new URL('./vendor/wllama/wllama.wasm',document.baseURI).href}); const h=await fetch('./vendor/wllama/wllama.wasm',{method:'HEAD'}); return {cls:typeof m.Wllama, load:typeof w.loadModelFromUrl, comp:typeof w.createCompletion, exit:typeof w.exit, quiet:typeof m.LoggerWithoutDebug, wasm:h.status, size:+h.headers.get('content-length')}; });
 ck('the wllama library loads from Pesa itself and has what Pesa uses', lib.cls==='function'&&lib.load==='function'&&lib.comp==='function'&&lib.exit==='function'&&lib.wasm===200&&lib.size>5e6, lib);
 // WebAssembly must be allowed by the page's security policy, or the real model could never start
 const wa=await p.evaluate(async()=>{ const csp=(document.querySelector('meta[http-equiv="Content-Security-Policy"]')||{}).content||''; let compiled=false,err=''; try{ const b=await (await fetch('./vendor/wllama/wllama.wasm')).arrayBuffer(); await WebAssembly.compile(b); compiled=true; }catch(e){ err=String(e&&e.message).slice(0,120); } return {csp:/wasm-unsafe-eval/.test(csp),compiled,err}; });
 ck('the security policy allows the model engine (WebAssembly) and it compiles', wa.csp&&wa.compiled, wa);
 // Blaze on this device, with a pretend model library
 await p.evaluate(()=>{ window.__fetchCalls=[]; const of=window.fetch; window.fetch=function(u,o){ window.__fetchCalls.push(String(u)); return of.apply(this,arguments); };
   window.__bzScript=[]; window.__bzPrompts=[];
   window.__blazeLib={ LoggerWithoutDebug:{}, Wllama:class{ constructor(){ } async loadModelFromUrl(u,o){ window.__bzUrl=u; for(const f of [.1,.5,1]){ o.progressCallback({loaded:Math.round(f*1e9),total:1e9}); await new Promise(r=>setTimeout(r,20)); } }
     async createCompletion(o){ window.__bzPrompts.push(o.prompt); if(o.abortSignal&&o.abortSignal.aborted){ const e=new Error('abort'); e.name='AbortError'; throw e; }
       if(window.__bzWait){ await new Promise((res,rej)=>{ const t=setTimeout(res,window.__bzWait); o.abortSignal&&o.abortSignal.addEventListener('abort',()=>{ clearTimeout(t); const e=new Error('abort'); e.name='AbortError'; rej(e); }); }); }
       const next=window.__bzScript.shift(); const text=typeof next==='function'?next(o.prompt):next; return {choices:[{text}]}; } async exit(){} }, forget(){} }; });
 ck('on this device the model needs the owner to set it up first', await p.evaluate(()=>{ const c=window.__t.blazeDevCfg(); return !c.on && !window.__t.blazeDeviceReady(); }));
 ck('this test browser can run Blaze (wasm and memory check)', (await p.evaluate(()=>window.__t.blazeCapability())).ok);
 await p.evaluate(()=>window.__t.aiSave({device:true,deviceOnly:false,blazeQ4:'https://models.example.com/blaze-q4_k_m.gguf',blazeQ8:'https://models.example.com/blaze-q8.gguf'}));
 ck('turned on but not downloaded is not ready', await p.evaluate(()=>!window.__t.blazeDownloaded()&&!window.__t.blazeDeviceReady()));
 const prog=await p.evaluate(async()=>{ const seen=[]; await window.__t.blazeLoad(x=>seen.push(Math.round(x.loaded/x.total*100))); return {seen,url:window.__bzUrl,dl:window.__t.blazeDownloaded()}; });
 ck('download shows progress, uses the model address and is remembered', prog.seen.join()==='10,50,100'&&/^https:\/\/models\.example\.com\/blaze-/.test(prog.url)&&prog.dl, prog);
 ck('once downloaded it is ready', await p.evaluate(()=>window.__t.blazeDeviceReady()));
 // a real question: tool call, tool run on the phone, answer from the tool result
 await p.evaluate(()=>{ window.__fetchCalls=[]; window.__bzPrompts=[]; window.__bzScript=['<tool_call>\n{"name": "sales_by_period", "arguments": {"period": "month"}}\n</tool_call>', p=>{ const m=/"salesAfterRefunds":\s*(-?[\d.]+)/.exec(p); return 'This month you sold N$'+Number(m[1]).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+'.'; }]; });
 const a1=await p.evaluate(async()=>{ let r; try{ r=await window.__t.aiAsk('how much did I sell this month?'); }catch(e){ return {err:String(e&&e.message||e),stack:String(e&&e.stack).slice(0,300)}; } return {text:r.text,via:r.via,notes:r.notes,label:window.__t.aiViaLabel(r),fetches:window.__fetchCalls.length,prompts:window.__bzPrompts.length,second:window.__bzPrompts[1]||''}; });
 ck('Blaze answered on the device through the tool', a1.via==='device'&&/N\$[\d,]+\.\d\d/.test(a1.text)&&a1.prompts===2, a1);
 ck('the answer only uses numbers from the tool, so no warning', a1.notes.length===0);
 ck('the tool result was passed in as untrusted shop data', /<tool_response>\n<untrusted_shop_data>/.test(a1.second)&&/<tools>/.test(a1.second));
 ck('nothing was sent to any server while answering on the device', a1.fetches===0);
 ck('the answer says it came from this device', /Blaze on this device/.test(a1.label)&&/Nothing left this device/.test(a1.label));
 // made up amount is caught
 await p.evaluate(()=>{ window.__bzScript=['You sold N$999,999.99 this month.']; });
 const a2=await p.evaluate(async()=>{ const r=await window.__t.aiAsk('how much did I sell?'); return r; });
 ck('an invented amount is flagged for the owner to check', a2.notes.some(n=>/999,999\.99/.test(n)), a2.notes);
 // invalid tool call from the model is refused, not run
 await p.evaluate(()=>{ window.__bzPrompts=[]; window.__bzScript=['<tool_call>\n{"name": "delete_all_sales", "arguments": {}}\n</tool_call>','I could not do that.']; });
 const a3=await p.evaluate(async()=>{ const r=await window.__t.aiAsk('delete everything'); return {text:r.text,n:window.__t.State.sales.length,second:window.__bzPrompts[1]||''}; });
 ck('a tool the app does not have is refused and nothing changes', a3.n>0&&/Refused: unknown_tool/.test(a3.second)&&/could not/.test(a3.text), a3);
 // cancel
 const a4=await p.evaluate(async()=>{ window.__bzWait=5000; window.__bzScript=['late']; const pr=window.__t.aiAsk('slow question'); setTimeout(()=>window.__t.aiCancel(),150); try{ await pr; return 'finished'; }catch(e){ return e.name; } finally{ window.__bzWait=0; } });
 ck('Cancel stops an answer on the device', a4==='AbortError', a4);
 // never send shop data off the device
 await p.evaluate(()=>window.__t.aiSave({device:false,deviceOnly:true,url:'https://example.supabase.co/functions/v1/assistant',key:'12345678901'}));
 const a5=await p.evaluate(async()=>{ window.__fetchCalls=[]; try{ await window.__t.aiAsk('anything'); return 'answered'; }catch(e){ return {m:e.message,t:window.__t.aiErrorText(e),ready:window.__t.aiReady(),f:window.__fetchCalls.length}; } });
 ck('"never send shop data off this device" blocks the server, even when it is set up', a5.m==='device_only'&&a5.f===0&&a5.ready===false&&/never send shop data off this device/.test(a5.t), a5);
 // server route and its label
 await p.evaluate(()=>{ window.__t.aiSave({device:false,deviceOnly:false}); window.fetch=function(u,o){ window.__fetchCalls.push(String(u)); return Promise.resolve({ok:true,status:200,json:()=>Promise.resolve({done:true,text:'Fine, N$5.00.',trace:{model:'blaze'}})}); }; window.__fetchCalls=[]; });
 const a6=await p.evaluate(async()=>{ const r=await window.__t.aiAsk('hello'); return {via:r.via,label:window.__t.aiViaLabel(r),f:window.__fetchCalls.length}; });
 ck('with the device off the question goes to the shop server, and the label says Blaze on your own server', a6.via==='server'&&a6.f===1&&/Blaze on your own server/.test(a6.label), a6);
 // settings screen
 await p.evaluate(()=>{ window.__t.aiSave({device:false,deviceOnly:false,blazeQ4:'',blazeQ8:''}); window.__t.openAiSettingsSheet(); }); await p.waitForSelector('#aiDev');
 ck('settings has the Blaze controls', !!(await p.$('#aiOnly'))&&!!(await p.$('#aiBzGo'))&&!!(await p.$('#aiQ4'))&&!!(await p.$('#aiBzDel'))&&/Blaze, your own AI/i.test(await p.innerText('.sheet')));
 ck('the settings wording is honest about mistakes and advice', /can be wrong/.test(await p.innerText('.sheet'))&&/not tax, legal or accounting advice/.test(await p.innerText('.sheet')));
 await p.evaluate(()=>{ document.getElementById('aiDev').click(); }); await p.waitForTimeout(150);
 ck('turning it on is saved and the status says what is missing', await p.evaluate(()=>window.__t.aiCfg().device===true)&&/not on this device yet|ready/.test(await p.innerText('#aiBzStatus')));
 await p.evaluate(()=>{ window.__t.blazeUnmark(); const i=document.getElementById('aiQ4'); i.value='https://models.example.com/blaze-q4_k_m.gguf'; i.dispatchEvent(new Event('change')); }); await p.waitForTimeout(100);
 await p.evaluate(()=>{ navigator.storage.estimate=()=>Promise.resolve({quota:5e8,usage:1e8}); }); await p.click('#aiBzGo'); await p.waitForTimeout(300); ck('too little free space is reported instead of starting', /enough free space/.test(await p.innerText('#aiBzStatus'))&&!(await p.$('#cfOk')));
 await p.evaluate(()=>{ navigator.storage.estimate=()=>Promise.resolve({quota:8e9,usage:1e6}); }); await p.click('#aiBzGo'); await p.waitForSelector('#cfOk',{timeout:4000});
 ck('the download asks first and shows the size', /about (1|1\.6) GB/.test(await p.innerText('.sheet')));
 await p.click('#cfOk'); await p.waitForFunction(()=>window.__t.blazeDownloaded(),null,{timeout:5000}); ck('after confirming, Blaze downloads to the device', true);
 await p.waitForTimeout(200);
 await p.evaluate(()=>window.__t.openAiSettingsSheet()); await p.waitForSelector('#aiBzDel'); await p.click('#aiBzDel'); await p.waitForTimeout(400);
 ck('Remove Blaze from this device clears it', await p.evaluate(()=>!window.__t.blazeDownloaded()));
 // weak device
 const weak=await p.evaluate(()=>{ const d=Object.getOwnPropertyDescriptor(navigator,'deviceMemory'); Object.defineProperty(navigator,'deviceMemory',{value:2,configurable:true}); const c=window.__t.blazeCapability(); window.__t.aiSave({device:true}); const t=window.__t.blazeStatusText(); if(d) Object.defineProperty(navigator,'deviceMemory',d); else delete navigator.deviceMemory; return {ok:c.ok,reasons:c.reasons,t}; });
 ck('a weak device is told honestly and offered the server instead', !weak.ok&&/2 GB/.test(weak.reasons.join(' '))&&/cannot run Blaze/.test(weak.t), weak);
 // Blaze can be found from the assistant page itself
 await p.evaluate(()=>{ window.__t.aiSave({device:false,deviceOnly:false,url:'',key:''}); window.__t.blazeUnmark(); window.__t.closeModal(); window.__t.openAgentSheet(); }); await p.waitForSelector('#agBz');
 ck('the assistant page shows that Blaze is off and where to turn it on', /Blaze, your own AI, is off/.test(await p.innerText('#agBz'))&&/Set up/.test(await p.innerText('#agBz')));
 await p.fill('#agQ','Hello'); await p.click('#agGo'); await p.waitForFunction(()=>/understand/.test(document.getElementById('agOut').innerText),null,{timeout:4000}).catch(()=>{});
 ck('an open question tells the owner how to turn Blaze on instead of a dead end', /turn on Blaze/.test(await p.innerText('#agOut')));
 await p.click('#agBz'); await p.waitForSelector('#aiDev',{timeout:3000}); ck('tapping it opens the Pesa AI settings with the Blaze switch', true);
 await p.evaluate(()=>{ window.__t.aiSave({device:true}); window.__t.closeModal(); window.__t.openAgentSheet(); }); await p.waitForSelector('#agBz');
 ck('turned on but not downloaded says so', /not downloaded yet/.test(await p.innerText('#agBz')));
 await p.evaluate(()=>{ window.__t.blazeMark('https://x.example/blaze.gguf','q4'); window.__t.closeModal(); window.__t.openAgentSheet(); }); await p.waitForSelector('#agBz');
 ck('ready on this device says so', /answering on this device/.test(await p.innerText('#agBz')));
 ck('no page errors', errs.length===0, errs);
 await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
