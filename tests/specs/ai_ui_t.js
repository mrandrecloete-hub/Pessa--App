const { chromium } = require('playwright');
let fail=0; const ck=(n,c)=>{ console.log((c?'  ok   ':'  FAIL ')+n); if(!c){fail++;} };
(async()=>{
  const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:900},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  let reqs=[], script=[];
  await ctx.route('https://ai.test/**', async route=>{ const req=route.request(); let body={}; try{ body=JSON.parse(req.postData()||'{}'); }catch(e){} reqs.push({ headers:req.headers(), body }); const next=script.shift();
    if(!next) return route.fulfill({ status:500, contentType:'application/json', body:'{"error":"none"}' });
    return route.fulfill({ status:next.status||200, contentType:'application/json', body:JSON.stringify(next.json) }); });
  await require('./biz_boot.js')(p,{demo:true});
  const T=(f,...a)=>p.evaluate(([f,a])=>window.__t[f].apply(null,a),[f,a]);
  // a sale today so the summary has something to say
  await p.evaluate(async()=>{ const t=window.__t; await t.refs.sales.doc().set({ total:120, createdAt:new Date().toISOString(), items:[], paymentMethod:'cash' }); await new Promise(r=>setTimeout(r,300)); });
  // pure pieces
  ck('calculator is exact and refuses code', (await T('aiCalc','(150+50)*0.15'))===30 && await p.evaluate(()=>{ try{ window.__t.aiCalc('alert(1)'); return false; }catch(e){ return true; } }) && await p.evaluate(()=>{ try{ window.__t.aiCalc('1/0'); return false; }catch(e){ return true; } }));
  const st = await T('aiCsvStats','Item,Qty,Price\nBread,2,N$10.50\nMilk,3,"1,200.00"\n');
  ck('csv totals are worked out on the phone', st.rows===2 && st.columns[1].sum===5 && st.columns[2].sum===1210.5 && st.columns[0].kind==='text');
  ck('the tools cannot change anything (no write tools exist)', await p.evaluate(()=>{ try{ window.__t.aiToolRun('delete_sale',{}); return false; }catch(e){ return true; } }));
  // not set up: the AI is never used
  ck('AI is off until it is set up', (await T('aiReady'))===false);
  await p.evaluate(()=>localStorage.setItem('pesa_ai_v1', JSON.stringify({ url:'https://ai.test/assistant', key:'a-long-access-key', on:true, memory:true })));
  ck('AI is ready once set up', (await T('aiReady'))===true);
  // the assistant: rules first, no server call
  await p.evaluate(()=>{ window.__t.closeModal(); }); await p.waitForTimeout(500); await p.evaluate(()=>{ window.__t.openAgentSheet(); }); await p.waitForSelector('#agQ');
  await p.fill('#agQ','open settings'); await p.press('#agQ','Enter'); await p.waitForTimeout(900);
  ck('a question the rules understand never reaches the server', reqs.length===0);
  await p.evaluate(()=>{ window.__t.closeModal(); }); await p.waitForTimeout(500); await p.evaluate(()=>{ window.__t.openAgentSheet(); }); await p.waitForSelector('#agQ');
  // unknown question: server asks for a phone tool, the phone runs it, the server answers
  script=[ { json:{ done:false, assistant:[{type:'tool_use',id:'t1',name:'shop_summary',input:{period:'today'}}], serverResults:[], calls:[{id:'t1',name:'shop_summary',input:{period:'today'}}], sources:[], trace:{} } },
           { json:{ done:true, text:'You sold N$120.00 today. You also made N$999.00 on a bonus.', sources:[{n:1,title:'Example',url:'https://example.com/a'}], notes:[], trace:{ model:'fast-m', tokensIn:50, tokensOut:20 } } } ];
  await p.fill('#agQ','Explain how my day is going compared with a normal day'); await p.press('#agQ','Enter'); await p.waitForFunction(()=>/Written by AI/.test(document.body.innerText),null,{timeout:8000});
  const txt=await p.evaluate(()=>document.body.innerText);
  ck('the answer is shown with the AI label', /You sold N\$120\.00 today/.test(txt) && /Written by AI/.test(txt));
  ck('a figure that did not come from the shop or the calculator is flagged', /N\$999\.00/.test(txt.split('Check these amounts')[1]||'') && !/N\$120\.00/.test(txt.split('Check these amounts')[1]||''));
  ck('sources are listed with real links', /\[1\] Example https:\/\/example\.com\/a/.test(txt));
  ck('two requests: question, then tool results', reqs.length===2 && reqs[1].body.messages.length===3 && reqs[1].body.messages[2].content[0].type==='tool_result');
  ck('the shop tool ran on the phone with the real total', /120/.test(reqs[1].body.messages[2].content[0].content) && reqs[1].body.messages[2].content[0].content.includes('<untrusted_shop_data>'));
  ck('only the access key header is sent, no passwords or provider keys', reqs.every(r=>Object.keys(r.headers).filter(k=>/key|auth|secret|token/i.test(k)).join()==='x-pesa-key') && !JSON.stringify(reqs.map(r=>r.body)).match(/password|passHash|api[_-]?key/i));
  ck('the audit log has no question or answer text', await p.evaluate(()=>{ const a=(window.__t.State.audit||[]); return !JSON.stringify(a).includes('how my day is going'); }));
  // server errors are explained, nothing breaks
  script=[ { status:429, json:{ error:'daily_budget_reached' } } ];
  await p.evaluate(()=>{ window.__t.closeModal(); }); await p.waitForTimeout(500); await p.evaluate(()=>{ window.__t.openAgentSheet(); }); await p.waitForSelector('#agQ'); await p.fill('#agQ','Is rainy weather usually bad for a small shop like mine'); await p.press('#agQ','Enter'); await p.waitForFunction(()=>/daily AI limit/.test(document.body.innerText),null,{timeout:8000});
  ck('the daily budget message is clear', true);
  // tool loop is bounded
  script=Array.from({length:6},()=>({ json:{ done:false, assistant:[{type:'tool_use',id:'x',name:'calc',input:{expression:'1+1'}}], serverResults:[], calls:[{id:'x',name:'calc',input:{expression:'1+1'}}], sources:[], trace:{} } }));
  reqs=[]; await p.evaluate(()=>{ window.__t.closeModal(); }); await p.waitForTimeout(500); await p.evaluate(()=>{ window.__t.openAgentSheet(); }); await p.waitForSelector('#agQ'); await p.fill('#agQ','Keep going forever please'); await p.press('#agQ','Enter'); await p.waitForFunction(()=>/too many steps/.test(document.body.innerText),null,{timeout:8000});
  ck('a runaway tool loop stops after a few rounds', reqs.length<=4);
  // notes: remember with confirm, list, edit, delete
  await p.evaluate(()=>{ window.__t.closeModal(); }); await p.waitForTimeout(500); await p.evaluate(()=>{ window.__t.openAgentSheet(); }); await p.waitForSelector('#agQ'); await p.fill('#agQ','remember that we close at 5pm on Fridays'); await p.press('#agQ','Enter'); await p.waitForSelector('#agYes',{timeout:4000});
  ck('nothing is saved before the owner confirms', (await T('aiNotes')).length===0);
  await p.click('#agYes'); await p.waitForTimeout(300);
  ck('the note is saved after confirming', (await T('aiNotes')).length===1 && (await T('aiNotes'))[0].text==='we close at 5pm on Fridays');
  ck('only relevant notes are sent along', (await T('aiNotesFor','what time do we close on friday')).length===1 && (await T('aiNotesFor','weather')).length===0);
  await p.evaluate(()=>window.__t.openAiNotesSheet()); await p.waitForSelector('.aiNoteIn');
  await p.fill('.aiNoteIn','we close at 6pm on Fridays'); await p.click('[data-nsave]'); await p.waitForTimeout(150);
  ck('a note can be corrected', (await T('aiNotes'))[0].text==='we close at 6pm on Fridays');
  await p.click('[data-ndel]'); await p.waitForTimeout(300);
  ck('a note can be deleted', (await T('aiNotes')).length===0);
  // notes belong to one business and expire
  await p.evaluate(()=>{ const t=window.__t; t.aiNoteAdd('old note'); const all=JSON.parse(localStorage.getItem('pesa_ai_mem_v1')); const k=Object.keys(all)[0]; all[k][0].at=Date.now()-200*86400000; all['other-business']=[{id:'z',text:'secret of another shop',at:Date.now()}]; localStorage.setItem('pesa_ai_mem_v1',JSON.stringify(all)); });
  ck('notes older than 180 days are dropped and other businesses notes are never read', (await T('aiNotes')).length===0 && (await T('aiNotesFor','secret of another shop')).length===0);
  // employees do not get the AI
  ck('employees do not get the AI', await p.evaluate(()=>{ const t=window.__t, u=t.State.users.find(x=>x.id===t.State.session.userId), r=u.role; u.role='cashier'; const v=t.aiReady(); u.role=r; return v===false; }));
  // attach file then ask
  await p.evaluate(()=>{ const t=window.__t; });
  const doc = await p.evaluate(()=>{ const t=window.__t; return t.aiToolRun('analyze_csv',{}).text; });
  ck('analysing without a file says so', /No file is attached/.test(doc));
  ck('no page errors', errs.length===0); if(errs.length) console.log(errs.join(' | '));
  await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
