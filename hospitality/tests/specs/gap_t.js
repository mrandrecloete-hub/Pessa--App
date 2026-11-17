const { chromium } = require('playwright');
let fail=0; const ck=(n,c)=>{ console.log((c?'  ok   ':'  FAIL ')+n); if(!c){fail++;} };
(async()=>{
  const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:900},serviceWorkers:'block',permissions:['clipboard-read','clipboard-write']}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await require('./biz_boot.js')(p,{demo:true});
  // mobile money: paste from the clipboard and check in one tap
  await p.evaluate(()=>navigator.clipboard.writeText('e@syWallet: You have received N$150.00 Ref: 778899'));
  await p.evaluate(()=>window.__t.openMomoSheet()); await p.waitForSelector('#mmPaste');
  await p.click('#mmPaste'); await p.waitForTimeout(400);
  ck('paste button fills the box', (await p.inputValue('#mmText')).indexOf('778899')>-1);
  ck('paste button runs the check', /message\(s\) with no sale|wallet sales matched|No wallet sales/.test(await p.innerText('#mmOut')));
  await p.click('#mmPaste'); await p.waitForTimeout(300);
  ck('pasting the same message twice does not duplicate it', (await p.inputValue('#mmText')).split('778899').length===2);
  await p.evaluate(()=>window.__t.closeModal());
  // translator file: export, fill, import
  const csv = await p.evaluate(async()=>{ const t=window.__t; t.langEnsure && t.langEnsure('af'); return null; });
  const parsed = await p.evaluate(()=>{ const t=window.__t; const rows=t.lxParse('English,Oshiwambo\r\n"Sell, now",Landitha\r\nStock,"Iinima ""yomutumba"""\r\n'); return rows; });
  ck('csv reader handles quotes and commas', JSON.stringify(parsed)===JSON.stringify([['English','Oshiwambo'],['Sell, now','Landitha'],['Stock','Iinima "yomutumba"']]));
  const n = await p.evaluate(()=>window.__t.lxImport('naq','English,Khoekhoegowab\nHello,Tsÿ\n'));
  ck('import adds phrases', n===1);
  ck('imported phrase is used and saved on this device', await p.evaluate(()=>{ const t=window.__t; return t.LANGS.naq.strings['Hello']==='Tsÿ' && !!localStorage.getItem('pesa_lang_extra_naq'); }));
  ck('empty files are refused', (await p.evaluate(()=>window.__t.lxImport('naq','English,Khoekhoegowab\n')))===0);
  ck('no page errors', errs.length===0); if(errs.length) console.log(errs.join(' | '));
  await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
