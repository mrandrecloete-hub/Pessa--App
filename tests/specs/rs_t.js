const { chromium } = require('playwright');
const D=(process.env.PESA_OUT||require('os').tmpdir()+'/pesa-tests/');
(async()=>{
  const b = await chromium.launch(); const errs=[];
  for (const [w,h,n] of [[1440,900,'lap'],[820,1100,'tab'],[360,740,'mob']]) {
    const ctx = await b.newContext({viewport:{width:w,height:h}, serviceWorkers:'block'}); const p = await ctx.newPage(); p.on('pageerror',e=>errs.push(e.message));
    await p.goto('http://localhost:8933/index.html'); await p.waitForSelector('#rcCompanyName');
    await p.fill('#rcCompanyName','Dinner'); await p.fill('#rcOwnerName','Alice'); await p.fill('#rcOwnerEmail','a@x.com');
    await p.fill('#rcOwnerPassword','aaaa1111'); await p.fill('#rcOwnerPassword2','aaaa1111'); await p.click('#rcSubmit');
    await p.waitForSelector('#cnAgree'); await p.click('#cnAgree'); await p.click('#cnAccept'); await p.waitForSelector('.hero-card'); await p.evaluate(()=>{ try{ window.__t.btSave({ setupHidden:true }); window.__t.pfSave({ remindAt:Date.now() }); }catch(e){} });
    await p.evaluate(async()=>{ const T=window.__t,r=T.refs; await r.products.doc().set({name:'Bread',sellPrice:17.99,costPrice:13,stockQty:2,createdAt:new Date().toISOString()});
      const u=r.users.doc(); await u.set({name:'Sam',role:'cashier',jobTitle:'Front till',passHash:'x',active:true,employeeNo:'E001',createdAt:new Date().toISOString(),lastActiveAt:new Date().toISOString()});
      const now=new Date().toISOString(); const t=r.tills.doc(); await t.set({cashierId:u.id,cashierName:'Sam',openingFloat:100,openedAt:now,status:'open'});
      for(const m of ['cash','card']) await r.sales.doc().set({items:[{name:'Bread',qty:2,unitPrice:17.99,lineTotal:35.98}],total:35.98,cost:26,profit:9.98,paymentMethod:m,cashierName:'Sam',createdAt:now,tillId:t.id});
      await r.messages.add({to:'all',toName:'All',fromId:'x',fromName:'Alice',kind:'instruction',urgent:true,title:'Closing',body:'Count the bread.',readBy:{},createdAt:now}); });
    await p.evaluate(()=>window.__t.setTab('team')); await p.waitForTimeout(500);
    const ov = await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
    await p.screenshot({path:D+`rs_${n}_team.png`}); 
    await p.click('[data-trku]'); await p.waitForTimeout(300); await p.screenshot({path:D+`rs_${n}_detail.png`}); await p.evaluate(()=>window.__t.closeModal());
    await p.click('[data-trkmsg=all]'); await p.waitForSelector('#cmBody'); await p.screenshot({path:D+`rs_${n}_compose.png`}); await p.evaluate(()=>window.__t.closeModal());
    await p.evaluate(()=>{const T=window.__t,u=T.State.users.find(x=>x.name==='Sam');T.State.session={userId:u.id,name:u.name,role:'cashier'};T.setTab('me');}); await p.waitForTimeout(500);
    const ov2 = await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
    await p.waitForTimeout(900); await p.screenshot({path:D+`rs_${n}_me.png`}); await p.evaluate(()=>window.__t.setTab('team')); await p.waitForTimeout(600); await p.screenshot({path:D+`rs_${n}_team2.png`}); await p.evaluate(()=>{const T=window.__t,u=T.State.users.find(x=>x.name==='Sam');T.State.session={userId:u.id,name:u.name,role:'cashier'};T.setTab('me');}); await p.waitForTimeout(500);
    await p.evaluate(()=>window.__t.setTab('records')); await p.waitForTimeout(300); await p.screenshot({path:D+`rs_${n}_rec.png`});
    console.log(n,'overflow',ov,ov2);
    await ctx.close();
  }
  console.log(errs); await b.close();
})();
