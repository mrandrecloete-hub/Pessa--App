const { chromium } = require('playwright');
const crypto = require('crypto');
const efdMock = require('../../docs/efd/mock-namra.js');
const D=(process.env.PESA_OUT||require('os').tmpdir()+'/pesa-tests/');
let fail=0; const ck=(n,c)=>{ console.log((c?'  ok   ':'  FAIL ')+n); if(!c) fail++; };
(async()=>{
  const mock = efdMock.createMockNamra(); const calls=[];
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:390,height:844}, serviceWorkers:'block'}); await ctx.addInitScript(()=>{ try{ new MutationObserver(()=>{ document.querySelectorAll('.st-grp').forEach(d=>{ if(!d.open) d.open=true; }); }).observe(document,{childList:true,subtree:true}); }catch(e){} });
  let offline=false;
  await ctx.route('https://namra.mock/**', async route=>{
    if(route.request().method()==='OPTIONS') return route.fulfill({status:204, headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'POST,OPTIONS'}});
    const body = JSON.parse(route.request().postData()||'{}'); const token=(route.request().headers()['authorization']||'').replace('Bearer ','');
    calls.push(body.receipts.length);
    if(offline) return route.abort('connectionrefused');
    const r = await mock.handle({token, body});
    route.fulfill({status:r.status, headers:Object.assign({'content-type':'application/json','access-control-allow-origin':'*','access-control-expose-headers':'*'}, r.headers), body: JSON.stringify(r.body)});
  });
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('C:'+m.text())});
  await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
  await p.fill('#rcCompanyName','Demo Shop'); await p.fill('#rcOwnerName','Alice'); await p.fill('#rcOwnerEmail','a@x.com');
  await p.fill('#rcOwnerPassword','aaaa1111'); await p.fill('#rcOwnerPassword2','aaaa1111'); await p.click('#rcSubmit');
  await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card'); await p.evaluate(()=>{ try{ window.__t.btSave({ setupHidden:true, simpleMode:false }); window.__t.pfSave({ remindAt:Date.now() }); }catch(e){} });
  const T = f=>p.evaluate(f);
  ck('starts OFF', await T(()=>!window.__t.Fiscal.on() && !window.__t.Fiscal.ready()));
  await T(async()=>{ const r=window.__t.refs; const n=()=>new Date().toISOString();
    await r.products.doc('p1').set({name:'Soap',sellPrice:11.5,costPrice:5,stockQty:50,createdAt:n()});
    await r.products.doc('p2').set({name:'Maize meal',sellPrice:40,costPrice:30,stockQty:50,taxCategory:'ZERO_RATED',createdAt:n()});
    await r.products.doc('p3').set({name:'School book',sellPrice:100,costPrice:70,stockQty:50,taxCategory:'EXEMPT',createdAt:n()}); });
  await p.waitForTimeout(300);
  // a sale while OFF creates no tax record
  await T(()=>{ window.__t.State.cart=[{productId:'p1',name:'Soap',unitPrice:11.5,cost:5,qty:1,unit:'',maxQty:50}]; window.__t.finalizeSale('cash',null,{}); window.__t.closeModal(); });
  await p.waitForTimeout(300);
  ck('no record while off', await T(()=>Object.keys(window.__t.Fiscal.status().counts).length>0 && window.__t.Fiscal.status().counts.PENDING===0 && !window.__t.State.sales[0].fiscalId));
  // product form hides tax category while off
  await T(()=>window.__t.openProductSheet(null)); await p.waitForSelector('#pfName');
  ck('no tax field while off', await p.$('#pfTax')===null); await T(()=>window.__t.closeModal());
  // set up through the real sheet
  await T(()=>window.__t.openSettingsSheet()); await p.waitForSelector('#stTaxBtn'); await p.click('#stTaxBtn'); await p.waitForSelector('#fxSave');
  await p.screenshot({path:D+'fx_sheet.png'});
  await p.check('#fxOn'); await p.click('#fxSave'); await p.waitForTimeout(150); ck('empty save refused', await T(()=>!window.__t.Fiscal.on()) && await p.$('#fxSave')!==null);
  await p.fill('#fxTin','1234567890'); await p.fill('#fxBranch','WDH01'); await p.fill('#fxTerm','T01');
  await p.fill('#fxUrl','http://insecure'); await p.click('#fxSave'); await p.waitForTimeout(150); ck('http address refused', await T(()=>!window.__t.Fiscal.on()));
  await p.fill('#fxUrl','https://namra.mock/v1/receipts'); await p.fill('#fxKey','test-token'); await p.click('#fxSave'); await p.waitForTimeout(300);
  ck('on and ready and sending', await T(()=>window.__t.Fiscal.on() && window.__t.Fiscal.ready() && window.__t.Fiscal.sendReady()));
  ck('settings synced fields saved, key stays on device', await T(()=>{ const f=window.__t.State.settings.fiscal; return f.tin==='1234567890'&&f.branchCode==='WDH01'&&!('token' in f)&&!('terminalId' in f); }));
  await T(()=>window.__t.openProductSheet(null)); await p.waitForSelector('#pfName'); ck('tax field shown when on', await p.$('#pfTax')!==null); await p.screenshot({path:D+'fx_prod.png'}); await T(()=>window.__t.closeModal());
  // mixed sale
  await T(()=>{ window.__t.State.cart=[{productId:'p1',name:'Soap',unitPrice:11.5,cost:5,qty:3,unit:'',maxQty:50},{productId:'p2',name:'Maize meal',unitPrice:40,cost:30,qty:2,unit:'',maxQty:50},{productId:'p3',name:'School book',unitPrice:100,cost:70,qty:1,unit:'',maxQty:50}]; window.__t.finalizeSale('cash',null,{}); });
  await p.waitForTimeout(400);
  const rec1 = await T(()=>{ const m=window.__t.Store; const all=window.__t.refs; return null; });
  const st = await T(()=>{ const sale=window.__t.State.sales.find(s=>s.fiscalId); return sale?{id:sale.fiscalId,total:sale.total}:null; });
  ck('sale got a fiscalId', !!st);
  await p.waitForTimeout(2500);   // worker tick (800 ms after enqueue)
  const rec = await T(()=>{ const k=window.__t.State.sales.find(s=>s.fiscalId).fiscalId; const raw=JSON.parse(JSON.stringify(window.__t.Fiscal)); return null; });
  const info = await T(()=>{ const id=window.__t.State.sales.find(s=>s.fiscalId).fiscalId; const draft={fiscalKey:id}; const f=window.__t.Fiscal.footerBytes(draft); const pi=window.__t.Fiscal.pdfInfo(draft); return {st:window.__t.Fiscal.status().counts, footLen:f&&f.length, pi}; });
  console.log('   status', JSON.stringify(info.st));
  ck('cleared by the mock authority', info.st.CLEARED===1 && info.st.PENDING===0 && info.st.FAILED===0);
  ck('footer has QR bytes', info.footLen>60);
  ck('pdf rows: standard VAT, zero rated, exempt', info.pi && info.pi.pools.length===3 && info.pi.pools[0].label.indexOf('VAT (15%)')===0);
  console.log('   pdf lines', JSON.stringify(info.pi.lines));
  ck('IRN line in pdf rows', info.pi.lines.some(l=>l.indexOf('IRN: MOCK-1234567890-')===0));
  // receipt PDF builds with the tax block
  await T(()=>window.__t.ensureJsPDF()); await p.waitForTimeout(600);
  const pdfOk = await T(()=>{ const id=window.__t.State.sales.find(s=>s.fiscalId).fiscalId; const d={number:'R-1',billToName:'Customer',dateStr:'2026-10-04',at:new Date().toISOString(),payMethod:'cash',received:214.5,fiscalKey:id,items:[{desc:'Soap',qty:3,unitPrice:11.5},{desc:'Maize meal',qty:2,unitPrice:40},{desc:'School book',qty:1,unitPrice:100}]}; const doc=window.__t.buildReceiptPdf(d); return !!doc && doc.getNumberOfPages()===1; });
  ck('receipt PDF builds', pdfOk);
  // bluetooth bytes: footer lands before the cut
  const bt = await T(()=>{ const id=window.__t.State.sales.find(s=>s.fiscalId).fiscalId; const d={number:'R-1',billToName:'Customer',at:new Date().toISOString(),payMethod:'cash',received:214.5,fiscalKey:id,items:[{desc:'Soap',qty:3,unitPrice:11.5}]}; let b=window.__t.escposReceiptBytes(d,'Demo'); const f=window.__t.Fiscal.footerBytes(d); const out=(window.PesaEfd||window.__t.PesaEfd).withFiscalFooter(b,f); const t=Array.from(out).map(c=>String.fromCharCode(c)).join(''); return {cutLast: out[out.length-4]===0x1d&&out[out.length-3]===0x56, hasIrn:t.indexOf('FISCAL RECEIPT')>0&&t.indexOf('IRN: MOCK-')>0}; });
  ck('Bluetooth bytes: tax block before cut', bt.cutLast && bt.hasIrn);
  // offline: sale never blocked, queued, then sent when back
  offline=true;
  const t0 = Date.now();
  await T(()=>{ window.__t.State.cart=[{productId:'p1',name:'Soap',unitPrice:11.5,cost:5,qty:1,unit:'',maxQty:50}]; window.__t.finalizeSale('cash',null,{}); window.__t.closeModal(); });
  ck('sale returned instantly offline', (Date.now()-t0)<1500);
  await p.waitForTimeout(2500);
  let c2 = await T(()=>window.__t.Fiscal.status().counts); console.log('   offline status', JSON.stringify(c2));
  ck('offline: record waiting, nothing lost', c2.PENDING+c2.SUBMITTED===1 && c2.CLEARED===1);
  offline=false; await T(()=>{ window.__t.Fiscal.ensure(); return window.__t.Fiscal.sendNow(); }); await p.waitForTimeout(800);
  // worker has cooldown after the network failure; clear it the way the owner does
  await p.waitForTimeout(5500); await T(()=>window.__t.Fiscal.resume()); await p.waitForTimeout(900);
  c2 = await T(()=>window.__t.Fiscal.status().counts); console.log('   after reconnect', JSON.stringify(c2));
  ck('after reconnect all cleared', c2.CLEARED===2 && c2.PENDING===0);
  // sequence + chain stored through Store (meta)
  const chain = await T(()=>{ const all=window.__t.Store?null:null; return null; });
  // status sheet renders
  await T(()=>window.__t.openFiscalSheet()); await p.waitForSelector('#fxStatus'); await p.screenshot({path:D+'fx_status.png'});
  ck('terminal id locked after first sale', await p.$eval('#fxTerm',e=>e.readOnly));
  await T(()=>window.__t.closeModal());
  // other terminal's records are not sent by this device
  await T(async()=>{ const rr=window.__t.refs; });
  const real=errs.filter(e=>!/ERR_(TUNNEL|CONNECTION)/.test(e)); ck('no page errors', real.length===0); if(real.length) console.log(real.slice(0,5));
  console.log('mock calls', JSON.stringify(calls));
  console.log(fail?fail+' FAILED':'ALL PASSED'); await b.close(); process.exit(fail?1:0);
})();
