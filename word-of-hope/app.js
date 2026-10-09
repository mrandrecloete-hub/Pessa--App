/* Word of Hope: components are small functions that return DOM nodes. Data comes from mockData.js, theme state from ThemeContext (theme.js). */
(function(){
'use strict';
var D = window.MOCK, Theme = window.ThemeContext;
var NAME_KEY = 'woh_name_v1';
var $ = function(s, r){ return (r || document).querySelector(s); };

/* tiny element helper: h('div', {class:'x', onclick:fn}, child, 'text'). Text is always set as text, never as HTML. */
function h(tag, props){
  var el = document.createElement(tag), kids = Array.prototype.slice.call(arguments, 2);
  Object.keys(props || {}).forEach(function(k){
    var v = props[k];
    if(k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
    else if(k === 'class') el.className = v;
    else if(v === true) el.setAttribute(k, '');
    else if(v !== false && v != null) el.setAttribute(k, v);
  });
  (function add(list){ list.forEach(function(c){ if(c == null) return; if(Array.isArray(c)) return add(c); el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }); })(kids);
  return el;
}
function dayOfYear(){ var n = new Date(), s = new Date(n.getFullYear(), 0, 0); return Math.floor((n - s) / 864e5); }
function today(){ return D.daily[dayOfYear() % D.daily.length]; }
function getName(){ try { return localStorage.getItem(NAME_KEY) || ''; } catch(e) { return ''; } }
function greeting(){ var hr = new Date().getHours(); return hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'; }

/* ---------- YouTubePlayer: official IFrame Player API, loaded when the person taps play; falls back to a plain embed if the API cannot load ---------- */
var ytApi;
function loadYT(){
  if(ytApi) return ytApi;
  ytApi = new Promise(function(res, rej){
    if(window.YT && window.YT.Player) return res(window.YT);
    var t = setTimeout(function(){ rej(new Error('timeout')); }, 5000);
    window.onYouTubeIframeAPIReady = function(){ clearTimeout(t); res(window.YT); };
    var s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.onerror = function(){ clearTimeout(t); rej(new Error('blocked')); };
    document.head.appendChild(s);
  });
  return ytApi;
}
function YouTubePlayer(id, title){
  var box = h('div', { class: 'player' });
  var start = h('button', { class: 'play', 'aria-label': 'Play the devotional video: ' + title, onclick: function(){
    var slot = h('div'); box.innerHTML = ''; box.appendChild(slot);
    loadYT().then(function(YT){
      new YT.Player(slot, { host: 'https://www.youtube-nocookie.com', videoId: id, width: '100%', height: '100%', playerVars: { autoplay: 1, rel: 0, playsinline: 1, modestbranding: 1 } });
    }).catch(function(){
      box.innerHTML = ''; box.appendChild(h('iframe', { src: 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0&playsinline=1&enablejsapi=1', title: title, allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowfullscreen: true, loading: 'lazy' }));
    });
  } }, h('span', {}, '▶'));
  box.appendChild(h('img', { src: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg', alt: '', loading: 'lazy', onerror: function(){ this.style.display = 'none'; box.style.background = 'linear-gradient(135deg,var(--accent),#000)'; } }));
  box.appendChild(start); return box;
}

/* ---------- Dashboard pieces ---------- */
function GreetingBanner(){ var n = getName(); return h('section', { class: 'card greet' }, h('h1', {}, greeting() + (n ? ', ' + n : '') + '.'), h('p', {}, 'God is with you today.')); }
function DailyScripture(t){ return h('section', { class: 'card', 'aria-label': 'Daily scripture' }, h('div', { class: 'eyebrow' }, 'Daily Scripture'), h('div', { class: 'verse' }, '“' + t.text + '”'), h('div', { class: 'ref' }, t.ref + ' (KJV)')); }
function DailyDevotion(t){ return h('section', { class: 'card', 'aria-label': 'Daily devotional' }, h('div', { class: 'eyebrow' }, 'Daily Devotional'), h('h2', { style: 'margin:0 0 6px' }, t.title), h('p', { style: 'margin:0 0 4px' }, t.devotion), YouTubePlayer(t.youtubeId, t.title), h('p', { style: 'margin:0;font-style:italic' }, 'Prayer: ' + t.prayer)); }
function Tile(emoji, title, sub, go){ return h('button', { class: 'tile', onclick: function(){ go(); } }, h('span', { class: 'ic', 'aria-hidden': 'true' }, emoji), h('b', {}, title), h('small', {}, sub)); }
function DashboardLayout(nav){
  var t = today();
  return h('div', {}, GreetingBanner(), DailyScripture(t), DailyDevotion(t),
    h('div', { class: 'tiles' }, Tile('🕊️', 'Messages of Hope', 'Short words of promise', function(){ nav('hope'); }), Tile('🤝', 'Counseling Portal', 'Scripture for what you face', function(){ nav('counsel'); })));
}

/* ---------- Messages of Hope: horizontal swipe carousel ---------- */
function MessagesCarousel(){
  var track = h('div', { class: 'carousel', role: 'region', 'aria-label': 'Messages of hope, swipe sideways', tabindex: '0' });
  D.hope.forEach(function(m, i){ track.appendChild(h('article', { class: 'hope' }, h('div', {}, m), h('small', {}, (i + 1) + ' OF ' + D.hope.length))); });
  var dots = h('div', { class: 'dots', 'aria-hidden': 'true' }); D.hope.forEach(function(_, i){ dots.appendChild(h('i', { class: i === 0 ? 'on' : '' })); });
  function step(d){ var w = track.firstChild.getBoundingClientRect().width + 14; track.scrollBy({ left: d * w, behavior: 'smooth' }); }
  var tick;
  track.addEventListener('scroll', function(){ clearTimeout(tick); tick = setTimeout(function(){
    var w = track.firstChild.getBoundingClientRect().width + 14, i = Math.min(D.hope.length - 1, Math.round(track.scrollLeft / w));
    Array.prototype.forEach.call(dots.children, function(d, k){ d.className = k === i ? 'on' : ''; });
  }, 60); });
  return h('div', {}, h('h2', {}, 'Messages of Hope'), track, dots, h('div', { class: 'nav2' }, h('button', { class: 'btn ghost', 'aria-label': 'Previous message', onclick: function(){ step(-1); } }, '←  Previous'), h('button', { class: 'btn', 'aria-label': 'Next message', onclick: function(){ step(1); } }, 'Next  →')));
}

/* ---------- Biblical Counseling Portal ---------- */
function CounselingCard(c, open){ return h('button', { class: 'tile', onclick: function(){ open(c); } }, h('span', { class: 'ic', 'aria-hidden': 'true' }, c.icon), h('b', {}, c.title)); }
function showCounseling(c){
  var m = $('#modal');
  m.innerHTML = '';
  m.appendChild(h('div', { class: 'mbody' },
    h('div', { class: 'row' }, h('h2', { id: 'modalTitle', style: 'margin:0' }, c.icon + '  ' + c.title), h('button', { class: 'btn ghost', 'aria-label': 'Close', onclick: function(){ m.close(); } }, '✕')),
    h('div', { class: 'sec' }, h('h3', {}, '1. You are not alone'), h('p', { style: 'margin:0' }, c.validation)),
    h('div', { class: 'sec' }, h('h3', {}, '2. Scripture anchors'), h('ul', { class: 'anchors' }, c.anchors.map(function(a){ return h('li', {}, h('b', {}, a.ref + ' (KJV)'), h('div', { style: 'font-style:italic' }, '“' + a.text + '”')); }))),
    h('div', { class: 'sec' }, h('h3', {}, '3. Action plan'), h('p', { style: 'margin:0' }, c.action)),
    h('p', { class: 'note' }, 'This is spiritual encouragement, not professional medical or mental health care. If you are in danger or thinking of harming yourself, contact your local emergency services or a trusted person right now.')));
  if(!m.open) m.showModal();
}
function CounselingPortal(){ return h('div', {}, h('h2', {}, 'Biblical Counseling'), h('p', { style: 'margin:0 0 14px;color:var(--muted)' }, 'Choose what you are facing. You will find comfort, scripture and one simple step.'), h('div', { class: 'grid' }, D.counseling.map(function(c){ return CounselingCard(c, showCounseling); }))); }

/* ---------- Settings: theme, accent colour, name, and the founder ---------- */
function SettingsPanel(rerender){
  var cur = Theme.get();
  var sw = h('button', { class: 'switch', role: 'switch', 'aria-checked': String(cur.themeMode === 'dark'), 'aria-label': 'Dark mode', id: 'darkSwitch', onclick: function(){ var d = Theme.get().themeMode === 'dark' ? 'light' : 'dark'; Theme.set({ themeMode: d }); this.setAttribute('aria-checked', String(d === 'dark')); } });
  var swatches = h('div', { class: 'swatches', role: 'group', 'aria-label': 'Accent colour' });
  D.accents.forEach(function(a){
    swatches.appendChild(h('button', { class: 'swatch', style: 'background:' + a.value, title: a.name, 'aria-label': a.name, 'aria-pressed': String(a.value.toLowerCase() === cur.accentColor.toLowerCase()), 'data-color': a.value, onclick: function(){
      Theme.set({ accentColor: a.value }); Array.prototype.forEach.call(swatches.children, function(b){ b.setAttribute('aria-pressed', String(b === this)); }, this);
    } }));
  });
  var name = h('input', { type: 'text', id: 'nameIn', value: getName(), placeholder: 'Your name', maxlength: '40', autocomplete: 'given-name', 'aria-label': 'Your name' });
  name.addEventListener('input', function(){ try { localStorage.setItem(NAME_KEY, name.value.trim()); } catch(e) {} });
  return h('div', {}, h('h2', {}, 'Settings'),
    h('section', { class: 'card' }, h('div', { class: 'row' }, h('label', { for: 'darkSwitch' }, h('b', {}, 'Dark mode')), sw), h('div', { class: 'eyebrow', style: 'margin-top:16px' }, 'Accent colour'), swatches),
    h('section', { class: 'card' }, h('label', { for: 'nameIn' }, h('b', {}, 'Your name')), name, h('p', { class: 'note' }, 'Used for your greeting. It stays on this phone.')),
    h('section', { class: 'card founder', 'aria-label': 'About the founder' }, h('div', { class: 'seal', 'aria-hidden': 'true' }, '✝'), h('div', { class: 'eyebrow' }, 'About the Founder'), h('h3', {}, 'Loren Ashyn Van Rensburg'), h('p', {}, 'Founded & Developed by Loren Ashyn Van Rensburg. Dedicated to making the Word available to everyone, everywhere, entirely for free.')),
    h('p', { class: 'note', style: 'text-align:center' }, 'Word of Hope is 100% free. Scripture: King James Version (public domain).'));
}

/* ---------- App shell: tab navigation ---------- */
var TABS = [['home', '🏠', 'Home'], ['hope', '🕊️', 'Hope'], ['counsel', '🤝', 'Counsel'], ['settings', '⚙️', 'Settings']];
var current = 'home';
function nav(id){
  current = id; var view = $('#view'); view.innerHTML = '';
  view.appendChild(id === 'home' ? DashboardLayout(nav) : id === 'hope' ? MessagesCarousel() : id === 'counsel' ? CounselingPortal() : SettingsPanel());
  var tabs = $('#tabs'); tabs.innerHTML = '';
  TABS.forEach(function(t){ tabs.appendChild(h('button', { 'aria-current': t[0] === id ? 'page' : false, 'data-tab': t[0], onclick: function(){ nav(t[0]); window.scrollTo(0, 0); } }, h('span', { class: 'e', 'aria-hidden': 'true' }, t[1]), t[2])); });
  try { history.replaceState(null, '', '#' + id); } catch(e) {}
}
$('#modal').addEventListener('click', function(e){ if(e.target === this) this.close(); });
var start = (location.hash || '').slice(1);
nav(TABS.some(function(t){ return t[0] === start; }) ? start : 'home');
if('serviceWorker' in navigator && location.protocol.indexOf('http') === 0){ try { navigator.serviceWorker.register('sw.js'); } catch(e) {} }
})();
