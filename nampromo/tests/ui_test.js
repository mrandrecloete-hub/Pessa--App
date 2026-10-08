const {chromium}=require('/opt/node-tools/node_modules/playwright');
let fail=0; const ck=(n,c)=>{ console.log((c?'  ok   ':'  FAIL ')+n); if(!c) fail++; };
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:8944/index.html');await p.waitForSelector('.dcard');
await p.screenshot({path:'/tmp/claude-0/exp/np1.png'});
ck('deals show with sample data banner', await p.evaluate(()=>/Sample prices/.test(document.body.innerText) && document.querySelectorAll('.dcard').length>=3));
ck('every special has a real discount', await p.evaluate(()=>[...document.querySelectorAll('.dsave')].length>=3));
ck('home has search, categories and best specials', await p.evaluate(()=>!!document.getElementById('hq') && document.querySelectorAll('.cat').length>=7 && /Choose a category/.test(document.body.innerText) && /Best specials today/.test(document.body.innerText)));
await p.click('.dcard .heart'); ck('heart saves a deal', await p.evaluate(()=>window.__nampromo.S.saved.length===1));
await p.click('.dcard .dname'); await p.waitForSelector('#dsheet'); await p.screenshot({path:'/tmp/claude-0/exp/np8.png'});
ck('tapping a deal opens its details with Navigate', await p.evaluate(()=>!!document.querySelector('#dsheet a[href*="maps/dir"]')));
await p.click('[data-closesheet]'); ck('details close', await p.evaluate(()=>!document.getElementById('dsheet')));
await p.click('[data-cat2="Building and hardware"]'); ck('category icon filters the deals', await p.evaluate(()=>window.__nampromo.S.cat==='Building and hardware' && /All specials/.test(document.body.innerText)));
await p.click('[data-tab=saved]'); ck('saved page lists the saved deal', await p.evaluate(()=>document.querySelectorAll('.dcard').length===1));
await p.click('[data-tab=home]');
// compare
await p.evaluate(()=>window.__nampromo.go('compare')); await p.selectOption('#cq','maize'); await p.screenshot({path:'/tmp/claude-0/exp/np2.png'});
const cmp = await p.evaluate(()=>[...document.querySelectorAll('.price')].map(e=>parseFloat(e.textContent.replace(/[^0-9.]/g,''))));
console.log(cmp); ck('compare lists shops with the cheapest marked', cmp.length>=3 && await p.evaluate(()=>/Cheapest/.test(document.body.innerText)));
// plan
await p.click('[data-tab=plan]');
for(const id of ['maize','oil','milk','tp']){ await p.selectOption('#pl',id); await p.click('#pladd'); }
await p.screenshot({path:'/tmp/claude-0/exp/np3.png',fullPage:true});
const pl = await p.evaluate(()=>{const r=window.__nampromo.plan();return {n:r.items.length,kind:r.best.kind,total:r.best.total,trip:r.best.trip,others:r.others.map(o=>[o.kind,o.trip])};});
console.log(JSON.stringify(pl));
ck('plan picks the option with the lowest trip cost', pl.others.every(o=>o[1]>=pl.trip-0.001));
ck('plan has a navigate link', await p.evaluate(()=>!!document.querySelector('a[href*="google.com/maps/dir"]')));
// alerts
await p.evaluate(()=>window.__nampromo.go('compare')); await p.selectOption('#cq','maize'); await p.click('[data-watch=maize]'); await p.waitForSelector('[data-wt]');
await p.screenshot({path:'/tmp/claude-0/exp/np4.png'});
await p.fill('[data-wt="0"]','9999'); await p.dispatchEvent('[data-wt="0"]','change'); 
ck('alert reached when target is high', await p.evaluate(()=>/Reached/.test(document.body.innerText)));
// shops directory by category
await p.click('[data-tab=shops]'); await p.screenshot({path:'/tmp/claude-0/exp/np6.png'});
const cats = await p.evaluate(()=>[...document.querySelectorAll('[data-dcat]')].map(b=>b.textContent));
ck('shops listed under categories from food to building', cats.some(c=>/Food and groceries/.test(c)) && cats.some(c=>/Clothing and shoes/.test(c)) && cats.some(c=>/Building and hardware/.test(c)));
await p.click('[data-dcat="Building and hardware"]');
ck('building category lists a hardware shop', await p.evaluate(()=>/Example Hardware/.test(document.body.innerText) && !/Example Fashion House/.test(document.body.innerText)));
await p.click('[data-dshop]'); ck('shop page shows its prices', await p.evaluate(()=>/Cement/.test(document.body.innerText)));
// sign up
await p.click('[data-tab=me]');
await p.click('#mesave'); ck('empty sign up refused', await p.evaluate(()=>/first name and surname/.test(document.body.innerText)));
await p.fill('#mn','Anna Shikongo'); await p.fill('#me','anna@example.com'); await p.fill('#mp','12345');
await p.click('#mesave'); ck('bad cellphone refused', await p.evaluate(()=>/Namibian cellphone/.test(document.body.innerText)));
await p.fill('#mp','081 123 4567'); await p.click('#mesave'); ck('consent required', await p.evaluate(()=>/Tick the box/.test(document.body.innerText)));
await p.check('#mok'); await p.click('#mesave'); await p.waitForSelector('[data-pref]');
ck('signed up with phone saved in +264 form', await p.evaluate(()=>window.__nampromo.S.me.phone==='+264811234567' && window.__nampromo.S.me.wa && window.__nampromo.S.me.sms));
await p.screenshot({path:'/tmp/claude-0/exp/np7.png'});
await p.click('details summary'); await p.click('#medigest'); ck('digest preview queued for WhatsApp and SMS and says nothing is sent', await p.evaluate(()=>window.__nampromo.S.outbox.length===2 && /Nothing is sent yet/.test(document.body.innerText)));
// alert preview
await p.evaluate(()=>window.__nampromo.go('compare')); await p.selectOption('#cq','sugar'); await p.click('[data-watch=sugar]'); await p.waitForSelector('[data-wt]');
const before = await p.evaluate(()=>window.__nampromo.S.outbox.length);
await p.fill('[data-wt="1"]','9999'); 
// shop owner
await p.click('[data-tab=me]'); await p.screenshot({path:'/tmp/claude-0/exp/dbg.png'}); await p.click('[data-tab=shopreg]');
await p.click('#opsave'); ck('shop form refuses empty', await p.evaluate(()=>/business name/.test(document.body.innerText)));
await p.fill('#on','Oshana Building Supplies'); await p.selectOption('#oc','Building and hardware'); await p.fill('#oa','12 Main Road'); await p.fill('#op','0851234567');
await p.click('#opsave'); await p.waitForSelector('#fadd');
ck('owner shop registered as not yet checked', await p.evaluate(()=>window.__nampromo.S.ops.length===1 && !!window.__nampromo.SHOPS.find(s=>s.custom)));
await p.fill('#ft','Roof paint 20 L'); await p.selectOption('#fc','Building and hardware'); await p.fill('#fr','100'); await p.fill('#fn','120'); await p.click('#fadd');
ck('bad special refused', await p.evaluate(()=>/lower than the normal/.test(document.body.innerText)));
await p.fill('#fn','70'); await p.click('#fadd'); await p.waitForTimeout(200);
ck('posted special appears, labelled as not checked', await p.evaluate(()=>/Roof paint/.test(document.body.innerText) && /not checked/i.test(document.body.innerText)));
await p.screenshot({path:'/tmp/claude-0/exp/np5.png'});
await p.click('[data-tab=shops]'); await p.click('[data-dcat="Building and hardware"]');
ck('the owner shop is listed under its category', await p.evaluate(()=>/Oshana Building Supplies/.test(document.body.innerText)));
ck('no page errors', errs.length===0); if(errs.length) console.log(errs);
await b.close(); console.log(fail?'FAILED '+fail:'ALL OK');})();
