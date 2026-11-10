// Track and arena builder: spline circuit, road, walls, terrain, scenery, pickups, hazards.
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function noise2(x, z) { return Math.sin(x * 0.021 + 1.3) * Math.cos(z * 0.017 - 0.7) * 0.5 + Math.sin(x * 0.053 + z * 0.047) * 0.3 + Math.sin(x * 0.11 - z * 0.13) * 0.2; }

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } t.anisotropy = 4; return t;
}
const hex = c => '#' + new THREE.Color(c).getHexString();

function roadMaps(theme, r) {
  const map = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = hex(theme.road); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { const v = 90 + r() * 120; g.fillStyle = `rgba(${v},${v},${v},${0.03 + r() * 0.07})`; g.fillRect(r() * w, r() * h, 1 + r() * 2.5, 1 + r() * 2.5); }
    for (let i = 0; i < 12; i++) { g.strokeStyle = `rgba(0,0,0,${0.12 + r() * 0.2})`; g.lineWidth = 1 + r(); g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 50; y += r() * 40; g.lineTo(x, y); } g.stroke(); }
    for (const x of [0.27, 0.4, 0.6, 0.73]) { const gr = g.createLinearGradient(w * x - 16, 0, w * x + 16, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(w * x - 16, 0, 32, h); }
    g.fillStyle = 'rgba(245,245,238,0.9)'; g.fillRect(27, 0, 7, h); g.fillRect(w - 34, 0, 7, h);
    g.fillStyle = hex(theme.glow); g.globalAlpha = 0.85; g.fillRect(w / 2 - 4, 0, 8, h * 0.42); g.globalAlpha = 1;
  }, true);
  const bump = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); for (let i = 0; i < 6000; i++) { const v = r() * 255; g.fillStyle = `rgba(${v},${v},${v},0.4)`; g.fillRect(r() * w, r() * h, 2, 2); } }, true); bump.colorSpace = THREE.NoColorSpace;
  let rough = null;
  if (theme.wet) { rough = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, w, h); for (let i = 0; i < 16; i++) { const x = r() * w, y = r() * h, rad = 18 + r() * 46, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, '#060606'); gr.addColorStop(0.7, '#101010'); gr.addColorStop(1, 'rgba(16,16,16,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); } }, true); rough.colorSpace = THREE.NoColorSpace; }
  return { map, bump, rough };
}
function windowTexture(r, glow, night) {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const base = new THREE.Color(glow);
    for (let y = 6; y < h - 6; y += 12) for (let x = 6; x < w - 8; x += 14) {
      if (r() < (night ? 0.55 : 0.25)) { const c = r() < 0.7 ? new THREE.Color(0xffe6a8) : base; g.fillStyle = hex(c); g.globalAlpha = 0.4 + r() * 0.6; g.fillRect(x, y, 9, 6); }
    }
    g.globalAlpha = 1;
  }, true);
}

function ribbon(samples, fa, fb, uvScale, closed = true) {
  // Build a strip between two edge functions fa(s,i), fb(s,i) returning Vector3.
  const n = samples.length, cnt = closed ? n + 1 : n;
  const pos = new Float32Array(cnt * 6), uv = new Float32Array(cnt * 4), idx = [];
  for (let k = 0; k < cnt; k++) {
    const s = samples[k % n], a = fa(s, k % n), b = fb(s, k % n);
    pos.set([a.x, a.y, a.z, b.x, b.y, b.z], k * 6);
    const v = (k === n ? samples[n - 1].d + 3 : s.d) / uvScale; uv.set([0, v, 1, v], k * 4);
    if (k < cnt - 1) { const i = k * 2; idx.push(i, i + 2, i + 1, i + 1, i + 2, i + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}

export function makeSky(theme, sunDir) {
  const g = new THREE.SphereGeometry(1800, 32, 16);
  const cloud = theme.cloud ?? (theme.night ? 0.45 : { rocks: 0.35, pines: 0.6, bunkers: 0.95, jungle: 0.6 }[theme.props] ?? 0.5);
  const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(theme.sky[1]) }, bot: { value: new THREE.Color(theme.sky[0]) }, sunCol: { value: new THREE.Color(theme.sun) }, sunDir: { value: sunDir || new THREE.Vector3(0.4, 0.6, 0.4) }, night: { value: theme.night ? 1 : 0 }, cloud: { value: cloud } },
    vertexShader: 'varying vec3 dir; void main(){ dir = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 bot; uniform vec3 sunCol; uniform vec3 sunDir; uniform float night; uniform float cloud; varying vec3 dir;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x), mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x), f.y); }
      float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*noise(p); p=p*2.03+7.1; a*=0.5; } return s; }
      void main(){ vec3 d = normalize(dir); float h = d.y;
        vec3 col = mix(bot, top, smoothstep(-0.04, 0.55, h));
        col = mix(col, bot*1.12, exp(-abs(h)*9.0)*0.6);
        float sd = max(dot(d, normalize(sunDir)), 0.0);
        col += sunCol * (pow(sd, 900.0)*6.0 + pow(sd, 40.0)*0.45 + pow(sd, 5.0)*0.16) * (1.0 - night*0.55);
        if (h > 0.0) {
          vec2 uv = d.xz/(h+0.14)*1.25; float c = fbm(uv + 3.7), c2 = fbm(uv*2.3 - 1.9);
          float mk = smoothstep(1.0-cloud*0.7, 1.1, c + 0.32 + c2*0.12) * smoothstep(0.0, 0.2, h);
          vec3 lit = mix(bot*1.1 + sunCol*0.3, vec3(1.0), 0.6) * (0.75 + 0.35*pow(sd, 3.0));
          vec3 cc = mix(lit, top*0.55 + bot*0.25, night*0.8); cc = mix(cc, cc*0.62, smoothstep(0.45, 0.9, c2));
          col = mix(col, cc, mk*0.9);
          vec2 sp = d.xz/(h+0.25)*110.0; float st = step(0.9965, hash(floor(sp))) * night * smoothstep(0.06, 0.35, h) * (1.0-mk);
          col += vec3(st) * (0.6 + 0.4*hash(floor(sp)+3.0));
        }
        gl_FragColor = vec4(col, 1.0); }` });
  const sky = new THREE.Mesh(g, m); sky.renderOrder = -10; sky.frustumCulled = false;
  return sky;
}

function instanced(geo, mat, items, group, shadow) {
  if (!items.length) return;
  const m = new THREE.InstancedMesh(geo, mat, items.length), d = new THREE.Object3D();
  items.forEach((it, i) => { d.position.set(it.x, it.y, it.z); d.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0); d.scale.set(it.sx, it.sy, it.sz); d.updateMatrix(); m.setMatrixAt(i, d.matrix); if (it.c) m.setColorAt(i, it.c); });
  m.castShadow = !!shadow; m.receiveShadow = false; group.add(m);
}

function rockGeo(r) { const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position, seen = {}; for (let i = 0; i < p.count; i++) { const key = p.getX(i).toFixed(2) + p.getY(i).toFixed(2) + p.getZ(i).toFixed(2), k = seen[key] || (seen[key] = 0.72 + r() * 0.5); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); } g.computeVertexNormals(); return g; }
export function buildTrack(def, q = { density: 1 }) {
  const theme = def.theme, r = rng(def.id.length * 977 + def.pts.length * 131);
  const group = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3(def.pts.map(p => V(p[0], p[2] || 0, p[1])), true, 'catmullrom', 0.5);
  const length = curve.getLength(), N = Math.round(length / 3), halfW = def.width;
  const pts = curve.getSpacedPoints(N); pts.pop();
  const samples = pts.map((p, i) => ({ p, d: i * length / N }));
  for (let i = 0; i < N; i++) {
    const a = samples[(i + N - 1) % N].p, b = samples[(i + 1) % N].p;
    const t = V(b.x - a.x, 0, b.z - a.z).normalize(); samples[i].t = t; samples[i].n = V(t.z, 0, -t.x);
  }
  for (let i = 0; i < N; i++) {
    const a = samples[(i + N - 2) % N].t, b = samples[(i + 2) % N].t;
    samples[i].k = Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z) / 12; // signed curvature, + = right turn
  }
  for (let pass = 0; pass < 2; pass++) { const ks = samples.map((s, i) => (samples[(i + N - 1) % N].k + s.k * 2 + samples[(i + 1) % N].k) / 4); samples.forEach((s, i) => s.k = ks[i]); }
  // Jump ramps: rise then sharp drop.
  const jumps = (def.jumps || { desert: [0.46], military: [0.62], jungle: [0.33] }[def.id] || []).map(f => Math.floor(f * N));
  for (const j of jumps) for (let k = 0; k < 6; k++) samples[(j - k + N) % N].p.y += 2.4 * (1 - k / 6);
  const tunnel = theme.tunnel ? [Math.floor(N * 0.56), Math.floor(N * 0.68)] : null;

  const track = { def, theme, group, samples, N, length, halfW, isArena: false, jumps, tunnel, waterY: theme.water ? -1.35 : -999 };

  track.locate = (x, z, hint) => {
    let best = hint, bd = 1e9;
    for (let o = -6; o <= 10; o++) { const i = (hint + o + N) % N, s = samples[i].p, d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; best = i; } }
    return best;
  };
  track.locateGlobal = (x, z) => { let best = 0, bd = 1e9; for (let i = 0; i < N; i++) { const s = samples[i].p, d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; best = i; } } return best; };
  track.groundY = (idx, x, z) => {
    const s = samples[idx], along = (x - s.p.x) * s.t.x + (z - s.p.z) * s.t.z;
    const o = along >= 0 ? samples[(idx + 1) % N] : samples[(idx + N - 1) % N];
    const f = Math.min(1, Math.abs(along) / 3);
    if (jumps.includes(idx) && along > 0) return o.p.y; // past the lip
    return s.p.y + (o.p.y - s.p.y) * f;
  };
  track.lateral = (idx, x, z) => { const s = samples[idx]; return (x - s.p.x) * s.n.x + (z - s.p.z) * s.n.z; };
  // Keep a car inside the walls. Returns impact speed (m/s) if it hit.
  track.constrain = (car) => {
    const s = samples[car.idx], lat = track.lateral(car.idx, car.x, car.z), lim = halfW - 1.0;
    if (Math.abs(lat) <= lim) return 0;
    const sg = Math.sign(lat), over = Math.abs(lat) - lim;
    car.x -= s.n.x * over * sg; car.z -= s.n.z * over * sg;
    const vn = (car.vx * s.n.x + car.vz * s.n.z) * sg;
    if (vn > 0) { car.vx -= s.n.x * vn * 1.3 * sg; car.vz -= s.n.z * vn * 1.3 * sg; car.vx *= 0.97; car.vz *= 0.97; return vn; }
    return 0;
  };
  track.pointAt = (idx, lat, out = V()) => { const s = samples[((idx % N) + N) % N]; return out.set(s.p.x + s.n.x * lat, s.p.y, s.p.z + s.n.z * lat); };
  track.heading = idx => { const t = samples[((idx % N) + N) % N].t; return Math.atan2(t.x, t.z); };
  track.inTunnel = idx => tunnel && idx >= tunnel[0] && idx <= tunnel[1];

  // --- Road, walls
  const RM = roadMaps(theme, r);
  const roadMat = new THREE.MeshStandardMaterial({ map: RM.map, bumpMap: RM.bump, bumpScale: 0.6, roughness: theme.wet ? 1 : 0.86, roughnessMap: RM.rough, metalness: theme.wet ? 0.25 : 0.02 });
  RM.bump.repeat.set(6, 3); if (RM.rough) RM.rough.repeat.set(1, 0.35);
  const road = new THREE.Mesh(ribbon(samples, s => V(s.p.x - s.n.x * halfW, s.p.y + 0.03, s.p.z - s.n.z * halfW), s => V(s.p.x + s.n.x * halfW, s.p.y + 0.03, s.p.z + s.n.z * halfW), 10), roadMat);
  road.receiveShadow = true; group.add(road);
  const kerbTex = canvasTex(32, 64, (g, w, h) => { g.fillStyle = '#d2261c'; g.fillRect(0, 0, w, h / 2); g.fillStyle = '#eeeeea'; g.fillRect(0, h / 2, w, h / 2); }, true);
  const kerbMat = new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.7 });
  for (const sg of [-1, 1]) { const e = (s, lat, y) => V(s.p.x + s.n.x * lat * sg, s.p.y + y, s.p.z + s.n.z * lat * sg); const k = new THREE.Mesh(ribbon(samples, s => e(s, halfW - 1.15, 0.045), s => e(s, halfW + 0.05, 0.13), 4), kerbMat); k.receiveShadow = true; group.add(k); }
  const wallTex = canvasTex(128, 64, (g, w, h) => { g.fillStyle = '#c9c9c9'; g.fillRect(0, 0, w, h); for (let i = 0; i < 700; i++) { const v = 120 + r() * 120; g.fillStyle = `rgba(${v},${v},${v},0.25)`; g.fillRect(r() * w, r() * h, 3, 2); } g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, 0, 3, h); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, h - 10, w, 10); }, true);
  const wallMat = new THREE.MeshStandardMaterial({ color: theme.wall, map: wallTex, roughness: 0.82, metalness: 0.08, side: THREE.DoubleSide });
  const glowMat = new THREE.MeshBasicMaterial({ color: theme.glow, side: THREE.DoubleSide });
  for (const sg of [-1, 1]) {
    const e = (s, h, w = 0.25) => V(s.p.x + s.n.x * (halfW + w) * sg, s.p.y + h, s.p.z + s.n.z * (halfW + w) * sg);
    const wall = new THREE.Mesh(ribbon(samples, s => e(s, 0.45, 0.12), s => e(s, 1.25), 6), wallMat); wall.castShadow = true; wall.receiveShadow = true; group.add(wall);
    const foot = new THREE.Mesh(ribbon(samples, s => e(s, -0.6, -0.12), s => e(s, 0.45, 0.12), 6), wallMat); foot.receiveShadow = true; group.add(foot);
    const back = new THREE.Mesh(ribbon(samples, s => e(s, 1.42, 0.3), s => e(s, -0.8, 0.75), 6), wallMat); group.add(back);
    group.add(new THREE.Mesh(ribbon(samples, s => e(s, 1.25), s => e(s, 1.42, 0.3), 6), glowMat));
  }
  if (tunnel) {
    const seg = samples.slice(tunnel[0], tunnel[1] + 1), tm = new THREE.MeshStandardMaterial({ color: 0x20232b, roughness: 0.7, metalness: 0.3, side: THREE.DoubleSide });
    for (const sg of [-1, 1]) {
      const e = (s, h, w) => V(s.p.x + s.n.x * w * sg, s.p.y + h, s.p.z + s.n.z * w * sg);
      group.add(new THREE.Mesh(ribbon(seg, s => e(s, 1.2, halfW + 0.3), s => e(s, 7, halfW + 0.3), 6, false), tm));
      group.add(new THREE.Mesh(ribbon(seg, s => e(s, 7, halfW + 0.3), s => e(s, 8.2, 0), 6, false), tm));
      group.add(new THREE.Mesh(ribbon(seg, s => e(s, 6.6, halfW * 0.55), s => e(s, 6.6, halfW * 0.55 + 0.5), 6, false), glowMat));
    }
  }

  // --- Terrain heightfield that hugs the road
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const s of samples) { minX = Math.min(minX, s.p.x); maxX = Math.max(maxX, s.p.x); minZ = Math.min(minZ, s.p.z); maxZ = Math.max(maxZ, s.p.z); }
  const M = 220; minX -= M; maxX += M; minZ -= M; maxZ += M;
  const amp = { rocks: 26, pines: 55, jungle: 14, bunkers: 5, factory: 0, towers: 0 }[theme.props] || 0;
  const nearest = (x, z) => { let bd = 1e9, bi = 0; for (let i = 0; i < N; i += 2) { const s = samples[i].p, d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; bi = i; } } return [Math.sqrt(bd), bi]; };
  const terrainH = (x, z) => {
    const [d, i] = nearest(x, z), ry = samples[i].p.y - 0.7, e = d - halfW - 4;
    if (e <= 0) return ry;
    const t = Math.min(1, e / 70), sm = t * t * (3 - 2 * t);
    let base = noise2(x, z) * amp + amp * 0.35 + (theme.water ? -3 : 0);
    if (theme.props === 'pines') base += Math.max(0, noise2(x * 0.5 + 40, z * 0.5)) * 60;
    return ry + (base - ry) * sm + Math.min(e, 8) * (amp > 0 ? 0.25 : 0);
  };
  track.terrainH = terrainH;
  const cells = q.density < 0.7 ? 90 : q.density < 1 ? 150 : 210, tg = new THREE.PlaneGeometry(maxX - minX, maxZ - minZ, cells, cells); tg.rotateX(-Math.PI / 2);
  const tp = tg.attributes.position, tc = new Float32Array(tp.count * 3), gc = new THREE.Color(theme.ground), c2 = new THREE.Color();
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i) + (minX + maxX) / 2, z = tp.getZ(i) + (minZ + maxZ) / 2, h = terrainH(x, z);
    tp.setXYZ(i, x, h, z);
    const sh = 0.75 + noise2(x * 3, z * 3) * 0.2 + (amp ? Math.min(0.35, Math.max(-0.1, h / (amp * 3))) : 0);
    c2.copy(gc).multiplyScalar(sh); if (theme.snow && h > 34) c2.lerp(new THREE.Color(0xf4f6f8), Math.min(1, (h - 34) / 20));
    tc.set([c2.r, c2.g, c2.b], i * 3);
  }
  tg.setAttribute('color', new THREE.BufferAttribute(tc, 3)); tg.computeVertexNormals();
  const detail = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#b4b4b4'; g.fillRect(0, 0, w, h); for (let i = 0; i < 5000; i++) { const v = 110 + r() * 145; g.fillStyle = `rgba(${v},${v},${v},0.35)`; const s = 1 + r() * 5; g.fillRect(r() * w, r() * h, s, s * (0.4 + r())); } }, true);
  detail.repeat.set((maxX - minX) / 16, (maxZ - minZ) / 16);
  const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, bumpMap: detail, bumpScale: 1.2, roughness: 0.96, metalness: 0 }));
  terrain.receiveShadow = true; group.add(terrain);
  if (theme.water) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX, maxZ - minZ), new THREE.MeshStandardMaterial({ color: 0x2a6f7a, transparent: true, opacity: 0.72, roughness: 0.1, metalness: 0.5 }));
    w.rotation.x = -Math.PI / 2; w.position.set((minX + maxX) / 2, track.waterY, (minZ + maxZ) / 2); group.add(w);
  }

  // --- Distant backdrop (unaffected by fog so the horizon has depth)
  {
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, R = Math.max(maxX - minX, maxZ - minZ) / 2 + 420, city = theme.props === 'factory' || theme.props === 'towers';
    const fogC = new THREE.Color(theme.fog);
    if (!city) {
      const seg = 120, pos = [], col = [], idx = [], base = fogC.clone().lerp(new THREE.Color(theme.ground), 0.4).multiplyScalar(0.8);
      for (let layer = 0; layer < 2; layer++) {
        const o = pos.length / 3, RR = R + layer * 260, hh = (amp > 0 ? 150 : 60) * (1 + layer * 0.7), cc = base.clone().lerp(fogC, layer * 0.5);
        for (let i = 0; i <= seg; i++) { const a = i / seg * 6.283, n = 0.35 + 0.65 * Math.abs(noise2(Math.cos(a) * 300 + layer * 90, Math.sin(a) * 300)) + 0.25 * Math.abs(Math.sin(a * 9 + layer * 2)); pos.push(Math.cos(a) * RR + cx, -60, Math.sin(a) * RR + cz, Math.cos(a) * RR + cx, hh * n, Math.sin(a) * RR + cz); const top = theme.snow ? cc.clone().lerp(new THREE.Color(0xffffff), 0.6 * n) : cc.clone().multiplyScalar(1.15); col.push(cc.r, cc.g, cc.b, top.r, top.g, top.b); if (i < seg) { const k = o + i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
      }
      const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); bg.setIndex(idx);
      const bm = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide })); bm.renderOrder = -9; group.add(bm);
    } else {
      const items = []; for (let i = 0; i < 90; i++) { const a = i / 90 * 6.283 + r() * 0.05, RR = R * (0.75 + r() * 0.5), hgt = 70 + r() * (theme.props === 'towers' ? 300 : 130), w = 30 + r() * 50; items.push({ x: Math.cos(a) * RR + cx, y: hgt / 2 - 30, z: Math.sin(a) * RR + cz, ry: a, sx: w, sy: hgt, sz: w }); }
      const wt2 = windowTexture(r, theme.glow, true); wt2.repeat.set(2, 5);
      instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ map: wt2, color: 0xbfc8ff, fog: false }), items, group);
    }
  }
  // --- Street lamps with light pools, corner boards
  {
    const poles = [], arms = [], heads = [], pools = [], night = !!theme.night;
    for (let i = 6, n = 0; i < N; i += 14, n++) {
      if (track.inTunnel(i)) continue; const sg = n % 2 ? 1 : -1, h = track.heading(i), a = track.pointAt(i, sg * (halfW + 1.3)), b2 = track.pointAt(i, sg * (halfW - 0.2)), c = track.pointAt(i, sg * (halfW - 1.6)), d = track.pointAt(i, sg * (halfW - 4));
      poles.push({ x: a.x, y: a.y + 4.3, z: a.z, sx: 1, sy: 8.6, sz: 1 }); arms.push({ x: b2.x, y: b2.y + 8.5, z: b2.z, ry: h, sx: 3.2, sy: 0.14, sz: 0.14 });
      heads.push({ x: c.x, y: c.y + 8.4, z: c.z, ry: h, sx: 1.2, sy: 0.14, sz: 0.5 }); if (night) pools.push({ x: d.x, y: d.y + 0.09, z: d.z, rx: -Math.PI / 2, sx: 20, sy: 20, sz: 1 });
    }
    const pm2 = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.5, metalness: 0.7 });
    instanced(new THREE.CylinderGeometry(0.11, 0.16, 1, 8), pm2, poles, group, true); instanced(new THREE.BoxGeometry(1, 1, 1), pm2, arms, group);
    instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: night ? new THREE.Color(0xfff0d0).multiplyScalar(2.2) : 0xd8dade }), heads, group);
    if (pools.length) { const pt = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,240,205,0.55)'); gr.addColorStop(0.5, 'rgba(255,225,170,0.16)'); gr.addColorStop(1, 'rgba(255,220,160,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }); instanced(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: pt, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), pools, group); }
    const chev = []; for (let i = 0; i < N; i += 3) { const k = samples[i].k; if (Math.abs(k) < 0.0105 || track.inTunnel(i)) continue; const sg = k > 0 ? 1 : -1, p = track.pointAt(i, sg * (halfW + 0.55)); chev.push({ x: p.x, y: p.y + 2.3, z: p.z, ry: track.heading(i) + Math.PI, sx: 3.4 * sg, sy: 1.3, sz: 1 }); }
    if (chev.length) { const ct = canvasTex(128, 48, (g, w, h) => { g.fillStyle = '#101010'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffc61a'; for (let x = 6; x < w; x += 40) { g.beginPath(); g.moveTo(x, 4); g.lineTo(x + 16, 4); g.lineTo(x + 30, h / 2); g.lineTo(x + 16, h - 4); g.lineTo(x, h - 4); g.lineTo(x + 14, h / 2); g.closePath(); g.fill(); } }); instanced(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: ct, side: THREE.DoubleSide }), chev, group); }
  }

  // --- Scenery
  const spots = [], step = Math.max(2, Math.round(5 / q.density));
  for (let i = 0; i < N; i += step) for (const sg of [-1, 1]) {
    if (track.inTunnel(i)) continue;
    const lat = (halfW + 9 + r() * 85) * sg, s = samples[i], x = s.p.x + s.n.x * lat, z = s.p.z + s.n.z * lat;
    const [d] = nearest(x, z); if (d < halfW + 7) continue;
    spots.push({ x, z, y: terrainH(x, z), d, u: r(), v: r(), w: r() });
  }
  const std = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.9, flatShading: true }, o));
  const P = theme.props, clear = (s, rad) => s.d > halfW + 5 + rad, brad = s => 0.5 * Math.hypot(12 + s.w * 18, 12 + s.u * 16);
  if (P === 'rocks') {
    instanced(rockGeo(r), std(0xb5713c), spots.filter(s => clear(s, (2 + s.u * 9) * 1.3)).map(s => { const k = 2 + s.u * 9; return { x: s.x, y: s.y + k * 0.3, z: s.z, ry: s.v * 6, rx: s.w, sx: k, sy: k * (0.6 + s.w), sz: k * (0.7 + s.v * 0.6) }; }), group, true);
    instanced(new THREE.CylinderGeometry(0.8, 1, 1, 7), std(0xa85f30), spots.filter(s => s.d > 45 && s.u > 0.6).map(s => ({ x: s.x, y: s.y + 14, z: s.z, ry: s.v * 6, sx: 10 + s.w * 16, sy: 30 + s.v * 30, sz: 10 + s.u * 14 })), group, true);
  } else if (P === 'pines') {
    const tr = spots.filter(s => s.u > 0.15);
    const tiers = []; for (const s of tr) { const k = 5 + s.v * 8; for (let j = 0; j < 3; j++) tiers.push({ x: s.x, y: s.y + k * (0.34 + j * 0.24), z: s.z, ry: s.w * 6 + j, sx: k * (0.36 - j * 0.085), sy: k * 0.42, sz: k * (0.36 - j * 0.085), c: new THREE.Color().setHSL(0.36 + s.w * 0.05, 0.42, 0.15 + s.u * 0.1 + j * 0.02) }); }
    instanced(new THREE.ConeGeometry(1, 1, 9), std(0xffffff), tiers, group, true);
    instanced(new THREE.CylinderGeometry(0.25, 0.35, 1, 5), std(0x4a3524), tr.map(s => { const k = 5 + s.v * 8; return { x: s.x, y: s.y + k * 0.1, z: s.z, sx: 1, sy: k * 0.3, sz: 1 }; }), group);
    instanced(new THREE.DodecahedronGeometry(1, 0), std(0x7d848a), spots.filter(s => s.u <= 0.15 && clear(s, 8)).map(s => ({ x: s.x, y: s.y, z: s.z, ry: s.v * 6, sx: 3 + s.w * 5, sy: 2 + s.w * 4, sz: 3 + s.v * 4 })), group, true);
  } else if (P === 'jungle') {
    const tr = spots.filter(s => s.u > 0.12);
    instanced(new THREE.IcosahedronGeometry(1, 0), std(0x2f7a34), tr.map(s => { const k = 3 + s.v * 5; return { x: s.x, y: s.y + 5 + k * 0.8, z: s.z, ry: s.w * 6, sx: k, sy: k * 0.8, sz: k, c: new THREE.Color().setHSL(0.3 + s.w * 0.08, 0.6, 0.22 + s.v * 0.12) }; }), group, true);
    instanced(new THREE.CylinderGeometry(0.3, 0.5, 1, 5), std(0x4d3a26), tr.map(s => ({ x: s.x, y: s.y + 3, z: s.z, sx: 1, sy: 7, sz: 1 })), group);
    instanced(new THREE.BoxGeometry(1, 1, 1), std(0x8a8a78), spots.filter(s => s.u <= 0.12).map(s => ({ x: s.x, y: s.y + 3, z: s.z, ry: s.v * 3, sx: 2 + s.w * 6, sy: 6 + s.v * 8, sz: 2 + s.w * 3 })), group, true);
  } else if (P === 'bunkers') {
    instanced(new THREE.BoxGeometry(1, 1, 1), std(0x77746a, { flatShading: false }), spots.filter(s => s.u > 0.45 && clear(s, (8 + s.w * 14) * 0.75)).map(s => ({ x: s.x, y: s.y + 2.5, z: s.z, ry: s.v * 3, rz: (s.w - 0.5) * 0.12, sx: 8 + s.w * 14, sy: 5 + s.v * 6, sz: 6 + s.u * 10 })), group, true);
    instanced(new THREE.BoxGeometry(1, 1, 1), std(0x5b4a3a), spots.filter(s => s.u <= 0.45 && s.u > 0.2).map(s => ({ x: s.x, y: s.y + 0.9, z: s.z, ry: s.v * 6, rz: (s.w - 0.5) * 0.5, sx: 4.5, sy: 1.6, sz: 2.2 })), group, true);
    instanced(new THREE.CylinderGeometry(0.5, 0.7, 1, 6), std(0x4a4d48), spots.filter(s => s.u <= 0.2).map(s => ({ x: s.x, y: s.y + 8, z: s.z, sx: 2, sy: 16, sz: 2 })), group, true);
  } else if (P === 'factory' || P === 'towers') {
    const wt = windowTexture(r, theme.glow, true), tall = P === 'towers';
    const bm = new THREE.MeshStandardMaterial({ color: tall ? 0x14121f : 0x1c2028, roughness: 0.5, metalness: 0.5, emissive: 0xffffff, emissiveMap: wt, emissiveIntensity: tall ? 1.3 : 0.8 });
    const bg = new THREE.BoxGeometry(1, 1, 1);
    instanced(bg, bm, spots.filter(s => s.u > 0.2 && clear(s, brad(s))).map(s => { const h = tall ? 30 + s.v * 110 : 10 + s.v * 34, w = 12 + s.w * 18; return { x: s.x, y: s.y + h / 2 - 2, z: s.z, ry: Math.round(s.u * 4) * 1.5708, sx: w, sy: h, sz: 12 + s.u * 16 }; }), group, true);
    instanced(new THREE.CylinderGeometry(0.6, 1, 1, 8), std(tall ? 0x2a1c44 : 0x3a3f4a, { flatShading: false }), spots.filter(s => s.u <= 0.2).map(s => ({ x: s.x, y: s.y + 20, z: s.z, sx: 3, sy: 44, sz: 3 })), group, true);
    if (tall) instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), spots.filter(s => s.u > 0.55 && clear(s, brad(s))).map(s => ({ x: s.x, y: s.y + 14 + s.v * 30, z: s.z, ry: Math.round(s.u * 4) * 1.5708, sx: 13 + s.w * 18, sy: 1.2, sz: 13 + s.u * 16, c: new THREE.Color().setHSL(s.w < 0.5 ? 0.86 : 0.52, 1, 0.55) })), group);
  }

  // --- Start gantry and line
  const s0 = samples[0], gy = Math.atan2(s0.t.x, s0.t.z), gant = new THREE.Group();
  const pm = new THREE.MeshStandardMaterial({ color: 0x22252c, roughness: 0.4, metalness: 0.8 });
  for (const sg of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 9, 0.9), pm); p.position.set((halfW + 1) * sg, 4.5, 0); p.castShadow = true; gant.add(p); }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2 + 3, 1.6, 1.2), pm); beam.position.y = 8.6; gant.add(beam);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 1.5, 1.2), new THREE.MeshBasicMaterial({ map: canvasTex(512, 64, (g, w, h) => { g.fillStyle = '#0a0a0e'; g.fillRect(0, 0, w, h); g.fillStyle = hex(theme.glow); g.font = 'italic 900 44px sans-serif'; g.textAlign = 'center'; g.fillText('PROJECT X  ·  ' + def.name.toUpperCase(), w / 2, 48, w - 20); }) }));
  sign.position.set(0, 8.6, -0.62); sign.rotation.y = Math.PI; gant.add(sign);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2, 2.4), new THREE.MeshBasicMaterial({ map: canvasTex(256, 32, (g, w, h) => { for (let x = 0; x < 32; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? '#eee' : '#111'; g.fillRect(x * 8, y * 8, 8, 8); } }) }));
  line.rotation.x = -Math.PI / 2; line.position.y = 0.06; gant.add(line);
  gant.position.copy(s0.p); gant.rotation.y = gy; group.add(gant);

  // --- Hazards: solid obstacles on the road
  track.hazards = [];
  const hz = theme.hazards === 'heavy' ? 9 : 4, hm = std(theme.hazards === 'heavy' ? 0x8a877c : theme.wall, { flatShading: false });
  for (let k = 0; k < hz; k++) {
    const i = Math.floor(N * (0.12 + 0.8 * (k + r() * 0.5) / hz));
    if (jumps.some(j => Math.abs(j - i) < 25) || track.inTunnel(i)) continue;
    const lat = (r() < 0.5 ? -1 : 1) * halfW * (0.3 + r() * 0.35), p = track.pointAt(i, lat);
    const m = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.5, 1.4), hm); m.position.set(p.x, p.y + 0.75, p.z); m.rotation.y = track.heading(i) + (r() - 0.5); m.castShadow = true; group.add(m);
    const st = new THREE.Mesh(new THREE.BoxGeometry(2.62, 0.3, 1.42), new THREE.MeshBasicMaterial({ color: 0xffc400 })); st.position.y = 0.35; m.add(st);
    track.hazards.push({ x: p.x, z: p.z, r: 1.7, idx: i, lat });
  }

  // --- Pickup rows
  track.pickupSpots = [];
  const rows = Math.floor(length / 115), pat = [['w', 'n', 'w'], ['n', 'w', 'h'], ['w', 'w', 'n']];
  for (let k = 0; k < rows; k++) {
    const i = Math.floor(N * (k + 0.6) / rows); if (i < 20) continue;
    [-0.55, 0, 0.55].forEach((f, j) => { const p = track.pointAt(i, f * halfW); track.pickupSpots.push({ x: p.x, y: p.y, z: p.z, type: pat[k % 3][j] }); });
  }
  track.grid = k => { const i = (N - 3 - Math.floor(k / 2) * 3 + N) % N, lat = (k % 2 ? 3.4 : -3.4), p = track.pointAt(i, lat); return { x: p.x, y: p.y, z: p.z, h: track.heading(i), idx: i }; };
  return track;
}

export function buildArena(def) {
  const theme = def.theme, R = def.radius, group = new THREE.Group(), r = rng(99);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(R + 2, 64), new THREE.MeshStandardMaterial({ map: canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = hex(theme.ground); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.05})`; g.fillRect(r() * w, r() * h, 2, 2); }
    g.strokeStyle = hex(theme.glow); g.lineWidth = 4; for (const k of [0.15, 0.32, 0.48]) { g.beginPath(); g.arc(w / 2, h / 2, w * k, 0, 6.3); g.stroke(); }
  }), roughness: 0.7, metalness: 0.2 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; group.add(floor);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(R + 1, R + 1, 5, 64, 1, true), new THREE.MeshStandardMaterial({ color: theme.wall, side: THREE.BackSide, roughness: 0.6, metalness: 0.4 }));
  wall.position.y = 2.5; group.add(wall);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R + 0.8, 0.25, 6, 64), new THREE.MeshBasicMaterial({ color: theme.glow })); ring.rotation.x = Math.PI / 2; ring.position.y = 5; group.add(ring);
  const stands = new THREE.Mesh(new THREE.CylinderGeometry(R + 30, R + 1, 22, 48, 1, true), new THREE.MeshStandardMaterial({ color: 0x1a1a20, side: THREE.BackSide, roughness: 0.9 })); stands.position.y = 16; group.add(stands);
  const hazards = [], pm = new THREE.MeshStandardMaterial({ color: 0x3b3d44, roughness: 0.5, metalness: 0.6 });
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * 6.283 + 0.3, d = k % 2 ? 62 : 34, x = Math.cos(a) * d, z = Math.sin(a) * d;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.6, 7, 10), pm); m.position.set(x, 3.5, z); m.castShadow = true; group.add(m);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.1, 0.4, 10), new THREE.MeshBasicMaterial({ color: theme.glow })); cap.position.y = 3.6; m.add(cap);
    hazards.push({ x, z, r: 4.2, idx: 0, lat: 0 });
  }
  const samples = []; for (let i = 0; i < 64; i++) { const a = i / 64 * 6.283; samples.push({ p: V(Math.cos(a) * R, 0, Math.sin(a) * R), t: V(-Math.sin(a), 0, Math.cos(a)), n: V(Math.cos(a), 0, Math.sin(a)), d: i * 9, k: 0 }); }
  const track = { def, theme, group, samples, N: 64, length: 6.283 * R, halfW: R, isArena: true, hazards, jumps: [], waterY: -999, radius: R,
    locate: () => 0, locateGlobal: () => 0, groundY: () => 0, lateral: () => 0, inTunnel: () => false, heading: () => 0, terrainH: () => 0,
    pointAt: (i, lat, out = V()) => out.set(0, 0, 0),
    constrain(car) {
      const d = Math.hypot(car.x, car.z), lim = R - 1.5; if (d <= lim) return 0;
      const nx = car.x / d, nz = car.z / d; car.x = nx * lim; car.z = nz * lim;
      const vn = car.vx * nx + car.vz * nz; if (vn > 0) { car.vx -= nx * vn * 1.4; car.vz -= nz * vn * 1.4; return vn; } return 0;
    } };
  track.pickupSpots = [];
  for (let k = 0; k < 18; k++) { const a = k / 18 * 6.283, d = [20, 48, 78][k % 3]; track.pickupSpots.push({ x: Math.cos(a) * d, y: 0, z: Math.sin(a) * d, type: ['w', 'w', 'n', 'w', 'h', 'w'][k % 6] }); }
  track.grid = k => { const a = k / 6 * 6.283; return { x: Math.cos(a) * 70, y: 0, z: Math.sin(a) * 70, h: Math.atan2(-Math.cos(a), -Math.sin(a)), idx: 0 }; };
  return track;
}
