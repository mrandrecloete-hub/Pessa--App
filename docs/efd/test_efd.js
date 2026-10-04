'use strict';
/* node docs/efd/test_efd.js  -- no dependencies */
var assert = require('assert'), crypto = require('crypto');
var efd = require('./pesa-efd.js'), createMockNamra = require('./mock-namra.js').createMockNamra;

var sha256 = function (s) { return crypto.createHash('sha256').update(s).digest('hex'); };
var SELLER = { tin: '1234567890', vatNumber: 'VAT-99', name: 'Demo Shop', branchCode: 'WDH01', terminalId: 'T01' };

function memStorage() {
  var m = new Map(), s = {
    m: m, failNextBatch: false,
    get: function (k) { return Promise.resolve(m.has(k) ? JSON.parse(m.get(k)) : null); },
    put: function (k, v) { m.set(k, JSON.stringify(v)); return Promise.resolve(); },
    list: function (p) { var o = []; m.forEach(function (v, k) { if (k.indexOf(p) === 0) o.push(JSON.parse(v)); }); return Promise.resolve(o); },
    batch: function (ops) { if (s.failNextBatch) { s.failNextBatch = false; return Promise.reject(new Error('DISK_FULL')); } ops.forEach(function (o) { m.set(o.put[0], JSON.stringify(o.put[1])); }); return Promise.resolve(); }
  };
  return s;
}
function clock(t0) { var t = t0 || 1000000; var f = function () { return t; }; f.advance = function (ms) { t += ms; }; return f; }
function sale(items, extra) { return Object.assign({ items: items, paymentMethod: 'cash', customerName: 'Walk-in', createdAt: '2026-10-04T08:30:00.000Z' }, extra || {}); }
function item(name, qty, unit, cat) { return { productId: 'p-' + name, name: name, qty: qty, unitPrice: unit, taxCategory: cat }; }

var results = [], only = process.argv[2];
function test(name, fn) { results.push({ name: name, fn: fn }); }
function setup(over) {
  over = over || {};
  var storage = memStorage(), mock = createMockNamra(), clk = clock(), events = [];
  var outbox = efd.createFiscalOutbox({ storage: storage, sha256: sha256 });
  var worker = efd.createTaxSyncWorker({ storage: storage, transport: over.transport || mock.transport, clock: clk, online: over.online, rnd: function () { return 0.5; },
    onEvent: function (e) { events.push(e); }, config: Object.assign({ requestTimeoutMs: 200, verifyClearance: mock.verify }, over.config || {}) });
  return { storage: storage, mock: mock, clk: clk, events: events, outbox: outbox, worker: worker };
}
async function addSale(c, n) { var out = []; for (var i = 0; i < (n || 1); i++) out.push(await c.outbox.enqueueSale(sale([item('Bread', 2, 12.5)]), 's' + i, SELLER)); return out; }
async function recs(c) { return (await c.storage.list('fiscalOutbox/')).filter(function (r) { return r.payload; }).sort(function (a, b) { return a.payload.invoice.sequence - b.payload.invoice.sequence; }); }

/* ------------------------------------------------------------ money and payload */
test('vatFromGross: half-up integer VAT at 15%', function () {
  assert.strictEqual(efd.vatFromGross(11500, 1500), 1500);       // 115.00 -> 15.00
  assert.strictEqual(efd.vatFromGross(100, 1500), 13);           // 1.00 -> 0.1304 -> 0.13
  assert.strictEqual(efd.vatFromGross(1, 1500), 0);
  assert.strictEqual(efd.vatFromGross(4, 1500), 1);              // 0.5217 -> 1
  assert.strictEqual(efd.vatFromGross(12345, 0), 0);
  for (var g = 0; g < 20000; g += 7) { var v = efd.vatFromGross(g, 1500), exact = g * 15 / 115; assert(Math.abs(v - exact) <= 0.5 + 1e-9, 'g=' + g); }
});
test('toCents handles binary-float edge cases', function () {
  assert.strictEqual(efd.toCents(1.005), 101); assert.strictEqual(efd.toCents(0.1 + 0.2), 30); assert.strictEqual(efd.toCents(19.99), 1999); assert.strictEqual(efd.toCents('5'), 500);
  assert.throws(function () { efd.toCents('abc'); }, /BAD_AMOUNT/);
});
test('buildPayload: mixed standard, zero-rated and exempt lines, pools reconcile', function () {
  var p = efd.buildPayload(sale([item('Soap', 3, 11.5, 'STANDARD'), item('Maize meal', 2, 40, 'zero-rated'), item('School book', 1, 100, 'EXEMPT')], { total: 214.5 }),
    { seller: SELLER, sequence: 7, previousHash: null });
  assert.strictEqual(p.totals.gross, '214.50');
  assert.strictEqual(p.lines[0].vat, '4.50'); assert.strictEqual(p.lines[0].net, '30.00'); assert.strictEqual(p.lines[0].ratePct, '15');
  assert.strictEqual(p.lines[1].taxCategory, 'ZERO_RATED'); assert.strictEqual(p.lines[1].vat, '0.00'); assert.strictEqual(p.lines[1].ratePct, '0');
  assert.strictEqual(p.lines[2].taxCategory, 'EXEMPT'); assert.strictEqual(p.lines[2].ratePct, null);
  assert.strictEqual(p.totals.pools.length, 3);
  var cents = function (t) { return Math.round(parseFloat(t) * 100); }, sum = function (k) { return p.totals.pools.reduce(function (a, q) { return a + cents(q[k]); }, 0); };
  assert.strictEqual(sum('gross'), cents(p.totals.gross)); assert.strictEqual(sum('net'), cents(p.totals.net)); assert.strictEqual(sum('vat'), cents(p.totals.vat));
  assert.strictEqual(cents(p.totals.net) + cents(p.totals.vat), cents(p.totals.gross));
  assert.strictEqual(p.invoice.number, 'T01-000007'); assert.strictEqual(p.invoice.idempotencyKey, '1234567890:WDH01:T01:7'); assert.strictEqual(p.invoice.currency, 'NAD');
  assert(/^[+-]\d\d:\d\d$/.test(p.invoice.localOffset)); assert.strictEqual(p.invoice.issuedAt, '2026-10-04T08:30:00.000Z');
});
test('buildPayload: fractional quantity and per-line rounding sum to the total', function () {
  var p = efd.buildPayload(sale([item('Meat kg', 0.35, 89.99), item('Sweet', 3, 0.99)]), { seller: SELLER, sequence: 1 });
  var cents = function (t) { return Math.round(parseFloat(t) * 100); };
  assert.strictEqual(p.lines[0].gross, '31.50');
  assert.strictEqual(p.lines.reduce(function (a, l) { return a + cents(l.gross); }, 0), cents(p.totals.gross));
  assert.strictEqual(p.lines.reduce(function (a, l) { return a + cents(l.vat); }, 0), cents(p.totals.vat));
});
test('buildPayload: rejects missing identity, empty sale and total mismatch', function () {
  var s1 = sale([item('A', 1, 10)]);
  assert.throws(function () { efd.buildPayload(s1, { seller: { branchCode: 'B', terminalId: 'T' }, sequence: 1 }); }, /MISSING_TIN/);
  assert.throws(function () { efd.buildPayload(s1, { seller: { tin: '1', terminalId: 'T' }, sequence: 1 }); }, /MISSING_BRANCH_CODE/);
  assert.throws(function () { efd.buildPayload(s1, { seller: { tin: '1', branchCode: 'B' }, sequence: 1 }); }, /MISSING_TERMINAL_ID/);
  assert.throws(function () { efd.buildPayload(sale([]), { seller: SELLER, sequence: 1 }); }, /EMPTY_SALE/);
  assert.throws(function () { efd.buildPayload(sale([item('A', 1, 10)], { total: 11 }), { seller: SELLER, sequence: 1 }); }, /TOTAL_MISMATCH/);
});
test('canon is key-order independent; hash excludes integrity.hash', async function () {
  assert.strictEqual(efd.canon({ b: 1, a: [2, { d: 1, c: 2 }] }), efd.canon({ a: [2, { c: 2, d: 1 }], b: 1 }));
  var p = efd.buildPayload(sale([item('A', 1, 10)]), { seller: SELLER, sequence: 1 }); await efd.sealPayload(p, sha256);
  var h = p.integrity.hash; assert(/^[0-9a-f]{64}$/.test(h));
  await efd.sealPayload(p, sha256); assert.strictEqual(p.integrity.hash, h);
});

/* ------------------------------------------------------------ outbox */
test('enqueue: gap-free sequence and hash chain', async function () {
  var c = setup(); await addSale(c, 3); var r = await recs(c);
  assert.deepStrictEqual(r.map(function (x) { return x.payload.invoice.sequence; }), [1, 2, 3]);
  assert.strictEqual(r[0].payload.integrity.previousHash, null);
  assert.strictEqual(r[1].payload.integrity.previousHash, r[0].payload.integrity.hash);
  assert.strictEqual(r[2].payload.integrity.previousHash, r[1].payload.integrity.hash);
  assert((await c.storage.get('fiscalMeta/T01')).seq === 3);
});
test('enqueue: concurrent calls still get unique sequences', async function () {
  var c = setup(); var all = await Promise.all([1, 2, 3, 4, 5, 6].map(function (i) { return c.outbox.enqueueSale(sale([item('A', 1, i + 1)]), 's' + i, SELLER); }));
  assert(all.every(function (x) { return x.ok; })); var seqs = (await recs(c)).map(function (x) { return x.payload.invoice.sequence; }); assert.deepStrictEqual(seqs, [1, 2, 3, 4, 5, 6]);
});
test('enqueue never throws: bad seller leaves a visible FAILED marker and uses no sequence', async function () {
  var c = setup(); var r = await c.outbox.enqueueSale(sale([item('A', 1, 10)]), 'sX', { terminalId: 'T01', branchCode: 'B' });
  assert.strictEqual(r.ok, false); assert.strictEqual(r.error, 'MISSING_TIN');
  var mk = await c.storage.get('fiscalOutbox/build-sX'); assert.strictEqual(mk.status, 'FAILED'); assert.strictEqual(mk.lastError, 'BUILD:MISSING_TIN');
  assert.strictEqual((await c.storage.get('fiscalMeta/T01')), null);
  var ok = await c.outbox.enqueueSale(sale([item('A', 1, 10)]), 'sY', SELLER); assert.strictEqual(ok.record.payload.invoice.sequence, 1);
  assert.strictEqual((await c.worker.counts()).FAILED, 0, 'markers have no payload and are not counted as queue items');
});
test('enqueue: storage failure does not burn a sequence number', async function () {
  var c = setup(); c.storage.failNextBatch = true;
  var r = await c.outbox.enqueueSale(sale([item('A', 1, 10)]), 's1', SELLER); assert.strictEqual(r.ok, false);
  var ok = await c.outbox.enqueueSale(sale([item('A', 1, 10)]), 's2', SELLER); assert.strictEqual(ok.record.payload.invoice.sequence, 1);
});

/* ------------------------------------------------------------ worker */
test('happy path: batch cleared, clearance stored, nothing deleted', async function () {
  var c = setup(); await addSale(c, 3); var s = await c.worker.tick();
  assert.deepStrictEqual([s.sent, s.cleared, s.failed], [3, 3, 0]);
  var r = await recs(c); assert(r.every(function (x) { return x.status === 'CLEARED' && x.clearance.irn && x.clearance.signature && x.clearance.qrUrl; }));
  assert.strictEqual(c.mock.calls.length, 1); assert.strictEqual(c.mock.calls[0].count, 3);
});
test('batch size is respected and oldest sequence goes first', async function () {
  var c = setup({ config: { batchSize: 2 } }); await addSale(c, 5); await c.worker.tick();
  assert.deepStrictEqual(c.mock.calls[0].keys, ['1234567890:WDH01:T01:1', '1234567890:WDH01:T01:2']);
});
test('offline: tick skips, nothing is lost, flush when back online', async function () {
  var on = false, c = setup({ online: function () { return on; } }); await addSale(c, 2);
  assert.deepStrictEqual(await c.worker.tick(), { skipped: 'offline' }); assert.strictEqual(c.mock.calls.length, 0);
  on = true; var s = await c.worker.tick(); assert.strictEqual(s.cleared, 2);
});
test('network drop: re-queued with backoff, data intact, recovers', async function () {
  var c = setup(); await addSale(c, 2); c.mock.script.push({ drop: true });
  var s = await c.worker.tick(); assert.strictEqual(s.retried, 2);
  var r = await recs(c); assert(r.every(function (x) { return x.status === 'PENDING' && x.attempts === 1 && /^NETWORK:/.test(x.lastError) && x.nextAttemptAt > c.clk(); }));
  assert.deepStrictEqual(await c.worker.tick(), { skipped: 'cooldown' });
  c.clk.advance(60000); s = await c.worker.tick(); assert.strictEqual(s.cleared, 2);
});
test('503 and 500: back off, never mark FAILED, never delete', async function () {
  var c = setup(); await addSale(c, 1);
  for (var i = 0; i < 5; i++) { c.mock.script.push({ status: i % 2 ? 500 : 503 }); await c.worker.tick(); c.clk.advance(20 * 60 * 1000); }
  var r = (await recs(c))[0]; assert.strictEqual(r.status, 'PENDING'); assert.strictEqual(r.attempts, 5); assert.strictEqual(r.payload.invoice.sequence, 1);
  var s = await c.worker.tick(); assert.strictEqual(s.cleared, 1);
});
test('backoff grows, stays under the cap, has a 1 s floor', function () {
  var cfg = efd.DEFAULTS; var hi = function () { return 0.999999; };
  assert.strictEqual(efd.backoffMs(1, cfg, function () { return 0; }), 1000);
  assert(efd.backoffMs(1, cfg, hi) <= 5000); assert(efd.backoffMs(3, cfg, hi) <= 20000 && efd.backoffMs(3, cfg, hi) > 15000);
  assert.strictEqual(efd.backoffMs(40, cfg, hi) <= cfg.maxDelayMs, true);
});
test('429 with Retry-After is honoured', async function () {
  var c = setup(); await addSale(c, 1); c.mock.script.push({ status: 429, headers: { 'retry-after': '120' } });
  await c.worker.tick(); var r = (await recs(c))[0]; assert(r.nextAttemptAt - c.clk() >= 120000);
  c.clk.advance(60000); assert.deepStrictEqual(await c.worker.tick(), { skipped: 'cooldown' });
  c.clk.advance(61000); assert.strictEqual((await c.worker.tick()).cleared, 1);
});
test('request timeout: hung server is treated like a dropped network', async function () {
  var c = setup(); await addSale(c, 1); c.mock.script.push({ hang: true });
  var s = await c.worker.tick(); assert.strictEqual(s.retried, 1); var r = (await recs(c))[0]; assert.strictEqual(r.status, 'PENDING'); assert(/TIMEOUT/.test(r.lastError));
  assert.strictEqual(c.worker.state.running, false);
});
test('401 blocks the queue until resume(); receipts stay PENDING', async function () {
  var c = setup({ transport: null }); var bad = createMockNamra(); bad.token = 'right';
  var w = efd.createTaxSyncWorker({ storage: c.storage, transport: bad.transportWithToken('wrong'), clock: c.clk, rnd: function () { return 0.5; }, config: { verifyClearance: bad.verify } });
  await addSale(c, 2); var s = await w.tick(); assert.strictEqual(s.sent, 2);
  assert.strictEqual(w.state.blocked, 'AUTH'); assert.deepStrictEqual(await w.tick(), { skipped: 'blocked:AUTH' });
  var r = await recs(c); assert(r.every(function (x) { return x.status === 'PENDING' && x.attempts === 0 && x.lastError === 'AUTH_401'; }));
  var w2 = efd.createTaxSyncWorker({ storage: c.storage, transport: bad.transportWithToken('right'), clock: c.clk, rnd: function () { return 0.5; }, config: { verifyClearance: bad.verify } });
  assert.strictEqual((await w2.tick()).cleared, 2);
});
test('422 on a mixed batch: split, bad receipt becomes FAILED, good ones clear', async function () {
  var c = setup(); await addSale(c, 3);
  var all = await recs(c); all[1].payload.poison = true; await c.storage.put('fiscalOutbox/' + all[1].id, all[1]);
  var s = await c.worker.tick(); assert.strictEqual(s.failed, 0);
  assert((await recs(c)).every(function (x) { return x.solo && x.status === 'PENDING'; }));
  for (var i = 0; i < 4; i++) await c.worker.tick();
  var r = await recs(c); assert.deepStrictEqual(r.map(function (x) { return x.status; }), ['CLEARED', 'FAILED', 'CLEARED']);
  assert(/^HTTP_422/.test(r[1].lastError)); assert(r[1].payload, 'FAILED receipt is kept on disk');
  assert(c.events.some(function (e) { return e.type === 'failed' && e.id === r[1].id; }));
});
test('retryFailed: owner can push a FAILED receipt back after fixing the cause', async function () {
  var c = setup(); await addSale(c, 1); var r = (await recs(c))[0]; r.payload.poison = true; await c.storage.put('fiscalOutbox/' + r.id, r);
  await c.worker.tick(); assert.strictEqual((await recs(c))[0].status, 'FAILED');
  r = (await recs(c))[0]; delete r.payload.poison; await c.storage.put('fiscalOutbox/' + r.id, r);
  await c.worker.retryFailed(); await c.worker.tick(); assert.strictEqual((await recs(c))[0].status, 'CLEARED');
});
test('per-item REJECTED (arithmetic or hash) goes to FAILED, others in the batch still clear', async function () {
  var c = setup(); await addSale(c, 2); var r = await recs(c); r[0].payload.totals.net = '1.00'; await c.storage.put('fiscalOutbox/' + r[0].id, r[0]);
  var s = await c.worker.tick(); assert.deepStrictEqual([s.cleared, s.failed], [1, 1]);
  r = await recs(c); assert.strictEqual(r[0].status, 'FAILED'); assert(/REJECTED:/.test(r[0].lastError)); assert.strictEqual(r[1].status, 'CLEARED');
});
test('partial results: missing item is retried, not lost', async function () {
  var c = setup(); await addSale(c, 3); c.mock.script.push({ mutate: function (res) { return res.slice(0, 2); } });
  var s = await c.worker.tick(); assert.deepStrictEqual([s.cleared, s.retried], [2, 1]);
  var r = await recs(c); assert.strictEqual(r[2].status, 'PENDING'); assert.strictEqual(r[2].lastError, 'NO_RESULT_FOR_ITEM');
  c.clk.advance(60000); assert.strictEqual((await c.worker.tick()).cleared, 1);
});
test('lost answer: server cleared it, client timed out; resend returns the same IRN (idempotent)', async function () {
  var c = setup(); await addSale(c, 1); c.mock.script.push({ afterProcess: true, status: 504 });
  await c.worker.tick(); var first = c.mock.cleared['1234567890:WDH01:T01:1']; assert(first);
  c.clk.advance(20 * 60 * 1000); var s = await c.worker.tick(); assert.strictEqual(s.cleared, 1);
  var r = (await recs(c))[0]; assert.strictEqual(r.clearance.irn, first.irn); assert.strictEqual(c.mock.irnCounter, 1, 'authority issued one IRN only');
});
test('bad clearance: wrong hash, bad signature, bad QR host are refused and kept FAILED, never CLEARED', async function () {
  var cases = [
    ['HASH_MISMATCH', function (x) { x.payloadHash = 'f'.repeat(64); }],
    ['BAD_SIGNATURE', function (x) { x.signature = 'short'; }],
    ['BAD_QR_URL', function (x) { x.qrUrl = 'http://insecure'; }],
    ['BAD_IRN', function (x) { x.irn = ''; }],
    ['SIGNATURE_INVALID', function (x) { x.signature = 'A'.repeat(43); }]];
  for (var i = 0; i < cases.length; i++) {
    var c = setup(); await addSale(c, 1); c.mock.script.push({ mutate: function (res) { cases[i][1](res[0]); return res; } });
    await c.worker.tick(); var r = (await recs(c))[0]; assert.strictEqual(r.status, 'FAILED', cases[i][0]); assert.strictEqual(r.lastError, 'CLEARANCE_' + cases[i][0]); assert.strictEqual(r.clearance, null);
  }
});
test('stale SUBMITTED (app closed mid-send) is recovered on the next tick', async function () {
  var c = setup(); await addSale(c, 1); var r = (await recs(c))[0]; r.status = 'SUBMITTED'; r.submittedAt = c.clk(); await c.storage.put('fiscalOutbox/' + r.id, r);
  assert.deepStrictEqual((await c.worker.tick()).sent || 0, 0, 'fresh SUBMITTED is left alone');
  c.clk.advance(3 * 60 * 1000); var s = await c.worker.tick(); assert.strictEqual(s.cleared, 1);
});
test('stuck alert fires once at the threshold while retrying continues', async function () {
  var c = setup({ config: { stuckAfterAttempts: 3 } }); await addSale(c, 1);
  for (var i = 0; i < 5; i++) { c.mock.script.push({ status: 503 }); await c.worker.tick(); c.clk.advance(30 * 60 * 1000); }
  assert.strictEqual(c.events.filter(function (e) { return e.type === 'stuck'; }).length, 1); assert.strictEqual((await recs(c))[0].status, 'PENDING');
});
test('tick is re-entrant safe: parallel ticks send once', async function () {
  var c = setup(); await addSale(c, 2); var r = await Promise.all([c.worker.tick(), c.worker.tick(), c.worker.tick()]);
  assert.strictEqual(c.mock.calls.length, 1); assert(r.filter(function (x) { return x.skipped === 'busy'; }).length === 2);
});
test('worker survives a storage error during tick (never rejects)', async function () {
  var c = setup(); await addSale(c, 1); var orig = c.storage.list; c.storage.list = function () { return Promise.reject(new Error('IDB_DEAD')); };
  var s = await c.worker.tick(); assert.strictEqual(s.sent, 0); assert(c.events.some(function (e) { return e.type === 'error'; }));
  c.storage.list = orig; assert.strictEqual((await c.worker.tick()).cleared, 1);
});
test('sale flow is never blocked: 50 sales while offline, all queued, then all clear in batches', async function () {
  var on = false, c = setup({ online: function () { return on; }, config: { batchSize: 20 } }); var t0 = Date.now(); await addSale(c, 50);
  assert((Date.now() - t0) < 3000); assert.strictEqual((await c.worker.counts()).PENDING, 50);
  on = true; for (var i = 0; i < 3; i++) await c.worker.tick(); var n = await c.worker.counts(); assert.strictEqual(n.CLEARED, 50); assert.deepStrictEqual(c.mock.calls.map(function (x) { return x.count; }), [20, 20, 10]);
});

/* ------------------------------------------------------------ receipt */
test('receipt block: CLEARED carries IRN, signature stub, QR; PENDING and FAILED carry honest text', async function () {
  var c = setup(); await addSale(c, 1); var pend = efd.fiscalReceiptBlock((await recs(c))[0]);
  assert(pend.lines.join('\n').indexOf('Tax clearance pending') >= 0); assert.strictEqual(pend.qrUrl, null);
  await c.worker.tick(); var rec = (await recs(c))[0], blk = efd.fiscalReceiptBlock(rec);
  assert(blk.lines.some(function (l) { return l.indexOf('IRN: ' + rec.clearance.irn) === 0; })); assert.strictEqual(blk.qrUrl, rec.clearance.qrUrl);
  assert(blk.lines.every(function (l) { return l.length <= 32; }), 'fits a 58 mm printer');
  rec.status = 'FAILED'; rec.clearance = null; assert(efd.fiscalReceiptBlock(rec).lines.join('\n').indexOf('NOT YET CLEARED') >= 0);
});
test('ESC/POS footer: QR commands are well formed and length field matches', async function () {
  var c = setup(); await addSale(c, 1); await c.worker.tick(); var rec = (await recs(c))[0];
  var bytes = efd.escposFiscalFooter(rec), url = rec.clearance.qrUrl;
  var store = [0x1D, 0x28, 0x6B]; var idx = -1; for (var i = 0; i < bytes.length - 8; i++) if (bytes[i] === 0x1D && bytes[i + 1] === 0x28 && bytes[i + 2] === 0x6B && bytes[i + 5] === 49 && bytes[i + 6] === 80) { idx = i; break; }
  assert(idx > 0, 'store command present'); var len = bytes[idx + 3] + bytes[idx + 4] * 256; assert.strictEqual(len, url.length + 3);
  assert.strictEqual(Buffer.from(bytes.slice(idx + 8, idx + 8 + url.length)).toString('latin1'), url);
  assert.deepStrictEqual(Array.from(bytes.slice(bytes.length - 12, bytes.length - 4)), [0x1D, 0x28, 0x6B, 3, 0, 49, 81, 48], 'print command before the tail');
  rec.status = 'PENDING'; rec.clearance = null; var plain = efd.escposFiscalFooter(rec); assert(!Array.from(plain).some(function (b, i) { return b === 0x1D && plain[i + 1] === 0x28; }), 'no QR when not cleared');
});
test('printableFooter reads the stored record for a given terminal and sequence', async function () {
  var c = setup(); await addSale(c, 1); await c.worker.tick();
  var f = await efd.printableFooter(c.storage, 'T01', 1); assert(f.length > 40); assert.strictEqual((await efd.printableFooter(c.storage, 'T01', 99)).length, 0);
});

test('withFiscalFooter: footer lands before the cut, receipt bytes untouched', async function () {
  var c = setup(); await addSale(c, 1); await c.worker.tick();
  var receipt = Uint8Array.from(Buffer.from('\x1b@Shop\nTOTAL 25.00\n\n\n\n\x1dVB\x00', 'latin1')), foot = await efd.printableFooter(c.storage, 'T01', 1);
  var out = efd.withFiscalFooter(receipt, foot), cut = out.length - 4;
  assert.deepStrictEqual(Array.from(out.slice(cut)), [0x1D, 0x56, 0x42, 0x00]); assert.strictEqual(Buffer.from(out.slice(0, receipt.length - 4)).toString('latin1'), '\x1b@Shop\nTOTAL 25.00\n\n\n\n');
  assert(Buffer.from(out).toString('latin1').indexOf('FISCAL RECEIPT') > receipt.length - 5);
  assert.strictEqual(efd.withFiscalFooter(receipt, new Uint8Array(0)), receipt, 'no record: receipt printed as before');
  var nocut = Uint8Array.from([65, 66]); assert.strictEqual(efd.withFiscalFooter(nocut, foot).length, 2 + foot.length + 3);
});

/* ------------------------------------------------------------ http adapter against a real socket */
test('createHttpTransport against the mock HTTP server: 200, Retry-After header, dropped socket', async function () {
  var c = setup(), srv = await c.mock.listen(0), port = srv.address().port;
  try {
    var t = efd.createHttpTransport({ url: 'http://127.0.0.1:' + port + '/v1/receipts', token: c.mock.token });
    var w = efd.createTaxSyncWorker({ storage: c.storage, transport: t, clock: c.clk, rnd: function () { return 0.5; }, config: { verifyClearance: c.mock.verify, requestTimeoutMs: 3000 } });
    await addSale(c, 2); c.mock.script.push({ status: 429, headers: { 'retry-after': '90' } });
    await w.tick(); var r = await recs(c); assert(r[0].nextAttemptAt - c.clk() >= 90000, 'Retry-After header survived the wire');
    c.clk.advance(100000); c.mock.script.push({ drop: true }); await w.tick(); assert(/NETWORK:/.test((await recs(c))[0].lastError));
    c.clk.advance(100000); var s = await w.tick(); assert.strictEqual(s.cleared, 2);
  } finally { srv.close(); }
});

(async function main() {
  var fail = 0;
  for (var i = 0; i < results.length; i++) {
    var t = results[i]; if (only && t.name.indexOf(only) < 0) continue;
    try { await t.fn(); console.log('  ok   ' + t.name); } catch (e) { fail++; console.log('  FAIL ' + t.name + '\n       ' + (e && e.stack || e).toString().split('\n').slice(0, 4).join('\n       ')); }
  }
  console.log(fail ? fail + ' FAILED' : 'ALL ' + results.length + ' PASSED'); process.exit(fail ? 1 : 0);
})();
