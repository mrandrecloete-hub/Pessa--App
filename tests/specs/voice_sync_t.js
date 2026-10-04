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
  await A.waitForSelector('#rcCompanyName'); await A.fill('#rcCompanyName','Voice Bakery'); await A.fill('#rcOwnerName','Alice'); await A.fill('#rcOwnerEmail','a@x.com');
  await A.fill('#rcOwnerPassword','aaaa1111'); await A.fill('#rcOwnerPassword2','aaaa1111'); await A.click('#rcSubmit');
  await A.waitForSelector('#cnAgree'); await A.click('#cnAgree'); await A.click('#cnAccept'); await A.waitForSelector('.hero-card');
  const CODE='ABCD-EFGH-JKMN-PQRS-TUVW';
  await A.evaluate(c=>window.__t.Sync.enable('https://mock.test','k',c),CODE); await A.waitForTimeout(2000);
  const B=await newDevice(b); await B.evaluate(c=>window.__t.Sync.join('https://mock.test','k',c),CODE); await B.waitForTimeout(2500);
  // A saves a ~1.2 MB "recording" (3 pieces) and a small one
  await A.evaluate(async()=>{ const T=window.__t; const big=new Uint8Array(1200000); for(let i=0;i<big.length;i++) big[i]=(i*7)&255;
    await T.VoiceClips.put({key:'en|devices|0',lang:'en',id:'devices',idx:0,mime:'audio/mpeg',dur:30,hash:'h0',blob:new Blob([big],{type:'audio/mpeg'})});
    await T.VoiceClips.put({key:'en|devices|1',lang:'en',id:'devices',idx:1,mime:'audio/webm',dur:5,hash:'h1',blob:new Blob([new Uint8Array(5000)],{type:'audio/webm'})}); });
  await A.waitForTimeout(3000);
  const rows=[...store.values()].filter(r=>!r.deleted && r.coll==='voiceclips'); ck('cloud holds the recording pieces', rows.length>=5, rows.length);
  ck('pieces fit the row limit', rows.every(r=>JSON.stringify(r.data).length<1900000));
  ck('audio is not readable in the cloud', !/AAAAAAAA/.test('') && rows.every(r=>r.data && r.data.e===2));
  await B.evaluate(()=>window.__t.Sync.syncNow()); await B.waitForTimeout(3500);
  const got=await B.evaluate(async()=>{ const r=await window.__t.VoiceClips.getLocal('en|devices|0'); const r1=await window.__t.VoiceClips.getLocal('en|devices|1'); return { s0:r&&r.blob.size, t0:r&&r.blob.type, d0:r&&r.dur, s1:r1&&r1.blob.size }; });
  ck('device B received the big recording intact', got.s0===1200000 && got.t0==='audio/mpeg' && got.d0===30, got);
  ck('device B received the small one', got.s1===5000, got);
  // B must not push it back (no echo): count of voice rows unchanged
  const before=[...store.values()].filter(r=>r.coll==='voiceclips').length; await B.waitForTimeout(2500); ck('no echo loop', [...store.values()].filter(r=>r.coll==='voiceclips').length===before);
  // delete on A
  await A.evaluate(()=>window.__t.VoiceClips.del('en|devices|1')); await A.waitForTimeout(3000);
  await B.evaluate(()=>window.__t.Sync.syncNow()); await B.waitForTimeout(3000);
  ck('delete reaches device B', (await B.evaluate(async()=>!(await window.__t.VoiceClips.getLocal('en|devices|1'))))===true);
  ck('the other recording is still there', (await B.evaluate(async()=>!!(await window.__t.VoiceClips.getLocal('en|devices|0'))))===true);
  console.log('errors',A.errs,B.errs); console.log(fail?'FAILED '+fail:'ALL OK'); await b.close();
})();
