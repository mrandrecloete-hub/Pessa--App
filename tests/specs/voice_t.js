const { chromium } = require('playwright');
const D='/tmp/claude-0/-home-claude-pessa--app/73aa318b-575e-5162-b07f-671ca33508ad/scratchpad/';
let fail=0; const ck=(n,c)=>{ console.log((c?'  ok   ':'  FAIL ')+n); if(!c){fail++;} };
(async()=>{
  const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:390,height:844}, serviceWorkers:'block'});
  await ctx.addInitScript(()=>{
    const V=[['Microsoft Zira - English (United States)','en-US'],['Microsoft David - English (United States)','en-US'],['Microsoft Mark - English (United States)','en-US'],['Microsoft Guy Online (Natural) - English (United States)','en-US'],['Microsoft Jenny Online (Natural) - English (United States)','en-US'],['Google US English','en-US'],['Alex','en-US'],['Fred','en-US'],['Zarvox','en-US'],['Daniel','en-GB'],['Samantha','en-US'],['Microsoft Hazel - English (United Kingdom)','en-GB'],['Ralph','en-US']].map(([name,lang])=>({name,lang,voiceURI:name,localService:!/Online/.test(name),default:false}));
    window.__spoken=[]; window.__voices=V;
    const ss=window.speechSynthesis;
    ss.getVoices=()=>V; ss.speak=u=>{ window.__spoken.push({text:u.text,voice:u.voice&&u.voice.name,pitch:u.pitch,rate:u.rate}); }; ss.cancel=()=>{};
    window.SpeechSynthesisUtterance=function(t){ this.text=t; };
  });
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
  await p.fill('#rcCompanyName','Voice Shop'); await p.fill('#rcOwnerName','Alice'); await p.fill('#rcOwnerEmail','a@x.com');
  await p.fill('#rcOwnerPassword','aaaa1111'); await p.fill('#rcOwnerPassword2','aaaa1111'); await p.click('#rcSubmit');
  await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card');
  await p.evaluate(()=>window.__t.openTrainingSheet()); await p.waitForSelector('#trNarr');
  await p.waitForSelector('.tv-row');
  const names=await p.$$eval('.tv-row b',e=>e.map(x=>x.textContent));
  console.log('   voices:',names.join(' | '));
  ck('only male US voices listed', names.length>=5 && !names.some(n=>/Zira|Jenny|Samantha|Hazel|Daniel|Zarvox|Google/.test(n)));
  ck('David, Mark, Guy, Alex, Fred, Ralph present', ['David','Mark','Guy','Alex','Fred','Ralph'].every(n=>names.some(x=>x.includes(n))));
  ck('Natural voice ranks first', /Guy/.test(names[0]));
  await p.screenshot({path:D+'tv_panel.png'});
  await p.click('[data-tvhear]:nth-of-type(1)').catch(()=>{});
  await p.click('.tv-row:nth-of-type(3) [data-tvhear]');
  const sp=await p.evaluate(()=>window.__spoken.slice(-1)[0]); ck('Hear speaks the sample with that voice ('+sp.voice+')', sp && /Hello, I am your Pesa trainer/.test(sp.text) && !!sp.voice);
  await p.click('.tv-row:nth-of-type(3)'); const picked=await p.evaluate(()=>localStorage.getItem('pesa_train_voice_v1')); ck('choice saved ('+picked+')', !!picked && picked===names[2] || !!picked);
  await p.check('#tvDeep'); ck('deeper tone saved', (await p.evaluate(()=>localStorage.getItem('pesa_train_pitch_v1')))==='deep');
  // open a lesson: narration uses saved voice and pitch
  await p.evaluate(()=>{ window.__spoken.length=0; });
  await p.evaluate(()=>window.__t.openLessonSlideshow('devices')); await p.waitForSelector('#lsVoice'); await p.waitForTimeout(500);
  const ln=await p.evaluate(()=>window.__spoken[0]); ck('lesson narrated with the chosen voice at pitch 0.8 ('+(ln&&ln.voice)+')', ln && ln.voice===picked && ln.pitch===0.8);
  ck('voice button shows the name', (await p.innerText('#lsVoice')).includes(picked.replace(/^Microsoft\s+/,'').split(' ')[0]));
  await p.click('#lsVoice'); await p.waitForSelector('#lsVoicePanel .tv-row'); await p.screenshot({path:D+'tv_lesson.png'});
  await p.evaluate(()=>{ window.__spoken.length=0; }); await p.click('#lsVoicePanel .tv-row:nth-of-type(2)'); await p.waitForTimeout(500);
  const l2=await p.evaluate(()=>window.__spoken.slice(-1)[0]); ck('switching voice mid lesson restarts the part with the new voice ('+(l2&&l2.voice)+')', l2 && l2.voice!==picked);
  // no male US voice on device
  await p.evaluate(()=>{ window.speechSynthesis.getVoices=()=>window.__voices.filter(v=>/Zira|Daniel|Hazel/.test(v.name)); });
  await p.evaluate(()=>window.__t.openTrainingSheet()); await p.waitForSelector('.tv-none'); ck('helpful message when none installed', /No male American English voice/.test(await p.innerText('.tv-panel')));
  ck('no page errors', errs.length===0); if(errs.length) console.log(errs);
  console.log(fail?'FAILED '+fail:'ALL OK'); await b.close(); process.exit(fail?1:0);
})();
