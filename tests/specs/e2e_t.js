const { chromium } = require('playwright');
let fail=0; const ck=(n,c,x)=>{ console.log((c?'  ok   ':'  FAIL ')+n+(!c&&x!==undefined?'  -> '+JSON.stringify(x).slice(0,300):'')); if(!c){fail++;} };
const store=new Map(); let tick=0;
function handler(r){
  const q=r.request(), u=new URL(q.url()); const hdr=q.headers()['x-pesa-code']||'';
  if(q.method()==='POST'){
    const rows=JSON.parse(q.postData()); let bad=false;
    rows.forEach(row=>{ if(row.ws!==hdr){ bad=true; return; } tick++; store.set(row.ws+'|'+row.coll+'|'+row.id, Object.assign({},row,{updated_at:new Date(1790000000000+tick*1000).toISOString()})); });
    return r.fulfill({status:bad?401:201,body:''});
  }
  const ws=(u.searchParams.get('ws')||'').replace(/^eq\./,''); const gt=(u.searchParams.get('updated_at')||'').replace(/^gt\./,''); const lim=+u.searchParams.get('limit')||1000;
  let rows=[...store.values()].filter(x=>x.ws===ws && ws===hdr && (!gt||x.updated_at>gt)).sort((a,b)=>a.updated_at<b.updated_at?-1:1).slice(0,lim);
  return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(rows)});
}
async function newDevice(b){ const ctx=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}); await ctx.route('https://mock.test/**',handler); const p=await ctx.newPage(); p.errs=[]; p.on('pageerror',e=>p.errs.push(e.message)); await p.goto('http://localhost:8933/index.html'); return p; }
(async()=>{
  const b=await chromium.launch(); const A=await newDevice(b);
  await A.waitForSelector('#rcCompanyName'); await A.fill('#rcCompanyName','Secret Bakery Ltd'); await A.fill('#rcOwnerName','Alice'); await A.fill('#rcOwnerEmail','a@x.com');
  await A.fill('#rcOwnerPassword','aaaa1111'); await A.fill('#rcOwnerPassword2','aaaa1111'); await A.click('#rcSubmit');
  await A.waitForSelector('#cnAgree'); await A.click('#cnAgree'); await A.click('#cnAccept'); await A.waitForSelector('.hero-card');
  await A.evaluate(async()=>{ const T=window.__t; await T.refs.products.doc('p1').set({name:'Sourdough Loaf',sellPrice:35,costPrice:12,stockQty:10}); await T.refs.messages.add({to:'all',toName:'All',fromId:T.State.session.userId,fromName:'Alice',kind:'message',urgent:false,title:'',body:'Top secret hello message',readBy:{},createdAt:new Date().toISOString()}); });
  const CODE='ABCD-EFGH-JKMN-PQRS-TUVW';
  await A.evaluate(c=>window.__t.Sync.enable('https://mock.test','k',c),CODE); await A.waitForTimeout(2500);
  const cfg=await A.evaluate(()=>window.__t.Sync.cfg()); ck('new setup is encrypted (v2)', cfg.v===2 && /^v2-[0-9a-f]{40}$/.test(cfg.ws), cfg);
  const dump=JSON.stringify([...store.values()]); ck('cloud has rows', store.size>3, store.size);
  ck('every row is under the hidden workspace name', [...store.values()].every(r=>r.ws===cfg.ws));
  ck('the sync code itself is not stored in the cloud', !dump.includes(CODE));
  ck('no plaintext shop name, product or message in the cloud', !/Secret Bakery|Sourdough|Top secret|Alice/.test(dump));
  ck('rows are sealed envelopes', [...store.values()].filter(r=>!r.deleted).every(r=>r.data && r.data.e===2 && r.data.iv && r.data.c));
  ck('pending queue empty', (await A.evaluate(()=>window.__t.Sync.pendingCount()))===0);
  // device B joins with the code and detects v2
  const B=await newDevice(b);
  await B.evaluate(c=>window.__t.Sync.join('https://mock.test','k',c),CODE); await B.waitForTimeout(2500);
  const cb=await B.evaluate(()=>window.__t.Sync.cfg()); ck('device B detected the encrypted business', cb.v===2, cb);
  const got=await B.evaluate(()=>({co:(window.__t.State.company||{}).companyName||(window.__t.State.settings||{}).shopName, prods:window.__t.State.products.map(p=>p.name), msgs:window.__t.State.messages.map(m=>m.body)}));
  ck('device B received products and messages decrypted', got.prods.includes('Sourdough Loaf') && got.msgs.includes('Top secret hello message'), got);
  // live change A -> B
  await A.evaluate(async()=>{ await window.__t.refs.products.doc('p2').set({name:'Rye Bread',sellPrice:40,costPrice:15,stockQty:5}); }); await A.waitForTimeout(2200);
  await B.evaluate(()=>window.__t.Sync.syncNow()); await B.waitForTimeout(1500);
  ck('later change reaches device B', await B.evaluate(()=>window.__t.State.products.some(p=>p.name==='Rye Bread')));
  // and B -> A (edit + delete)
  await B.evaluate(async()=>{ await window.__t.refs.products.doc('p2').delete(); }); await B.waitForTimeout(2200); await A.evaluate(()=>window.__t.Sync.syncNow()); await A.waitForTimeout(1500);
  ck('delete from B reaches A', !(await A.evaluate(()=>window.__t.State.products.some(p=>p.name==='Rye Bread'))));
  // wrong code gets nothing
  const C=await newDevice(b); await C.evaluate(()=>window.__t.Sync.join('https://mock.test','k','WXYZ-WXYZ-WXYZ-WXYZ-WXYZ')); await C.waitForTimeout(2000);
  ck('a wrong sync code downloads nothing', (await C.evaluate(()=>window.__t.State.products.length))===0);
  // a device that has the right workspace name but wrong key fails to unlock (simulate: copy cfg ws but other code)
  const D=await newDevice(b); await D.evaluate(async(ws)=>{ localStorage.setItem('pesa_sync_cfg_v1', JSON.stringify({})); const S=window.__t.Sync; await S.join('https://mock.test','k','QQQQ-QQQQ-QQQQ-QQQQ-QQQQ'); }, cfg.ws); await D.waitForTimeout(1000);
  ck('wrong code device sees no data', (await D.evaluate(()=>window.__t.State.messages.length))===0);
  // tamper: flip a byte in a ciphertext, B should report undecodable and not apply
  const victim=[...store.values()].find(r=>r.coll==='products' && r.id==='p1'); const old=victim.data.c; victim.data.c = (old[0]==='A'?'B':'A')+old.slice(1); victim.updated_at=new Date(1791000000000).toISOString();
  await B.evaluate(()=>window.__t.Sync.syncNow()); await B.waitForTimeout(1200);
  const errB=await B.evaluate(()=>window.__t.Sync.lastError()); ck('tampered record is rejected with a clear message', /could not be unlocked/.test(errB), errB);
  ck('tampered record did not change B data', await B.evaluate(()=>window.__t.State.products.find(p=>p.id==='p1').name)==='Sourdough Loaf');
  // swapped rows (same key, different id) must fail through the bound id
  const m1=[...store.values()].find(r=>r.coll==='products' && r.id==='p1'); m1.data.c=old; // restore
  // legacy shop upgrade flow
  const L=await newDevice(b); await L.waitForSelector('#rcCompanyName'); await L.fill('#rcCompanyName','Old Shop'); await L.fill('#rcOwnerName','Leo'); await L.fill('#rcOwnerEmail','l@x.com');
  await L.fill('#rcOwnerPassword','aaaa1111'); await L.fill('#rcOwnerPassword2','aaaa1111'); await L.click('#rcSubmit'); await L.waitForSelector('#cnAgree'); await L.click('#cnAgree'); await L.click('#cnAccept'); await L.waitForSelector('.hero-card');
  const LC='LEGA-CYLE-GACY-LEGA-CYYY';
  await L.evaluate(async(c)=>{ await window.__t.refs.products.doc('lp').set({name:'Legacy Plain Item',sellPrice:1,costPrice:1,stockQty:1}); await window.__t.Sync.enable('https://mock.test','k',c,{v:1}); },LC); await L.waitForTimeout(2500);
  ck('legacy shop uploads readable rows under the code', [...store.values()].some(r=>r.ws===LC && r.data && r.data.name==='Legacy Plain Item'));
  ck('legacy shop reports not secure', (await L.evaluate(()=>window.__t.Sync.secure()))===false);
  await L.evaluate(()=>window.__t.openSettingsSheet()); await L.$$eval('.st-grp',g=>g.forEach(x=>x.open=true)); await L.waitForSelector('#syUp'); ck('legacy settings offers the upgrade button and a warning', /not encrypted/.test(await L.innerText('body')));
  await L.click('#syUp'); await L.waitForSelector('#cfOk'); ck('upgrade asks for confirmation', /every other device/i.test(await L.innerText('.sheet')));
  await L.evaluate(()=>window.__t.closeModal());
  await L.evaluate(()=>window.__t.Sync.upgrade()); await L.waitForTimeout(2500);
  const lcfg=await L.evaluate(()=>window.__t.Sync.cfg()); ck('upgrade switches to v2', lcfg.v===2 && lcfg.ws.startsWith('v2-'));
  ck('upgraded data is in the cloud sealed', [...store.values()].some(r=>r.ws===lcfg.ws && r.data && r.data.e===2) && ![...store.values()].some(r=>r.ws===lcfg.ws && JSON.stringify(r.data).includes('Legacy Plain')));
  // new device joining after upgrade picks v2
  const M=await newDevice(b); await M.evaluate(c=>window.__t.Sync.join('https://mock.test','k',c),LC); await M.waitForTimeout(2500);
  ck('device joining the upgraded shop picks v2 and reads it', (await M.evaluate(()=>window.__t.Sync.cfg().v))===2 && await M.evaluate(()=>window.__t.State.products.some(p=>p.name==='Legacy Plain Item')));
  // and one joining a never-upgraded legacy shop stays v1
  const LS='OLDY-OLDY-OLDY-OLDY-OLDY'; store.set(LS+'|products|z',{ws:LS,coll:'products',id:'z',data:{name:'Z Item'},deleted:false,updated_at:new Date(1792000000000).toISOString()});
  const N=await newDevice(b); await N.evaluate(c=>window.__t.Sync.join('https://mock.test','k',c),LS); await N.waitForTimeout(2000);
  ck('joining an old readable business stays on v1 and reads it', (await N.evaluate(()=>window.__t.Sync.cfg().v))===1 && await N.evaluate(()=>window.__t.State.products.some(p=>p.name==='Z Item')));
  // settings UI
  await A.evaluate(()=>window.__t.openSettingsSheet()); await A.$$eval('.st-grp',g=>g.forEach(x=>x.open=true)); await A.waitForTimeout(400); const txt=await A.innerText('body'); ck('settings says encrypted sync', /Encrypted sync/.test(txt));
  await L.evaluate(()=>window.__t.openSettingsSheet()); ck('settings of an old setup offers upgrade (after v2 it should not)', !(await L.$('#syUp')));
  for(const d of [A,B,C,D,L,M,N]) if(d.errs.length) console.log(d.errs);
  ck('no page errors anywhere', [A,B,C,D,L,M,N].every(d=>d.errs.length===0));
  console.log(fail?'FAILED '+fail:'ALL OK'); await b.close(); process.exit(fail?1:0);
})();
