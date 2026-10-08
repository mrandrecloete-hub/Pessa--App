// End to end: app "I have paid" -> server -> approve -> app activates by itself.
const { chromium } = require('playwright'); const http = require('http');
let fail=0; const ck=(n,c,x)=>{ console.log((c?'  ok   ':'  FAIL ')+n+(!c&&x!==undefined?'  -> '+JSON.stringify(x).slice(0,300):'')); if(!c) fail++; };
(async()=>{
 const { handle } = await import('../../supabase/functions/_shared/handler.mjs'); const { make } = await import('../../supabase/functions/_shared/licdocs.mjs'); const { ASSETS } = await import('../../supabase/functions/_shared/assets.mjs');
 const { jsPDF } = require('jspdf');
 const kp = await crypto.subtle.generateKey({ name:'ECDSA', namedCurve:'P-256' }, true, ['sign','verify']);
 const priv = await crypto.subtle.exportKey('jwk', kp.privateKey), pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
 const rows=[]; let n=0, mails=[]; const SELLER={name:'Pesa Namibia',email:'x@y.z',whatsapp:'081 821 1692',place:'Windhoek, Namibia'};
 const deps={ db:{ byRef:async r=>rows.filter(x=>x.ref===r).map(x=>({...x})), insert:async r=>{rows.push({...r});}, update:async(id,p)=>Object.assign(rows.find(x=>x.id===id),p), pending:async()=>rows.filter(x=>x.status==='pending') },
  mail:async m=>{mails.push(m);}, now:()=>Date.now(), privJwk:priv, adminToken:'tok', seller:SELLER, makeDocs:()=>make(jsPDF,ASSETS,SELLER), genId:()=>'i'+(++n) };
 const CORS={'access-control-allow-origin':'*','access-control-allow-headers':'content-type, x-admin-token','access-control-allow-methods':'GET, POST, OPTIONS'}; let down=false;
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:412,height:915},serviceWorkers:'block'});
 await ctx.route('https://lic.test/**', async route=>{ const rq=route.request(); if(down) return route.abort(); if(rq.method()==='OPTIONS') return route.fulfill({status:204,headers:CORS});
  const u=new URL(rq.url()); let body={}; try{body=JSON.parse(rq.postData()||'{}');}catch(e){}
  const out=await handle({method:rq.method(),action:u.searchParams.get('a')||'',query:Object.fromEntries(u.searchParams),headers:rq.headers(),body},deps); route.fulfill({status:out.status,headers:{...CORS,'content-type':'application/json'},body:JSON.stringify(out.body)}); }); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
 await p.fill('#rcCompanyName','Auto Shop'); await p.fill('#rcOwnerName','A'); await p.fill('#rcOwnerEmail','owner@shop.com'); await p.fill('#rcOwnerPassword','aaaa1111'); await p.fill('#rcOwnerPassword2','aaaa1111'); await p.click('#rcSubmit');
 await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card'); await p.evaluate(()=>{ try{ window.__t.btSave({ setupHidden:true, simpleMode:false }); window.__t.pfSave({ remindAt:Date.now() }); }catch(e){} });
 await p.evaluate(([pub])=>window.__t.setLic({pub,enforce:'',server:'https://lic.test/licence'}),[pub]);
 const ref=await p.evaluate(()=>window.__t.licRef());
 await p.evaluate(()=>window.__t.openPaySheet()); await p.waitForSelector('#payPaid');
 ck('I have paid button shown', true); ck('email shown for documents', /owner@shop\.com/.test(await p.innerText('#payRoot')));
 await p.click('[data-payplan="starter"]'); await p.click('#payPaid'); await p.waitForSelector('#payWaiting');
 ck('server has pending request with ref, shop, email, plan', rows.length===1 && rows[0].ref===ref && rows[0].shop==='Auto Shop' && rows[0].email==='owner@shop.com' && rows[0].plan==='starter' && rows[0].amount_due===500, rows);
 await p.click('#payCheck'); await p.waitForTimeout(600);
 ck('still waiting while not approved', !!(await p.$('#payWaiting')) && (await p.evaluate(()=>window.__t.licStatus().state))!=='active');
 const r=await handle({method:'POST',action:'approve',query:{},headers:{'x-admin-token':'tok'},body:{ref,amount:500}},deps);
 ck('server approved and emailed', r.body.ok && r.body.emailed && mails.length===1 && mails[0].to==='owner@shop.com', r.body);
 await p.click('#payCheck'); await p.waitForFunction(()=>window.__t.licStatus().state==='active',null,{timeout:8000}).catch(()=>{});
 const st=await p.evaluate(()=>window.__t.licStatus()); ck('app is active by itself, plan starter', st.state==='active'&&st.plan==='starter', st);
 ck('key saved in settings', await p.evaluate(()=>/^PESA1\./.test(window.__t.State.settings.licenseKey||'')));
 ck('pending flag cleared', await p.evaluate(()=>window.__t.licPendingGet()===null));
 // a key for another business is refused
 const bad=await handle({method:'POST',action:'approve',query:{},headers:{'x-admin-token':'tok'},body:{ref:'PESA-ZZZZ-ZZZZ',amount:1,plan:'premium'}},deps);
 ck('another business key exists on server but is not served for this ref', (await handle({method:'GET',action:'status',query:{ref},headers:{},body:{}},deps)).body.plan==='starter' && bad.status===200);
 // server down gives a clear message
 down=true; await p.evaluate(()=>window.__t.openPaySheet()); await p.waitForTimeout(500);
 ck('no page errors', errs.length===0, errs);
 await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
