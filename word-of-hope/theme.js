/* ThemeContext: one global store for themeMode ('light' | 'dark') and accentColor. Components subscribe; changes are saved on the device. */
(function(){
  var KEY = 'woh_theme_v1';
  var state = { themeMode: 'light', accentColor: '#1B6EF3', fontSize: 'medium' }, listeners = [];
  try { var s = JSON.parse(localStorage.getItem(KEY) || 'null'); if(s){ if(s.themeMode === 'dark' || s.themeMode === 'light') state.themeMode = s.themeMode; if(/^#[0-9a-f]{6}$/i.test(s.accentColor || '')) state.accentColor = s.accentColor; if(['small','medium','large'].indexOf(s.fontSize) > -1) state.fontSize = s.fontSize; } } catch(e) {}
  /* follow the phone's dark setting on first use */
  try { if(!localStorage.getItem(KEY) && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) state.themeMode = 'dark'; } catch(e) {}
  /* readable text colour on top of the accent (dark text on light accents such as pastel pink) */
  function onAccent(hex){
    var n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(function(v){ v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); });
    var L = .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
    /* pick whichever of white or near-black text has the higher contrast ratio on this accent */
    var vsWhite = 1.05 / (L + .05), vsDark = (L + .05) / .0697;   /* near-black #2a1a20 has luminance about 0.0197 */
    return vsWhite >= vsDark ? '#ffffff' : '#2a1a20';
  }
  function apply(){
    var r = document.documentElement;
    r.setAttribute('data-theme', state.themeMode); r.setAttribute('data-font', state.fontSize);
    r.style.setProperty('--accent', state.accentColor);
    r.style.setProperty('--on-accent', onAccent(state.accentColor));
    var m = document.querySelector('meta[name=theme-color]'); if(m) m.setAttribute('content', state.themeMode === 'dark' ? '#0a1228' : '#eef3fc');
  }
  window.ThemeContext = {
    get: function(){ return { themeMode: state.themeMode, accentColor: state.accentColor, fontSize: state.fontSize }; },
    set: function(patch){ Object.assign(state, patch); apply(); try { localStorage.setItem(KEY, JSON.stringify(state)); } catch(e) {} listeners.forEach(function(f){ f(window.ThemeContext.get()); }); },
    subscribe: function(f){ listeners.push(f); return function(){ listeners = listeners.filter(function(x){ return x !== f; }); }; }
  };
  apply();
})();
