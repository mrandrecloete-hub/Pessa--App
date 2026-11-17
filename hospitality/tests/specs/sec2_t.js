const { chromium } = require('playwright'); const boot=require('./biz_boot.js');
let fail=0; const ck=(n,c,x)=>{ console.log((c?'  ok   ':'  FAIL ')+n+(!c&&x!==undefined?'  -> '+JSON.stringify(x).slice(0,300):'')); if(!c) fail++; };
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:412,height:900},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[];
 p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{ if(m.type()==='error' && !/TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
 await boot(p);
 const ev=(f,a)=>p.evaluate(f,a);
 // audit chain
 await ev(()=>{ const t=window.__t; t.logAudit('other','test',null,'one'); t.logAudit('other','test',null,'two'); t.logAudit('other','test',null,'three'); }); await p.waitForTimeout(300);
 const v1=await ev(()=>window.__t.auditVerify()); ck('audit chain verifies', v1.ok && v1.checked>=3, v1);
 const lastE=await ev(()=>{ const t=window.__t; const e=t.State.auditLog.filter(a=>a.summary==='two')[0]; return {id:e.id,seq:e.seq,hasHash:!!e.hash,dev:e.dev}; });
 ck('entries carry device, counter and hash', lastE.hasHash && lastE.seq>0 && /^d-/.test(lastE.dev), lastE);
 await ev(async(id)=>{ const t=window.__t; await t.refs.auditLog.doc(id).update({summary:'changed'}); await t.refs.auditLog.doc(id).delete(); },lastE.id); await p.waitForTimeout(200);
 ck('audit entries cannot be edited or deleted in the app', await ev((id)=>{ const e=window.__t.State.auditLog.find(a=>a.id===id); return !!e && e.summary==='two'; },lastE.id));
 await ev((id)=>{ const t=window.__t; const raw=t.Store.raw.read(); raw.auditLog[id].summary='forged'; t.Store.raw.write(raw,[['auditLog',id]]); t.Store.raw.notify('auditLog'); },lastE.id); await p.waitForTimeout(200);
 const v2=await ev(()=>window.__t.auditVerify()); ck('tampering outside the app is detected', !v2.ok && /changed/.test(v2.problems.join(' ')), v2);
 await ev((id)=>{ const t=window.__t; const raw=t.Store.raw.read(); raw.auditLog[id].summary='two'; t.Store.raw.write(raw,[['auditLog',id]]); t.Store.raw.notify('auditLog'); },lastE.id);
 const v3=await ev(()=>{ const t=window.__t; const raw=t.Store.raw.read(); const e=t.State.auditLog.filter(a=>a.summary==='one')[0]; delete raw.auditLog[e.id]; t.Store.raw.write(raw,[['auditLog',e.id]]); t.Store.raw.notify('auditLog'); return 1; }); await p.waitForTimeout(200);
 const v4=await ev(()=>window.__t.auditVerify()); ck('a removed entry is detected', !v4.ok && /missing|follow/.test(v4.problems.join(' ')), v4);
 // sales cannot be deleted or rewritten
 const sid=await ev(async()=>{ const t=window.__t; const r=await t.refs.sales.add({items:[{name:'Bread',qty:1,unitPrice:10,lineTotal:10}],total:10,cost:5,profit:5,paymentMethod:'cash',createdAt:new Date().toISOString()}); return r.id; }); await p.waitForTimeout(200);
 await ev(async(id)=>{ const t=window.__t; await t.refs.sales.doc(id).delete(); await t.refs.sales.doc(id).update({total:1}); await t.refs.sales.doc(id).set({total:2}); },sid); await p.waitForTimeout(200);
 ck('a completed sale cannot be deleted or changed', await ev((id)=>{ const s=window.__t.State.sales.find(x=>x.id===id); return !!s && s.total===10; },sid));
 // role from the staff record, not the session
 const rl=await ev(async()=>{ const t=window.__t; const ref=t.refs.users.doc(); await ref.set({name:'Chris',role:'cashier',active:true,passHash:'x',createdAt:new Date().toISOString()}); return ref.id; }); await p.waitForTimeout(200);
 const exp=await ev(async()=>{ const t=window.__t; const r=await t.refs.expenses.add({category:'Rent',amount:500,createdAt:new Date().toISOString(),paidFrom:'Cash'}); return r.id; }); await p.waitForTimeout(200);
 const ownerId=await ev(()=>window.__t.State.session.userId);
 await ev((id)=>{ const t=window.__t; t.State.session={userId:id,name:'Chris',role:'owner'}; },rl); // forged role in the session
 ck('forged session role does not give owner rights', await ev(()=>!window.__t.isOwner() && !window.__t.isManagerOrOwner()));
 await ev(async(id)=>{ await window.__t.refs.expenses.doc(id).delete(); },exp); await p.waitForTimeout(200);
 ck('cashier cannot delete an expense', await ev((id)=>window.__t.State.expenses.some(x=>x.id===id),exp));
 await ev(async(id)=>{ await window.__t.refs.users.doc(id).update({role:'manager'}); },ownerId); // cashier tries to change role of owner
 ck('cashier cannot change an owner account', await ev((id)=>window.__t.State.users.find(x=>x.id===id).role==='owner',ownerId));
 await ev(async(id)=>{ await window.__t.refs.users.doc(id).update({passHash:'evil'}); },ownerId);
 ck('cashier cannot reset the owner password', await ev((id)=>window.__t.State.users.find(x=>x.id===id).passHash!=='evil',ownerId));
 // back to owner, delete expense keeps original
 await ev((id)=>{ const t=window.__t; t.State.session={userId:id,name:'Owner',role:'owner'}; },ownerId);
 await ev((id)=>{ window.__t.refs.expenses.doc(id).delete(); },exp); await p.waitForSelector('#rmPass'); await p.fill('#rmPass','aaaa1111'); await p.click('#rmOk'); await p.waitForTimeout(500);
 ck('owner delete keeps the original with who, when, why and a hash', await ev((id)=>{ const t=window.__t; const d=t.State.deletedRecords.find(x=>x.recId===id); return !t.State.expenses.some(x=>x.id===id) && !!d && d.data.amount===500 && /Entered by mistake/.test(d.reason) && /^[0-9a-f]{64}$/.test(d.hash) && d.by==='Owner'; },exp));
 await ev(async()=>{ const t=window.__t; const d=t.State.deletedRecords[0]; await t.refs.deletedRecords.doc(d.id).delete(); }); await p.waitForTimeout(150);
 ck('archived originals cannot be removed', await ev(()=>window.__t.State.deletedRecords.length===1));
 // sessions
 const now=Date.now();
 const se=await ev((n)=>{ const t=window.__t; return { fresh:t.sessionFresh({userId:'u',at:n-1000,last:n-1000}), old:t.sessionFresh({userId:'u',at:n-8*86400000,last:n-1000}), idle:t.sessionFresh({userId:'u',at:n-3600000,last:n-13*3600000}), none:t.sessionFresh(null) }; },now);
 ck('sessions expire (7 days or long inactivity)', se.fresh && !se.old && !se.idle && !se.none, se);
 ck('automatic sign out is on by default', await ev(()=>window.__t.idleMinutes()===30));
 // uploads
 const up=await ev(async()=>{ const t=window.__t; const png=new Uint8Array([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A,0,0,0,0,0,0,0,0,0,0]); const mk=(b,n)=>new File([b],n); 
   const r={}; r.png=(await t.secCheckImage(mk(png,'a.png'))).ok; r.fake=(await t.secCheckImage(mk(new TextEncoder().encode('<svg onload=alert(1)></svg>  '),'a.png'))).ok; r.svg=(await t.secCheckImage(mk(new TextEncoder().encode('<svg xmlns="x"><script>1</script></svg>'),'a.svg'))).ok; r.exe=t.secCheckTextFile(mk(new Uint8Array([77,90]),'a.exe')).ok; r.csv=t.secCheckTextFile(mk(new Uint8Array([65,44]),'a.csv')).ok; r.big=(await t.secCheckImage({size:9*1024*1024,slice:()=>null})).ok; return r; });
 ck('real pictures pass; fake, SVG, program files and oversize files are refused', up.png && !up.fake && !up.svg && !up.exe && up.csv && !up.big, up);
 const sf=await ev(()=>{ const t=window.__t; return { ok:t.safeImg('data:image/png;base64,AAAA'), bad:t.safeImg('data:image/png;base64,AAAA" onerror="alert(1)'), js:t.safeImg('javascript:alert(1)'), svg:t.safeImg('data:image/svg+xml;base64,AAAA'), cell:t.secCell('=HYPERLINK("x")'), num:t.secCell('-12.5'), name:t.secCell('Bread') }; });
 ck('image sources are validated and spreadsheet formulas are neutralised', sf.ok && !sf.bad && !sf.js && !sf.svg && sf.cell.charAt(0)==="'" && sf.num==='-12.5' && sf.name==='Bread', sf);
 const kp=await ev(()=>{ const t=window.__t; const b=s=>btoa(s).replace(/=/g,''); const svc=b('{"alg":"HS256"}')+'.'+b('{"role":"service_role"}')+'.sig', anon=b('{"alg":"HS256"}')+'.'+b('{"role":"anon"}')+'.sig'; return { svc:!!t.secKeyProblem(svc), anon:!!t.secKeyProblem(anon) }; });
 ck('a private service key is refused in the sync form', kp.svc && !kp.anon, kp);
 // lockout counts for the new keys
 const lk=await ev(()=>{ const t=window.__t; for(let i=0;i<3;i++) t.authFailed('delbiz:x','delete business'); return t.authLockText('delbiz:x'); });
 ck('repeated wrong owner passwords lock the delete business prompt', /Too many/.test(lk), lk);
 ck('no page errors', errs.length===0, errs);
 await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
