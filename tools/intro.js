/* ============================== OPENING ANIMATION ==============================
   Plays once each time Pesa starts: the glass P appears, shakes, cracks open and breaks; N$ notes and coins pour out and
   rain down; a wall of water sweeps the money away and washes the welcome page into view.
   Everything is drawn with the canvas (no files, no libraries). Tap or press any key to skip.
   Test hooks: ?intro=force plays even in automated browsers; ?intro=force&introT=4.5 draws one still frame at 4.5 s. */
var PesaIntro = (function(){
  'use strict';
  var TL = { logoIn:0.35, shimmer:1.55, crack:2.15, brk:4.05, wave:7.3, waveDur:3.3 };   // seconds
  var VEIL = null, cvs = null, ctx = null, img = null;
  var W = 0, H = 0, DPR = 1, L = 240, sc = 1, cx = 0, cy = 0, Lw = 240, Lh = 233, B = 200;
  var spr = {}, geo = null, layer = null, lctx = null, grain = null;
  var S = null;                                             // simulation state
  var opts = { lite:false, simple:false, still:null, seed:20261004 };
  var raf = 0, last = 0, done = false, hint = null, tagline = null, perf = { n:0, sum:0, down:false };

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
  var PAL = [
    { c:['#0c5a47', '#1d9a76', '#8ff0c4'], d:'10' }, { c:['#0b5361', '#1a93a6', '#92e8f2'], d:'20' }, { c:['#8d5d0c', '#dca022', '#ffe28f'], d:'50' },
    { c:['#9a3a0d', '#ec7a26', '#ffc995'], d:'100' }, { c:['#093a30', '#157a62', '#c4f7e2'], d:'200' }
  ];
  function drawNote(x, w, h, pal, pad){
    x.save(); x.translate(pad, pad);
    x.shadowColor = 'rgba(0,0,0,.5)'; x.shadowBlur = 7; x.shadowOffsetY = 2.5;
    rr(x, 0, 0, w, h, 5); var g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, pal.c[1]); g.addColorStop(.5, pal.c[0]); g.addColorStop(1, pal.c[1]); x.fillStyle = g; x.fill();
    x.shadowColor = 'transparent'; x.shadowBlur = 0; x.shadowOffsetY = 0;
    x.save(); rr(x, 0, 0, w, h, 5); x.clip();
    for(var i = 0; i < 20; i++){                               // fine wave engraving
      x.beginPath();
      for(var px = 0; px <= w; px += 2){ var y = h * (i + .5) / 20 + Math.sin(px * .085 + i * .55) * h * .05 * (1 + Math.sin(px * .028 + i)); px === 0 ? x.moveTo(px, y) : x.lineTo(px, y); }
      x.strokeStyle = i % 2 ? 'rgba(255,255,255,.11)' : 'rgba(0,0,0,.10)'; x.lineWidth = .6; x.stroke();
    }
    [[w * .17, h * .5], [w * .83, h * .5]].forEach(function(p){ for(var r = 4; r < h * .42; r += 2.6){ x.beginPath(); x.arc(p[0], p[1], r, 0, 6.2832); x.strokeStyle = 'rgba(255,255,255,.13)'; x.lineWidth = .55; x.stroke(); } });
    var mg = x.createRadialGradient(w * .5, h * .46, 1, w * .5, h * .5, h * .38); mg.addColorStop(0, pal.c[2]); mg.addColorStop(1, pal.c[1]);
    x.beginPath(); x.arc(w * .5, h * .5, h * .33, 0, 6.2832); x.fillStyle = mg; x.globalAlpha = .9; x.fill(); x.globalAlpha = 1;
    x.lineWidth = 1.1; x.strokeStyle = 'rgba(255,255,255,.7)'; x.stroke();
    x.beginPath(); x.arc(w * .5, h * .5, h * .27, 0, 6.2832); x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = .7; x.stroke();
    x.textAlign = 'center'; x.fillStyle = 'rgba(8,40,32,.92)'; x.font = '700 ' + Math.round(h * .12) + 'px system-ui, sans-serif'; x.fillText('N$', w * .5, h * .41);
    x.font = '800 ' + Math.round(h * .24) + 'px system-ui, sans-serif'; x.fillText(pal.d, w * .5, h * .66);
    x.font = '800 ' + Math.round(h * .12) + 'px system-ui, sans-serif'; x.fillStyle = 'rgba(255,255,255,.88)'; x.textAlign = 'left'; x.fillText(pal.d, 6, h * .22); x.textAlign = 'right'; x.fillText(pal.d, w - 6, h * .92);
    var sg = x.createLinearGradient(0, 0, 0, h); sg.addColorStop(0, 'rgba(255,240,170,.85)'); sg.addColorStop(.5, 'rgba(255,255,255,.55)'); sg.addColorStop(1, 'rgba(255,225,130,.85)'); x.fillStyle = sg; x.fillRect(w * .74, 0, 3.4, h);
    var sh = x.createLinearGradient(0, 0, w * .9, h * 1.3); sh.addColorStop(0, 'rgba(255,255,255,.34)'); sh.addColorStop(.42, 'rgba(255,255,255,.05)'); sh.addColorStop(.43, 'rgba(255,255,255,0)'); x.fillStyle = sh; x.fillRect(0, 0, w, h);
    x.restore();
    rr(x, .5, .5, w - 1, h - 1, 5); x.strokeStyle = 'rgba(255,255,255,.45)'; x.lineWidth = 1; x.stroke(); rr(x, 3.5, 3.5, w - 7, h - 7, 3); x.strokeStyle = 'rgba(255,255,255,.22)'; x.stroke();
    x.restore();
  }
  function drawCoin(x, d, pad){
    var r = d / 2, c = r + pad;
    x.save(); x.shadowColor = 'rgba(0,0,0,.5)'; x.shadowBlur = 6; x.shadowOffsetY = 2;
    var g = x.createRadialGradient(c - r * .35, c - r * .4, r * .1, c, c, r); g.addColorStop(0, '#fff6c2'); g.addColorStop(.45, '#f7c948'); g.addColorStop(.85, '#c4881a'); g.addColorStop(1, '#8c5c0b');
    x.beginPath(); x.arc(c, c, r, 0, 6.2832); x.fillStyle = g; x.fill(); x.restore();
    x.beginPath(); x.arc(c, c, r * .86, 0, 6.2832); x.strokeStyle = 'rgba(120,70,0,.55)'; x.lineWidth = 1.2; x.stroke();
    x.beginPath(); x.arc(c, c, r * .8, 0, 6.2832); x.strokeStyle = 'rgba(255,245,190,.7)'; x.lineWidth = .8; x.stroke();
    x.setLineDash([1.2, 2.4]); x.beginPath(); x.arc(c, c, r * .93, 0, 6.2832); x.strokeStyle = 'rgba(100,55,0,.5)'; x.lineWidth = 1; x.stroke(); x.setLineDash([]);
    x.textAlign = 'center'; x.font = '800 ' + Math.round(r * .78) + 'px system-ui, sans-serif';
    x.fillStyle = 'rgba(110,64,0,.75)'; x.fillText('N$', c + .8, c + r * .28 + .8); x.fillStyle = 'rgba(255,248,205,.95)'; x.fillText('N$', c, c + r * .28);
    x.beginPath(); x.arc(c, c, r * .96, Math.PI * 1.05, Math.PI * 1.6); x.strokeStyle = 'rgba(255,255,255,.75)'; x.lineWidth = 1.6; x.lineCap = 'round'; x.stroke();
  }
  function glowSprite(size, stops){ return sprite(size, size, function(x, w){ var g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); stops.forEach(function(s){ g.addColorStop(s[0], s[1]); }); x.fillStyle = g; x.fillRect(0, 0, w, w); }); }
  function starSprite(size){
    return sprite(size, size, function(x, w){
      var c = w / 2, g = x.createRadialGradient(c, c, 0, c, c, c); g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(.18, 'rgba(255,232,150,.55)'); g.addColorStop(1, 'rgba(255,200,80,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w);
      x.fillStyle = 'rgba(255,255,240,.95)'; x.beginPath(); x.moveTo(c, 0); x.quadraticCurveTo(c + 1.2, c - 1.2, w, c); x.quadraticCurveTo(c + 1.2, c + 1.2, c, w); x.quadraticCurveTo(c - 1.2, c + 1.2, 0, c); x.quadraticCurveTo(c - 1.2, c - 1.2, c, 0); x.fill();
    });
  }
  function buildSprites(){
    var nw = L * .5, nh = nw * .5, pad = 9, cd = L * .15;
    spr.notes = PAL.map(function(p){ var s = sprite(nw + pad * 2, nh + pad * 2, function(x){ drawNote(x, nw, nh, p, pad); }); s._cw = nw; s._ch = nh; return s; });
    spr.coin = sprite(cd + 16, cd + 16, function(x){ drawCoin(x, cd, 8); }); spr.coin._cw = cd; spr.coin._ch = cd;
    spr.foam = glowSprite(40, [[0, 'rgba(255,255,255,.95)'], [.45, 'rgba(235,255,255,.55)'], [1, 'rgba(220,255,255,0)']]);
    spr.gold = glowSprite(96, [[0, 'rgba(255,236,170,.95)'], [.3, 'rgba(255,200,90,.45)'], [1, 'rgba(255,170,40,0)']]);
    spr.star = starSprite(40);
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
    S = { t:0, items:[], sparks:[], spray:[], dust:[], shards:null, broke:false, held:0, acc:0, rainAcc:0, sparkAcc:0, ready:false, readyAt:-1, bubbles:[], shake:0 };
    for(var i = 0; i < (opts.lite ? 26 : 56); i++) S.dust.push({ x:R() * W, y:R() * H, z:.3 + R() * .9, ph:R() * 6.28, vy:-(4 + R() * 12) * sc, vx:(R() - .5) * 6 });
    for(i = 0; i < 34; i++) S.bubbles.push({ u:R(), y:R() * H, r:1.5 + R() * 4.5, sp:20 + R() * 50, ph:R() * 6.28 });
  }
  function tWave(){ return TL.wave + S.held; }
  function mkItem(kind, x, y, vx, vy, burst){
    var z = .72 + R() * .6, it = { kind:kind, x:x, y:y, vx:vx, vy:vy, rot:(R() - .5) * 2.6, vr:(R() - .5) * (burst ? 7 : 3), phX:R() * 6.28, wX:(kind === 'coin' ? 6 : 3.4) + R() * 5, phY:R() * 6.28, wY:1.2 + R() * 2.6,
      z:z, v:(R() * PAL.length) | 0, sp:R() * 6.28, swept:false, a:1, drift:R() * 6.28 };
    S.items.push(it); return it;
  }
  function burstItem(){
    var coin = R() < .5, ang = -Math.PI / 2 + (R() - .5) * 3.5, sp = (380 + R() * 760) * sc * (coin ? .95 : 1);
    mkItem(coin ? 'coin' : 'note', cx + (R() - .5) * L * .18, cy + (R() - .5) * L * .1, Math.cos(ang) * sp, Math.sin(ang) * sp, true);
  }
  function rainItem(){
    var coin = R() < .38; mkItem(coin ? 'coin' : 'note', R() * (W + 80) - 40, -40 * sc, (R() - .5) * 50 * sc, (110 + R() * 90) * sc, false);
  }

  /* ------------------------------------------------------------------ wave geometry */
  function waveP(t){ return clamp((t - tWave()) / TL.waveDur, 0, 1.2); }
  function frontBase(p){ return lerp(-B * .55, W + B * 1.25 + W * .06, easeIO(Math.min(1, p))); }
  function frontX(y, t, p){ return frontBase(p) + W * .034 * Math.sin(y * .0105 + t * 2.1) + W * .016 * Math.sin(y * .026 - t * 3.0) + (y / H - .5) * W * .09; }
  function trailX(y, t, p){ return frontX(y, t, p) - B * (.92 + .09 * Math.sin(y * .006 + t * 1.3)) - W * .03 * Math.sin(y * .02 + t * 2.4); }

  /* ------------------------------------------------------------------ update */
  function update(dt){
    var t = S.t += dt, i, p, it;
    if(t >= TL.wave + S.held && !S.ready) S.held += dt;                // hold the wave until the first screen exists
    // dust
    S.dust.forEach(function(d){ d.x += d.vx * dt; d.y += d.vy * dt; if(d.y < -10){ d.y = H + 10; d.x = R() * W; } });
    // break
    if(!S.broke && t >= TL.brk){ doBreak(); }
    // money
    if(S.broke){
      var tb = t - TL.brk, cap = opts.lite ? 110 : 230;
      if(tb < 1.05){ S.acc += dt * (opts.lite ? 70 : 150) * (1 - tb / 1.4); while(S.acc >= 1 && S.items.length < cap){ burstItem(); S.acc--; } }
      if(t < tWave() + .4 && tb > .7){ S.rainAcc += dt * (opts.lite ? 24 : 58) * sm((tb - .4) / .6); while(S.rainAcc >= 1 && S.items.length < cap){ rainItem(); S.rainAcc--; } }
    }
    var wp = waveP(t), vF = (W + B * 1.6) / TL.waveDur * 1.35;
    for(i = S.items.length - 1; i >= 0; i--){
      it = S.items[i];
      var g = (it.kind === 'coin' ? 520 : 400) * sc, k = it.kind === 'coin' ? 1.55 : 2.5;
      if(!it.swept){
        it.vx += Math.sin(t * 1.7 + it.drift) * 36 * sc * dt; it.vy += g * dt; it.vx -= it.vx * k * dt * .55; it.vy -= it.vy * k * dt;
        if(wp > 0){ var xf = frontX(it.y, t, wp); if(xf + 16 * sc * it.z >= it.x){ it.swept = true; it.vr += (R() - .5) * 8; } }
      } else {
        var tx = vF * (1.02 + .1 * Math.sin(it.drift + t)), ty = -70 * sc + Math.sin(it.y * .02 + t * 3.1 + it.drift) * 150 * sc;
        it.vx += (tx - it.vx) * Math.min(1, dt * 4.2); it.vy += (ty - it.vy) * Math.min(1, dt * 2.2); it.wX += dt * 2; it.vr += (Math.sin(t * 3 + it.drift) * 4 - it.vr) * dt;
      }
      it.x += it.vx * dt; it.y += it.vy * dt; it.rot += it.vr * dt; it.phX += it.wX * dt; it.phY += it.wY * dt;
      if(it.y > H + 60 * sc || it.x > W + 160 * sc || it.x < -260 * sc || (it.y < -300 * sc && it.vy < 0 && it.swept)) S.items.splice(i, 1);
    }
    // sparks (from cracks and from the burst)
    if(!S.broke && t > TL.crack + .5){ var q = clamp((t - TL.crack) / (TL.brk - TL.crack), 0, 1); S.sparkAcc += dt * (4 + q * q * 70); while(S.sparkAcc >= 1){ S.sparkAcc--; crackSpark(q); } }
    if(S.broke && t - TL.brk < 1.3 && !opts.lite){ S.sparkAcc += dt * 120; while(S.sparkAcc >= 1){ S.sparkAcc--; var a = R() * 6.28, s2 = (120 + R() * 700) * sc; S.sparks.push({ x:cx, y:cy, vx:Math.cos(a) * s2, vy:Math.sin(a) * s2 - 160 * sc, life:0, max:.5 + R() * 1.1, s:.5 + R() }); } }
    for(i = S.sparks.length - 1; i >= 0; i--){ var sp = S.sparks[i]; sp.life += dt; sp.vy += 500 * sc * dt; sp.vx -= sp.vx * 1.4 * dt; sp.vy -= sp.vy * .8 * dt; sp.x += sp.vx * dt; sp.y += sp.vy * dt; if(sp.life > sp.max) S.sparks.splice(i, 1); }
    // shards
    if(S.shards){ S.shards.forEach(function(s){ s.age += dt; s.vy += 1150 * sc * dt; s.vx -= s.vx * .7 * dt; s.vy -= s.vy * .35 * dt; s.dx += s.vx * dt; s.dy += s.vy * dt; s.rot += s.om * dt; s.fx += s.fw * dt; }); }
    // spray from the crest
    if(wp > 0 && wp < 1.02){
      S.spAcc = (S.spAcc || 0) + dt * (opts.lite ? 90 : 190);
      while(S.spAcc >= 1){ S.spAcc--; var yy = R() * H, xf2 = frontX(yy, t, wp); S.spray.push({ x:xf2 + (R() - .3) * 14, y:yy, vx:vF * (.3 + R() * .5), vy:-(110 + R() * 460) * sc, life:0, max:.6 + R() * .9, r:.9 + R() * 2.6 }); }
    }
    for(i = S.spray.length - 1; i >= 0; i--){ var d = S.spray[i]; d.life += dt; d.vy += 980 * sc * dt; d.x += d.vx * dt; d.y += d.vy * dt; if(d.life > d.max) S.spray.splice(i, 1); }
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
    x.lineJoin = 'round'; x.lineWidth = 2.6; x.strokeStyle = 'rgba(255,240,190,.9)'; x.stroke(); x.lineWidth = 1; x.strokeStyle = 'rgba(255,255,255,.95)'; x.stroke();
    return { cv:cv, x:x0, y:y0, w:bw, h:bh };
  }
  function doBreak(){
    S.broke = true; S.shake = 14 * sc;
    S.shards = geo.shards.map(function(c){
      var dx = c.cx - geo.cxl, dy = c.cy - geo.cyl, d = Math.sqrt(dx * dx + dy * dy) + 1, n = d / (Lw * .5), sp = (320 + R() * 560) * sc * (1.25 - Math.min(1, n) * .45);
      var spriteInfo = shardSprite(c);
      return { c:c, sp:spriteInfo, dx:0, dy:0, vx:dx / d * sp + (R() - .5) * 90 * sc, vy:dy / d * sp - (240 + R() * 260) * sc, rot:0, om:(R() - .5) * 8, fx:R() * 6.28, fw:1.5 + R() * 4.5, age:0, k:.9 + R() * .5 };
    });
  }

  /* ------------------------------------------------------------------ drawing */
  function drawBackground(t){
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * .85);
    var lift = S.broke ? .07 * Math.exp(-(t - TL.brk) * .8) : 0;
    g.addColorStop(0, 'rgb(' + Math.round(16 + lift * 255) + ',' + Math.round(80 + lift * 160) + ',' + Math.round(64 + lift * 90) + ')'); g.addColorStop(.38, '#0a3329'); g.addColorStop(.75, '#05211a'); g.addColorStop(1, '#020f0b');
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
    // dust motes
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    S.dust.forEach(function(d){ var a = (.25 + .35 * Math.sin(t * 1.3 + d.ph)) * d.z * Math.min(1, t * .8); if(a <= .01) return; ctx.globalAlpha = a; var s2 = 5 * d.z * sc + 2; ctx.drawImage(spr.dot, d.x - s2 / 2, d.y - s2 / 2, s2, s2); });
    ctx.restore();
  }
  function maskedLayer(fn){ lctx.setTransform(DPR, 0, 0, DPR, 0, 0); lctx.globalCompositeOperation = 'source-over'; lctx.clearRect(0, 0, layer.width / DPR + 2, layer.height / DPR + 2); fn(lctx); lctx.globalCompositeOperation = 'destination-in'; lctx.drawImage(img, 0, 0, Lw, Lh); lctx.globalCompositeOperation = 'source-over'; }
  function putLayer(mode, alpha){ ctx.save(); ctx.globalCompositeOperation = mode || 'source-over'; ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.drawImage(layer, 0, 0, layer.width / DPR, layer.height / DPR); ctx.restore(); }

  function drawCracks(front){
    var edges = geo.edges, path = [];
    edges.forEach(function(e){
      var prog = e.kind === 'r' ? (front - (e.r0 + e.jit)) / ((e.r1 - e.r0) * .95) : (front - (e.r0 + e.jit)) / ((e.r1 - e.r0) * .7);
      prog = clamp(prog, 0, 1); if(prog <= 0) return;
      var n = e.pts.length - 1, upto = prog * n, whole = Math.floor(upto), part = upto - whole, pts = [];
      for(var i = 0; i <= whole && i <= n; i++) pts.push(e.pts[i]);
      if(whole < n){ var a = e.pts[whole], b = e.pts[whole + 1]; pts.push([a[0] + (b[0] - a[0]) * part, a[1] + (b[1] - a[1]) * part]); }
      path.push(pts);
    });
    function stroke(c, w, col, blur, bc){
      c.beginPath(); path.forEach(function(pts){ c.moveTo(pts[0][0], pts[0][1]); for(var i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); });
      c.lineWidth = w; c.strokeStyle = col; c.lineJoin = 'round'; c.lineCap = 'round'; if(blur){ c.shadowColor = bc; c.shadowBlur = blur; } else { c.shadowBlur = 0; c.shadowColor = 'transparent'; } c.stroke(); c.shadowBlur = 0;
    }
    maskedLayer(function(c){ stroke(c, 3 * sc, 'rgba(2,18,14,.8)'); stroke(c, 1.6 * sc, 'rgba(255,214,110,.95)', 12 * sc, 'rgba(255,190,60,1)'); stroke(c, .7 * sc, 'rgba(255,255,235,1)'); });
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
      drawCracks(front);
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
    var fa = Math.pow(clamp(1 - rt / .85, 0, 1), 1.6);
    if(fa > .01){ var fr = Math.max(W, H) * (.35 + rt * 1.1), g = ctx.createRadialGradient(cx, cy, 0, cx, cy, fr); g.addColorStop(0, 'rgba(255,252,230,' + fa + ')'); g.addColorStop(.35, 'rgba(255,214,120,' + (fa * .7) + ')'); g.addColorStop(1, 'rgba(255,170,50,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    var ringR = easeOut(rt / 1.7) * Math.max(W, H) * .95, ra = Math.pow(clamp(1 - rt / 1.7, 0, 1), 1.6);
    if(ra > .01){ ctx.lineWidth = (2 + 12 * ra) * sc; var rg = ctx.createRadialGradient(cx, cy, Math.max(0, ringR - 30 * sc), cx, cy, ringR + 30 * sc); rg.addColorStop(0, 'rgba(255,220,130,0)'); rg.addColorStop(.5, 'rgba(255,240,190,' + (.45 * ra) + ')'); rg.addColorStop(1, 'rgba(255,200,90,0)'); ctx.strokeStyle = rg; ctx.beginPath(); ctx.arc(cx, cy, ringR, 0, 6.2832); ctx.stroke(); }
    var sa = Math.pow(clamp(1 - rt / 1.1, 0, 1), 1.2);
    if(sa > .01){ ctx.save(); ctx.translate(cx, cy); ctx.scale(1, .022 + .03 * sa); var sg = ctx.createRadialGradient(0, 0, 0, 0, 0, W * .95); sg.addColorStop(0, 'rgba(255,250,225,' + sa + ')'); sg.addColorStop(.25, 'rgba(255,230,160,' + (sa * .55) + ')'); sg.addColorStop(1, 'rgba(255,210,120,0)'); ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(0, 0, W * .95, 0, 6.2832); ctx.fill(); ctx.restore(); }
    ctx.restore();
  }

  function drawItem(it, t){
    var sprt = it.kind === 'coin' ? spr.coin : spr.notes[it.v], w = sprt._w * it.z, h = sprt._h * it.z;
    var fy = Math.cos(it.phX), sy = Math.max(.07, Math.abs(fy)), sx = .8 + .2 * Math.cos(it.phY);
    ctx.save(); ctx.translate(it.x, it.y); ctx.rotate(it.rot); ctx.scale(sx, sy); ctx.globalAlpha = (.62 + .38 * Math.abs(fy)) * it.a;
    ctx.drawImage(sprt, -w / 2, -h / 2, w, h);
    ctx.restore();
    var tw = Math.pow(Math.max(0, Math.sin(t * 4.6 + it.sp)), 14);
    if(tw > .05 && !it.swept){ var ss = (14 + 20 * tw) * sc * it.z; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = tw * .95; ctx.drawImage(spr.star, it.x + Math.cos(it.sp * 3) * w * .25 - ss / 2, it.y + Math.sin(it.sp * 5) * h * .25 - ss / 2, ss, ss); ctx.restore(); }
  }

  function wavePoints(t, p){
    var pts = [], tr = [], step = 7, y;
    for(y = -30; y <= H + 30; y += step){ pts.push([frontX(y, t, p), y]); tr.push([trailX(y, t, p), y]); }
    return { f:pts, t:tr };
  }
  function bandPath(c, wp){ c.beginPath(); wp.f.forEach(function(p, i){ i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); }); for(var i = wp.t.length - 1; i >= 0; i--) c.lineTo(wp.t[i][0], wp.t[i][1]); c.closePath(); }
  function bandGradient(a){
    var minX = 1e9, maxX = -1e9; this.t.forEach(function(p){ if(p[0] < minX) minX = p[0]; }); this.f.forEach(function(p){ if(p[0] > maxX) maxX = p[0]; });
    var g = ctx.createLinearGradient(minX, 0, maxX, 0);
    g.addColorStop(0, 'rgba(60,190,200,0)'); g.addColorStop(.2, 'rgba(34,165,185,' + (.2 * a) + ')'); g.addColorStop(.5, 'rgba(12,118,152,' + (.68 * a) + ')'); g.addColorStop(.82, 'rgba(5,76,116,' + (.92 * a) + ')'); g.addColorStop(.96, 'rgba(9,104,140,' + (.95 * a) + ')'); g.addColorStop(1, 'rgba(200,250,255,' + (.95 * a) + ')');
    return g;
  }

  function drawWaveBack(wp, t, p){
    // reveal: wipe the dark scene away behind the front, so the welcome page shows through the water
    ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.moveTo(-80, -40); wp.f.forEach(function(q){ ctx.lineTo(q[0], q[1]); }); ctx.lineTo(-80, H + 40); ctx.closePath(); ctx.fillStyle = '#000'; ctx.fill(); ctx.restore();
    // light pushed ahead of the water
    var fx = 1e9; wp.f.forEach(function(q){ if(q[0] < fx) fx = q[0]; });
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; var lg = ctx.createLinearGradient(fx, 0, fx + W * .28, 0); lg.addColorStop(0, 'rgba(90,230,230,.20)'); lg.addColorStop(1, 'rgba(90,230,230,0)'); ctx.fillStyle = lg; ctx.fillRect(fx, 0, W * .3, H); ctx.restore();
    // body of the water
    ctx.save(); bandPath(ctx, wp); ctx.fillStyle = bandGradient.call(wp, 1); ctx.fill(); ctx.restore();
  }
  function drawWaveFront(wp, t, p, dt){
    ctx.save(); bandPath(ctx, wp); ctx.clip();
    ctx.fillStyle = bandGradient.call(wp, .3); ctx.fillRect(0, 0, W, H);          // film over anything the water carries
    ctx.globalCompositeOperation = 'lighter';
    var n = opts.lite ? 7 : 13, i, y;
    for(i = 0; i < n; i++){                                                          // caustic currents
      var u = (i + .5) / n; ctx.beginPath();
      for(y = -30; y <= H + 30; y += 14){ var idx = Math.round((y + 30) / 7), f = wp.f[Math.min(idx, wp.f.length - 1)], tr = wp.t[Math.min(idx, wp.t.length - 1)], uu = clamp(u + .05 * Math.sin(y * .028 + t * 2.1 + i * 1.7), 0, 1); var x = lerp(tr[0], f[0], uu); y === -30 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.strokeStyle = 'rgba(190,255,250,' + (.07 + .09 * u) + ')'; ctx.lineWidth = 1.2 + 2.2 * u; ctx.stroke();
    }
    for(i = 0; i < 5; i++){                                                          // bright lip near the front
      var uu2 = .9 + i * .022; ctx.beginPath();
      for(y = -30; y <= H + 30; y += 10){ var j = Math.round((y + 30) / 7), f2 = wp.f[Math.min(j, wp.f.length - 1)], t2 = wp.t[Math.min(j, wp.t.length - 1)]; var x2 = lerp(t2[0], f2[0], uu2) + Math.sin(y * .05 + t * 4 + i) * 2; y === -30 ? ctx.moveTo(x2, y) : ctx.lineTo(x2, y); }
      ctx.strokeStyle = 'rgba(235,255,255,' + (.34 - i * .05) + ')'; ctx.lineWidth = 2.4 - i * .3; ctx.stroke();
    }
    S.bubbles.forEach(function(b){ b.y -= b.sp * dt; if(b.y < -10) b.y = H + 10; var idx = clamp(Math.round((b.y + 30) / 7), 0, wp.f.length - 1), x = lerp(wp.t[idx][0], wp.f[idx][0], b.u) + Math.sin(t * 2 + b.ph) * 6; ctx.beginPath(); ctx.arc(x, b.y, b.r * sc, 0, 6.2832); ctx.strokeStyle = 'rgba(230,255,255,.38)'; ctx.lineWidth = 1; ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fill(); });
    ctx.restore();
    // foam and rim along the crest
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    var tk = Math.floor(t * 12);
    wp.f.forEach(function(q, idx){
      for(var k = 0; k < 2; k++){
        var h1 = frac(Math.sin(idx * 127.1 + k * 311.7 + tk * 74.7) * 43758.5453), h2 = frac(Math.sin(idx * 269.5 + k * 183.3 + tk * 31.1) * 24634.6345);
        var r = (4 + 17 * h1 * h1) * sc, a = .4 + .55 * h2; ctx.globalAlpha = a * (opts.lite ? .8 : 1);
        var fx = q[0] + (h2 - .55) * 22 * sc, fy = q[1] + (h1 - .5) * 8; ctx.drawImage(spr.foam, fx - r, fy - r, r * 2, r * 2);
      }
    });
    ctx.globalAlpha = 1; ctx.lineWidth = 3.2 * sc; var rg = ctx.createLinearGradient(0, 0, W, 0); ctx.strokeStyle = 'rgba(240,255,255,.8)'; ctx.shadowColor = 'rgba(120,240,240,.9)'; ctx.shadowBlur = 16 * sc;
    ctx.beginPath(); wp.f.forEach(function(q, i){ i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.stroke(); ctx.restore();
    // spray
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    S.spray.forEach(function(d){ var a = 1 - d.life / d.max; ctx.globalAlpha = a * .85; var r = d.r * sc * 2.4; ctx.drawImage(spr.foam, d.x - r, d.y - r, r * 2, r * 2); });
    ctx.restore();
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
    if(!S.broke) drawLogoWhole(t); else drawShards(t);
    drawBurstFX(t);
    drawGrain(t);
    ctx.restore();
    var wp = waveP(t), W_ = null;
    if(wp > 0){ W_ = wavePoints(t, wp); drawWaveBack(W_, t, wp); }
    var order = S.items.slice().sort(function(a, b){ return a.z - b.z; });
    order.forEach(function(it){ drawItem(it, t); });
    drawSparks();
    if(W_) drawWaveFront(W_, t, wp, dt);
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
      var endT = tWave() + TL.waveDur * 1.08; if(S.t > endT) return finish(false);
      if(S.t > 1.2 && !perf.down){ perf.n++; perf.sum += performance.now() - s0 + 0; if(perf.n === 50){ if(perf.sum / perf.n > 14 && DPR > 1.3){ perf.down = true; layout(); } } }
    }
    raf = requestAnimationFrame(frame);
  }

  function seek(t){                                                  // deterministic still frames for review
    freshState(); S.ready = true; var step = 1 / 60; while(S.t < t - 1e-6){ update(Math.min(step, t - S.t)); }
    if(opts.simple) drawSimple(t); else draw(step);
  }

  function start(o){
    o = o || {}; VEIL = document.getElementById('introVeil'); if(!VEIL) return; window.__introStarted = true;
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
