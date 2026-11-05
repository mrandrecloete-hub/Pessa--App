// Pesa Shop live pages end to end: the app publishes to the page service (the real handler, behind a stand in web address), a customer opens the live page,
// orders on WhatsApp, the shop reads the order, stock changes are sent on, and the page can be hidden.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
let fail = 0; const ck = (n, c, x) => { console.log((c ? '  ok   ' : '  FAIL ') + n + (c ? '' : '  -> ' + JSON.stringify(x).slice(0, 400))); if (!c) fail++; };
(async () => {
  const { handleShop } = await import('../../supabase/functions/_shared/shophandler.mjs');
  const { createHash } = require('crypto');
  const store = new Map(); let offset = 0;
  const db = { get: async s => store.get(s) || null, put: async r => { store.set(r.slug, JSON.parse(JSON.stringify(r))); }, remove: async s => { store.delete(s); }, list: async () => [...store.values()], newFromIpSince: async () => 0 };
  const deps = { db, now: () => Date.now() + offset, sha256: async t => createHash('sha256').update(t).digest('hex'), ipHash: 'ip', adminToken: 'a', requireLicence: false, verifyLicence: async () => null };
  const calls = [];
  const api = async (route) => {
    const req = route.request(), u = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS' } });
    let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
    const out = await handleShop({ method: req.method(), action: u.searchParams.get('a') || '', query: Object.fromEntries(u.searchParams), headers: {}, body }, deps);
    calls.push(u.searchParams.get('a'));
    return route.fulfill({ status: out.status, contentType: 'application/json', headers: Object.assign({ 'access-control-allow-origin': '*' }, out.headers), body: JSON.stringify(out.body) });
  };
  const viewerSrc = fs.readFileSync(path.join(__dirname, '../../tools/shop_page.js'), 'utf8');
  const viewerHtml = new Function(viewerSrc + '\nreturn shopPageHtml;')()(null, 'https://shop.test/fn');
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: 'block' });
  await ctx.route('https://shop.test/fn**', api);
  await ctx.route('https://viewer.test/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: viewerHtml }));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await require('./biz_boot.js')(p, { name: 'Mama Ndapewa Shop' });
  await p.evaluate(async () => { const r = window.__t.refs.products;
    await r.doc('p1').set({ name: 'Milk 1L', category: 'Dairy', sellPrice: 22, costPrice: 15, stockQty: 50 });
    await r.doc('p3').set({ name: 'Rice 2kg', category: 'Groceries', sellPrice: 45, costPrice: 38, stockQty: 3, lowStock: 5 }); });
  await p.waitForTimeout(300);
  ck('the real page service address is built in', await p.evaluate(() => /^https:\/\/[a-z0-9]+\.supabase\.co\/functions\/v1\/shop$/.test(window.__t.SHOP_API)));
  await p.evaluate(() => window.__t.setShop({ api: '' }));
  await p.evaluate(() => window.__t.openShopSheet()); await p.waitForSelector('#psFile');
  ck('with no page service address it says live pages are off', /not switched on/.test(await p.innerText('#modalRoot')) && !(await p.$('#psPub')));
  await p.evaluate(() => window.__t.closeModal());
  await p.evaluate(() => window.__t.setShop({ api: 'https://shop.test/fn', viewer: 'https://viewer.test/shop.html' }));
  await p.evaluate(() => window.__t.openShopSheet()); await p.waitForSelector('#psPub');
  ck('the live page section appears with a suggested name', (await p.inputValue('#psSlug')) === 'mama-ndapewa-shop', await p.inputValue('#psSlug'));
  await p.click('#psPub'); await p.waitForTimeout(400);
  ck('publishing without a WhatsApp number is refused and nothing is sent', !calls.includes('publish'));
  await p.fill('#psPhone', '0812345678'); await p.click('#psPub'); await p.waitForSelector('#psLinkCopy', { timeout: 8000 });
  const st = await p.evaluate(() => { const c = window.__t.shopCfg(); return { slug: c.slug, tokenLen: c.token.length, published: c.published, sig: !!c.sig }; });
  ck('the page is live and the app keeps its private token', st.slug === 'mama-ndapewa-shop' && st.tokenLen === 64 && st.published && st.sig, st);
  ck('the link is shown', /viewer\.test\/shop\.html\?s=mama-ndapewa-shop/.test(await p.innerText('#modalRoot')));
  const row = store.get('mama-ndapewa-shop');
  ck('the service stored plain products, a hash and no cost prices', row && row.rows.length === 2 && !JSON.stringify(row).includes('costPrice') && !JSON.stringify(row).includes('"stockQty"') && row.token_hash.length === 64 && row.phone === '264812345678', row);
  // a customer opens the live page
  const cp = await ctx.newPage(); const cerrs = []; cp.on('pageerror', e => cerrs.push(e.message));
  await cp.goto('https://viewer.test/shop.html?s=mama-ndapewa-shop'); await cp.waitForSelector('.it', { timeout: 8000 });
  await cp.evaluate(() => { window.__opened = []; window.open = u => { window.__opened.push(u); return null; }; });
  ck('the customer sees the shop name and the products', /Mama Ndapewa Shop/.test(await cp.innerText('#sn')) && (await cp.locator('.it').count()) === 2);
  await cp.locator('.it').nth(0).locator('button[data-d="1"]').click(); await cp.locator('.it').nth(0).locator('button[data-d="1"]').click();
  await cp.click('#bt'); await cp.fill('#nm', 'Anna'); await cp.fill('#ph', '0811111111'); await cp.click('#go');
  const url = await cp.evaluate(() => window.__opened[0]);
  ck('the order goes to the shop WhatsApp number', /^https:\/\/wa\.me\/264812345678\?text=/.test(url), url);
  const msg = decodeURIComponent(url.split('?text=')[1]);
  const got = await p.evaluate(m => { const T = window.__t; const mt = T.shopMatchOrder(T.shopParseOrder(m)); return mt.items.map(x => x.p.name + ' x' + x.qty).join(); }, msg);
  ck('the shop reads the live order back', got === 'Milk 1L x2', got);
  ck('the live page had no errors', cerrs.length === 0, cerrs);
  // stock and price changes are sent on by themselves, and only when something changed
  const before = calls.filter(c => c === 'publish').length;
  await p.evaluate(() => window.__t.shopAutoTick()); await p.waitForTimeout(400);
  ck('nothing changed so nothing is sent', calls.filter(c => c === 'publish').length === before);
  offset += 120000;
  await p.evaluate(async () => { await window.__t.refs.products.doc('p3').update({ stockQty: 0 }); await window.__t.refs.products.doc('p1').update({ sellPrice: 24 }); });
  await p.waitForTimeout(300); await p.evaluate(() => window.__t.shopAutoTick()); await p.waitForTimeout(600);
  const r2 = store.get('mama-ndapewa-shop').rows;
  ck('a price change and an item that ran out are published (the sold out item leaves the page)', calls.filter(c => c === 'publish').length === before + 1 && r2.find(x => x.n === 'Milk 1L').p === 24 && !r2.find(x => x.n === 'Rice 2kg'), r2);
  const cp2 = await ctx.newPage(); await cp2.goto('https://viewer.test/shop.html?s=mama-ndapewa-shop'); await cp2.waitForSelector('.it');
  ck('customers now see the new price and no sold out item', /N\$24\.00/.test(await cp2.innerText('#list')) && !/Rice/.test(await cp2.innerText('#list')));
  // another shop cannot take the name
  offset += 120000;
  const clash = await p.evaluate(() => new Promise(res => { const c = window.__t.shopCfg(); window.__t.shopPublish(Object.assign({}, c, { token: 'f'.repeat(64) }), res); }));
  ck('someone else with a different token is refused the name', clash.ok === false && clash.error === 'name_taken', clash);
  ck('and the error reads clearly', /already used/.test(await p.evaluate(() => window.__t.shopErrorText('name_taken'))));
  // hide
  await p.evaluate(() => { window.__t.closeModal(); window.__t.openShopSheet(); }); await p.waitForSelector('#psHide');
  await p.click('#psHide'); await p.waitForSelector('#psPub'); await p.waitForTimeout(300);
  ck('hiding the page makes it unavailable', !(await p.evaluate(() => window.__t.shopCfg().published)) && (await handleShop({ method: 'GET', action: 'get', query: { s: 'mama-ndapewa-shop' }, headers: {}, body: {} }, deps)).status === 404);
  const cp3 = await ctx.newPage(); await cp3.goto('https://viewer.test/shop.html?s=mama-ndapewa-shop'); await cp3.waitForTimeout(800);
  ck('a customer then sees a clear message that names the page', /not found/.test(await cp3.innerText('#sn')) && /mama-ndapewa-shop/.test(await cp3.innerText('#in')), await cp3.innerText('#in'));
  const cp4 = await ctx.newPage(); await cp4.goto('https://viewer.test/shop.html'); await cp4.waitForTimeout(400);
  ck('a link with no shop name says so', /needs a shop name/.test(await cp4.innerText('#sn')));
  ck('no page errors', errs.length === 0, errs);
  await b.close(); console.log(fail ? 'FAILED ' + fail : 'ALL OK'); process.exit(fail ? 1 : 0);
})();
