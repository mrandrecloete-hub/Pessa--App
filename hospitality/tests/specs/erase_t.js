// Erase everything on this device from the outside (sign in screen), no password, typed word first.
const { chromium } = require('playwright');
let fail=0; const ck=(n,c,x)=>{ console.log((c?'  ok   ':'  FAIL ')+n+(!c&&x!==undefined?'  -> '+JSON.stringify(x).slice(0,300):'')); if(!c) fail++; };
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:412,height:915},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await require('./biz_boot.js')(p,{demo:true,name:'Forgotten Shop'});
 ck('the sign in screen has the erase link', await p.evaluate(()=>/data-erase-device/.test(window.__t.renderLoginHtml())));
 ck('so does the register screen row', await p.evaluate(()=>/data-erase-device/.test(window.__t.newHereHtml())));
 // two businesses on this device, as the owner described
 await p.evaluate(()=>{ localStorage.setItem('pesa_workspaces_v1',JSON.stringify([{id:'default',name:'Forgotten Shop'},{id:'b2',name:'Second Shop'}])); localStorage.setItem('pesa_backup_last_default','1'); });
 await p.evaluate(()=>window.__t.openEraseDeviceSheet()); await p.waitForSelector('#edWord');
 const txt=await p.innerText('.sheet');
 ck('it names the businesses that will go', /Forgotten Shop/.test(txt)&&/Second Shop/.test(txt));
 ck('it says it cannot be undone and what is and is not erased', /cannot be undone/i.test(txt)&&/What is erased/i.test(txt)&&/What is not erased/i.test(txt)&&/cloud sync project/.test(txt));
 ck('the erase button is off until the word is typed', await p.evaluate(()=>document.getElementById('edGo').disabled===true));
 await p.fill('#edWord','erase me'); ck('a wrong word keeps it off', await p.evaluate(()=>document.getElementById('edGo').disabled===true));
 await p.fill('#edWord','ERASE'); ck('typing ERASE turns it on', await p.evaluate(()=>document.getElementById('edGo').disabled===false));
 await p.click('#edNo'); await p.waitForTimeout(300);
 ck('Cancel erases nothing', await p.evaluate(()=>window.__t.State.products.length>0&&window.__t.State.users.length>0));
 await p.evaluate(()=>window.__t.openEraseDeviceSheet()); await p.waitForSelector('#edWord'); await p.fill('#edWord','erase');
 await Promise.all([p.waitForNavigation({timeout:15000}).catch(()=>{}), p.click('#edGo')]);
 await p.waitForSelector('#rcCompanyName',{timeout:15000});
 ck('after erasing the app starts fresh on the register screen', true);
 const after=await p.evaluate(async()=>{ const reg=localStorage.getItem('pesa_workspaces_v1'); return {reg, users:window.__t.State.users.length, products:window.__t.State.products.length, ls:localStorage.length, dbs:(indexedDB.databases?(await indexedDB.databases()).map(d=>d.name):[]), ws:window.__t.WS.list().length, named:window.__t.WS.list().filter(w=>w.name).length}; });
 ck('no business, product or account is left', after.users===0&&after.products===0&&after.named===0, after);
 ck('the saved business list and device settings are gone', !/Second Shop|Forgotten Shop/.test(after.reg||''), after.reg);
 ck('no page errors', errs.length===0, errs);
 await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
