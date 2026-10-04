/* ============================== TAX RECORDS (NamRA ready) ==============================
   Glue between Pesa and the fiscal module (docs/efd/pesa-efd.js, embedded above as PesaEfd).
   OFF by default. When on, every sale also gets a numbered, hash-chained tax record saved on this device first
   and synced like any other record. Records are only sent anywhere when an https address and key are set.
   A sale never waits for any of this: every call below swallows its own errors. */
var Fiscal = (function(){
  var DEV_KEY = 'pesa_fiscal_dev_v1';          // this device only: terminal id, address, key (never synced)
  var alerts = { blocked:false, stuck:0, failed:0, error:'' };
  var inst = null, sig = '';

  function rj(){ try{ return JSON.parse(localStorage.getItem(DEV_KEY) || '{}') || {}; }catch(e){ return {}; } }
  function dev(){ return rj()[WS.id] || {}; }
  function saveDev(p){ var all = rj(); all[WS.id] = Object.assign({}, all[WS.id], p); try{ localStorage.setItem(DEV_KEY, JSON.stringify(all)); }catch(e){} }
  function shared(){ return (State.settings && State.settings.fiscal) || {}; }
  function cfg(){ var f = shared(), d = dev(); return { on:!!f.on, tin:String(f.tin||''), branchCode:String(f.branchCode||''), terminalId:String(d.terminalId||''), endpoint:String(d.endpoint||''), token:String(d.token||'') }; }
  function vatRate(){ var r = State.settings && State.settings.vatRate; return r != null ? (Number(r) || 0) : 15; }
  function rateBp(){ return Math.round(vatRate() * 100); }
  function cryptoOk(){ return !!(window.crypto && crypto.subtle && window.TextEncoder); }
  function ready(){ var c = cfg(); return !!(window.PesaEfd && c.on && c.tin && c.branchCode && c.terminalId && rateBp() > 0 && Store.mode() === 'local' && cryptoOk()); }
  function sendReady(){ var c = cfg(); return ready() && /^https:\/\/[^\s]+$/.test(c.endpoint) && !!c.token; }
  function on(){ return !!cfg().on && Store.mode() === 'local'; }

  /* storage for the module, on top of Pesa's local Store. Only this device's unsent records are handed to the queue. */
  function split(k){ var i = k.indexOf('/'); return [k.slice(0, i), k.slice(i + 1)]; }
  function coll(c){ return Store.raw.read()[WS.prefix + c] || {}; }
  function copy(v){ return JSON.parse(JSON.stringify(v)); }
  var storage = {
    get: function(k){ var p = split(k), v = coll(p[0])[p[1]]; return Promise.resolve(v ? copy(v) : null); },
    put: function(k, v){ var p = split(k); return Store.collection(p[0]).doc(p[1]).set(v); },
    list: function(prefix){
      var m = coll(prefix.replace(/\/$/, '')), tid = cfg().terminalId, out = [];
      Object.keys(m).forEach(function(id){ var r = m[id]; if(!r || r.status === 'CLEARED') return; if(r.payload && r.payload.seller && r.payload.seller.terminalId !== tid) return; out.push(copy(r)); });
      return Promise.resolve(out);
    },
    batch: function(ops){ return Store.batchSet(ops.map(function(o){ var p = split(o.put[0]); return { coll:p[0], id:p[1], data:o.put[1] }; })); }
  };
  function sha256(s){
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function(b){
      return Array.prototype.map.call(new Uint8Array(b), function(x){ return ('0' + x.toString(16)).slice(-2); }).join('');
    });
  }
  function seller(){
    var c = cfg(), co = State.company || {};
    return { tin:c.tin, vatNumber:co.vatNumber || '', name:co.companyName || co.tradingName || (State.settings && State.settings.shopName) || '', branchCode:c.branchCode, terminalId:c.terminalId };
  }
  function onEvent(e){
    if(e.type === 'blocked') alerts.blocked = true;
    else if(e.type === 'failed') alerts.failed++;
    else if(e.type === 'stuck') alerts.stuck++;
    else if(e.type === 'error') alerts.error = e.message;
    else if(e.type === 'cleared'){ alerts.blocked = false; }
    try{ if(typeof fiscalSheetRefresh === 'function') fiscalSheetRefresh(); }catch(x){}
  }
  function stop(){ if(inst && inst.worker) inst.worker.stop(); inst = null; sig = ''; }
  function ensure(){
    try{
      if(!ready()){ stop(); return null; }
      var c = cfg(), s = [c.tin, c.branchCode, c.terminalId, c.endpoint, c.token, rateBp()].join('|');
      if(inst && sig === s) return inst;
      stop(); sig = s;
      var conf = { standardRateBp:rateBp(), totalToleranceCents:50 };
      var outbox = PesaEfd.createFiscalOutbox({ storage:storage, sha256:sha256, config:conf }), worker = null;
      if(sendReady()){
        worker = PesaEfd.createTaxSyncWorker({ storage:storage, transport:PesaEfd.createHttpTransport({ url:c.endpoint, token:c.token }),
          online:function(){ return navigator.onLine !== false; }, onEvent:onEvent, config:conf });
        worker.start(window);
      }
      inst = { outbox:outbox, worker:worker };
      return inst;
    }catch(e){ return null; }
  }

  /* called from every place that records a sale. addP = the promise of the sale being saved. Never rejects, never blocks. */
  function track(sale, addP){
    return Promise.resolve(addP).then(function(ref){ return onSale(sale, ref && ref.id); }).catch(function(){ return null; });
  }
  function onSale(sale, saleId){
    try{
      var i = ensure(); if(!i) return Promise.resolve(null);
      var fs = {
        items:(sale.items || []).map(function(it){
          var p = it.productId ? State.products.find(function(x){ return x.id === it.productId; }) : null;
          return { productId:it.productId || null, name:it.name, qty:it.qty, unitPrice:it.unitPrice, taxCategory:(p && p.taxCategory) || 'STANDARD' };
        }),
        paymentMethod:sale.paymentMethod, customerName:sale.customerName || null, createdAt:sale.createdAt, total:sale.total
      };
      return i.outbox.enqueueSale(fs, saleId, seller()).then(function(r){
        if(r && r.ok){
          if(saleId){ try{ refs.sales.doc(saleId).update({ fiscalId:r.record.id }); }catch(e){} }
          if(i.worker) setTimeout(function(){ i.worker.tick(); }, 800);
        } else {
          alerts.error = (r && r.error) || 'ERROR';
          try{ toast(tr('Sale saved. Its tax record needs attention: open Settings, Tax records.')); }catch(e){}
        }
        try{ if(typeof fiscalSheetRefresh === 'function') fiscalSheetRefresh(); }catch(e){}
        return r;
      });
    }catch(e){ return Promise.resolve(null); }
  }

  function recordById(id){ if(!id) return null; var r = coll('fiscalOutbox')[id]; return r && r.payload ? r : null; }
  function visible(r){ return !!r && (r.status === 'CLEARED' || sendReady()); }
  /** ESC/POS bytes for the bottom of a receipt, or null when this receipt has no tax record to show. */
  function footerBytes(draft){
    try{ var r = recordById(draft && draft.fiscalKey); return visible(r) ? PesaEfd.escposFiscalFooter(r) : null; }catch(e){ return null; }
  }
  /** Text rows for the PDF receipt, or null. */
  function pdfInfo(draft){
    try{
      var r = recordById(draft && draft.fiscalKey); if(!visible(r)) return null;
      var blk = PesaEfd.fiscalReceiptBlock(r), ord = { STANDARD:0, ZERO_RATED:1, EXEMPT:2 }, pools = [];
      r.payload.totals.pools.slice().sort(function(a, b){ return ord[a.taxCategory] - ord[b.taxCategory]; }).forEach(function(q){
        if(q.taxCategory === 'STANDARD') pools.push({ label:'VAT ('+q.ratePct+'%) included', amount:parseFloat(q.vat) });
        else if(q.taxCategory === 'ZERO_RATED') pools.push({ label:'Zero rated sales', amount:parseFloat(q.gross) });
        else pools.push({ label:'Exempt sales', amount:parseFloat(q.gross) });
      });
      var lines = blk.lines.filter(function(l){ return l.indexOf('---') !== 0; });
      if(blk.qrUrl) lines.push('Verify: ' + blk.qrUrl);
      return { pools:pools, lines:lines };
    }catch(e){ return null; }
  }

  function hasHistory(){ var m = coll('fiscalMeta'), t = cfg().terminalId; return !!(t && m[t] && m[t].seq > 0); }
  function status(){
    var c = { PENDING:0, SUBMITTED:0, CLEARED:0, FAILED:0, MARKERS:0 }, m = coll('fiscalOutbox');
    Object.keys(m).forEach(function(id){ var r = m[id]; if(!r) return; if(!r.payload){ c.MARKERS++; return; } c[r.status] = (c[r.status] || 0) + 1; });
    var oldest = null; Object.keys(m).forEach(function(id){ var r = m[id]; if(r && r.payload && r.status !== 'CLEARED' && (!oldest || r.createdAt < oldest)) oldest = r.createdAt; });
    return { counts:c, oldest:oldest, alerts:alerts, ready:ready(), sending:sendReady() };
  }
  function failedList(){
    var m = coll('fiscalOutbox'), out = [];
    Object.keys(m).forEach(function(id){ var r = m[id]; if(r && r.status === 'FAILED') out.push({ id:id, ref:r.payload ? r.payload.invoice.number : id.replace(/^build-/, 'Sale '), error:r.lastError || '' }); });
    return out.slice(0, 20);
  }
  function sendNow(){ var i = ensure(); return i && i.worker ? i.worker.tick() : Promise.resolve(null); }
  function retryFailed(){ var i = ensure(); if(!i || !i.worker) return Promise.resolve(); return i.worker.retryFailed().then(function(){ alerts.failed = 0; return i.worker.tick(); }); }
  function resume(){ var i = ensure(); if(i && i.worker){ i.worker.resume(); alerts.blocked = false; return i.worker.tick(); } return Promise.resolve(); }

  return { cfg:cfg, saveDev:saveDev, ensure:ensure, stop:stop, on:on, ready:ready, sendReady:sendReady, rateBp:rateBp, vatRate:vatRate, track:track,
    footerBytes:footerBytes, pdfInfo:pdfInfo, hasHistory:hasHistory, status:status, failedList:failedList, sendNow:sendNow, retryFailed:retryFailed, resume:resume };
})();

var FX = { sheet:null };
function fiscalSheetRefresh(){
  var el = document.getElementById('fxStatus'); if(el) el.innerHTML = fiscalStatusHtml();
}
function fiscalStatusHtml(){
  var s = Fiscal.status(), c = s.counts, rows = [];
  function row(l, v){ return '<div style="display:flex;justify-content:space-between;gap:12px;padding:3px 0;"><span>'+esc(l)+'</span><strong class="num">'+esc(String(v))+'</strong></div>'; }
  rows.push(row(tr('Waiting to send'), c.PENDING + c.SUBMITTED)); rows.push(row(tr('Cleared'), c.CLEARED)); rows.push(row(tr('Needs attention'), c.FAILED + c.MARKERS));
  var msg = '';
  if(!s.ready) msg = tr('Not recording yet. Fill in every field above, turn it on and save.');
  else if(!s.sending) msg = tr('Recording tax records on this device. Nothing is sent: no address and key yet.');
  else if(s.alerts.blocked) msg = tr('Sending is stopped because the address or key was refused. Check them, then tap Resume.');
  else if(!navigator.onLine) msg = tr('Offline. Records are safe and will send when you are back online.');
  else msg = tr('Sending in the background.');
  var fl = Fiscal.failedList();
  return '<div style="font-size:13.5px;">'+rows.join('')+'</div><div style="font-size:12.5px;color:var(--text-muted);margin-top:6px;">'+esc(msg)+'</div>' +
    (fl.length ? '<div style="font-size:12.5px;margin-top:8px;">'+fl.map(function(f){ return '<div style="padding:2px 0;">'+esc(f.ref)+' <span style="color:var(--text-muted);">'+esc(f.error)+'</span></div>'; }).join('')+'</div>' : '');
}
function openFiscalSheet(){
  var c = Fiscal.cfg(), locked = Fiscal.hasHistory(), bp = Fiscal.rateBp();
  var html =
    '<div class="sheet-head"><h2>'+tr('Tax records (NamRA)')+'</h2></div>' +
    '<div class="banner" style="display:block;">'+tr('NamRA has not published its e-invoicing rules yet. Turn this on to keep a numbered, tamper-proof tax record of every sale on this device, ready for when it does. Nothing is sent to NamRA until you enter an address and key below. Selling never waits for tax or the internet.')+'</div>' +
    (bp > 0 ? '' : '<div class="banner" style="display:block;border-color:var(--danger,#b3261e);">'+tr('Set a VAT rate above 0 first (Reports, VAT summary). Tax records need it.')+'</div>') +
    '<div class="field"><label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="fxOn" style="width:auto;"'+(c.on?' checked':'')+'>'+tr('Keep tax records on this device')+'</label></div>' +
    '<div class="section-title">'+tr('Your business')+'</div>' +
    '<div class="field-row">' +
      '<div class="field"><label>'+tr('Tax number (TIN)')+'</label><input id="fxTin" autocomplete="off" value="'+esc(c.tin)+'" placeholder="e.g. 1234567890"></div>' +
      '<div class="field"><label>'+tr('Branch code')+'</label><input id="fxBranch" autocomplete="off" value="'+esc(c.branchCode)+'" placeholder="e.g. WDH01"></div>' +
    '</div>' +
    '<div class="section-title">'+tr('This device')+'</div>' +
    '<div class="field"><label>'+tr('Terminal ID')+'</label><input id="fxTerm" autocomplete="off" value="'+esc(c.terminalId)+'" placeholder="e.g. T01"'+(locked?' readonly':'')+'></div>' +
    '<div style="font-size:12px;color:var(--text-muted);margin:-4px 2px 10px;">'+(locked ? tr('Locked: this device already has tax records. Use a different Terminal ID on every other device.') : tr('Use a different Terminal ID on every computer or device. It cannot be changed after the first sale.'))+'</div>' +
    '<div class="field"><label>'+tr('NamRA address (https)')+' — '+tr('optional')+'</label><input id="fxUrl" autocomplete="off" value="'+esc(c.endpoint)+'" placeholder="https://"></div>' +
    '<div class="field"><label>'+tr('Access key')+' — '+tr('optional')+'</label><input id="fxKey" type="password" autocomplete="off" value="'+esc(c.token)+'"></div>' +
    '<div style="font-size:12px;color:var(--text-muted);margin:-4px 2px 10px;">'+tr('The address and key stay on this device only.')+'</div>' +
    '<div class="section-title">'+tr('Status')+'</div><div id="fxStatus" class="banner" style="display:block;">'+fiscalStatusHtml()+'</div>' +
    '<div class="actions"><button class="btn btn-ghost" id="fxSend" type="button">'+tr('Send now')+'</button><button class="btn btn-ghost" id="fxRetry" type="button">'+tr('Retry failed')+'</button><button class="btn btn-ghost" id="fxResume" type="button">'+tr('Resume')+'</button></div>' +
    '<div class="actions"><button class="btn btn-primary btn-block" id="fxSave" type="button">'+tr('Save')+'</button></div>';
  var ov = openSheet(html);
  function v(id){ return (ov.querySelector(id).value || '').trim(); }
  ov.querySelector('#fxSave').addEventListener('click', function(){
    var on = ov.querySelector('#fxOn').checked, tin = v('#fxTin'), br = v('#fxBranch'), term = v('#fxTerm'), url = v('#fxUrl'), key = v('#fxKey');
    if(on){
      if(!/^[0-9A-Za-z-]{4,20}$/.test(tin)) return toast(tr('Enter your tax number (TIN): letters, numbers and dashes, 4 to 20 characters.'));
      if(!/^[0-9A-Za-z-]{1,16}$/.test(br)) return toast(tr('Enter a branch code: letters, numbers and dashes, up to 16 characters.'));
      if(!/^[0-9A-Za-z-]{1,16}$/.test(term)) return toast(tr('Enter a Terminal ID for this device: letters, numbers and dashes, up to 16 characters.'));
      if(Fiscal.rateBp() <= 0) return toast(tr('Set a VAT rate above 0 first (Reports, VAT summary). Tax records need it.'));
    }
    if(url && !/^https:\/\/[^\s]+$/.test(url)) return toast(tr('The address must start with https://'));
    State.settings = Object.assign({}, State.settings, { fiscal:{ on:on, tin:tin, branchCode:br } });
    refs.settings.set(State.settings);
    Fiscal.saveDev({ terminalId:term, endpoint:url, token:key });
    try{ logAudit('update', 'tax records', null, on ? 'Tax records on' : 'Tax records off'); }catch(e){}
    Fiscal.ensure(); closeModal(); toast(tr('Saved'));
  });
  ov.querySelector('#fxSend').addEventListener('click', function(){ Fiscal.sendNow().then(fiscalSheetRefresh); toast(tr('Sending…')); });
  ov.querySelector('#fxRetry').addEventListener('click', function(){ Fiscal.retryFailed().then(fiscalSheetRefresh); });
  ov.querySelector('#fxResume').addEventListener('click', function(){ Fiscal.resume().then(fiscalSheetRefresh); });
}
