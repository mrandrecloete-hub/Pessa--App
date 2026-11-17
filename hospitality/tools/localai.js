/* ============================== PESA LOCAL INTELLIGENCE: offline analysis, no AI provider, no internet ==============================
 * Plain statistics on the shop's own records: forecasts, comparisons, unusual days, weekday patterns and price what ifs.
 * Everything runs on this phone. Answers say how much history they rest on, label estimates as estimates and refuse when there is too little data.
 * Wording avoids dashes on purpose. */
var LI_DAY = 86400000, LI_WD = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
function liDaily(days){
  var m = {}, now = new Date(), start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - (days - 1) * LI_DAY, first = Infinity;
  (State.sales || []).forEach(function(s){ var t = saleMs(s); if(t < first) first = t; if(t >= start){ var k = todayKey(new Date(t)); m[k] = (m[k] || 0) + (Number(s.total) || 0); } });
  var out = [], from = Math.max(start, new Date(new Date(first).getFullYear(), new Date(first).getMonth(), new Date(first).getDate()).getTime());
  if(!isFinite(first)) return out;
  for(var t = from; t <= now.getTime(); t += LI_DAY){ var d = new Date(t), k2 = todayKey(d); out.push({ k:k2, wd:d.getDay(), v:m[k2] || 0, t:t }); }
  return out;
}
function liStats(a){ var n = a.length; if(!n) return { n:0, mean:0, sd:0 }; var mean = a.reduce(function(x, y){ return x + y; }, 0) / n, sd = Math.sqrt(a.reduce(function(x, y){ return x + (y - mean) * (y - mean); }, 0) / n); return { n:n, mean:mean, sd:sd }; }
function liPct(a, b){ return b > 0 ? Math.round((a - b) / b * 100) : null; }
function liMoney(n){ return fmtMoney(Math.round(n * 100) / 100); }

// next 7 days: the average of each weekday over the last 8 weeks, counting recent weeks a little more
function liForecast(horizon){
  var d = liDaily(56); if(d.length < 14) return { error:'I need at least 14 days of sales to forecast. You have ' + d.length + ' so far.' };
  var wk = {}; d.forEach(function(x, i){ var w = 1 + i / d.length; (wk[x.wd] = wk[x.wd] || []).push({ v:x.v, w:w }); });
  var avg = function(wd){ var a = wk[wd] || []; var sw = a.reduce(function(s, x){ return s + x.w; }, 0); return sw ? a.reduce(function(s, x){ return s + x.v * x.w; }, 0) / sw : 0; };
  var resid = []; d.forEach(function(x){ resid.push(x.v - avg(x.wd)); });
  var sd = liStats(resid).sd, days = [], tot = 0, today = new Date();
  for(var i = 1; i <= horizon; i++){ var dt = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i), v = avg(dt.getDay()); days.push({ d:dt, v:v }); tot += v; }
  var band = sd * Math.sqrt(horizon);
  return { days:days, total:tot, low:Math.max(0, tot - band), high:tot + band, basis:d.length };
}
function liCompare(kind){
  var now = new Date(), a0, a1, b0, b1, la, lb, day = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if(kind === 'month'){ a0 = new Date(now.getFullYear(), now.getMonth(), 1).getTime(); a1 = now.getTime() + 1; var span = Math.max(1, now.getDate()); b0 = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(); b1 = b0 + span * LI_DAY; la = 'this month so far'; lb = 'the same days last month'; }
  else { a0 = day - 6 * LI_DAY; a1 = now.getTime() + 1; b0 = a0 - 7 * LI_DAY; b1 = a0; la = 'the last 7 days'; lb = 'the 7 days before'; }
  var sum = function(s, e){ var t = 0, n = 0; (State.sales || []).forEach(function(x){ var m = saleMs(x); if(m >= s && m < e){ t += Number(x.total) || 0; n++; } }); return { t:t, n:n }; };
  return { a:sum(a0, a1), b:sum(b0, b1), la:la, lb:lb };
}
function liWeekdays(){
  var d = liDaily(56); if(d.length < 14) return { error:'I need at least 14 days of sales to see weekday patterns. You have ' + d.length + ' so far.' };
  var by = {}; d.forEach(function(x){ (by[x.wd] = by[x.wd] || []).push(x.v); });
  var rows = Object.keys(by).map(function(w){ return { wd:+w, avg:liStats(by[w]).mean, n:by[w].length }; }).sort(function(a, b){ return b.avg - a.avg; });
  return { rows:rows, basis:d.length };
}
function liUnusual(){
  var d = liDaily(60), active = d.filter(function(x){ return x.v > 0; }); if(active.length < 14) return { error:'I need at least 14 trading days to tell what is unusual. You have ' + active.length + ' so far.' };
  var wd = {}; d.forEach(function(x){ (wd[x.wd] = wd[x.wd] || []).push(x.v); });
  var flagged = []; d.forEach(function(x){ var st = liStats(wd[x.wd]); if(st.n >= 4 && st.sd > 0){ var z = (x.v - st.mean) / st.sd; if(Math.abs(z) >= 2) flagged.push({ k:x.k, wd:x.wd, v:x.v, usual:st.mean, z:z }); } });
  flagged.sort(function(a, b){ return Math.abs(b.z) - Math.abs(a.z); });
  return { flagged:flagged.slice(0, 5), basis:d.length };
}
// price what if: three scenarios of how buyers react, because nobody can know the real reaction in advance
function liPriceWhatIf(prod, pct){
  var v = smartVelocity(30)[prod.id], qty = v ? v.qty : 0, p = Number(prod.sellPrice) || 0, c = Number(prod.costPrice) || 0;
  if(!qty || !p) return { error:prod.name + ' has no sales in the last 30 days, so I cannot judge the effect of a new price.' };
  var np = p * (1 + pct / 100), base = (p - c) * qty;
  var sc = [['buyers do not mind', 0], ['some buyers leave', -0.5], ['many buyers leave', -1.5]].map(function(s){ var q2 = Math.max(0, qty * (1 + s[1] * pct / 100)); return { label:s[0], qty:Math.round(q2 * 10) / 10, profit:(np - c) * q2 }; });
  return { name:prod.name, p:p, np:np, qty:qty, base:base, sc:sc, cost:c };
}

function localAnswer(raw){
  var q = String(raw || '').toLowerCase().replace(/[?!.]+$/, '').trim(); if(!q) return null;
  var wantsMoney = /(sale|sales|sell|sold|revenue|takings|turnover|income|money|business|shop|trade|trading)/.test(q);
  if(/(forecast|predict|projection|project|expect|going to (make|sell)|will i (make|sell)|next week|tomorrow|next 7 days|coming week)/.test(q) && wantsMoney || /^(forecast|predict)\b/.test(q)){
    var f = liForecast(/tomorrow/.test(q) ? 1 : 7); if(f.error) return { text:f.error };
    var one = /tomorrow/.test(q);
    return { text:(one ? 'Tomorrow I expect about ' + liMoney(f.total) : 'For the next 7 days I expect about ' + liMoney(f.total) + ' in sales, somewhere between ' + liMoney(f.low) + ' and ' + liMoney(f.high)) + '.',
      lines:(one ? [] : f.days.map(function(x){ return x.d.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' }) + ': about ' + liMoney(x.v); })).concat(['This is an estimate from your last ' + f.basis + ' days of sales (average for each weekday). It cannot know about holidays, stock shortages or anything new.']) };
  }
  if(/(compare|versus|\bvs\b|better than|worse than|up or down|growing|how am i doing|how is business)/.test(q) && (wantsMoney || /(how am i doing|how is business)/.test(q))){
    var kind = /month/.test(q) ? 'month' : 'week', c = liCompare(kind), pc = liPct(c.a.t, c.b.t);
    if(!c.b.n && !c.a.n) return { text:'There are no sales in either period yet.' };
    return { text:c.b.t > 0 ? 'Sales for ' + c.la + ' are ' + liMoney(c.a.t) + ', ' + (pc >= 0 ? 'up ' : 'down ') + Math.abs(pc) + '% on ' + c.lb + ' (' + liMoney(c.b.t) + ').' : 'Sales for ' + c.la + ' are ' + liMoney(c.a.t) + '. There were no sales in ' + c.lb + ' to compare with.',
      lines:[c.a.n + ' sales in ' + c.la + ', ' + c.b.n + ' in ' + c.lb + '.'] };
  }
  if(/(which day|what day|best day|worst day|weekday|day of the week|slowest day|busiest day)/.test(q)){
    var w = liWeekdays(); if(w.error) return { text:w.error };
    var top = w.rows[0], low = w.rows[w.rows.length - 1];
    return { text:LI_WD[top.wd] + ' are your best day, about ' + liMoney(top.avg) + ' on average. ' + LI_WD[low.wd] + ' are your slowest, about ' + liMoney(low.avg) + '.', lines:w.rows.map(function(r){ return LI_WD[r.wd] + ': ' + liMoney(r.avg) + ' on average'; }).concat(['Based on the last ' + w.basis + ' days.']) };
  }
  if(/(unusual|strange|odd|abnormal|spike|dip|outlier|suspicious|different from normal|anything wrong)/.test(q) && wantsMoney){
    var u = liUnusual(); if(u.error) return { text:u.error };
    if(!u.flagged.length) return { text:'Nothing looks unusual. Your daily sales have stayed close to normal for each weekday over the last ' + u.basis + ' days.' };
    return { text:u.flagged.length + ' day' + (u.flagged.length === 1 ? '' : 's') + ' looked very different from a normal ' + 'day of that kind:', lines:u.flagged.map(function(x){ return x.k + ' (' + LI_WD[x.wd].slice(0, -1) + '): ' + liMoney(x.v) + ' against about ' + liMoney(x.usual) + ' usually, ' + (x.z > 0 ? 'much higher' : 'much lower'); }).concat(['This only shows that a day was different. It does not say why. Check the till and the sales that day.']) };
  }
  var wi = q.match(/(?:what if|what happens if|if i|should i)\s+(?:i\s+)?(raise|increase|lift|lower|reduce|cut|drop)\s+(?:the\s+)?(?:price|prices)?\s*(?:of|on|for)?\s+(.+?)\s+(?:by|with)\s+(\d{1,3}(?:\.\d+)?)\s*%/);
  if(wi){
    var pct = parseFloat(wi[3]) * (/(lower|reduce|cut|drop)/.test(wi[1]) ? -1 : 1), cand = searchProducts(State.products || [], wi[2].trim());
    if(!cand.length) return { text:'I could not find a product called ' + wi[2].trim() + '.' };
    var r = liPriceWhatIf(cand[0], pct); if(r.error) return { text:r.error };
    return { text:'If you ' + (pct >= 0 ? 'raise' : 'lower') + ' ' + r.name + ' from ' + liMoney(r.p) + ' to ' + liMoney(r.np) + ', monthly profit on it would be about:', lines:r.sc.map(function(s){ var d = s.profit - r.base; return s.label + ': ' + liMoney(s.profit) + ' (' + (d >= 0 ? '+' : '-') + liMoney(Math.abs(d)) + ' against now, ' + s.qty + ' sold)'; }).concat(['Now: ' + liMoney(r.base) + ' a month on ' + r.qty + ' sold. These are estimates. Nobody can know how your customers will react, so try it on a small scale first.']) };
  }
  return null;
}
