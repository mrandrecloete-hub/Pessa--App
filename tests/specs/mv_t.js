const { chromium } = require('playwright');
const D=(process.env.PESA_OUT||require('os').tmpdir()+'/pesa-tests/');
(async()=>{ const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}); const p=await ctx.newPage(); const e=[]; p.on('pageerror',x=>e.push(x.message));
 await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
 await p.fill('#rcCompanyName','Dinner'); await p.fill('#rcOwnerName','Alice'); await p.fill('#rcOwnerEmail','a@x.com'); await p.fill('#rcOwnerPassword','aaaa1111'); await p.fill('#rcOwnerPassword2','aaaa1111'); await p.click('#rcSubmit');
 await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card'); await p.evaluate(()=>{ try{ window.__t.btSave({ setupHidden:true, simpleMode:false }); window.__t.pfSave({ remindAt:Date.now() }); }catch(e){} });
 await p.evaluate(async()=>{const T=window.__t; await T.refs.users.doc().set({name:'Sam',role:'cashier',passHash:'x',active:true,jobTitle:'Till'}); await T.refs.users.doc().set({name:'Stella',role:'stockclerk',passHash:'x',active:true});});
 await p.waitForTimeout(300);
 await p.evaluate(()=>{const T=window.__t;const o=T.State.users.find(x=>x.role==='owner');const k=Object.keys(localStorage).find(k=>/consent/i.test(k));const v=localStorage.getItem(k);for(const n of ['Sam','Stella']){const u=T.State.users.find(x=>x.name===n);localStorage.setItem(k.replace(o.id,u.id),v);}});
 // owner sends broadcast + direct
 await p.evaluate(()=>window.__t.setTab('team')); await p.click('[data-trkmsg=all]'); await p.waitForSelector('#cmBody'); await p.fill('#cmTitle','Closing time'); await p.fill('#cmBody','Please count the bread before closing today.'); await p.click('[data-cmk=instruction]'); await p.click('#cmUrgent'); await p.click('#cmSend'); await p.waitForTimeout(300);
 const S=()=>p.evaluate(()=>{const T=window.__t;return T.State.users.find(x=>x.name==='Sam').id});
 // employee Sam
 await p.evaluate(()=>{const T=window.__t,u=T.State.users.find(x=>x.name==='Sam');T.State.session={userId:u.id,name:'Sam',role:'cashier'};T.setTab('me');}); await p.waitForTimeout(500);
 await p.click('[data-me=inbox]'); await p.waitForSelector('[data-thread]'); await p.screenshot({path:D+'mv1_inbox.png'});
 await p.click('[data-thread]'); await p.waitForSelector('#mvText'); await p.click('[data-q^="Done"]'); await p.waitForTimeout(400); await p.screenshot({path:D+'mvdbg.png'}); await p.fill('#mvText','Counted: 12 loaves left.'); await p.click('#mvSend'); await p.waitForTimeout(300); await p.screenshot({path:D+'mv2_thread_emp.png'});
 // Stella also replies
 await p.evaluate(()=>window.__t.closeModal());
 await p.evaluate(()=>{const T=window.__t,u=T.State.users.find(x=>x.name==='Stella');T.State.session={userId:u.id,name:'Stella',role:'stockclerk'};T.setTab('me');}); await p.waitForTimeout(400);
 await p.click('[data-me=inbox]'); await p.click('[data-thread]'); await p.waitForSelector('#mvText'); await p.fill('#mvText','Understood boss'); await p.press('#mvText','Enter'); await p.waitForTimeout(300); await p.evaluate(()=>window.__t.closeModal());
 // owner
 await p.evaluate(()=>{const T=window.__t,u=T.State.users.find(x=>x.role==='owner');T.State.session={userId:u.id,name:u.name,role:'owner'};T.setTab('dashboard');}); await p.waitForTimeout(500);
 await p.screenshot({path:D+'mv3_owner_dash.png'});
 console.log('owner unread cards', await p.$$eval('[data-goinbox]',x=>x.map(y=>y.textContent.trim().slice(0,80))));
 await p.click('[data-goinbox]'); await p.waitForSelector('[data-thread]'); await p.screenshot({path:D+'mv4_owner_inbox.png'});
 await p.click('[data-thread]'); await p.waitForSelector('#mvText'); await p.selectOption('#mvTo', {label:'Sam'}); await p.fill('#mvText','Great work Sam!'); await p.click('#mvSend'); await p.waitForTimeout(300); await p.screenshot({path:D+'mv5_owner_thread.png'});
 console.log('replies', await p.evaluate(()=>JSON.stringify(window.__t.State.messages.filter(m=>m.threadId).map(m=>[m.fromName,m.toName,m.body]))));
 // Sam sees owner reply, Stella does not
 await p.evaluate(()=>window.__t.closeModal());
 console.log('visibility', await p.evaluate(()=>{const T=window.__t;const out={};for(const n of ['Sam','Stella']){const u=T.State.users.find(x=>x.name===n);T.State.session={userId:u.id,name:n,role:'x'};out[n]=T.State.messages.filter(m=>m.threadId?(m.fromId===u.id||m.to===u.id):(m.fromId===u.id||m.to==='all'||m.to===u.id)).map(m=>m.body.slice(0,12));}return JSON.stringify(out);}));
 // deletion tests
 await p.evaluate(()=>{const T=window.__t,u=T.State.users.find(x=>x.name==='Sam');T.State.session={userId:u.id,name:'Sam',role:'cashier'};T.setTab('me');}); await p.waitForTimeout(300);
 await p.click('[data-me=inbox]'); await p.waitForSelector('[data-thread]'); await p.click('[data-thread]'); await p.waitForSelector('#mvTrash'); await p.screenshot({path:D+'mv6_trash.png'}); await p.click('#mvTrash'); await p.waitForSelector('#dmMe'); console.log('emp has all btn', await p.$('#dmAll')!==null); await p.screenshot({path:D+'mv7_confirm.png'}); await p.click('#dmMe'); await p.waitForTimeout(300);
 console.log('Sam threads after delete', await p.evaluate(()=>{const T=window.__t;return document.querySelectorAll('[data-thread]').length}));
 await p.evaluate(()=>window.__t.closeModal());
 await p.evaluate(()=>{const T=window.__t,u=T.State.users.find(x=>x.role==='owner');T.State.session={userId:u.id,name:u.name,role:'owner'};T.setTab('team');}); await p.waitForTimeout(300);
 await p.click('[data-trklog]'); await p.waitForSelector('[data-thread]'); console.log('owner still sees', await p.$$eval('[data-thread]',x=>x.length));
 await p.click('[data-del]'); await p.waitForSelector('#dmAll'); await p.screenshot({path:D+'mv8_owner_confirm.png'}); await p.click('#dmAll'); await p.waitForTimeout(400);
 console.log('after delete all: messages in store', await p.evaluate(()=>window.__t.State.messages.length));
 console.log(e); await b.close(); })();
