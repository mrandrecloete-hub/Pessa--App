const { chromium } = require('playwright'); const fs=require('fs'); const boot=require('./biz_boot.js');
const D=''+(process.env.PESA_OUT||'/tmp/pesa-tests/')+'pdfout/'; fs.mkdirSync(D,{recursive:true});
let fail=0; const ck=(n,c,x)=>{ console.log((c?'  ok   ':'  FAIL ')+n+(!c&&x!==undefined?'  -> '+JSON.stringify(x).slice(0,300):'')); if(!c) fail++; };
(async()=>{
 const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:412,height:900},serviceWorkers:'block'}); const p=await ctx.newPage(); const errs=[];
 p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{ if(m.type()==='error' && !/TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
 await boot(p);
 // statement maths
 const r=await p.evaluate(()=>{ const t=window.__t; const day=86400000, now=Date.now();
  const c={id:'c1',name:'Maria',balance:300,phone:'0811234567'};
  const led=[{type:'charge',amount:500,createdAt:new Date(now-100*day).toISOString(),note:'Sale on credit'},{type:'payment',amount:200,createdAt:new Date(now-50*day).toISOString(),note:'cash'},{type:'charge',amount:100,createdAt:new Date(now-5*day).toISOString(),items:[{qty:2,name:'Bread'}]},{type:'payment',amount:100,createdAt:new Date(now-2*day).toISOString()}];
  const all=t.statementBuild(c,led,'',t.todayKey()); const from=new Date(now-60*day).toISOString().slice(0,10); const part=t.statementBuild(c,led,from,t.todayKey());
  return {all:{open:all.opening,close:all.closing,ch:all.charges,pay:all.payments,n:all.lines.length,age:all.age}, part:{open:part.opening,close:part.closing,n:part.lines.length}}; });
 ck('statement: all time opening 0, closing 300', r.all.open===0 && r.all.close===300 && r.all.n===4 && r.all.ch===600 && r.all.pay===300, r);
 ck('statement: ageing adds up to balance', Math.abs(Object.values(r.all.age).reduce((a,b)=>a+b,0)-300)<0.01, r.all.age);
 ck('statement: period opening balance carried', r.part.open===500 && r.part.close===300 && r.part.n===3, r.part);
 // pdf
 const b64=await p.evaluate(async()=>{ const t=window.__t; const c={id:'c1',name:'Maria',balance:300,phone:'0811'}; const S=t.statementBuild(c,[{type:'charge',amount:300,createdAt:new Date().toISOString(),items:[{qty:2,name:'Bread'}]}],'',t.todayKey()); const d=await t.statementPdf(c,S); return d.output('datauristring').split(',')[1]; });
 fs.writeFileSync(D+'statement.pdf',Buffer.from(b64,'base64')); ck('statement pdf made', b64.length>2000);
 // payroll maths
 const pc=await p.evaluate(()=>{ const t=window.__t; const u={id:'u1',name:'Sam',role:'cashier',pay:{type:'hourly',rate:50,commission:0,allowance:100,ded:[{name:'Social security',mode:'percent',value:1},{name:'Medical',mode:'amount',value:20}]}};
  const l=t.payCalc(u,t.todayKey().slice(0,7),{units:10,bonus:50,advance:30}); return l; });
 ck('payroll: gross = 500 + 100 + 50', pc.gross===650, pc);
 ck('payroll: deductions 6.5 + 20 + 30', Math.abs(pc.totalDeductions-56.5)<0.001 && Math.abs(pc.net-593.5)<0.001, pc);
 // ui: set up pay, run, save, pay
 await p.evaluate(()=>{ const t=window.__t; t.State.users.forEach(u=>{}); });
 await p.evaluate(()=>window.__t.openPayrollSheet()); await p.waitForSelector('[data-paysetup]');
 await p.click('[data-paysetup]'); await p.waitForSelector('#psRate'); await p.fill('#psRate','8000'); await p.fill('#psAllow','200'); await p.fill('#psDn0','PAYE'); await p.fill('#psDv0','10'); await p.click('#psSave');
 await p.waitForSelector('#payRunBtn'); await p.click('#payRunBtn'); await p.waitForSelector('[data-payu]');
 const txt=await p.innerText('[data-pcalc]'); ck('pay run shows gross 8,200 and net 7,380', /8[ ,.]?200/.test(txt) && /7[ ,.]?380/.test(txt), txt);
 await p.click('#paySave'); await p.waitForSelector('#paySlips'); await p.waitForTimeout(400);
 ck('pay run saved', await p.evaluate(()=>window.__t.State.payRuns.length===1 && window.__t.State.payRuns[0].totalNet===7380), await p.evaluate(()=>JSON.stringify(window.__t.State.payRuns).slice(0,200)));
 const sp=await p.evaluate(async()=>{ const t=window.__t; const run=t.State.payRuns[0]; const d=await t.payslipsPdf(run); const d2=await t.payrollSummaryPdf(run); return [d.output('datauristring').split(',')[1], d2.output('datauristring').split(',')[1]]; });
 fs.writeFileSync(D+'payslip.pdf',Buffer.from(sp[0],'base64')); fs.writeFileSync(D+'payroll_summary.pdf',Buffer.from(sp[1],'base64')); ck('payslip and summary pdfs made', sp[0].length>2000&&sp[1].length>2000);
 const before=await p.evaluate(()=>window.__t.State.expenses.length);
 await p.click('#payPaid'); await p.waitForSelector('#cfOk'); await p.click('#cfOk'); await p.waitForTimeout(700);
 ck('paid: run locked and wages expense recorded', await p.evaluate((b)=>{ const t=window.__t; return t.State.payRuns[0].status==='paid' && t.State.expenses.length===b+1 && t.State.expenses.some(e=>e.category==='Wages'&&e.amount===7380); }, before));
 ck('no page errors', errs.length===0, errs);
 await b.close(); console.log(fail?'FAILED '+fail:'ALL OK'); process.exit(fail?1:0);
})();
