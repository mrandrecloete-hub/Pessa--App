/* ============================== BLAZE: the shop's own model (Qwen2.5 1.5B, fine tuned, GGUF) ==============================
 * Three ways it answers, all through the same read only tools and the same unverified amounts check:
 *   1. On this device (Settings, Pesa AI): the model file is downloaded once with the owner's yes, kept on the device, and run by
 *      the wllama library (llama.cpp compiled to WebAssembly, in a worker, so the screen never freezes). Nothing leaves the device.
 *   2. On the shop's own server (supabase/functions/assistant with LOCAL_AI_BASE_URL and a model named local:blaze).
 *   3. Rules only, when neither is available.
 * Blaze can only READ. Actions stay with the assistant's own confirmed commands. Everything a tool returns is wrapped as untrusted data.
 * Wording avoids dashes on purpose.
 *
 * The tool list below is generated from supabase/functions/_shared/aihandler.mjs (the server's whitelist). Run
 * node tools/blaze_training/sync_tools.mjs after changing a tool, then python3 tools/embed_block.py BLAZE blaze.js 'anchor'. */
var BLAZE_SYSTEM = 'You are Blaze, a helpful, friendly assistant built by Björn. Use the provided tools when they help.';
/*TOOLS:START*/
var BLAZE_TOOLS = [{"name":"calc","description":"Exact arithmetic. Use it for every sum, percentage, margin or total instead of working numbers out yourself.","parameters":{"type":"object","properties":{"expression":{"type":"string","maxLength":200}},"required":["expression"]}},{"name":"shop_summary","description":"Sales, count of sales and expenses for a period of this shop.","parameters":{"type":"object","properties":{"period":{"type":"string","enum":["today","yesterday","week","month","year"]}},"required":["period"]}},{"name":"find_product","description":"Look up products by name: price, cost and stock.","parameters":{"type":"object","properties":{"query":{"type":"string","maxLength":80}},"required":["query"]}},{"name":"low_stock","description":"Products running low or out of stock.","parameters":{"type":"object","properties":{},"required":[]}},{"name":"customers_owing","description":"Customers who owe money, largest first.","parameters":{"type":"object","properties":{},"required":[]}},{"name":"recall_memory","description":"Search the notes this shop owner asked Pesa to remember.","parameters":{"type":"object","properties":{"query":{"type":"string","maxLength":80}},"required":["query"]}},{"name":"remember","description":"Save a short note the owner asked you to remember. Only when the owner clearly asks. The owner can see and delete notes.","parameters":{"type":"object","properties":{"text":{"type":"string","maxLength":300}},"required":["text"]}},{"name":"analyze_csv","description":"Column totals, averages, minimums and maximums for the CSV or spreadsheet text the owner attached.","parameters":{"type":"object","properties":{},"required":[]}},{"name":"sales_by_period","description":"Sales total, number of sales, average sale and profit estimate for a period.","parameters":{"type":"object","properties":{"period":{"type":"string","enum":["today","yesterday","week","month","last_month","year"]}},"required":["period"]}},{"name":"top_products","description":"Best selling products by quantity for a period.","parameters":{"type":"object","properties":{"period":{"type":"string","enum":["week","month","year"]}},"required":["period"]}},{"name":"sales_by_staff","description":"Sales per staff member for a period.","parameters":{"type":"object","properties":{"period":{"type":"string","enum":["today","yesterday","week","month","last_month","year"]}},"required":["period"]}},{"name":"payment_methods","description":"Sales split by cash, card, wallet and credit for a period.","parameters":{"type":"object","properties":{"period":{"type":"string","enum":["today","yesterday","week","month","last_month","year"]}},"required":["period"]}},{"name":"stock_value","description":"Value of all stock at cost and at selling price.","parameters":{"type":"object","properties":{},"required":[]}},{"name":"stock_variances","description":"Expected stock against counted stock, in units, cost and cash value.","parameters":{"type":"object","properties":{},"required":[]}},{"name":"out_of_stock","description":"Products that are out of stock.","parameters":{"type":"object","properties":{},"required":[]}},{"name":"slow_movers","description":"Products in stock that did not sell in the last 30 days.","parameters":{"type":"object","properties":{},"required":[]}},{"name":"supplier_balances","description":"What the shop still owes each supplier.","parameters":{"type":"object","properties":{},"required":[]}},{"name":"supplier_reconciliation","description":"Supplier checks: statement difference, goods not invoiced, price differences.","parameters":{"type":"object","properties":{"supplier":{"type":"string","maxLength":80}},"required":[]}},{"name":"reconciliation_status","description":"Overall reconciliation status this month: stock, suppliers, cash and expenses.","parameters":{"type":"object","properties":{},"required":[]}},{"name":"customer_history","description":"One customer: balance owed, number of purchases, total bought, last purchase.","parameters":{"type":"object","properties":{"query":{"type":"string","maxLength":80}},"required":["query"]}},{"name":"expenses_summary","description":"Expenses total and biggest categories for a period.","parameters":{"type":"object","properties":{"period":{"type":"string","enum":["today","yesterday","week","month","last_month","year"]}},"required":["period"]}},{"name":"till_status","description":"The open till: cash, card, wallet and credit taken so far.","parameters":{"type":"object","properties":{},"required":[]}},{"name":"refunds_summary","description":"Refunds and voided sales for a period.","parameters":{"type":"object","properties":{"period":{"type":"string","enum":["today","yesterday","week","month","last_month","year"]}},"required":["period"]}},{"name":"vat_summary","description":"VAT collected, VAT paid and net VAT for a period. A record, not tax advice.","parameters":{"type":"object","properties":{"period":{"type":"string","enum":["month","last_month","year"]}},"required":["period"]}},{"name":"profit_and_loss","description":"Profit and loss from the books: revenue, cost of sales, expenses, net result.","parameters":{"type":"object","properties":{"period":{"type":"string","enum":["month","last_month","year"]}},"required":["period"]}},{"name":"forecast","description":"Estimated sales for the next 7 days.","parameters":{"type":"object","properties":{},"required":[]}},{"name":"compare_periods","description":"Sales this period against the one before.","parameters":{"type":"object","properties":{"kind":{"type":"string","enum":["week","month"]}},"required":["kind"]}},{"name":"unusual_days","description":"Days with unusually high or low sales.","parameters":{"type":"object","properties":{},"required":[]}},{"name":"alerts_and_notes","description":"Recent notes and warnings from the Pesa assistant. They are signs to check, not proof.","parameters":{"type":"object","properties":{},"required":[]}},{"name":"appointments","description":"Bookings for a day: how many, done, waiting, no shows, and who is next.","parameters":{"type":"object","properties":{"day":{"type":"string","enum":["yesterday","today","tomorrow"]}},"required":["day"]},"biz":"beauty"},{"name":"walk_in_queue","description":"Walk in clients waiting or in the chair right now.","parameters":{"type":"object","properties":{},"required":[]},"biz":"beauty"},{"name":"stylist_earnings","description":"Sales and commission per stylist for a period.","parameters":{"type":"object","properties":{"period":{"type":"string","enum":["today","week","month"]}},"required":["period"]},"biz":"beauty"},{"name":"top_services","description":"Most booked services by number sold for a period.","parameters":{"type":"object","properties":{"period":{"type":"string","enum":["week","month","year"]}},"required":["period"]},"biz":"beauty"},{"name":"service_prices","description":"Price and minutes for services, optionally matching a name.","parameters":{"type":"object","properties":{"query":{"type":"string","maxLength":80}},"required":[]},"biz":"beauty"},{"name":"occupancy","description":"Rooms occupied, arrivals and departures for a day.","parameters":{"type":"object","properties":{"day":{"type":"string","enum":["yesterday","today","tomorrow"]}},"required":["day"]},"biz":"hospitality"},{"name":"bookings_ahead","description":"Room bookings arriving in the next 14 days.","parameters":{"type":"object","properties":{},"required":[]},"biz":"hospitality"},{"name":"room_status","description":"Each room: free or occupied, clean or dirty.","parameters":{"type":"object","properties":{},"required":[]},"biz":"hospitality"},{"name":"open_tabs","description":"Open tabs and what each one owes.","parameters":{"type":"object","properties":{},"required":[]},"biz":"hospitality"},{"name":"room_revenue","description":"Room fees charged and the estimated tourism levy for a period.","parameters":{"type":"object","properties":{"period":{"type":"string","enum":["month","last_month","year"]}},"required":["period"]},"biz":"hospitality"},{"name":"licences_and_levy","description":"Licence and certificate renewal dates and days left.","parameters":{"type":"object","properties":{},"required":[]},"biz":"hospitality"}];
/*TOOLS:END*/
var BLAZE_SIZES = { q4:'about 1 GB', q8:'about 1.6 GB' };
var BLAZE_DL_KEY = 'pesa_blaze_dl_v1';
var _bz = { lib:null, w:null, loading:null, loadedUrl:'', busy:false };

/* tools for this business type only (salon tools for a salon, room tools for a lodge): a shorter list for a small model */
function blazeToolsFor(){ var b = (typeof bizType === 'function') ? bizType() : 'retail'; return BLAZE_TOOLS.filter(function(t){ return !t.biz || t.biz === b; }); }

/* ---- the Qwen2.5 chat format with tools, the same text the training data uses (tools/blaze_training/make_dataset.py) ---- */
function blazePrompt(system, tools, turns){
  var out = '<|im_start|>system\n' + system;
  if(tools && tools.length){
    out += '\n\n# Tools\n\nYou may call one or more functions to assist with the user query.\n\nYou are provided with function signatures within <tools></tools> XML tags:\n<tools>';
    tools.forEach(function(t){ out += '\n' + blazeToolLine(t); });
    out += '\n</tools>\n\nFor each function call, return a json object with function name and arguments within <tool_call></tool_call> XML tags:\n<tool_call>\n{"name": <function-name>, "arguments": <args-json-object>}\n</tool_call>';
  }
  out += '<|im_end|>\n';
  turns.forEach(function(m, i){
    if(m.role === 'user' || (m.role === 'assistant' && !(m.calls && m.calls.length))){ out += '<|im_start|>' + m.role + '\n' + m.content + '<|im_end|>\n'; }
    else if(m.role === 'assistant'){
      out += '<|im_start|>assistant';
      if(m.content) out += '\n' + m.content;
      m.calls.forEach(function(c){ out += '\n<tool_call>\n{"name": "' + c.name + '", "arguments": ' + blazeJson(c.arguments || {}) + '}\n</tool_call>'; });
      out += '<|im_end|>\n';
    } else if(m.role === 'tool'){
      if(i === 0 || turns[i - 1].role !== 'tool') out += '<|im_start|>user';
      out += '\n<tool_response>\n' + m.content + '\n</tool_response>';
      if(i === turns.length - 1 || turns[i + 1].role !== 'tool') out += '<|im_end|>\n';
    }
  });
  return out + '<|im_start|>assistant\n';
}
/* JSON the way Python and the chat template write it: ", " and ": " between items, no escaping of letters like ö */
function blazeJson(v){
  if(v === null || typeof v !== 'object') return JSON.stringify(v);
  if(Array.isArray(v)) return '[' + v.map(blazeJson).join(', ') + ']';
  return '{' + Object.keys(v).map(function(k){ return JSON.stringify(k) + ': ' + blazeJson(v[k]); }).join(', ') + '}';
}
/* the tool list line for one tool, in the same style */
function blazeToolLine(t){ return blazeJson({ type:'function', 'function':{ name:t.name, description:t.description, parameters:t.parameters } }); }

/* ---- read the model's answer: plain words and/or <tool_call> blocks ---- */
function blazeParse(text){
  text = String(text || '');
  var calls = [], re = /<tool_call>\s*([\s\S]*?)\s*(?:<\/tool_call>|$)/g, m;
  while((m = re.exec(text))){
    if(!m[1]) { if(re.lastIndex === m.index) re.lastIndex++; continue; }
    try{
      var j = JSON.parse(m[1]);
      if(j && typeof j.name === 'string') calls.push({ name:j.name, arguments:(j.arguments && typeof j.arguments === 'object' && !Array.isArray(j.arguments)) ? j.arguments : {} });
    }catch(e){}
    if(re.lastIndex === m.index) re.lastIndex++;
  }
  var cut = text.indexOf('<tool_call>');
  var plain = (cut >= 0 ? text.slice(0, cut) : text).replace(/<\|im_end\|>|<\|endoftext\|>/g, '').trim();
  return { text:plain, calls:calls };
}
/* the same checks as the server (checkToolInput in aihandler.mjs): known tool, known fields, strings, allowed values */
function blazeCheck(name, input){
  var t = BLAZE_TOOLS.filter(function(x){ return x.name === name; })[0]; if(!t) return 'unknown_tool';
  if(t.biz && typeof bizType === 'function' && t.biz !== bizType()) return 'not_for_this_business';
  if(!input || typeof input !== 'object' || Array.isArray(input)) return 'bad_input';
  var props = t.parameters.properties || {}, req = t.parameters.required || [];
  for(var i = 0; i < req.length; i++){ var v = input[req[i]]; if(typeof v !== 'string' || !v.trim()) return 'missing_' + req[i]; }
  var keys = Object.keys(input);
  for(var k = 0; k < keys.length; k++){
    var p = props[keys[k]]; if(!p) return 'unexpected_' + keys[k];
    if(typeof input[keys[k]] !== 'string') return 'bad_' + keys[k];
    if(p.enum && p.enum.indexOf(input[keys[k]]) < 0) return 'bad_' + keys[k];
    if(p.maxLength && input[keys[k]].length > p.maxLength) return 'too_long_' + keys[k];
  }
  return '';
}

/* ---- read only shop tools (everything returns small JSON and a numbers list for the unverified amounts check) ---- */
var BZ_PERIOD_WORDS = { today:'today', yesterday:'yesterday', week:'week', month:'this month', last_month:'last month', year:'year' };
function bzPeriod(k){ return brainPeriod(BZ_PERIOD_WORDS[k] || 'today'); }
function bzMoney(n){ return Math.round((Number(n) || 0) * 100) / 100; }
function bzSalesIn(p){ return (State.sales || []).filter(function(s){ var t = saleMs(s); return t >= p.s && t < p.e; }); }
function bzCap(o){ var s = JSON.stringify(o); return s.length > 3000 ? s.slice(0, 3000) + '...' : s; }
function bzOut(o, nums){ return { text:bzCap(o), numbers:nums || [] }; }
function bzDate(ms){ try{ return todayKey(new Date(ms)); }catch(e){ return ''; } }
function bzRange(kind){   // 'month' | 'last_month' | 'year' as date keys for the books
  var now = new Date(), a, b;
  if(kind === 'last_month'){ a = new Date(now.getFullYear(), now.getMonth() - 1, 1); b = new Date(now.getFullYear(), now.getMonth(), 0); }
  else if(kind === 'year'){ a = new Date(now.getFullYear(), 0, 1); b = now; }
  else { a = new Date(now.getFullYear(), now.getMonth(), 1); b = now; }
  return { from:todayKey(a), to:todayKey(b) };
}
function blazeToolRun(name, input){
  input = input || {};
  if(!isManagerOrOwner()) throw new Error('Only the owner or a manager can use this tool');
  if(name === 'sales_by_period'){
    var p = bzPeriod(input.period), all = bzSalesIn(p), sales = all.filter(function(s){ return !s.refundOf; }), refs = all.filter(function(s){ return s.refundOf; });
    var tot = all.reduce(function(a, s){ return a + (Number(s.total) || 0); }, 0), cost = sales.reduce(function(a, s){ return a + (Number(s.cost) || 0); }, 0), noCost = sales.filter(function(s){ return !(Number(s.cost) > 0); }).length;
    var rt = refs.reduce(function(a, s){ return a + Math.abs(Number(s.total) || 0); }, 0);
    var r = { period:p.label, salesAfterRefunds:bzMoney(tot), numberOfSales:sales.length, averageSale:sales.length ? bzMoney(sales.reduce(function(a, s){ return a + (Number(s.total) || 0); }, 0) / sales.length) : 0, refundsAndVoids:bzMoney(rt), profitEstimate:bzMoney(tot - cost), salesWithoutCostPrice:noCost, note:'profitEstimate is only reliable when every sale has a cost price' };
    return bzOut(r, [r.salesAfterRefunds, r.averageSale, r.refundsAndVoids, r.profitEstimate]);
  }
  if(name === 'top_products'){
    var days = input.period === 'year' ? 365 : input.period === 'month' ? 30 : 7, v = smartVelocity(days);
    var arr = Object.keys(v).map(function(k){ return v[k]; }).sort(function(a, b){ return b.qty - a.qty; }).slice(0, 6).map(function(x){ return { name:x.name, unitsSold:Math.round(x.qty * 100) / 100, sales:bzMoney(x.revenue) }; });
    return bzOut(arr.length ? { lastDays:days, products:arr } : { result:'no sales in that time' }, arr.reduce(function(a, x){ return a.concat([x.unitsSold, x.sales]); }, []));
  }
  if(name === 'sales_by_staff'){
    var sp = bzPeriod(input.period), by = {};
    bzSalesIn(sp).forEach(function(s){ var k = s.cashierName || 'Not recorded', m = by[k] || (by[k] = { name:k, sales:0, total:0 }); if(!s.refundOf) m.sales++; m.total += Number(s.total) || 0; });
    var rows = Object.keys(by).map(function(k){ return { name:k, numberOfSales:by[k].sales, total:bzMoney(by[k].total) }; }).sort(function(a, b){ return b.total - a.total; }).slice(0, 8);
    return bzOut(rows.length ? { period:sp.label, staff:rows } : { result:'no sales in that time' }, rows.reduce(function(a, x){ return a.concat([x.total]); }, []));
  }
  if(name === 'payment_methods'){
    var pp = bzPeriod(input.period), pm = {};
    bzSalesIn(pp).forEach(function(s){ var k = s.paymentMethod || 'cash'; pm[k] = (pm[k] || 0) + salePaidAmt(s); var vA = saleVoucherAmt(s); if(vA && k !== 'voucher') pm.voucher = (pm.voucher || 0) + vA; });
    var o = { period:pp.label }; Object.keys(pm).forEach(function(k){ o[k] = bzMoney(pm[k]); });
    return bzOut(Object.keys(pm).length ? o : { result:'no sales in that time' }, Object.keys(pm).map(function(k){ return bzMoney(pm[k]); }));
  }
  if(name === 'stock_value'){
    var t = stockTotals(), r2 = { products:t.items, unitsInStock:Math.round(t.qty * 100) / 100, valueAtCost:bzMoney(t.cost), valueAtSellingPrice:bzMoney(t.retail), productsOutOfStock:t.out };
    return bzOut(r2, [r2.products, r2.unitsInStock, r2.valueAtCost, r2.valueAtSellingPrice, r2.productsOutOfStock]);
  }
  if(name === 'stock_variances'){
    var base = rcBaseline(); if(!base) return bzOut({ result:'No stock count baseline is set yet. Start one on the Reconciliation page, Stock variance.' }, []);
    var mv = rcStockMovement(base), vr = { since:String(base.at).slice(0, 10), unitsDifference:bzMoney(mv.v.q), costDifference:bzMoney(mv.v.c), cashValueDifference:bzMoney(mv.v.r), note:'a minus number means less stock than expected' };
    return bzOut(vr, [vr.unitsDifference, vr.costDifference, vr.cashValueDifference]);
  }
  if(name === 'out_of_stock'){
    var oos = (State.products || []).filter(function(x){ return !x.isService && !x.isMock && x.stockQty != null && Number(x.stockQty) <= 0; });
    return bzOut(oos.length ? { count:oos.length, products:oos.slice(0, 15).map(function(x){ return x.name; }) } : { result:'nothing is out of stock' }, [oos.length]);
  }
  if(name === 'slow_movers'){
    var vel = smartVelocity(30), slow = (State.products || []).filter(function(x){ return !x.isService && !x.isMock && Number(x.stockQty) > 0 && !vel[x.id]; })
      .map(function(x){ return { name:x.name, stock:Number(x.stockQty) || 0, costValue:bzMoney((Number(x.costPrice) || 0) * (Number(x.stockQty) || 0)) }; }).sort(function(a, b){ return b.costValue - a.costValue; });
    var top = slow.slice(0, 10);
    return bzOut(slow.length ? { count:slow.length, biggestFirst:top } : { result:'everything in stock sold in the last 30 days' }, [slow.length].concat(top.reduce(function(a, x){ return a.concat([x.stock, x.costValue]); }, [])));
  }
  if(name === 'supplier_balances'){
    var sb = (State.suppliers || []).map(function(s){ var d = rcSupplierData(s.id); return { supplier:s.name, owed:bzMoney(d.owed) }; }).filter(function(x){ return x.owed > 0; }).sort(function(a, b){ return b.owed - a.owed; }).slice(0, 10);
    return bzOut(sb.length ? { suppliers:sb, total:bzMoney(sb.reduce(function(a, x){ return a + x.owed; }, 0)) } : { result:'no supplier balance is owed' }, sb.map(function(x){ return x.owed; }).concat([bzMoney(sb.reduce(function(a, x){ return a + x.owed; }, 0))]));
  }
  if(name === 'supplier_reconciliation'){
    var q = String(input.supplier || '').toLowerCase().trim(), nums = [];
    var sr = (State.suppliers || []).filter(function(s){ return !q || String(s.name || '').toLowerCase().indexOf(q) >= 0; }).slice(0, 10).map(function(s){
      var d = rcSupplierData(s.id), row = { supplier:s.name, owedByRecords:bzMoney(d.owed), statementDifference:d.diff == null ? 'no statement entered' : bzMoney(d.diff), goodsNotInvoiced:d.uninv.length, priceDifferences:d.priceDiffs.length, allMatched:!!rcSupplierOk(d) };
      nums.push(row.owedByRecords); if(typeof row.statementDifference === 'number') nums.push(row.statementDifference); return row;
    });
    return bzOut(sr.length ? { suppliers:sr } : { result:q ? 'no supplier matched' : 'no suppliers yet' }, nums);
  }
  if(name === 'reconciliation_status'){
    var now = new Date(), f = todayKey(new Date(now.getFullYear(), now.getMonth(), 1)), t2 = todayKey(), rg = { f:f, t:t2, a:new Date(f + 'T00:00:00').getTime(), b:new Date(t2 + 'T00:00:00').getTime() + 86400000 };
    var base2 = rcBaseline(), out = { from:f, to:t2 }, nm = [];
    if(base2){ var m2 = rcStockMovement(base2); out.stockCashValueDifference = bzMoney(m2.v.r); nm.push(out.stockCashValueDifference); } else out.stockCashValueDifference = 'no stock baseline yet';
    var sups = (State.suppliers || []).map(function(s){ return rcSupplierData(s.id); }); out.suppliersChecked = sups.length; out.suppliersNeedingAttention = sups.filter(function(d){ return !rcSupplierOk(d); }).length; nm.push(out.suppliersChecked, out.suppliersNeedingAttention);
    var days = rcSalesData(rg); out.tillVariance = bzMoney(days.reduce(function(a, d){ return a + d.tillVar; }, 0)); out.cardBatchVariance = bzMoney(days.reduce(function(a, d){ return a + d.cardVar; }, 0)); nm.push(out.tillVariance, out.cardBatchVariance);
    var ex = rcExpensesData(rg); out.expensesNotReconciled = ex.open; out.expensesTotal = bzMoney(ex.total); nm.push(out.expensesNotReconciled, out.expensesTotal);
    return bzOut(out, nm);
  }
  if(name === 'customer_history'){
    var cq = String(input.query || '').toLowerCase().trim(), cs = (State.customers || []).filter(function(c){ return String(c.name || '').toLowerCase().indexOf(cq) >= 0; });
    if(!cs.length) return bzOut({ result:'no customer matched' }, []);
    if(cs.length > 1 && !cs.some(function(c){ return String(c.name).toLowerCase() === cq; })) return bzOut({ result:'several customers match, ask which one', names:cs.slice(0, 6).map(function(c){ return c.name; }) }, []);
    var c = cs.filter(function(x){ return String(x.name).toLowerCase() === cq; })[0] || cs[0];
    var mine = (State.sales || []).filter(function(s){ return !s.refundOf && (s.customerId === c.id || (!s.customerId && s.customerName && s.customerName === c.name)); }), last = mine.reduce(function(a, s){ return Math.max(a, saleMs(s)); }, 0);
    var h = { name:c.name, owes:bzMoney(c.balance), creditLimit:bzMoney(c.creditLimit), purchases:mine.length, totalBought:bzMoney(mine.reduce(function(a, s){ return a + (Number(s.total) || 0); }, 0)), lastPurchase:last ? bzDate(last) : 'none recorded' };
    return bzOut(h, [h.owes, h.creditLimit, h.purchases, h.totalBought]);
  }
  if(name === 'expenses_summary'){
    var ep = bzPeriod(input.period), ex2 = (State.expenses || []).filter(function(x){ var t = new Date(x.createdAt).getTime(); return t >= ep.s && t < ep.e; }), cat = {};
    ex2.forEach(function(x){ var k = x.category || 'Other'; cat[k] = (cat[k] || 0) + (Number(x.amount) || 0); });
    var cats = Object.keys(cat).map(function(k){ return { category:k, total:bzMoney(cat[k]) }; }).sort(function(a, b){ return b.total - a.total; }).slice(0, 5), et = ex2.reduce(function(a, x){ return a + (Number(x.amount) || 0); }, 0);
    return bzOut(ex2.length ? { period:ep.label, total:bzMoney(et), count:ex2.length, biggest:cats } : { period:ep.label, result:'no expenses recorded' }, [bzMoney(et)].concat(cats.map(function(x){ return x.total; })));
  }
  if(name === 'till_status'){
    var tl = State.till && State.till.current;
    if(!tl) { var cl = (State.tillSessions || []).filter(function(x){ return x.status === 'closed'; }).sort(function(a, b){ return String(b.closedAt).localeCompare(String(a.closedAt)); })[0]; return bzOut(cl ? { result:'no till is open', lastClosedTill:{ closed:bzDate(new Date(cl.closedAt).getTime()), variance:bzMoney(cl.variance) } } : { result:'no till is open' }, cl ? [bzMoney(cl.variance)] : []); }
    var tt = tillTotals(tl.id), ts = { openedBy:tl.cashierName || '', openedAt:String(tl.openedAt || '').slice(0, 16).replace('T', ' '), numberOfSales:tt.saleCount, cash:bzMoney(tt.totals.cash), card:bzMoney(tt.totals.card), wallet:bzMoney(tt.totals.wallet), credit:bzMoney(tt.totals.credit) };
    return bzOut(ts, [ts.numberOfSales, ts.cash, ts.card, ts.wallet, ts.credit]);
  }
  if(name === 'refunds_summary'){
    var rp = bzPeriod(input.period), rf = bzSalesIn(rp).filter(function(s){ return s.refundOf; }), voids = rf.filter(function(s){ return s.type === 'void'; }), refd = rf.filter(function(s){ return s.type !== 'void'; });
    var sum = function(a){ return bzMoney(a.reduce(function(x, s){ return x + Math.abs(Number(s.total) || 0); }, 0)); };
    var rr = { period:rp.label, refunds:refd.length, refundsTotal:sum(refd), voidedSales:voids.length, voidedTotal:sum(voids) };
    return bzOut(rf.length ? rr : { period:rp.label, result:'no refunds or voids' }, [rr.refunds, rr.refundsTotal, rr.voidedSales, rr.voidedTotal]);
  }
  if(name === 'vat_summary' || name === 'profit_and_loss'){
    var rg2 = bzRange(input.period);
    return acctGather().then(function(G){
      var B = acctBuild(G), v = acctView(G, B, rg2.from, rg2.to), c100 = function(x){ return bzMoney((Number(x) || 0) / 100); };
      if(name === 'vat_summary'){
        if(!G.vatVendor) return bzOut({ period:rg2.from + ' to ' + rg2.to, result:'This business has no VAT registration recorded in Pesa, so no VAT is posted.', note:'to be confirmed with the relevant legal bodies, authorities and entities of Namibia' }, []);
        var vo = { period:rg2.from + ' to ' + rg2.to, vatCollected:c100(v.vat.outputVat), vatPaidOnPurchases:c100(v.vat.inputVat), netVat:c100(v.vat.netPayable), note:'a record from your books, not tax advice. Amounts and rules are to be confirmed with the relevant legal bodies, authorities and entities of Namibia' };
        return bzOut(vo, [vo.vatCollected, vo.vatPaidOnPurchases, vo.netVat]);
      }
      var pl = v.pl, warn = v.checks.filter(function(x){ return x.level === 'warn' || x.level === 'fail'; }).length;
      var po = { period:rg2.from + ' to ' + rg2.to, revenue:c100(pl.revenue), costOfSales:c100(pl.cogs), wastage:c100(pl.wastage), grossProfit:c100(pl.grossProfit), expenses:c100(pl.opex), netResult:c100(pl.net), checksNeedingAttention:warn, note:'from the books engine, not accounting advice' };
      return bzOut(po, [po.revenue, po.costOfSales, po.wastage, po.grossProfit, po.expenses, po.netResult]);
    });
  }
  if(name === 'forecast'){
    var fc = liForecast(7); if(fc.error) return bzOut({ result:fc.error }, []);
    var fo = { next7Days:bzMoney(fc.total), likelyLow:bzMoney(fc.low), likelyHigh:bzMoney(fc.high), basedOnDays:fc.basis, note:'an estimate from past sales, not a promise' };
    return bzOut(fo, [fo.next7Days, fo.likelyLow, fo.likelyHigh, fo.basedOnDays]);
  }
  if(name === 'compare_periods'){
    var cp = liCompare(input.kind === 'month' ? 'month' : 'week'), ch = cp.b.t > 0 ? Math.round((cp.a.t - cp.b.t) / cp.b.t * 1000) / 10 : null;
    var co = { current:cp.la, currentSales:bzMoney(cp.a.t), currentCount:cp.a.n, before:cp.lb, beforeSales:bzMoney(cp.b.t), beforeCount:cp.b.n, changePercent:ch == null ? 'no sales before to compare with' : ch };
    return bzOut(co, [co.currentSales, co.currentCount, co.beforeSales, co.beforeCount].concat(ch == null ? [] : [ch]));
  }
  if(name === 'unusual_days'){
    var un = liUnusual(); if(un.error) return bzOut({ result:un.error }, []);
    var ul = un.flagged.map(function(x){ return { date:x.k, sales:bzMoney(x.v), usualForThatWeekday:bzMoney(x.usual), unusually:x.z > 0 ? 'high' : 'low' }; });
    return bzOut(ul.length ? { days:ul } : { result:'no unusual days found' }, ul.reduce(function(a, x){ return a.concat([x.sales, x.usualForThatWeekday]); }, []));
  }
  if(name === 'alerts_and_notes'){
    var an = agentNotesList().filter(function(n){ return n.status !== 'dismissed'; }).slice(0, 8).map(function(n){ return { date:String(n.createdAt || '').slice(0, 10), level:n.level || 'info', title:String(n.title || '').slice(0, 80), text:String(n.body || n.text || '').slice(0, 160) }; });
    return bzOut(an.length ? { notes:an, warning:'these are signs to check, not proof' } : { result:'no notes from the assistant right now' }, []);
  }
  /* ---- barbershop and salon ---- */
  if(name === 'appointments' || name === 'walk_in_queue' || name === 'stylist_earnings' || name === 'top_services' || name === 'service_prices'){
    if(bizType() !== 'beauty') return bzOut({ result:'This business is not set up as a barbershop or salon, so it has no bookings or stylists.' }, []);
    if(name === 'appointments'){
      var dk = vAddDays(todayKey(), input.day === 'tomorrow' ? 1 : input.day === 'yesterday' ? -1 : 0), ap = vApptsOn(dk), cnt = function(st){ return ap.filter(function(a){ return a.status === st; }).length; };
      var todo = ap.filter(function(a){ return a.status !== 'done' && a.status !== 'noshow'; }).sort(function(a, b){ return String(a.time).localeCompare(String(b.time)); });
      var ao = { day:input.day, date:dk, bookings:ap.length, done:cnt('done'), waiting:cnt('waiting'), noShows:cnt('noshow'), stillToCome:todo.length, next:todo.slice(0, 5).map(function(a){ return { time:a.time || '', client:String(a.clientName || '').slice(0, 40), services:(a.serviceNames || []).join(', ').slice(0, 60), stylist:a.stylistName || '' }; }) };
      return bzOut(ap.length ? ao : { day:input.day, date:dk, result:'no bookings' }, [ao.bookings, ao.done, ao.waiting, ao.noShows, ao.stillToCome]);
    }
    if(name === 'walk_in_queue'){
      var q = vApptsOn(todayKey()).filter(function(a){ return a.status === 'waiting' || a.status === 'inchair'; }).sort(function(a, b){ return String(a.time).localeCompare(String(b.time)); });
      var qo = { waiting:q.filter(function(a){ return a.status === 'waiting'; }).length, inTheChair:q.filter(function(a){ return a.status === 'inchair'; }).length, clients:q.slice(0, 8).map(function(a){ return { client:String(a.clientName || '').slice(0, 40), service:(a.serviceNames || []).join(', ').slice(0, 50), since:a.time || '', status:a.status === 'inchair' ? 'in the chair' : 'waiting' }; }) };
      return bzOut(q.length ? qo : { result:'nobody is waiting or in the chair' }, [qo.waiting, qo.inTheChair]);
    }
    if(name === 'stylist_earnings'){
      var now2 = new Date(), start = input.period === 'month' ? new Date(now2.getFullYear(), now2.getMonth(), 1).getTime() : input.period === 'week' ? Date.now() - 7 * 86400000 : new Date(todayKey() + 'T00:00:00').getTime(), nums2 = [];
      var rows2 = vStaff().map(function(u){
        var mine = (State.sales || []).filter(function(s){ return s.stylistId === u.id && !s.refundOf && saleMs(s) >= start; }), tot = vSum(mine, function(s){ return s.total; }), pct = Number(u.commissionPct) || 0;
        return { stylist:u.name, jobs:mine.length, sales:bzMoney(tot), commissionPercent:pct, commissionEarned:bzMoney(tot * pct / 100), weeklyChairRent:bzMoney(u.chairRent) };
      }).filter(function(r){ return r.jobs > 0 || r.commissionPercent > 0; }).sort(function(a, b){ return b.sales - a.sales; }).slice(0, 8);
      rows2.forEach(function(r){ nums2.push(r.jobs, r.sales, r.commissionPercent, r.commissionEarned, r.weeklyChairRent); });
      return bzOut(rows2.length ? { period:input.period, stylists:rows2, note:'commission is worked out from sales charged through bookings and the walk in queue' } : { period:input.period, result:'no sales linked to a stylist yet' }, nums2);
    }
    if(name === 'top_services'){
      var days2 = input.period === 'year' ? 365 : input.period === 'month' ? 30 : 7, since = Date.now() - days2 * 86400000, svc = {}, byId = {}; (State.products || []).forEach(function(x){ byId[x.id] = x; });
      (State.sales || []).forEach(function(s){ if(s.refundOf || saleMs(s) < since) return; (s.items || []).forEach(function(it){ var pr = byId[it.productId]; if(!(pr && pr.isService)) return; var m = svc[it.name] || (svc[it.name] = { name:it.name, times:0, sales:0 }); m.times += Number(it.qty) || 0; m.sales += Number(it.lineTotal) || 0; }); });
      var ts = Object.keys(svc).map(function(k){ return { service:svc[k].name, timesSold:Math.round(svc[k].times * 100) / 100, sales:bzMoney(svc[k].sales) }; }).sort(function(a, b){ return b.timesSold - a.timesSold; }).slice(0, 6);
      return bzOut(ts.length ? { lastDays:days2, services:ts } : { result:'no services sold in that time' }, ts.reduce(function(a, x){ return a.concat([x.timesSold, x.sales]); }, []));
    }
    var sq = String(input.query || '').toLowerCase().trim(), sv = vServices().filter(function(x){ return !sq || String(x.name || '').toLowerCase().indexOf(sq) >= 0; }).slice(0, 12).map(function(x){ return { service:x.name, price:bzMoney(x.sellPrice), minutes:Number(x.durationMin) || 30 }; });
    return bzOut(sv.length ? { services:sv } : { result:sq ? 'no service matched' : 'no services set up yet' }, sv.reduce(function(a, x){ return a.concat([x.price, x.minutes]); }, []));
  }
  /* ---- hospitality ---- */
  if(name === 'occupancy' || name === 'bookings_ahead' || name === 'room_status' || name === 'open_tabs' || name === 'room_revenue' || name === 'licences_and_levy'){
    if(bizType() !== 'hospitality') return bzOut({ result:'This business is not set up as hospitality, so it has no rooms or tabs.' }, []);
    if(name === 'occupancy'){
      var hd = vAddDays(todayKey(), input.day === 'tomorrow' ? 1 : input.day === 'yesterday' ? -1 : 0), rooms = vRooms(), stays = vStaysOn(hd), occ = {}; stays.forEach(function(b){ occ[b.roomId] = 1; });
      var allb = vList('hosBookings').filter(function(b){ return b.status !== 'cancelled'; }), oc = Object.keys(occ).length;
      var oo = { day:input.day, date:hd, rooms:rooms.length, occupied:oc, occupancyPercent:rooms.length ? Math.round(oc * 100 / rooms.length) : 0, arriving:allb.filter(function(b){ return b.checkIn === hd; }).length, leaving:allb.filter(function(b){ return b.checkOut === hd; }).length };
      return bzOut(rooms.length ? oo : { result:'no rooms are set up yet' }, [oo.rooms, oo.occupied, oo.occupancyPercent, oo.arriving, oo.leaving]);
    }
    if(name === 'bookings_ahead'){
      var t0 = todayKey(), t14 = vAddDays(t0, 14), up = vList('hosBookings').filter(function(b){ return b.status !== 'cancelled' && b.status !== 'out' && b.checkIn >= t0 && b.checkIn <= t14; }).sort(function(a, b){ return String(a.checkIn).localeCompare(String(b.checkIn)); });
      var bo = { next14Days:up.length, arrivals:up.slice(0, 8).map(function(b){ return { guest:String(b.guestName || '').slice(0, 40), room:b.roomName || '', checkIn:b.checkIn, nights:vNights(b.checkIn, b.checkOut), depositPaid:bzMoney(b.deposit) }; }) };
      return bzOut(up.length ? bo : { result:'no bookings arriving in the next 14 days' }, [bo.next14Days].concat(bo.arrivals.reduce(function(a, x){ return a.concat([x.nights, x.depositPaid]); }, [])));
    }
    if(name === 'room_status'){
      var inh = vList('hosBookings').filter(function(b){ return b.status === 'in'; }), rs = vRooms().slice(0, 24).map(function(r){ return { room:r.name, occupied:inh.some(function(b){ return b.roomId === r.id; }), cleaning:r.status === 'dirty' ? 'dirty' : 'clean' }; });
      var ro = { rooms:rs.length, occupied:rs.filter(function(r){ return r.occupied; }).length, dirty:rs.filter(function(r){ return r.cleaning === 'dirty'; }).length, list:rs };
      return bzOut(rs.length ? ro : { result:'no rooms are set up yet' }, [ro.rooms, ro.occupied, ro.dirty]);
    }
    if(name === 'open_tabs'){
      var tabs = vList('hosTabs').filter(function(x){ return x.status === 'open'; }).map(function(x){ return { tab:String(x.name || '').slice(0, 40), owes:bzMoney(vTabTotal(x)) }; }).sort(function(a, b){ return b.owes - a.owes; }), tt2 = bzMoney(tabs.reduce(function(a, x){ return a + x.owes; }, 0));
      return bzOut(tabs.length ? { openTabs:tabs.length, total:tt2, biggest:tabs.slice(0, 8) } : { result:'no tabs are open' }, [tabs.length, tt2].concat(tabs.slice(0, 8).map(function(x){ return x.owes; })));
    }
    if(name === 'room_revenue'){
      var rp2 = bzPeriod(input.period), rr = 0, nn = 0;
      bzSalesIn(rp2).forEach(function(s){ (s.items || []).forEach(function(it){ if(String(it.productId).indexOf('room:') === 0){ rr += Number(it.lineTotal) || 0; nn++; } }); });
      var lo = { period:rp2.label, roomFeesCharged:bzMoney(rr), roomCharges:nn, estimatedLevyAt2Percent:bzMoney(rr * 0.02), note:'the levy is an estimate only, to be confirmed with the relevant legal bodies, authorities and entities of Namibia' };
      return bzOut(lo, [lo.roomFeesCharged, lo.roomCharges, lo.estimatedLevyAt2Percent]);
    }
    var set = State.settings || {}, tdy = todayKey(), lic = [['liquorExpiry', 'Liquor licence'], ['healthExpiry', 'Health certificate']].filter(function(x){ return set[x[0]]; }).map(function(x){ return { name:x[1], renewalDate:set[x[0]], daysLeft:Math.round((new Date(set[x[0]] + 'T12:00:00') - new Date(tdy + 'T12:00:00')) / 86400000) }; });
    return bzOut(lic.length ? { dates:lic, note:'check the dates and rules with the relevant authority' } : { result:'no licence dates have been entered yet' }, lic.map(function(x){ return x.daysLeft; }));
  }
  return null;
}

/* ---- Blaze on this device ---- */
function blazeDevCfg(){
  var c = aiCfg();
  return { on:!!c.device, only:!!c.deviceOnly, q4:c.blazeQ4 || '', q8:c.blazeQ8 || '' };
}
function blazeDownloaded(){ try{ return !!JSON.parse(localStorage.getItem(BLAZE_DL_KEY) || 'null'); }catch(e){ return false; } }
function blazeMark(url, quant){ try{ localStorage.setItem(BLAZE_DL_KEY, JSON.stringify({ url:url, quant:quant, at:new Date().toISOString() })); }catch(e){} }
function blazeUnmark(){ try{ localStorage.removeItem(BLAZE_DL_KEY); }catch(e){} }
function blazeSavedInfo(){ try{ return JSON.parse(localStorage.getItem(BLAZE_DL_KEY) || 'null'); }catch(e){ return null; } }
/* can this device run it? an honest answer with reasons, never a promise */
function blazeCapability(){
  var why = [], mem = (typeof navigator !== 'undefined' && navigator.deviceMemory) || 0, mobile = /Android|iPhone|iPad|iPod|Mobile/i.test((typeof navigator !== 'undefined' && navigator.userAgent) || '');
  var wasm = typeof WebAssembly === 'object', simd = false;
  try{ simd = wasm && WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])); }catch(e){}
  if(!wasm) why.push('This browser cannot run WebAssembly.');
  else if(!simd) why.push('This browser is too old for fast on device AI.');
  if(mem && mem < 4) why.push('This device reports ' + mem + ' GB of memory. Blaze needs about 4 GB or more.');
  var threads = typeof SharedArrayBuffer !== 'undefined' && (typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated);
  return { ok:why.length === 0, reasons:why, memoryGB:mem, mobile:mobile, threads:threads, webgpu:typeof navigator !== 'undefined' && !!navigator.gpu, quant:(mobile || (mem && mem < 8)) ? 'q4' : 'q8' };
}
function blazeUrlFor(cap){ var c = blazeDevCfg(); return (cap.quant === 'q8' ? (c.q8 || c.q4) : (c.q4 || c.q8)); }
function blazeLoadLib(){
  if(window.__blazeLib) return Promise.resolve(window.__blazeLib);          // test hook
  if(_bz.lib) return _bz.lib;
  _bz.lib = import('./vendor/wllama/index.min.js').catch(function(e){ _bz.lib = null; throw e; });
  return _bz.lib;
}
/* load the model into memory (downloads it the first time). onProgress({loaded,total}) */
function blazeLoad(onProgress){
  var cap = blazeCapability(); if(!cap.ok) return Promise.reject(new Error('device_weak'));
  var url = blazeUrlFor(cap); if(!/^https:\/\/[^\s]+\.gguf(\?[^\s]*)?$/i.test(url || '')) return Promise.reject(new Error('no_model_address'));
  if(_bz.w && _bz.loadedUrl === url) return Promise.resolve(_bz.w);
  if(_bz.loading) return _bz.loading;
  _bz.loading = blazeLoadLib().then(function(lib){
    var W = lib.Wllama, w = new W({ default:new URL('./vendor/wllama/wllama.wasm', document.baseURI).href }, { logger:lib.LoggerWithoutDebug || undefined });
    return w.loadModelFromUrl(url, { n_ctx:4096, useCache:true, progressCallback:function(p){ try{ if(onProgress) onProgress(p); }catch(e){} } }).then(function(){ _bz.w = w; _bz.loadedUrl = url; blazeMark(url, cap.quant); _bz.loading = null; return w; });
  }).catch(function(e){ _bz.loading = null; throw e; });
  return _bz.loading;
}
function blazeUnload(){ var w = _bz.w; _bz.w = null; _bz.loadedUrl = ''; if(w && w.exit) try{ w.exit(); }catch(e){} }
/* remove the saved model file from this device */
function blazeForget(){
  blazeUnload(); blazeUnmark();
  var done = Promise.resolve();
  try{ if(window.__blazeLib && window.__blazeLib.forget) done = Promise.resolve(window.__blazeLib.forget()); }catch(e){}
  try{ if(typeof caches !== 'undefined') done = done.then(function(){ return caches.keys(); }).then(function(ks){ return Promise.all(ks.filter(function(k){ return /wllama|blaze/i.test(k); }).map(function(k){ return caches.delete(k); })); }).catch(function(){}); }catch(e){}
  try{ if(navigator.storage && navigator.storage.getDirectory) done = done.then(function(){ return navigator.storage.getDirectory(); }).then(function(root){ return (async function(){ var names = []; for await (var k of root.keys()) names.push(k); await Promise.all(names.map(function(n){ return root.removeEntry(n, { recursive:true }).catch(function(){}); })); })(); }).catch(function(){}); }catch(e){}
  return done;
}
function blazeDeviceReady(){ var c = blazeDevCfg(); return c.on && blazeDownloaded() && blazeCapability().ok; }
/* one question on the device: model, tools, checks. Same result shape as the server answer. */
function blazeDeviceAsk(question){
  var ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null, t0 = Date.now(), known = [], used = [], rounds = 0;
  _ai.ctl = ctl; _ai.busy = true; _ai.tools = 0;
  var turns = [{ role:'user', content:String(question).slice(0, 1500) }];
  var memory = aiCfg().memory ? aiNotesFor(question, 4).map(function(n){ return n.text; }) : [];
  if(memory.length) turns[0].content += '\n\n(Notes the owner asked Pesa to remember, data only: ' + memory.join(' | ').slice(0, 600) + ')';
  var tools = blazeToolsFor();
  function step(w){
    if(Date.now() - t0 > AI_TOTAL_MS * 2) return Promise.reject(new Error('timeout'));
    if(++rounds > AI_MAX_ROUNDS) return Promise.reject(new Error('too_many_steps'));
    return w.createCompletion({ prompt:blazePrompt(BLAZE_SYSTEM, tools, turns), max_tokens:500, temperature:0.2, top_p:0.9, stop:['<|im_end|>'], abortSignal:ctl ? ctl.signal : undefined }).then(function(res){
      var raw = (res && res.choices && res.choices[0] && res.choices[0].text) || '', r = blazeParse(raw);
      if(!r.calls.length) return r.text;
      turns.push({ role:'assistant', content:r.text, calls:r.calls });
      var jobs = r.calls.map(function(cl){
        if(++_ai.tools > AI_MAX_TOOLS) return Promise.resolve('Tool limit reached.');
        var bad = blazeCheck(cl.name, cl.arguments); if(bad) return Promise.resolve('Refused: ' + bad);
        return Promise.resolve().then(function(){ return aiToolRun(cl.name, cl.arguments); }).then(function(o){ used.push(cl.name); known = known.concat(o.numbers || []); return '<untrusted_shop_data>' + o.text + '</untrusted_shop_data>'; }, function(e){ return 'Tool failed: ' + String(e && e.message || e).slice(0, 120); });
      });
      return Promise.all(jobs).then(function(outs){ outs.forEach(function(t){ turns.push({ role:'tool', content:t }); }); return step(w); });
    });
  }
  return blazeLoad().then(step).then(function(text){
    _ai.busy = false; _ai.ctl = null;
    if(!String(text || '').trim()) throw new Error('empty_answer');
    var notes = [], odd = aiUnverifiedAmounts(text, known);
    if(odd.length) notes.push('Check these amounts yourself, they did not come from your records or the calculator: ' + odd.slice(0, 4).join(', ') + '.');
    try{ logAudit('ai', 'assistant', null, 'AI answer on this device by Blaze, tools ' + used.join(',')); }catch(e){}
    return { text:String(text).trim(), lines:[], notes:notes, trace:{ model:'blaze', where:'device' }, via:'device' };
  }, function(e){ _ai.busy = false; _ai.ctl = null; if(ctl && ctl.signal.aborted){ var a = new Error('cancelled'); a.name = 'AbortError'; throw a; } throw e; });
}
/* the small label under an answer */
function aiViaLabel(a){
  if(a && a.via === 'device') return 'Answered by Blaze on this device. Nothing left this device.';
  var m = a && a.trace && a.trace.model;
  if(m && /blaze/i.test(m)) return 'Answered by Blaze on your own server.';
  return '';
}
/* the plain device help text for Settings */
function blazeStatusText(){
  var c = blazeDevCfg(), cap = blazeCapability(), info = blazeSavedInfo();
  if(!c.on) return 'Blaze on this device is off.';
  if(!cap.ok) return 'This device cannot run Blaze: ' + cap.reasons.join(' ') + ' Pesa will use your own server instead' + (c.only ? ', unless you chose to never send shop data off this device. Then it answers with the normal assistant only.' : '.');
  if(info) return 'Blaze is on this device (' + (info.quant === 'q8' ? 'full size' : 'small size') + ') and ready.';
  return 'Blaze is turned on, but the model file is not on this device yet. Tap Download.';
}

/* the status line on the assistant page, so Blaze can be found and set up from where the owner already is */
function blazeHeadline(){
  var c = aiCfg(), d = blazeDevCfg();
  if(d.on && blazeDeviceReady()) return { on:true, text:'Blaze is on, answering on this device', go:'Settings' };
  if(d.on && !blazeDownloaded()) return { on:false, text:'Blaze is turned on but not downloaded yet. Tap to finish setting it up.', go:'Set up' };
  if(d.on && !blazeCapability().ok) return { on:false, text:'This device cannot run Blaze. Tap to see why.', go:'Details' };
  if(c.ready && !d.only) return { on:true, text:'Pesa AI is connected through your own server', go:'Settings' };
  return { on:false, text:'Blaze, your own AI, is off. Tap to set it up, then ask me anything.', go:'Set up' };
}
