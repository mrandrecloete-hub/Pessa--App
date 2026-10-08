// End to end: the real handlers and the real database layer against a throw away PostgreSQL, with the WhatsApp and SMS providers faked.
import postgres from 'postgres';
import { startPg, BIN } from './pg.mjs';
import { makeDb } from '../supabase/functions/_shared/db.mjs';
import * as np from '../supabase/functions/_shared/nampromo.mjs';
if(!BIN){ console.log('SKIP no PostgreSQL binaries found'); process.exit(0); }
let fail = 0; const ck = (n, c) => { console.log((c ? '  ok   ' : '  FAIL ') + n); if(!c) fail++; };
const pg = startPg('55442'); if(!pg.migrated){ console.log(pg.migrateError); pg.stop(); process.exit(1); }
const sql = postgres({ path:pg.socket, user:'postgres', database:'np', max:1, onnotice:() => {} });
const db = makeDb(sql);
let clock = Date.parse('2026-10-12T10:00:00+02:00'); // a Monday, 10:00 in Namibia
const sent = []; let code = '';
const ENV = { PEPPER:'pep', DISPATCH_KEY:'secret-key', WHATSAPP_TOKEN:'wt', WHATSAPP_PHONE_ID:'123', SMS_API_URL:'https://sms.example/send', SMS_API_KEY:'sk' };
const mk = (env = ENV) => ({ db, now:() => clock, env, randomCode:() => 123456, fetch:async (url, o) => { sent.push({ url, o, body:JSON.parse(o.body) }); return { ok:true, status:200 }; } });
const D = mk();
const addPromo = (shop, title, cat, reg, sale, key = null) => sql`insert into public.promotions(shop_id,title,product_key,category,regular_price,sale_price,created_at,expires_at,status) values (${shop},${title},${key},${cat},${reg},${sale},${new Date(clock + 60e3).toISOString()},${new Date(Date.now() + 5 * 86400e3).toISOString()},'published')`;
const good = { fullName:'Anna Shikongo', email:'Anna@Example.com', cellphone:'081 123 4567', whatsapp:true, sms:true, email_opt_in:false, consent:true, town:'Windhoek', categories:['Food and groceries'] };
try{
  let r = await np.handleSubscribe({ ...good, fullName:'Anna', cellphone:'12345', consent:false }, D);
  ck('a bad sign up is refused with each problem named', r.status === 400 && r.body.fields.fullName && r.body.fields.cellphone && r.body.fields.consent);
  ck('nothing is stored or sent for a bad sign up', sent.length === 0 && Number((await sql`select count(*) from public.subscribers`)[0].count) === 0);
  r = await np.handleSubscribe(good, D);
  ck('a good sign up sends a code on WhatsApp', r.status === 200 && r.body.via === 'whatsapp' && sent.length === 1 && /graph\.facebook\.com\/v20\.0\/123\/messages/.test(sent[0].url) && sent[0].body.to === '264811234567');
  ck('the code text is in the template message', /NamPromo code: 123456/.test(sent[0].body.template.components[0].parameters[0].text));
  const sub = (await sql`select * from public.subscribers`)[0];
  ck('the number is stored as +264 and the email in lower case', sub.cellphone === '+264811234567' && sub.email === 'anna@example.com' && sub.verified_at === null);
  ck('the code is stored as a hash, not as text', /^[0-9a-f]{64}$/.test(sub.verify_hash));
  ck('no deal can be sent before the number is confirmed', (await np.handleDispatch({ key:'secret-key' }, D)).body.digests === 0);
  r = await np.handleVerify({ cellphone:'0811234567', code:'000000' }, D); ck('a wrong code is refused', r.status === 400 && r.body.error === 'wrong_code');
  for(let i = 0; i < 4; i++) await np.handleVerify({ cellphone:'0811234567', code:'000000' }, D);
  r = await np.handleVerify({ cellphone:'0811234567', code:'123456' }, D); ck('after 5 wrong tries even the right code is refused', r.status === 429);
  await sql`update public.subscribers set verify_attempts = 0`;
  clock += 11 * 60e3; r = await np.handleVerify({ cellphone:'0811234567', code:'123456' }, D); ck('an old code has expired', r.body.error === 'expired'); clock -= 11 * 60e3;
  r = await np.handleVerify({ cellphone:'0811234567', code:'123456' }, D); ck('the right code confirms the number', r.status === 200 && r.body.channels.join() === 'whatsapp,sms');
  ck('consent is recorded per channel with the wording', Number((await sql`select count(*) from public.consents where wording like '%I can stop at any time%' and withdrawn_at is null`)[0].count) === 2);
  sent.length = 0; r = await np.handleSubscribe(good, D);
  ck('signing up again with a confirmed number changes nothing and sends nothing', r.status === 200 && r.body.sent === false && sent.length === 0);
  // a verified shop with a published special in Windhoek
  await sql`insert into auth.users(id, email) values ('11111111-1111-1111-1111-111111111111', 'o@x.com')`;
  const shop = (await sql`insert into public.shops(owner_id,name,category,town,address,contact_name,contact_email,contact_phone,status) values ('11111111-1111-1111-1111-111111111111','Oshana Foods','Food and groceries','Windhoek','1 Main','O','o@x.com','+264811110000','verified') returning id`)[0].id;
  await addPromo(shop, 'Maize meal 10 kg', 'Food and groceries', 125, 89, 'maize');
  await addPromo(shop, 'Paint 20 L', 'Building and hardware', 900, 800);
  sent.length = 0;
  r = await np.handleDispatch({ key:'wrong' }, D); ck('the daily job refuses a wrong key', r.status === 401);
  clock = Date.parse('2026-10-12T22:00:00+02:00'); r = await np.handleDispatch({ key:'secret-key' }, D);
  ck('at night deals are queued but held back', r.body.digests === 1 && r.body.sent === 0 && r.body.held === 2 && sent.length === 0);
  clock = Date.parse('2026-10-13T09:00:00+02:00'); r = await np.handleDispatch({ key:'secret-key' }, D);
  ck('in the morning the digest goes out on both ticked channels', r.body.sent === 2 && sent.length === 2 && sent.some(x => /graph\.facebook/.test(x.url)) && sent.some(x => /sms\.example/.test(x.url)));
  const smsMsg = sent.find(x => /sms\.example/.test(x.url)).body; ck('the SMS is for the right number and lists only categories the person chose, with STOP', smsMsg.to === '+264811234567' && /Maize meal 10 kg N\$89\.00 at Oshana Foods \(29% off\)/.test(smsMsg.message) && !/Paint/.test(smsMsg.message) && /Reply STOP/.test(smsMsg.message));
  sent.length = 0; r = await np.handleDispatch({ key:'secret-key' }, D); ck('running it again sends nothing twice', sent.length === 0 && r.body.sent === 0);
  // price alert for a signed in shopper
  await sql`insert into auth.users(id, email) values ('22222222-2222-2222-2222-222222222222', 'a@x.com')`;
  await sql`update public.subscribers set user_id = '22222222-2222-2222-2222-222222222222'`;
  await sql`insert into public.price_watches(user_id, product_key, town, target_price) values ('22222222-2222-2222-2222-222222222222','maize','Windhoek',90)`;
  r = await np.handleDispatch({ key:'secret-key' }, D);
  ck('a reached price alert is sent on both channels', r.body.alerts === 2 && sent.length === 2 && sent.every(x => /Price alert: Maize meal 10 kg is N\$89\.00/.test(x.body.message || x.body.template.components[0].parameters[0].text)));
  // providers not set up
  clock = Date.parse('2026-10-14T09:00:00+02:00'); sent.length = 0; await addPromo(shop, 'Sugar 2 kg', 'Food and groceries', 60, 40);
  r = await np.handleDispatch({ key:'secret-key' }, mk({ DISPATCH_KEY:'secret-key', PEPPER:'pep' }));
  ck('with no provider keys, messages are marked blocked and nothing is sent', r.body.blocked === 2 && sent.length === 0);
  // STOP
  sent.length = 0; r = await np.handleInbound({ from:'264811234567', text:'  stop ', channel:'whatsapp' }, D);
  const after = (await sql`select * from public.subscribers`)[0];
  ck('STOP withdraws every consent at once', after.stopped_at && !after.whatsapp_opt_in && !after.sms_opt_in && Number((await sql`select count(*) from public.consents where withdrawn_at is null`)[0].count) === 0);
  ck('they get one confirmation message', sent.length === 1 && /not get any more/.test(sent[0].body.template.components[0].parameters[0].text));
  clock = Date.parse('2026-10-15T09:00:00+02:00'); await addPromo(shop, 'Rice 2 kg', 'Food and groceries', 60, 40); sent.length = 0; r = await np.handleDispatch({ key:'secret-key' }, D);
  ck('after STOP nothing more is sent to them', sent.length === 0 && r.body.digests === 0);
  ck('other words do not stop anyone', (await np.handleInbound({ from:'264811234567', text:'please do not stop the deals', channel:'sms' }, D)).body.action === 'none');
  // too many codes
  const g2 = { ...good, cellphone:'085 222 3333', email:'b@x.com' }; r = 0; clock = Date.now();
  for(let i = 0; i < 4; i++){ clock += 1000; r = await np.handleSubscribe(g2, D); }
  ck('no more than 3 codes an hour for one number', r.status === 429);
  ck('the webhook reader finds messages in a WhatsApp payload', np.parseInbound({ entry:[{ changes:[{ value:{ messages:[{ from:'264811234567', text:{ body:'STOP' } }] } }] }] })[0].text === 'STOP');
}catch(e){ console.log('ERROR', e.stack); fail++; }
finally{ await sql.end(); pg.stop(); }
console.log(fail ? 'FAILED ' + fail : 'ALL OK'); process.exit(fail ? 1 : 0);
