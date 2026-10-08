// Central sending service against a real PostgreSQL, with the WhatsApp and SMS providers faked.
import postgres from 'postgres';
import { createHash, randomBytes } from 'node:crypto';
import { startPg, BIN } from './pg.mjs';
import { makeDb } from '../supabase/functions/_shared/db.mjs';
import { handleSend, handleStop, parseInbound, normalizePhone, dayStartIso } from '../supabase/functions/_shared/send.mjs';
if(!BIN){ console.log('SKIP no PostgreSQL binaries found'); process.exit(0); }
let fail = 0; const ck = (n, c) => { console.log((c ? '  ok   ' : '  FAIL ') + n); if(!c) fail++; };
const pg = startPg('55452'); if(!pg.migrated){ console.log(pg.migrateError); pg.stop(); process.exit(1); }
const sql = postgres({ path:pg.socket, user:'postgres', database:'pp', max:1, onnotice:() => {} });
const db = makeDb(sql); let clock = Date.parse('2026-10-12T10:00:00+02:00'); const calls = [];
const ENV = { WHATSAPP_TOKEN:'wt', WHATSAPP_PHONE_ID:'555', SMS_API_URL:'https://sms.example/send', SMS_API_KEY:'sk' };
const D = (env = ENV, ok = true) => ({ db, now:() => clock, env, fetch:async (u, o) => { calls.push({ u, body:JSON.parse(o.body), auth:o.headers.authorization }); return { ok, status:ok ? 200 : 500 }; } });
const key = 'pesa_' + randomBytes(24).toString('hex'), hash = createHash('sha256').update(key).digest('hex');
const send = (extra = {}, d = D()) => handleSend({ body:{ apiKey:key, channel:'sms', to:'081 123 4567', text:'Your order is ready', consent:true, ...extra } }, d);
try{
  await sql`insert into public.shops (name, owner_email, api_key_hash, plan, daily_limit) values ('Test Shop', 'o@x.com', ${hash}, 'starter', 3)`;
  ck('numbers are read the Namibian way', normalizePhone('081 123 4567') === '+264811234567' && normalizePhone('+264 85 222 3333') === '+264852223333' && normalizePhone('12345') === null);
  let r = await send({ apiKey:'pesa_' + 'a'.repeat(48) }); ck('a wrong key is refused', r.status === 401 && calls.length === 0);
  r = await send({ apiKey:'short' }); ck('a missing key is refused', r.status === 401);
  r = await send({ consent:false }); ck('it refuses unless the shop says the customer agreed', r.status === 400 && r.body.error === 'consent_needed' && calls.length === 0);
  r = await send({ to:'123' }); ck('a bad number is refused', r.status === 400);
  r = await send({ text:'x'.repeat(601) }); ck('a very long text is refused', r.status === 400);
  r = await send(); ck('a good SMS is sent through the gateway with the key', r.status === 200 && calls.length === 1 && calls[0].u === 'https://sms.example/send' && calls[0].body.to === '+264811234567' && calls[0].auth === 'Bearer sk');
  ck('STOP wording is added to every message', /Reply STOP to stop\.$/.test(calls[0].body.message));
  r = await send({ channel:'whatsapp' }); ck('a WhatsApp message goes through the template', r.status === 200 && /graph\.facebook\.com\/v20\.0\/555\/messages/.test(calls[1].u) && calls[1].body.to === '264811234567' && calls[1].body.type === 'template');
  r = await send(); ck('the shop is told how many are left today', r.status === 200 && r.body.left === 0);
  r = await send(); ck('the daily limit stops a fourth message', r.status === 429 && r.body.limit === 3 && calls.length === 3);
  clock += 24 * 3600e3; r = await send(); ck('the limit starts again the next day', r.status === 200);
  clock += 3600e3;
  // STOP
  const parsed = parseInbound({ entry:[{ changes:[{ value:{ messages:[{ from:'264811234567', text:{ body:' Stop ' } }, { from:'264852223333', text:{ body:'thanks for the deal' } }] } }] }] });
  r = await handleStop(parsed, D()); ck('a customer replying STOP is remembered, other replies are not', r.body.stopped === 1);
  const n0 = calls.length; r = await send(); ck('after STOP no shop can message that number', r.status === 403 && r.body.error === 'suppressed' && calls.length === n0);
  r = await send({ to:'085 222 3333' }); ck('other customers are still reachable', r.status === 200);
  await sql`insert into public.shops (name, api_key_hash, plan, daily_limit, active) values ('Other', ${createHash('sha256').update('pesa_' + 'b'.repeat(48)).digest('hex')}, 'starter', 50, false)`;
  r = await send({ apiKey:'pesa_' + 'b'.repeat(48) }); ck('a switched off shop cannot send', r.status === 401);
  // providers
  r = await send({ to:'085 999 8888' }, D({})); ck('with no provider keys nothing is sent and it says so', r.status === 502 && /not set up/.test(r.body.message));
  r = await send({ to:'085 999 7777' }, D(ENV, false)); ck('a provider failure is reported, not hidden', r.status === 502);
  const log = await sql`select status, count(*)::int as n from public.sends group by status order by status`; ck('every attempt is logged with its outcome', log.some(x => x.status === 'sent') && log.some(x => x.status === 'suppressed') && log.some(x => x.status === 'blocked') && log.some(x => x.status === 'failed'));
  ck('the key itself is never stored', !JSON.stringify(await sql`select * from public.shops`).includes(key));
  ck('day boundaries follow Namibia time', dayStartIso(Date.parse('2026-10-12T00:30:00+02:00')) === '2026-10-11T22:00:00.000Z');
}catch(e){ console.log('ERROR', e.stack); fail++; }
finally{ await sql.end(); pg.stop(); }
console.log(fail ? 'FAILED ' + fail : 'ALL OK'); process.exit(fail ? 1 : 0);
