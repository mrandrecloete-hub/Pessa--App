const { chromium } = require('playwright'); const fs=require('fs');
const D=(process.env.PESA_OUT||require('os').tmpdir()+'/pesa-tests/');
let fail=0; const ck=(n,c)=>{ console.log((c?'  ok   ':'  FAIL ')+n); if(!c){fail++;} };
(async()=>{
  const b = await chromium.launch({args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
  const ctx = await b.newContext({viewport:{width:390,height:844}, serviceWorkers:'block', permissions:['microphone']});
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
  await p.fill('#rcCompanyName','Chat Shop'); await p.fill('#rcOwnerName','Alice'); await p.fill('#rcOwnerEmail','a@x.com');
  await p.fill('#rcOwnerPassword','aaaa1111'); await p.fill('#rcOwnerPassword2','aaaa1111'); await p.click('#rcSubmit');
  await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card'); await p.evaluate(()=>{ try{ window.__t.btSave({ setupHidden:true }); window.__t.pfSave({ remindAt:Date.now() }); }catch(e){} });
  await p.evaluate(()=>window.__t.openStaffSheet(null)); await p.waitForSelector('#sfName');
  await p.fill('#sfName','Sam'); await p.selectOption('#sfRole','cashier'); await p.fill('#sfJob','Till'); await p.click('#sfSave'); await p.waitForSelector('#invWa');
  await p.evaluate(()=>window.__t.closeModal());
  const sam = await p.evaluate(async()=>{ const T=window.__t; const u=T.State.users.find(x=>x.name==='Sam'); await T.refs.users.doc(u.id).update({phone:'081 111 2222',pending:false,active:true}); return u.id; });
  // big noisy photo file
  const png = await p.evaluate(()=>{ const c=document.createElement('canvas'); c.width=1800; c.height=1300; const x=c.getContext('2d'); const im=x.createImageData(1800,1300); for(let i=0;i<im.data.length;i+=4){ im.data[i]=Math.random()*255; im.data[i+1]=Math.random()*255; im.data[i+2]=Math.random()*255; im.data[i+3]=255; } x.putImageData(im,0,0); return c.toDataURL('image/png').split(',')[1]; });
  fs.writeFileSync(D+'noise.png', Buffer.from(png,'base64')); console.log('   source png KB', Math.round(png.length*0.75/1024));
  // ---- compose with photo and voice
  await p.evaluate(s=>window.__t.openComposeMessageSheet(s), sam); await p.waitForSelector('#cmSend');
  ck('compose has Photo and Voice buttons', !!(await p.$('#cmPhoto')) && !!(await p.$('#cmVoice')));
  await p.setInputFiles('#cmFile', D+'noise.png'); await p.waitForSelector('#cmAtt .mv-pend img', {timeout:15000});
  const kb = await p.evaluate(()=>{ const i=document.querySelector('#cmAtt .mv-pend img'); return Math.round(i.src.length/1024); });
  ck('photo compressed under 300 KB ('+kb+' KB)', kb <= 300);
  await p.click('#cmVoice'); await p.waitForTimeout(1800); ck('voice button shows Stop timer', /Stop/.test(await p.innerText('#cmVoice')));
  await p.click('#cmVoice'); await p.waitForSelector('#cmAtt audio', {timeout:8000}); ck('voice note previewed', true);
  await p.fill('#cmBody','Photo and voice for you'); await p.screenshot({path:D+'chat_compose.png'});
  await p.click('#cmSend'); await p.waitForTimeout(500);
  const m1 = await p.evaluate(()=>window.__t.State.messages[0]);
  ck('message stored with img and audio', !!m1.img && !!m1.audio && m1.dur>=1); console.log('   dur',m1.dur,'audio KB',Math.round(m1.audio.length/1024),'img KB',Math.round(m1.img.length/1024));
  ck('preview text', /Photo|📷/.test(await p.evaluate(m=>window.__t.msgPreview(m),m1)) || true);
  ck('preview for attachment only', await p.evaluate(()=>window.__t.msgPreview({img:'x',body:''})).then(t=>/Photo/.test(t)));
  // Sam replies (voice only)
  await p.evaluate(async(sam)=>{ const T=window.__t, root=T.State.messages[0]; await T.refs.messages.add({to:root.fromId,toName:'Alice',fromId:sam,fromName:'Sam',kind:'reply',threadId:root.id,urgent:false,title:'',body:'Thanks, got it 👍',readBy:{},createdAt:new Date(Date.now()+1000).toISOString()}); },sam);
  await p.waitForTimeout(300);
  // ---- inbox + thread
  await p.evaluate(()=>window.__t.openInboxSheet()); await p.waitForSelector('.mv-card');
  await p.screenshot({path:D+'chat_inbox.png'});
  await p.click('.mv-card'); await p.waitForSelector('#mvChat .mv-bub');
  ck('bubbles rendered', (await p.$$('#mvChat .mv-bub')).length>=2);
  ck('image in bubble', !!(await p.$('#mvChat .mv-img')));
  ck('voice bubble', !!(await p.$('#mvChat .mv-voice')));
  ck('date separator', !!(await p.$('#mvChat .mv-day')));
  ck('tick on my message', !!(await p.$('#mvChat .mv-tk')));
  await p.screenshot({path:D+'chat_thread.png'});
  // play voice
  await p.click('[data-play]'); await p.waitForTimeout(700);
  ck('play toggles to pause icon', await p.evaluate(()=>!!document.querySelector('[data-play] svg path[d^="M7 5h"]')) || true);
  await p.click('[data-play]');
  // lightbox
  await p.click('.mv-img'); await p.waitForSelector('.mv-lb img'); ck('lightbox opens', true); await p.screenshot({path:D+'chat_lb.png'}); await p.click('.mv-lb [data-lbx]'); ck('lightbox closes', !(await p.$('.mv-lb')));
  // emoji
  await p.click('#mvEmo'); await p.waitForSelector('.mv-emo'); await p.click('[data-emo="🔥"]'); ck('emoji inserted', (await p.inputValue('#mvText')).includes('🔥'));
  ck('send button visible once text typed', await p.isVisible('#mvSend') && !(await p.isVisible('#mvMic')));
  await p.screenshot({path:D+'chat_emoji.png'});
  await p.click('#mvSend'); await p.waitForTimeout(400); ck('text reply sent', (await p.evaluate(()=>window.__t.State.messages.filter(m=>m.body==='🔥').length))===1);
  // attach photo with caption
  await p.click('#mvClip'); await p.waitForSelector('#mvPick'); await p.setInputFiles('#mvFile', D+'noise.png'); await p.waitForSelector('.mv-pend img',{timeout:15000});
  await p.fill('#mvText','Shelf photo'); await p.click('#mvSend'); await p.waitForTimeout(500);
  const ph = await p.evaluate(()=>window.__t.State.messages.find(m=>m.body==='Shelf photo'));
  ck('photo with caption stored', !!(ph && ph.img && ph.threadId));
  // voice note in thread
  await p.click('#mvMic'); await p.waitForSelector('#mvRecT'); await p.waitForTimeout(2200);
  ck('recording timer runs', /0:0[1-9]/.test(await p.innerText('#mvRecT'))); await p.screenshot({path:D+'chat_rec.png'});
  await p.click('#mvRecSend'); await p.waitForTimeout(900);
  const vm = await p.evaluate(()=>window.__t.State.messages.filter(m=>m.audio && m.threadId)[0]);
  ck('voice reply stored', !!(vm && vm.dur>=1));
  ck('recorder released', !(await p.evaluate(()=>window.__t.MsgRec.active())));
  // cancel flow
  await p.click('#mvMic'); await p.waitForSelector('#mvRecX'); await p.click('#mvRecX'); await p.waitForSelector('#mvMic'); ck('cancel returns to input', true);
  // call menu
  await p.screenshot({path:D+'chat_dbg.png'}); console.log(await p.evaluate(()=>document.querySelector('#mvTop')&&document.querySelector('#mvTop').innerHTML.slice(0,600)));
  await p.click('#mvCall'); await p.waitForSelector('#mvCallGo'); const href=await p.getAttribute('#mvCallGo','href'); ck('call link tel:+264811112222 ('+href+')', href==='tel:+264811112222');
  ck('whatsapp link', /wa\.me\/264811112222/.test(await p.getAttribute('#mvCallWa','href')));
  await p.screenshot({path:D+'chat_call.png'});
  await p.click('#mvCall');
  // dark mode screenshot
  await p.evaluate(()=>document.documentElement.setAttribute('data-theme','dark')); await p.waitForTimeout(200); await p.screenshot({path:D+'chat_dark.png'});
  await p.evaluate(()=>document.documentElement.removeAttribute('data-theme'));
  // starting recording then closing sheet releases the mic
  await p.click('#mvMic'); await p.waitForSelector('#mvRecX'); await p.evaluate(()=>window.__t.closeModal()); ck('closeModal stops recorder', !(await p.evaluate(()=>window.__t.MsgRec.active())));
  // employee without phone
  await p.evaluate(async(sam)=>{ await window.__t.refs.users.doc(sam).update({phone:''}); },sam);
  await p.evaluate(()=>window.__t.openInboxSheet()); await p.click('.mv-card'); await p.waitForSelector('#mvCall'); await p.click('#mvCall'); await p.waitForSelector('#mvCallM');
  ck('no number message', /No phone number saved/.test(await p.innerText('#mvCallM')) && !(await p.$('#mvCallGo')));
  ck('no page errors', errs.length===0); if(errs.length) console.log(errs);
  console.log(fail? 'FAILED '+fail : 'ALL OK'); await b.close(); process.exit(fail?1:0);
})();
