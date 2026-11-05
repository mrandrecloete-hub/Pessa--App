// Node test of the Pesa Shop host logic. Run: node tests/shop_srv_t.mjs
import { handleShop, cleanRows, normPhone, SLUG_RE, LIMITS } from '../supabase/functions/_shared/shophandler.mjs';
import { createHash } from 'node:crypto';
let fails = 0; const ok = (c, m) => { if(!c){ fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const sha256 = async t => createHash('sha256').update(t).digest('hex');
function mk(over = {}){
  const store = new Map(); let t = 1700000000000;
  const db = { get: async s => store.get(s) || null, put: async r => { store.set(r.slug, JSON.parse(JSON.stringify(r))); }, remove: async s => { store.delete(s); }, list: async () => [...store.values()],
    newFromIpSince: async (ip, since) => [...store.values()].filter(r => r.ip_hash === ip && r.created_at >= since).length };
  const deps = Object.assign({ db, now: () => t, sha256, ipHash: 'ip1', adminToken: 'adm-secret', requireLicence: false, verifyLicence: async () => null }, over);
  return { store, deps, tick: s => { t += s * 1000; }, call: (action, method, body, query = {}, headers = {}) => handleShop({ method, action, query, headers, body }, deps) };
}
const TOKEN = 'a'.repeat(40), TOKEN2 = 'b'.repeat(40);
const rows = [{ id: 'p1', n: 'Milk 1L', c: 'Dairy', p: 22, u: 'bottle', s: 2, m: 50 }, { id: 'p2', n: 'Rice 2kg', c: 'Groceries', p: 45, u: '', s: 1, m: 3 }];
const pub = (o = {}) => Object.assign({ slug: 'mama-ndapewa', token: TOKEN, shop: 'Mama Ndapewa Shop', phone: '081 234 5678', intro: 'Fresh daily', how: 'Collect', rows }, o);

ok(normPhone('081 234 5678') === '264812345678' && normPhone('+264 81 234 5678') === '264812345678', 'phone numbers are made international');
ok(SLUG_RE.test('mama-ndapewa') && SLUG_RE.test('abc') && !SLUG_RE.test('ab') && !SLUG_RE.test('-abc') && !SLUG_RE.test('a--b') && !SLUG_RE.test('Abc') && !SLUG_RE.test('a b c') && !SLUG_RE.test('x'.repeat(41)), 'shop names follow the rules');
let h = mk();
let r = await h.call('publish', 'POST', pub());
ok(r.status === 200 && r.body.ok && r.body.products === 2, 'a shop publishes');
r = await h.call('get', 'GET', null, { s: 'Mama-Ndapewa' });
ok(r.status === 200 && r.body.shop === 'Mama Ndapewa Shop' && r.body.phone === '264812345678' && r.body.rows.length === 2 && r.headers['cache-control'], 'anyone can read it, with the name in any case');
ok(!('token_hash' in r.body) && !('ip_hash' in r.body) && !('ref' in r.body) && !JSON.stringify(r.body).includes(TOKEN), 'the public data holds no token, hash or network address');
ok((await h.call('get', 'GET', null, { s: 'nobody-here' })).status === 404, 'an unknown page is 404');
h.tick(60);
ok((await h.call('publish', 'POST', pub({ token: TOKEN2 }))).status === 403, 'another token cannot take over a name');
r = await h.call('publish', 'POST', pub({ rows: [rows[0]], shop: 'Mama Ndapewa Shop 2' }));
ok(r.status === 200 && h.store.get('mama-ndapewa').rows.length === 1, 'the owner token updates it');
ok((await h.call('publish', 'POST', pub())).status === 429, 'updating twice in a few seconds is refused');
h.tick(60);
ok(h.store.get('mama-ndapewa').token_hash === await sha256(TOKEN) && !JSON.stringify([...h.store.values()]).includes(TOKEN + '"'), 'only the hash of the token is stored');
// bad input
ok((await h.call('publish', 'POST', pub({ slug: 'AB' }))).status === 400, 'a bad name is refused');
ok((await h.call('publish', 'POST', pub({ slug: 'admin', token: TOKEN2 }))).status === 400, 'a reserved name is refused');
ok((await h.call('publish', 'POST', pub({ slug: 'short-token', token: 'abc' }))).status === 400, 'a short token is refused');
ok((await h.call('publish', 'POST', pub({ slug: 'no-phone', phone: '12' }))).status === 400, 'a bad phone number is refused');
ok((await h.call('publish', 'POST', pub({ slug: 'no-name', shop: '   ' }))).status === 400, 'an empty shop name is refused');
ok((await h.call('publish', 'POST', pub({ slug: 'no-rows', rows: [] }))).status === 400, 'no products is refused');
ok((await h.call('publish', 'POST', pub({ slug: 'too-many', rows: Array.from({ length: LIMITS.rows + 1 }, (_, i) => ({ id: 'x' + i, n: 'n', p: 1 })) }))).status === 413, 'too many products is refused');
ok((await h.call('publish', 'POST', pub({ slug: 'too-big', intro: 'x'.repeat(800000) }))).status === 413, 'an oversize request is refused');
ok((await h.call('get', 'POST', null, { s: 'mama-ndapewa' })).status === 405, 'get is read only');
// cleaning
const c = cleanRows([{ id: 'ok1', n: '<b>Bread</b>', p: '13.5', s: 9, m: -1 }, { id: 'ok1', n: 'dup', p: 1 }, { id: 'bad id', n: 'x', p: 1 }, { id: 'z', n: 'x', p: 0 }, { id: 'y', n: '', p: 1 }, { id: 'w', n: 'x', p: 1e9 }, null]);
ok(c.rows.length === 1 && c.dropped === 6 && c.rows[0].s === 2 && c.rows[0].m === null && c.rows[0].p === 13.5, 'products are cleaned: duplicates, bad ids, prices and stock are fixed or dropped');
ok(c.rows[0].n === '<b>Bread</b>', 'text is kept as plain text, the page escapes it when drawing');
// abuse limits
const h2 = mk();
for(let i = 0; i < LIMITS.newShopsPerIpPerDay; i++) ok((await h2.call('publish', 'POST', pub({ slug: 'shop-' + i + 'a' }))).status === 200, 'new shop ' + (i + 1) + ' from one address is allowed');
ok((await h2.call('publish', 'POST', pub({ slug: 'shop-extra' }))).status === 429, 'a fourth new shop in a day from one address is refused');
h2.tick(86400 + 5);
ok((await h2.call('publish', 'POST', pub({ slug: 'shop-extra' }))).status === 200, 'it is allowed again after a day');
// unpublish and remove
const h3 = mk(); await h3.call('publish', 'POST', pub());
ok((await h3.call('unpublish', 'POST', { slug: 'mama-ndapewa', token: TOKEN2 })).status === 403, 'only the owner can hide a page');
ok((await h3.call('unpublish', 'POST', { slug: 'mama-ndapewa', token: TOKEN })).status === 200 && (await h3.call('get', 'GET', null, { s: 'mama-ndapewa' })).status === 404, 'the owner hides the page');
h3.tick(60); ok((await h3.call('publish', 'POST', pub())).status === 200 && (await h3.call('get', 'GET', null, { s: 'mama-ndapewa' })).status === 200, 'publishing again shows it');
ok((await h3.call('remove', 'POST', { slug: 'mama-ndapewa', token: TOKEN })).body.removed && !h3.store.has('mama-ndapewa'), 'the owner removes the page');
// admin takedown
const h4 = mk(); await h4.call('publish', 'POST', pub());
ok((await h4.call('list', 'GET', null, {}, {})).status === 401 && (await h4.call('disable', 'POST', { slug: 'mama-ndapewa' }, {}, { 'x-admin-token': 'wrong' })).status === 401, 'admin actions need the admin token');
ok((await h4.call('list', 'GET', null, {}, { 'x-admin-token': 'adm-secret' })).body.shops.length === 1, 'the admin lists pages');
ok((await h4.call('disable', 'POST', { slug: 'mama-ndapewa' }, {}, { 'x-admin-token': 'adm-secret' })).body.disabled === true && (await h4.call('get', 'GET', null, { s: 'mama-ndapewa' })).status === 404, 'a disabled page is gone for everyone');
h4.tick(60); ok((await h4.call('publish', 'POST', pub())).status === 403, 'the owner cannot republish a disabled page');
ok((await h4.call('enable', 'POST', { slug: 'mama-ndapewa' }, {}, { 'x-admin-token': 'adm-secret' })).body.disabled === false, 'the admin can enable it again');
const h5 = mk({ adminToken: '' }); ok((await h5.call('list', 'GET', null, {}, { 'x-admin-token': '' })).status === 401, 'with no admin token set, admin actions stay closed');
// licence required
const h6 = mk({ requireLicence: true, verifyLicence: async k => k === 'GOOD' ? { ref: 'PESA-AAAA-BBBB', exp: '2027-01-01' } : (k === 'OLD' ? { ref: 'PESA-AAAA-CCCC', exp: '2020-01-01' } : null) });
ok((await h6.call('publish', 'POST', pub())).status === 402, 'with licence keys on, no key is refused');
ok((await h6.call('publish', 'POST', pub({ licence: 'OLD' }))).status === 402, 'an expired licence is refused');
r = await h6.call('publish', 'POST', pub({ licence: 'GOOD' }));
ok(r.status === 200 && h6.store.get('mama-ndapewa').ref === 'PESA-AAAA-BBBB', 'a valid licence publishes and its reference is kept');
ok((await h.call('get', 'GET', null, { s: 'mama-ndapewa' })).status === 200, 'reading never needs a licence');
ok((await h.call('nothing', 'POST', {})).status === 400, 'unknown actions are refused');
console.log(fails ? fails + ' FAILED' : 'ALL OK'); process.exit(fails ? 1 : 0);
