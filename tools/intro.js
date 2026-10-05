/* ============================== OPENING ANIMATION ==============================
   Plays once each time Pesa starts: the glass P appears, shakes, cracks open and breaks; N$ notes and coins pour out and
   rain down; a wall of water sweeps the money away and washes the welcome page into view.
   Everything is drawn with the canvas (no files, no libraries). Tap or press any key to skip.
   Test hooks: ?intro=force plays even in automated browsers; ?intro=force&introT=4.5 draws one still frame at 4.5 s. */
var PesaIntro = (function(){
  'use strict';
  var TL = { logoIn:0.3, shimmer:1.25, crack:1.75, brk:3.45, wave:6.4, waveDur:1.4 };   // wave/waveDur now mean: when the smoke starts to clear, and how long it takes   // seconds
  var VEIL = null, cvs = null, ctx = null, img = null;
  var W = 0, H = 0, DPR = 1, L = 240, sc = 1, cx = 0, cy = 0, Lw = 240, Lh = 233, B = 200;
  var spr = {}, geo = null, layer = null, lctx = null, grain = null;
  var S = null;                                             // simulation state
  var opts = { lite:false, simple:false, still:null, seed:20261004 };
  var raf = 0, last = 0, done = false, hint = null, tagline = null, wtext = null, perf = { n:0, sum:0, down:false };

  function mulberry(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  var R = mulberry(opts.seed);
  function clamp(x, a, b){ return x < a ? a : (x > b ? b : x); }
  function lerp(a, b, t){ return a + (b - a) * t; }
  function sm(t){ t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function easeIO(t){ t = clamp(t, 0, 1); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeOut(t){ t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }
  function easeOutBack(t){ t = clamp(t, 0, 1); var c1 = 1.2, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  function frac(x){ return x - Math.floor(x); }
  function rr(c, x, y, w, h, r){ c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function mkCanvas(w, h){ var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function sprite(w, h, fn){ var c = mkCanvas(w * DPR, h * DPR), x = c.getContext('2d'); x.scale(DPR, DPR); fn(x, w, h); c._w = w; c._h = h; return c; }

  /* ------------------------------------------------------------------ sprites */
  function glowSprite(size, stops){ return sprite(size, size, function(x, w){ var g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); stops.forEach(function(s){ g.addColorStop(s[0], s[1]); }); x.fillStyle = g; x.fillRect(0, 0, w, w); }); }
  function starSprite(size){
    return sprite(size, size, function(x, w){
      var c = w / 2, g = x.createRadialGradient(c, c, 0, c, c, c); g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(.18, 'rgba(255,232,150,.55)'); g.addColorStop(1, 'rgba(255,200,80,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w);
      x.fillStyle = 'rgba(255,255,240,.95)'; x.beginPath(); x.moveTo(c, 0); x.quadraticCurveTo(c + 1.2, c - 1.2, w, c); x.quadraticCurveTo(c + 1.2, c + 1.2, c, w); x.quadraticCurveTo(c - 1.2, c + 1.2, 0, c); x.quadraticCurveTo(c - 1.2, c - 1.2, c, 0); x.fill();
    });
  }
  var smokeCache = null;
  /** Billowing smoke from layered noise, shaded as if lit from the burst in the middle. Built once. */
  function smokeSprite(seed){
    var N = 160, c = mkCanvas(N, N), x = c.getContext('2d'), id = x.createImageData(N, N), d = id.data, rn = mulberry(seed), grid = new Float32Array(4096), yy, xx, i;
    for(i = 0; i < 4096; i++) grid[i] = rn();
    function g(a, b){ return grid[((b & 63) << 6) + (a & 63)]; }
    function vn(px, py){ var xi = Math.floor(px), yi = Math.floor(py), fx = px - xi, fy = py - yi; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); return lerp(lerp(g(xi, yi), g(xi + 1, yi), fx), lerp(g(xi, yi + 1), g(xi + 1, yi + 1), fx), fy); }
    function fbm(px, py){ var sum = 0, a = .5, f = 1; for(var o = 0; o < 5; o++){ sum += a * vn(px * f, py * f); f *= 2; a *= .5; } return sum; }
    for(yy = 0; yy < N; yy++) for(xx = 0; xx < N; xx++){
      var u = (xx / N - .5) * 2, v = (yy / N - .5) * 2, r = Math.sqrt(u * u + v * v), fall = clamp(1 - r, 0, 1); fall = fall * fall * (3 - 2 * fall);
      var n = fbm(xx / N * 4.2 + seed * .13, yy / N * 4.2), n2 = fbm(xx / N * 4.2 + seed * .13 + .22, yy / N * 4.2 + .22);
      var dens = clamp(n * 1.55 - .46, 0, 1) * fall, lit = clamp(.46 + (n - n2) * 11 - v * .22 - u * .12, 0, 1), o = (yy * N + xx) * 4, base = 34 + lit * 118;
      d[o] = base * 1.04; d[o + 1] = base * 1.0; d[o + 2] = base * .93; d[o + 3] = dens * 255;
    }
    x.putImageData(id, 0, 0); c._w = N; c._h = N; return c;
  }
  function buildSprites(){
    spr.foam = glowSprite(40, [[0, 'rgba(255,255,255,.95)'], [.45, 'rgba(235,255,255,.55)'], [1, 'rgba(220,255,255,0)']]);
    spr.gold = glowSprite(96, [[0, 'rgba(255,236,170,.95)'], [.3, 'rgba(255,200,90,.45)'], [1, 'rgba(255,170,40,0)']]);
    spr.star = starSprite(40);
    if(!smokeCache) smokeCache = [];   // filled one sprite per frame while the logo is still whole, so the start stays smooth
    spr.smoke = smokeCache;
    spr.beam = sprite(64, 512, function(x, w, h){ var g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(255,225,150,0)'); g.addColorStop(.5, 'rgba(255,238,185,1)'); g.addColorStop(1, 'rgba(255,225,150,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); x.globalCompositeOperation = 'destination-in'; var v = x.createLinearGradient(0, 0, 0, h); v.addColorStop(0, 'rgba(0,0,0,1)'); v.addColorStop(.7, 'rgba(0,0,0,.25)'); v.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = v; x.fillRect(0, 0, w, h); });
    spr.dot = glowSprite(16, [[0, 'rgba(255,240,190,1)'], [.4, 'rgba(255,200,90,.6)'], [1, 'rgba(255,160,30,0)']]);
    grain = mkCanvas(128, 128); var gx = grain.getContext('2d'), id = gx.createImageData(128, 128), rn = mulberry(7);
    for(var i = 0; i < id.data.length; i += 4){ var v = 110 + rn() * 145; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    gx.putImageData(id, 0, 0);
    layer = mkCanvas(Lw * DPR + 2, Lh * DPR + 2); lctx = layer.getContext('2d');
  }

  /* ------------------------------------------------------------------ crack network and shards (logo space, origin top left) */
  function pip(poly, x, y){ var inside = false; for(var i = 0, j = poly.length - 1; i < poly.length; j = i++){ var a = poly[i], b = poly[j]; if((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside; } return inside; }
  function buildGeometry(){
    var r = mulberry(opts.seed + 11), S_ = opts.lite ? 9 : 11, cxl = Lw * .5, cyl = Lh * .5, base = Lw * .5 * 1.05;
    var rad = [0, .12, .26, .42, .6, .8, 1.05, 1.8].map(function(f){ return f * base; }), K = rad.length - 1;
    var rot = r() * 6.28, V = [];
    for(var k = 0; k <= K; k++){ V[k] = []; for(var j = 0; j < S_; j++){ if(k === 0){ V[k][j] = [cxl, cyl]; continue; } var th = rot + (j + (r() - .5) * .62) * 6.2832 / S_, rk = rad[k] * (1 + (r() - .5) * .16); V[k][j] = [cxl + Math.cos(th) * rk, cyl + Math.sin(th) * rk]; } }
    function edge(a, b){ var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.sqrt(dx * dx + dy * dy); if(len < 1) return [a, b]; var n = len > 70 ? 6 : 4, px = -dy / len, py = dx / len, pts = [a]; for(var i = 1; i < n; i++){ var t = i / n, o = (r() - .5) * len * .17; pts.push([a[0] + dx * t + px * o, a[1] + dy * t + py * o]); } pts.push(b); return pts; }
    var arcs = [], rads = [], edges = [];
    for(k = 0; k <= K; k++){ arcs[k] = []; for(j = 0; j < S_; j++){ arcs[k][j] = edge(V[k][j], V[k][(j + 1) % S_]); } }
    for(k = 0; k < K; k++){ rads[k] = []; for(j = 0; j < S_; j++) rads[k][j] = edge(V[k][j], V[k + 1][j]); }
    for(k = 0; k < K; k++) for(j = 0; j < S_; j++){
      edges.push({ pts:rads[k][j], r0:rad[k], r1:rad[k + 1], jit:(r() - .5) * .05 * base, kind:'r' });
      if(k >= 2 && k < K - 1 && r() < .55) edges.push({ pts:arcs[k][j], r0:rad[k], r1:rad[k + 1], jit:(r() - .5) * .05 * base, kind:'a' });
    }
    var nb = edges.length;                                                // thin forks that split off the main cracks, like real glass
    for(var bi = 0; bi < nb; bi++){
      var pe = edges[bi]; if(pe.kind !== 'r' || r() > .62) continue;
      var mid = pe.pts[(pe.pts.length / 2) | 0], ang = Math.atan2(mid[1] - cyl, mid[0] - cxl) + (r() < .5 ? -1 : 1) * (.4 + r() * .75), len = (16 + r() * 38) * (Lw / 240), px = mid[0], py = mid[1], bp = [mid];
      for(var si = 0; si < 3; si++){ ang += (r() - .5) * .8; px += Math.cos(ang) * len / 3; py += Math.sin(ang) * len / 3; bp.push([px, py]); }
      edges.push({ pts:bp, r0:pe.r0 + (pe.r1 - pe.r0) * .5, r1:pe.r1 + 4, jit:pe.jit, kind:'b' });
    }
    var cells = [];
    for(k = 0; k < K; k++) for(j = 0; j < S_; j++){
      var poly = [].concat(arcs[k][j], rads[k][(j + 1) % S_].slice(1), arcs[k + 1][j].slice().reverse().slice(1), rads[k][j].slice().reverse().slice(1, -1));
      var clean = []; poly.forEach(function(p){ var q = clean[clean.length - 1]; if(!q || Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) > .3) clean.push(p); });
      cells.push({ poly:clean, k:k, n:0, sx:0, sy:0 });
    }
    // which cells hold logo pixels (sampled from the logo's own transparency)
    var gs = 56, sc2 = mkCanvas(gs, gs), sx = sc2.getContext('2d'); sx.drawImage(img, 0, 0, gs, gs);
    var data = sx.getImageData(0, 0, gs, gs).data;
    for(var gy = 0; gy < gs; gy++) for(var gx = 0; gx < gs; gx++){
      if(data[(gy * gs + gx) * 4 + 3] < 40) continue;
      var lx = (gx + .5) / gs * Lw, ly = (gy + .5) / gs * Lh;
      for(var c = 0; c < cells.length; c++){ var cl = cells[c]; if(pip(cl.poly, lx, ly)){ cl.n++; cl.sx += lx; cl.sy += ly; break; } }
    }
    var shards = []; cells.forEach(function(cl){ if(cl.n < 2) return; cl.cx = cl.sx / cl.n; cl.cy = cl.sy / cl.n; shards.push(cl); });
    geo = { edges:edges, shards:shards, cxl:cxl, cyl:cyl, rmax:rad[K - 2] };
  }

  /* ------------------------------------------------------------------ layout */
  function layout(){
    W = VEIL.clientWidth || window.innerWidth; H = VEIL.clientHeight || window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, perf.down ? 1.25 : (opts.lite ? 1.25 : 2));
    cvs.width = Math.round(W * DPR); cvs.height = Math.round(H * DPR); cvs.style.width = W + 'px'; cvs.style.height = H + 'px';
    L = clamp(Math.min(W * .62, H * .42), 150, 390); sc = L / 240; Lw = L; Lh = L * 349 / 360; cx = W / 2; cy = H * .45; B = clamp(W * .44, 200, 560);
    buildSprites(); buildGeometry();
  }

  /* ------------------------------------------------------------------ simulation state */
  function freshState(){
    R = mulberry(opts.seed);
    S = { t:0, items:[], sparks:[], spray:[], smoke:[], smokeAcc:0, dust:[], shards:null, broke:false, held:0, acc:0, rainAcc:0, sparkAcc:0, ready:false, readyAt:-1, bubbles:[], shake:0 };
    for(var i = 0; i < (opts.lite ? 26 : 56); i++) S.dust.push({ x:R() * W, y:R() * H, z:.3 + R() * .9, ph:R() * 6.28, vy:-(4 + R() * 12) * sc, vx:(R() - .5) * 6 });
    for(i = 0; i < 34; i++) S.bubbles.push({ u:R(), y:R() * H, r:1.5 + R() * 4.5, sp:20 + R() * 50, ph:R() * 6.28 });
  }
  function tWave(){ return TL.wave + S.held; }
  /* ------------------------------------------------------------------ update */
  function update(dt){
    var t = S.t += dt, i, p, it;
    if(smokeCache.length < 4 && t > .5) smokeCache.push(smokeSprite(41 + smokeCache.length * 13));
    if(t >= TL.wave + S.held && !S.ready) S.held += dt;                // hold the wave until the first screen exists
    // dust
    S.dust.forEach(function(d){ d.x += d.vx * dt; d.y += d.vy * dt; if(d.y < -10){ d.y = H + 10; d.x = R() * W; } });
    // break
    if(!S.broke && t >= TL.brk){ doBreak(); }
    var vF = 0, wp = 0;
    // sparks (from cracks and from the burst)
    if(!S.broke && t > TL.crack + .5){ var q = clamp((t - TL.crack) / (TL.brk - TL.crack), 0, 1); S.sparkAcc += dt * (4 + q * q * 70); while(S.sparkAcc >= 1){ S.sparkAcc--; crackSpark(q); } }
    if(S.broke && t - TL.brk < 1.3 && !opts.lite){ S.sparkAcc += dt * 120; while(S.sparkAcc >= 1){ S.sparkAcc--; var a = R() * 6.28, s2 = (120 + R() * 700) * sc; S.sparks.push({ x:cx, y:cy, vx:Math.cos(a) * s2, vy:Math.sin(a) * s2 - 160 * sc, life:0, max:.5 + R() * 1.1, s:.5 + R() }); } }
    for(i = S.sparks.length - 1; i >= 0; i--){ var sp = S.sparks[i]; sp.life += dt; sp.vy += 500 * sc * dt; sp.vx -= sp.vx * 1.4 * dt; sp.vy -= sp.vy * .8 * dt; sp.x += sp.vx * dt; sp.y += sp.vy * dt; if(sp.life > sp.max) S.sparks.splice(i, 1); }
    // shards
    if(S.shards){ S.shards.forEach(function(s){ s.age += dt; s.vy += 1150 * sc * dt; s.vx -= s.vx * .7 * dt; s.vy -= s.vy * .35 * dt; s.dx += s.vx * dt; s.dy += s.vy * dt; s.rot += s.om * dt; s.fx += s.fw * dt; }); }
    // smoke: a heavy burst, then a plume that keeps rising and thinning
    if(S.broke){
      var tb2 = t - TL.brk;
      if(tb2 < 1.5){ S.smokeAcc += dt * (opts.lite ? 16 : 30) * (1 - tb2 / 1.7); while(S.smokeAcc >= 1){ S.smokeAcc--; smokePuff(false); } }
    }
    for(i = S.smoke.length - 1; i >= 0; i--){
      var m = S.smoke[i]; m.age += dt; if(m.age > m.max){ S.smoke.splice(i, 1); continue; }
      var drag = m.fire ? 3.2 : 1.5; m.vx -= m.vx * drag * dt; m.vy -= m.vy * drag * dt; if(!m.fire) m.vy -= (26 + m.age * 10) * sc * dt; m.vx += Math.sin(t * 1.3 + m.ph) * 14 * sc * dt;
      m.x += m.vx * dt; m.y += m.vy * dt; m.rot += m.vr * dt;
    }
    S.shake *= Math.pow(.0009, dt);
  }
  function crackSpark(q){
    var e = geo.edges[(R() * geo.edges.length) | 0], pt = e.pts[(R() * e.pts.length) | 0], vis = easeIO(q) * geo.rmax * 1.1;
    var dx = pt[0] - geo.cxl, dy = pt[1] - geo.cyl; if(Math.sqrt(dx * dx + dy * dy) > vis) return;
    var a = Math.atan2(dy, dx) + (R() - .5), s2 = (30 + R() * 120) * sc;
    S.sparks.push({ x:cx - Lw / 2 + pt[0], y:cy - Lh / 2 + pt[1], vx:Math.cos(a) * s2, vy:Math.sin(a) * s2 - 40 * sc, life:0, max:.4 + R() * .7, s:.4 + R() * .7 });
  }
  function shardSprite(c){
    var x0 = Lw, y0 = Lh, x1 = 0, y1 = 0;
    c.poly.forEach(function(p){ x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
    x0 = Math.max(0, Math.floor(x0) - 3); y0 = Math.max(0, Math.floor(y0) - 3); x1 = Math.min(Lw, Math.ceil(x1) + 3); y1 = Math.min(Lh, Math.ceil(y1) + 3);
    var bw = Math.max(2, x1 - x0), bh = Math.max(2, y1 - y0), cv = mkCanvas(bw * DPR, bh * DPR), x = cv.getContext('2d');
    x.scale(DPR, DPR); x.translate(-x0, -y0);
    x.save(); x.beginPath(); c.poly.forEach(function(p, i){ i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]); }); x.closePath(); x.clip(); x.drawImage(img, 0, 0, Lw, Lh); x.restore();
    x.globalCompositeOperation = 'source-atop'; x.beginPath(); c.poly.forEach(function(p, i){ i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]); }); x.closePath();
    var sg = x.createLinearGradient(x0, y0, x1, y1); sg.addColorStop(0, 'rgba(255,255,255,.30)'); sg.addColorStop(.45, 'rgba(255,255,255,0)'); sg.addColorStop(1, 'rgba(0,10,8,.30)'); x.fillStyle = sg; x.fillRect(x0, y0, bw, bh);   // glass sheen
    x.beginPath(); c.poly.forEach(function(p, i){ i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]); }); x.closePath();
    x.lineJoin = 'round'; x.lineWidth = 3; x.strokeStyle = 'rgba(2,6,6,.9)'; x.stroke(); x.lineWidth = 1; x.strokeStyle = 'rgba(235,255,240,.85)'; x.stroke();
    return { cv:cv, x:x0, y:y0, w:bw, h:bh };
  }
  function smokePuff(initial){
    var a = R() * 6.2832, sp = (initial ? 90 + R() * 640 : 30 + R() * 160) * sc, r0 = (initial ? 24 + R() * 44 : 20 + R() * 34) * sc;
    S.smoke.push({ x:cx + Math.cos(a) * R() * L * .12, y:cy + Math.sin(a) * R() * L * .1, vx:Math.cos(a) * sp, vy:Math.sin(a) * sp - (initial ? 40 : 70) * sc, age:0, max:(initial ? 2.2 : 1.8) + R() * 1.6, r0:r0, r1:r0 * (1.7 + R() * 1.3), rot:R() * 6.28, vr:(R() - .5) * .8, ph:R() * 6.28, fire:false, v:(R() * 3) | 0 });
  }
  function boom(){
    var nS = opts.lite ? 22 : 40, nF = opts.lite ? 8 : 14, i;
    for(i = 0; i < nS; i++) smokePuff(true);
    for(i = 0; i < nF; i++){ var a = R() * 6.2832, sp = (160 + R() * 900) * sc, r0 = (28 + R() * 52) * sc; S.smoke.push({ x:cx + (R() - .5) * L * .12, y:cy + (R() - .5) * L * .1, vx:Math.cos(a) * sp, vy:Math.sin(a) * sp, age:0, max:.35 + R() * .55, r0:r0, r1:r0 * 2.1, rot:0, vr:0, ph:R() * 6.28, fire:true, v:0 }); }
  }
  function doBreak(){
    boom();
    S.broke = true; S.shake = 30 * sc;
    S.shards = geo.shards.map(function(c){
      var dx = c.cx - geo.cxl, dy = c.cy - geo.cyl, d = Math.sqrt(dx * dx + dy * dy) + 1, n = d / (Lw * .5), sp = (460 + R() * 820) * sc * (1.25 - Math.min(1, n) * .45);
      var spriteInfo = shardSprite(c);
      return { c:c, sp:spriteInfo, dx:0, dy:0, vx:dx / d * sp + (R() - .5) * 90 * sc, vy:dy / d * sp - (240 + R() * 260) * sc, rot:0, om:(R() - .5) * 8, fx:R() * 6.28, fw:1.5 + R() * 4.5, age:0, k:.9 + R() * .5 };
    });
  }

  /* ------------------------------------------------------------------ drawing */
  function drawBackground(t){
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * .85);
    var lift = S.broke ? .07 * Math.exp(-(t - TL.brk) * .8) : 0;
    g.addColorStop(0, 'rgb(' + Math.round(17 + lift * 255) + ',' + Math.round(98 + lift * 130) + ',' + Math.round(78 + lift * 90) + ')'); g.addColorStop(.28, '#0a4034'); g.addColorStop(.6, '#05261e'); g.addColorStop(1, '#010806');
    ctx.fillStyle = g; ctx.fillRect(-4, -4, W + 8, H + 8);
    // soft beams of light after the break
    if(S.broke && !opts.lite){
      var rt = t - TL.brk, ra = sm(rt / .6) * (1 - sm((rt - 1.8) / 2.6));
      if(ra > .01){
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; var len = Math.max(W, H) * 1.15;
        for(var i = 0; i < 12; i++){ var a = i / 12 * 6.2832 + t * .07 + Math.sin(i * 7.1) * .12, bw = (46 + 70 * frac(Math.sin(i * 12.9) * 4375.5)) * sc * 1.6; ctx.save(); ctx.translate(cx, cy); ctx.rotate(a + Math.PI / 2); ctx.globalAlpha = ra * (.10 + .08 * Math.sin(t * .9 + i * 1.9)); ctx.drawImage(spr.beam, -bw / 2, 0, bw, len); ctx.restore(); }
        ctx.restore();
      }
    }
    // a low golden glow under the logo, like light on a polished floor
    var fg = ctx.createRadialGradient(cx, cy + L * .62, 0, cx, cy + L * .62, L * 1.25), fa2 = Math.min(1, t * .7) * (S.broke ? Math.max(0, 1 - (t - TL.brk) * 1.2) : 1);
    fg.addColorStop(0, 'rgba(255,190,80,' + (.14 * fa2).toFixed(3) + ')'); fg.addColorStop(1, 'rgba(255,170,40,0)'); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H); ctx.restore();
    // dust motes
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    S.dust.forEach(function(d){ var a = (.25 + .35 * Math.sin(t * 1.3 + d.ph)) * d.z * Math.min(1, t * .8); if(a <= .01) return; ctx.globalAlpha = a; var s2 = 5 * d.z * sc + 2; ctx.drawImage(spr.dot, d.x - s2 / 2, d.y - s2 / 2, s2, s2); });
    ctx.restore();
  }
  function maskedLayer(fn){ lctx.setTransform(DPR, 0, 0, DPR, 0, 0); lctx.globalCompositeOperation = 'source-over'; lctx.clearRect(0, 0, layer.width / DPR + 2, layer.height / DPR + 2); fn(lctx); lctx.globalCompositeOperation = 'destination-in'; lctx.drawImage(img, 0, 0, Lw, Lh); lctx.globalCompositeOperation = 'source-over'; }
  function putLayer(mode, alpha){ ctx.save(); ctx.globalCompositeOperation = mode || 'source-over'; ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.drawImage(layer, 0, 0, layer.width / DPR, layer.height / DPR); ctx.restore(); }

  function drawCracks(front, q){
    var edges = geo.edges, tiers = [[], [], []];
    edges.forEach(function(e){
      var prog = e.kind === 'r' ? (front - (e.r0 + e.jit)) / ((e.r1 - e.r0) * .95) : (front - (e.r0 + e.jit)) / ((e.r1 - e.r0) * .7);
      prog = clamp(prog, 0, 1); if(prog <= 0) return;
      var n = e.pts.length - 1, upto = prog * n, whole = Math.floor(upto), part = upto - whole, pts = [];
      for(var i = 0; i <= whole && i <= n; i++) pts.push(e.pts[i]);
      if(whole < n){ var a = e.pts[whole], b = e.pts[whole + 1]; pts.push([a[0] + (b[0] - a[0]) * part, a[1] + (b[1] - a[1]) * part]); }
      var mp = e.pts[(e.pts.length / 2) | 0], dx = mp[0] - geo.cxl, dy = mp[1] - geo.cyl, rr2 = Math.sqrt(dx * dx + dy * dy) || 1, cc = (dx + dy) / (rr2 * 1.4142);
      pts.flag = Math.abs(cc) < .34 ? 1 : (cc < 0 ? 0 : 2);      // 0 blue (upper left), 1 red (the diagonal band), 2 green (lower right): the flag of Namibia
      tiers[e.kind === 'b' ? 2 : (e.r0 < geo.rmax * .42 ? 0 : 1)].push(pts);
    });
    var W3 = [3.1 * sc, 2.1 * sc, 1.25 * sc], FLAG = ['#1b5fe0', '#e5173f', '#10b35b'];
    function stroke(c, list, w, col, blur, bc){
      if(!list.length) return;
      c.beginPath(); list.forEach(function(pts){ c.moveTo(pts[0][0], pts[0][1]); for(var i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); });
      c.lineWidth = w; c.strokeStyle = col; c.lineJoin = 'round'; c.lineCap = 'round'; if(blur){ c.shadowColor = bc; c.shadowBlur = blur; } else { c.shadowBlur = 0; c.shadowColor = 'transparent'; } c.stroke(); c.shadowBlur = 0;
    }
    function ofFlag(list, f){ return list.filter(function(pts){ return pts.flag === f; }); }
    maskedLayer(function(c){
      // the sun's warm light leaking out of the deepest cracks as the glass is about to give way
      if(q > .45){ c.globalCompositeOperation = 'lighter'; [0, 1].forEach(function(k){ stroke(c, tiers[k], W3[k] * 2.4, 'rgba(255,200,40,' + (.26 * sm((q - .45) / .5)).toFixed(3) + ')', 9 * sc, 'rgba(255,190,30,.9)'); }); c.globalCompositeOperation = 'source-over'; }
      for(var k = 2; k >= 0; k--){
        stroke(c, tiers[k], W3[k] * 2.4, 'rgba(0,0,0,.45)', 4 * sc, 'rgba(0,0,0,.9)');           // dark depth so every colour stays crisp on the glass
        for(var f = 0; f < 3; f++){
          var L2 = ofFlag(tiers[k], f);
          stroke(c, L2, W3[k] * 1.25, 'rgba(2,6,10,.95)');                                          // thin black edge
          stroke(c, L2, W3[k], FLAG[f]);                                                            // the flag colour
          c.save(); c.translate(.6 * sc, .8 * sc); stroke(c, L2, Math.max(.45, W3[k] * .3), f === 1 ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.5)'); c.restore();   // white lip, like the white edges of the flag band
        }
      }
    });
    putLayer('source-over', 1);
  }

  function drawLogoWhole(t){
    var a = easeOut((t - TL.logoIn) / 1.25); if(a <= 0) return;
    var q = clamp((t - TL.crack) / (TL.brk - TL.crack), 0, 1), trem = q * q;
    var scale = lerp(.84, 1, easeOutBack((t - TL.logoIn) / 1.4)) * (1 + .012 * Math.sin(t * 1.5)) * (1 + .05 * q);
    var ox = 0, oy = lerp(18 * sc, 0, easeOut((t - TL.logoIn) / 1.4)), rot = 0;
    if(q > 0){ var f = 26 + q * 30; ox = Math.sin(t * f) * 3.6 * sc * trem + Math.sin(t * f * 1.7 + 1) * 1.6 * sc * trem; oy += Math.cos(t * f * 1.3) * 3.2 * sc * trem; rot = Math.sin(t * f * .9) * .016 * trem; }
    // halo
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    var halo = (.5 + .12 * Math.sin(t * 1.9)) * a * (1 + q * .25), hs = L * (2.0 + q * .5);
    ctx.globalAlpha = Math.min(1, halo); ctx.drawImage(spr.gold, cx - hs / 2, cy - hs / 2, hs, hs);
    ctx.restore();
    if(q < .6){      // soft mirror image on the floor, fading downwards
      lctx.setTransform(DPR, 0, 0, DPR, 0, 0); lctx.globalCompositeOperation = 'source-over'; lctx.clearRect(0, 0, layer.width / DPR + 2, layer.height / DPR + 2); lctx.drawImage(img, 0, 0, Lw, Lh);
      lctx.globalCompositeOperation = 'destination-in'; var rg = lctx.createLinearGradient(0, Lh * .45, 0, Lh); rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(0,0,0,.9)'); lctx.fillStyle = rg; lctx.fillRect(0, 0, Lw, Lh); lctx.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.globalAlpha = .17 * a * (1 - q / .6); ctx.translate(cx + ox, cy + oy + Lh * scale + 5 * sc); ctx.scale(scale, -scale); ctx.translate(-Lw / 2, -Lh / 2); ctx.drawImage(layer, 0, 0, layer.width / DPR, layer.height / DPR); ctx.restore();
    }
    ctx.save(); ctx.translate(cx + ox, cy + oy); ctx.rotate(rot); ctx.scale(scale, scale); ctx.translate(-Lw / 2, -Lh / 2);
    ctx.globalAlpha = a;
    ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 26 * sc; ctx.shadowOffsetY = 12 * sc; ctx.drawImage(img, 0, 0, Lw, Lh); ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    // shimmer sweep
    var sh = (t - TL.shimmer) / .75;
    if(sh > 0 && sh < 1){
      maskedLayer(function(c){ var bx = lerp(-Lw * .5, Lw * 1.5, easeIO(sh)), g = c.createLinearGradient(bx - Lw * .22, 0, bx + Lw * .22, Lh * .6); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, Lw, Lh); });
      putLayer('lighter', .75 * a);
    }
    // light building up inside the glass, then the cracks
    if(q > 0){
      var front = easeIO(q * 1.02) * geo.rmax * 1.12;
      maskedLayer(function(c){ var r = Math.max(8, front * 1.25 + 30 * sc), g = c.createRadialGradient(geo.cxl, geo.cyl, 0, geo.cxl, geo.cyl, r); g.addColorStop(0, 'rgba(255,248,210,' + (.95 * q) + ')'); g.addColorStop(.4, 'rgba(255,205,100,' + (.6 * q) + ')'); g.addColorStop(1, 'rgba(255,160,40,0)'); c.fillStyle = g; c.fillRect(0, 0, Lw, Lh); });
      putLayer('lighter', .9);
      drawCracks(front, q);
    }
    ctx.restore();
  }

  function drawShards(t){
    if(!S.shards) return;
    S.shards.forEach(function(s){
      var fade = 1 - sm((s.age - .5) / 1.9); if(fade <= .01) return;
      var c = s.c, fl = Math.cos(s.fx), sx = .55 + .45 * Math.abs(fl), sy = .55 + .45 * Math.abs(Math.sin(s.fx * .8 + 1)), z = 1 + .3 * easeOut(s.age / 1.6) * s.k, sp = s.sp;
      ctx.save(); ctx.globalAlpha = fade * (.72 + .28 * Math.abs(fl));
      ctx.translate(cx - Lw / 2 + c.cx + s.dx, cy - Lh / 2 + c.cy + s.dy); ctx.rotate(s.rot); ctx.scale(sx * z, sy * z);
      ctx.drawImage(sp.cv, sp.x - c.cx, sp.y - c.cy, sp.w, sp.h);
      ctx.restore();
    });
  }

  function drawBurstFX(t){
    if(!S.broke) return; var rt = t - TL.brk;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    var fa = .36 * Math.pow(clamp(1 - rt / .55, 0, 1), 1.8);
    if(fa > .01){ var fr = Math.max(W, H) * (.22 + rt * .9), g = ctx.createRadialGradient(cx, cy, 0, cx, cy, fr); g.addColorStop(0, 'rgba(255,244,205,' + fa + ')'); g.addColorStop(.3, 'rgba(255,176,70,' + (fa * .75) + ')'); g.addColorStop(1, 'rgba(230,90,20,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    var ringR = easeOut(rt / 1.7) * Math.max(W, H) * .95, ra = Math.pow(clamp(1 - rt / 1.7, 0, 1), 1.6);
    if(ra > .01){ ctx.lineWidth = (2 + 12 * ra) * sc; var rg = ctx.createRadialGradient(cx, cy, Math.max(0, ringR - 30 * sc), cx, cy, ringR + 30 * sc); rg.addColorStop(0, 'rgba(255,220,130,0)'); rg.addColorStop(.5, 'rgba(255,240,190,' + (.45 * ra) + ')'); rg.addColorStop(1, 'rgba(255,200,90,0)'); ctx.strokeStyle = rg; ctx.beginPath(); ctx.arc(cx, cy, ringR, 0, 6.2832); ctx.stroke(); }
    var sa = Math.pow(clamp(1 - rt / 1.1, 0, 1), 1.2);
    if(sa > .01){ ctx.save(); ctx.translate(cx, cy); ctx.scale(1, .022 + .03 * sa); var sg = ctx.createRadialGradient(0, 0, 0, 0, 0, W * .95); sg.addColorStop(0, 'rgba(255,250,225,' + sa + ')'); sg.addColorStop(.25, 'rgba(255,230,160,' + (sa * .55) + ')'); sg.addColorStop(1, 'rgba(255,210,120,0)'); ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(0, 0, W * .95, 0, 6.2832); ctx.fill(); ctx.restore(); }
    ctx.restore();
  }

  function drawSmoke(t){
    if(!S.smoke.length) return;
    S.smoke.forEach(function(m){
      var u = m.age / m.max, r = lerp(m.r0, m.r1, easeOut(u));
      if(m.fire){ ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.pow(1 - u, 1.8) * .2; ctx.drawImage(spr.gold, m.x - r * 1.1, m.y - r * 1.1, r * 2.2, r * 2.2); ctx.restore(); return; }
      var a = Math.min(1, m.age / .15) * Math.pow(1 - sm(u), 1.3) * .62;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(m.x, m.y); ctx.rotate(m.rot); ctx.drawImage(spr.smoke[m.v], -r, -r, r * 2, r * 2); ctx.restore();
      if(m.age < .9){ ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - m.age / .9) * .3; ctx.drawImage(spr.gold, m.x - r * 1.1, m.y - r * 1.1, r * 2.2, r * 2.2); ctx.restore(); }
    });
  }
  function drawSparks(){
    if(!S.sparks.length) return; ctx.save(); ctx.globalCompositeOperation = 'lighter';
    S.sparks.forEach(function(s){ var a = 1 - s.life / s.max; ctx.globalAlpha = a; var r = (3 + 8 * s.s) * sc * (.5 + a * .5); ctx.drawImage(spr.dot, s.x - r, s.y - r, r * 2, r * 2); });
    ctx.restore();
  }

  function drawGrain(t){
    if(opts.lite || perf.down) return; ctx.save(); ctx.globalAlpha = .045; ctx.globalCompositeOperation = 'overlay';
    var pat = ctx.createPattern(grain, 'repeat'); ctx.translate(Math.floor(frac(t * 7.3) * 128), Math.floor(frac(t * 11.7) * 128)); ctx.fillStyle = pat; ctx.fillRect(-128, -128, W + 256, H + 256); ctx.restore();
  }

  function tagText(t){
    if(!tagline) return;
    var a = sm((t - 1.0) / .9) * (1 - sm((t - (TL.crack + .7)) / .7));
    tagline.style.opacity = a.toFixed(3); tagline.style.transform = 'translateY(' + ((1 - a) * 8).toFixed(1) + 'px)';
    tagline.style.top = Math.round(cy + Lh / 2 + 24 * sc) + 'px';
    if(hint) hint.style.opacity = (sm((t - 1.3) / .8) * (1 - sm((t - TL.wave) / .6)) * .6).toFixed(3);
  }

  function draw(dt){
    var t = S.t;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.save();
    if(S.shake > .2) ctx.translate((R() - .5) * S.shake, (R() - .5) * S.shake);
    drawBackground(t);
    drawSmoke(t);
    if(!S.broke) drawLogoWhole(t); else drawShards(t);
    drawGrain(t);
    ctx.restore();
    drawBurstFX(t);
    drawSparks();
    var fo = 1 - sm((t - tWave()) / TL.waveDur); cvs.style.opacity = fo.toFixed(3);
    if(wtext){ var wi = sm((t - (TL.brk + 1.7)) / 1.1); wtext.style.opacity = Math.min(wi, fo).toFixed(3); wtext.style.top = Math.round(cy - wtext.offsetHeight / 2) + 'px'; wtext.style.transform = 'scale(' + (0.94 + 0.06 * wi).toFixed(3) + ')'; }
    tagText(t);
  }

  /* ------------------------------------------------------------------ the simple version (reduced motion): the logo fades in and out */
  function drawSimple(t){
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
    var a = sm(t / .6) * (1 - sm((t - 1.5) / .6)), bg = 1 - sm((t - 1.7) / .5);
    ctx.globalAlpha = bg; ctx.fillStyle = '#06251d'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = a * bg; ctx.drawImage(img, cx - Lw / 2, cy - Lh / 2, Lw, Lh); ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------------ run loop */
  function firstScreenReady(){
    try{
      var app = document.getElementById('app'), au = document.getElementById('authScreen');
      if(app && getComputedStyle(app).display !== 'none') return true;
      if(au && getComputedStyle(au).display !== 'none' && au.textContent.indexOf('Loading') < 0 && au.children.length) return true;
    }catch(e){}
    return false;
  }
  function finish(fast){
    if(done) return; done = true; cancelAnimationFrame(raf);
    window.removeEventListener('pointerdown', onSkip, true); window.removeEventListener('keydown', onSkip, true);
    try{ sessionStorage.setItem('pesa_intro_seen', '1'); }catch(e){}
    VEIL.style.pointerEvents = 'none'; VEIL.style.transition = 'opacity ' + (fast ? .45 : .25) + 's ease'; VEIL.style.opacity = '0';
    setTimeout(function(){ try{ VEIL.parentNode.removeChild(VEIL); }catch(e){} document.documentElement.classList.remove('intro-on'); try{ window.dispatchEvent(new Event('pesa:intro-done')); }catch(e){} }, fast ? 480 : 300);
  }
  function onSkip(e){ if(e && e.type === 'keydown' && ['Shift', 'Control', 'Alt', 'Meta', 'Tab'].indexOf(e.key) > -1) return; finish(true); }
  function frame(now){
    if(done) return;
    try{ frame2(now); }catch(e){ try{ console.error('intro frame failed', e && e.stack || e); }catch(x){} finish(true); }
  }
  function frame2(now){
    var dt = last ? Math.min(.05, (now - last) / 1000) : .016; last = now;
    var s0 = performance.now();
    if(!S.ready && now - (S.lastReadyCheck || 0) > 200){ S.lastReadyCheck = now; S.ready = firstScreenReady(); }
    if(opts.simple){ S.t += dt; drawSimple(S.t); if(S.t > 2.3) return finish(false); }
    else {
      update(dt); draw(dt);
      var endT = tWave() + TL.waveDur * 1.02; if(S.t > endT) return finish(false);
      if(S.t > 1.2 && !perf.down){ perf.n++; perf.sum += performance.now() - s0 + 0; if(perf.n === 50){ if(perf.sum / perf.n > 14 && DPR > 1.3){ perf.down = true; layout(); } } }
    }
    raf = requestAnimationFrame(frame);
  }

  function seek(t){                                                  // deterministic still frames for review
    freshState(); S.ready = true; var step = 1 / 60; while(S.t < t - 1e-6){ update(Math.min(step, t - S.t)); }
    if(opts.simple) drawSimple(t); else draw(step);
  }

  function start(o){
    o = o || {}; VEIL = document.getElementById('introVeil'); if(!VEIL) return; window.__introStarted = true; try{ sessionStorage.setItem('pesa_intro_seen', '1'); }catch(e){}
    var lite = /\blite\b/.test(document.documentElement.className), reduce = false;
    try{ reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){}
    if(/[?&]introLite=0/.test(location.search)) lite = false;
    opts.lite = lite; opts.simple = !!reduce && !o.noReduce;
    var q = /[?&]introT=([\d.]+)/.exec(location.search); opts.still = q ? parseFloat(q[1]) : null;
    img = new Image();
    img.onload = function(){
      var go = function(){ try{ go2(); }catch(e){ try{ console.error('intro failed', e && e.stack || e); }catch(x){} finish(true); } };
      var go2 = function(){
        cvs = document.createElement('canvas'); cvs.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;display:block'; ctx = cvs.getContext('2d'); VEIL.appendChild(cvs);
        VEIL.style.background = 'transparent';
        tagline = document.createElement('div'); tagline.textContent = 'Your Mula, Your Pride'; tagline.style.cssText = 'position:absolute;left:0;right:0;text-align:center;font:italic 600 17px/1.2 Georgia,"Times New Roman",serif;letter-spacing:.04em;color:rgba(255,226,150,.95);text-shadow:0 2px 12px rgba(0,0,0,.6);opacity:0;pointer-events:none'; VEIL.appendChild(tagline);
        wtext = document.createElement('div'); wtext.innerHTML = '<img alt="Welcome to Pesa Namibia" style="display:block;margin:0 auto;width:min(100%,900px);height:auto;filter:contrast(1.3) saturate(1.1);-webkit-mask-image:radial-gradient(ellipse 66% 64% at 50% 50%,#000 62%,transparent 100%),linear-gradient(to bottom,transparent,#000 22%,#000 78%,transparent),linear-gradient(to right,transparent,#000 12%,#000 88%,transparent);-webkit-mask-composite:source-in,source-in;mask-image:radial-gradient(ellipse 66% 64% at 50% 50%,#000 62%,transparent 100%),linear-gradient(to bottom,transparent,#000 22%,#000 78%,transparent),linear-gradient(to right,transparent,#000 12%,#000 88%,transparent);mask-composite:intersect,intersect">'; wtext.firstChild.src = (typeof PESA_WELCOME_DATA_URL !== 'undefined' ? PESA_WELCOME_DATA_URL : img.src); wtext.style.cssText = 'position:absolute;left:0;right:0;text-align:center;opacity:0;pointer-events:none;mix-blend-mode:screen'; VEIL.appendChild(wtext);
        hint = document.createElement('div'); hint.textContent = (typeof tr === 'function') ? tr('Tap to skip') : 'Tap to skip'; hint.style.cssText = 'position:absolute;left:0;right:0;bottom:calc(22px + env(safe-area-inset-bottom,0px));text-align:center;font:600 12.5px/1 system-ui,sans-serif;letter-spacing:.06em;color:rgba(255,255,255,.8);opacity:0;pointer-events:none'; VEIL.appendChild(hint);
        layout(); freshState();
        window.addEventListener('resize', function(){ if(!done){ layout(); } });
        if(opts.still != null){ seek(opts.still); window.__introReady = true; return; }
        window.addEventListener('pointerdown', onSkip, true); window.addEventListener('keydown', onSkip, true);
        setTimeout(function(){ finish(true); }, 30000);                     // never trap the app behind the animation
        raf = requestAnimationFrame(frame);
      };
      (img.decode ? img.decode().then(go, go) : go());
    };
    img.onerror = function(){ finish(true); };
    img.src = o.logo || PESA_LOGO_DATA_URL;
  }
  return { start:start, seek:seek, finish:finish, TL:TL };
})();
