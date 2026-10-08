// Developer panel login against a real PostgreSQL: master login, helpers, token signing, lockout, audit, and locked tables.
import postgres from 'postgres';
import { generateKeyPairSync, pbkdf2Sync, randomBytes } from 'node:crypto';
import { startPg, BIN } from './pg.mjs';
import { makeDb } from '../supabase/functions/_shared/db.mjs';
import { handleDev, verifyToken, signToken } from '../supabase/functions/_shared/dev.mjs';
if(!BIN){ console.log('SKIP no PostgreSQL binaries found'); process.exit(0); }
let fail = 0; const ck = (n, c) => { console.log((c ? '  ok   ' : '  FAIL ') + n); if(!c) fail++; };
const pg = startPg('55451'); if(!pg.migrated){ console.log(pg.migrateError); pg.stop(); process.exit(1); }
const sql = postgres({ path:pg.socket, user:'postgres', database:'pp', max:1, onnotice:() => {} });
const db = makeDb(sql), { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve:'P-256' });
const privJwk = privateKey.export({ format:'jwk' }), pubJwk = publicKey.export({ format:'jwk' });
let clock = Date.parse('2026-10-12T10:00:00Z');
const D = { db, now:() => clock, privJwk, pubJwk, randomHex:(n) => randomBytes(n).toString('hex') };
const login = (u, p, ip = '1.1.1.1') => handleDev({ action:'login', body:{ username:u, password:p }, ip }, D);
try{
  // the same recipe tools/make_master.mjs uses
  const salt = randomBytes(16).toString('hex'), hash = pbkdf2Sync('boss@example.com\nlong-test-password-1', Buffer.from(salt, 'hex'), 210000, 32, 'sha256').toString('hex');
  await sql`insert into public.dev_users (username, name, role, salt, hash) values ('boss@example.com', 'Boss', 'master', ${salt}, ${hash})`;
  let r = await login('nobody@example.com', 'long-test-password-1'); ck('an unknown username is refused', r.status === 401);
  r = await login('boss@example.com', 'wrong-password-123'); ck('a wrong password is refused', r.status === 401 && !r.body.token);
  r = await login('  Boss@Example.com ', 'long-test-password-1'); const master = r.body.token;
  ck('the right login (username not case sensitive) gives a token', r.status === 200 && r.body.role === 'master' && /^PDEV1\./.test(master));
  const pl = await verifyToken(pubJwk, master, clock); ck('the token is signed and lasts 8 hours', pl && pl.sub === 'boss@example.com' && pl.exp - Math.floor(clock / 1000) === 8 * 3600);
  ck('the token does not contain the password or its hash', !master.includes('long-test') && !Buffer.from(master.split('.')[1], 'base64url').toString().includes(hash));
  ck('a forged token is rejected', (await verifyToken(pubJwk, master.slice(0, -4) + 'AAAA', clock)) === null && (await verifyToken(pubJwk, 'PDEV1.' + master.split('.')[1] + '.' + master.split('.')[2].split('').reverse().join(''), clock)) === null);
  const other = generateKeyPairSync('ec', { namedCurve:'P-256' }); ck('a token signed with another key is rejected', (await verifyToken(pubJwk, await signToken(other.privateKey.export({ format:'jwk' }), { sub:'boss@example.com', role:'master', exp:Math.floor(clock / 1000) + 3600 }), clock)) === null);
  ck('an old token is rejected', (await verifyToken(pubJwk, master, clock + 9 * 3600e3)) === null);
  ck('check confirms a good token', (await handleDev({ action:'check', body:{ token:master } }, D)).status === 200);
  // helpers
  r = await handleDev({ action:'add', body:{ token:master, username:'Helper@Example.com', name:'Helper', password:'short' } }, D); ck('a short helper password is refused', r.status === 400);
  r = await handleDev({ action:'add', body:{ token:master, username:'Helper@Example.com', name:'Helper', password:'helper-password-2026' } }, D); ck('the master can give a helper access', r.status === 200);
  r = await handleDev({ action:'add', body:{ token:master, username:'helper@example.com', password:'helper-password-2026' } }, D); ck('the same username twice is refused', r.status === 409);
  const row = (await sql`select * from public.dev_users where username = 'helper@example.com'`)[0]; ck('only a salted hash is stored', row && row.role === 'helper' && /^[0-9a-f]{64}$/.test(row.hash) && !JSON.stringify(row).includes('helper-password'));
  r = await login('helper@example.com', 'helper-password-2026'); const helper = r.body.token; ck('the helper can log in', r.status === 200 && r.body.role === 'helper');
  ck('a helper cannot list or add people', (await handleDev({ action:'list', body:{ token:helper } }, D)).status === 403 && (await handleDev({ action:'add', body:{ token:helper, username:'x@example.com', password:'another-long-password' } }, D)).status === 403);
  r = await handleDev({ action:'list', body:{ token:master } }, D); ck('the master sees the list without any hashes', r.status === 200 && r.body.users.length === 2 && !JSON.stringify(r.body).includes('hash') && !JSON.stringify(r.body).includes('salt'));
  r = await handleDev({ action:'remove', body:{ token:master, username:'boss@example.com' } }, D); ck('the master cannot be removed', r.status === 400);
  r = await handleDev({ action:'remove', body:{ token:master, username:'helper@example.com' } }, D); ck('the master can remove a helper', r.status === 200);
  ck('a removed helper cannot log in and the old token stops working', (await login('helper@example.com', 'helper-password-2026')).status === 401 && (await handleDev({ action:'check', body:{ token:helper } }, D)).status === 401);
  // lockout
  for(let i = 0; i < 5; i++) await login('boss@example.com', 'bad-guess-' + i, '9.9.9.9');
  r = await login('boss@example.com', 'long-test-password-1', '8.8.8.8'); ck('five wrong tries lock the username, even for the right password', r.status === 429 && r.body.minutes >= 1);
  clock += 6 * 60e3; r = await login('boss@example.com', 'long-test-password-1', '7.7.7.7'); ck('the lock ends after 5 minutes', r.status === 200);
  for(let i = 0; i < 5; i++) await login('u' + i + '@example.com', 'bad-guess', '6.6.6.6');
  r = await login('boss@example.com', 'long-test-password-1', '6.6.6.6'); ck('five wrong tries from one address lock that address', r.status === 429);
  ck('every login is in the audit trail without passwords', Number((await sql`select count(*) from public.dev_audit where action = 'login'`)[0].count) >= 10 && !JSON.stringify(await sql`select * from public.dev_audit`).includes('long-test'));
  // locked tables
  const anon = pg.psql(`set role anon; select * from public.dev_users`); ck('the public key cannot read the login table', anon.status !== 0);
  ck('nor the shops, sends or audit tables', pg.psql(`set role authenticated; select * from public.shops`).status !== 0 && pg.psql(`set role anon; select * from public.sends`).status !== 0 && pg.psql(`set role anon; select * from public.dev_audit`).status !== 0);
}catch(e){ console.log('ERROR', e.stack); fail++; }
finally{ await sql.end(); pg.stop(); }
console.log(fail ? 'FAILED ' + fail : 'ALL OK'); process.exit(fail ? 1 : 0);
