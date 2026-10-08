const {chromium}=require('playwright');
let fail=0; const ck=(n,c)=>{ console.log((c?'  ok   ':'  FAIL ')+n); if(!c) fail++; };
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript(()=>{ window.NAMPROMO_CONFIG={ url:'https://proj.supabase.co', anonKey:'anon-key' }; });
const calls=[];
const j=(o,s=200)=>({status:s,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
await ctx.route('https://proj.supabase.co/**', r=>{ const u=r.request().url(); calls.push({u, key:r.request().headers()['apikey'], body:r.request().postData()});
  if(r.request().method()==='OPTIONS') return r.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
  if(/public_shops/.test(u)) return r.fulfill(j([{id:'s1',name:'Real Hardware Windhoek',category:'Building and hardware',town:'Windhoek',address:'5 Industrial St',lat:-22.57,lng:17.08,verified:true,status:'verified'}]));
  if(/public_promotions/.test(u)) return r.fulfill(j([{id:'p1',shop_id:'s1',title:'Cement 50 kg',product_key:'cement',category:'Building and hardware',regular_price:150,sale_price:119,expires_at:new Date(Date.now()+4*864e5).toISOString(),shop_verified:true}]));
  if(/np-subscribe/.test(u)){ const b=JSON.parse(r.request().postData()); return r.fulfill(b.cellphone==='+264811234567'?j({ok:true,sent:true,via:'whatsapp'}):j({error:'invalid'},400)); }
  if(/np-verify/.test(u)){ const b=JSON.parse(r.request().postData()); return r.fulfill(b.code==='123456'?j({ok:true,channels:['whatsapp','sms']}):j({error:'wrong_code'},400)); }
  r.fulfill(j({},404)); });
await p.goto('http://localhost:8944/index.html'); await p.waitForSelector('.gcard');
await p.waitForFunction(()=>/Real Hardware|Cement 50 kg/.test(document.body.innerText),null,{timeout:5000}).catch(()=>{}); ck('server data replaces the sample data and the sample banner goes', await p.evaluate(()=>document.querySelectorAll('.gcard').length>=1 && /Real Hardware/.test(document.body.innerText) && !/Sample data/.test(document.body.innerText)));
ck('the app only sends its public key', calls.filter(c=>c.key).every(c=>c.key==='anon-key'));
await p.screenshot({path:'/tmp/claude-0/exp/np_live.png'});
await p.click('[data-tab=me]'); await p.fill('#mn','Anna Shikongo'); await p.fill('#me','a@example.com'); await p.fill('#mp','081 123 4567'); await p.check('#mok'); await p.click('#mesave');
await p.waitForSelector('#mecode');
const sub=JSON.parse(calls.find(c=>/np-subscribe/.test(c.u)).body);
ck('sign up sends the details and consent to the server', sub.cellphone==='+264811234567'&&sub.whatsapp&&sub.sms&&sub.consent===true&&sub.fullName==='Anna Shikongo');
ck('the person is not signed up until the code is confirmed', await p.evaluate(()=>window.__nampromo.S.me===null));
await p.fill('#mcode','000000'); await p.click('#mecode'); await p.waitForFunction(()=>/not right/.test(document.body.innerText));
await p.fill('#mcode','123456'); await p.click('#mecode'); await p.waitForSelector('[data-pref]');
ck('the right code signs them up', await p.evaluate(()=>window.__nampromo.S.me && window.__nampromo.S.me.phone==='+264811234567'));
ck('no page errors', errs.length===0); if(errs.length) console.log(errs);
await b.close(); console.log(fail?'FAILED '+fail:'ALL OK');})();
