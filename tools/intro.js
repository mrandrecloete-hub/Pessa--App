/* ============================== OPENING ANIMATION ==============================
   Plays once each time Pesa starts: the Pesa logo drops in and bounces four times on the water (with its reflection and
   ripples), settles, and the welcome page appears. No spinning and no flying away. Pure CSS keyframes, no files, no libraries.
   When the device can play it, the real water video (media/pesa-intro.webm or .mp4) plays instead; the CSS animation
   below is the fallback (video cannot play, slow connection, low power or reduced motion setting).
   Tap or press any key to skip.
   Test hooks: ?intro=force plays even in automated browsers; ?intro=force&introT=2.5 shows one still frame at 2.5 s. */
var PesaIntro = (function(){
  'use strict';
  var DUR = 3.6;                                   // seconds the CSS animation runs
  var VID = { webm:'media/pesa-intro.webm', mp4:'media/pesa-intro.mp4', dur:8.3 };   // the realistic water video
  var mode = 'css';
  var VEIL = null, done = false, timer = 0, ready = false;

  function firstScreenReady(){
    try{
      var app = document.getElementById('app'), au = document.getElementById('authScreen');
      if(app && getComputedStyle(app).display !== 'none') return true;
      if(au && getComputedStyle(au).display !== 'none' && au.textContent.indexOf('Loading') < 0 && au.children.length) return true;
    }catch(e){}
    return false;
  }
  // [percent, lift in px (negative is up), width scale, height scale, spin in degrees, opacity, ease towards the next step]
  var FALL = 'cubic-bezier(.55,0,.9,.5)', RISE = 'cubic-bezier(.1,.55,.4,1)', LIN = 'cubic-bezier(.4,0,.6,1)';
  var STEPS = [
    [0,  -330, 1,    1,    0,    0, FALL],
    [3,  -300, 1,    1,    0,    1, FALL],
    [12, 0,    1.1,  .86,  0,    1, RISE],     // first landing
    [21, -125, .97,  1.04, 0,    1, FALL],
    [31, 0,    1.1,  .86,  0,    1, RISE],     // second landing
    [38, -70,  .98,  1.03, 0,    1, FALL],
    [46, 0,    1.08, .88,  0,    1, RISE],     // third landing
    [52, -35,  .99,  1.02, 0,    1, FALL],
    [58, 0,    1.06, .9,   0,    1, RISE],     // fourth landing
    [66, 0,    1,    1,    0,    1, LIN],      // settles on the water and stays
    [100,0,    1,    1,    0,    1, LIN]
  ];

  function kf(name, refl){
    var out = '@keyframes ' + name + '{';
    STEPS.forEach(function(s){
      var y = refl ? -s[1] * .55 : s[1], op = refl ? s[5] * .5 : s[5];
      var tf = refl ? 'perspective(700px) translateY(' + y + 'px) scale(' + s[2] + ',' + (-s[3]) + ') rotateY(' + s[4] + 'deg)'
                    : 'perspective(700px) translateY(' + y + 'px) scale(' + s[2] + ',' + s[3] + ') rotateY(' + s[4] + 'deg)';
      out += s[0] + '%{transform:' + tf + ';opacity:' + op + ';animation-timing-function:' + s[6] + ';}';
    });
    return out + '}';
  }
  function css(){
    var A = 'animation-duration:' + DUR + 's;animation-fill-mode:both;animation-iteration-count:1;animation-delay:var(--pi-d,0s);animation-play-state:var(--pi-s,running);';
    return kf('piLogo', false) + kf('piRefl', true) +
      '@keyframes piRing{0%,10%{transform:scale(.15);opacity:0}12%{transform:scale(.2);opacity:.9}19%{transform:scale(1.5);opacity:0}29%{transform:scale(.15);opacity:0}31%{transform:scale(.2);opacity:.9}38%{transform:scale(1.4);opacity:0}44%{transform:scale(.15);opacity:0}46%{transform:scale(.2);opacity:.9}53%{transform:scale(1.5);opacity:0}56%{transform:scale(.15);opacity:0}58%{transform:scale(.2);opacity:.9}68%{transform:scale(1.5);opacity:0}100%{transform:scale(1.5);opacity:0}}' +
      '@keyframes piShadow{0%,3%{transform:scale(.2);opacity:0}12%{transform:scale(1.1);opacity:.85}21%{transform:scale(.75);opacity:.5}31%{transform:scale(1.1);opacity:.85}38%{transform:scale(.85);opacity:.6}46%{transform:scale(1.05);opacity:.85}52%{transform:scale(.92);opacity:.7}58%{transform:scale(1.05);opacity:.85}66%,100%{transform:scale(1);opacity:.8}}' +
      '@keyframes piGlow{0%,8%{opacity:0;transform:scale(.7)}58%{opacity:.7;transform:scale(1)}100%{opacity:.85;transform:scale(1.15)}}' +
      '@keyframes piTag{0%,60%{opacity:0;transform:translateY(10px)}72%,100%{opacity:1;transform:none}}' +
      '@keyframes piShim{from{background-position:0 0}to{background-position:0 44px}}' +
      '#introVeil{display:flex;align-items:center;justify-content:center;overflow:hidden;background:radial-gradient(90% 55% at 50% 22%,rgba(255,214,102,.30) 0%,rgba(255,214,102,0) 60%),radial-gradient(120% 80% at 50% 0%,#14A37A 0%,#0B7A5C 38%,#043d2f 100%)!important;font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
      '#introVeil .pi-water{position:absolute;left:0;right:0;bottom:0;height:42%;background:linear-gradient(180deg,rgba(120,255,214,.20) 0%,rgba(43,212,160,.10) 30%,rgba(2,40,30,.55) 100%)}' +
      '#introVeil .pi-water::before{content:"";position:absolute;left:0;right:0;top:0;height:2px;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,236,170,.9),rgba(255,255,255,0));box-shadow:0 0 18px 2px rgba(255,214,102,.5)}' +
      '#introVeil .pi-water::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(180deg,rgba(255,255,255,.07) 0 1px,rgba(255,255,255,0) 1px 11px);animation:piShim 5s linear infinite;opacity:.6;-webkit-mask-image:linear-gradient(180deg,#000,transparent 85%);mask-image:linear-gradient(180deg,#000,transparent 85%)}' +
      '#introVeil .pi-stage{position:absolute;left:50%;top:58%;width:0;height:0}' +
      '#introVeil .pi-logo,#introVeil .pi-refl{position:absolute;left:calc(var(--pi-s2) / -2);width:var(--pi-s2);height:var(--pi-s2);background:var(--pi-img) center/contain no-repeat;will-change:transform,opacity}' +
      '#introVeil .pi-logo{bottom:0;transform-origin:50% 100%;filter:drop-shadow(0 14px 18px rgba(0,30,20,.55)) drop-shadow(0 0 22px rgba(255,214,102,.55));animation-name:piLogo;' + A + '}' +
      '#introVeil .pi-refl{top:0;transform-origin:50% 0;-webkit-mask-image:linear-gradient(to bottom,rgba(0,0,0,.7),rgba(0,0,0,0) 80%);mask-image:linear-gradient(to bottom,rgba(0,0,0,.7),rgba(0,0,0,0) 80%);animation-name:piRefl;' + A + '}' +
      '#introVeil .pi-glow{position:absolute;left:-150px;top:-260px;width:300px;height:300px;border-radius:50%;background:radial-gradient(circle,rgba(255,214,102,.6),rgba(255,214,102,0) 68%);filter:blur(8px);animation-name:piGlow;' + A + '}' +
      '#introVeil .pi-shadow{position:absolute;left:-80px;top:-10px;width:160px;height:22px;border-radius:50%;background:radial-gradient(ellipse,rgba(0,20,12,.55),rgba(0,20,12,0) 70%);animation-name:piShadow;' + A + '}' +
      '#introVeil .pi-ring{position:absolute;left:-120px;top:-12px;width:240px;height:46px;border-radius:50%;border:2px solid rgba(255,244,200,.85);box-shadow:0 0 14px rgba(255,214,102,.6),inset 0 0 12px rgba(255,255,255,.25);opacity:0;animation-name:piRing;' + A + '}' +
      '#introVeil .pi-tag{position:absolute;left:0;right:0;top:calc(58% + 70px);text-align:center;font:italic 600 18px/1.2 Georgia,"Times New Roman",serif;letter-spacing:.05em;color:rgba(255,238,190,.95);text-shadow:0 2px 12px rgba(0,40,28,.6);animation-name:piTag;' + A + '}' +
      '#introVeil .pi-hint{position:absolute;left:0;right:0;bottom:calc(20px + env(safe-area-inset-bottom,0px));text-align:center;font:600 11px/1 Inter,system-ui,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.5)}' +
      'html.lite #introVeil .pi-logo,html.lite #introVeil .pi-refl,html.lite #introVeil .pi-glow,html.lite #introVeil .pi-shadow,html.lite #introVeil .pi-ring,html.lite #introVeil .pi-tag{animation-duration:' + DUR + 's!important;animation-iteration-count:1!important;animation-delay:var(--pi-d,0s)!important}' +
      'html.lite #introVeil .pi-glow{filter:none}' +
      'html.lite #introVeil .pi-water::after{animation-duration:5s!important;animation-iteration-count:infinite!important}' +
      '@media (prefers-reduced-motion:reduce){#introVeil .pi-logo,#introVeil .pi-refl,#introVeil .pi-glow,#introVeil .pi-shadow,#introVeil .pi-ring{animation:none!important}#introVeil .pi-logo{opacity:1;transform:none}#introVeil .pi-refl{opacity:.35;transform:scaleY(-1)}}';
  }
  function videoCss(){
    var m = 'linear-gradient(to bottom,transparent 0,#000 11%,#000 89%,transparent 100%),linear-gradient(to right,transparent 0,#000 7%,#000 93%,transparent 100%)';
    return '#introVeil.pi-video{background:linear-gradient(180deg,#000c0f 0%,#0b2a26 45%,#10372f 100%)!important;display:flex;align-items:center;justify-content:center}' +
      '#introVeil .pi-vid{position:absolute;left:50%;top:50%;width:min(138vw,100vh);height:min(138vw,100vh);transform:translate(-50%,-50%);object-fit:cover;-webkit-mask-image:' + m + ';mask-image:' + m + ';-webkit-mask-composite:source-in;mask-composite:intersect;pointer-events:none}' +
      '@keyframes piTagV{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}' +
      '#introVeil.pi-video .pi-tag{position:absolute;left:0;right:0;text-align:center;font:italic 600 18px/1.2 Georgia,"Times New Roman",serif;letter-spacing:.05em;color:rgba(255,238,190,.95);text-shadow:0 2px 12px rgba(0,40,28,.8);top:auto;bottom:calc(14% + env(safe-area-inset-bottom,0px));animation:piTagV .9s ease-out ' + (VID.dur - 3.2) + 's both}' +
      '#introVeil .pi-hint{position:absolute;left:0;right:0;bottom:calc(20px + env(safe-area-inset-bottom,0px));text-align:center;font:600 11px/1 Inter,system-ui,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.5)}';
  }
  function canVideo(){
    try{
      if(/[?&]introT=/.test(location.search) && !/[?&]introV=1/.test(location.search)) return false;
      if(/[?&]introV=0/.test(location.search)) return false;
      if(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
      if(document.documentElement.classList.contains('lite')) return false;
      if(navigator.connection && navigator.connection.saveData) return false;
      var v = document.createElement('video');
      return !!(v.canPlayType && (v.canPlayType('video/webm; codecs="vp9"') || v.canPlayType('video/mp4; codecs="avc1.42E01E"')));
    }catch(e){ return false; }
  }
  function buildVideo(){
    var st = document.createElement('style'); st.id = 'introCss'; st.textContent = videoCss(); document.head.appendChild(st);
    VEIL.classList.add('pi-video');
    VEIL.innerHTML = '<video class="pi-vid" muted playsinline webkit-playsinline preload="auto" disablepictureinpicture tabindex="-1" aria-hidden="true">' +
      '<source src="' + VID.webm + '" type="video/webm; codecs=vp9"><source src="' + VID.mp4 + '" type="video/mp4"></video>' +
      '<div class="pi-tag">Your Mula, Your Pride</div><div class="pi-hint">' + ((typeof tr === 'function') ? tr('Tap to skip') : 'Tap to skip') + '</div>';
    return VEIL.querySelector('video');
  }
  function startVideo(){
    var v = buildVideo(), playing = false, fell = false;
    mode = 'video';
    v.muted = true; v.defaultMuted = true;
    function fallback(){
      if(fell || done || playing) return; fell = true; mode = 'css'; clearTimeout(timer);
      try{ v.pause(); }catch(e){}
      try{ var c = document.getElementById('introCss'); if(c) c.parentNode.removeChild(c); }catch(e){}
      VEIL.classList.remove('pi-video'); VEIL.innerHTML = '';
      startCss(true);
    }
    v.addEventListener('playing', function(){ playing = true; clearTimeout(timer); timer = setTimeout(waitReady, (VID.dur + .3) * 1000); window.__introVideo = true; });
    v.addEventListener('ended', function(){ clearTimeout(timer); waitReady(); });
    v.addEventListener('error', fallback, true);
    var p; try{ p = v.play(); }catch(e){}
    if(p && p.catch) p.catch(fallback);
    timer = setTimeout(fallback, 3500);      // not playing after 3.5 s (slow network or blocked): use the CSS version
  }
  function build(logo){
    var st = document.createElement('style'); st.id = 'introCss'; st.textContent = css(); document.head.appendChild(st);
    var size = Math.round(Math.min(window.innerWidth * .44, 170));
    VEIL.style.setProperty('--pi-s2', size + 'px'); VEIL.style.setProperty('--pi-img', 'url("' + logo + '")');
    VEIL.innerHTML = '<div class="pi-water"></div><div class="pi-stage"><div class="pi-glow"></div><div class="pi-shadow"></div><div class="pi-ring"></div><div class="pi-refl"></div><div class="pi-logo"></div></div>' +
      '<div class="pi-tag">Your Mula, Your Pride</div><div class="pi-hint">' + ((typeof tr === 'function') ? tr('Tap to skip') : 'Tap to skip') + '</div>';
  }
  function finish(fast){
    if(done) return; done = true; clearTimeout(timer);
    window.removeEventListener('pointerdown', onSkip, true); window.removeEventListener('keydown', onSkip, true);
    try{ sessionStorage.setItem('pesa_intro_seen', '1'); }catch(e){}
    VEIL.style.pointerEvents = 'none'; VEIL.style.transition = 'opacity ' + (fast ? .35 : .4) + 's ease'; VEIL.style.opacity = '0';
    setTimeout(function(){ try{ VEIL.parentNode.removeChild(VEIL); }catch(e){} try{ var c = document.getElementById('introCss'); if(c) c.parentNode.removeChild(c); }catch(e){} document.documentElement.classList.remove('intro-on'); try{ window.dispatchEvent(new Event('pesa:intro-done')); }catch(e){} }, fast ? 380 : 440);
  }
  function onSkip(e){ if(e && e.type === 'keydown' && ['Shift', 'Control', 'Alt', 'Meta', 'Tab'].indexOf(e.key) > -1) return; finish(true); }
  function seek(t){ if(!VEIL) return; VEIL.style.setProperty('--pi-s', 'paused'); VEIL.style.setProperty('--pi-d', (-t) + 's'); }
  function waitReady(){
    if(done) return;
    if(firstScreenReady() || performance.now() > 9000){ finish(false); return; }
    timer = setTimeout(waitReady, 150);
  }
  function startCss(afterVideo, o){
    build((o && o.logo) || PESA_LOGO_DATA_URL);
    var q = /[?&]introT=([\d.]+)/.exec(location.search);
    if(q){ seek(parseFloat(q[1])); window.__introReady = true; return; }
    timer = setTimeout(waitReady, DUR * 1000 + 100);
  }
  function start(o){
    o = o || {}; VEIL = document.getElementById('introVeil'); if(!VEIL) return; window.__introStarted = true; try{ sessionStorage.setItem('pesa_intro_seen', '1'); }catch(e){}
    try{
      window.addEventListener('pointerdown', onSkip, true); window.addEventListener('keydown', onSkip, true);
      setTimeout(function(){ finish(true); }, 30000);                      // never trap the app behind the animation
      if(canVideo()) startVideo(); else startCss(false, o);
    }catch(e){ try{ console.error('intro failed', e && e.stack || e); }catch(x){} finish(true); }
  }
  return { start:start, seek:seek, finish:finish, DUR:DUR };
})();
