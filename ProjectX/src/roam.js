// Free Roam world: a huge open white surface with painted roads, no walls, and ramps of every size.
import * as THREE from 'three';
import { rng } from './track.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = t => t * t * (3 - 2 * t);
export const ROAM_R = 900;
const EDGE = 2.4; // ramp sides slope down over this many metres, so there are no cliffs along the sides

// Ramp height profiles along the ramp, t from 0 to 1, result 0 to 1.
const PROFILE = {
  wedge: t => t,                                             // straight kicker, drops off at the lip
  curve: t => 1 - Math.cos(t * Math.PI / 2),                 // curved launch ramp, steepest at the lip
  hill: t => 0.5 - 0.5 * Math.cos(t * Math.PI * 2),          // smooth hump, no lip
  table: t => t < 0.3 ? smooth(t / 0.3) : t > 0.7 ? smooth((1 - t) / 0.3) : 1, // up, flat top, down
  landing: t => 1 - t,                                       // slopes down in the direction of travel
};

export const ROAM_THEME = { sky: [0xdfe9f4, 0x5f9ad6], fog: 0xe6ecf3, fogD: 0.00075, ground: 0xeceef2, road: 0xdde1e9, wall: 0xdddddd, glow: 0xff7a1a, sun: 0xfff6e6, sunI: 2.1, amb: 1.0, props: 'none', dust: 0xcfd3da, cloud: 0.42, bright: true };

function layout() {
  const L = [], add = (kind, x, z, yaw, len, wid, h, label) => L.push({ kind, x, z, yaw, len, wid, h, label });
  for (let i = -2; i <= 2; i++) add('wedge', i * 32, 90, 0, 14, 9, 1.3 + Math.abs(i) * 0.25, i === 0 ? 'KICKERS' : null);
  add('wedge', -45, 230, 0, 26, 14, 4.2, 'AIR');
  add('curve', 45, 230, 0, 34, 14, 6.5, 'BIG AIR');
  add('curve', 0, 340, 0, 38, 18, 7.5, 'GAP JUMP');
  add('landing', 0, 416, 0, 46, 30, 6.5);
  add('table', -70, 520, 0, 64, 22, 5, 'TABLETOP');
  for (let k = 0; k < 4; k++) add('hill', 62, 470 + k * 46, 0, 38, 20, 3.4, k === 0 ? 'WHOOPS' : null);
  add('curve', 0, -220, Math.PI, 96, 26, 21, 'MEGA RAMP');
  add('landing', 0, -406, Math.PI, 80, 44, 11);
  add('wedge', 250, -40, Math.PI / 2, 30, 14, 5, 'SIDE JUMP');
  add('landing', 316, -40, Math.PI / 2, 40, 24, 4.5);
  add('table', 330, 220, -Math.PI / 2, 56, 20, 4.5, 'EAST TABLE');
  const r = rng(11), kinds = ['wedge', 'curve', 'hill', 'table'];
  for (let i = 0; i < 14; i++) { const k = kinds[Math.floor(r() * 4)]; add(k, -330 + (r() - 0.5) * 200, (r() - 0.5) * 360, r() * 6.283, 18 + r() * 24, 10 + r() * 6, 2 + r() * 4, i === 0 ? 'STUNT PARK' : null); }
  return L;
}
function prep(rp) { rp.dx = Math.sin(rp.yaw); rp.dz = Math.cos(rp.yaw); rp.nx = Math.cos(rp.yaw); rp.nz = -Math.sin(rp.yaw); rp.reach2 = (Math.hypot(rp.len, rp.wid / 2) + 2) ** 2; rp.f = PROFILE[rp.kind]; return rp; }
export function rampHeight(rp, u, v) { return rp.h * rp.f(clamp(u / rp.len, 0, 1)) * smooth(clamp((rp.wid / 2 - Math.abs(v)) / EDGE, 0, 1)); }

function ctex(w, h, draw, rep = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
function label(text, color) {
  const t = ctex(512, 128, (g, w, h) => { g.fillStyle = 'rgba(10,12,18,0.9)'; g.beginPath(); g.roundRect ? g.roundRect(4, 4, w - 8, h - 8, 18) : g.rect(4, 4, w - 8, h - 8); g.fill(); g.strokeStyle = color; g.lineWidth = 6; g.stroke(); g.fillStyle = color; g.font = 'italic 800 70px "Saira Condensed", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 4, w - 40); }, false);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); s.scale.set(28, 7, 1); return s;
}

function rampMeshes(rp, topMat, lipMat) {
  const nu = Math.max(10, Math.round(rp.len / 1.6)), nv = Math.max(8, Math.round(rp.wid / 1.2)), W = nv + 1, pos = [], uv = [], idx = [], out = [];
  const P = (u, v, h) => [rp.x + rp.dx * u + rp.nx * v, h + 0.03, rp.z + rp.dz * u + rp.nz * v];
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) { const u = rp.len * i / nu, v = -rp.wid / 2 + rp.wid * j / nv; pos.push(...P(u, v, rampHeight(rp, u, v))); uv.push(j / nv, u / 9); }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = i * W + j, b = a + 1, c = a + W, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const top = new THREE.Mesh(g, topMat); top.castShadow = true; top.receiveShadow = true; out.push(top);
  const lip = (u, front) => { // vertical face where the ramp ends in a drop
    const lp = [], lu = [], li = []; for (let j = 0; j <= nv; j++) { const v = -rp.wid / 2 + rp.wid * j / nv; lp.push(...P(u, v, rampHeight(rp, u, v)), ...P(u, v, -0.01)); lu.push(j / nv * 3, 1, j / nv * 3, 0); }
    for (let j = 0; j < nv; j++) { const a = j * 2, b = a + 1, c = a + 2, d = a + 3; front ? li.push(a, b, c, c, b, d) : li.push(a, c, b, b, c, d); }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)); const uvs = []; for (let j = 0; j <= nv; j++) uvs.push(j / nv * 4, 1, j / nv * 4, 0); lg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); lg.setIndex(li); lg.computeVertexNormals();
    const m = new THREE.Mesh(lg, lipMat); m.castShadow = true; out.push(m);
  };
  if (rp.f(1) > 0.01) lip(rp.len, true);
  if (rp.f(0) > 0.01) lip(0, false);
  return out;
}

export function buildRoam(q = { density: 1 }) {
  const theme = ROAM_THEME, R = ROAM_R, group = new THREE.Group(), r = rng(2187);
  const ramps = layout().map(prep), N = 64;
  const heightAt = (x, z) => {
    let best = 0;
    for (const rp of ramps) {
      const dx = x - rp.x, dz = z - rp.z; if (dx * dx + dz * dz > rp.reach2) continue;
      const u = dx * rp.dx + dz * rp.dz; if (u < 0 || u > rp.len) continue;
      const v = dx * rp.nx + dz * rp.nz; if (Math.abs(v) >= rp.wid / 2) continue;
      const h = rampHeight(rp, u, v); if (h > best) best = h;
    }
    return best;
  };

  // --- ground: one huge white surface with a fine expansion joint grid so speed can be seen
  const gt = ctex(512, 512, (g, w, h) => {
    g.fillStyle = '#f4f5f7'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) { const v = 150 + r() * 100; g.fillStyle = `rgba(${v},${v},${v + 6},0.06)`; g.fillRect(r() * w, r() * h, 2 + r() * 3, 2 + r() * 3); }
    g.strokeStyle = 'rgba(105,118,140,0.34)'; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
    g.strokeStyle = 'rgba(105,118,140,0.13)'; g.lineWidth = 1.5; for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(k * w / 4, 0); g.lineTo(k * w / 4, h); g.moveTo(0, k * h / 4); g.lineTo(w, k * h / 4); g.stroke(); }
  });
  const D = 2 * (R + 520); gt.repeat.set(D / 20, D / 20);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(R + 520, 72).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: gt, roughness: 0.82, metalness: 0 }));
  ground.receiveShadow = true; group.add(ground);

  // --- painted roads: two avenues, a ring road and a vehicle lot
  const roadTex = ctex(128, 256, (g, w, h) => {
    g.fillStyle = '#dde1e9'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) { const v = 170 + r() * 70; g.fillStyle = `rgba(${v},${v},${v + 5},0.1)`; g.fillRect(r() * w, r() * h, 2, 2); }
    g.fillStyle = '#ffffff'; g.fillRect(5, 0, 6, h); g.fillRect(w - 11, 0, 6, h);
    g.fillStyle = '#f2b21a'; g.fillRect(w / 2 - 3, 0, 6, h * 0.5);
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(w * 0.27, 40, 4, 120); g.fillRect(w * 0.73 - 4, 40, 4, 120);
  });
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.8, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const avenue = (rot) => { const g = new THREE.PlaneGeometry(30, 1800, 1, 1); g.rotateX(-Math.PI / 2); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 1800 / 16); if (rot) g.rotateY(Math.PI / 2); const m = new THREE.Mesh(g, roadMat); m.position.y = 0.04; m.receiveShadow = true; group.add(m); };
  avenue(false); avenue(true);
  { const r0 = 428, r1 = 452, seg = 180, pos = [], uv = [], idx = [];
    for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); pos.push(c * r0, 0.04, s * r0, c * r1, 0.04, s * r1); uv.push(0, a * 440 / 16 * 1, 1, a * 440 / 16); if (i < seg) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, roadMat); m.receiveShadow = true; m.material = roadMat; group.add(m); }
  const lotTex = ctex(1024, 128, (g, w, h) => { g.fillStyle = '#d3d8e1'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffffff'; for (let k = 0; k <= 8; k++) g.fillRect(k * w / 8 - 3, 14, 6, h - 28); g.fillStyle = '#f2b21a'; g.fillRect(0, 6, w, 5); }, false);
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(120, 15).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: lotTex, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -4 })); lot.position.set(0, 0.05, -26); lot.receiveShadow = true; group.add(lot);
  const lotSign = label('VEHICLE LOT', '#ffb21e'); lotSign.scale.set(15, 3.75, 1); lotSign.position.set(0, 12, -34); group.add(lotSign);

  // --- ramps
  const rampTex = ctex(128, 128, (g, w, h) => {
    g.fillStyle = '#2b2e36'; g.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { const v = 50 + r() * 50; g.fillStyle = `rgba(${v},${v},${v + 4},0.35)`; g.fillRect(r() * w, r() * h, 2, 2); }
    g.fillStyle = '#ffc21a'; g.fillRect(4, 0, 6, h); g.fillRect(w - 10, 0, 6, h);
    g.strokeStyle = '#ffc21a'; g.lineWidth = 9; g.lineJoin = 'miter'; g.beginPath(); g.moveTo(w * 0.22, h * 0.82); g.lineTo(w * 0.5, h * 0.5); g.lineTo(w * 0.78, h * 0.82); g.stroke();
  });
  const topMat = new THREE.MeshStandardMaterial({ map: rampTex, roughness: 0.78, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -6 });
  const lipTex = ctex(64, 64, (g, w, h) => { g.fillStyle = '#ffc21a'; g.fillRect(0, 0, w, h); g.fillStyle = '#16181d'; for (let k = -2; k < 6; k++) { g.beginPath(); g.moveTo(k * 16, h); g.lineTo(k * 16 + 8, h); g.lineTo(k * 16 + 8 + 32, 0); g.lineTo(k * 16 + 32, 0); g.fill(); } });
  const lipMat = new THREE.MeshStandardMaterial({ map: lipTex, roughness: 0.7, side: THREE.DoubleSide });
  for (const rp of ramps) {
    for (const m of rampMeshes(rp, topMat, lipMat)) group.add(m);
    if (rp.label) { const s = label(rp.label, '#ffb21e'); s.position.set(rp.x + rp.dx * rp.len * 0.1, rp.h + 10, rp.z + rp.dz * rp.len * 0.1); group.add(s); }
  }

  // --- landmarks: coloured totems, edge pylons, a glowing ring at the world edge
  const tot = [0x2ea8ff, 0xff7a1a, 0xe3261b, 0x3ddc6a, 0xb026d9, 0xffc21a], tm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.2 }), 18), d = new THREE.Object3D();
  for (let i = 0; i < 18; i++) { const a = i / 18 * 6.283 + 0.2, rr = 560 + r() * 260, hh = 70 + r() * 110; d.position.set(Math.cos(a) * rr, hh / 2, Math.sin(a) * rr); d.scale.set(22 + r() * 16, hh, 22 + r() * 16); d.rotation.y = a; d.updateMatrix(); tm.setMatrixAt(i, d.matrix); tm.setColorAt(i, new THREE.Color(tot[i % 6])); }
  tm.castShadow = true; group.add(tm);
  const py = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 8), new THREE.MeshBasicMaterial({ color: 0xff7a1a }), 90);
  for (let i = 0; i < 90; i++) { const a = i / 90 * 6.283; d.position.set(Math.cos(a) * R, 18, Math.sin(a) * R); d.scale.set(1.5, 36, 1.5); d.rotation.set(0, 0, 0); d.updateMatrix(); py.setMatrixAt(i, d.matrix); }
  group.add(py);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.5, 6, 220), new THREE.MeshBasicMaterial({ color: 0xff7a1a })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.3; group.add(ring);

  // --- slalom pillars (solid)
  const hazards = [], stripe = ctex(64, 64, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = '#ff7a1a'; for (let k = 0; k < 4; k++) g.fillRect(0, k * 16, w, 8); });
  const pm = new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.5 });
  for (let k = 0; k < 9; k++) { const x = -200 + (k % 2 ? 8 : -8), z = 100 + k * 24, m = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 7, 14), pm); m.position.set(x, 3.5, z); m.castShadow = true; group.add(m); hazards.push({ x, z, r: 1.2, idx: 0, lat: 0 }); }
  const pill = label('SLALOM', '#ffb21e'); pill.position.set(-200, 12, 100); group.add(pill);

  // --- pickups
  const spots = [], rr = rng(77);
  [['w', -14, 36], ['w', -5, 40], ['n', 5, 40], ['h', 14, 36], ['w', 0, 52]].forEach(s => spots.push({ type: s[0], x: s[1], z: s[2], y: 0 }));
  for (let tries = 0; spots.length < 60 && tries < 600; tries++) {
    const a = rr() * 6.283, d2 = Math.sqrt(rr()) * (R - 80), x = Math.cos(a) * d2, z = Math.sin(a) * d2;
    if (heightAt(x, z) > 0 || ramps.some(rp => (rp.x - x) ** 2 + (rp.z - z) ** 2 < (rp.len + 20) ** 2) || hazards.some(h => (h.x - x) ** 2 + (h.z - z) ** 2 < 900)) continue;
    const t = rr(); spots.push({ type: t < 0.55 ? 'w' : t < 0.82 ? 'n' : 'h', x, z, y: 0 });
  }

  const samples = []; for (let i = 0; i < N; i++) { const a = i / N * 6.283; samples.push({ p: V(Math.cos(a) * R, 0, Math.sin(a) * R), t: V(-Math.sin(a), 0, Math.cos(a)), n: V(Math.cos(a), 0, Math.sin(a)), d: i * 9, k: 0 }); }
  const track = { def: { id: 'roam', name: 'Free Roam' }, theme, group, samples, N, length: 6.283 * R, halfW: R, isArena: true, isRoam: true, ramps, hazards, jumps: [], waterY: -999, radius: R, maxUp: 26, heightAt,
    locate: () => 0, locateGlobal: () => 0, groundY: (i, x, z) => heightAt(x, z), lateral: () => 0, inTunnel: () => false, heading: () => 0, terrainH: () => 0,
    pointAt: (i, lat, out = V()) => out.set(0, 0, 0), pickupSpots: spots,
    constrain(car) { // soft edge: no damage, just turn the car back
      const dd = Math.hypot(car.x, car.z), lim = R - 3; if (dd <= lim) return 0;
      const nx = car.x / dd, nz = car.z / dd; car.x = nx * lim; car.z = nz * lim; const vn = car.vx * nx + car.vz * nz; if (vn > 0) { car.vx -= nx * vn * 1.6; car.vz -= nz * vn * 1.6; } return 0;
    },
    grid: k => k === 0 ? { x: 0, y: 0, z: 0, h: 0, idx: 0 } : { x: -42 + (k - 1) * 14, y: 0, z: -26, h: 0, idx: 0 } };
  for (const s of spots) s.y = heightAt(s.x, s.z);
  return track;
}
