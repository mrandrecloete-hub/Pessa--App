const { chromium } = require('playwright'); const fs=require('fs');
const D=(process.env.PESA_OUT||'/tmp/pesa-tests/');
let fail=0; const ck=(n,c)=>{ console.log((c?'  ok   ':'  FAIL ')+n); if(!c){fail++;} };
(async()=>{
  const b = await chromium.launch({args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
  const ctx = await b.newContext({viewport:{width:390,height:844}, serviceWorkers:'block', permissions:['microphone']});
  const posts=[]; await ctx.route('https://mock.test/**', r=>{ const q=r.request(); if(q.method()==='POST'){ try{ posts.push(...JSON.parse(q.postData())); }catch(e){} return r.fulfill({status:201,body:''}); } return r.fulfill({status:200,contentType:'application/json',body:'[]'}); });
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
  await p.fill('#rcCompanyName','Off Shop'); await p.fill('#rcOwnerName','Alice'); await p.fill('#rcOwnerEmail','a@x.com');
  await p.fill('#rcOwnerPassword','aaaa1111'); await p.fill('#rcOwnerPassword2','aaaa1111'); await p.click('#rcSubmit');
  await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card');
  await p.evaluate(()=>window.__t.openStaffSheet(null)); await p.waitForSelector('#sfName');
  await p.fill('#sfName','Sam'); await p.selectOption('#sfRole','cashier'); await p.fill('#sfJob','Till'); await p.click('#sfSave'); await p.waitForSelector('#invWa'); await p.evaluate(()=>window.__t.closeModal());
  const sam = await p.evaluate(async()=>{ const T=window.__t; const u=T.State.users.find(x=>x.name==='Sam'); await T.refs.users.doc(u.id).update({pending:false,active:true}); return u.id; });
  // chat without sync: strip says it stays on the device
  await p.evaluate(async(s)=>{ await window.__t.refs.messages.add({to:s,toName:'Sam',fromId:window.__t.State.session.userId,fromName:'Alice',kind:'message',urgent:false,title:'',body:'Hello Sam',readBy:{},createdAt:new Date().toISOString()}); },sam);
  await p.waitForTimeout(300);
  await p.evaluate(()=>window.__t.openInboxSheet()); await p.click('.mv-card'); await p.waitForSelector('#mvChat .mv-bub');
  ck('strip says messages stay on this device when sync is off', /stay on this device/.test(await p.innerText('#mvTop')));
  await p.evaluate(()=>window.__t.closeModal());
  // turn sync on against the mock
  await p.evaluate(()=>window.__t.Sync.enable('https://mock.test','k','AAAA-BBBB-CCCC-DDDD-EEEE')); await p.waitForTimeout(1500);
  ck('existing message was uploaded', posts.some(r=>r.coll==='messages'));
  await p.evaluate(()=>window.__t.openInboxSheet()); await p.click('.mv-card'); await p.waitForSelector('#mvChat .mv-bub');
  ck('no strip when sync is on and online', !(await p.$('.mv-net')));
  // go offline and send text and photo
  await ctx.setOffline(true); await p.waitForTimeout(300);
  ck('offline strip shown', /offline/i.test(await p.innerText('#mvTop')));
  const before=posts.length;
  await p.fill('#mvText','Sent while offline'); await p.click('#mvSend'); await p.waitForTimeout(500);
  await p.screenshot({path:D+'chat_offline.png'});
  ck('clock shown on unsent message', !!(await p.$('#mvChat .mv-tk.wait')));
  ck('outbox holds the message', (await p.evaluate(()=>window.__t.Sync.pendingCount()))>=1);
  ck('nothing was posted while offline', posts.length===before);
  const stored = await p.evaluate(()=>window.__t.State.messages.filter(m=>m.body==='Sent while offline').length); ck('message saved locally', stored===1);
  await p.evaluate(async()=>{ const T=window.__t; await T.refs.messages.add({to:'x',toName:'x',fromId:T.State.session.userId,fromName:'Alice',kind:'reply',threadId:T.State.messages[T.State.messages.length-1].id,urgent:false,title:'',body:'queued two',audio:'data:audio/webm;base64,AAAA',dur:3,readBy:{},createdAt:new Date().toISOString()}); });
  // back online
  await ctx.setOffline(false); await p.waitForTimeout(3500);
  ck('queued message posted after reconnect', posts.some(r=>r.coll==='messages' && r.data && r.data.body==='Sent while offline'));
  ck('outbox emptied', (await p.evaluate(()=>window.__t.Sync.pendingCount()))===0);
  ck('clock gone', !(await p.$('#mvChat .mv-tk.wait')));
  ck('offline strip gone', !(await p.$('.mv-net')));
  // a message from another device arrives via pull
  await p.screenshot({path:D+'chat_online.png'});
  ck('no page errors', errs.length===0); if(errs.length) console.log(errs);
  console.log(fail? 'FAILED '+fail : 'ALL OK'); await b.close(); process.exit(fail?1:0);
})();
