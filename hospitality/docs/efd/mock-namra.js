/* Mock NamRA clearance service for tests and local development. NOT the real API: the real specification is unpublished.
 * Behaviour is scripted through `mock.script` so every failure path of the queue can be reproduced.
 *   const mock = createMockNamra({ sha256, secret });
 *   mock.script.push({ status: 503 });                     // next call answers 503
 *   mock.script.push({ drop: true });                      // next call never answers (network error)
 *   mock.script.push({ status: 429, headers: { 'retry-after': '30' } });
 *   mock.transport.submitBatch(payloads)                   // same contract as createHttpTransport()
 *   mock.listen(port)                                      // optional real HTTP server (Node only)
 */
'use strict';
var crypto = require('crypto');
var efd = require('./pesa-efd.js');

function createMockNamra(opts) {
  opts = opts || {};
  var secret = opts.secret || 'mock-namra-signing-secret';
  var cleared = {};            // idempotencyKey -> result (idempotent replay)
  var mock = { script: [], calls: [], cleared: cleared, irnCounter: 0, token: opts.token || 'test-token' };

  function sha(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
  function b64url(buf) { return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function sign(hash) { return b64url(crypto.createHmac('sha256', secret).update(hash).digest()); }
  mock.verify = function (hash, signature) { return signature === sign(hash); };

  function cents(t) { return Math.round(parseFloat(t) * 100); }

  /** Validation the authority would do: arithmetic, categories, hash. Returns null or a reason. */
  function validate(p) {
    if (!p || p.schema !== efd.SCHEMA) return 'BAD_SCHEMA';
    if (!p.seller || !p.seller.tin || !p.seller.branchCode || !p.seller.terminalId) return 'MISSING_SELLER_FIELDS';
    var g = 0, n = 0, v = 0, pools = {};
    for (var i = 0; i < p.lines.length; i++) {
      var l = p.lines[i];
      if (['STANDARD', 'ZERO_RATED', 'EXEMPT'].indexOf(l.taxCategory) < 0) return 'BAD_TAX_CATEGORY';
      if (cents(l.gross) !== cents(l.net) + cents(l.vat)) return 'LINE_ARITHMETIC';
      if (l.taxCategory !== 'STANDARD' && cents(l.vat) !== 0) return 'VAT_ON_NON_STANDARD';
      g += cents(l.gross); n += cents(l.net); v += cents(l.vat);
    }
    if (g !== cents(p.totals.gross) || n !== cents(p.totals.net) || v !== cents(p.totals.vat)) return 'TOTAL_ARITHMETIC';
    var pg = 0; p.totals.pools.forEach(function (q) { pg += cents(q.gross); });
    if (pg !== g) return 'POOL_ARITHMETIC';
    var copy = JSON.parse(JSON.stringify(p)); delete copy.integrity.hash;
    if (sha(efd.canon(copy)) !== p.integrity.hash) return 'HASH_INVALID';
    return null;
  }

  function process(body) {
    var results = [];
    (body.receipts || []).forEach(function (p) {
      var key = p && p.invoice && p.invoice.idempotencyKey;
      if (key && cleared[key]) { results.push(cleared[key]); return; }          // duplicate: same answer, no second clearance
      var bad = validate(p);
      if (bad) { results.push({ idempotencyKey: key, status: 'REJECTED', reason: bad }); return; }
      mock.irnCounter += 1;
      var irn = 'MOCK-' + p.seller.tin + '-' + ('00000000' + mock.irnCounter).slice(-8);
      var r = { idempotencyKey: key, status: 'CLEARED', irn: irn, qrUrl: 'https://verify.mock.invalid/r/' + irn,
        signature: sign(p.integrity.hash), payloadHash: p.integrity.hash, clearedAt: new Date().toISOString() };
      cleared[key] = r; results.push(r);
    });
    return results;
  }

  /** Same shape as createHttpTransport(): resolves {status, headers, body}, rejects when nothing comes back. */
  mock.handle = function (req) {          // req: { token, body }
    mock.calls.push({ count: (req.body.receipts || []).length, keys: (req.body.receipts || []).map(function (p) { return p.invoice.idempotencyKey; }) });
    var step = mock.script.shift();
    if (step && step.drop) return Promise.reject(new Error('ECONNRESET'));
    if (step && step.hang) return new Promise(function () {});
    if (step && step.afterProcess) { process(req.body); return Promise.resolve({ status: step.status || 504, headers: step.headers || {}, body: null }); }   // server cleared them, answer was lost
    if (step && step.status) return Promise.resolve({ status: step.status, headers: step.headers || {}, body: step.body || null });
    if (req.token !== mock.token) return Promise.resolve({ status: 401, headers: {}, body: { message: 'bad token' } });
    if ((req.body.receipts || []).some(function (p) { return p && p.poison; })) return Promise.resolve({ status: 422, headers: {}, body: { message: 'malformed receipt in batch' } });
    var results = process(req.body);
    if (step && step.mutate) results = step.mutate(results);
    return Promise.resolve({ status: 200, headers: {}, body: { results: results } });
  };

  mock.transport = {
    submitBatch: function (payloads) { return mock.handle({ token: mock.token, body: { receipts: payloads } }); }
  };
  mock.transportWithToken = function (token) {
    return { submitBatch: function (payloads) { return mock.handle({ token: token, body: { receipts: payloads } }); } };
  };

  mock.listen = function (port) {
    var http = require('http');
    var srv = http.createServer(function (rq, rs) {
      var chunks = []; rq.on('data', function (c) { chunks.push(c); });
      rq.on('end', function () {
        var body; try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch (e) { rs.writeHead(400); rs.end('{}'); return; }
        var token = String(rq.headers.authorization || '').replace(/^Bearer /, '');
        mock.handle({ token: token, body: body }).then(function (r) {
          var h = Object.assign({ 'Content-Type': 'application/json' }, r.headers); rs.writeHead(r.status, h); rs.end(JSON.stringify(r.body));
        }, function () { rq.socket.destroy(); });
      });
    });
    return new Promise(function (ok) { srv.listen(port, '127.0.0.1', function () { ok(srv); }); });
  };
  return mock;
}
module.exports = { createMockNamra: createMockNamra };
