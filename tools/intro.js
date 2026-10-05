/* ============================== OPENING ANIMATION ==============================
   Plays once each time Pesa starts: the Pesa logo drops in, bounces three times over water (with its reflection and
   ripples), spins fast, shrinks away, and the welcome page appears. Pure CSS keyframes, no files, no libraries.
   Tap or press any key to skip.
   Test hooks: ?intro=force plays even in automated browsers; ?intro=force&introT=2.5 shows one still frame at 2.5 s. */
var PesaIntro = (function(){
  'use strict';
  var DUR = 3.8;                                   // seconds the animation runs
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
    [11, 0,    1.1,  .86,  0,    1, RISE],     // first landing
    [19, -125, .97,  1.04, 0,    1, FALL],
    [27, 0,    1.1,  .86,  0,    1, RISE],     // second landing
    [33, -70,  .98,  1.03, 0,    1, FALL],
    [39, 0,    1.08, .88,  0,    1, RISE],     // third landing
    [48, -150, 1.12, 1.12, 900,  1, LIN],      // up and spinning
    [66, -175, 1.25, 1.25, 2700, 1, LIN],
    [84, -150, .5,   .5,   4300, .9, LIN],
    [92, -120, 0,    0,    5200, 0, LIN],      // gone
    [100,-120, 0,    0,    5200, 0, LIN]
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
      '@keyframes piRing{0%,9%{transform:scale(.15);opacity:0}11%{transform:scale(.2);opacity:.9}18%{transform:scale(1.5);opacity:0}25%{transform:scale(.15);opacity:0}27%{transform:scale(.2);opacity:.9}34%{transform:scale(1.4);opacity:0}37%{transform:scale(.15);opacity:0}39%{transform:scale(.2);opacity:.9}47%{transform:scale(1.5);opacity:0}100%{transform:scale(1.5);opacity:0}}' +
      '@keyframes piShadow{0%,3%{transform:scale(.2);opacity:0}11%{transform:scale(1.1);opacity:.85}19%{transform:scale(.75);opacity:.5}27%{transform:scale(1.1);opacity:.85}33%{transform:scale(.85);opacity:.6}39%{transform:scale(1.05);opacity:.85}48%{transform:scale(.5);opacity:.35}84%{transform:scale(.4);opacity:.25}92%,100%{transform:scale(.2);opacity:0}}' +
      '@keyframes piGlow{0%,8%{opacity:0;transform:scale(.7)}40%{opacity:.6;transform:scale(1)}66%{opacity:1;transform:scale(1.5)}92%,100%{opacity:0;transform:scale(1.8)}}' +
      '@keyframes piTag{0%,58%{opacity:0;transform:translateY(10px)}70%,88%{opacity:1;transform:none}100%{opacity:0;transform:none}}' +
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
  function start(o){
    o = o || {}; VEIL = document.getElementById('introVeil'); if(!VEIL) return; window.__introStarted = true; try{ sessionStorage.setItem('pesa_intro_seen', '1'); }catch(e){}
    try{
      build(o.logo || PESA_LOGO_DATA_URL);
      var q = /[?&]introT=([\d.]+)/.exec(location.search);
      if(q){ seek(parseFloat(q[1])); window.__introReady = true; return; }
      window.addEventListener('pointerdown', onSkip, true); window.addEventListener('keydown', onSkip, true);
      timer = setTimeout(waitReady, DUR * 1000 + 100);
      setTimeout(function(){ finish(true); }, 30000);                      // never trap the app behind the animation
    }catch(e){ try{ console.error('intro failed', e && e.stack || e); }catch(x){} finish(true); }
  }
  return { start:start, seek:seek, finish:finish, DUR:DUR };
})();
