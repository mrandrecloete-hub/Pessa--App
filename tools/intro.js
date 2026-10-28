/* ============================== OPENING ANIMATION ==============================
   Plays once each time Pesa starts: the screen starts dark and full of smoke, the smoke slowly thins and drifts away, the Pesa
   logo appears out of it with a soft golden glow, the slogan follows, and the welcome page fades in. Nothing bounces or spins.
   The smoke is drawn live with WebGL; a plain CSS version below is the fallback when WebGL is missing, or for reduced motion or
   low power. Tap or press any key to skip.
   Test hooks: ?intro=force plays even in automated browsers; ?intro=force&introT=2.5 shows one still frame at 2.5 s
   (the plain version), and adding &introGLT=2.5 shows the live smoke frozen at that moment. */
var PesaIntro = (function(){
  'use strict';
  var DUR = 4.2;                                   // seconds the animation runs
  var mode = 'css';
  var VEIL = null, done = false, timer = 0;

  function firstScreenReady(){
    try{
      var app = document.getElementById('app'), au = document.getElementById('authScreen');
      if(app && getComputedStyle(app).display !== 'none') return true;
      if(au && getComputedStyle(au).display !== 'none' && au.textContent.indexOf('Loading') < 0 && au.children.length) return true;
    }catch(e){}
    return false;
  }
  function css(){
    var A = 'animation-duration:' + DUR + 's;animation-fill-mode:both;animation-iteration-count:1;animation-delay:var(--pi-d,0s);animation-play-state:var(--pi-s,running);animation-timing-function:cubic-bezier(.4,0,.2,1);';
    return '@keyframes piLogo{0%,12%{opacity:0;transform:scale(.9);filter:blur(16px) brightness(.4)}55%{opacity:1;transform:scale(.99);filter:blur(1px) brightness(.95)}70%,100%{opacity:1;transform:scale(1);filter:blur(0) brightness(1)}}' +
      '@keyframes piGlow{0%,15%{opacity:0;transform:scale(.6)}60%{opacity:.75;transform:scale(1)}100%{opacity:.6;transform:scale(1.1)}}' +
      '@keyframes piTag{0%,58%{opacity:0;transform:translateY(8px);filter:blur(6px)}78%,100%{opacity:1;transform:none;filter:blur(0)}}' +
      '@keyframes piDark{0%,8%{opacity:1}55%{opacity:.2}80%,100%{opacity:0}}' +
      '@keyframes piPuff{0%,10%{opacity:.95;transform:translate(0,0) scale(1)}78%,100%{opacity:0;transform:translate(var(--dx),var(--dy)) scale(1.9)}}' +
      '#introVeil{display:flex;align-items:center;justify-content:center;overflow:hidden;background:radial-gradient(70% 55% at 50% 46%,#0c3a2e 0%,#06231b 45%,#020a08 100%)!important;font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
      '#introVeil .pi-dark{position:absolute;inset:0;background:#020605;animation-name:piDark;' + A + '}' +
      '#introVeil .pi-stage{position:absolute;left:50%;top:46%;width:0;height:0}' +
      '#introVeil .pi-logo{position:absolute;left:calc(var(--pi-s2) / -2);top:calc(var(--pi-s2) / -2);width:var(--pi-s2);height:var(--pi-s2);background:var(--pi-img) center/contain no-repeat;will-change:transform,opacity,filter;filter:drop-shadow(0 0 26px rgba(255,214,102,.45));animation-name:piLogo;' + A + '}' +
      '#introVeil .pi-glow{position:absolute;left:-190px;top:-190px;width:380px;height:380px;border-radius:50%;background:radial-gradient(circle,rgba(255,214,102,.42),rgba(20,163,122,.18) 45%,rgba(0,0,0,0) 70%);filter:blur(10px);animation-name:piGlow;' + A + '}' +
      '#introVeil .pi-smoke{position:absolute;inset:-20%;pointer-events:none}' +
      '#introVeil .pi-puff{position:absolute;border-radius:50%;background:radial-gradient(circle,rgba(46,58,54,.95) 0%,rgba(28,36,33,.8) 35%,rgba(10,14,13,0) 70%);filter:blur(24px);animation-name:piPuff;' + A + '}' +
      '#introVeil .pi-tag{position:absolute;left:0;right:0;top:calc(46% + var(--pi-s2) / 2 + 26px);text-align:center;font:italic 600 18px/1.2 Georgia,"Times New Roman",serif;letter-spacing:.05em;color:rgba(255,238,190,.95);text-shadow:0 2px 14px rgba(0,0,0,.7);animation-name:piTag;' + A + '}' +
      '#introVeil .pi-hint{position:absolute;left:0;right:0;bottom:calc(20px + env(safe-area-inset-bottom,0px));text-align:center;font:600 11px/1 Inter,system-ui,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.4)}' +
      '#introVeil .pi-gl-c{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none}' +
      '#introVeil.pi-gl .pi-smoke,#introVeil.pi-gl .pi-dark{display:none}' +
      'html.lite #introVeil .pi-logo,html.lite #introVeil .pi-glow,html.lite #introVeil .pi-tag,html.lite #introVeil .pi-dark,html.lite #introVeil .pi-puff{animation-duration:' + DUR + 's!important;animation-iteration-count:1!important;animation-delay:var(--pi-d,0s)!important}' +
      'html.lite #introVeil .pi-glow,html.lite #introVeil .pi-puff{filter:none}' +
      '@media (prefers-reduced-motion:reduce){#introVeil .pi-logo,#introVeil .pi-glow,#introVeil .pi-tag,#introVeil .pi-puff,#introVeil .pi-dark{animation:none!important}#introVeil .pi-logo,#introVeil .pi-tag{opacity:1;transform:none;filter:none}#introVeil .pi-puff,#introVeil .pi-dark{opacity:0}}';
  }
  /* ---- live smoke: a WebGL shader draws drifting, curling smoke over the logo. It starts thick and dark, thins from the middle
     outwards so the logo shows through, and leaves a few slow wisps. The logo itself is plain CSS underneath it. ---- */
  var FS = 'precision mediump float;uniform vec2 R;uniform float T;uniform float D;' +
  'float hs(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}' +
  'float ns(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hs(i),hs(i+vec2(1,0)),f.x),mix(hs(i+vec2(0,1)),hs(i+vec2(1,1)),f.x),f.y);}' +
  'float fb(vec2 p){float v=0.0,a=0.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);for(int i=0;i<5;i++){v+=a*ns(p);p=m*p;a*=0.5;}return v;}' +
  'void main(){vec2 p=(gl_FragCoord.xy-0.5*R)/R.y;p.y=-p.y;float t=T;' +
  ' vec2 q=vec2(fb(p*1.6+vec2(0.0,t*0.06)),fb(p*1.6+vec2(5.2,1.3)-vec2(t*0.05,0.0)));' +
  ' vec2 r=vec2(fb(p*2.2+q*2.4+vec2(1.7,9.2)+t*0.09),fb(p*2.2+q*2.4+vec2(8.3,2.8)-t*0.07));' +
  ' float s=fb(p*1.8+r*1.6+vec2(-t*0.04,t*0.11));s=clamp((s-0.47)*2.6+0.5,0.0,1.0);' +
  ' float d=length(p*vec2(0.9,1.0)-vec2(0.0,0.04));' +
  ' float c=smoothstep(0.28,0.78,s);float lit=mix(0.45,1.0,smoothstep(0.0,0.6,D));' +
  ' vec3 smoke=mix(vec3(0.010,0.018,0.016),vec3(0.36,0.40,0.38)*lit,c*c);' +
  ' smoke+=vec3(0.70,0.52,0.18)*exp(-d*d*6.0)*c*0.55*smoothstep(0.25,0.85,D);' +
  ' float rad=D*1.05-0.32;float hole=smoothstep(rad-0.16,rad+0.34,d+(s-0.5)*0.7);' +
  ' float thin=smoothstep(0.45,0.85,s)*0.8*(1.0-smoothstep(0.5,0.95,D));' +
  ' float edge=smoothstep(0.5,0.9,s)*smoothstep(0.18,0.55,d)*0.55*(1.0-0.6*smoothstep(0.85,1.0,D));' +
  ' float a=max(hole*(0.8+0.2*c),max(thin,edge)*(1.0-hole));' +
  ' float vg=smoothstep(0.3,1.0,length(p*vec2(1.0,0.85)));a=clamp(a+vg*0.5*(1.0-0.6*D),0.0,1.0);smoke=mix(smoke,vec3(0.006,0.012,0.010),vg*0.7);' +
  ' gl_FragColor=vec4(smoke*a,a);}';
  var GL = null;
  function canGL(){
    try{
      if(/[?&]introGL=0/.test(location.search)) return false;
      if(/[?&]introT=/.test(location.search) && !/[?&]introGLT=/.test(location.search)) return false;
      if(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
      if(document.documentElement.classList.contains('lite')) return false;
      return true;
    }catch(e){ return false; }
  }
  function startGL(o){
    var cv = document.createElement('canvas'), dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    var W = Math.max(1, VEIL.clientWidth || window.innerWidth), Hh = Math.max(1, VEIL.clientHeight || window.innerHeight);
    // smoke is soft, so it is drawn at a lower resolution and stretched: smooth on phones too
    var scale = .6 * dpr; cv.width = Math.round(W * scale); cv.height = Math.round(Hh * scale);
    var gl = cv.getContext('webgl', { antialias:false, alpha:true, premultipliedAlpha:true, depth:false, stencil:false, preserveDrawingBuffer:false }) || cv.getContext('experimental-webgl', { alpha:true });
    if(!gl) return false;
    function sh(t, src){ var x = gl.createShader(t); gl.shaderSource(x, src); gl.compileShader(x); if(!gl.getShaderParameter(x, gl.COMPILE_STATUS)){ try{ console.warn('intro shader', gl.getShaderInfoLog(x)); }catch(e){} return null; } return x; }
    var vs = sh(gl.VERTEX_SHADER, 'attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}'), fs = sh(gl.FRAGMENT_SHADER, FS);
    if(!vs || !fs) return false;
    var pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
    if(!gl.getProgramParameter(pr, gl.LINK_STATUS)) return false;
    gl.useProgram(pr);
    var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(pr, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var uR = gl.getUniformLocation(pr, 'R'), uT = gl.getUniformLocation(pr, 'T'), uD = gl.getUniformLocation(pr, 'D');
    build((o && o.logo) || PESA_LOGO_DATA_URL);
    mode = 'gl'; VEIL.classList.add('pi-gl');
    cv.className = 'pi-gl-c'; VEIL.appendChild(cv);                     // above the logo, so the logo comes out of the smoke
    var hint = VEIL.querySelector('.pi-hint'); if(hint) VEIL.appendChild(hint);
    var t0 = performance.now(), raf = 0, still = /[?&]introGLT=([\d.]+)/.exec(location.search);
    if(still){ seek(parseFloat(still[1])); }
    function frame(now){
      if(done) return;
      var T = still ? parseFloat(still[1]) : (now - t0) / 1000, k = Math.min(1, Math.max(0, (T - .25) / (DUR * .78)));
      var D = k * k * (3 - 2 * k);                                     // how far the smoke has cleared, 0 to 1, eased
      gl.viewport(0, 0, cv.width, cv.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uR, cv.width, cv.height); gl.uniform1f(uT, T + 3.0); gl.uniform1f(uD, D);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if(still){ window.__introReady = true; return; }
      raf = requestAnimationFrame(frame);
    }
    GL = { stop:function(){ try{ cancelAnimationFrame(raf); }catch(e){} try{ var x = gl.getExtension('WEBGL_lose_context'); if(x) x.loseContext(); }catch(e){} } };
    window.__introGL = true;
    if(!still) timer = setTimeout(waitReady, DUR * 1000 + 100);
    raf = requestAnimationFrame(frame);
    return true;
  }
  function puffs(){
    // the plain version: soft dark clouds that grow and drift outwards as they fade, the middle ones first
    var out = '', n = 14;
    for(var i = 0; i < n; i++){
      var a = i / n * 6.2832 + (i % 3) * .4, r = 18 + (i % 4) * 9, x = 50 + Math.cos(a) * r * .6, y = 50 + Math.sin(a) * r * .5;
      var s = 34 + (i % 5) * 7, dl = (i % 4) * .18;
      out += '<div class="pi-puff" style="left:' + (x - s / 2) + '%;top:' + (y - s / 2) + '%;width:' + s + '%;height:' + s + '%;--dx:' + (Math.cos(a) * 14) + '%;--dy:' + (Math.sin(a) * 10 - 6) + '%;animation-delay:calc(var(--pi-d,0s) + ' + dl + 's)"></div>';
    }
    return '<div class="pi-smoke">' + out + '</div>';
  }
  function build(logo){
    var st = document.createElement('style'); st.id = 'introCss'; st.textContent = css(); document.head.appendChild(st);
    var size = Math.round(Math.min(window.innerWidth * .5, 200));
    VEIL.style.setProperty('--pi-s2', size + 'px'); VEIL.style.setProperty('--pi-img', 'url("' + logo + '")');
    VEIL.innerHTML = '<div class="pi-stage"><div class="pi-glow"></div><div class="pi-logo"></div></div>' +
      '<div class="pi-tag">Your Mula, Your Pride<span class="slogan-sub">(Retail Automated System)</span></div>' + puffs() + '<div class="pi-dark"></div>' +
      '<div class="pi-hint">' + ((typeof tr === 'function') ? tr('Tap to skip') : 'Tap to skip') + '</div>';
  }
  function finish(fast){
    if(done) return; done = true; clearTimeout(timer);
    window.removeEventListener('pointerdown', onSkip, true); window.removeEventListener('keydown', onSkip, true);
    try{ sessionStorage.setItem('pesa_intro_seen', '1'); }catch(e){}
    // the last of the smoke lifts slowly and the welcome page shows through
    var ms = fast ? 350 : 1100;
    VEIL.style.pointerEvents = 'none'; VEIL.style.transition = 'opacity ' + ms / 1000 + 's ease, filter ' + ms / 1000 + 's ease'; VEIL.style.opacity = '0'; if(!fast) VEIL.style.filter = 'blur(6px)';
    setTimeout(function(){ try{ if(GL && GL.stop) GL.stop(); }catch(e){} try{ VEIL.parentNode.removeChild(VEIL); }catch(e){} try{ var c = document.getElementById('introCss'); if(c) c.parentNode.removeChild(c); }catch(e){} document.documentElement.classList.remove('intro-on'); try{ window.dispatchEvent(new Event('pesa:intro-done')); }catch(e){} }, ms + 40);
  }
  function onSkip(e){ if(e && e.type === 'keydown' && ['Shift', 'Control', 'Alt', 'Meta', 'Tab'].indexOf(e.key) > -1) return; finish(true); }
  function seek(t){ if(!VEIL) return; VEIL.style.setProperty('--pi-s', 'paused'); VEIL.style.setProperty('--pi-d', (-t) + 's'); }
  function waitReady(){
    if(done) return;
    if(firstScreenReady() || performance.now() > 9000){ finish(false); return; }
    timer = setTimeout(waitReady, 150);
  }
  function startCss(o){
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
      var ok = false; if(canGL()){ try{ ok = startGL(o); }catch(e){ ok = false; try{ console.warn('intro smoke failed', e); }catch(x){} } }
      if(!ok){ if(VEIL.querySelector('.pi-logo')) VEIL.innerHTML = ''; var c = document.getElementById('introCss'); if(c) c.parentNode.removeChild(c); VEIL.classList.remove('pi-gl'); startCss(o); }
    }catch(e){ try{ console.error('intro failed', e && e.stack || e); }catch(x){} finish(true); }
  }
  return { start:start, seek:seek, finish:finish, DUR:DUR };
})();
