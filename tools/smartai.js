/* ============================== SMART AI: the Pesa AI Assistant's thinking layer ==============================
 * The assistant keeps its own rules first (open a page, add an expense, change a price, each with a Confirm step). Only when it does not
 * understand a question does it ask the shop's own Pesa AI server (supabase/functions/assistant). The server holds the model key; the phone
 * never does. The model can only ask the phone for read only facts (sales, stock, who owes, notes, a calculator, an attached CSV). It cannot
 * change, send or remove anything. Notes it uses are kept on this device, listed on screen and can be edited or deleted.
 * Wording avoids dashes on purpose. */
var AI_KEY = 'pesa_ai_v1', AI_MEMKEY = 'pesa_ai_mem_v1', AI_MAX_NOTES = 60, AI_NOTE_DAYS = 180, AI_MAX_ROUNDS = 4, AI_MAX_TOOLS = 8, AI_TOTAL_MS = 70000;
var _ai = { doc:null, docName:'', ctl:null, busy:false, tools:0 };
function aiCfg(){
  var c = {}; try{ c = JSON.parse(localStorage.getItem(AI_KEY) || '{}') || {}; }catch(e){}
  var url = String(c.url || '').trim(), key = String(c.key || '').trim(), on = c.on !== false;
  return { url:url, key:key, on:on, memory:c.memory !== false, ready:on && /^https:\/\/[^\s]+$/i.test(url) && key.length >= 8,
    device:c.device === true, deviceOnly:c.deviceOnly === true, blazeQ4:String(c.blazeQ4 || '').trim(), blazeQ8:String(c.blazeQ8 || '').trim() };
}
function aiSave(patch){ var c = {}; try{ c = JSON.parse(localStorage.getItem(AI_KEY) || '{}') || {}; }catch(e){} try{ localStorage.setItem(AI_KEY, JSON.stringify(Object.assign(c, patch))); }catch(e){} }
function aiReady(){
  try{
    if(!isManagerOrOwner()) return false;
    var c = aiCfg();
    if(c.device && blazeDeviceReady()) return true;                       // Blaze on this device needs no internet
    return c.ready && agentOnline() && !c.deviceOnly;                      // never the server when the owner chose on device only
  }catch(e){ return false; }
}

/* ---- notes the owner asked Pesa to remember: per business, on this device ---- */
function aiNotes(){
  var all = {}; try{ all = JSON.parse(localStorage.getItem(AI_MEMKEY) || '{}') || {}; }catch(e){}
  var list = Array.isArray(all[WS.id]) ? all[WS.id] : [], cut = Date.now() - AI_NOTE_DAYS * 86400000;
  return list.filter(function(n){ return n && n.text && (n.at || 0) > cut; });
}
function aiNotesSave(list){
  var all = {}; try{ all = JSON.parse(localStorage.getItem(AI_MEMKEY) || '{}') || {}; }catch(e){}
  all[WS.id] = list.slice(0, AI_MAX_NOTES); try{ localStorage.setItem(AI_MEMKEY, JSON.stringify(all)); }catch(e){}
}
function aiNoteAdd(text){
  text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300); if(!text) return null;
  var list = aiNotes(), n = { id:'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), text:text, at:Date.now() };
  aiNotesSave([n].concat(list)); return n;
}
function aiNoteEdit(id, text){ text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300); if(!text) return; aiNotesSave(aiNotes().map(function(n){ return n.id === id ? Object.assign({}, n, { text:text }) : n; })); }
function aiNoteDelete(id){ aiNotesSave(aiNotes().filter(function(n){ return n.id !== id; })); }
function aiNotesClear(){ aiNotesSave([]); }
function aiNoteWords(s){ return String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(function(w){ return w.length > 2; }); }
function aiNotesFor(q, max){
  var words = aiNoteWords(q);
  return aiNotes().map(function(n){ var nw = aiNoteWords(n.text); return { n:n, s:words.filter(function(w){ return nw.indexOf(w) >= 0; }).length }; })
    .filter(function(x){ return x.s > 0; }).sort(function(a, b){ return b.s - a.s || b.n.at - a.n.at; }).slice(0, max || 6).map(function(x){ return x.n; });
}

/* ---- exact arithmetic, no eval: + - * / ^ and brackets ---- */
function aiCalc(expr){
  var s = String(expr || '').replace(/[,\s]/g, '').replace(/n\$/gi, '').replace(/x/gi, '*'), i = 0;
  if(!s || s.length > 200 || /[^0-9.+\-*\/^()]/.test(s)) throw new Error('Only numbers and + - * / ^ ( ) are allowed');
  function num(){ var m = /^\d*\.?\d+/.exec(s.slice(i)); if(!m) throw new Error('Expected a number'); i += m[0].length; return parseFloat(m[0]); }
  function atom(){ if(s[i] === '('){ i++; var v = add(); if(s[i] !== ')') throw new Error('Missing )'); i++; return v; } if(s[i] === '-'){ i++; return -atom(); } if(s[i] === '+'){ i++; return atom(); } return num(); }
  function pow(){ var b = atom(); if(s[i] === '^'){ i++; return Math.pow(b, pow()); } return b; }
  function mul(){ var v = pow(); while(s[i] === '*' || s[i] === '/'){ var op = s[i++], r = pow(); if(op === '/'){ if(r === 0) throw new Error('Cannot divide by zero'); v = v / r; } else v = v * r; } return v; }
  function add(){ var v = mul(); while(s[i] === '+' || s[i] === '-'){ var op = s[i++], r = mul(); v = op === '+' ? v + r : v - r; } return v; }
  var res = add(); if(i < s.length) throw new Error('Unexpected ' + s[i]);
  if(!isFinite(res)) throw new Error('Not a finite number');
  return Math.round(res * 1e6) / 1e6;
}

/* ---- attached CSV: totals worked out here, not by the model ---- */
function aiCsvStats(text){
  var rows = (typeof lxParse === 'function' ? lxParse(text) : []).filter(function(r){ return r.some(function(c){ return String(c).trim() !== ''; }); });
  if(rows.length < 2) return { error:'The file needs a header row and at least one row of data.' };
  var head = rows[0].map(function(h, i){ return String(h).trim() || 'column ' + (i + 1); }), body = rows.slice(1, 5001), cols = [];
  head.slice(0, 30).forEach(function(h, c){
    var nums = []; body.forEach(function(r){ var raw = String(r[c] == null ? '' : r[c]).replace(/[N$\s]/gi, '').replace(/,(?=\d{3}\b)/g, ''); if(raw !== '' && isFinite(+raw)) nums.push(+raw); });
    var filled = body.filter(function(r){ return String(r[c] == null ? '' : r[c]).trim() !== ''; }).length;
    if(nums.length >= Math.max(2, filled * 0.6)){ var sum = nums.reduce(function(a, b){ return a + b; }, 0); cols.push({ column:h, kind:'number', count:nums.length, sum:Math.round(sum * 100) / 100, average:Math.round(sum / nums.length * 100) / 100, min:Math.min.apply(null, nums), max:Math.max.apply(null, nums) }); }
    else cols.push({ column:h, kind:'text', filled:filled, sample:body.slice(0, 3).map(function(r){ return String(r[c] == null ? '' : r[c]).slice(0, 40); }) });
  });
  return { rows:body.length, truncated:rows.length - 1 > body.length, columns:cols };
}

/* ---- the read only tools the model may ask the phone for ---- */
function aiToolRun(name, input){
  input = input || {};
  function cap(o){ var s = JSON.stringify(o); return s.length > 3000 ? s.slice(0, 3000) + '...' : s; }
  function money(n){ return Math.round((Number(n) || 0) * 100) / 100; }
  if(name === 'calc'){ var v = aiCalc(input.expression); return { text:cap({ expression:String(input.expression).slice(0, 200), result:v }), numbers:[v] }; }
  if(name === 'shop_summary'){
    var map = { today:'today', yesterday:'yesterday', week:'week', month:'this month', year:'year' }, p = brainPeriod(map[input.period] || 'today');
    var sales = (State.sales || []).filter(function(s){ var t = saleMs(s); return t >= p.s && t < p.e; }), exps = (State.expenses || []).filter(function(x){ var t = new Date(x.createdAt).getTime(); return t >= p.s && t < p.e; });
    var st = sales.reduce(function(a, s){ return a + (Number(s.total) || 0); }, 0), et = exps.reduce(function(a, x){ return a + (Number(x.amount) || 0); }, 0);
    var r = { period:p.label, salesTotal:money(st), salesCount:sales.length, expensesTotal:money(et), salesMinusExpenses:money(st - et), note:'salesMinusExpenses is not profit: it ignores the cost of goods sold' };
    return { text:cap(r), numbers:[r.salesTotal, r.expensesTotal, r.salesMinusExpenses] };
  }
  if(name === 'find_product'){
    var list = searchProducts(State.products || [], String(input.query || '')).slice(0, 5).map(function(x){ return { name:x.name, sellPrice:money(x.sellPrice), costPrice:money(x.costPrice), stock:x.isService ? 'service' : (Number(x.stockQty) || 0) }; });
    return { text:cap(list.length ? list : { result:'no product matched' }), numbers:list.reduce(function(a, x){ return a.concat([x.sellPrice, x.costPrice, x.stock]); }, []) };
  }
  if(name === 'low_stock'){
    var low = []; try{ low = reorderSuggestions().slice(0, 12).map(function(x){ return { name:x.product.name, stock:x.stock, suggestedOrder:x.qty }; }); }catch(e){}
    return { text:cap(low.length ? low : { result:'nothing is running low' }), numbers:low.reduce(function(a, x){ return a.concat([x.stock, x.suggestedOrder]); }, []) };
  }
  if(name === 'customers_owing'){
    var ow = (State.customers || []).filter(function(c){ return (c.balance || 0) > 0; }).slice(0, 10).map(function(c){ return { name:c.name, owes:money(c.balance) }; });
    return { text:cap(ow.length ? { customers:ow, total:money(ow.reduce(function(a, c){ return a + c.owes; }, 0)) } : { result:'nobody owes money' }), numbers:ow.map(function(c){ return c.owes; }) };
  }
  if(name === 'recall_memory'){
    var ns = aiCfg().memory ? aiNotesFor(input.query, 6) : [];
    return { text:cap(ns.length ? ns.map(function(n){ return n.text; }) : { result:'no saved note matches' }), numbers:[] };
  }
  if(name === 'remember') return { text:'Notes are saved only when the owner asks. Tell the owner to type: remember that ... and then confirm.', numbers:[], error:true };
  if(name === 'analyze_csv'){
    if(!_ai.doc) return { text:'No file is attached. Ask the owner to attach a CSV file first.', numbers:[], error:true };
    var a = aiCsvStats(_ai.doc); if(a.error) return { text:a.error, numbers:[], error:true };
    var nums = []; a.columns.forEach(function(c){ if(c.kind === 'number') nums.push(c.sum, c.average, c.min, c.max, c.count); });
    return { text:cap({ file:_ai.docName, data:a }), numbers:nums.concat([a.rows]) };
  }
  var bz = (typeof blazeToolRun === 'function') ? blazeToolRun(name, input) : null; if(bz) return bz;
  throw new Error('That tool is not available');
}

/* ---- check the amounts in an answer against what the tools returned ---- */
function aiUnverifiedAmounts(text, known){
  var bad = [], re = /N\$\s?(\d{1,3}(?:[ ,]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/g, m, seen = {};
  while((m = re.exec(String(text || '')))){
    var v = parseFloat(m[1].replace(/[ ,]/g, '')); if(!isFinite(v) || seen[v]) continue; seen[v] = 1;
    if(!known.some(function(k){ return Math.abs(k - v) < 0.011 || Math.abs(Math.round(k) - v) < 0.011; })) bad.push(m[0]);
  }
  return bad;
}

/* ---- ask the Pesa AI server, run the phone tools it asks for, repeat within strict limits ---- */
function aiAskServer(question){
  var c = aiCfg(); if(!c.ready) return Promise.reject(new Error('not_configured'));
  var known = [], t0 = Date.now(), rounds = 0, ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null, sources = [], used = [], last = null;
  _ai.ctl = ctl; _ai.busy = true; _ai.tools = 0;
  var msgs = [{ role:'user', content:String(question).slice(0, 1500) }];
  var meta = { shopName:(State.company && (State.company.tradingName || State.company.companyName)) || '' };
  var memory = c.memory ? aiNotesFor(question, 6).map(function(n){ return n.text; }) : [];
  function post(){
    if(Date.now() - t0 > AI_TOTAL_MS) return Promise.reject(new Error('timeout'));
    if(++rounds > AI_MAX_ROUNDS) return Promise.reject(new Error('too_many_steps'));
    return fetch(c.url, { method:'POST', signal:ctl ? ctl.signal : undefined, headers:{ 'Content-Type':'application/json', 'x-pesa-key':c.key }, body:JSON.stringify({ messages:msgs, meta:meta, memory:memory }) })
      .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ if(!r.ok){ var e = new Error(j.error || 'failed'); e.status = r.status; throw e; } return j; }); })
      .then(function(j){
        last = j; if(j.sources) sources = j.sources;
        if(j.done) return j;
        var calls = Array.isArray(j.calls) ? j.calls : [], results = (j.serverResults || []).slice();
        var jobs = calls.map(function(cl){
          if(++_ai.tools > AI_MAX_TOOLS){ return Promise.resolve({ type:'tool_result', tool_use_id:cl.id, content:'Tool limit reached.', is_error:true }); }
          return Promise.resolve().then(function(){ return aiToolRun(cl.name, cl.input); }).then(function(o){ used.push(cl.name); known = known.concat(o.numbers || []); return { type:'tool_result', tool_use_id:cl.id, content:'<untrusted_shop_data>' + o.text + '</untrusted_shop_data>', is_error:!!o.error }; },
            function(e){ return { type:'tool_result', tool_use_id:cl.id, content:'Tool failed: ' + String(e.message || e).slice(0, 120), is_error:true }; });
        });
        return Promise.all(jobs).then(function(rs){
          results = results.concat(rs);
          msgs = msgs.concat([{ role:'assistant', content:j.assistant }, { role:'user', content:results }]);
          return post();
        });
      });
  }
  return post().then(function(j){
    _ai.busy = false; _ai.ctl = null;
    var notes = (j.notes || []).slice(), odd = aiUnverifiedAmounts(j.text, known);
    if(odd.length) notes.push('Check these amounts yourself, they did not come from your records or the calculator: ' + odd.slice(0, 4).join(', ') + '.');
    var lines = sources.map(function(s){ return '[' + s.n + '] ' + s.title + ' ' + s.url; });
    var tr2 = j.trace || {};
    try{ logAudit('ai', 'assistant', null, 'AI answer, model ' + (tr2.model || '') + ', ' + (tr2.tokensIn || 0) + ' in, ' + (tr2.tokensOut || 0) + ' out, tools ' + used.join(',')); }catch(e){}   // no question or answer text in the log
    return { text:String(j.text || ''), lines:lines, notes:notes, trace:tr2 };
  }, function(e){ _ai.busy = false; _ai.ctl = null; throw e; });
}
/* where the question goes: Blaze on this device first when the owner turned it on and it is ready, else the shop's own server,
   else (and always when "never send shop data off this device" is on) nowhere: the normal assistant answers alone. */
function aiAsk(question){
  var c = aiCfg();
  if(c.device && blazeDeviceReady()) return blazeDeviceAsk(question);
  if(c.deviceOnly) return Promise.reject(new Error(c.device ? 'device_not_ready' : 'device_only'));
  return aiAskServer(question).then(function(a){ a.via = 'server'; return a; });
}
function aiCancel(){ try{ if(_ai.ctl) _ai.ctl.abort(); }catch(e){} _ai.busy = false; }
function aiErrorText(e){
  var m = String((e && e.message) || e), st = e && e.status;
  if(e && e.name === 'AbortError') return 'Cancelled. Nothing was changed.';
  if(m === 'daily_budget_reached') return 'The daily AI limit has been reached. It resets tomorrow. Your shop and the normal assistant keep working.';
  if(m === 'hourly_limit' || st === 429) return 'Too many AI questions this hour. Please try again a little later.';
  if(m === 'bad_key' || st === 401) return 'The AI key in Pesa AI settings is not accepted by the server. Check it with whoever set up the server.';
  if(m === 'not_configured' || st === 503) return 'The AI server is not fully set up yet.';
  if(m === 'device_only' || m === 'device_not_ready') return 'You chose to never send shop data off this device, and Blaze is not ready on this device. The normal assistant still works. Open Pesa AI settings to finish setting up Blaze.';
  if(m === 'device_weak') return 'This device is too weak to run Blaze. The normal assistant still works.';
  if(m === 'no_model_address') return 'The Blaze model file address is not set. Open Pesa AI settings.';
  if(m === 'empty_answer') return 'Blaze did not give an answer. Try asking in other words. Nothing was changed.';
  if(m === 'timeout' || m === 'too_many_steps') return 'That question needed too many steps. Try asking something smaller.';
  return 'I could not reach the AI service just now. The normal assistant still works. Nothing was changed.';
}

/* ---- settings and notes screens ---- */
function openAiSettingsSheet(){
  var c = aiCfg();
  var html = '<div class="sheet-head"><h2>' + tr('Pesa AI') + '</h2></div>' +
    '<div class="banner" style="display:block;">' + tr('When this is on, questions the assistant does not already know are sent to your own Pesa AI server, together with small facts it asks for from your shop, like totals. The server passes them to an AI service to write the answer. Passwords are never sent. The AI cannot change, send or remove anything. It can make mistakes, so check important figures.') + '</div>' +
    '<div class="field"><label>' + tr('Server address') + '</label><input id="aiUrl" type="url" inputmode="url" autocomplete="off" placeholder="https://yourproject.supabase.co/functions/v1/assistant" value="' + esc(c.url) + '"></div>' +
    '<div class="field"><label>' + tr('Access key') + '</label><input id="aiKey" type="password" autocomplete="off" value="' + esc(c.key) + '"></div>' +
    '<label class="check" style="display:flex;gap:8px;align-items:center;margin:8px 0;"><input id="aiOn" type="checkbox"' + (c.on ? ' checked' : '') + '> ' + tr('Use the AI for questions the assistant does not know') + '</label>' +
    '<label class="check" style="display:flex;gap:8px;align-items:center;margin:8px 0;"><input id="aiMem" type="checkbox"' + (c.memory ? ' checked' : '') + '> ' + tr('Let the AI use my saved notes') + '</label>' +
    '<div class="section-title" style="margin-top:14px;">' + tr('Blaze, your own AI') + '</div>' +
    '<div class="banner" style="display:block;">' + tr('Blaze is a small AI model that can run on this device. Questions then stay on this device: nothing is sent to a server. A small model can be wrong, so Pesa checks its figures against your shop numbers and tells you when an amount did not come from your records. It cannot change anything. It is not tax, legal or accounting advice.') + '</div>' +
    '<label class="check" style="display:flex;gap:8px;align-items:center;margin:8px 0;"><input id="aiDev" type="checkbox"' + (c.device ? ' checked' : '') + '> ' + tr('Run Blaze on this device') + '</label>' +
    '<label class="check" style="display:flex;gap:8px;align-items:center;margin:8px 0;"><input id="aiOnly" type="checkbox"' + (c.deviceOnly ? ' checked' : '') + '> ' + tr('Never send shop data off this device') + '</label>' +
    '<div class="field"><label>' + tr('Model file address, phones (small file)') + '</label><input id="aiQ4" type="url" inputmode="url" autocomplete="off" placeholder="https://huggingface.co/.../blaze-q4_k_m.gguf" value="' + esc(c.blazeQ4) + '"></div>' +
    '<div class="field"><label>' + tr('Model file address, computers (full size file)') + '</label><input id="aiQ8" type="url" inputmode="url" autocomplete="off" placeholder="https://huggingface.co/.../blaze-q8.gguf" value="' + esc(c.blazeQ8) + '"></div>' +
    '<div id="aiBzStatus" class="note" style="min-height:20px;"></div><div id="aiBzBar" style="display:none;height:8px;border-radius:6px;background:var(--border,#dfe6e1);overflow:hidden;margin:4px 0 8px;"><div id="aiBzFill" style="height:100%;width:0;background:var(--primary,#0B7A5C);"></div></div>' +
    '<div class="actions"><button class="btn btn-ghost btn-block" id="aiBzGo" type="button">' + tr('Download Blaze to this device') + '</button><button class="btn btn-ghost btn-block" id="aiBzStop" type="button" style="display:none;">' + tr('Cancel download') + '</button><button class="btn btn-ghost btn-block" id="aiBzDel" type="button">' + tr('Remove Blaze from this device') + '</button></div>' +
    '<div id="aiMsg" class="note" style="min-height:20px;"></div>' +
    '<div class="actions"><button class="btn btn-primary btn-block" id="aiSave" type="button">' + tr('Save') + '</button><button class="btn btn-ghost btn-block" id="aiTest" type="button">' + tr('Test the connection') + '</button><button class="btn btn-ghost btn-block" id="aiNotes" type="button">' + tr('My saved notes') + '</button><button class="btn btn-ghost btn-block" id="aiClose" type="button">' + tr('Close') + '</button></div>';
  var ov = openSheet(html), msg = ov.querySelector('#aiMsg');
  function read(){ return { url:ov.querySelector('#aiUrl').value.trim(), key:ov.querySelector('#aiKey').value.trim(), on:ov.querySelector('#aiOn').checked, memory:ov.querySelector('#aiMem').checked,
    device:ov.querySelector('#aiDev').checked, deviceOnly:ov.querySelector('#aiOnly').checked, blazeQ4:ov.querySelector('#aiQ4').value.trim(), blazeQ8:ov.querySelector('#aiQ8').value.trim() }; }
  var bzSt = ov.querySelector('#aiBzStatus'), bzBar = ov.querySelector('#aiBzBar'), bzFill = ov.querySelector('#aiBzFill'), bzGo = ov.querySelector('#aiBzGo'), bzStop = ov.querySelector('#aiBzStop'), bzCtl = null;
  function bzPaint(){ aiSave(read()); bzSt.textContent = tr(blazeStatusText()); bzGo.disabled = !ov.querySelector('#aiDev').checked; }
  ['#aiDev', '#aiOnly', '#aiQ4', '#aiQ8'].forEach(function(id){ ov.querySelector(id).addEventListener('change', bzPaint); });
  bzPaint();
  bzGo.addEventListener('click', function(){
    var v = read(); aiSave(v); var cap = blazeCapability();
    if(!cap.ok){ bzSt.textContent = tr(blazeStatusText()); return; }
    var url = blazeUrlFor(cap);
    if(!/^https:\/\/[^\s]+\.gguf(\?[^\s]*)?$/i.test(url || '')){ bzSt.textContent = tr('Enter the model file address first. It must start with https:// and end with .gguf'); return; }
    function run(){
      bzGo.style.display = 'none'; bzStop.style.display = ''; bzBar.style.display = 'block'; bzFill.style.width = '2%'; bzSt.textContent = tr('Downloading Blaze. Keep Pesa open.');
      var stopped = false; bzCtl = { stop:function(){ stopped = true; try{ blazeUnload(); }catch(e){} } };
      blazeLoad(function(p){ var pc = p && p.total ? Math.max(2, Math.min(99, Math.round(p.loaded / p.total * 100))) : 5; bzFill.style.width = pc + '%'; bzSt.textContent = tr('Downloading Blaze') + ' ' + pc + '%' + (p && p.total ? ' (' + fmtBytes(p.loaded) + ' of ' + fmtBytes(p.total) + ')' : ''); })
        .then(function(){ bzFill.style.width = '100%'; bzSt.textContent = tr('Blaze is ready on this device.'); bzGo.style.display = ''; bzStop.style.display = 'none'; bzBar.style.display = 'none'; bzPaint(); })
        .catch(function(e){ bzGo.style.display = ''; bzStop.style.display = 'none'; bzBar.style.display = 'none'; bzSt.textContent = stopped ? tr('Download cancelled.') : (/firewall/i.test(String((e && e.message) || e)) ? tr('The Pesa firewall blocked the download. In Strict mode, switch the firewall to Standard or allow the model host, then try again.') : tr('Blaze could not be loaded: ') + String((e && e.message) || e).slice(0, 120)); });
    }
    storageRoom(cap.quant, function(ok){ if(!ok){ bzSt.textContent = tr('There may not be enough free space on this device for Blaze (' + BLAZE_SIZES[cap.quant] + ').'); return; }
      if(blazeDownloaded()){ run(); return; }
      confirmSheet(tr('Download Blaze?'), tr('The Blaze model file is ' + BLAZE_SIZES[cap.quant] + '. It is downloaded once and kept on this device. Use Wi-Fi if you can, because it may use a lot of mobile data.'), tr('Download'), function(){ run(); }); });
  });
  bzStop.addEventListener('click', function(){ if(bzCtl) bzCtl.stop(); });
  ov.querySelector('#aiBzDel').addEventListener('click', function(){ blazeForget().then(function(){ bzPaint(); bzSt.textContent = tr('Blaze was removed from this device.'); }); });
  ov.querySelector('#aiSave').addEventListener('click', function(){ var v = read(); if(v.url && !/^https:\/\/[^\s]+$/i.test(v.url)){ msg.textContent = tr('The address must start with https://'); return; } aiSave(v); msg.textContent = tr('Saved'); });
  ov.querySelector('#aiTest').addEventListener('click', function(){
    var v = read(); if(!/^https:\/\/[^\s]+$/i.test(v.url) || v.key.length < 8){ msg.textContent = tr('Enter the address and the access key first'); return; }
    msg.textContent = tr('Testing…');
    fetch(v.url, { method:'POST', headers:{ 'Content-Type':'application/json', 'x-pesa-key':v.key }, body:JSON.stringify({ action:'ping' }) }).then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ return { r:r, j:j }; }); })
      .then(function(x){ msg.textContent = x.r.ok ? tr('Connected.') + ' ' + (x.j.search ? tr('Web search is on.') : tr('Web search is not set up.')) : tr(x.r.status === 401 ? 'The server refused the access key.' : 'The server answered, but it is not ready.'); }, function(){ msg.textContent = tr('Could not reach the server.'); });
  });
  ov.querySelector('#aiNotes').addEventListener('click', function(){ aiSave(read()); closeModal(); openAiNotesSheet(); });
  ov.querySelector('#aiClose').addEventListener('click', function(){ closeModal(); });
}
/* is there room for the model? Uses the browser's storage estimate when it has one, and says yes when it cannot tell */
function storageRoom(quant, cb){
  var need = quant === 'q8' ? 1.7e9 : 1.1e9;
  try{ if(navigator.storage && navigator.storage.estimate){ navigator.storage.estimate().then(function(e){ cb(!(e && e.quota && (e.quota - (e.usage || 0)) < need)); }, function(){ cb(true); }); return; } }catch(e){}
  cb(true);
}
function openAiNotesSheet(){
  var list = aiNotes();
  var html = '<div class="sheet-head"><h2>' + tr('My saved notes') + '</h2></div>' +
    '<div class="banner" style="display:block;">' + tr('These are the notes you asked Pesa to remember. They stay on this phone, only for this business, and are removed after 180 days. Edit or delete any of them. To add one, tell the assistant: remember that ...') + '</div>' +
    (list.length ? '<div class="rowlist">' + list.map(function(n){ return '<div class="row" data-note="' + esc(n.id) + '"><div class="main"><input class="aiNoteIn" data-id="' + esc(n.id) + '" maxlength="300" value="' + esc(n.text) + '" style="width:100%;"><div class="sub">' + esc(fmtDateTime(new Date(n.at).toISOString())) + '</div></div><div class="trail" style="display:flex;gap:6px;"><button class="btn btn-ghost" data-nsave="' + esc(n.id) + '" type="button">' + tr('Save') + '</button><button class="btn btn-ghost" data-ndel="' + esc(n.id) + '" type="button">' + tr('Delete') + '</button></div></div>'; }).join('') + '</div>' : '<div class="empty"><div class="t">' + tr('No saved notes') + '</div></div>') +
    '<div class="actions">' + (list.length ? '<button class="btn btn-ghost btn-block" id="aiClear" type="button">' + tr('Delete all notes') + '</button>' : '') + '<button class="btn btn-ghost btn-block" id="aiBack" type="button">' + tr('Back') + '</button></div>';
  var ov = openSheet(html);
  ov.querySelectorAll('[data-nsave]').forEach(function(b){ b.addEventListener('click', function(){ var id = b.getAttribute('data-nsave'); aiNoteEdit(id, ov.querySelector('.aiNoteIn[data-id="' + id + '"]').value); toast(tr('Saved')); }); });
  ov.querySelectorAll('[data-ndel]').forEach(function(b){ b.addEventListener('click', function(){ aiNoteDelete(b.getAttribute('data-ndel')); closeModal(); openAiNotesSheet(); }); });
  var cl = ov.querySelector('#aiClear'); if(cl) cl.addEventListener('click', function(){ confirmSheet(tr('Delete all notes?'), tr('This removes every saved note on this phone for this business.'), tr('Delete all'), function(){ aiNotesClear(); closeModal(); openAiNotesSheet(); }, true); });
  ov.querySelector('#aiBack').addEventListener('click', function(){ closeModal(); openAiSettingsSheet(); });
}
/* attach a CSV (or any text) file for questions about it. Spreadsheets: save as CSV first. */
function aiAttachPick(done){
  var f = document.createElement('input'); f.type = 'file'; f.accept = '.csv,.tsv,.txt,text/csv,text/plain'; f.style.display = 'none';
  f.addEventListener('change', function(){
    var file = f.files && f.files[0]; if(!file) return;
    if(file.size > 400000){ toast(tr('That file is too big. Use a file under 400 KB.')); return; }
    var r = new FileReader(); r.onload = function(){ var t = String(r.result || ''); if(/\u0000/.test(t.slice(0, 2000))){ toast(tr('That does not look like a CSV or text file.')); return; } _ai.doc = t.replace(/\t/g, ','); _ai.docName = String(file.name).slice(0, 60); done(_ai.docName); }; r.readAsText(file);
  });
  document.body.appendChild(f); f.click(); setTimeout(function(){ try{ f.remove(); }catch(e){} }, 60000);
}
