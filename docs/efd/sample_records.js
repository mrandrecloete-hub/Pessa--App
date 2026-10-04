/* Prints sample outbox records (PENDING and CLEARED) as JSON. Used by test_sql.py. */
const crypto=require('crypto'),efd=require('./pesa-efd.js'),{createMockNamra}=require('./mock-namra.js');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const m=new Map(),st={get:k=>Promise.resolve(m.has(k)?JSON.parse(m.get(k)):null),put:(k,v)=>(m.set(k,JSON.stringify(v)),Promise.resolve()),list:p=>Promise.resolve([...m].filter(([k])=>k.startsWith(p)).map(([,v])=>JSON.parse(v))),batch:o=>(o.forEach(x=>m.set(x.put[0],JSON.stringify(x.put[1]))),Promise.resolve())};
const S={tin:'1234567890',vatNumber:'VAT-99',name:'Demo Shop',branchCode:'WDH01',terminalId:'T01'};
(async()=>{const ob=efd.createFiscalOutbox({storage:st,sha256:sha});
const mk=(items,t)=>({items,paymentMethod:'cash',customerName:'Walk-in',createdAt:'2026-10-04T08:30:00.000Z',total:t});
await ob.enqueueSale(mk([{productId:'a',name:'Soap',qty:3,unitPrice:11.5},{productId:'b',name:'Maize',qty:2,unitPrice:40,taxCategory:'ZERO_RATED'},{productId:'c',name:'Book',qty:1,unitPrice:100,taxCategory:'EXEMPT'}],214.5),'s1',S);
await ob.enqueueSale(mk([{productId:'a',name:'Soap',qty:0.35,unitPrice:89.99}]),'s2',S);
await ob.enqueueSale(mk([{productId:'a',name:'Bread',qty:2,unitPrice:12.5}]),'s3',S);
const mock=createMockNamra();const w=efd.createTaxSyncWorker({storage:st,transport:mock.transport,config:{verifyClearance:mock.verify}});
const pending=(await st.list('fiscalOutbox/')).map(r=>JSON.parse(JSON.stringify(r)));
await w.tick();const cleared=(await st.list('fiscalOutbox/'));
console.log(JSON.stringify({pending,cleared}));})();
