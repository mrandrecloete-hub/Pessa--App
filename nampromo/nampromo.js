/* NamPromo: find specials, compare shop prices and plan where to shop in Namibia.
   Sample data only. The shops and prices below are made up to show how the app works, and the app says so on every page. */
(function(){
'use strict';
var TOWNS = {
  'Windhoek':[-22.5609,17.0658], 'Swakopmund':[-22.6784,14.5266], 'Walvis Bay':[-22.9576,14.5053], 'Oshakati':[-17.788,15.6995], 'Rundu':[-17.9333,19.7667],
  'Katima Mulilo':[-17.5,24.27], 'Otjiwarongo':[-20.4637,16.6477], 'Keetmanshoop':[-26.5833,18.1333], 'Gobabis':[-22.45,18.97]
};
var CATS = ['Groceries', 'Household', 'Fashion', 'Electronics', 'Restaurants'];
/* unit: the size is turned into a price per kg, per litre or each so different pack sizes can be compared */
var PRODUCTS = [
  { id:'maize', name:'Maize meal 10 kg', cat:'Groceries', base:125, qty:10, u:'kg' },
  { id:'sugar', name:'White sugar 2 kg', cat:'Groceries', base:48, qty:2, u:'kg' },
  { id:'oil', name:'Cooking oil 750 ml', cat:'Groceries', base:42, qty:0.75, u:'L' },
  { id:'rice', name:'Rice 2 kg', cat:'Groceries', base:45, qty:2, u:'kg' },
  { id:'milk', name:'Long life milk 1 L', cat:'Groceries', base:19, qty:1, u:'L' },
  { id:'bread', name:'White bread 700 g', cat:'Groceries', base:17, qty:0.7, u:'kg' },
  { id:'eggs', name:'Eggs tray of 30', cat:'Groceries', base:62, qty:30, u:'egg' },
  { id:'chicken', name:'Chicken portions 2 kg', cat:'Groceries', base:95, qty:2, u:'kg' },
  { id:'powder', name:'Washing powder 2 kg', cat:'Household', base:78, qty:2, u:'kg' },
  { id:'tp', name:'Toilet paper 9 rolls', cat:'Household', base:65, qty:9, u:'roll' },
  { id:'jeans', name:'Jeans', cat:'Fashion', base:599, qty:1, u:'each' },
  { id:'sneak', name:'Everyday sneakers', cat:'Fashion', base:899, qty:1, u:'each' },
  { id:'phones', name:'Wireless headphones', cat:'Electronics', base:1199, qty:1, u:'each' },
  { id:'lunch', name:'Lunch combo', cat:'Restaurants', base:99, qty:1, u:'each' }
];
var SHOP_KINDS = [
  { k:'market', name:'Example Market', sells:['Groceries', 'Household'], off:[0.004, 0.006] },
  { k:'mart', name:'Example Mart', sells:['Groceries', 'Household', 'Fashion', 'Electronics'], off:[-0.012, 0.009] },
  { k:'bulk', name:'Example Wholesale', sells:['Groceries', 'Household'], off:[0.026, -0.018] },
  { k:'kitchen', name:'Example Kitchen', sells:['Restaurants'], off:[-0.005, -0.007] }
];
var DAY = 86400000;
function hash(s){ var h = 2166136261; for(var i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }
function today(){ var d = new Date(); d.setHours(12, 0, 0, 0); return d; }

/* ---- sample data, built the same way every time so prices do not jump around ---- */
var SHOPS = [], OFFERS = [];
Object.keys(TOWNS).forEach(function(town){
  SHOP_KINDS.forEach(function(kind){
    if(town !== 'Windhoek' && town !== 'Swakopmund' && town !== 'Oshakati' && kind.k === 'bulk') return;
    var id = town + '|' + kind.k, c = TOWNS[town];
    SHOPS.push({ id:id, name:kind.name, town:town, lat:c[0] + kind.off[0], lng:c[1] + kind.off[1], sells:kind.sells, address:'Example address, ' + town });
  });
});
SHOPS.forEach(function(shop){
  PRODUCTS.forEach(function(p){
    if(shop.sells.indexOf(p.cat) < 0) return;
    var bulk = /bulk/.test(shop.id) ? 0.93 : 1;
    var price = Math.round(p.base * (0.9 + hash(shop.id + p.id) * 0.22) * bulk * 2) / 2;
    var promo = hash(p.id + shop.id + 'p') < 0.38;
    var regular = promo ? Math.round(price * (1.14 + hash(shop.id + p.id + 'r') * 0.26) * 2) / 2 : price;
    var ends = promo ? new Date(today().getTime() + Math.ceil(hash(shop.id + p.id + 'e') * 14) * DAY) : null;
    OFFERS.push({ id:shop.id + '|' + p.id, shop:shop.id, product:p.id, price:price, regular:regular, ends:ends, source:'Sample data' });
  });
});
var shopById = {}, prodById = {};
SHOPS.forEach(function(s){ shopById[s.id] = s; }); PRODUCTS.forEach(function(p){ prodById[p.id] = p; });

/* ---- saved on this device ---- */
var KEY = 'nampromo_v1';
var S = { town:'Windhoek', tab:'deals', list:[], watch:[], mine:[], perKm:4, pos:null, allTowns:false, cat:'All', q:'', sort:'saving', cq:'', lastAlerts:{} };
try{ var saved = JSON.parse(localStorage.getItem(KEY) || '{}'); ['town', 'list', 'watch', 'mine', 'perKm', 'pos'].forEach(function(k){ if(saved[k] != null) S[k] = saved[k]; }); }catch(e){}
if(!TOWNS[S.town]) S.town = 'Windhoek';
function save(){ try{ localStorage.setItem(KEY, JSON.stringify({ town:S.town, list:S.list, watch:S.watch, mine:S.mine, perKm:S.perKm, pos:S.pos })); }catch(e){} }

/* ---- helpers ---- */
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
function money(n){ return 'N$' + (Math.round(n * 100) / 100).toLocaleString('en-NA', { minimumFractionDigits:2, maximumFractionDigits:2 }); }
function pct(o){ return o.regular > o.price ? Math.round((o.regular - o.price) / o.regular * 100) : 0; }
function unitPrice(o){ var p = prodById[o.product]; if(!p || p.u === 'each') return null; return { v:o.price / p.qty, u:p.u }; }
function unitText(o){ var u = unitPrice(o); return u ? money(u.v) + ' per ' + u.u : ''; }
function daysLeft(d){ if(!d) return null; return Math.max(0, Math.round((new Date(d).getTime() - today().getTime()) / DAY)); }
function endsText(o){ var d = daysLeft(o.ends); if(d == null) return ''; return d === 0 ? 'Ends today' : d === 1 ? 'Ends tomorrow' : 'Ends in ' + d + ' days'; }
function origin(){ return S.pos || { lat:TOWNS[S.town][0], lng:TOWNS[S.town][1] }; }
function km(a, b){ var R = 6371, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r; var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2); return 2 * R * Math.asin(Math.sqrt(x)) * 1.3; }
function dist(shop){ return km(origin(), shop); }
function navUrl(shop){ return 'https://www.google.com/maps/dir/?api=1&destination=' + shop.lat + ',' + shop.lng + '&travelmode=driving'; }
function allOffers(){
  var extra = S.mine.map(function(m){ return { id:m.id, shop:m.shopId, product:m.product, price:m.price, regular:m.regular, ends:m.ends ? new Date(m.ends + 'T12:00:00') : null, source:'Community, not checked', title:m.title, mine:true }; });
  return OFFERS.concat(extra).filter(function(o){ return !o.ends || o.ends.getTime() >= today().getTime() - DAY / 2; });
}
function townOffers(town, prodId){ return allOffers().filter(function(o){ var s = shopById[o.shop]; return s && s.town === town && (!prodId || o.product === prodId); }); }
function nameOf(o){ return o.title || (prodById[o.product] ? prodById[o.product].name : 'Item'); }
function toast(msg){ var t = document.createElement('div'); t.textContent = msg; t.setAttribute('role', 'status'); t.style.cssText = 'position:fixed;left:50%;bottom:92px;transform:translateX(-50%);background:#17231F;color:#fff;padding:10px 16px;border-radius:12px;z-index:30;font-size:14px;max-width:88%;text-align:center'; document.body.appendChild(t); setTimeout(function(){ t.remove(); }, 2400); }

/* ---- the best way to shop for a list ---- */
function plan(){
  var items = S.list.filter(function(i){ return prodById[i.product]; });
  if(!items.length) return null;
  var shops = SHOPS.filter(function(s){ return s.town === S.town; });
  var offers = townOffers(S.town);
  function priceAt(shopId, prod){ var o = offers.filter(function(x){ return x.shop === shopId && x.product === prod; }).sort(function(a, b){ return a.price - b.price; })[0]; return o ? o.price : null; }
  var single = shops.map(function(s){
    var total = 0, missing = [];
    items.forEach(function(i){ var p = priceAt(s.id, i.product); if(p == null) missing.push(prodById[i.product].name); else total += p * i.qty; });
    var d = dist(s) * 2;
    return { kind:'single', shops:[s], total:total, missing:missing, km:d, trip:total + d * S.perKm, covered:items.length - missing.length };
  }).filter(function(o){ return o.covered > 0; });
  var full = single.filter(function(o){ return !o.missing.length; });
  // split: cheapest shop for each item, then a short route between those shops
  var pick = {}, total = 0, okAll = true;
  items.forEach(function(i){
    var best = null; shops.forEach(function(s){ var p = priceAt(s.id, i.product); if(p != null && (!best || p < best.p)) best = { p:p, s:s }; });
    if(!best){ okAll = false; return; } pick[i.product] = best; total += best.p * i.qty;
  });
  var split = null;
  if(okAll){
    var stops = [], seen = {}; Object.keys(pick).forEach(function(k){ var s = pick[k].s; if(!seen[s.id]){ seen[s.id] = 1; stops.push(s); } });
    var cur = origin(), left = stops.slice(), route = [], d = 0;
    while(left.length){ left.sort(function(a, b){ return km(cur, a) - km(cur, b); }); var n = left.shift(); d += km(cur, n); cur = n; route.push(n); }
    d += km(cur, origin());
    split = { kind:'split', shops:route, total:total, missing:[], km:d, trip:total + d * S.perKm, covered:items.length, pick:pick };
  }
  var options = full.concat(split ? [split] : []);
  if(!options.length) options = single.slice();
  options.sort(function(a, b){ return b.covered - a.covered || a.trip - b.trip; });
  var dearest = full.length ? full.slice().sort(function(a, b){ return b.trip - a.trip; })[0] : null;
  return { items:items, best:options[0], others:options.slice(1, 4), dearest:dearest, split:split, singles:single };
}

/* ---- price alerts ---- */
function alertStatus(w){
  var offers = townOffers(w.town || S.town, w.product).sort(function(a, b){ return a.price - b.price; });
  var low = offers[0];
  return { low:low, hit:!!low && low.price <= w.target };
}
function runAlerts(){
  S.watch.forEach(function(w){
    var st = alertStatus(w); if(!st.hit) return;
    var key = w.product + '|' + st.low.price; if(S.lastAlerts[key]) return; S.lastAlerts[key] = 1;
    if('Notification' in window && Notification.permission === 'granted'){
      try{ new Notification('NamPromo price alert', { body:nameOf(st.low) + ' is ' + money(st.low.price) + ' at ' + shopById[st.low.shop].name + ' in ' + shopById[st.low.shop].town + '.' }); }catch(e){}
    }
  });
}

/* ---- screens ---- */
var ICON = {
  deals:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12l9-9h8v8l-9 9z"/><circle cx="16" cy="8" r="1.5"/></svg>',
  compare:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/></svg>',
  plan:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/></svg>',
  alerts:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 004 0"/></svg>',
  add:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>'
};
var TABS = [['deals', 'Deals'], ['compare', 'Compare'], ['plan', 'Where to shop'], ['alerts', 'Alerts'], ['add', 'Add a deal']];
var DEMO = '<div class="demo"><b>Sample data.</b> The shops and prices here are made up to show how NamPromo works. They are not real specials. Real prices need to be confirmed with each shop.</div>';

function offerCard(o){
  var s = shopById[o.shop], pr = prodById[o.product], off = pct(o), up = unitText(o);
  return '<div class="card"><div class="row"><div class="grow"><div style="font-weight:650">' + esc(nameOf(o)) + '</div>' +
    '<div class="muted">' + esc(s.name) + ', ' + esc(s.town) + ' · ' + dist(s).toFixed(1) + ' km away' + '</div></div>' + (off ? '<span class="badge">' + off + '% off</span>' : '') + '</div>' +
    '<div style="margin:6px 0 2px"><span class="price">' + money(o.price) + '</span>' + (off ? '<span class="was">' + money(o.regular) + '</span>' : '') + '</div>' +
    '<div class="muted">' + [up, endsText(o), o.mine ? 'Community deal, not checked' : ''].filter(Boolean).map(esc).join(' · ') + '</div>' +
    '<div class="row" style="margin-top:10px;flex-wrap:wrap"><a class="btn small" style="text-decoration:none" target="_blank" rel="noopener" href="' + navUrl(s) + '">Navigate</a>' +
    (pr ? '<button class="btn small alt" data-cmp="' + o.product + '">Compare shops</button><button class="btn small alt" data-addlist="' + o.product + '">Add to list</button><button class="btn small alt" data-watch="' + o.product + '">Watch price</button>' : '') + '</div></div>';
}
function viewDeals(){
  var list = allOffers().filter(function(o){ var s = shopById[o.shop]; return (S.allTowns || s.town === S.town) && pct(o) > 0 && (S.cat === 'All' || (prodById[o.product] && prodById[o.product].cat === S.cat)) && (!S.q || (nameOf(o) + ' ' + s.name).toLowerCase().indexOf(S.q.toLowerCase()) >= 0); });
  if(S.sort === 'saving') list.sort(function(a, b){ return pct(b) - pct(a); });
  else if(S.sort === 'price') list.sort(function(a, b){ return a.price - b.price; });
  else if(S.sort === 'ends') list.sort(function(a, b){ return (a.ends ? a.ends.getTime() : 9e15) - (b.ends ? b.ends.getTime() : 9e15); });
  else list.sort(function(a, b){ return dist(shopById[a.shop]) - dist(shopById[b.shop]); });
  var chips = ['All'].concat(CATS).map(function(c){ return '<button class="chip' + (S.cat === c ? ' on' : '') + '" data-cat="' + c + '">' + c + '</button>'; }).join('');
  return DEMO + '<h2>Specials near you</h2><p class="sub">' + (S.allTowns ? 'All towns' : esc(S.town)) + ', ' + list.length + ' specials</p>' +
    '<input id="q" type="search" placeholder="Search a product or shop" value="' + esc(S.q) + '" aria-label="Search">' +
    '<div class="chips" style="margin-top:10px">' + chips + '</div>' +
    '<div class="row" style="margin-bottom:12px"><select id="sort" aria-label="Sort" class="grow"><option value="saving"' + (S.sort === 'saving' ? ' selected' : '') + '>Biggest saving</option><option value="price"' + (S.sort === 'price' ? ' selected' : '') + '>Lowest price</option><option value="ends"' + (S.sort === 'ends' ? ' selected' : '') + '>Ending soon</option><option value="near"' + (S.sort === 'near' ? ' selected' : '') + '>Nearest shop</option></select>' +
    '<label style="display:flex;gap:6px;align-items:center;margin:0;white-space:nowrap"><input type="checkbox" id="all" style="width:auto"' + (S.allTowns ? ' checked' : '') + '> All towns</label></div>' +
    (list.length ? list.map(offerCard).join('') : '<div class="empty">No specials match. Try another category or town.</div>');
}
function viewCompare(){
  var opts = PRODUCTS.map(function(p){ return '<option value="' + p.id + '"' + (S.cq === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('');
  var body = '<div class="empty">Pick a product to see which shop in ' + esc(S.town) + ' is cheapest.</div>';
  if(S.cq){
    var offers = townOffers(S.town, S.cq).sort(function(a, b){ var ua = unitPrice(a), ub = unitPrice(b); return ua && ub ? ua.v - ub.v : a.price - b.price; });
    if(offers.length){
      var top = offers[0], worst = offers[offers.length - 1];
      body = '<div class="card" style="background:var(--chip)"><b>Advice:</b> buy at ' + esc(shopById[top.shop].name) + ' for ' + money(top.price) + (worst.price > top.price ? '. That is ' + money(worst.price - top.price) + ' less than the dearest shop.' : '.') + ' Price only counts if the pack is the same size, so check the price per unit below.</div>' +
        offers.map(function(o, i){ var s = shopById[o.shop]; return '<div class="card' + (i === 0 ? ' best' : '') + '"><div class="row"><div class="grow"><b>' + esc(s.name) + '</b><div class="muted">' + dist(s).toFixed(1) + ' km away</div></div>' + (i === 0 ? '<span class="badge good">Cheapest</span>' : '') + '</div>' +
          '<div style="margin-top:4px"><span class="price">' + money(o.price) + '</span>' + (pct(o) ? '<span class="was">' + money(o.regular) + '</span> <span class="badge">' + pct(o) + '% off</span>' : '') + '</div><div class="muted">' + esc([unitText(o), endsText(o), o.mine ? 'Community deal, not checked' : ''].filter(Boolean).join(' · ')) + '</div>' +
          '<div class="row" style="margin-top:8px"><a class="btn small" style="text-decoration:none" target="_blank" rel="noopener" href="' + navUrl(s) + '">Navigate</a></div></div>'; }).join('') +
        '<div class="row"><button class="btn alt grow" data-addlist="' + S.cq + '">Add to my list</button><button class="btn alt grow" data-watch="' + S.cq + '">Watch this price</button></div>';
    } else body = '<div class="empty">No shop in ' + esc(S.town) + ' has this product in the sample data.</div>';
  }
  return DEMO + '<h2>Compare prices</h2><p class="sub">Same product, every shop in ' + esc(S.town) + '.</p><select id="cq" aria-label="Product"><option value="">Choose a product</option>' + opts + '</select><div style="height:12px"></div>' + body;
}
function viewPlan(){
  var opts = PRODUCTS.map(function(p){ return '<option value="' + p.id + '">' + esc(p.name) + '</option>'; }).join('');
  var html = DEMO + '<h2>Where to shop</h2><p class="sub">Add what you need. NamPromo finds the best way to buy it in ' + esc(S.town) + '.</p>' +
    '<div class="card"><div class="row"><select id="pl" class="grow" aria-label="Product">' + opts + '</select><input id="pq" type="number" min="1" value="1" style="width:76px" aria-label="Quantity"><button class="btn" id="pladd">Add</button></div>' +
    (S.list.length ? '<div style="margin-top:8px">' + S.list.map(function(i, n){ var p = prodById[i.product]; return p ? '<div class="li"><div class="grow">' + esc(p.name) + '</div><span class="muted">x ' + i.qty + '</span><button class="x" data-del="' + n + '" aria-label="Remove">×</button></div>' : ''; }).join('') + '</div>' : '<div class="muted" style="margin-top:8px">Your list is empty.</div>') + '</div>';
  var r = plan();
  if(r){
    var b = r.best, note = '';
    if(b.kind === 'split') note = 'Buying each item where it is cheapest. It takes ' + b.shops.length + ' stop' + (b.shops.length > 1 ? 's' : '') + '.';
    else note = 'One stop covers ' + (b.missing.length ? 'part of your list' : 'everything') + '.';
    var vs = r.dearest && r.dearest.trip > b.trip ? ' That is about ' + money(r.dearest.trip - b.trip) + ' less than the dearest option, counting travel.' : '';
    html += '<div class="card best"><span class="badge good">Best choice</span><div style="margin:6px 0"><b>' + b.shops.map(function(s){ return esc(s.name); }).join(' then ') + '</b></div>' +
      '<div class="price">' + money(b.total) + '</div><div class="muted">Shopping ' + money(b.total) + ' · travel about ' + b.km.toFixed(1) + ' km (' + money(b.km * S.perKm) + ') · ' + money(b.trip) + ' in all</div>' +
      '<p style="margin:8px 0">' + esc(note + vs) + '</p>' + (b.missing.length ? '<div class="muted">Not found here: ' + esc(b.missing.join(', ')) + '</div>' : '') +
      (b.kind === 'split' ? '<div style="margin-top:6px">' + b.shops.map(function(s){ var its = r.items.filter(function(i){ return r.split.pick[i.product].s.id === s.id; }).map(function(i){ return prodById[i.product].name + ' x ' + i.qty; }); return '<div class="li"><div class="grow"><b>' + esc(s.name) + '</b><div class="muted">' + esc(its.join(', ')) + '</div></div></div>'; }).join('') + '</div>' : '') +
      '<div class="row" style="margin-top:10px;flex-wrap:wrap">' + b.shops.map(function(s, n){ return '<a class="btn small" style="text-decoration:none" target="_blank" rel="noopener" href="' + navUrl(s) + '">Navigate to ' + (b.shops.length > 1 ? 'stop ' + (n + 1) : esc(s.name)) + '</a>'; }).join('') + '</div></div>';
    if(r.others.length) html += '<h2 style="font-size:16px">Other options</h2>' + r.others.map(function(o){ return '<div class="card"><div class="row"><div class="grow"><b>' + o.shops.map(function(s){ return esc(s.name); }).join(' then ') + '</b><div class="muted">' + money(o.total) + ' shopping · ' + o.km.toFixed(1) + ' km travel' + (o.missing.length ? ' · missing ' + o.missing.length + ' item' + (o.missing.length > 1 ? 's' : '') : '') + '</div></div><b>' + money(o.trip) + '</b></div></div>'; }).join('');
  }
  html += '<div class="card"><label for="pk" style="margin-top:0">Travel cost per km (your estimate)</label><div class="row"><input id="pk" type="number" min="0" step="0.5" value="' + S.perKm + '"><button class="btn alt small" id="geo">' + (S.pos ? 'Using my location' : 'Use my location') + '</button></div>' +
    '<div class="muted" style="margin-top:6px">Distances are rough estimates by road. Your location stays on this device and is only used for distances.</div></div>';
  return html;
}
function viewAlerts(){
  var perm = 'Notification' in window ? Notification.permission : 'unsupported';
  var html = DEMO + '<h2>Price alerts</h2><p class="sub">Watch a product and set the price you want. NamPromo tells you when a shop reaches it.</p>';
  if(!S.watch.length) html += '<div class="empty">No alerts yet. Open Compare or Deals and tap Watch price.</div>';
  html += S.watch.map(function(w, n){
    var p = prodById[w.product], st = alertStatus(w); if(!p) return '';
    return '<div class="card' + (st.hit ? ' alert-hit' : '') + '"><div class="row"><div class="grow"><b>' + esc(p.name) + '</b><div class="muted">' + esc(w.town || S.town) + '</div></div><button class="x" data-wdel="' + n + '" aria-label="Remove alert">×</button></div>' +
      '<div class="row" style="margin-top:6px"><label style="margin:0">Alert me at or below</label><input type="number" min="0" step="0.5" value="' + w.target + '" data-wt="' + n + '" style="width:110px"></div>' +
      (st.low ? '<div style="margin-top:8px">' + (st.hit ? '<span class="badge good">Reached</span> ' : '') + 'Lowest now: <b>' + money(st.low.price) + '</b> at ' + esc(shopById[st.low.shop].name) + '</div><div class="row" style="margin-top:8px"><a class="btn small" style="text-decoration:none" target="_blank" rel="noopener" href="' + navUrl(shopById[st.low.shop]) + '">Navigate</a></div>' : '<div class="muted" style="margin-top:8px">No price found.</div>') + '</div>';
  }).join('');
  html += '<div class="card"><b>Phone notifications</b><p class="muted" style="margin:4px 0 8px">' + (perm === 'granted' ? 'On. NamPromo notifies you when you open the app and an alert has been reached.' : perm === 'denied' ? 'Blocked in your browser settings.' : perm === 'unsupported' ? 'Your browser does not support notifications.' : 'Allow notifications to get a message when an alert is reached.') +
    ' Alerts that arrive when the app is closed need a NamPromo server, which is not built yet.</p>' + (perm === 'default' ? '<button class="btn" id="notif">Allow notifications</button>' : '') + '</div>';
  return html;
}
function viewAdd(){
  var shops = SHOPS.filter(function(s){ return s.town === S.town; });
  var d = new Date(today().getTime() + 7 * DAY).toISOString().slice(0, 10);
  var html = DEMO + '<h2>Add a deal</h2><p class="sub">Saw a special? Add it. Deals added here show as "not checked" until the shop is confirmed. They are only saved on this device for now.</p><div class="card">' +
    '<label for="fs">Shop in ' + esc(S.town) + '</label><select id="fs">' + shops.map(function(s){ return '<option value="' + s.id + '">' + esc(s.name) + '</option>'; }).join('') + '</select>' +
    '<label for="fp">Product</label><select id="fp">' + PRODUCTS.map(function(p){ return '<option value="' + p.id + '">' + esc(p.name) + '</option>'; }).join('') + '</select>' +
    '<div class="row"><div class="grow"><label for="fr">Normal price (N$)</label><input id="fr" type="number" min="0" step="0.5" inputmode="decimal"></div><div class="grow"><label for="fn">Special price (N$)</label><input id="fn" type="number" min="0" step="0.5" inputmode="decimal"></div></div>' +
    '<label for="fe">Ends on</label><input id="fe" type="date" value="' + d + '">' +
    '<div style="height:12px"></div><button class="btn block" id="fadd">Add deal</button><div class="muted" id="ferr" style="color:var(--bad);margin-top:6px"></div></div>';
  if(S.mine.length) html += '<h2 style="font-size:16px">Your added deals</h2>' + S.mine.map(function(m, n){ var s = shopById[m.shopId]; return '<div class="li"><div class="grow"><b>' + esc(prodById[m.product].name) + '</b><div class="muted">' + esc(s ? s.name : '') + ' · ' + money(m.price) + ' · not checked</div></div><button class="x" data-mdel="' + n + '" aria-label="Remove">×</button></div>'; }).join('');
  html += '<div class="card" style="margin-top:14px"><b>For shops</b><p class="muted" style="margin:4px 0 0">Shop owners will be able to register and publish their own specials once the NamPromo server is built. Only checked shops will show a verified mark.</p></div>';
  return html;
}

/* ---- drawing and events ---- */
var VIEWS = { deals:viewDeals, compare:viewCompare, plan:viewPlan, alerts:viewAlerts, add:viewAdd };
function render(){
  var app = document.getElementById('app'), keep = document.activeElement && document.activeElement.id === 'q';
  app.innerHTML = VIEWS[S.tab]();
  document.getElementById('nav').innerHTML = TABS.map(function(t){ return '<button data-tab="' + t[0] + '" class="' + (S.tab === t[0] ? 'on' : '') + '" aria-label="' + t[1] + '">' + ICON[t[0]] + '<span>' + t[1] + '</span></button>'; }).join('');
  if(keep){ var q = document.getElementById('q'); if(q){ q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
}
function go(tab){ S.tab = tab; render(); window.scrollTo(0, 0); }
function addList(id){
  var f = S.list.filter(function(i){ return i.product === id; })[0];
  if(f) f.qty++; else S.list.push({ product:id, qty:1 });
  save(); toast('Added to your list');
}
function watchProduct(id){
  var offers = townOffers(S.town, id).sort(function(a, b){ return a.price - b.price; });
  if(!S.watch.some(function(w){ return w.product === id && (w.town || S.town) === S.town; })){
    var t = offers[0] ? Math.floor(offers[0].price * 0.9 * 2) / 2 : 10; S.watch.push({ product:id, target:t, town:S.town }); save();
  }
  toast('Watching this price. Set your target on the Alerts tab.'); go('alerts');
}
document.addEventListener('click', function(e){
  var t = e.target.closest('[data-tab],[data-cat],[data-cmp],[data-addlist],[data-watch],[data-del],[data-wdel],[data-mdel],#pladd,#geo,#notif,#fadd');
  if(!t) return;
  if(t.dataset.tab) return go(t.dataset.tab);
  if(t.dataset.cat){ S.cat = t.dataset.cat; return render(); }
  if(t.dataset.cmp){ S.cq = t.dataset.cmp; return go('compare'); }
  if(t.dataset.addlist) return addList(t.dataset.addlist);
  if(t.dataset.watch) return watchProduct(t.dataset.watch);
  if(t.dataset.del){ S.list.splice(+t.dataset.del, 1); save(); return render(); }
  if(t.dataset.wdel){ S.watch.splice(+t.dataset.wdel, 1); save(); return render(); }
  if(t.dataset.mdel){ S.mine.splice(+t.dataset.mdel, 1); save(); return render(); }
  if(t.id === 'pladd'){ var q = Math.max(1, Math.round(+document.getElementById('pq').value || 1)), id = document.getElementById('pl').value, f = S.list.filter(function(i){ return i.product === id; })[0]; if(f) f.qty += q; else S.list.push({ product:id, qty:q }); save(); return render(); }
  if(t.id === 'geo'){
    if(S.pos){ S.pos = null; save(); return render(); }
    if(!navigator.geolocation) return toast('Location is not available on this device');
    navigator.geolocation.getCurrentPosition(function(p){ S.pos = { lat:p.coords.latitude, lng:p.coords.longitude }; save(); render(); toast('Using your location for distances'); }, function(){ toast('Location was not shared'); }, { timeout:8000 });
    return;
  }
  if(t.id === 'notif'){ try{ Notification.requestPermission().then(function(){ render(); runAlerts(); }); }catch(err){ render(); } return; }
  if(t.id === 'fadd'){
    var v = function(id){ return document.getElementById(id).value; }, price = parseFloat(v('fn')), regular = parseFloat(v('fr')), err = document.getElementById('ferr');
    if(!(regular > 0) || !(price >= 0)){ err.textContent = 'Enter the normal price and the special price.'; return; }
    if(price >= regular){ err.textContent = 'The special price must be lower than the normal price.'; return; }
    if(!v('fe') || v('fe') < today().toISOString().slice(0, 10)){ err.textContent = 'Choose an end date that has not passed.'; return; }
    S.mine.push({ id:'mine' + Date.now(), shopId:v('fs'), product:v('fp'), price:price, regular:regular, ends:v('fe') }); save(); toast('Deal added. It shows as not checked.'); S.tab = 'deals'; S.cat = 'All'; S.q = ''; render(); window.scrollTo(0, 0);
  }
});
document.addEventListener('input', function(e){
  var t = e.target;
  if(t.id === 'q'){ S.q = t.value; render(); }
  else if(t.id === 'pk'){ S.perKm = Math.max(0, +t.value || 0); save(); }
  else if(t.dataset && t.dataset.wt != null){ S.watch[+t.dataset.wt].target = +t.value || 0; save(); }
});
document.addEventListener('change', function(e){
  var t = e.target;
  if(t.id === 'sort'){ S.sort = t.value; render(); }
  else if(t.id === 'all'){ S.allTowns = t.checked; render(); }
  else if(t.id === 'cq'){ S.cq = t.value; render(); }
  else if(t.id === 'pk'){ render(); }
  else if(t.dataset && t.dataset.wt != null){ render(); runAlerts(); }
});
var sel = document.getElementById('town');
sel.innerHTML = Object.keys(TOWNS).map(function(t){ return '<option' + (t === S.town ? ' selected' : '') + '>' + t + '</option>'; }).join('');
sel.addEventListener('change', function(){ S.town = sel.value; S.pos = null; save(); render(); runAlerts(); });
window.__nampromo = { S:S, plan:plan, allOffers:allOffers, alertStatus:alertStatus, SHOPS:SHOPS, PRODUCTS:PRODUCTS, km:km, render:render };
render(); runAlerts();
if('serviceWorker' in navigator && location.protocol.indexOf('http') === 0){ try{ navigator.serviceWorker.register('sw.js'); }catch(e){} }
})();
