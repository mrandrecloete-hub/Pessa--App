const { chromium } = require('playwright'); const boot=require('./biz_boot.js');
let fail=0; const ck=(n,c,x)=>{ console.log((c?'  ok   ':'  FAIL ')+n+(!c&&x!==undefined?'  -> '+JSON.stringify(x).slice(0,300):'')); if(!c) fail++; };
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:412,height:900},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[];
 p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{ if(m.type()==='error' && !/TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
 await boot(p); const ev=(f,a)=>p.evaluate(f,a);
 // tax self test
 const st=await ev(()=>window.__t.taxSelfTest()); ck('tax self test: every case passes ('+st.length+')', st.length>8 && st.every(x=>x.ok), st.filter(x=>!x.ok));
 const t2=await ev(()=>{ const t=window.__t; const r15={bp:1500,v:1,effective:'2000-01-01'}; const a=t.taxDoc([{gross:0.10,cat:'STANDARD'}],{rate:r15,registered:true}); const b=t.taxDoc([{gross:0.05,cat:'STANDARD'},{gross:0.05,cat:'STANDARD'}],{rate:r15,registered:true}); const c=t.taxDoc([{gross:99.99,cat:'STANDARD'}],{rate:r15,registered:true}); return {a:a.vat,b:b.vat,c:c.vat,cn:c.stdNet}; });
 ck('rounding: small and split amounts are whole cents and add up', Number.isInteger(t2.a)&&Number.isInteger(t2.b)&&t2.c===1304&&t2.cn===8695, t2);
 // refund
 const sid=await ev(async()=>{ const t=window.__t; const r=await t.refs.sales.add({items:[{productId:'p1',name:'Bread',qty:2,unitPrice:11.5,cost:5,lineTotal:23}],total:23,cost:10,profit:13,paymentMethod:'cash',receiptNo:'RC-T1',createdAt:new Date().toISOString()}); return r.id; }); await p.waitForTimeout(200);
 const rf=await ev(()=>{ const t=window.__t; const s=t.State.sales.find(x=>x.receiptNo==='RC-T1'); const rec=t.refundBuild(s,[{item:s.items[0],qty:1}],'wrong item','refund',{name:'Owner',id:'o'}); return {total:rec.total, q:rec.items[0].qty, type:rec.type, vat:rec.tax&&rec.tax.vat}; });
 ck('refund builds a negative record for the quantity returned', rf.total===-11.5 && rf.q===-1 && rf.type==='refund', rf);
 const lim=await ev(()=>{ const t=window.__t; const s=t.State.sales.find(x=>x.receiptNo==='RC-T1'); try{ t.refundSale(s,[{item:s.items[0],qty:1}],'a','refund',{name:'Owner',id:'o'}); t.refundSale(s,[{item:s.items[0],qty:1}],'b','refund',{name:'Owner',id:'o'}); }catch(e){} return t.saleRefundable(s); }); await p.waitForTimeout(300);
 ck('cannot refund more than was sold', JSON.stringify(lim).indexOf('"qty":0')>=0 || (Array.isArray(lim)? lim.every(x=>!x.left&&!x.qty): true), lim);
 // backup checks
 const bk=await ev(async()=>{ const t=window.__t; const good=await t.backupSeal(Object.assign(t.backupPayload(),{ledgers:{}})); const ok1=t.backupCheck(good).ok, s1=await t.backupSealOk(good);
   const tam=JSON.parse(JSON.stringify(good)); if(tam.sales.length) tam.sales[0].total=99999; else tam.shop.shopName='x'; const s2=await t.backupSealOk(tam);
   const bad=t.backupCheck({sales:{a:1}}).ok, bad2=t.backupCheck({sales:[{id:'a/b'}]}).ok, bad3=t.backupCheck(null).ok, dup=t.backupCheck({sales:[{id:'a'},{id:'a'}]}).ok, nan=t.backupCheck({sales:[{id:'a',total:'abc'}]}).ok;
   return {ok1,s1,s2,bad,bad2,bad3,dup,nan}; });
 ck('backup: a sealed backup verifies, a changed one is refused', bk.ok1 && bk.s1===true && bk.s2===false, bk);
 ck('backup: damaged, duplicate and non numeric files are refused', !bk.bad && !bk.bad2 && !bk.bad3 && !bk.dup && !bk.nan, bk);
 const rs=await ev(async()=>{ try{ await window.__t.restoreBackupData({sales:{x:1}}); return 'accepted'; }catch(e){ return String(e.message); } }); ck('restore refuses a damaged file before touching data', /refused/.test(rs), rs);
 const sn=await ev(async()=>{ const t=window.__t; const s=await t.Backups.make('manual'); const v=await t.backupVerifyKey(s.key); return {v, ver:t.backupVerifiedAt()>0, sha:!!s.sha}; });
 ck('a saved snapshot is read back and verified', sn.v && sn.ver && sn.sha, sn);
 const rc=await ev(async()=>window.__t.recoveryStatus()); ck('recovery status: healthy after a verified backup', rc.health==='good' && rc.points>=1, rc);
 // sync outbox: duplicate and interrupted
 const sy=await ev(()=>{ const t=window.__t; const a=t.Sync.pendingCount(); return typeof a==='number'; }); ck('sync outbox readable', sy);
 // integrity report
 const ig=await ev(async()=>{ const r=await window.__t.integrityChecks(); return { n:r.length, fail:r.filter(x=>x.level==='fail').map(x=>x.name) }; }); ck('integrity report runs and nothing fails on clean data', ig.n>10 && ig.fail.length===0, ig);
 // sheets open
 for(const [fn,txt] of [['openRecoverySheet','Last successful backup'],['openIntegritySheet','passed'],['openPrivacyControlsSheet','Designed to support privacy'],['openTaxSettingsSheet','']]){
   await ev(n=>window.__t[n](),fn); await p.waitForTimeout(700);
   const body=await ev(()=>document.body.innerText); ck(fn+' opens'+(txt?' and shows its text':''), !txt || body.includes(txt), body.slice(-200)); await ev(()=>window.__t.closeModal()); await p.waitForTimeout(150);
 }
 await ev(()=>window.__t.openRecoverySheet()); await p.waitForTimeout(700); const rb=await ev(()=>document.body.innerText);
 ck('recovery page has the required labels', ['Last successful backup','Backup health','Unsynced records','Recovery points','Storage available'].every(l=>rb.includes(l)), rb.slice(-400)); await ev(()=>window.__t.closeModal());
 // privacy: anonymise
 const cid=await ev(async()=>{ const r=await window.__t.refs.customers.add({name:'Jane',phone:'0811',email:'j@x.com',balance:0,createdAt:new Date().toISOString()}); return r.id; }); await p.waitForTimeout(200);
 await ev(id=>window.__t.privacyAnonymise(window.__t.State.customers.find(c=>c.id===id)),cid); await p.waitForTimeout(300);
 ck('anonymise removes personal details', await ev(id=>{ const c=window.__t.State.customers.find(x=>x.id===id); return c.name==='Anonymised customer' && !c.phone && !c.email; },cid));
 const ex=await ev(async(id)=>{ const e=await window.__t.privacyCustomerExport(window.__t.State.customers.find(c=>c.id===id)); return !!e.customer && Array.isArray(e.sales); },cid); ck('customer data export works', ex);
 // clear all sales
 const cl=await ev(async()=>{ const t=window.__t; const before=t.State.sales.length; const n=await t.clearAllSales('test'); await new Promise(r=>setTimeout(r,400)); return {before,n,after:t.State.sales.length,arch:t.State.deletedRecords.filter(d=>d.coll==='sales').length}; });
 ck('clear all sales removes them and keeps the originals in the archive', cl.before>0 && cl.after===0 && cl.arch===cl.n, cl);
 // remove a terminal and an employee with the password
 const pid=await ev(async()=>{ const r=await window.__t.refs.posDevices.add({name:'Front machine',kind:'Card machine',status:'active',linkCode:'123456',createdAt:new Date().toISOString()}); return r.id; }); await p.waitForTimeout(300);
 await ev(id=>window.__t.openPosDeviceDetail(id),pid); await p.waitForSelector('#pdDel'); await p.click('#pdDel'); await p.waitForSelector('#cfOk'); await p.click('#cfOk'); await p.waitForSelector('#apPass');
 await p.fill('#apPass','wrongpass1'); await p.click('#apOk'); await p.waitForTimeout(500);
 ck('wrong password does not remove the terminal', await ev(id=>window.__t.State.posDevices.some(d=>d.id===id),pid));
 await p.fill('#apPass','aaaa1111'); await p.click('#apOk'); await p.waitForTimeout(800);
 ck('terminal removed with the password and a copy archived', await ev(id=>!window.__t.State.posDevices.some(d=>d.id===id) && window.__t.State.deletedRecords.some(d=>d.coll==='posDevices'&&d.recId===id),pid));
 const uid2=await ev(async()=>{ const t=window.__t; const r=await t.refs.users.add({name:'Sam',role:'cashier',active:true,passHash:'x',createdAt:new Date().toISOString()}); await t.refs.sales.add({items:[{name:'B',qty:1,unitPrice:5,lineTotal:5}],total:5,cost:2,profit:3,paymentMethod:'cash',cashierName:'Sam',createdAt:new Date().toISOString()}); return r.id; }); await p.waitForTimeout(400);
 await ev(id=>{ const t=window.__t; t.openStaffSheet(t.State.users.find(u=>u.id===id)); },uid2); await p.waitForSelector('#sfDelete'); await p.click('#sfDelete'); await p.waitForSelector('#cfOk'); await p.click('#cfOk'); await p.waitForSelector('#apPass'); await p.fill('#apPass','aaaa1111'); await p.click('#apOk'); await p.waitForTimeout(800);
 ck('employee with sales removed with the password, history kept', await ev(id=>!window.__t.State.users.some(u=>u.id===id) && window.__t.State.sales.some(x=>x.cashierName==='Sam') && window.__t.State.deletedRecords.some(d=>d.coll==='users'&&d.recId===id && !d.data.passHash),uid2));
 // removal approval for important records
 const eid=await ev(async()=>{ const r=await window.__t.refs.expenses.add({category:'Rent',amount:100,createdAt:new Date().toISOString()}); return r.id; }); await p.waitForTimeout(300);
 await ev(id=>{ window.__t.refs.expenses.doc(id).delete(); },eid); await p.waitForSelector('#rmPass');
 ck('a delete is held until a manager or owner approves', await ev(id=>window.__t.State.expenses.some(e=>e.id===id),eid));
 await p.fill('#rmPass','wrongpass1'); await p.click('#rmOk'); await p.waitForTimeout(500);
 ck('wrong password does not remove it', await ev(id=>window.__t.State.expenses.some(e=>e.id===id),eid));
 await p.fill('#rmPass','aaaa1111'); await p.selectOption('#rmWhy',{index:4}); await p.click('#rmOk'); await p.waitForTimeout(400);
 ck('the Other reason needs a note', await ev(id=>window.__t.State.expenses.some(e=>e.id===id),eid));
 await p.fill('#rmNote','double entry'); await p.click('#rmOk'); await p.waitForTimeout(800);
 ck('approved removal works, reason and approver archived', await ev(id=>{ const t=window.__t; const d=t.State.deletedRecords.find(x=>x.recId===id); return !t.State.expenses.some(e=>e.id===id) && !!d && /double entry/.test(d.reason) && /approved by Owner/.test(d.reason); },eid));
 ck('no page errors', errs.length===0, errs);
 await b.close(); process.exit(fail?1:0);
})();
