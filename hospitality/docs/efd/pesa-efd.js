/* Pesa fiscal (NamRA) reference implementation.  No dependencies, runs in the browser and in Node.
 *
 * STATUS: NamRA has not published an e-invoicing specification. Everything marked MOCK below is a placeholder shape
 * that sits behind `transport` (how a batch is sent) and `toWire()` (how a receipt is described). When the real
 * specification exists, replace those two pieces and keep the rest: money arithmetic, hash chain, local outbox,
 * retry queue and receipt block do not depend on NamRA's field names.
 *
 * RULES THE CODE ENFORCES
 *  1. A sale is never blocked: enqueueSale() catches every error and returns { ok:false } instead of throwing.
 *  2. Nothing is ever deleted: a record leaves PENDING only for CLEARED or FAILED, and FAILED stays on disk.
 *  3. Money is whole cents (integers). No floating point reaches a stored or sent amount.
 *  4. The send is idempotent: the same idempotencyKey can be sent twice and clears once.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PesaEfd = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ constants */
  var TAX = { STANDARD: 'STANDARD', ZERO: 'ZERO_RATED', EXEMPT: 'EXEMPT' };
  var STATUS = { PENDING: 'PENDING', SUBMITTED: 'SUBMITTED', CLEARED: 'CLEARED', FAILED: 'FAILED' };
  var SCHEMA = 'pesa.namra.mock/1';
  var DEFAULTS = {
    standardRateBp: 1500,          // 15.00 %, in basis points so the arithmetic stays integer
    batchSize: 20,
    requestTimeoutMs: 15000,
    baseDelayMs: 5000,             // first retry after about 5 s
    maxDelayMs: 15 * 60 * 1000,    // never wait longer than 15 min between tries
    staleSubmittedMs: 2 * 60 * 1000,
    loopMs: 15000,                 // same rhythm as the cloud sync
    stuckAfterAttempts: 12,        // raises an alert, keeps retrying
    totalToleranceCents: 0,        // receipt total vs sum of rounded lines; a shop that rounds only at the end may allow one cent per line
    verifyClearance: null          // (payloadHash, signature, irn) => boolean; supply NamRA's key check when it exists
  };

  /* ------------------------------------------------------------------ money (integer cents) */
  function toCents(n) {
    var v = Number(n);
    if (!isFinite(v)) throw new Error('BAD_AMOUNT');
    return Math.round((v + (v < 0 ? -Number.EPSILON : Number.EPSILON)) * 100);
  }
  function fmt(cents) {                                  // 11375 -> "113.75"
    var neg = cents < 0, a = Math.abs(cents), s = String(a % 100);
    return (neg ? '-' : '') + Math.floor(a / 100) + '.' + (s.length < 2 ? '0' + s : s);
  }
  /** VAT contained in a VAT-inclusive amount, rounded half up, integer maths only. */
  function vatFromGross(grossCents, rateBp) {
    if (!rateBp) return 0;
    var den = 10000 + rateBp;
    return Math.floor((grossCents * rateBp * 2 + den) / (2 * den));
  }
  function normCategory(c) {
    c = String(c || 'STANDARD').toUpperCase().replace(/[\s-]+/g, '_');
    if (c === 'ZERO' || c === 'ZERO_RATED' || c === '0') return TAX.ZERO;
    if (c === 'EXEMPT') return TAX.EXEMPT;
    return TAX.STANDARD;
  }
  function rateBpOf(category, cfg) {
    return category === TAX.STANDARD ? cfg.standardRateBp : (category === TAX.ZERO ? 0 : null);
  }
  function ratePctText(bp) { return bp == null ? null : String(bp / 100); }

  /* ------------------------------------------------------------------ canonical JSON and hashing */
  function canon(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
  }
  function hashOf(payload, sha256) {                      // sha256: (string) => hex, sync or async
    var copy = JSON.parse(JSON.stringify(payload));
    if (copy.integrity) delete copy.integrity.hash;
    return Promise.resolve(sha256(canon(copy)));
  }

  /* ------------------------------------------------------------------ Task 3: cart -> request payload */
  var PAY_MAP = { cash: 'CASH', card: 'CARD', wallet: 'MOBILE_WALLET', credit: 'CREDIT' };
  function offsetText(d) {                                // Namibia is UTC+02:00 all year; the device's own offset is used
    var m = -d.getTimezoneOffset(), s = m < 0 ? '-' : '+', a = Math.abs(m);
    return s + ('0' + Math.floor(a / 60)).slice(-2) + ':' + ('0' + (a % 60)).slice(-2);
  }
  /**
   * @param {object} sale   a Pesa sale: { items:[{productId,name,qty,unitPrice,taxCategory?}], paymentMethod, customerName, createdAt, total }
   * @param {object} ctx    { seller:{tin,vatNumber,name,branchCode,terminalId}, sequence, previousHash, config?, buyerTin?, docType? }
   * @returns the unsigned payload (integrity.hash is added by sealPayload)
   */
  function buildPayload(sale, ctx) {
    var cfg = Object.assign({}, DEFAULTS, ctx.config || {}), s = ctx.seller || {};
    if (!s.tin) throw new Error('MISSING_TIN');
    if (!s.branchCode) throw new Error('MISSING_BRANCH_CODE');
    if (!s.terminalId) throw new Error('MISSING_TERMINAL_ID');
    if (!sale.items || !sale.items.length) throw new Error('EMPTY_SALE');
    var pools = {}, lines = [], gross = 0, net = 0, vat = 0;
    sale.items.forEach(function (it, i) {
      var cat = normCategory(it.taxCategory), bp = rateBpOf(cat, cfg);
      var g = Math.round(toCents(it.unitPrice) * Number(it.qty));          // quantity may be a weight such as 0.5
      var v = cat === TAX.STANDARD ? vatFromGross(g, bp) : 0, n = g - v;
      lines.push({ n: i + 1, productId: it.productId || null, description: String(it.name || it.desc || '').slice(0, 120),
        quantity: String(it.qty), unitGross: fmt(toCents(it.unitPrice)), gross: fmt(g), net: fmt(n), vat: fmt(v), taxCategory: cat, ratePct: ratePctText(bp) });
      var key = cat + '|' + bp, p = pools[key] || (pools[key] = { taxCategory: cat, bp: bp, net: 0, vat: 0, gross: 0 });
      p.net += n; p.vat += v; p.gross += g; gross += g; net += n; vat += v;
    });
    if (sale.total != null && Math.abs(toCents(sale.total) - gross) > cfg.totalToleranceCents) throw new Error('TOTAL_MISMATCH');   // the receipt and the tax record must agree
    var at = new Date(sale.createdAt || Date.now());
    var seq = ctx.sequence, number = s.terminalId + '-' + ('000000' + seq).slice(-6);
    var pay = PAY_MAP[sale.paymentMethod] || 'OTHER';
    return {
      schema: SCHEMA,
      seller: { tin: s.tin, vatNumber: s.vatNumber || null, name: s.name || '', branchCode: s.branchCode, terminalId: s.terminalId },
      buyer: { tin: ctx.buyerTin || null, name: sale.customerName || null },
      invoice: { type: ctx.docType || 'SALE', sequence: seq, number: number, issuedAt: at.toISOString(), localOffset: offsetText(at), currency: 'NAD',
        idempotencyKey: s.tin + ':' + s.branchCode + ':' + s.terminalId + ':' + seq },
      lines: lines,
      totals: { gross: fmt(gross), net: fmt(net), vat: fmt(vat),
        pools: Object.keys(pools).sort().map(function (k) { var p = pools[k]; return { taxCategory: p.taxCategory, ratePct: ratePctText(p.bp), net: fmt(p.net), vat: fmt(p.vat), gross: fmt(p.gross) }; }) },
      payments: [{ method: pay, amount: fmt(gross) }],
      integrity: { previousHash: ctx.previousHash || null }
    };
  }
  function sealPayload(payload, sha256) {
    return hashOf(payload, sha256).then(function (h) { payload.integrity.hash = h; return payload; });
  }

  /* ------------------------------------------------------------------ Task 3: response -> clearance metadata */
  /**
   * Validates one per-receipt result from the authority and returns the metadata to store.
   * MOCK response item: { idempotencyKey, status:'CLEARED', irn, qrUrl, signature, payloadHash, clearedAt }
   */
  function parseClearance(record, item, cfg) {
    cfg = Object.assign({}, DEFAULTS, cfg || {});
    if (!item || item.status !== 'CLEARED') return { ok: false, code: 'NOT_CLEARED' };
    var irn = String(item.irn || ''), qr = String(item.qrUrl || ''), sig = String(item.signature || '');
    if (!irn || irn.length > 64) return { ok: false, code: 'BAD_IRN' };
    if (!/^https:\/\//.test(qr)) return { ok: false, code: 'BAD_QR_URL' };
    if (!/^[A-Za-z0-9_\-+/=]{16,}$/.test(sig)) return { ok: false, code: 'BAD_SIGNATURE' };
    if (item.payloadHash !== record.payload.integrity.hash) return { ok: false, code: 'HASH_MISMATCH' };   // the authority saw different data
    if (cfg.verifyClearance && !cfg.verifyClearance(item.payloadHash, sig, irn)) return { ok: false, code: 'SIGNATURE_INVALID' };
    return { ok: true, clearance: { irn: irn, qrUrl: qr, signature: sig, clearedAt: item.clearedAt || new Date().toISOString() } };
  }

  /* ------------------------------------------------------------------ receipt block for the Bluetooth printer */
  function shortSig(sig) { return sig.length > 20 ? sig.slice(0, 12) + '...' + sig.slice(-4) : sig; }
  /** Plain text lines (32 columns) plus the QR address. Safe to print for every status. */
  function fiscalReceiptBlock(record) {
    var p = record.payload, inv = p.invoice, out = [], qrUrl = null;
    out.push('--------------------------------');
    if (record.status === STATUS.CLEARED && record.clearance) {
      out.push('FISCAL RECEIPT');
      out.push('IRN: ' + record.clearance.irn);
      out.push('Seq ' + inv.sequence + '  Terminal ' + p.seller.terminalId);
      out.push('Sig: ' + shortSig(record.clearance.signature));
      out.push('TIN: ' + p.seller.tin);
      out.push('Scan the code to verify');
      qrUrl = record.clearance.qrUrl;
    } else if (record.status === STATUS.FAILED) {
      out.push('NOT YET CLEARED');
      out.push('Keep this slip. Ref ' + inv.number);
    } else {
      out.push('Tax clearance pending');
      out.push('Ref ' + inv.number);
      out.push('Check ' + record.payload.integrity.hash.slice(0, 8));
      out.push('Reprint later for the IRN');
    }
    return { lines: out, qrUrl: qrUrl };
  }
  /** ESC/POS QR code (GS ( k).  Returns bytes to place before the cut command. */
  function escposQr(url, opts) {
    opts = opts || {};
    var size = opts.size || 6, ec = { L: 48, M: 49, Q: 50, H: 51 }[opts.ec || 'M'];
    var data = []; for (var i = 0; i < url.length; i++) data.push(url.charCodeAt(i) & 0xFF);
    var len = data.length + 3, GS = 0x1D, K = 0x28, KK = 0x6B;
    var b = [GS, K, KK, 4, 0, 49, 65, 50, 0,                       // model 2
             GS, K, KK, 3, 0, 49, 67, size,                        // module size
             GS, K, KK, 3, 0, 49, 69, ec,                          // error correction
             GS, K, KK, len & 255, len >> 8, 49, 80, 48].concat(data, // store
             [GS, K, KK, 3, 0, 49, 81, 48]);                       // print
    return new Uint8Array(b);
  }
  /** Everything to append to the receipt: centred text, then the QR when cleared. */
  function escposFiscalFooter(record) {
    var blk = fiscalReceiptBlock(record), enc = [], ESC = 0x1B;
    function push(s) { for (var i = 0; i < s.length; i++) enc.push(s.charCodeAt(i) & 0xFF); }
    push('\n'); enc.push(ESC, 0x61, 1); push(blk.lines.join('\n') + '\n');
    var bytes = new Uint8Array(enc);
    if (!blk.qrUrl) return bytes;
    var qr = escposQr(blk.qrUrl), tail = new Uint8Array([0x0A, ESC, 0x61, 0]);
    var all = new Uint8Array(bytes.length + qr.length + tail.length); all.set(bytes, 0); all.set(qr, bytes.length); all.set(tail, bytes.length + qr.length);
    return all;
  }

  /* ------------------------------------------------------------------ Task 2: local outbox */
  /**
   * storage interface (Pesa maps it onto its Store; tests use an in-memory map):
   *   get(key) -> Promise<obj|null>      put(key, obj) -> Promise      list(prefix) -> Promise<[obj]>
   *   batch([{put:[key,obj]}]) -> Promise   all-or-nothing where the engine allows it
   */
  function pad(n) { return ('0000000000' + n).slice(-10); }
  function outboxKey(terminalId, seq) { return 'fiscalOutbox/' + terminalId + '-' + pad(seq); }
  function metaKey(terminalId) { return 'fiscalMeta/' + terminalId; }

  function createFiscalOutbox(opts) {
    var storage = opts.storage, sha256 = opts.sha256, cfg = Object.assign({}, DEFAULTS, opts.config || {}), chain = Promise.resolve();
    function serial(fn) { var r = chain.then(fn, fn); chain = r.then(function () {}, function () {}); return r; }   // one allocation at a time

    /** Called from finalizeSale after the sale itself is saved. Never rejects. */
    function enqueueSale(sale, saleId, seller) {
      return serial(function () {
        var tid = seller && seller.terminalId;
        return Promise.resolve().then(function () {
          if (!tid) throw new Error('MISSING_TERMINAL_ID');
          return storage.get(metaKey(tid));
        }).then(function (meta) {
          meta = meta || { seq: 0, lastHash: null };
          var seq = meta.seq + 1;
          var payload = buildPayload(sale, { seller: seller, sequence: seq, previousHash: meta.lastHash, config: cfg });
          return sealPayload(payload, sha256).then(function (sealed) {
            var rec = { id: tid + '-' + pad(seq), saleId: saleId || null, status: STATUS.PENDING, attempts: 0, nextAttemptAt: 0, submittedAt: null, lastError: null, solo: false, clearance: null, payload: sealed, createdAt: Date.now() };
            return storage.batch([{ put: [outboxKey(tid, seq), rec] }, { put: [metaKey(tid), { seq: seq, lastHash: sealed.integrity.hash }] }]).then(function () { return { ok: true, record: rec }; });
          });
        }).catch(function (e) {
          // The sale stays valid. Keep a visible marker (no sequence number is used up) so the shop can fix and rebuild it later.
          var code = (e && e.message) || 'ERROR', rec = { id: 'build-' + (saleId || Date.now()), saleId: saleId || null, status: STATUS.FAILED, attempts: 0, nextAttemptAt: 0, lastError: 'BUILD:' + code, payload: null, clearance: null, createdAt: Date.now() };
          return Promise.resolve(storage.put('fiscalOutbox/' + rec.id, rec)).then(function () { return { ok: false, error: code }; }, function () { return { ok: false, error: code }; });
        });
      });
    }
    return { enqueueSale: enqueueSale };
  }

  /* ------------------------------------------------------------------ Task 2: the queue worker */
  function backoffMs(attempts, cfg, rnd) {                 // exponential, full jitter, never below 1 s
    var ceil = Math.min(cfg.maxDelayMs, cfg.baseDelayMs * Math.pow(2, Math.max(0, attempts - 1)));
    return Math.max(1000, Math.floor((rnd || Math.random)() * ceil));
  }
  function retryAfterMs(headers, now) {
    var h = headers && (headers['retry-after'] || headers['Retry-After']); if (!h) return 0;
    if (/^\d+$/.test(h)) return Number(h) * 1000;
    var t = Date.parse(h); return isFinite(t) ? Math.max(0, t - now) : 0;
  }

  /**
   * opts: { storage, transport, clock?, online?, rnd?, onEvent?, config? }
   *   transport.submitBatch(payloads, { signal }) -> Promise<{ status, headers?, body? }>   rejects on network failure
   */
  function createTaxSyncWorker(opts) {
    var storage = opts.storage, transport = opts.transport, cfg = Object.assign({}, DEFAULTS, opts.config || {});
    var now = opts.clock || function () { return Date.now(); }, online = opts.online || function () { return true; };
    var emit = opts.onEvent || function () {}, rnd = opts.rnd;
    var state = { running: false, blocked: null, cooldownUntil: 0, failedTicks: 0, timer: null, stopped: true };

    function save(rec) { return storage.put('fiscalOutbox/' + rec.id, rec); }
    function list() { return storage.list('fiscalOutbox/').then(function (a) { return a.filter(function (r) { return r && r.payload; }); }); }

    function markTransient(rec, reason, minDelay) {
      rec.attempts += 1; rec.status = STATUS.PENDING; rec.submittedAt = null; rec.lastError = reason;
      rec.nextAttemptAt = now() + Math.max(minDelay || 0, backoffMs(rec.attempts, cfg, rnd));
      if (rec.attempts === cfg.stuckAfterAttempts) emit({ type: 'stuck', id: rec.id, attempts: rec.attempts, reason: reason });
      return save(rec);
    }
    function markFailed(rec, reason) { rec.status = STATUS.FAILED; rec.submittedAt = null; rec.lastError = reason; emit({ type: 'failed', id: rec.id, reason: reason }); return save(rec); }

    function recoverStale(all) {                           // a crash or closed tab can leave SUBMITTED behind
      var jobs = [];
      all.forEach(function (r) { if (r.status === STATUS.SUBMITTED && now() - (r.submittedAt || 0) > cfg.staleSubmittedMs) { r.status = STATUS.PENDING; r.lastError = 'RECOVERED_AFTER_INTERRUPTION'; r.nextAttemptAt = 0; jobs.push(save(r)); } });
      return Promise.all(jobs);
    }

    /** One pass. Resolves with a summary and never rejects. */
    function tick() {
      if (state.running) return Promise.resolve({ skipped: 'busy' });
      if (state.blocked) return Promise.resolve({ skipped: 'blocked:' + state.blocked });
      if (now() < state.cooldownUntil) return Promise.resolve({ skipped: 'cooldown' });
      if (!online()) return Promise.resolve({ skipped: 'offline' });      // a hint only: a failed request is the real test
      state.running = true;
      var summary = { sent: 0, cleared: 0, failed: 0, retried: 0 };
      return list().then(function (all) {
        return recoverStale(all).then(function () {
          var due = all.filter(function (r) { return r.status === STATUS.PENDING && r.nextAttemptAt <= now(); }).sort(function (a, b) { return a.payload.invoice.sequence - b.payload.invoice.sequence; });
          if (!due.length) return summary;
          var solo = due.filter(function (r) { return r.solo; })[0];
          var batch = solo ? [solo] : due.filter(function (r) { return !r.solo; }).slice(0, cfg.batchSize);
          batch.forEach(function (r) { r.status = STATUS.SUBMITTED; r.submittedAt = now(); });
          return Promise.all(batch.map(save)).then(function () { return send(batch, summary); });
        });
      }).catch(function (e) { emit({ type: 'error', message: String(e && e.message || e) }); return summary; })
        .then(function (s) { state.running = false; return s; });
    }

    function send(batch, summary) {
      var ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null, timer = null;
      var timeout = new Promise(function (_, rej) { timer = setTimeout(function () { if (ctl) ctl.abort(); rej(new Error('TIMEOUT')); }, cfg.requestTimeoutMs); });
      summary.sent = batch.length;
      var req = Promise.resolve().then(function () { return transport.submitBatch(batch.map(function (r) { return r.payload; }), { signal: ctl && ctl.signal }); });
      return Promise.race([req, timeout]).then(function (res) { clearTimeout(timer); return handle(batch, res, summary); },
        function (err) { clearTimeout(timer); return networkFailure(batch, err, summary); });
    }

    function networkFailure(batch, err, summary) {
      state.failedTicks += 1; state.cooldownUntil = now() + Math.min(cfg.maxDelayMs, cfg.baseDelayMs * Math.pow(2, state.failedTicks - 1));
      summary.retried = batch.length;
      return Promise.all(batch.map(function (r) { return markTransient(r, 'NETWORK:' + String(err && err.message || err).slice(0, 80)); })).then(function () { return summary; });
    }

    function handle(batch, res, summary) {
      var st = res.status, now_ = now();
      if (st === 401 || st === 403) {                       // our credentials, not the receipts: stop and ask for attention
        state.blocked = 'AUTH'; emit({ type: 'blocked', reason: 'AUTH', status: st });
        return Promise.all(batch.map(function (r) { r.status = STATUS.PENDING; r.submittedAt = null; r.lastError = 'AUTH_' + st; return save(r); })).then(function () { return summary; });
      }
      if (st === 408 || st === 425 || st === 429 || st >= 500) {
        var ra = retryAfterMs(res.headers, now_); state.failedTicks += 1;
        state.cooldownUntil = now_ + Math.max(ra, Math.min(cfg.maxDelayMs, cfg.baseDelayMs * Math.pow(2, state.failedTicks - 1)));
        summary.retried = batch.length;
        return Promise.all(batch.map(function (r) { return markTransient(r, 'HTTP_' + st, ra); })).then(function () { return summary; });
      }
      if (st >= 400) {                                      // the authority refused the request itself
        return Promise.all(batch.map(function (r) {
          if (batch.length > 1) { r.status = STATUS.PENDING; r.solo = true; r.submittedAt = null; r.lastError = 'HTTP_' + st + '_RETRY_ALONE'; r.nextAttemptAt = 0; return save(r); }   // find the bad one
          summary.failed += 1; return markFailed(r, 'HTTP_' + st + ':' + String(res.body && res.body.message || '').slice(0, 120));
        })).then(function () { return summary; });
      }
      state.failedTicks = 0;
      var items = {}; ((res.body && res.body.results) || []).forEach(function (it) { items[it.idempotencyKey] = it; });
      return Promise.all(batch.map(function (r) {
        var it = items[r.payload.invoice.idempotencyKey];
        if (!it) { summary.retried += 1; return markTransient(r, 'NO_RESULT_FOR_ITEM'); }
        if (it.status === 'CLEARED') {
          var c = parseClearance(r, it, cfg);
          if (!c.ok) { summary.failed += 1; return markFailed(r, 'CLEARANCE_' + c.code); }
          r.status = STATUS.CLEARED; r.clearance = c.clearance; r.submittedAt = null; r.lastError = null; summary.cleared += 1; emit({ type: 'cleared', id: r.id, irn: c.clearance.irn });
          return save(r);
        }
        if (it.status === 'REJECTED') { summary.failed += 1; return markFailed(r, 'REJECTED:' + String(it.reason || '').slice(0, 120)); }
        summary.retried += 1; return markTransient(r, 'SERVER_ASKED_RETRY');
      })).then(function () { return summary; });
    }

    /** Runs tick() on a timer and whenever the device says it is back online or the page becomes visible again. */
    function start(env) {
      env = env || (typeof window !== 'undefined' ? window : null); state.stopped = false;
      function loop() { if (state.stopped) return; tick().then(function () { state.timer = setTimeout(loop, cfg.loopMs + Math.floor(Math.random() * 3000)); }); }
      function kick() { if (!state.stopped) tick(); }
      if (env && env.addEventListener) { env.addEventListener('online', kick); if (env.document) env.document.addEventListener('visibilitychange', function () { if (!env.document.hidden) kick(); }); }
      loop();
    }
    function stop() { state.stopped = true; if (state.timer) clearTimeout(state.timer); }
    function resume() { state.blocked = null; state.cooldownUntil = 0; state.failedTicks = 0; }      // after the credentials are fixed
    function retryFailed() {                                // owner pressed "retry failed"
      return list().then(function (all) { return Promise.all(all.filter(function (r) { return r.status === STATUS.FAILED && r.payload; }).map(function (r) { r.status = STATUS.PENDING; r.attempts = 0; r.solo = true; r.nextAttemptAt = 0; return save(r); })); });
    }
    function counts() { return list().then(function (all) { var c = { PENDING: 0, SUBMITTED: 0, CLEARED: 0, FAILED: 0 }; all.forEach(function (r) { c[r.status] += 1; }); return c; }); }
    return { tick: tick, start: start, stop: stop, resume: resume, retryFailed: retryFailed, counts: counts, state: state };
  }


  /* ------------------------------------------------------------------ transport adapter (MOCK endpoint shape) */
  /**
   * The only place that knows the URL, headers and wire format. Replace the body of this function when NamRA publishes its API.
   * Resolves { status, headers, body } for every HTTP answer (including 5xx). Rejects only when no answer arrives.
   */
  function createHttpTransport(o) {
    var f = o.fetch || (typeof fetch !== 'undefined' ? fetch.bind(typeof self !== 'undefined' ? self : globalThis) : null);
    return {
      submitBatch: function (payloads, ctl) {
        if (!f) return Promise.reject(new Error('NO_FETCH'));
        return f(o.url, { method: 'POST', signal: ctl && ctl.signal,
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (o.token || ''), 'Idempotency-Batch': payloads.map(function (p) { return p.invoice.idempotencyKey; }).join(',').slice(0, 512) },
          body: JSON.stringify({ schema: SCHEMA, receipts: payloads }) })
          .then(function (r) {
            var h = {}; if (r.headers && r.headers.forEach) r.headers.forEach(function (v, k) { h[k.toLowerCase()] = v; });
            return r.text().then(function (t) { var b = null; try { b = t ? JSON.parse(t) : null; } catch (e) { b = null; } return { status: r.status, headers: h, body: b }; });
          });
      }
    };
  }

  /** Puts the fiscal footer in front of the last paper-cut command (GS V) of an ESC/POS receipt. No cut found: appends. */
  function withFiscalFooter(receipt, footer) {
    if (!footer || !footer.length) return receipt;
    var at = receipt.length;
    for (var i = receipt.length - 3; i >= 0; i--) if (receipt[i] === 0x1D && receipt[i + 1] === 0x56) { at = i; break; }
    var out = new Uint8Array(receipt.length + footer.length + 3); out.set(receipt.subarray(0, at), 0); out.set(footer, at);
    out.set([0x0A, 0x0A, 0x0A], at + footer.length); out.set(receipt.subarray(at), at + footer.length + 3);
    return out;
  }

  /** Apply a stored clearance to a printable receipt: the one call the print button needs. */
  function printableFooter(storage, terminalId, seq) {
    return storage.get(outboxKey(terminalId, seq)).then(function (rec) { return rec && rec.payload ? escposFiscalFooter(rec) : new Uint8Array(0); });
  }

  return {
    TAX: TAX, STATUS: STATUS, DEFAULTS: DEFAULTS, SCHEMA: SCHEMA,
    toCents: toCents, fmt: fmt, vatFromGross: vatFromGross, canon: canon,
    buildPayload: buildPayload, sealPayload: sealPayload, parseClearance: parseClearance,
    fiscalReceiptBlock: fiscalReceiptBlock, escposQr: escposQr, escposFiscalFooter: escposFiscalFooter, printableFooter: printableFooter, withFiscalFooter: withFiscalFooter,
    createFiscalOutbox: createFiscalOutbox, createTaxSyncWorker: createTaxSyncWorker, outboxKey: outboxKey, backoffMs: backoffMs, createHttpTransport: createHttpTransport, retryAfterMs: retryAfterMs
  };
});
