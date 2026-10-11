// Erase ONE business from the sign in screen, no password, typed word first. Other businesses stay.
const { chromium } = require('playwright');
let fail=0; const ck=(n,c,x)=>{ console.log((c?'  ok   ':'  FAIL ')+n+(!c&&x!==undefined?'  -> '+JSON.stringify(x).slice(0,300):'')); if(!c) fail++; };
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:412,height:915},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await require('./biz_boot.js')(p,{demo:true,name:'First Shop'});
 ck('the sign in screen has a trash button next to the business name', await p.evaluate(()=>/data-erase-ws="default"/.test(window.__t.renderLoginHtml())));
 // a second business with its own data, a backup and a folder link
 await p.evaluate(async()=>{ const P=window.__t.Persist; P.data()['ws_b2__products']={p1:{name:'Second shop item'}}; P.touch('ws_b2__products','p1');
   localStorage.setItem('pesa_workspaces_v1',JSON.stringify([{id:'default',name:'First Shop'},{id:'b2',name:'Second Shop'}])); localStorage.setItem('pesa_last_user_b2','u1'); localStorage.setItem('pesa_backup_last_b2','1');
   await new Promise(res=>{ const r=indexedDB.open('pesa_backups_v1',1); r.onupgradeneeded=()=>r.result.createObjectStore('snaps',{keyPath:'key'}); r.onsuccess=()=>{ const db=r.result; const tx=db.transaction('snaps','readwrite'); tx.objectStore('snaps').put({key:'b2|1',ws:'b2',at:1,json:'{}'}); tx.objectStore('snaps').put({key:'default|1',ws:'default',at:1,json:'{}'}); tx.oncomplete=()=>{ db.close(); res(); }; }; });
   await P.saved(); });
 ck('the other business is listed on this device', await p.evaluate(()=>window.__t.WS.others().some(w=>w.id==='b2')));
 await p.evaluate(()=>window.__t.openEraseBusinessSheet('b2')); await p.waitForSelector('#ebWord');
 const txt=await p.innerText('.sheet'); ck('the sheet names the business and warns it cannot be undone', /Second Shop/.test(txt)&&/cannot be undone/i.test(txt));
 ck('the erase button is off until ERASE is typed', await p.evaluate(()=>document.getElementById('ebGo').disabled===true));
 await p.fill('#ebWord','nope'); ck('a wrong word keeps it off', await p.evaluate(()=>document.getElementById('ebGo').disabled===true));
 await p.click('#ebNo'); await p.waitForTimeout(300); ck('Cancel erases nothing', await p.evaluate(()=>window.__t.WS.others().some(w=>w.id==='b2')));
 await p.evaluate(()=>window.__t.openEraseBusinessSheet('b2')); await p.waitForSelector('#ebWord'); await p.fill('#ebWord','erase');
 await Promise.all([p.waitForNavigation({timeout:15000}).catch(()=>{}), p.click('#ebGo')]);
 await p.waitForSelector('body',{timeout:15000}); await p.waitForTimeout(1500);
 const a=await p.evaluate(async()=>{ const P=window.__t.Persist; await P.ready; const d=P.data(); const snaps=await new Promise(res=>{ const r=indexedDB.open('pesa_backups_v1',1); r.onsuccess=()=>{ const db=r.result; const q=db.transaction('snaps').objectStore('snaps').getAll(); q.onsuccess=()=>{ db.close(); res(q.result.map(x=>x.ws)); }; }; });
   return { ws:window.__t.WS.list().map(w=>w.id), b2:Object.keys(d).filter(k=>k.indexOf('ws_b2__')===0).length, firstProducts:Object.keys(d.products||{}).length, lsB2:Object.keys(localStorage).filter(k=>/b2/.test(k)), snaps, lsFirst:localStorage.getItem('pesa_workspaces_v1') }; });
 ck('the second business is gone from the list and its data, settings and backups are erased', !a.ws.includes('b2')&&a.b2===0&&a.lsB2.length===0&&!a.snaps.includes('b2'), a);
 ck('the first business and its backup are untouched', a.ws.includes('default')&&a.firstProducts>0&&a.snaps.includes('default'), a);
 // now the business that is open
 await p.evaluate(()=>window.__t.openEraseBusinessSheet(window.__t.WS.id)); await p.waitForSelector('#ebWord'); await p.fill('#ebWord','ERASE');
 await Promise.all([p.waitForNavigation({timeout:15000}).catch(()=>{}), p.click('#ebGo')]);
 await p.waitForSelector('#rcCompanyName',{timeout:15000});
 const z=await p.evaluate(()=>({id:window.__t.WS.id, users:window.__t.State.users.length, products:window.__t.State.products.length, named:window.__t.WS.list().filter(w=>w.name).length}));
 ck('erasing the open business leaves a fresh start on the register screen, with a new empty business', z.users===0&&z.products===0&&z.named===0&&z.id!=='default', z);
 ck('no page errors', errs.length===0, errs);
 await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
