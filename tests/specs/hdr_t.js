const { chromium } = require('playwright');
(async()=>{ const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:500},deviceScaleFactor:3,serviceWorkers:'block'}); const p=await ctx.newPage();
 await require('./biz_boot.js')(p); await p.waitForTimeout(600);
 await p.screenshot({path:'hdr_1.png',clip:{x:0,y:0,width:390,height:90}});
 await p.setViewportSize({width:340,height:500}); await p.waitForTimeout(300); await p.screenshot({path:'hdr_2.png',clip:{x:0,y:0,width:340,height:90}});
 await b.close(); })();
