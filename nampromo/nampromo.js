/* NamPromo: find specials, compare shop prices and plan where to shop in Namibia.
   Sample data only. The shops and prices below are made up to show how the app works, and the app says so on every page. */
(function(){
'use strict';
var TOWNS = {
  'Windhoek':[-22.5609,17.0658], 'Swakopmund':[-22.6784,14.5266], 'Walvis Bay':[-22.9576,14.5053], 'Oshakati':[-17.788,15.6995], 'Rundu':[-17.9333,19.7667],
  'Katima Mulilo':[-17.5,24.27], 'Otjiwarongo':[-20.4637,16.6477], 'Keetmanshoop':[-26.5833,18.1333], 'Gobabis':[-22.45,18.97]
};
var CATS = ['Food and groceries', 'Home and household', 'Clothing and shoes', 'Electronics', 'Building and hardware', 'Health and beauty', 'Restaurants and takeaways', 'Farming and agri', 'Vehicles and parts', 'Other'];
/* unit: the size is turned into a price per kg, per litre or each so different pack sizes can be compared */
var PRODUCTS = [
  { id:'maize', name:'Maize meal 10 kg', cat:'Food and groceries', base:125, qty:10, u:'kg' },
  { id:'sugar', name:'White sugar 2 kg', cat:'Food and groceries', base:48, qty:2, u:'kg' },
  { id:'oil', name:'Cooking oil 750 ml', cat:'Food and groceries', base:42, qty:0.75, u:'L' },
  { id:'rice', name:'Rice 2 kg', cat:'Food and groceries', base:45, qty:2, u:'kg' },
  { id:'milk', name:'Long life milk 1 L', cat:'Food and groceries', base:19, qty:1, u:'L' },
  { id:'bread', name:'White bread 700 g', cat:'Food and groceries', base:17, qty:0.7, u:'kg' },
  { id:'eggs', name:'Eggs tray of 30', cat:'Food and groceries', base:62, qty:30, u:'egg' },
  { id:'chicken', name:'Chicken portions 2 kg', cat:'Food and groceries', base:95, qty:2, u:'kg' },
  { id:'powder', name:'Washing powder 2 kg', cat:'Home and household', base:78, qty:2, u:'kg' },
  { id:'tp', name:'Toilet paper 9 rolls', cat:'Home and household', base:65, qty:9, u:'roll' },
  { id:'kettle', name:'Electric kettle', cat:'Home and household', base:249, qty:1, u:'each' },
  { id:'jeans', name:'Jeans', cat:'Clothing and shoes', base:599, qty:1, u:'each' },
  { id:'sneak', name:'Everyday sneakers', cat:'Clothing and shoes', base:899, qty:1, u:'each' },
  { id:'phones', name:'Wireless headphones', cat:'Electronics', base:1199, qty:1, u:'each' },
  { id:'phone', name:'Entry level smartphone', cat:'Electronics', base:1899, qty:1, u:'each' },
  { id:'cement', name:'Cement 50 kg bag', cat:'Building and hardware', base:115, qty:50, u:'kg' },
  { id:'paint', name:'Wall paint 20 L', cat:'Building and hardware', base:890, qty:20, u:'L' },
  { id:'hammer', name:'Claw hammer', cat:'Building and hardware', base:129, qty:1, u:'each' },
  { id:'plasters', name:'Plasters box of 100', cat:'Health and beauty', base:35, qty:100, u:'plaster' },
  { id:'shampoo', name:'Shampoo 400 ml', cat:'Health and beauty', base:48, qty:0.4, u:'L' },
  { id:'lunch', name:'Lunch combo', cat:'Restaurants and takeaways', base:99, qty:1, u:'each' }
];
var SHOP_KINDS = [
  { k:'market', name:'Example Market', sells:['Food and groceries', 'Home and household'], off:[0.004, 0.006] },
  { k:'mart', name:'Example Mart', sells:['Food and groceries', 'Home and household', 'Clothing and shoes', 'Electronics'], off:[-0.012, 0.009] },
  { k:'bulk', name:'Example Wholesale', sells:['Food and groceries', 'Home and household'], off:[0.026, -0.018] },
  { k:'kitchen', name:'Example Kitchen', sells:['Restaurants and takeaways'], off:[-0.005, -0.007] },
  { k:'hardware', name:'Example Hardware', sells:['Building and hardware', 'Home and household'], off:[0.019, 0.012] },
  { k:'fashion', name:'Example Fashion House', sells:['Clothing and shoes'], off:[-0.008, -0.013] },
  { k:'pharm', name:'Example Pharmacy', sells:['Health and beauty'], off:[0.009, -0.004] },
  { k:'tech', name:'Example Tech', sells:['Electronics'], off:[-0.016, 0.004] }
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
    SHOPS.push({ id:id, name:kind.name, town:town, lat:c[0] + kind.off[0], lng:c[1] + kind.off[1], sells:kind.sells, address:'Example address, ' + town, sample:true });
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

/* ---- live data from the NamPromo server, when it is connected (window.NAMPROMO_CONFIG = { url, anonKey }) ---- */
var CFG = window.NAMPROMO_CONFIG || {}, LIVE = !!(CFG.url && CFG.anonKey), LIVE_DATA = false;
function api(path, opt){
  opt = opt || {};
  return fetch(CFG.url.replace(/\/$/, '') + path, { method:opt.body ? 'POST' : 'GET', headers:{ apikey:CFG.anonKey, authorization:'Bearer ' + CFG.anonKey, 'content-type':'application/json' }, body:opt.body ? JSON.stringify(opt.body) : undefined })
    .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ return { status:r.status, body:j }; }); });
}
function loadLive(){
  if(!LIVE) return Promise.resolve();
  return Promise.all([api('/rest/v1/public_shops?select=*'), api('/rest/v1/public_promotions?select=*')]).then(function(res){
    if(res[0].status !== 200 || !Array.isArray(res[0].body) || !Array.isArray(res[1].body)) return;
    SHOPS.length = 0; OFFERS.length = 0; Object.keys(shopById).forEach(function(k){ delete shopById[k]; });
    res[0].body.forEach(function(r){
      var c = TOWNS[r.town] || TOWNS.Windhoek, sh = { id:r.id, name:r.name, town:r.town, lat:r.lat != null ? r.lat : c[0] + (hash(r.id + 'a') - 0.5) * 0.04, lng:r.lng != null ? r.lng : c[1] + (hash(r.id + 'b') - 0.5) * 0.04, sells:[r.category], address:r.address, custom:!r.verified, live:true };
      SHOPS.push(sh); shopById[sh.id] = sh;
    });
    res[1].body.forEach(function(r){
      if(!shopById[r.shop_id]) return;
      OFFERS.push({ live:true, id:r.id, shop:r.shop_id, product:prodById[r.product_key] ? r.product_key : '', title:prodById[r.product_key] ? '' : r.title, cat:r.category, price:Number(r.sale_price), regular:Number(r.regular_price), ends:new Date(r.expires_at), source:r.shop_verified ? 'Verified shop' : 'Posted by the shop, not checked' });
    });
    LIVE_DATA = true; render();
  }).catch(function(){});
}
/* ---- saved on this device ---- */
function addOperatorShop(o){
  var c = TOWNS[o.town] || TOWNS.Windhoek, sh = { id:'op|' + o.id, name:o.name, town:o.town, lat:c[0] + (hash(o.id + 'a') - 0.5) * 0.04, lng:c[1] + (hash(o.id + 'b') - 0.5) * 0.04, sells:[o.cat], address:o.address || o.town, custom:true };
  if(!shopById[sh.id]){ SHOPS.push(sh); shopById[sh.id] = sh; }
}
var KEY = 'nampromo_v1';
var S = { town:'Windhoek', tab:'home', list:[], watch:[], mine:[], perKm:4, pos:null, allTowns:false, cat:'All', q:'', sort:'saving', cq:'', lastAlerts:{}, saved:[], slide:0, me:null, ops:[], outbox:[], dcat:'All', dshop:'' };
try{ var saved = JSON.parse(localStorage.getItem(KEY) || '{}'); ['town', 'list', 'watch', 'mine', 'perKm', 'pos', 'me', 'ops', 'outbox', 'saved'].forEach(function(k){ if(saved[k] != null) S[k] = saved[k]; }); }catch(e){}
if(!TOWNS[S.town]) S.town = 'Windhoek';
S.ops.forEach(addOperatorShop);
function save(){ try{ localStorage.setItem(KEY, JSON.stringify({ town:S.town, list:S.list, watch:S.watch, mine:S.mine, perKm:S.perKm, pos:S.pos, me:S.me, ops:S.ops, outbox:S.outbox, saved:S.saved })); }catch(e){} }

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
  var extra = S.mine.filter(function(m){ return shopById[m.shopId]; }).map(function(m){ return { id:m.id, shop:m.shopId, product:m.product || '', price:m.price, regular:m.regular, ends:m.ends ? new Date(m.ends + 'T12:00:00') : null, source:shopById[m.shopId].custom ? 'Posted by the shop, not checked' : 'Community, not checked', title:m.title, cat:m.cat, mine:true }; });
  return OFFERS.concat(extra).filter(function(o){ return !o.ends || o.ends.getTime() >= today().getTime() - DAY / 2; });
}
function townOffers(town, prodId){ return allOffers().filter(function(o){ var s = shopById[o.shop]; return s && s.town === town && (!prodId || o.product === prodId); }); }
function catOf(o){ return o.cat || (prodById[o.product] && prodById[o.product].cat) || (shopById[o.shop] && shopById[o.shop].sells[0]) || 'Other'; }
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

/* ---- messages: only previews until a server is connected ---- */
function channels(){ var m = S.me, c = []; if(!m) return c; if(m.wa) c.push('WhatsApp'); if(m.sms) c.push('SMS'); if(m.mail) c.push('Email'); return c; }
function queueMessage(key, text){
  channels().forEach(function(ch){
    var k = key + '|' + ch; if(S.outbox.some(function(x){ return x.key === k; })) return;
    S.outbox.unshift({ key:k, ch:ch, to:ch === 'Email' ? S.me.email : S.me.phone, text:text, at:new Date().toISOString() });
  });
  S.outbox = S.outbox.slice(0, 30); save();
}
function cleanPhone(v){ var d = String(v || '').replace(/[\s\-().]/g, ''); if(/^00264/.test(d)) d = '+' + d.slice(2); else if(/^0/.test(d)) d = '+264' + d.slice(1); else if(/^264/.test(d)) d = '+' + d; return /^\+2648\d{8}$/.test(d) ? d : null; }
function okEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v || ''); }

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
    queueMessage('alert|' + key, 'Price alert: ' + nameOf(st.low) + ' is ' + money(st.low.price) + ' at ' + shopById[st.low.shop].name + ', ' + shopById[st.low.shop].town + '.');
    if('Notification' in window && Notification.permission === 'granted'){
      try{ new Notification('NamPromo price alert', { body:nameOf(st.low) + ' is ' + money(st.low.price) + ' at ' + shopById[st.low.shop].name + ' in ' + shopById[st.low.shop].town + '.' }); }catch(e){}
    }
  });
}

/* ---- screens ---- */
var ICON = {
  home:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/></svg>',
  saved:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-8-5-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 6-8 11-8 11z"/></svg>',
  deals:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12l9-9h8v8l-9 9z"/><circle cx="16" cy="8" r="1.5"/></svg>',
  compare:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/></svg>',
  plan:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/></svg>',
  alerts:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 004 0"/></svg>',
  shops:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l2-5h14l2 5M3 9h18M5 9v11h14V9M10 20v-6h4v6"/></svg>',
  me:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>'
};
var TABS = [['home', 'Home'], ['saved', 'Saved'], ['plan', 'Shopping List'], ['shops', 'Shops'], ['me', 'Profile']];
var NAVOF = { deals:'home', compare:'home', alerts:'saved', add:'me', shopreg:'me' };
var DEMO_HTML = '<div class="demo"><b>Sample data.</b> The shops and prices here are made up to show how NamPromo works. They are not real specials. Real prices need to be confirmed with each shop.</div>';
function demo(){ return LIVE_DATA ? '' : DEMO_HTML; }

function offerCard(o){
  var s = shopById[o.shop], pr = prodById[o.product], off = pct(o), up = unitText(o);
  return '<div class="card"><div class="row"><div class="grow"><div style="font-weight:650">' + esc(nameOf(o)) + '</div>' +
    '<div class="muted">' + esc(s.name) + ', ' + esc(s.town) + ' · ' + dist(s).toFixed(1) + ' km away' + '</div></div>' + (off ? '<span class="badge">' + off + '% off</span>' : '') + '<button class="x" style="position:static;color:' + (isSaved(o.id) ? '#E5484D' : 'var(--muted)') + '" data-heart="' + esc(o.id) + '" aria-label="Save this deal">' + (isSaved(o.id) ? '♥' : '♡') + '</button></div>' +
    '<div style="margin:6px 0 2px"><span class="price">' + money(o.price) + '</span>' + (off ? '<span class="was">' + money(o.regular) + '</span>' : '') + '</div>' +
    '<div class="muted">' + [up, endsText(o), o.mine ? o.source : ''].filter(Boolean).map(esc).join(' · ') + '</div>' +
    '<div class="row" style="margin-top:10px;flex-wrap:wrap"><a class="btn small" style="text-decoration:none" target="_blank" rel="noopener" href="' + navUrl(s) + '">Navigate</a>' +
    (pr ? '<button class="btn small alt" data-cmp="' + o.product + '">Compare shops</button><button class="btn small alt" data-addlist="' + o.product + '">Add to list</button><button class="btn small alt" data-watch="' + o.product + '">Watch price</button>' : '') + '</div></div>';
}
function viewDeals(){
  var list = allOffers().filter(function(o){ var s = shopById[o.shop]; return (S.allTowns || s.town === S.town) && pct(o) > 0 && (S.cat === 'All' || catOf(o) === S.cat) && (!S.q || (nameOf(o) + ' ' + s.name).toLowerCase().indexOf(S.q.toLowerCase()) >= 0); });
  if(S.sort === 'saving') list.sort(function(a, b){ return pct(b) - pct(a); });
  else if(S.sort === 'price') list.sort(function(a, b){ return a.price - b.price; });
  else if(S.sort === 'ends') list.sort(function(a, b){ return (a.ends ? a.ends.getTime() : 9e15) - (b.ends ? b.ends.getTime() : 9e15); });
  else list.sort(function(a, b){ return dist(shopById[a.shop]) - dist(shopById[b.shop]); });
  var chips = ['All'].concat(CATS).map(function(c){ return '<button class="chip' + (S.cat === c ? ' on' : '') + '" data-cat="' + c + '">' + c + '</button>'; }).join('');
  return demo() + '<button class="btn alt small" data-tab="home">Back</button><h2 style="margin-top:12px">All specials</h2><p class="sub">' + (S.allTowns ? 'All towns' : esc(S.town)) + ', ' + list.length + ' specials</p>' +
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
          '<div style="margin-top:4px"><span class="price">' + money(o.price) + '</span>' + (pct(o) ? '<span class="was">' + money(o.regular) + '</span> <span class="badge">' + pct(o) + '% off</span>' : '') + '</div><div class="muted">' + esc([unitText(o), endsText(o), o.mine ? o.source : ''].filter(Boolean).join(' · ')) + '</div>' +
          '<div class="row" style="margin-top:8px"><a class="btn small" style="text-decoration:none" target="_blank" rel="noopener" href="' + navUrl(s) + '">Navigate</a></div></div>'; }).join('') +
        '<div class="row"><button class="btn alt grow" data-addlist="' + S.cq + '">Add to my list</button><button class="btn alt grow" data-watch="' + S.cq + '">Watch this price</button></div>';
    } else body = '<div class="empty">No shop in ' + esc(S.town) + ' has this product in the sample data.</div>';
  }
  return demo() + '<h2>Compare prices</h2><p class="sub">Same product, every shop in ' + esc(S.town) + '.</p><select id="cq" aria-label="Product"><option value="">Choose a product</option>' + opts + '</select><div style="height:12px"></div>' + body;
}
function viewPlan(){
  var opts = PRODUCTS.map(function(p){ return '<option value="' + p.id + '">' + esc(p.name) + '</option>'; }).join('');
  var html = demo() + '<h2>Where to shop</h2><p class="sub">Add what you need. NamPromo finds the best way to buy it in ' + esc(S.town) + '.</p>' +
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
function alertBody(w){
  var st = alertStatus(w);
  return st.low ? '<div style="margin-top:8px">' + (st.hit ? '<span class="badge good">Reached</span> ' : '') + 'Lowest now: <b>' + money(st.low.price) + '</b> at ' + esc(shopById[st.low.shop].name) + '</div><div class="row" style="margin-top:8px"><a class="btn small" style="text-decoration:none" target="_blank" rel="noopener" href="' + navUrl(shopById[st.low.shop]) + '">Navigate</a></div>' : '<div class="muted" style="margin-top:8px">No price found.</div>';
}
function viewAlerts(){ return alertsHtml('<h2>Price alerts</h2><p class="sub">Watch a product and set the price you want. NamPromo tells you when a shop reaches it.</p>'); }
function alertsHtml(head){
  var perm = 'Notification' in window ? Notification.permission : 'unsupported';
  var html = head;
  if(!S.watch.length) html += '<div class="empty">No alerts yet. Open a special and tap Watch price.</div>';
  html += S.watch.map(function(w, n){
    var p = prodById[w.product], st = alertStatus(w); if(!p) return '';
    return '<div class="card' + (st.hit ? ' alert-hit' : '') + '"><div class="row"><div class="grow"><b>' + esc(p.name) + '</b><div class="muted">' + esc(w.town || S.town) + '</div></div><button class="x" data-wdel="' + n + '" aria-label="Remove alert">×</button></div>' +
      '<div class="row" style="margin-top:6px"><label style="margin:0">Alert me at or below</label><input type="number" min="0" step="0.5" value="' + w.target + '" data-wt="' + n + '" style="width:110px"></div>' +
      '<div data-st="' + n + '">' + alertBody(w) + '</div></div>';
  }).join('');
  html += '<div class="card"><b>Phone notifications</b><p class="muted" style="margin:4px 0 8px">' + (perm === 'granted' ? 'On. NamPromo notifies you when you open the app and an alert has been reached.' : perm === 'denied' ? 'Blocked in your browser settings.' : perm === 'unsupported' ? 'Your browser does not support notifications.' : 'Allow notifications to get a message when an alert is reached.') +
    ' Alerts that arrive when the app is closed need a NamPromo server, which is not built yet.</p>' + (perm === 'default' ? '<button class="btn" id="notif">Allow notifications</button>' : '') + '</div>';
  return html;
}
function shopOffers(id){ return allOffers().filter(function(o){ return o.shop === id; }).sort(function(a, b){ return pct(b) - pct(a); }); }
function viewShops(){
  var chips = ['All'].concat(CATS).map(function(c){ return '<button class="chip' + (S.dcat === c ? ' on' : '') + '" data-dcat="' + esc(c) + '">' + esc(c) + '</button>'; }).join('');
  if(S.dshop && shopById[S.dshop]){
    var sh = shopById[S.dshop], os = shopOffers(sh.id);
    return demo() + '<button class="btn alt small" id="dback">Back to shops</button><h2 style="margin-top:12px">' + esc(sh.name) + '</h2><p class="sub">' + esc(sh.sells.join(', ')) + ' · ' + esc(sh.town) + ' · ' + dist(sh).toFixed(1) + ' km away' + (sh.custom ? ' · Not yet checked' : sh.live ? ' · Verified' : ' · Sample shop') + '</p>' +
      '<a class="btn block" style="text-decoration:none;display:block;text-align:center;margin-bottom:12px" target="_blank" rel="noopener" href="' + navUrl(sh) + '">Navigate to this shop</a>' +
      (os.length ? os.map(offerCard).join('') : '<div class="empty">This shop has not listed any prices or specials yet.</div>');
  }
  var shops = SHOPS.filter(function(x){ return x.town === S.town && (S.dcat === 'All' || x.sells.indexOf(S.dcat) >= 0); }).sort(function(a, b){ return dist(a) - dist(b); });
  return demo() + '<h2>Shops in ' + esc(S.town) + '</h2><p class="sub">Every kind of shop, from food to clothing to building. Shops that register list their own specials here.</p><div class="chips">' + chips + '</div>' +
    (shops.length ? shops.map(function(x){ var n = shopOffers(x.id).filter(function(o){ return pct(o) > 0; }).length; return '<div class="card"><div class="row"><div class="grow"><b>' + esc(x.name) + '</b><div class="muted">' + dist(x).toFixed(1) + ' km away</div></div>' + (n ? '<span class="badge">' + n + ' special' + (n > 1 ? 's' : '') + '</span>' : '') + '</div>' +
      '<div style="margin:6px 0">' + x.sells.map(function(c){ return '<span class="tag">' + esc(c) + '</span> '; }).join('') + (x.custom ? '<span class="tag">Not yet checked</span>' : x.live ? '<span class="tag">Verified</span>' : '') + '</div>' +
      '<div class="row"><button class="btn small" data-dshop="' + esc(x.id) + '">See prices and specials</button><a class="btn small alt" style="text-decoration:none" target="_blank" rel="noopener" href="' + navUrl(x) + '">Navigate</a></div></div>'; }).join('') : '<div class="empty">No shops listed in this category in ' + esc(S.town) + ' yet. Shop owners can list their shop under Me.</div>') +
    '<div class="card" style="background:var(--chip)"><b>Own a shop?</b><p class="muted" style="margin:4px 0 8px">Any operator in Namibia can list their shop and post specials.</p><button class="btn" data-tab="shopreg">List my shop</button></div>';
}
var PRIVACY = 'In this test version your details are saved on this device only. How personal information will be handled and protected is to be confirmed with the relevant legal bodies, authorities and entities of Namibia before launch.';
function viewMe(){
  var m = S.me, html = demo() + '<h2>' + (m ? 'Hello, ' + esc(m.name.split(' ')[0]) : 'Join NamPromo') + '</h2>';
  if(!m && S.pending) return demo() + '<h2>Enter your code</h2><p class="sub">We sent a 6 digit code to ' + esc(S.pending.phone) + '. It works for 10 minutes.</p><div class="card"><label for="mcode" style="margin-top:0">Code</label><input id="mcode" inputmode="numeric" maxlength="6" autocomplete="one-time-code"><div style="height:12px"></div><button class="btn block" id="mecode">Confirm</button><div class="muted" id="mcerr" style="color:var(--bad);margin-top:6px"></div><button class="btn alt small" id="mecancel" style="margin-top:10px">Back</button></div>';
  if(!m){
    return html + '<p class="sub">Sign up to get deals and price alerts on WhatsApp or SMS.</p><div class="card">' +
      '<label for="mn" style="margin-top:0">Full name</label><input id="mn" autocomplete="name">' +
      '<label for="me">Email address</label><input id="me" type="email" autocomplete="email" inputmode="email">' +
      '<label for="mp">Cellphone number</label><input id="mp" type="tel" autocomplete="tel" inputmode="tel" placeholder="081 123 4567">' +
      '<label>Send me deals by</label><label style="display:flex;gap:8px;align-items:center;margin:4px 0;color:var(--ink)"><input type="checkbox" id="mwa" style="width:auto" checked> WhatsApp</label>' +
      '<label style="display:flex;gap:8px;align-items:center;margin:4px 0;color:var(--ink)"><input type="checkbox" id="msms" style="width:auto" checked> SMS</label>' +
      '<label style="display:flex;gap:8px;align-items:center;margin:4px 0;color:var(--ink)"><input type="checkbox" id="mmail" style="width:auto"> Email</label>' +
      '<label style="display:flex;gap:8px;align-items:flex-start;margin:12px 0;color:var(--ink)"><input type="checkbox" id="mok" style="width:auto;margin-top:4px"> <span>I agree that NamPromo may send me deals and price alerts on the ways I ticked. I can stop at any time.</span></label>' +
      '<button class="btn block" id="mesave">Sign up</button><div class="muted" id="meerr" style="color:var(--bad);margin-top:6px"></div><div class="muted" style="margin-top:8px">' + esc(PRIVACY) + '</div></div>' +
      '<div class="card" style="background:var(--chip)"><b>Own a shop?</b><p class="muted" style="margin:4px 0 8px">List your shop and post your specials for shoppers across Namibia.</p><button class="btn" data-tab="shopreg">List my shop</button></div>';
  }
  html += '<p class="sub">' + esc(m.email) + ' · ' + esc(m.phone) + '</p><div class="card"><b>How should we reach you?</b>' +
    [['wa', 'WhatsApp'], ['sms', 'SMS'], ['mail', 'Email']].map(function(c){ return '<label style="display:flex;gap:8px;align-items:center;margin:8px 0 0;color:var(--ink)"><input type="checkbox" data-pref="' + c[0] + '" style="width:auto"' + (m[c[0]] ? ' checked' : '') + '> ' + c[1] + '</label>'; }).join('') +
    '<label style="margin-top:14px">Deals I want to hear about</label><div class="chips" style="flex-wrap:wrap;overflow:visible">' + CATS.map(function(c){ return '<button class="chip' + ((m.cats || []).indexOf(c) >= 0 ? ' on' : '') + '" data-icat="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') + '</div></div>' +
    '<div class="card"><b>Message previews</b><p class="muted" style="margin:4px 0 8px">' + (LIVE ? 'Your messages come from the NamPromo server. These show what a message looks like.' : '<b>Nothing is sent yet.</b> WhatsApp and SMS messages start once NamPromo\'s server and message providers are connected. These show what you would receive.') + '</p>' +
    '<button class="btn alt small" id="medigest">Preview my specials message</button>' +
    (S.outbox.length ? S.outbox.slice(0, 6).map(function(x){ return '<div class="li" style="display:block"><div class="muted">' + esc(x.ch) + ' to ' + esc(x.to) + '</div><div>' + esc(x.text) + '</div></div>'; }).join('') : '<div class="muted" style="margin-top:8px">No previews yet.</div>') + '</div>' +
    '<div class="card"><b>Shop owner</b>' + (S.ops.length ? S.ops.map(function(o){ return '<div class="li"><div class="grow">' + esc(o.name) + '<div class="muted">' + esc(o.cat) + ' · ' + esc(o.town) + ' · not yet checked</div></div></div>'; }).join('') : '<p class="muted" style="margin:4px 0">You have not listed a shop.</p>') +
    '<div class="row" style="margin-top:8px;flex-wrap:wrap"><button class="btn small" data-tab="shopreg">List a shop</button><button class="btn small alt" data-tab="add">Post a special</button></div></div>' +
    '<div class="card"><div class="muted">' + esc(PRIVACY) + '</div><button class="btn alt small" id="meout" style="margin-top:8px">Delete my details</button></div>';
  return html;
}
function viewShopReg(){
  return demo() + '<button class="btn alt small" data-tab="me">Back</button><h2 style="margin-top:12px">List your shop</h2><p class="sub">For shop owners and operators anywhere in Namibia, from food and clothing to building and farming.</p><div class="card">' +
    '<label for="on" style="margin-top:0">Shop or business name</label><input id="on">' +
    '<label for="oc">Category</label><select id="oc">' + CATS.map(function(c){ return '<option>' + esc(c) + '</option>'; }).join('') + '</select>' +
    '<label for="ot">Town</label><select id="ot">' + Object.keys(TOWNS).map(function(t){ return '<option' + (t === S.town ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select>' +
    '<label for="oa">Street address</label><input id="oa" autocomplete="street-address">' +
    '<label for="ocn">Contact person</label><input id="ocn" value="' + esc(S.me ? S.me.name : '') + '">' +
    '<label for="oe">Email address</label><input id="oe" type="email" value="' + esc(S.me ? S.me.email : '') + '">' +
    '<label for="op">Cellphone number</label><input id="op" type="tel" value="' + esc(S.me ? S.me.phone : '') + '">' +
    '<label for="or">Business registration number (optional)</label><input id="or">' +
    '<div style="height:12px"></div><button class="btn block" id="opsave">List my shop</button><div class="muted" id="operr" style="color:var(--bad);margin-top:6px"></div>' +
    '<div class="muted" style="margin-top:8px">Your shop shows as "not yet checked" until NamPromo confirms the business. ' + esc(PRIVACY) + '</div></div>';
}
function viewAdd(){
  var own = S.ops.map(function(o){ return shopById['op|' + o.id]; }).filter(Boolean);
  var townShops = SHOPS.filter(function(s){ return s.town === S.town && !s.custom; });
  var d = new Date(today().getTime() + 7 * DAY).toISOString().slice(0, 10);
  var html = demo() + '<button class="btn alt small" data-tab="me">Back</button><h2 style="margin-top:12px">Post a special</h2><p class="sub">Shop owners can post their own specials. Anyone else can add one they saw. It shows as "not checked" until the shop is confirmed. Specials are saved on this device only for now.</p><div class="card">' +
    '<label for="fs" style="margin-top:0">Shop</label><select id="fs">' + (own.length ? '<optgroup label="Your shops">' + own.map(function(s){ return '<option value="' + esc(s.id) + '">' + esc(s.name) + ', ' + esc(s.town) + '</option>'; }).join('') + '</optgroup>' : '') +
    '<optgroup label="Shops in ' + esc(S.town) + '">' + townShops.map(function(s){ return '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>'; }).join('') + '</optgroup></select>' +
    '<label for="fp">Product</label><select id="fp"><option value="">Something else (type it below)</option>' + PRODUCTS.map(function(p){ return '<option value="' + p.id + '">' + esc(p.name) + '</option>'; }).join('') + '</select>' +
    '<label for="ft">Name of the product, if something else</label><input id="ft" placeholder="For example 20 litre paint, school shoes">' +
    '<label for="fc">Category, if something else</label><select id="fc">' + CATS.map(function(c){ return '<option>' + esc(c) + '</option>'; }).join('') + '</select>' +
    '<div class="row"><div class="grow"><label for="fr">Normal price (N$)</label><input id="fr" type="number" min="0" step="0.5" inputmode="decimal"></div><div class="grow"><label for="fn">Special price (N$)</label><input id="fn" type="number" min="0" step="0.5" inputmode="decimal"></div></div>' +
    '<label for="fe">Ends on</label><input id="fe" type="date" value="' + d + '">' +
    '<div style="height:12px"></div><button class="btn block" id="fadd">Post special</button><div class="muted" id="ferr" style="color:var(--bad);margin-top:6px"></div></div>';
  if(S.mine.length) html += '<h2 style="font-size:16px">Specials you posted</h2>' + S.mine.map(function(m, n){ var s = shopById[m.shopId]; return '<div class="li"><div class="grow"><b>' + esc(m.title || (prodById[m.product] ? prodById[m.product].name : '')) + '</b><div class="muted">' + esc(s ? s.name : '') + ' · ' + money(m.price) + ' · not checked</div></div><button class="x" data-mdel="' + n + '" aria-label="Remove">×</button></div>'; }).join('');
  return html;
}

/* ---- drawing and events ---- */
/* ---- home dashboard ---- */
var CATLOOK = {
  'Food and groceries':['🛒', '#DDF3E4', '#0F6B3A', 'Groceries'], 'Home and household':['🧺', '#FDEBD3', '#9A5B0B', 'Home'], 'Clothing and shoes':['👕', '#DCEBFF', '#1E5FB4', 'Clothing'], 'Electronics':['🎧', '#FFE9D6', '#B1561A', 'Electronics'],
  'Building and hardware':['🧱', '#F2E3D6', '#8B4A22', 'Building'], 'Health and beauty':['🧴', '#F3E1F5', '#8A2F94', 'Health'], 'Restaurants and takeaways':['🍔', '#FFE0DE', '#B3261E', 'Restaurants'],
  'Farming and agri':['🌾', '#F2F0C9', '#6B6A0B', 'Farming'], 'Vehicles and parts':['🚗', '#E3E7EE', '#3A4A66', 'Vehicles'], 'Other':['🏷️', '#E7EAE8', '#4A5A53', 'Other']
};
function look(c){ return CATLOOK[c] || CATLOOK.Other; }
function dateText(d){ try{ return new Date(d).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }); }catch(e){ return ''; } }
function findOffer(id){ return allOffers().filter(function(o){ return o.id === id; })[0]; }
function isSaved(id){ return S.saved.indexOf(id) >= 0; }
function gridCard(o){
  var s = shopById[o.shop], off = pct(o), c = catOf(o), L = look(c);
  return '<div class="gcard" data-deal="' + esc(o.id) + '"><div class="gtile" style="background:' + L[1] + '"><span>' + L[0] + '</span>' + (off ? '<b class="save">SAVE ' + off + '%</b>' : '') +
    '<button class="heart' + (isSaved(o.id) ? ' on' : '') + '" data-heart="' + esc(o.id) + '" aria-label="Save this deal">' + (isSaved(o.id) ? '♥' : '♡') + '</button></div>' +
    '<div class="gbody"><div class="gname">' + esc(nameOf(o)) + '</div><div class="muted">' + esc(s.name) + '</div>' +
    '<div class="price sm">' + money(o.price) + (off ? '<span class="was">' + money(o.regular) + '</span>' : '') + '</div>' +
    (o.ends ? '<div class="muted">Expires ' + esc(dateText(o.ends)) + '</div>' : '') + '<span class="cchip" style="background:' + L[1] + ';color:' + L[2] + '">' + esc(L[3]) + '</span>' +
    '<div class="muted">📍 ' + esc(s.town) + ' (' + esc(s.name) + ')</div></div></div>';
}
function townSpecials(){ return allOffers().filter(function(o){ return shopById[o.shop].town === S.town && pct(o) > 0; }).sort(function(a, b){ return pct(b) - pct(a); }); }
function viewHome(){
  var sp = townSpecials(), slides = sp.slice(0, 3), n = slides.length, k = n ? S.slide % n : 0, h = slides[k];
  var cats = ['Food and groceries', 'Clothing and shoes', 'Electronics', 'Building and hardware', 'Health and beauty', 'Restaurants and takeaways', 'Home and household'];
  var catRow = '<div class="cats">' + cats.map(function(c){ var L = look(c); return '<button class="cat" data-cat2="' + esc(c) + '"><i style="background:' + L[1] + '">' + L[0] + '</i>' + esc(L[3]) + '</button>'; }).join('') + '<button class="cat" data-cat2="All"><i style="background:var(--chip)">▦</i>All deals</button></div>';
  var hero = h ? '<div class="hero"><span class="badge">THIS WEEK IN ' + esc(S.town.toUpperCase()) + '</span><h3>Save up to ' + pct(h) + '% on ' + esc(nameOf(h)) + '</h3><p>' + esc(shopById[h.shop].name) + ' · ' + money(h.price) + '</p><button class="cta" data-deal="' + esc(h.id) + '">See this deal →</button><span class="big">' + look(catOf(h))[0] + '</span></div>' +
    '<div class="dots">' + slides.map(function(x, i){ return '<button class="' + (i === k ? 'on' : '') + '" data-slide="' + i + '" aria-label="Slide ' + (i + 1) + '"></button>'; }).join('') + '</div>' : '';
  var pop = sp.slice(0, 6);
  var want = S.me && S.me.cats && S.me.cats.length ? S.me.cats : null;
  var rec = (want ? sp.filter(function(o){ return want.indexOf(catOf(o)) >= 0; }) : sp.slice(6))[0] || sp[0];
  var main = '<div class="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><input id="hq" type="search" placeholder="Search for deals, shops, products" aria-label="Search"></div>' + catRow + hero +
    '<div class="sec"><h2>Popular deals near you</h2><button data-tab="deals">View all →</button></div>' + (pop.length ? '<div class="grid">' + pop.map(gridCard).join('') + '</div>' : '<div class="empty">No specials in ' + esc(S.town) + ' yet.</div>');
  var side = '<div class="nam"><svg viewBox="0 0 400 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><circle cx="300" cy="40" r="20" fill="#FFE9A8"/><path d="M0 95l60-35 40 22 70-45 80 52 60-30 90 40v51H0z" fill="#B5532A" opacity=".85"/><path d="M0 120c60-30 110-20 170 0s140 25 230-15v45H0z" fill="#C8642F"/><path d="M0 138c80-25 150-10 220 5s120 0 180-12v19H0z" fill="#8F3E1D"/></svg><div><b>Namibia</b>Great deals. All in one place.</div></div>' +
    '<div class="card quick">' + [['shops', '📍', '#DDF3E4', 'Find shops near you', 'See what is on offer nearby'], ['compare', '🏷️', '#DCEBFF', 'Price comparison', 'Get the best value'], ['saved', '♥', '#FFE9D6', 'Saved deals and alerts', 'Your favourite offers'], ['plan', '📝', '#EADCF7', 'Shopping list', 'Plan your next shop']].map(function(q){ return '<button class="qrow" data-tab="' + q[0] + '"><i style="background:' + q[2] + '">' + q[1] + '</i><div><b>' + q[3] + '</b><span class="s">' + q[4] + '</span></div><em>›</em></button>'; }).join('') + '</div>' +
    (rec ? '<div class="recs"><h2>✦ Recommended for you</h2><div class="grid" style="grid-template-columns:1fr">' + gridCard(rec) + '</div></div>' : '') +
    '<div class="own"><h3>Own a shop?</h3><p>Promote your specials and reach more customers.</p><button data-tab="shopreg">Register your shop →</button></div>';
  return demo() + '<div class="home"><div>' + main + '</div><aside>' + side + '</aside></div>';
}
function viewSaved(){
  var offers = S.saved.map(findOffer).filter(Boolean);
  var html = demo() + '<h2>Saved deals</h2><p class="sub">Tap the heart on any deal to keep it here.</p>' + (offers.length ? '<div class="grid">' + offers.map(gridCard).join('') + '</div>' : '<div class="empty">Nothing saved yet. Tap the heart on a deal you like.</div>');
  return html + '<div style="height:14px"></div>' + alertsHtml('<h2>Price alerts</h2><p class="sub">Watch a product and set the price you want. NamPromo tells you when a shop reaches it.</p>');
}
function openDeal(id){
  var o = findOffer(id); if(!o) return; var s = shopById[o.shop], off = pct(o), L = look(catOf(o)), pr = prodById[o.product];
  var ov = document.createElement('div'); ov.className = 'sheet'; ov.id = 'dsheet';
  ov.innerHTML = '<div role="dialog" aria-label="Deal details"><div class="row"><div style="font-size:44px">' + L[0] + '</div><div class="grow"><b style="font-size:18px">' + esc(nameOf(o)) + '</b><div class="muted">' + esc(s.name) + ', ' + esc(s.town) + ' · ' + dist(s).toFixed(1) + ' km away</div></div><button class="x" data-closesheet aria-label="Close">×</button></div>' +
    '<div style="margin:10px 0 4px"><span class="price">' + money(o.price) + '</span>' + (off ? '<span class="was">' + money(o.regular) + '</span> <span class="badge good">SAVE ' + off + '%</span>' : '') + '</div>' +
    '<div class="muted">' + esc([unitText(o), o.ends ? 'Expires ' + dateText(o.ends) : '', o.mine || o.live ? o.source : 'Sample data'].filter(Boolean).join(' · ')) + '</div>' +
    '<p class="muted" style="margin:10px 0">Confirm the price and stock with the shop before you go.</p>' +
    '<div class="row" style="flex-wrap:wrap"><a class="btn small" style="text-decoration:none" target="_blank" rel="noopener" href="' + navUrl(s) + '">Navigate</a>' +
    '<button class="btn small alt" data-heart="' + esc(o.id) + '" data-keep>' + (isSaved(o.id) ? '♥ Saved' : '♡ Save') + '</button>' +
    (pr ? '<button class="btn small alt" data-cmp="' + o.product + '">Compare shops</button><button class="btn small alt" data-addlist="' + o.product + '">Add to list</button><button class="btn small alt" data-watch="' + o.product + '">Watch price</button>' : '') + '</div></div>';
  document.body.appendChild(ov);
}
function closeDeal(){ var d = document.getElementById('dsheet'); if(d) d.remove(); }

var VIEWS = { home:viewHome, saved:viewSaved, deals:viewDeals, shops:viewShops, compare:viewCompare, plan:viewPlan, alerts:viewSaved, add:viewAdd, me:viewMe, shopreg:viewShopReg };
function render(){
  var app = document.getElementById('app'), keep = document.activeElement && document.activeElement.id === 'q';
  app.innerHTML = VIEWS[S.tab]();
  var cur = NAVOF[S.tab] || S.tab;
  document.getElementById('nav').innerHTML = TABS.map(function(t){ return '<button data-tab="' + t[0] + '" class="' + (cur === t[0] ? 'on' : '') + '" aria-label="' + t[1] + '">' + ICON[t[0]] + '<span>' + t[1] + '</span></button>'; }).join('');
  var hits = S.watch.filter(function(w){ return alertStatus(w).hit; }).length, bn = document.getElementById('belln'); bn.hidden = !hits; bn.textContent = hits;
  if(keep){ var q = document.getElementById('q'); if(q){ q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
}
function go(tab){ S.tab = tab; S.dshop = ''; render(); window.scrollTo(0, 0); }
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
  toast('Watching this price. Set your target price under Saved.'); go('saved');
}
document.addEventListener('click', function(e){
  var t = e.target.closest('#mecode,#mecancel,[data-heart],[data-deal],[data-closesheet],[data-cat2],[data-slide],#bell,.sheet,[data-dcat],[data-dshop],[data-icat],#dback,#mesave,#meout,#medigest,#opsave,[data-tab],[data-cat],[data-cmp],[data-addlist],[data-watch],[data-del],[data-wdel],[data-mdel],#pladd,#geo,#notif,#fadd');
  if(!t) return;
  if(t.dataset.heart){
    var hid = t.dataset.heart, hx = S.saved.indexOf(hid); if(hx >= 0) S.saved.splice(hx, 1); else S.saved.push(hid); save();
    if(t.hasAttribute('data-keep')){ t.textContent = isSaved(hid) ? '♥ Saved' : '♡ Save'; return; }
    var sy = window.scrollY; render(); window.scrollTo(0, sy); return;
  }
  if(t.dataset.closesheet !== undefined || (t.classList.contains('sheet') && e.target === t)) return closeDeal();
  if(t.classList.contains('sheet')) return;
  if(t.dataset.deal){ return openDeal(t.dataset.deal); }
  if(t.dataset.cat2){ S.cat = t.dataset.cat2; S.q = ''; return go('deals'); }
  if(t.dataset.slide){ S.slide = +t.dataset.slide; return render(); }
  if(t.id === 'bell') return go('saved');
  if(t.dataset.dcat){ S.dcat = t.dataset.dcat; S.dshop = ''; return render(); }
  if(t.dataset.dshop){ S.dshop = t.dataset.dshop; render(); return window.scrollTo(0, 0); }
  if(t.id === 'dback'){ S.dshop = ''; return render(); }
  if(t.dataset.icat){ var cs = S.me.cats || [], ix = cs.indexOf(t.dataset.icat); if(ix >= 0) cs.splice(ix, 1); else cs.push(t.dataset.icat); S.me.cats = cs; save(); return render(); }
  if(t.id === 'mesave'){
    var g = function(id){ return document.getElementById(id); }, er = g('meerr'), nm = g('mn').value.trim(), em = g('me').value.trim(), ph = cleanPhone(g('mp').value);
    if(nm.length < 2 || nm.indexOf(' ') < 0){ er.textContent = 'Enter your first name and surname.'; return; }
    if(!okEmail(em)){ er.textContent = 'Enter a valid email address.'; return; }
    if(!ph){ er.textContent = 'Enter a Namibian cellphone number, for example 081 123 4567.'; return; }
    if((g('mwa').checked || g('msms').checked || g('mmail').checked) && !g('mok').checked){ er.textContent = 'Tick the box to agree to receive messages, or untick the ways to reach you.'; return; }
    var me = { name:nm, email:em, phone:ph, wa:g('mwa').checked, sms:g('msms').checked, mail:g('mmail').checked, cats:[], at:new Date().toISOString() };
    if(!LIVE){ S.me = me; save(); toast('Welcome to NamPromo'); return render(); }
    t.disabled = true; er.textContent = '';
    api('/functions/v1/np-subscribe', { body:{ fullName:nm, email:em, cellphone:ph, whatsapp:me.wa, sms:me.sms, email_opt_in:me.mail, consent:g('mok').checked, town:S.town, categories:[] } }).then(function(r){
      t.disabled = false;
      if(r.status === 200 && r.body.sent){ S.pending = me; render(); return; }
      if(r.status === 200){ er.textContent = r.body.message || 'This number may already be signed up.'; return; }
      er.textContent = r.status === 429 ? 'Too many codes for this number. Try again in an hour.' : r.body && r.body.fields ? Object.keys(r.body.fields).map(function(k){ return r.body.fields[k]; }).join(' ') : 'We could not sign you up right now. Please try again.';
    }).catch(function(){ t.disabled = false; er.textContent = 'No connection. Please try again.'; });
    return;
  }
  if(t.id === 'mecode'){
    var cd = document.getElementById('mcode').value.trim(), ce = document.getElementById('mcerr'); t.disabled = true;
    api('/functions/v1/np-verify', { body:{ cellphone:S.pending.phone, code:cd } }).then(function(r){
      t.disabled = false;
      if(r.status === 200){ S.me = S.pending; S.pending = null; save(); toast('Your number is confirmed'); render(); return; }
      ce.textContent = r.body.error === 'expired' ? 'That code has expired. Go back and sign up again.' : r.status === 429 ? 'Too many tries. Sign up again to get a new code.' : 'That code is not right.';
    }).catch(function(){ t.disabled = false; ce.textContent = 'No connection. Please try again.'; });
    return;
  }
  if(t.id === 'mecancel'){ S.pending = null; return render(); }
  if(t.id === 'meout'){ if(confirm('Delete your details from this device?')){ S.me = null; S.outbox = []; save(); render(); } return; }
  if(t.id === 'medigest'){
    var want = S.me.cats && S.me.cats.length ? S.me.cats : CATS, top = allOffers().filter(function(o){ return shopById[o.shop].town === S.town && pct(o) > 0 && want.indexOf(catOf(o)) >= 0; }).sort(function(a, b){ return pct(b) - pct(a); }).slice(0, 3);
    if(!top.length) return toast('No specials found for your categories in ' + S.town);
    if(!channels().length) return toast('Turn on WhatsApp, SMS or email first');
    queueMessage('digest|' + Date.now(), 'NamPromo specials in ' + S.town + ': ' + top.map(function(o){ return nameOf(o) + ' ' + money(o.price) + ' at ' + shopById[o.shop].name + ' (' + pct(o) + '% off)'; }).join('; ') + '.'); toast('Preview added'); return render();
  }
  if(t.id === 'opsave'){
    var h = function(id){ return document.getElementById(id).value.trim(); }, oe = document.getElementById('operr'), oph = cleanPhone(h('op'));
    if(h('on').length < 2){ oe.textContent = 'Enter the shop or business name.'; return; }
    if(h('oa').length < 3){ oe.textContent = 'Enter the street address.'; return; }
    if(h('ocn').length < 2){ oe.textContent = 'Enter the contact person.'; return; }
    if(!okEmail(h('oe'))){ oe.textContent = 'Enter a valid email address.'; return; }
    if(!oph){ oe.textContent = 'Enter a Namibian cellphone number, for example 081 123 4567.'; return; }
    var op = { id:'o' + Date.now(), name:h('on'), cat:h('oc'), town:h('ot'), address:h('oa'), contact:h('ocn'), email:h('oe'), phone:oph, reg:h('or'), at:new Date().toISOString() };
    S.ops.push(op); addOperatorShop(op); save(); toast('Shop listed. It shows as not yet checked.'); S.tab = 'add'; return render();
  }
  if(t.dataset.tab){ closeDeal(); return go(t.dataset.tab); }
  if(t.dataset.cat){ S.cat = t.dataset.cat; return render(); }
  if(t.dataset.cmp){ closeDeal(); S.cq = t.dataset.cmp; return go('compare'); }
  if(t.dataset.addlist){ closeDeal(); return addList(t.dataset.addlist); }
  if(t.dataset.watch){ closeDeal(); return watchProduct(t.dataset.watch); }
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
    if(!v('fp') && v('ft').trim().length < 2){ err.textContent = 'Pick a product or type its name.'; return; }
    if(!(regular > 0) || !(price >= 0)){ err.textContent = 'Enter the normal price and the special price.'; return; }
    if(price >= regular){ err.textContent = 'The special price must be lower than the normal price.'; return; }
    if(!v('fe') || v('fe') < today().toISOString().slice(0, 10)){ err.textContent = 'Choose an end date that has not passed.'; return; }
    S.mine.push({ id:'mine' + Date.now(), shopId:v('fs'), product:v('fp'), title:v('fp') ? '' : v('ft').trim(), cat:v('fp') ? '' : v('fc'), price:price, regular:regular, ends:v('fe') }); save(); toast('Special posted. It shows as not checked.'); S.tab = 'deals'; S.cat = 'All'; S.q = ''; render(); window.scrollTo(0, 0);
  }
});
document.addEventListener('keydown', function(e){ if(e.key === 'Enter' && e.target.id === 'hq'){ S.q = e.target.value; S.cat = 'All'; go('deals'); } });
document.addEventListener('input', function(e){
  var t = e.target;
  if(t.id === 'q'){ S.q = t.value; render(); }
  else if(t.id === 'pk'){ S.perKm = Math.max(0, +t.value || 0); save(); }
  else if(t.dataset && t.dataset.wt != null){ S.watch[+t.dataset.wt].target = +t.value || 0; save(); }
});
document.addEventListener('change', function(e){
  var t = e.target;
  if(t.dataset && t.dataset.pref){ S.me[t.dataset.pref] = t.checked; save(); return; }
  if(t.id === 'sort'){ S.sort = t.value; render(); }
  else if(t.id === 'all'){ S.allTowns = t.checked; render(); }
  else if(t.id === 'cq'){ S.cq = t.value; render(); }
  else if(t.dataset && t.dataset.wt != null){ var box = document.querySelector('[data-st="' + t.dataset.wt + '"]'); if(box){ box.innerHTML = alertBody(S.watch[+t.dataset.wt]); box.parentNode.classList.toggle('alert-hit', alertStatus(S.watch[+t.dataset.wt]).hit); } runAlerts(); }
});
var sel = document.getElementById('town');
sel.innerHTML = Object.keys(TOWNS).map(function(t){ return '<option' + (t === S.town ? ' selected' : '') + '>' + t + '</option>'; }).join('');
sel.addEventListener('change', function(){ S.town = sel.value; S.pos = null; save(); render(); runAlerts(); });
window.__nampromo = { go:go, S:S, plan:plan, allOffers:allOffers, alertStatus:alertStatus, SHOPS:SHOPS, PRODUCTS:PRODUCTS, km:km, render:render };
render(); runAlerts(); loadLive();
if('serviceWorker' in navigator && location.protocol.indexOf('http') === 0){ try{ navigator.serviceWorker.register('sw.js'); }catch(e){} }
})();
