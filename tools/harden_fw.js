/* PESA APP FIREWALL (HARDEN5). Runs first, before the rest of the app. Plain old JavaScript on purpose.
   It sits inside the app and checks where the app is allowed to talk and what can be added to the page:
   1) Outgoing connections (fetch, XMLHttpRequest, WebSocket, sendBeacon): plain http to another site, raw IP addresses and
      script or data addresses are always refused. In Strict mode every site that is not on the allowed list is refused too.
   2) The page: frames, plugins, base tags, forms that post to another site and links using javascript: are removed or refused.
   3) Every refusal is written to a short log on this device (no personal data, only the kind and the host name).
   This is one layer, not a promise that the app cannot be attacked. A real server firewall needs a service such as Cloudflare in front of the website. */
(function(){ try{
  var w = window, d = document, LOG = 'pesa_fw_log', MODE = 'pesa_fw_mode', loc = w.location;
  var BUILT = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com', 'api.emailjs.com'];
  var BUILT_SUFFIX = ['.supabase.co', '.supabase.in'];
  var seen = {}, extra = null, extraAt = 0;
  function ls(k, v){ try{ if(v === undefined) return w.localStorage.getItem(k); w.localStorage.setItem(k, v); }catch(e){} return null; }
  function mode(){ return ls(MODE) === 'strict' ? 'strict' : 'standard'; }
  function readLog(){ try{ var a = JSON.parse(ls(LOG) || '[]'); return Array.isArray(a) ? a : []; }catch(e){ return []; } }
  function record(kind, host){
    var a = readLog(); a.push({ t: Date.now(), k: kind, h: String(host || '').slice(0, 80) });
    if(a.length > 100) a = a.slice(a.length - 100);
    ls(LOG, JSON.stringify(a));
  }
  function localHost(h){ return h === 'localhost' || h === '127.0.0.1' || h === '[::1]'; }
  function isIp(h){ return /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.indexOf('[') === 0; }
  // sites the owner has set up inside Pesa (cloud project, tax device, e-mail) are read from the saved settings
  function userHosts(){
    var now = Date.now(); if(extra && now - extraAt < 30000) return extra;
    var out = {};
    try{
      for(var i = 0; i < w.localStorage.length; i++){
        var k = w.localStorage.key(i); if(!k || k.indexOf('pesa') !== 0 || k === LOG) continue;
        var v = w.localStorage.getItem(k) || ''; if(v.length > 20000) continue;
        var m = v.match(/https:\/\/[a-z0-9.\-]+/ig) || [];
        for(var j = 0; j < m.length; j++) out[m[j].slice(8).toLowerCase()] = 1;
      }
    }catch(e){}
    extra = out; extraAt = now; return out;
  }
  function allowedHost(h){
    if(h === loc.hostname || localHost(h)) return true;
    if(BUILT.indexOf(h) > -1) return true;
    for(var i = 0; i < BUILT_SUFFIX.length; i++){ var s = BUILT_SUFFIX[i]; if(h.length > s.length && h.slice(-s.length) === s) return true; }
    return false;
  }
  /** Returns '' when the address may be used, otherwise the reason it is refused. */
  function judge(raw){
    var u; try{ u = new URL(String(raw), loc.href); }catch(e){ return ''; }
    var p = u.protocol, h = u.hostname.toLowerCase();
    if(p === 'blob:' || p === 'data:' || p === 'about:') return '';
    if(p === 'javascript:' || p === 'vbscript:' || p === 'file:') return 'script address';
    if(p === 'ws:' && !localHost(h)) return 'plain websocket';
    if(p !== 'http:' && p !== 'https:' && p !== 'ws:' && p !== 'wss:') return 'odd address type';
    if(h === loc.hostname) return '';
    if(p === 'http:' && !localHost(h)) return 'plain http';
    if(isIp(h) && !localHost(h)) return 'raw ip address';
    if(allowedHost(h)) return '';
    if(mode() === 'strict' && !userHosts()[h]) return 'site not on the allowed list';
    if(!seen[h]){ seen[h] = 1; record('unknown site allowed', h); }
    return '';
  }
  function refuse(kind, raw){
    var h = ''; try{ h = new URL(String(raw), loc.href).hostname; }catch(e){}
    record(kind, h);
  }
  var FW = {
    mode: mode, log: readLog, judge: judge,
    setMode: function(m){ ls(MODE, m === 'strict' ? 'strict' : 'standard'); extra = null; },
    clear: function(){ ls(LOG, '[]'); },
    stats: function(){ var a = readLog(), n = 0, o = 0; for(var i = 0; i < a.length; i++){ if(/allowed$/.test(a[i].k)) o++; else n++; } return { refused: n, noted: o }; }
  };
  w.PesaFirewall = FW;

  // 1) outgoing connections
  if(w.fetch){ var of = w.fetch; w.fetch = function(input, init){
    var u = (input && input.url) || input, why = judge(u);
    if(why){ refuse('refused: ' + why, u); return Promise.reject(new TypeError('abort: refused by the Pesa firewall')); }
    return of.apply(this, arguments);
  }; }
  if(w.XMLHttpRequest){ var oo = w.XMLHttpRequest.prototype.open; w.XMLHttpRequest.prototype.open = function(method, url){
    var why = judge(url); if(why){ refuse('refused: ' + why, url); throw new Error('abort: refused by the Pesa firewall'); }
    return oo.apply(this, arguments);
  }; }
  if(w.navigator && w.navigator.sendBeacon){ var ob = w.navigator.sendBeacon; w.navigator.sendBeacon = function(url){
    var why = judge(url); if(why){ refuse('refused: ' + why, url); return false; }
    return ob.apply(w.navigator, arguments);
  }; }
  if(w.WebSocket && w.Proxy){ w.WebSocket = new Proxy(w.WebSocket, { construct: function(T, args){
    var why = judge(args[0]); if(why){ refuse('refused: ' + why, args[0]); throw new Error('abort: refused by the Pesa firewall'); }
    return new T(args[0], args[1]);
  } }); }

  // 2) the page itself
  function foreign(u){ try{ var x = new URL(String(u), loc.href); return /^https?:$/.test(x.protocol) && x.hostname !== loc.hostname; }catch(e){ return false; } }
  function inspect(el){
    if(!el || el.nodeType !== 1) return;
    try{ inspect1(el); }catch(e){}
  }
  function inspect1(el){
    var t = el.tagName;
    if(t === 'IFRAME' || t === 'FRAME'){ var s = el.getAttribute('src') || ''; if(foreign(s)){ refuse('removed frame', s); el.parentNode && el.parentNode.removeChild(el); } }
    else if(t === 'OBJECT' || t === 'EMBED' || t === 'APPLET'){ refuse('removed plugin', ''); el.parentNode && el.parentNode.removeChild(el); }
    else if(t === 'BASE'){ refuse('removed base tag', el.getAttribute('href')); el.parentNode && el.parentNode.removeChild(el); }
    else if(t === 'META' && /refresh/i.test(el.getAttribute('http-equiv') || '')){ refuse('removed redirect', ''); el.parentNode && el.parentNode.removeChild(el); }
    else if(t === 'FORM'){ var a = el.getAttribute('action'); if(a && (judge(a) || foreign(a))){ refuse('blocked form post', a); el.setAttribute('action', 'about:blank'); } }
    else if(t === 'SCRIPT'){ var ss = el.getAttribute('src'); if(ss && judge(ss)){ refuse('removed script', ss); el.parentNode && el.parentNode.removeChild(el); } }
    else if(t === 'A'){ var hr = el.getAttribute('href') || ''; if(/^\s*(javascript|vbscript):/i.test(hr)){ refuse('blocked script link', ''); el.removeAttribute('href'); } if(el.getAttribute('target') === '_blank' && !el.getAttribute('rel')) el.setAttribute('rel', 'noopener noreferrer'); }
  }
  function scan(root){
    if(!root || root.nodeType !== 1) return; inspect(root);
    if(root.querySelectorAll){ var n = root.querySelectorAll('iframe,frame,object,embed,applet,base,form,script[src],a[href^="javascript" i],a[target="_blank"]'); for(var i = 0; i < n.length; i++) inspect(n[i]); }
  }
  function startPage(){
    try{
      scan(d.documentElement);
      new MutationObserver(function(muts){ for(var i = 0; i < muts.length; i++){ var a = muts[i].addedNodes; for(var j = 0; a && j < a.length; j++) scan(a[j]); } }).observe(d.documentElement, { childList: true, subtree: true });
    }catch(e){}
  }
  if(d.readyState === 'loading') d.addEventListener('DOMContentLoaded', startPage); else startPage();
  d.addEventListener('click', function(e){
    var el = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if(el && /^\s*(javascript|vbscript|data):/i.test(el.getAttribute('href') || '')){ e.preventDefault(); e.stopPropagation(); refuse('blocked script link', ''); }
  }, true);
}catch(e){} })();
