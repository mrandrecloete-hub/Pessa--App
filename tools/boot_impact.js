/* ============================== RELOAD SCREEN: LOGO IMPACT ==============================
   Shown while Pesa reloads (the #pesaBootMsg screen, before app.js has started). In a dark emerald room with light beams,
   the Pesa emblem (the real logo picture) drops fast under gravity, strikes the word PESA, the letters crack and break into
   pieces that fly, tumble, bounce on a wet reflective floor and settle in dust and gold sparks, then the pieces fly back and
   the word reforms under the emblem.
   How it is made: Canvas 2D in real time, no libraries and no files, so it runs before the app has loaded and offline. The
   letters are drawn as thick bevelled lettering, each letter is cut into real Voronoi pieces, and every piece, spark, chip
   and dust cloud is moved by simple physics (gravity, drag, floor bounce, friction, spin). It is 2.5D, not a full 3D engine.
   Plain logo screen underneath is the fallback when canvas is missing; reduced motion shows the finished picture only.
   app.js calls PesaImpact.done() when it is ready: the screen waits for the word to reform (at most about 2.4 s after the
   start) and fades out. Tap or press a key to skip. Test hooks: ?bootT=0.7 freezes one frame at 0.7 s, ?bootHold=1 keeps the
   screen up, localStorage pesa_boot_loop = 1 replays while loading, PesaImpact.replay() replays once. */
(function(){
  'use strict';
  var box = document.getElementById('pesaBootMsg');
  if(!box || window.PesaImpact) return;
  if(document.getElementById('introVeil')) return;                 // the opening animation covers this start
  if(navigator.webdriver === true && !/[?&](bootFx=force|bootT=|bootHold=1)/.test(location.search)) return;   // automated tests keep the plain screen
  var cv = document.createElement('canvas');
  var ctx = cv.getContext && cv.getContext('2d');
  if(!ctx) return;                                                   // the plain logo screen stays

  var qs = location.search, FREEZE = /[?&]bootT=([\d.]+)/.exec(qs), HOLD = /[?&]bootHold=1/.test(qs);
  var reduce = false; try{ reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){}
  var lite = document.documentElement.classList.contains('lite') || (navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);
  var slow = false, slowN = 0, slowSum = 0;   // a phone that cannot keep up drops the costly reflection and some dust
  var loop = false; try{ loop = localStorage.getItem('pesa_boot_loop') === '1'; }catch(e){}

  // timeline in seconds (fast: the whole story is told in under two seconds)
  var T_FALL = .22, T_HIT = .5, T_BREAK = .56, T_BACK = 1.28, T_WHOLE = 1.82, T_CAP = 2.4;

  var st = document.createElement('style');
  st.textContent = '#pesaBootMsg.bm-impact{background:#010806}#pesaBootMsg.bm-impact>*{display:none!important}' +
    '#pesaBootMsg.bm-impact>canvas{display:block!important;position:absolute;left:0;top:0;width:100%;height:100%}' +
    '#pesaBootMsg.bm-impact>.bm-sub,#pesaBootMsg.bm-impact>.bm-bar{display:block!important;position:absolute;left:50%;transform:translateX(-50%);margin:0}' +
    '#pesaBootMsg.bm-impact>.bm-sub{bottom:calc(46px + env(safe-area-inset-bottom,0px));white-space:nowrap;font-size:11px;letter-spacing:.3em;color:rgba(255,236,190,.7)}' +
    '#pesaBootMsg.bm-impact>.bm-bar{bottom:calc(30px + env(safe-area-inset-bottom,0px));width:min(40vw,150px);height:3px}' +
    '#pesaBootMsg.bm-impact::after{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 45%,rgba(0,0,0,0) 40%,rgba(0,0,0,.55) 100%)}' +
    '#pesaBootMsg.bm-out{transition:opacity .32s ease;opacity:0;pointer-events:none}';
  document.head.appendChild(st);
  box.classList.add('bm-impact'); box.insertBefore(cv, box.firstChild);

  // ---------------------------------------------------------------- helpers
  var seed = 7;
  function rnd(){ seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
  function R(a, b){ return a + (b - a) * rnd(); }
  function mk(w, h){ var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function clamp(v, a, b){ return v < a ? a : v > b ? b : v; }
  function ease(k){ k = clamp(k, 0, 1); return 1 - Math.pow(1 - k, 3); }

  var DPR, W, H, FLOOR, LH, FS, ES, EH, logo = new Image(), logoOk = false;
  var letters = [], shards = [], parts = [], whole = null, layer, lx, beams = [], bgC, floorC, shineC;
  var emb = { y:0, vy:0, rot:0, vr:0, hit:false, restY:0 };
  var impact = { x:0, y:0 }, shake = 0, flash = 0, t0 = performance.now(), raf = 0, finished = false, wantOut = false, built = false;

  try{ var v = getComputedStyle(document.documentElement).getPropertyValue('--logo-img').trim(), m = v.match(/url\(\s*["']?(.*?)["']?\s*\)$/); if(m) logo.src = m[1]; }catch(e){}
  logo.onload = function(){ logoOk = true; };

  // ---------------------------------------------------------------- the word PESA, drawn as thick bevelled lettering
  var FACE = [['#3fe0c0', '#0f8f76', '#06584a'], ['#43dba4', '#139a6c', '#075f41'], ['#c8e04a', '#8fbf2e', '#4f7d12'], ['#ffe27a', '#f2b53a', '#a8680c']];
  function makeLetter(ch, i, fs){
    var f = '700 ' + fs + 'px "Pesa Montserrat","Montserrat","Arial Black",Arial,sans-serif';
    ctx.font = f; var w = ctx.measureText(ch).width, depth = Math.max(4, fs * .085), pad = Math.ceil(depth + 6);
    var cw = w + pad * 2, ch2 = fs * 1.05 + pad * 2, c = mk(cw * DPR, ch2 * DPR), g = c.getContext('2d');
    g.scale(DPR, DPR); g.font = f; g.textBaseline = 'alphabetic';
    var bx = pad, by = pad + fs * .86, col = FACE[i];
    for(var k = Math.ceil(depth); k >= 1; k--){                       // the extruded body, darker towards the back
      var s = k / depth; g.fillStyle = 'rgba(' + (i > 1 ? '70,42,4' : '2,40,32') + ',' + (.55 + .45 * s) + ')';
      g.fillText(ch, bx + k * .35, by + k * .9);
    }
    g.fillStyle = col[2]; g.fillText(ch, bx + 1.2, by + 2.2);
    var gr = g.createLinearGradient(0, by - fs * .74, 0, by); gr.addColorStop(0, col[0]); gr.addColorStop(.55, col[1]); gr.addColorStop(1, col[2]);
    g.fillStyle = gr; g.fillText(ch, bx, by);
    g.save(); g.globalCompositeOperation = 'source-atop';           // sheen, bevel light and a little grit
    var sh = g.createLinearGradient(bx, by - fs * .8, bx + w, by); sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(.38, 'rgba(255,255,255,.32)'); sh.addColorStop(.46, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sh; g.fillRect(0, 0, cw, ch2);
    for(var n = 0; n < fs * 3; n++){ g.fillStyle = rnd() < .5 ? 'rgba(0,0,0,.10)' : 'rgba(255,255,255,.08)'; g.fillRect(R(0, cw), R(0, ch2), R(.6, 1.8), R(.6, 1.8)); }
    g.restore();
    // bevel: a thin light rim on the upper left edges, cut out of the letter itself (no outline strokes, which show joins)
    var rim = mk(cw * DPR, ch2 * DPR), rg = rim.getContext('2d'); rg.scale(DPR, DPR); rg.font = f;
    rg.fillStyle = 'rgba(255,255,255,.55)'; rg.fillText(ch, bx, by); rg.globalCompositeOperation = 'destination-out'; rg.fillText(ch, bx + Math.max(1, fs * .014), by + Math.max(1, fs * .018));
    g.drawImage(rim, 0, 0, cw, ch2);
    return { c:c, w:cw, h:ch2, adv:w, pad:pad, base:by };
  }
  function clip(poly, a, b, cc){
    var out = [], n = poly.length;
    for(var i = 0; i < n; i++){
      var p = poly[i], q = poly[(i + 1) % n], dp = a * p[0] + b * p[1] - cc, dq = a * q[0] + b * q[1] - cc;
      if(dp <= 0) out.push(p);
      if((dp < 0 && dq > 0) || (dp > 0 && dq < 0)){ var k = dp / (dp - dq); out.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]); }
    }
    return out;
  }
  function breakLetter(L){
    // pieces are smaller near the point of impact, the way real material breaks
    var n = lite ? 9 : 15, seeds = [], ix = impact.x - L.x, iy = impact.y - L.y;
    for(var i = 0; i < n; i++){
      var nearX = clamp(ix + (rnd() - .5) * L.w * .9, 0, L.w), near = rnd() < .55;
      seeds.push([near ? nearX : R(0, L.w), near ? R(0, L.h * .6) : R(0, L.h)]);
    }
    for(var s = 0; s < n; s++){
      var poly = [[0, 0], [L.w, 0], [L.w, L.h], [0, L.h]], si = seeds[s];
      for(var j = 0; j < n && poly.length; j++){ if(j === s) continue; var sj = seeds[j]; poly = clip(poly, sj[0] - si[0], sj[1] - si[1], (sj[0] * sj[0] + sj[1] * sj[1] - si[0] * si[0] - si[1] * si[1]) / 2); }
      if(poly.length < 3) continue;
      var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, cx = 0, cy = 0;
      poly.forEach(function(p){ x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); cx += p[0]; cy += p[1]; });
      cx /= poly.length; cy /= poly.length;
      var sw = x1 - x0 + 2, shh = y1 - y0 + 2, c = mk(sw * DPR, shh * DPR), g = c.getContext('2d');
      g.scale(DPR, DPR); g.beginPath(); poly.forEach(function(p, k){ g[k ? 'lineTo' : 'moveTo'](p[0] - x0 + 1, p[1] - y0 + 1); }); g.closePath();
      g.save(); g.clip(); g.drawImage(L.c, -x0 + 1, -y0 + 1, L.w, L.h); g.restore();
      g.globalCompositeOperation = 'source-atop'; g.lineWidth = 1.6; g.strokeStyle = 'rgba(255,236,170,.75)'; g.stroke();   // fresh broken edges catch the light
      var a = g.getImageData(0, 0, c.width, c.height).data, cover = 0; for(var q = 3; q < a.length; q += 16) cover += a[q];
      if(cover < 255 * 6) continue;
      var hx = L.x + cx, hy = L.y + cy, dx = hx - impact.x, dy = hy - impact.y, dist = Math.sqrt(dx * dx + dy * dy) || 1;
      var size = Math.sqrt(sw * shh), push = (.25 + .75 * Math.exp(-dist / (W * .32))) * (1 / Math.sqrt(size / 26));
      var sp = R(520, 1250) * push;
      shards.push({ c:c, w:sw, h:shh, ax:cx - x0 + 1, ay:cy - y0 + 1, hx:hx, hy:hy, r:size * .32,
        x:hx, y:hy, vx:dx / dist * sp * 1.15 + R(-60, 60), vy:-Math.abs(R(380, 980) * push) + dy / dist * sp * .3, rot:0, vr:R(-14, 14) * push, rx:0, vrx:R(-11, 11), ry:0, vry:R(-9, 9), rest:false, fx:0, fy:0, frot:0 });
    }
  }
  function build(){
    built = true; seed = 7;
    W = Math.max(1, box.clientWidth || innerWidth); H = Math.max(1, box.clientHeight || innerHeight);
    DPR = Math.min(window.devicePixelRatio || 1, lite ? 1 : 1.5);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    layer = mk(cv.width, cv.height); lx = layer.getContext('2d'); lx.setTransform(DPR, 0, 0, DPR, 0, 0);
    shineC = mk(cv.width, cv.height);
    FLOOR = H * .67; LH = Math.min(W * .25, H * .13, 150); FS = LH / .72;
    var made = 'PESA'.split('').map(function(ch, i){ return makeLetter(ch, i, FS); });
    var gap = -FS * .02, total = made.reduce(function(s, L){ return s + L.adv; }, 0) + gap * 3;
    if(total > W * .86){ var sc = W * .86 / total; FS *= sc; LH *= sc; made = 'PESA'.split('').map(function(ch, i){ return makeLetter(ch, i, FS); }); total = made.reduce(function(s, L){ return s + L.adv; }, 0) + gap * 3; }
    var x = (W - total) / 2, baseY = FLOOR - FS * .02;
    letters = made.map(function(L){ var o = { c:L.c, w:L.w, h:L.h, x:x - L.pad, y:baseY - L.base }; x += L.adv + gap; return o; });
    var top = baseY - FS * .72;
    ES = Math.min(W * .58, H * .32, 300); EH = ES * (349 / 360);
    emb.restY = top + LH * .42 - EH;  emb.y = -EH * 1.2; emb.vy = 1400; emb.rot = -.06; emb.vr = 0; emb.hit = false;
    impact.x = W / 2 + ES * .02; impact.y = top + 4;
    // the whole word, for the shine at the end
    whole = mk(cv.width, cv.height); var wg = whole.getContext('2d'); wg.setTransform(DPR, 0, 0, DPR, 0, 0);
    letters.forEach(function(L){ wg.drawImage(L.c, L.x, L.y, L.w, L.h); });
    shards = []; letters.forEach(function(L){ breakLetter(L); });
    // the parts of the picture that never change are painted once
    bgC = mk(cv.width, cv.height); var bgg = bgC.getContext('2d'); bgg.setTransform(DPR, 0, 0, DPR, 0, 0);
    var gr = bgg.createRadialGradient(W / 2, FLOOR * .62, 0, W / 2, FLOOR * .62, Math.max(W, H) * .78);
    gr.addColorStop(0, '#0b3a2d'); gr.addColorStop(.45, '#05211a'); gr.addColorStop(1, '#010605'); bgg.fillStyle = gr; bgg.fillRect(0, 0, W, H);
    floorC = mk(W * DPR, (H - FLOOR) * DPR); var fg = floorC.getContext('2d'), fl = fg.createLinearGradient(0, 0, 0, floorC.height);
    fl.addColorStop(0, 'rgba(1,8,6,.15)'); fl.addColorStop(.35, 'rgba(1,8,6,.7)'); fl.addColorStop(1, 'rgba(1,6,5,.96)'); fg.fillStyle = fl; fg.fillRect(0, 0, floorC.width, floorC.height);
    beams = []; for(var b = 0; b < 6; b++) beams.push({ x:W * (.18 + .64 * rnd()), w:R(16, 52), a:R(.12, .3), gold:rnd() < .45, ph:R(0, 6) });
    parts = []; for(var d = 0; d < (lite ? 18 : 40); d++) parts.push({ k:'mote', x:R(0, W), y:R(0, FLOOR), vx:R(-6, 6), vy:R(-10, 4), life:0, max:99, s:R(.6, 1.8), gold:rnd() < .5 });
  }

  // soft light beams: bright in the middle, fading to the sides and towards the floor
  var BEAM = [[60, 230, 200], [255, 200, 90]].map(function(rgb){
    var c = mk(64, 256), g = c.getContext('2d'), img = g.createImageData(64, 256);
    for(var y = 0; y < 256; y++) for(var x = 0; x < 64; x++){ var dx = (x - 31.5) / 32, a = Math.exp(-dx * dx * 5) * Math.pow(1 - y / 256, 1.3), i = (y * 64 + x) * 4; img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = a * 255; }
    g.putImageData(img, 0, 0); return c;
  });
  // ---------------------------------------------------------------- particles
  var puff = mk(128, 128); (function(){ var g = puff.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(214,200,168,.55)'); gr.addColorStop(.45, 'rgba(150,140,118,.22)'); gr.addColorStop(1, 'rgba(90,90,80,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); })();
  function burst(){
    var x = impact.x, y = impact.y, k = lite ? .5 : 1;
    for(var i = 0; i < 46 * k; i++){ var a = R(-Math.PI, 0), s = R(60, 520); parts.push({ k:'dust', x:x + R(-30, 30), y:y + R(-6, 10), vx:Math.cos(a) * s * 1.4, vy:Math.sin(a) * s * .55, life:0, max:R(.9, 1.7), s:R(26, 60), g:R(1.4, 3.2) }); }
    for(var j = 0; j < 30 * k; j++){ var s2 = R(300, 900), dir = rnd() < .5 ? -1 : 1; parts.push({ k:'dust', x:x + R(-40, 40), y:FLOOR - R(0, 10), vx:dir * s2, vy:R(-30, 10), life:0, max:R(1.1, 1.9), s:R(30, 70), g:R(1.6, 3) }); }
    for(var n = 0; n < 220 * k; n++){ var a2 = R(-Math.PI * .98, -Math.PI * .02), s3 = R(200, 1500); parts.push({ k:'grit', x:x, y:y, vx:Math.cos(a2) * s3, vy:Math.sin(a2) * s3, life:0, max:R(.5, 1.4), s:R(.6, 2.2), gold:rnd() < .55 }); }
    for(var p = 0; p < 80 * k; p++){ var a3 = R(-Math.PI * .95, -Math.PI * .05), s4 = R(500, 1900); parts.push({ k:'spark', x:x, y:y, vx:Math.cos(a3) * s4, vy:Math.sin(a3) * s4, life:0, max:R(.35, .9), s:R(1, 2.2) }); }
    for(var q = 0; q < 30 * k; q++){ var a4 = R(-Math.PI * .9, -Math.PI * .1), s5 = R(300, 1100); parts.push({ k:'chip', x:x, y:y, vx:Math.cos(a4) * s5, vy:Math.sin(a4) * s5, life:0, max:R(1.2, 2.2), s:R(3, 8), rot:R(0, 6), vr:R(-16, 16), gold:rnd() < .5, rest:false }); }
  }
  function stepParts(dt){
    for(var i = parts.length - 1; i >= 0; i--){
      var p = parts[i]; p.life += dt;
      if(p.life > p.max){ parts.splice(i, 1); continue; }
      if(p.k === 'mote'){ p.x += p.vx * dt; p.y += p.vy * dt; if(p.y < 0) p.y = FLOOR; continue; }
      if(p.k === 'dust'){ var dr = Math.exp(-3.2 * dt); p.vx *= dr; p.vy = p.vy * dr - 12 * dt; p.x += p.vx * dt; p.y += p.vy * dt; continue; }
      var gr = p.k === 'spark' ? 1700 : 2600, drag = p.k === 'grit' ? Math.exp(-1.6 * dt) : 1;
      p.vx *= drag; p.vy = p.vy * drag + gr * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if(p.rot !== undefined) p.rot += p.vr * dt;
      if(p.y > FLOOR){ p.y = FLOOR; if(Math.abs(p.vy) < 90){ p.vy = 0; p.vx *= .85; p.vr *= .8; } else { p.vy *= -.3; p.vx *= .6; } }
    }
  }
  function drawParts(g, layerOnly){
    for(var i = 0; i < parts.length; i++){
      var p = parts[i], k = p.life / p.max, a;
      if(p.k === 'dust'){ if(layerOnly || (slow && i % 2)) continue; a = Math.sin(Math.PI * Math.min(1, k * 1.2 + .05)) * .75; var s = p.s * (1 + k * p.g); g.globalAlpha = a; g.drawImage(puff, p.x - s, p.y - s * .7, s * 2, s * 1.4); continue; }
      if(p.k === 'mote'){ g.globalAlpha = .35; g.fillStyle = p.gold ? '#ffd986' : '#9ff3dd'; g.fillRect(p.x, p.y, p.s, p.s); continue; }
      a = 1 - k;
      if(p.k === 'grit'){ g.globalAlpha = a; g.fillStyle = p.gold ? '#f6c457' : '#6fe0c6'; g.fillRect(p.x, p.y, p.s, p.s); continue; }
      if(p.k === 'spark'){ g.globalAlpha = a; g.strokeStyle = k < .3 ? '#fff6d0' : '#ffbf3c'; g.lineWidth = p.s; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * .022, p.y - p.vy * .022); g.stroke(); continue; }
      if(p.k === 'chip'){ g.globalAlpha = Math.min(1, a * 1.6); g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = p.gold ? '#e9b13c' : '#2fc7a6'; g.beginPath(); g.moveTo(0, -p.s); g.lineTo(p.s * .7, 0); g.lineTo(0, p.s * .9); g.lineTo(-p.s * .6, 0); g.closePath(); g.fill(); g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.moveTo(0, -p.s); g.lineTo(p.s * .7, 0); g.lineTo(0, 0); g.closePath(); g.fill(); g.restore(); }
    }
    g.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- physics steps
  var broke = false, backFrom = null, lastT = 0;
  function step(t, dt){
    if(t >= T_FALL){
      if(!emb.hit){
        emb.vy += 4200 * dt; emb.y += emb.vy * dt; emb.rot += (.035 - emb.rot) * 4 * dt;
        if(emb.y >= emb.restY){ emb.y = emb.restY; emb.hit = true; emb.vy = -emb.vy * .14; emb.vr = .55; flash = 1; shake = 1; }
      } else {
        emb.vy += 4200 * dt; emb.y += emb.vy * dt; if(emb.y > emb.restY){ emb.y = emb.restY; emb.vy = Math.abs(emb.vy) < 120 ? 0 : -emb.vy * .3; }
        emb.vr += (-emb.rot * 180 - emb.vr * 14) * dt; emb.rot += emb.vr * dt;   // the emblem rocks and settles upright
      }
    }
    if(emb.hit && !broke && t >= T_BREAK){ broke = true; burst(); }
    if(broke && t < T_BACK){
      shards.forEach(function(s){
        if(s.rest) return;
        s.vy += 2900 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt; s.rx += s.vrx * dt; s.ry += s.vry * dt;
        if(s.y + s.r * .5 > FLOOR){ s.y = FLOOR - s.r * .5; if(Math.abs(s.vy) < 140){ s.vy = 0; s.vx *= Math.exp(-6 * dt); s.vr *= .9; s.vrx *= .8; s.vry *= .8; if(Math.abs(s.vx) < 8) s.rest = true; } else { s.vy *= -.32; s.vx *= .7; s.vr *= .7; } }
        if(s.x < -60 || s.x > W + 60) s.vx *= -.4;
      });
    }
    if(broke && t >= T_BACK && !backFrom){ backFrom = shards.map(function(s){ return { x:s.x, y:s.y, rot:s.rot, rx:s.rx, ry:s.ry }; }); }
    stepParts(dt);
    flash = Math.max(0, flash - dt * 5.5); shake = Math.max(0, shake - dt * 4);
  }

  // ---------------------------------------------------------------- drawing
  function bg(g, t){
    g.drawImage(bgC, 0, 0, W, H);
    var on = clamp(t / .25, 0, 1), boost = 1 + flash * 1.6 + (emb.hit ? .4 : 0);
    g.globalCompositeOperation = 'lighter';
    beams.forEach(function(b){
      g.globalAlpha = Math.min(.8, b.a * 1.4 * on * boost * (.8 + .2 * Math.sin(t * 3 + b.ph)));
      g.drawImage(b.gold ? BEAM[1] : BEAM[0], b.x - b.w, 0, b.w * 2, FLOOR);
    });
    g.globalAlpha = 1;
    var gl = g.createRadialGradient(W / 2, emb.y + EH * .55, 0, W / 2, emb.y + EH * .55, ES * 1.1), gla = clamp((emb.y + EH) / (emb.restY + EH), 0, 1) * .5 + flash * .5;
    gl.addColorStop(0, 'rgba(255,214,102,' + gla + ')'); gl.addColorStop(.5, 'rgba(30,190,150,' + gla * .35 + ')'); gl.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gl; g.fillRect(W / 2 - ES * 1.1, emb.y + EH * .55 - ES * 1.1, ES * 2.2, ES * 2.2);
    g.globalCompositeOperation = 'source-over';
  }
  function drawEmblem(g, t){
    if(!logoOk || t < T_FALL) return;
    var x = W / 2 - ES / 2, blur = !emb.hit && emb.vy > 600;
    if(blur){ for(var i = 5; i >= 1; i--){ g.globalAlpha = .1 * (6 - i) / 5; g.drawImage(logo, x, emb.y - emb.vy * .008 * i, ES, EH); } g.globalAlpha = 1; }
    g.save(); g.translate(W / 2, emb.y + EH); g.rotate(emb.rot); g.drawImage(logo, -ES / 2, -EH, ES, EH); g.restore();
    if(blur){ g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(160,255,230,.18)'; g.lineWidth = 1; for(var s = 0; s < 8; s++){ var sx = x + R(0, ES), sy = emb.y + R(0, EH); g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx, sy - R(30, 90)); g.stroke(); } g.globalCompositeOperation = 'source-over'; }
  }
  function drawWord(g, t){
    if(!broke){
      letters.forEach(function(L){ g.drawImage(L.c, L.x, L.y, L.w, L.h); });
      if(emb.hit){                                                    // cracks run out from the point of contact
        var k = clamp((t - T_HIT) / (T_BREAK - T_HIT), 0, 1); g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,230,150,' + (.5 + .5 * k) + ')'; g.lineWidth = 1.4; seed = 99;
        for(var c = 0; c < 9; c++){ var a = R(-Math.PI, 0) * .9 + Math.PI * .05, len = (W * .4) * k * R(.5, 1), x = impact.x, y = impact.y + 4; g.beginPath(); g.moveTo(x, y); for(var s = 0; s < 6; s++){ a += R(-.5, .5); x += Math.cos(a) * len / 6; y -= Math.sin(a) * len / 6 * .55 - LH * .08; g.lineTo(x, y); } g.stroke(); }
        g.restore();
      }
      return;
    }
    var back = t >= T_BACK ? (t - T_BACK) / (T_WHOLE - T_BACK) : 0;
    if(back >= 1){ g.drawImage(whole, 0, 0, W, H); return; }
    shards.forEach(function(s, i){
      var x = s.x, y = s.y, rot = s.rot, rx = s.rx, ry = s.ry;
      if(backFrom){ var f = backFrom[i], dd = Math.abs(s.hx - W / 2) / W, k = ease((back - dd * .25) / .75); x = f.x + (s.hx - f.x) * k; y = f.y + (s.hy - f.y) * k - Math.sin(Math.PI * k) * 40; rot = f.rot * (1 - k); rx = f.rx * (1 - k); ry = f.ry * (1 - k); }
      g.save(); g.translate(x, y); g.rotate(rot); g.scale(Math.max(.18, Math.abs(Math.cos(ry))), Math.max(.18, Math.abs(Math.cos(rx))));
      g.drawImage(s.c, -s.ax, -s.ay, s.w, s.h); g.restore();
    });
  }
  function shine(g, t){
    var k = (t - T_WHOLE) / .7; if(k < 0 || k > 1) return;
    var tmp = shineC, tg = tmp.getContext('2d'); tg.globalCompositeOperation = 'source-over'; tg.clearRect(0, 0, tmp.width, tmp.height); tg.drawImage(whole, 0, 0);
    tg.globalCompositeOperation = 'source-atop'; var x = (W * 1.4 * k - W * .2) * DPR, lg = tg.createLinearGradient(x - 80 * DPR, 0, x + 80 * DPR, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(.5, 'rgba(255,248,220,.75)'); lg.addColorStop(1, 'rgba(255,255,255,0)'); tg.fillStyle = lg; tg.fillRect(0, 0, tmp.width, tmp.height);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'lighter'; g.drawImage(tmp, 0, 0); g.restore();
  }
  function render(t){
    var sx = shake ? R(-1, 1) * 7 * shake : 0, sy = shake ? R(-1, 1) * 5 * shake : 0;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); bg(ctx, t);
    // everything solid goes on one layer, so the wet floor can reflect it
    lx.setTransform(1, 0, 0, 1, 0, 0); lx.clearRect(0, 0, layer.width, layer.height); lx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if(emb.hit) drawEmblemShadow(lx);
    drawWord(lx, t); drawEmblem(lx, t); drawParts(lx, true);
    ctx.save(); ctx.translate(sx, sy);
    if(!slow){ ctx.save(); ctx.beginPath(); ctx.rect(-20, FLOOR, W + 40, H); ctx.clip(); ctx.translate(0, FLOOR * 2); ctx.scale(1, -1); ctx.globalAlpha = .34; var rh = Math.min(H - FLOOR, FLOOR); ctx.drawImage(layer, 0, (FLOOR - rh) * DPR, layer.width, rh * DPR, 0, FLOOR - rh, W, rh); ctx.restore(); }
    ctx.drawImage(floorC, -20, FLOOR, W + 40, H - FLOOR);
    ctx.globalCompositeOperation = 'lighter'; var hl = ctx.createLinearGradient(0, FLOOR - 1, 0, FLOOR + 2); hl.addColorStop(0, 'rgba(255,214,120,0)'); hl.addColorStop(.5, 'rgba(255,214,120,' + (.18 + flash * .6) + ')'); hl.addColorStop(1, 'rgba(255,214,120,0)'); ctx.fillStyle = hl; ctx.fillRect(0, FLOOR - 1, W, 3);
    if(flash > 0){ var fg = ctx.createRadialGradient(impact.x, impact.y, 0, impact.x, impact.y, W * .6); fg.addColorStop(0, 'rgba(255,246,214,' + flash + ')'); fg.addColorStop(.3, 'rgba(255,200,90,' + flash * .45 + ')'); fg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = fg; ctx.fillRect(impact.x - W * .6, impact.y - W * .6, W * 1.2, W * 1.2); }
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(layer, 0, 0, W, H);
    if(!slow) shine(ctx, t);
    drawParts(ctx, false);
    ctx.restore();
    var dark = 1 - clamp(t / .22, 0, 1); if(dark > 0){ ctx.fillStyle = 'rgba(1,6,5,' + dark + ')'; ctx.fillRect(0, 0, W, H); }
  }
  function drawEmblemShadow(g){ var gr = g.createRadialGradient(W / 2, FLOOR, 0, W / 2, FLOOR, W * .42); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.save(); g.scale(1, .16); g.fillStyle = gr; g.fillRect(0, (FLOOR - 40) / .16, W, 80 / .16); g.restore(); }

  // ---------------------------------------------------------------- running it
  function reset(){ build(); broke = false; backFrom = null; flash = 0; shake = 0; t0 = performance.now(); lastT = 0; }
  function frame(now){
    if(finished) return;
    var t = (now - t0) / 1000, real = Math.min(.12, Math.max(0, t - lastT)), n = Math.max(1, Math.ceil(real / (1 / 60))), dt = real / n;
    for(var i = 0; i < n; i++) step(lastT + dt * (i + 1), dt);       // physics keeps real time even when frames are slow
    lastT = t;
    if(slowN < 12 && real > 0){ slowN++; slowSum += real; if(slowN === 12 && slowSum / 12 > .04) slow = true; }
    render(t);
    if(t > T_WHOLE + 1.2 && loop && !wantOut){ reset(); }
    if(wantOut && t >= T_WHOLE + .15) return out();
    if(t > T_CAP && wantOut) return out();
    raf = requestAnimationFrame(frame);
  }
  function simulateTo(T){ var dt = 1 / 120; for(var t = 0; t < T; t += dt){ step(t, dt); lastT = t; } render(T); }
  function out(){
    if(finished) return; finished = true; try{ cancelAnimationFrame(raf); }catch(e){}
    box.classList.add('bm-out');
    setTimeout(function(){ try{ box.parentNode.removeChild(box); }catch(e){} try{ st.parentNode.removeChild(st); }catch(e){} cv.width = cv.height = 0; [layer, whole, bgC, floorC, shineC].forEach(function(c){ if(c){ c.width = c.height = 0; } }); if(whole){ whole.width = whole.height = 0; } shards = []; parts = []; }, 360);
  }
  function done(){ if(HOLD) return; wantOut = true; var t = (performance.now() - t0) / 1000; if(reduce || FREEZE || t >= T_WHOLE || t > T_CAP) out(); else setTimeout(out, (Math.min(T_CAP, T_WHOLE + .15) - t) * 1000 + 30); }
  function skip(e){ if(e && e.type === 'keydown' && ['Shift', 'Control', 'Alt', 'Meta', 'Tab'].indexOf(e.key) > -1) return; if(HOLD) return; out(); }
  window.PesaImpact = { done:done, replay:function(){ if(finished) return; reset(); }, T:{ hit:T_HIT, whole:T_WHOLE },
    probe:function(){ var t = FREEZE ? parseFloat(FREEZE[1]) : (performance.now() - t0) / 1000, back = backFrom && t >= T_WHOLE;
      return { embY:emb.y, restY:emb.restY, hit:emb.hit, broke:broke, floor:FLOOR, letterTop:impact.y, shards:shards.length,
        moved:back ? 0 : shards.filter(function(x){ return Math.hypot(x.x - x.hx, x.y - x.hy) > 20; }).length,
        onFloor:shards.filter(function(x){ return x.y + x.r * .5 >= FLOOR - 1; }).length, spinning:shards.filter(function(x){ return Math.abs(x.rot) > .3; }).length,
        reformed:!!back, parts:parts.length }; } };
  box.addEventListener('pointerdown', skip); window.addEventListener('keydown', skip, { once:true });
  document.addEventListener('visibilitychange', function(){ if(document.hidden){ try{ cancelAnimationFrame(raf); }catch(e){} } else if(!finished && !FREEZE && !reduce){ raf = requestAnimationFrame(frame); } });

  function begin(){
    if(finished) return;
    try{
      reset();
      if(FREEZE){ simulateTo(parseFloat(FREEZE[1])); window.__bootReady = true; return; }
      if(reduce){ simulateTo(T_WHOLE + .8); window.__bootReady = true; return; }
      raf = requestAnimationFrame(frame);
    }catch(e){ try{ console.warn('reload animation', e); }catch(x){} box.classList.remove('bm-impact'); try{ cv.parentNode.removeChild(cv); }catch(x){} }
  }
  // wait a moment for the logo picture and the lettering font, never long
  var waited = 0;
  (function ready(){
    var fontOk = !document.fonts || document.fonts.check('700 40px "Pesa Montserrat"');
    if((logoOk && fontOk) || waited > 260){ begin(); return; }
    if(waited === 0 && document.fonts && document.fonts.load) document.fonts.load('700 40px "Pesa Montserrat"').catch(function(){});
    waited += 20; setTimeout(ready, 20);
  })();
})();
