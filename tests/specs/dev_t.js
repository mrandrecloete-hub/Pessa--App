const { chromium, devices } = require('playwright');
let fail=0; const ck=(n,c,x)=>{ console.log((c?'  ok   ':'  FAIL ')+n+(!c&&x!==undefined?'  -> '+JSON.stringify(x).slice(0,400):'')); if(!c){fail++;} };
const profiles=[
  ['Pixel 5 (Android)',{viewport:{width:393,height:727},userAgent:devices['Pixel 5'].userAgent,isMobile:true,hasTouch:true,deviceScaleFactor:2.75},4],
  ['iPhone SE size (small, iOS UA)',{viewport:{width:320,height:568},userAgent:devices['iPhone SE'].userAgent,isMobile:true,hasTouch:true,deviceScaleFactor:2},6],
  ['Cheap Android 360x640, slow CPU',{viewport:{width:360,height:640},userAgent:devices['Galaxy S9+'].userAgent,isMobile:true,hasTouch:true,deviceScaleFactor:2},6],
  ['Tablet 768',{viewport:{width:768,height:1024},isMobile:false,hasTouch:true},2]
];
(async()=>{
  const b=await chromium.launch({args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
  for(const [name,opts,slow] of profiles){
    console.log('== '+name);
    const ctx=await b.newContext(Object.assign({serviceWorkers:'block',permissions:['microphone']},opts)); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    const cdp=await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate',{rate:slow});
    const t0=Date.now(); await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName',{timeout:60000}); const tLoad=Date.now()-t0;
    await p.fill('#rcCompanyName','Dev Shop'); await p.fill('#rcOwnerName','Alice'); await p.fill('#rcOwnerEmail','a@x.com'); await p.fill('#rcOwnerPassword','aaaa1111'); await p.fill('#rcOwnerPassword2','aaaa1111'); await p.click('#rcSubmit');
    await p.waitForSelector('#cnAgree',{timeout:60000}); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card',{timeout:60000});
    console.log('   first load '+tLoad+' ms at '+slow+'x slower CPU');
    // seed
    await p.evaluate(async()=>{ const T=window.__t; for(let i=1;i<=60;i++) await T.refs.products.doc('p'+i).set({name:'Product '+i,category:'Cat '+(i%6),sellPrice:10+i,costPrice:5+i/2,stockQty:20,barcode:'600'+i});
      await T.refs.users.doc('u2').set({name:'Sam',role:'cashier',active:true,pending:false,phone:'081 111 2222',createdAt:new Date().toISOString()});
      const me=T.State.session.userId; await T.refs.messages.add({to:'u2',toName:'Sam',fromId:me,fromName:'Alice',kind:'message',urgent:false,title:'Hi',body:'A fairly long message to see how the bubble wraps on a narrow screen with many many words in it',readBy:{},createdAt:new Date().toISOString()}); });
    async function overflow(label){
      await p.waitForTimeout(250);
      const r=await p.evaluate(()=>{ const de=document.documentElement; const out={page:de.scrollWidth-innerWidth}; const sh=document.querySelector('.sheet'); if(sh){ out.sheet=sh.scrollWidth-sh.clientWidth; const bad=[]; sh.querySelectorAll('*').forEach(e=>{ const r=e.getBoundingClientRect(); if(r.width>0 && (r.right>innerWidth+1 || r.left<-1) && getComputedStyle(e).position!=='fixed' && !e.closest('.mv-wall::before')){ bad.push((e.id||e.className||e.tagName).toString().slice(0,30)+':'+Math.round(r.left)+'-'+Math.round(r.right)); } }); out.bad=bad.slice(0,5); } return out; });
      ck(label+' fits width', r.page<=1 && (!('sheet' in r) || r.sheet<=1) && (!r.bad || r.bad.length===0), r);
    }
    await overflow('dashboard');
    for(const [label,fn] of [['inbox',"openInboxSheet()"],['compose',"openComposeMessageSheet('u2')"],['accountant',"openAccountantSheet()"],['training',"openTrainingSheet()"],['settings',"openSettingsSheet()"],['business hub',"openBizHub()"],['team',"openTeamSheet()"],['pilot form',"openPilotFormSheet()"],['about',"openAboutSheet()"]]){
      console.log('   opening',label); await p.evaluate(`window.__t.${fn}`); await overflow(label); await p.evaluate(()=>window.__t.closeModal());
    }
    await p.evaluate(()=>window.__t.openThreadSheet(window.__t.State.messages[0].id)); await overflow('chat thread');
    // chat voice + emoji at this size
    await p.click('#mvEmo'); await overflow('chat with emoji tray'); await p.click('#mvEmo');
    const t1=Date.now(); await p.click('#mvMic'); await p.waitForSelector('#mvRecT',{timeout:15000}); await p.waitForTimeout(1500); await p.click('#mvRecSend'); await p.waitForFunction(()=>window.__t.State.messages.some(m=>m.audio),null,{timeout:20000}); console.log('   voice note record+send '+(Date.now()-t1)+' ms');
    ck('voice note sent', true);
    await p.evaluate(()=>window.__t.closeModal());
    // tabs
    for(const tab of ['sell','stock','credit','expenses','dashboard']){ await p.evaluate(t=>window.__t.setTab(t),tab).catch(()=>{}); await p.waitForTimeout(300); const w=await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth); ck('tab '+tab+' fits width', w<=1, w); }
    ck('no page errors', errs.length===0, errs);
    await ctx.close();
  }
  console.log(fail?'FAILED '+fail:'ALL OK'); await b.close(); process.exit(fail?1:0);
})();
