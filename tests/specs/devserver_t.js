// The Developer panel signing in against the Pesa platform server (faked here with a real signed token)
const { chromium } = require('playwright');
let fail=0; const ck=(n,c)=>{ console.log((c?'  ok   ':'  FAIL ')+n); if(!c){fail++;} };
(async()=>{
 const { generateKeyPairSync } = require('crypto');
 const dev = await import('../../pesa-server/supabase/functions/_shared/dev.mjs');
 const kp = generateKeyPairSync('ec',{namedCurve:'P-256'}), priv = kp.privateKey.export({format:'jwk'}), pub = kp.publicKey.export({format:'jwk'});
 const other = generateKeyPairSync('ec',{namedCurve:'P-256'}).privateKey.export({format:'jwk'});
 const b = await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}); await ctx.addInitScript(()=>{ window.__forceSimple=true; });
 const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 const calls=[]; let helpers=[{ username:'helper@example.com', name:'Helper', role:'helper', active:true }]; let mode='good';
 const j=(o,s=200)=>({status:s,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
 await ctx.route('https://dev.example/pesa-dev', async r=>{
   if(r.request().method()==='OPTIONS') return r.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
   const body=JSON.parse(r.request().postData()); calls.push(body); const now=Math.floor(Date.now()/1000);
   if(body.action==='login'){
     if(body.password==='locked-pass') return r.fulfill(j({error:'locked',minutes:4},429));
     if(body.password!=='right-password-1') return r.fulfill(j({error:'wrong'},401));
     const key = mode==='forged' ? other : priv;
     return r.fulfill(j({ok:true,role:body.username==='boss@example.com'?'master':'helper',token:await dev.signToken(key,{sub:body.username,role:body.username==='boss@example.com'?'master':'helper',exp:now+3600,iat:now,jti:'x'})}));
   }
   if(body.action==='list') return r.fulfill(j({ok:true,users:helpers}));
   if(body.action==='add'){ helpers.push({username:body.username,name:body.name,role:'helper',active:true}); return r.fulfill(j({ok:true})); }
   if(body.action==='remove'){ helpers=helpers.filter(h=>h.username!==body.username); return r.fulfill(j({ok:true})); }
   r.fulfill(j({},400)); });
 await require('./biz_boot.js')(p,{demo:true});
 await p.evaluate((o)=>window.__t.setDev(o),{server:'https://dev.example/pesa-dev',pub});
 await p.evaluate(()=>{ window.__t.setTab('dashboard'); window.__t.render(); }); await p.waitForTimeout(300);
 const open=async()=>{ await p.evaluate(()=>window.__t.openDevPanel()); await p.waitForSelector('#dvGo'); };
 const login=async(u,pw)=>{ await p.fill('#dvU',u); await p.fill('#dvP',pw); await p.click('#dvGo'); await p.waitForFunction(()=>!document.getElementById('dvGo')||!document.getElementById('dvGo').disabled,null,{timeout:8000}).catch(()=>{}); await p.waitForTimeout(400); };
 await open(); await login('boss@example.com','wrong-pass-123');
 ck('a wrong password is refused by the server', await p.evaluate(()=>!window.__t.devUnlocked()) && await p.evaluate(()=>/Wrong username or password/.test(document.getElementById('dvE').textContent)));
 await login('boss@example.com','locked-pass'); ck('the server lock is shown with the minutes', await p.evaluate(()=>/Wait 4 minutes/.test(document.getElementById('dvE').textContent)));
 mode='forged'; await login('boss@example.com','right-password-1');
 ck('an answer signed with the wrong key is not trusted', await p.evaluate(()=>!window.__t.devUnlocked()));
 mode='good'; await login('boss@example.com','right-password-1');
 ck('the signed answer unlocks the full app', await p.evaluate(()=>window.__t.devUnlocked()));
 ck('no password was kept in the page or storage', await p.evaluate(()=>!document.documentElement.innerHTML.includes('right-password-1') && !JSON.stringify(localStorage).includes('right-password-1') && !JSON.stringify(sessionStorage).includes('right-password-1')));
 await p.evaluate(()=>window.__t.openDevPanel()); await p.waitForSelector('#dvAdd'); await p.waitForFunction(()=>/helper@example.com/.test(document.getElementById('dvList').innerText));
 ck('the master sees the helpers from the server', true);
 await p.fill('#dvN','New Person'); await p.fill('#dvNU','new@example.com'); await p.fill('#dvNP','short'); await p.click('#dvAdd');
 ck('a short helper password is refused before it is sent', await p.evaluate(()=>/at least 10/.test(document.getElementById('dvNE').textContent)) && !calls.some(c=>c.action==='add'));
 await p.fill('#dvNP','new-person-pass-1'); await p.click('#dvAdd'); await p.waitForFunction(()=>/new@example.com/.test(document.getElementById('dvList')&&document.getElementById('dvList').innerText||''),null,{timeout:8000});
 ck('adding a helper goes to the server with the signed token', calls.some(c=>c.action==='add'&&c.username==='new@example.com'&&/^PDEV1\./.test(c.token)));
 await p.click('[data-dvdel="helper@example.com"]'); await p.waitForFunction(()=>!/helper@example.com/.test(document.getElementById('dvList').innerText));
 ck('removing a helper goes to the server', calls.some(c=>c.action==='remove'&&c.username==='helper@example.com'));
 await p.click('#dvLock'); await p.waitForTimeout(300);
 ck('Lock clears the token', await p.evaluate(()=>!window.__t.devUnlocked() && !sessionStorage.getItem('pesa_dev_tok')));
 await open(); await login('helper@example.com','right-password-1');
 await p.evaluate(()=>window.__t.openDevPanel()); await p.waitForSelector('#dvLock');
 ck('a helper unlocks the app but cannot manage people', await p.evaluate(()=>window.__t.devUnlocked() && !document.getElementById('dvAdd')));
 ck('no page errors', errs.length===0); if(errs.length) console.log(errs.slice(0,3));
 await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
