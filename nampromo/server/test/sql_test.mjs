import { startPg, BIN } from './pg.mjs';
if(!BIN){ console.log('SKIP no PostgreSQL binaries found'); process.exit(0); }
let fail = 0; const ck = (n, c) => { console.log((c ? '  ok   ' : '  FAIL ') + n); if(!c) fail++; };
const pg = startPg('55441'); const psql = (sql, opt = {}) => pg.psql(sql);
const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222', M = '33333333-3333-3333-3333-333333333333';
try{
  ck('migration applies cleanly', pg.migrated); if(!pg.migrated){ console.log(pg.migrateError); throw new Error('schema'); }
  const as = (role, uid, sql) => psql(`set role ${role}; ${uid ? `set request.jwt.claim.sub = '${uid}';` : ''} ${sql}`);
  const ok = (n, x) => ck(n, x.status === 0); const bad = (n, x, re) => ck(n, x.status !== 0 && (!re || re.test(x.stderr)));
  psql(`insert into auth.users(id, email) values ('${A}','a@x.com'),('${B}','b@x.com'),('${M}','m@x.com'); update public.profiles set role='moderator' where id='${M}'`);
  ck('a profile is created for each new user', psql(`select count(*) from public.profiles`).stdout.trim() === '3');
  const shopSql = (st) => `insert into public.shops(owner_id,name,category,town,address,contact_name,contact_email,contact_phone,status) values ('${A}','Oshana Building Supplies','Building and hardware','Oshakati','12 Main Road','Anna','a@x.com','+264811234567','${st}') returning id`;
  bad('a shop cannot be registered already verified', as('authenticated', A, shopSql('verified')));
  const sid = as('authenticated', A, shopSql('pending')).stdout.trim().split('\n')[0]; ck('an owner can register a shop (pending)', /^[0-9a-f-]{36}$/.test(sid));
  bad('a bad cellphone number is refused', as('authenticated', A, shopSql('pending').replace('+264811234567', '0811234567')));
  bad('anonymous users cannot read the shops table (it holds contact details)', as('anon', null, 'select * from public.shops'));
  ok('anonymous users can read the public shop list', as('anon', null, 'select name from public.public_shops'));
  ck('the public shop list shows it as not verified', as('anon', null, `select verified from public.public_shops where id='${sid}'`).stdout.trim() === 'f');
  ck('the public shop list has no contact columns', !/contact/.test(psql(`select column_name from information_schema.columns where table_name='public_shops'`).stdout));
  bad('an owner cannot verify their own shop', as('authenticated', A, `update public.shops set status='verified' where id='${sid}'`), /moderator/);
  ck('another user cannot see or change that shop', as('authenticated', B, `update public.shops set name='x' where id='${sid}' returning id`).stdout.trim() === '');
  bad('a shopper cannot call the moderation function', as('authenticated', B, `select public.moderate_shop('${sid}','verified')`), /Moderators only/);
  const promo = (uid, shop, extra = '') => as('authenticated', uid, `insert into public.promotions(shop_id,title,category,regular_price,sale_price,expires_at,status ${extra ? ',' + extra.split('=')[0] : ''}) values ('${shop}','Cement 50 kg','Building and hardware',150,115, now() + interval '7 days','published' ${extra ? ',' + extra.split('=')[1] : ''}) returning status, source_type`);
  let p = promo(A, sid); ck('an owner of an unchecked shop posts a special: held for review even if they ask for published', p.stdout.trim().split('\n')[0] === 'pending_review|shop');
  ck('held specials are not public', as('anon', null, 'select count(*) from public.public_promotions').stdout.trim() === '0');
  bad('a special must cost less than the normal price', as('authenticated', A, `insert into public.promotions(shop_id,title,category,regular_price,sale_price,expires_at) values ('${sid}','x y','Other',100,120, now() + interval '1 day')`));
  p = promo(B, sid); ck('anyone else can add a community special: always held for review', p.stdout.trim().split('\n')[0] === 'pending_review|community');
  bad('a user cannot bypass the review guard with a setting', as('authenticated', A, `select set_config('np.moderating','1',true); update public.shops set status='verified' where id='${sid}'`), /moderator/);
  ok('a moderator verifies the shop', as('authenticated', M, `select public.moderate_shop('${sid}','verified','Checked registration')`));
  ck('the public list now shows it as verified', as('anon', null, `select verified from public.public_shops where id='${sid}'`).stdout.trim() === 't');
  p = promo(A, sid); ck('a verified shop\'s own specials publish at once', p.stdout.trim().split('\n')[0] === 'published|shop');
  ck('the published special is public', as('anon', null, 'select count(*) from public.public_promotions').stdout.trim() === '1');
  const pend = psql(`select id from public.promotions where source_type='community'`).stdout.trim();
  bad('a shopper cannot publish a special', as('authenticated', B, `select public.moderate_promotion('${pend}','publish')`), /Moderators only/);
  ok('a moderator can publish a community special', as('authenticated', M, `select public.moderate_promotion('${pend}','publish','Seen in store')`));
  ck('two specials are public', as('anon', null, 'select count(*) from public.public_promotions').stdout.trim() === '2');
  psql(`update public.promotions set expires_at = now() - interval '1 hour', starts_at = now() - interval '2 days' where id='${pend}'`);
  ck('an expired special leaves the public list', as('anon', null, 'select count(*) from public.public_promotions').stdout.trim() === '1');
  ck('expire_promotions marks it expired', psql(`select public.expire_promotions()`).stdout.trim() === '1');
  bad('a user cannot make themselves an admin', as('authenticated', B, `update public.profiles set role='admin' where id='${B}'`), /admin can change/);
  bad('anonymous users cannot read subscribers', as('anon', null, 'select * from public.subscribers'));
  bad('shoppers cannot write to the message queue', as('authenticated', B, `insert into public.outbound_messages(subscriber_id,channel,kind,body) select id,'sms','deal','x' from public.subscribers`));
  ok('the service role can write subscribers', as('service_role', null, `insert into public.subscribers(full_name,email,cellphone,sms_opt_in) values ('Anna S','a@x.com','+264811234567',true)`));
  bad('a duplicate cellphone number is refused', as('service_role', null, `insert into public.subscribers(full_name,email,cellphone) values ('Other','o@x.com','+264811234567')`));
  bad('the same message cannot be queued twice', (() => { const sub = psql(`select id from public.subscribers`).stdout.trim(); as('service_role', null, `insert into public.outbound_messages(subscriber_id,channel,kind,body,dedupe_key) values ('${sub}','sms','deal','x','k1')`); return as('service_role', null, `insert into public.outbound_messages(subscriber_id,channel,kind,body,dedupe_key) values ('${sub}','sms','deal','x','k1')`); })());
}catch(e){ console.log('ERROR', e.message); fail++; }
finally{ pg.stop(); }
console.log(fail ? 'FAILED ' + fail : 'ALL OK'); process.exit(fail ? 1 : 0);
