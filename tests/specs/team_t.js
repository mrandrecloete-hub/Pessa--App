const { chromium } = require('playwright'); const boot=require('./biz_boot.js');
let fail=0; const ck=(n,c,x)=>{ console.log((c?'  ok   ':'  FAIL ')+n+(!c&&x!==undefined?'  -> '+JSON.stringify(x).slice(0,300):'')); if(!c) fail++; };
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:412,height:900},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[];
 p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{ if(m.type()==='error' && !/TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
 await boot(p);
 const click=async(k)=>{ await p.evaluate((k)=>{ const b=document.createElement('button'); b.setAttribute('data-tm',k); b.id='tmx'; document.body.appendChild(b); b.click(); b.remove(); }, k); await p.waitForTimeout(500); };
 await click('clock');
 ck('clock in creates an open shift', await p.evaluate(()=>{ const t=window.__t; return t.State.clockLogs.length===1 && !t.State.clockLogs[0].outAt; }));
 await click('clock');
 ck('clock out closes it', await p.evaluate(()=>{ const t=window.__t; return t.State.clockLogs.length===1 && !!t.State.clockLogs[0].outAt; }));
 ck('month totals count one day', await p.evaluate(()=>{ const t=window.__t; const me=t.tmMe(); const x=t.clockMonthTotals(me.id,t.todayKey().slice(0,7)); return x.days===1; }));
 await click('clock'); // on shift again
 // tips: share between everyone on shift
 await p.evaluate(()=>window.__t.openTipSheet()); await p.waitForSelector('#tpAmt'); await p.fill('#tpAmt','50'); await p.selectOption('#tpWho','__team'); await p.click('#tpSave'); await p.waitForTimeout(500);
 ck('shared tip recorded for the person on shift', await p.evaluate(()=>{ const t=window.__t; return t.State.tips.length===1 && t.State.tips[0].amount===50 && !!t.State.tips[0].pool; }), await p.evaluate(()=>JSON.stringify(window.__t.State.tips)));
 await p.evaluate(()=>window.__t.openTipSheet()); await p.waitForSelector('#tpAmt'); await p.fill('#tpAmt','20'); await p.click('#tpSave'); await p.waitForTimeout(500);
 ck('own tip adds up', await p.evaluate(()=>{ const t=window.__t; return t.tipsOf(t.tmMe().id, t.todayKey().slice(0,7))===70; }));
 await p.evaluate(()=>window.__t.openTipsSheet()); await p.waitForSelector('#tsAdd'); ck('tips sheet shows total', /70/.test(await p.innerText('.sheet, #modalRoot, body')));
 await p.evaluate(()=>window.__t.closeModal());
 // attendance
 await p.evaluate(()=>window.__t.openAttendanceSheet()); await p.waitForSelector('#atMonth'); ck('attendance lists who is on shift', /on shift now/i.test(await p.innerText('body')));
 await p.click('[data-atu]'); await p.waitForSelector('#clAdd'); await p.click('#clAdd'); await p.waitForSelector('#ceSave'); await p.fill('#ceIn', await p.evaluate(()=>{ const d=new Date(); d.setDate(1); d.setHours(8,0,0,0); return window.__t.tmLocalIn(d.toISOString()); })); await p.fill('#ceOut', await p.evaluate(()=>{ const d=new Date(); d.setDate(1); d.setHours(16,30,0,0); return window.__t.tmLocalIn(d.toISOString()); })); await p.click('#ceSave'); await p.waitForTimeout(600);
 ck('a missed shift can be added (8.5h)', await p.evaluate(()=>{ const t=window.__t; const l=t.State.clockLogs.find(x=>x.added); return !!l && Math.abs(t.clockMs(l)-8.5*3600000)<1000; }));
 await p.evaluate(()=>window.__t.closeModal());
 // holidays
 const h=await p.evaluate(()=>{ const t=window.__t; const a=t.calHolidays(2026), c=t.calHolidays(2027); return { ind:a['2026-03-21'], gf:a['2026-04-03'], em:a['2026-04-06'], hero:a['2026-08-26'], sun:c['2027-03-22'] }; });
 ck('Namibian holidays: Independence, Good Friday, Easter Monday, Heroes Day', h.ind==='Independence Day' && h.gf==='Good Friday' && h.em==='Easter Monday' && h.hero==='Heroes’ Day', h);
 ck('holiday on a Sunday moves to Monday', /Independence Day/.test(h.sun||''), h);
 await p.evaluate(()=>window.__t.openCalendarSheet()); await p.waitForSelector('[data-cd]');
 const today=await p.evaluate(()=>window.__t.todayKey()); await p.click('[data-cd="'+today+'"]'); await p.waitForSelector('#evTitle'); await p.fill('#evTitle','Supplier visit'); await p.click('#evAdd'); await p.waitForTimeout(700);
 ck('calendar event saved', await p.evaluate(()=>window.__t.State.calEvents.length===1 && window.__t.State.calEvents[0].title==='Supplier visit'));
 ck('event shows on its day', await p.evaluate(()=>window.__t.calItemsFor(window.__t.todayKey()).some(x=>x.title==='Supplier visit')));
 await p.evaluate(()=>window.__t.closeModal());
 // rating chart
 const rr=await p.evaluate(()=>{ const t=window.__t; const r=t.reportPresetRange('month'); return t.staffRatingRows(r.from,r.to).map(x=>({n:x.name,s:x.score})); });
 ck('rating rows exist and use attendance', rr.length>=1 && rr.some(x=>x.s!=null), rr);
 await p.evaluate(()=>window.__t.openStaffPerfSheet()); await p.waitForSelector('[data-rate]'); ck('rating chart is drawn', /performance rating/i.test(await p.innerText('body')));
 await p.click('[data-rate]'); await p.waitForSelector('[data-star="5"]'); await p.click('[data-star="5"]'); await p.waitForTimeout(600);
 ck('manager star rating saved', await p.evaluate(()=>{ const r=window.__t.State.settings.staffRatings||{}; return Object.values(r).some(m=>Object.values(m).includes(5)); }));
 // payroll takes hours and tips
 const pr=await p.evaluate(()=>{ const t=window.__t; const me=t.tmMe(); const u=Object.assign({},me,{pay:{type:'hourly',rate:40,ded:[]}}); const hrs=t.payClockUnits(u,t.todayKey().slice(0,7),'hourly'); const l=t.payCalc(u,t.todayKey().slice(0,7),{units:hrs}); return {hrs:hrs,gross:l.gross,tips:l.tips,net:l.net}; });
 ck('payroll hours come from the clock and tips are added to net', pr.hrs>=8.5 && pr.tips===70 && Math.abs(pr.net-(pr.gross+70))<0.01, pr);
 // dashboard widgets
 ck('dashboard widgets render', await p.evaluate(()=>/On shift now/.test(window.__t.tmDashHtml()) && /Calendar today/.test(window.__t.tmDashHtml())));
 ck('home card renders', await p.evaluate(()=>/My shift/.test(window.__t.tmCardHtml())));
 ck('no page errors', errs.length===0, errs);
 await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
