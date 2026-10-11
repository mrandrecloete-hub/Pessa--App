/* ============================== OPENING ANIMATION ==============================
   Plays once each time Pesa starts: the Pesa logo drops in and bounces four times on the water (with its reflection and
   ripples), settles, and the welcome page appears. No spinning and no flying away. Pure CSS keyframes, no files, no libraries.
   The water is drawn live with WebGL (waves, glints, ripples and the logo's reflection) and the logo bounces on it; a
   plain CSS version below is the fallback when WebGL is missing, or for reduced motion or low power.
   Tap or press any key to skip.
   Test hooks: ?intro=force plays even in automated browsers; ?intro=force&introT=2.5 shows one still frame at 2.5 s. */
var PesaIntro = (function(){
  'use strict';
  var DUR = 4.2;                                   // seconds the animation runs
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
  /* ---- real water: a small WebGL shader draws the lake (waves, golden glints, ripples from every landing, the logo's
     reflection bending in the ripples) and a canvas throws water drops at each landing. The CSS logo bounces above it. ---- */
  var FS = 'precision highp float;uniform vec2 R;uniform float T;uniform sampler2D L;uniform vec4 G;uniform vec4 P;uniform vec4 IT;uniform vec4 IA;' +
  'float hs(vec2 q){return fract(sin(dot(q,vec2(127.1,311.7)))*43758.5453);}' +
  'vec2 W(vec2 p){float t=(p.y-G.z)/(R.y-G.z);float z=1.0/(t*0.85+0.10);return vec2((p.x-G.x)/R.y*z*2.0,z);}' +
  'float H(vec2 w,vec2 c,out float foam){float h=0.0;foam=0.0;' +
  ' for(int i=0;i<4;i++){float a=T-IT[i];if(a>0.0){float d=length(w-c);float r=a*1.55;float e=exp(-a*1.35)*IA[i]/(1.0+d*0.8);' +
  '  float k=d-r+0.22;h+=e*sin(21.0*(d-r))*exp(-k*k/0.16);float f=(d-r)/0.20;foam+=IA[i]*exp(-a*2.4)*exp(-f*f)/(1.0+d*0.5);}}' +
  ' h+=0.010*sin(w.x*8.0+T*1.2+sin(w.y*2.7))+0.008*sin(w.y*10.0-T*1.6+w.x*2.0)+0.005*sin(w.x*19.0+w.y*7.0+T*2.3);return h;}' +
  'void main(){vec2 p=vec2(gl_FragCoord.x,R.y-gl_FragCoord.y);vec3 col;' +
  ' if(p.y<G.z){float t=p.y/G.z;float dx=(p.x-G.x)/(R.x*0.42);col=mix(vec3(0.003,0.035,0.03),vec3(0.03,0.26,0.21),pow(t,1.5));' +
  '  col+=vec3(0.75,0.55,0.18)*exp(-dx*dx)*pow(t,4.0)*0.42;vec2 bq=p/(R.y*0.07);vec2 bc=floor(bq);float bk=hs(bc);float bd=length(fract(bq)-0.5+(vec2(hs(bc+1.3),hs(bc+2.7))-0.5)*0.4);col+=vec3(0.7,0.5,0.15)*step(0.90,bk)*smoothstep(0.30,0.0,bd)*0.16*exp(-dx*dx*0.6)*(0.5+0.5*sin(T*0.8+bk*30.0))*pow(t,2.0);}' +
  ' else{float t=(p.y-G.z)/(R.y-G.z);vec2 w=W(p);vec2 c=W(vec2(G.x,G.y));float f0,f1,f2;float h0=H(w,c,f0);float e=0.012;' +
  '  float hx=H(w+vec2(e,0.0),c,f1);float hz=H(w+vec2(0.0,e),c,f2);vec3 n=normalize(vec3(-(hx-h0)/e*0.55,1.0,-(hz-h0)/e*0.55));' +
  '  float dx=(p.x-G.x)/(R.x*0.5);vec3 deep=mix(vec3(0.02,0.14,0.12),vec3(0.005,0.07,0.07),t);' +
  '  float horizon=exp(-t*7.0);vec3 sky=mix(vec3(0.03,0.26,0.22),vec3(0.80,0.58,0.20),horizon*exp(-dx*dx*1.6)*0.9);' +
  '  float fr=pow(1.0-max(n.y*(0.25+0.75*t),0.0),3.0)*0.55+0.30*(1.0-t);col=mix(deep,sky,clamp(fr,0.0,0.85));' +
  '  vec3 V=normalize(vec3(0.0,0.42,1.0));vec3 Ld=normalize(vec3(-0.25,0.55,-0.85));vec3 hh=normalize(Ld+V);float sp=max(dot(n,hh),0.0);' +
  '  col+=vec3(1.0,0.82,0.45)*(pow(sp,150.0)*1.6+pow(sp,28.0)*0.16);' +
  '  vec2 gq=vec2(p.x/(R.y*0.016),p.y/(R.y*0.009));vec2 gc=floor(gq);float gk=hs(gc+floor(T*2.5));float gd=length((fract(gq)-0.5)*vec2(1.0,2.2));float path=exp(-dx*dx*5.0)*exp(-t*2.8);col+=vec3(1.0,0.82,0.45)*step(0.955,gk)*smoothstep(0.42,0.0,gd)*path*1.1;' +
  '  col+=vec3(0.75,1.0,0.95)*clamp(f0,0.0,1.0)*0.55;' +
  '  float s=P.w*0.0+G.w;float sx=P.y,sy=P.z;float yb=G.y-P.x;float yt=yb-s*sy;vec2 m=vec2(p.x+n.x*s*0.35,2.0*G.y-p.y+n.z*s*0.25);' +
  '  float u=(m.x-(G.x-s*sx*0.5))/(s*sx);float v=(m.y-yt)/(s*sy);' +
  '  if(u>0.0&&u<1.0&&v>0.0&&v<1.0){vec4 lc=texture2D(L,vec2(u,v));float fade=exp(-(p.y-G.y)/(s*0.85));col=mix(col,lc.rgb*1.05,lc.a*fade*0.62);}' +
  '  float sh=exp(-pow((p.x-G.x)/(s*0.55*sx),2.0)-pow((p.y-G.y)/(s*0.10),2.0));col*=1.0-0.45*sh*clamp(1.0-P.x/(s*1.4),0.0,1.0);}' +
  ' float vg=length((p-0.5*R)/R);col*=1.0-0.55*pow(vg*1.15,2.2);col*=smoothstep(0.0,0.45,T);gl_FragColor=vec4(col,1.0);}';
  var GL = null;
  function canGL(){
    try{
      if(/[?&]introGL=0/.test(location.search)) return false;
      if(/[?&]introT=/.test(location.search)) return false;
      if(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
      if(document.documentElement.classList.contains('lite')) return false;
      return true;
    }catch(e){ return false; }
  }
  function glInit(){
    var cv = document.createElement('canvas'), dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var W = Math.max(1, VEIL.clientWidth || window.innerWidth), Hh = Math.max(1, VEIL.clientHeight || window.innerHeight);
    cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr);
    var gl = cv.getContext('webgl', { antialias:false, alpha:false, depth:false, stencil:false, preserveDrawingBuffer:false }) || cv.getContext('experimental-webgl');
    if(!gl) return null;
    function sh(t, src){ var o = gl.createShader(t); gl.shaderSource(o, src); gl.compileShader(o); if(!gl.getShaderParameter(o, gl.COMPILE_STATUS)){ try{ console.warn('intro shader', gl.getShaderInfoLog(o)); }catch(e){} return null; } return o; }
    var vs = sh(gl.VERTEX_SHADER, 'attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}'), fs = sh(gl.FRAGMENT_SHADER, FS);
    if(!vs || !fs) return null;
    var pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
    if(!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
    gl.useProgram(pr);
    var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(pr, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0,0,0,0]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var u = {}; ['R','T','L','G','P','IT','IA'].forEach(function(n){ u[n] = gl.getUniformLocation(pr, n); });
    return { cv:cv, gl:gl, u:u, tex:tex, dpr:dpr, W:W, H:Hh };
  }
  function startGL(o){
    var g = glInit(); if(!g) return false;
    build((o && o.logo) || PESA_LOGO_DATA_URL);
    GL = g; mode = 'gl';
    VEIL.classList.add('pi-gl');
    var stc = document.getElementById('introCss'); if(stc) stc.textContent += '#introVeil.pi-gl .pi-water,#introVeil.pi-gl .pi-ring,#introVeil.pi-gl .pi-refl{display:none}#introVeil .pi-gl-c,#introVeil .pi-dr-c{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none}';
    g.cv.className = 'pi-gl-c'; VEIL.insertBefore(g.cv, VEIL.firstChild);
    var dc = document.createElement('canvas'); dc.className = 'pi-dr-c'; dc.width = Math.round(g.W * g.dpr); dc.height = Math.round(g.H * g.dpr); VEIL.appendChild(dc);
    var dx = dc.getContext('2d'), gl = g.gl;
    // the logo picture, as a texture, so it can be reflected in the water
    var img = new Image(); img.onload = function(){ try{ gl.bindTexture(gl.TEXTURE_2D, g.tex); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); }catch(e){} };
    img.src = (o && o.logo) || PESA_LOGO_DATA_URL;
    var logo = VEIL.querySelector('.pi-logo'), size = parseFloat(VEIL.style.getPropertyValue('--pi-s2')) || 150;
    var LAND = [.12, .31, .46, .58], AMP = [1, .8, .6, .5], t0 = performance.now(), parts = [], fired = [0,0,0,0], raf = 0, W = g.W, Hh = g.H, dpr = g.dpr;
    function spawn(k){
      var n = Math.round(30 + 14 * AMP[k]);
      for(var q = 0; q < n; q++){
        var side = Math.random() < .5 ? -1 : 1, spread = (Math.random() * .9 + .1), ang = -Math.PI / 2 + side * spread * 1.15;
        var sp = (160 + Math.random() * 420) * (.55 + .5 * AMP[k]);
        parts.push({ x: W / 2 + side * Math.random() * size * .28, y: Hh * .58 + 2, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: .8 + Math.random() * 2.6 * (.6 + .4 * AMP[k]), life: 0, max: .7 + Math.random() * .8 });
      }
    }
    var last = t0;
    function frame(now){
      if(done || !GL) return;
      var T = (now - t0) / 1000, dt = Math.min(.05, (now - last) / 1000); last = now;
      var lift = 0, sx = 1, sy = 1;
      try{ var tf = getComputedStyle(logo).transform; if(tf && tf !== 'none'){ var m = tf.replace(/^matrix3d\(|^matrix\(|\)$/g, '').split(','); if(m.length === 16){ sx = +m[0]; sy = +m[5]; lift = -(+m[13]); } else if(m.length === 6){ sx = +m[0]; sy = +m[3]; lift = -(+m[5]); } } }catch(e){}
      var gl = g.gl, u = g.u, h = g.H * dpr, w = g.W * dpr;
      gl.viewport(0, 0, g.cv.width, g.cv.height);
      gl.uniform2f(u.R, g.cv.width, g.cv.height); gl.uniform1f(u.T, T);
      gl.uniform4f(u.G, g.cv.width / 2, g.cv.height * .58, g.cv.height * .46, size * dpr);
      gl.uniform4f(u.P, lift * dpr, sx, sy, dpr);
      var it = [], ia = []; for(var i = 0; i < 4; i++){ it.push(LAND[i] * DUR); ia.push(AMP[i]); }
      gl.uniform4f(u.IT, it[0], it[1], it[2], it[3]); gl.uniform4f(u.IA, ia[0], ia[1], ia[2], ia[3]);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, g.tex); gl.uniform1i(u.L, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      for(var k = 0; k < 4; k++){ if(!fired[k] && T >= LAND[k] * DUR){ fired[k] = 1; spawn(k); } }
      dx.setTransform(dpr, 0, 0, dpr, 0, 0); dx.clearRect(0, 0, W, Hh);
      for(var j = parts.length - 1; j >= 0; j--){
        var d = parts[j]; d.life += dt; if(d.life > d.max){ parts.splice(j, 1); continue; }
        d.vy += 1250 * dt; d.x += d.vx * dt; d.y += d.vy * dt;
        if(d.y > Hh * .58 + 6 && d.vy > 0){ parts.splice(j, 1); continue; }
        var al = Math.max(0, 1 - d.life / d.max) * .9;
        dx.beginPath(); dx.fillStyle = 'rgba(205,255,240,' + al * .75 + ')'; dx.arc(d.x, d.y, d.r, 0, 6.2832); dx.fill();
        dx.beginPath(); dx.fillStyle = 'rgba(255,255,255,' + al + ')'; dx.arc(d.x - d.r * .3, d.y - d.r * .3, d.r * .38, 0, 6.2832); dx.fill();
        dx.strokeStyle = 'rgba(190,255,235,' + al * .35 + ')'; dx.lineWidth = Math.max(.6, d.r * .5); dx.beginPath(); dx.moveTo(d.x, d.y); dx.lineTo(d.x - d.vx * .018, d.y - d.vy * .018); dx.stroke();
      }
      raf = requestAnimationFrame(frame);
    }
    GL.stop = function(){ try{ cancelAnimationFrame(raf); }catch(e){} try{ g.gl.getExtension('WEBGL_lose_context') && g.gl.getExtension('WEBGL_lose_context').loseContext(); }catch(e){} };
    window.__introGL = true;
    timer = setTimeout(waitReady, DUR * 1000 + 100);
    raf = requestAnimationFrame(frame);
    return true;
  }
  function build(logo){
    var st = document.createElement('style'); st.id = 'introCss'; st.textContent = css(); document.head.appendChild(st);
    var size = Math.round(Math.min(window.innerWidth * .54, 210));
    VEIL.style.setProperty('--pi-s2', size + 'px'); VEIL.style.setProperty('--pi-img', 'url("' + logo + '")');
    VEIL.innerHTML = '<div class="pi-water"></div><div class="pi-stage"><div class="pi-glow"></div><div class="pi-shadow"></div><div class="pi-ring"></div><div class="pi-refl"></div><div class="pi-logo"></div></div>' +
      '<div class="pi-tag">Your Mula, Your Pride</div><div class="pi-hint">' + ((typeof tr === 'function') ? tr('Tap to skip') : 'Tap to skip') + '</div>';
  }
  function finish(fast){
    if(done) return; done = true; clearTimeout(timer); try{ if(GL && GL.stop) GL.stop(); }catch(e){}
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
      var ok = false; if(canGL()){ try{ ok = startGL(o); }catch(e){ ok = false; try{ console.warn('intro water failed', e); }catch(x){} } }
      if(!ok) startCss(false, o);
    }catch(e){ try{ console.error('intro failed', e && e.stack || e); }catch(x){} finish(true); }
  }
  return { start:start, seek:seek, finish:finish, DUR:DUR };
})();
