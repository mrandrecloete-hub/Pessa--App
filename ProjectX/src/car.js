// Vehicle: procedural 3D model and arcade driving physics.
import * as THREE from 'three';
import { buildStats } from './data.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const wrap = a => { while (a > Math.PI) a -= 6.283185307; while (a < -Math.PI) a += 6.283185307; return a; };

// Smooth interpolation through [t, value] keys.
function keys(k) {
  return t => { if (t <= k[0][0]) return k[0][1]; for (let i = 1; i < k.length; i++) if (t <= k[i][0]) { const a = k[i - 1], b = k[i], u = (t - a[0]) / (b[0] - a[0]); return a[1] + (b[1] - a[1]) * u * u * (3 - 2 * u); } return k[k.length - 1][1]; };
}
// Lofted body: rounded cross sections swept along the car's length, smooth normals.
// fn(t) -> { w, y0, y1, e, tumble }. split(y, t) -> material group index.
function loft(z0, z1, n, m, fn, split) {
  const pos = [], groups = [[], []];
  for (let i = 0; i <= n; i++) {
    const t = i / n, z = z0 + (z1 - z0) * t, s = fn(t), cy = (s.y0 + s.y1) / 2, hy = (s.y1 - s.y0) / 2, p = 2 / (s.e || 3.5);
    for (let j = 0; j < m; j++) {
      const a = j / m * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a), yy = Math.sign(sn) * Math.abs(sn) ** p;
      pos.push(s.w * Math.sign(c) * Math.abs(c) ** p * (1 - (s.tumble || 0) * Math.max(0, yy)), cy + hy * yy, z);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const a = i * m + j, b = i * m + (j + 1) % m, c = (i + 1) * m + j, d = (i + 1) * m + (j + 1) % m;
    const g = split ? split((pos[a * 3 + 1] + pos[b * 3 + 1] + pos[c * 3 + 1] + pos[d * 3 + 1]) / 4, (i + 0.5) / n) : 0;
    groups[g].push(a, b, c, b, d, c);
  }
  const cap = (i, z, front) => { const s = fn(i / n), ci = pos.length / 3; pos.push(0, (s.y0 + s.y1) / 2, z); for (let j = 0; j < m; j++) { const a = i * m + j, b = i * m + (j + 1) % m; front ? groups[0].push(ci, a, b) : groups[0].push(ci, b, a); } };
  cap(0, z0, false); cap(n, z1, true);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(groups[0].concat(groups[1])); g.addGroup(0, groups[0].length, 0); if (groups[1].length) g.addGroup(groups[0].length, groups[1].length, 1);
  g.computeVertexNormals(); return g;
}

let wheelGeo = null;
function wheelParts() {
  if (wheelGeo) return wheelGeo;
  const V2 = (x, y) => new THREE.Vector2(x, y);
  // unit radius; scaled per car. Lathe spins around Y, then laid on its side.
  const tyre = new THREE.LatheGeometry([V2(0.6, -0.19), V2(0.9, -0.19), V2(0.985, -0.14), V2(1, -0.06), V2(1, 0.06), V2(0.985, 0.14), V2(0.9, 0.19), V2(0.6, 0.19)], 28).rotateZ(Math.PI / 2);
  const rim = new THREE.LatheGeometry([V2(0.62, -0.17), V2(0.66, -0.2), V2(0.66, 0.2), V2(0.62, 0.17), V2(0.56, 0.12), V2(0.56, -0.12), V2(0.62, -0.17)], 24).rotateZ(Math.PI / 2);
  const disc = new THREE.CylinderGeometry(0.5, 0.5, 0.05, 20).rotateZ(Math.PI / 2), hub = new THREE.CylinderGeometry(0.16, 0.2, 0.3, 12).rotateZ(Math.PI / 2);
  const spoke = new THREE.BoxGeometry(0.07, 0.6, 0.13); spoke.translate(0, 0.32, 0);
  return (wheelGeo = { tyre, rim, disc, hub, spoke });
}

export function buildCarModel(veh, paintHex, rimHex) {
  const s = veh.shape, L = s.len, W = s.wid, H = s.h, half = L / 2, b = H * 0.58;
  const group = new THREE.Group(), body = new THREE.Group(); group.add(body); body.position.y = s.ride;
  const paint = new THREE.MeshPhysicalMaterial({ color: paintHex ?? veh.color, metalness: 0.7, roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.25 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x05090f, metalness: 1, roughness: 0.03, clearcoat: 1, envMapIntensity: 1.6 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x101114, metalness: 0.5, roughness: 0.55 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x1a1c20, metalness: 0.85, roughness: 0.32 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xa4a9b3, metalness: 1, roughness: 0.18 });
  const add = (geo, mat, x, y, z, parent = body) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  const tailH = b * Math.max(0.6, Math.min(1, 0.55 + s.tail * 0.6)), noseH = b * Math.max(0.42, Math.min(0.95, 0.4 + s.nose * 0.9));
  const cabC = -half + L * s.cab, c0 = cabC - L * 0.21, c1 = cabC + L * 0.24, tc0 = (c0 + half) / L, tc1 = (c1 + half) / L;
  const topF = keys([[0, tailH * 0.86], [0.05, tailH], [Math.max(0.1, tc0 - 0.03), b], [Math.min(0.86, tc1 + 0.04), b], [0.92, noseH], [1, noseH * 0.7]]);
  const widF = keys([[0, 0.84], [0.12, 1], [0.72, 1], [0.92, 0.93], [1, 0.74 + s.nose * 0.2]]), botF = keys([[0, 0.24], [0.1, 0.1], [0.9, 0.1], [1, 0.2]]);
  add(loft(-half, half, 30, 28, t => ({ w: W / 2 * widF(t), y0: botF(t), y1: topF(t), e: 3.6, tumble: 0.07 })), paint, 0, 0, 0);
  const roofF = keys([[0, 0.04], [0.26, 1], [0.62, 1], [1, 0.04]]), roofY = b + (H - b) * 0.8;
  add(loft(c0, c1, 18, 22, t => ({ w: W * 0.41 * (0.9 + 0.1 * Math.sin(Math.PI * t)), y0: b - 0.14, y1: b - 0.1 + (H - b + 0.1) * roofF(t), e: 3, tumble: 0.26 }), y => y > roofY ? 1 : 0), [glass, paint], 0, 0, 0);
  // lower trim: splitter, skirts, diffuser
  add(box(W * 0.66, 0.06, 0.34), carbon, 0, 0.12, half - 0.2); add(box(W * 0.7, 0.09, 0.3), carbon, 0, 0.16, -half + 0.2);
  for (const sg of [-1, 1]) { add(box(0.08, 0.1, L * 0.36), carbon, sg * (W / 2 - 0.06), 0.13, 0); add(box(0.2, 0.09, 0.07), trim, sg * (W * 0.41 + 0.06), b + 0.07, c1 - 0.55); }
  add(box(W * 0.56, noseH * 0.34, 0.06), trim, 0, noseH * 0.34, half - 0.015); // grille
  // lights
  const head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: s.glow ? 0x66c8ff : 0xfff2c0, emissiveIntensity: 3.2 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff1a1a, emissiveIntensity: 2.6 });
  const lens = new THREE.SphereGeometry(1, 12, 8);
  for (const sg of [-1, 1]) { const h1 = add(lens, head, sg * (W / 2 * 0.62), noseH * 0.66, half - 0.1); h1.scale.set(0.24, 0.075, 0.16); h1.castShadow = false; const t1 = add(lens, tail, sg * (W / 2 * 0.6), tailH * 0.78, -half + 0.06); t1.scale.set(0.26, 0.06, 0.1); t1.castShadow = false; }
  add(box(W * 0.5, 0.035, 0.05), tail, 0, tailH * 0.78, -half + 0.0).castShadow = false;
  for (const sg of [-1, 1]) add(new THREE.CylinderGeometry(0.075, 0.085, 0.32, 10).rotateX(Math.PI / 2), metal, sg * W * 0.24, 0.2, -half - 0.02);
  if (s.spoiler) {
    const wy = s.spoiler === 2 ? tailH + 0.44 : tailH + 0.13;
    add(box(W * (s.spoiler === 2 ? 1.0 : 0.86), 0.045, 0.4), s.spoiler === 2 ? carbon : paint, 0, wy, -half + 0.24).rotation.x = -0.12;
    if (s.spoiler === 2) for (const sg of [-1, 1]) { add(box(0.05, wy - tailH + 0.12, 0.22), carbon, sg * W * 0.3, (wy + tailH) / 2 - 0.06, -half + 0.3); add(box(0.04, 0.24, 0.46), paint, sg * W * 0.5, wy + 0.05, -half + 0.24); }
  }
  if (s.scoop) { add(box(0.62, 0.17, 0.95), paint, 0, b + 0.03, c1 + 0.85); add(box(0.5, 0.1, 0.05), trim, 0, b + 0.05, c1 + 1.33); }
  if (s.bull) { const bar = new THREE.CylinderGeometry(0.045, 0.045, W - 0.2, 8).rotateZ(Math.PI / 2); add(bar, metal, 0, noseH * 0.95, half + 0.16); add(bar, metal, 0, 0.34, half + 0.16); for (const sg of [-1, 1]) add(new THREE.CylinderGeometry(0.045, 0.045, noseH * 0.95 - 0.2, 8), metal, sg * W * 0.3, noseH * 0.5 + 0.1, half + 0.16); }
  if (s.rack) { add(new THREE.CylinderGeometry(0.03, 0.03, W * 0.72, 6).rotateZ(Math.PI / 2), metal, 0, H + 0.2, c1 - 0.95); for (let i = -1.5; i <= 1.5; i++) { const l = add(lens, head, i * 0.3, H + 0.27, c1 - 0.93); l.scale.set(0.1, 0.1, 0.06); l.castShadow = false; } }
  if (s.fins) for (const sg of [-1, 1]) add(box(0.04, 0.5, 1.1), carbon, sg * W * 0.34, tailH + 0.18, -half + 0.7).rotation.x = -0.2;
  if (s.glow) { const g = add(new THREE.PlaneGeometry(W * 1.1, L * 1.05), new THREE.MeshBasicMaterial({ color: 0x3aa8ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 0.04 - s.ride, 0); g.rotation.x = -Math.PI / 2; g.castShadow = false; }
  // roof weapon mount
  const guns = new THREE.Group(); guns.position.set(0, Math.max(H, b) + 0.02, cabC + 0.05); body.add(guns);
  add(new THREE.CylinderGeometry(0.2, 0.26, 0.12, 12), carbon, 0, 0.06, 0, guns); add(box(0.34, 0.17, 0.5), carbon, 0, 0.19, 0.02, guns); add(box(0.12, 0.2, 0.3), trim, 0.24, 0.17, -0.05, guns);
  for (const sg of [-1, 1]) { add(new THREE.CylinderGeometry(0.038, 0.038, 1.25, 8).rotateX(Math.PI / 2), metal, sg * 0.1, 0.2, 0.75, guns); add(new THREE.CylinderGeometry(0.055, 0.055, 0.16, 8).rotateX(Math.PI / 2), trim, sg * 0.1, 0.2, 1.36, guns); }
  // wheels and arches
  const wr = s.wheel, WG = wheelParts(), tireM = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.9 });
  const rim = new THREE.MeshStandardMaterial({ color: rimHex ?? 0x1b1d22, metalness: 1, roughness: 0.22 }), calip = new THREE.MeshStandardMaterial({ color: 0xd01818, roughness: 0.4, metalness: 0.4 });
  const arch = new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), wheels = [];
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const wx = sx * (W / 2 - 0.05), wz = sz * L * 0.31;
    const piv = new THREE.Group(); piv.position.set(wx, wr, wz); group.add(piv);
    const w = new THREE.Group(); w.scale.setScalar(wr); piv.add(w);
    add(WG.tyre, tireM, 0, 0, 0, w); add(WG.rim, rim, 0, 0, 0, w); add(WG.disc, metal, sx * 0.02, 0, 0, w); add(WG.hub, rim, sx * 0.08, 0, 0, w);
    for (let k = 0; k < 5; k++) { const sp = add(WG.spoke, rim, sx * 0.15, 0, 0, w); sp.rotation.x = k / 5 * Math.PI * 2; }
    add(box(0.08, wr * 0.5, wr * 0.34), calip, sx * 0.04, wr * 0.2, wr * 0.36, piv);
    const f = add(arch, paint, wx - sx * 0.08, wr * 1.6 - s.ride, wz); f.scale.set(0.27, wr * 0.62, wr * 1.42);
    wheels.push({ piv, w, front: sz > 0 });
  }
  const shield = new THREE.Mesh(new THREE.SphereGeometry(L * 0.72, 24, 14), new THREE.MeshBasicMaterial({ color: 0x4ab8ff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }));
  shield.position.y = 0.8; shield.scale.set(0.8, 0.6, 1); shield.visible = false; group.add(shield);
  return { group, body, wheels, paint, rim, shield, gunY: s.ride + Math.max(H, b) + 0.25, baseColor: new THREE.Color(paintHex ?? veh.color) };
}

export class Car {
  constructor(veh, opts = {}) {
    this.veh = veh; this.stats = buildStats(veh, opts.upgrades);
    this.name = opts.name || veh.name; this.isPlayer = !!opts.isPlayer; this.ai = opts.ai || null;
    this.model = buildCarModel(veh, opts.paint, opts.rim);
    if (opts.hpMul) this.stats.health *= opts.hpMul;
    this.speedMul = 1; this.input = { thr: 0, steer: 0, hb: false, nitro: false, fire: false };
    this.x = 0; this.y = 0; this.z = 0; this.vx = 0; this.vy = 0; this.vz = 0; this.h = 0;
    this.speed = 0; this.side = 0; this.idx = 0; this.lap = 0; this.cp = 2; this.air = false; this.airT = 0; this.airX = 0; this.airZ = 0; this.parked = false;
    this.health = this.stats.health; this.nitro = this.stats.nitroCap * 0.6;
    this.weapon = null; this.ammo = 0; this.cd = 0; this.shield = 0; this.emp = 0; this.wrecked = 0; this.invuln = 0;
    this.kills = 0; this.deaths = 0; this.lastHit = null; this.finished = false; this.finishTime = 0;
    this.lapStart = 0; this.bestLap = 0; this.lapTimes = []; this.spin = 0; this.steerVis = 0; this.boosting = false; this.slip = 0; this.smokeT = 0;
  }
  place(g) { this.x = g.x; this.y = g.y; this.z = g.z; this.h = g.h; this.idx = g.idx; this.vx = this.vy = this.vz = 0; this.speed = 0; this.syncModel(0, null); }
  get progress() { return this.lap * 100000 + this.idx - (this.lap === 0 ? 100000 : 0); }
  gear() { const f = Math.abs(this.speed) / this.stats.top; return this.speed < -0.5 ? 'R' : String(1 + Math.min(5, Math.floor(f * 6))); }
  rpm() { const f = clamp(Math.abs(this.speed) / this.stats.top, 0, 1.2) * 6, g = Math.min(5, Math.floor(f)); return clamp(0.25 + (f - g) * 0.75, 0, 1.1); }

  update(dt, game) {
    const tr = game.track, st = this.stats, inp = this.input;
    if (this.cd > 0) this.cd -= dt; if (this.shield > 0) this.shield -= dt; if (this.emp > 0) this.emp -= dt; if (this.invuln > 0) this.invuln -= dt;
    if (this.wrecked > 0) { this.wrecked -= dt; if (this.wrecked <= 0) game.respawn(this); return; }
    const dead = this.emp > 0 || game.locked || this.finished && this.isPlayer;
    let thr = dead ? 0 : clamp(inp.thr, -1, 1); const steer = dead && !this.finished ? 0 : clamp(inp.steer, -1, 1), hb = inp.hb && !dead;
    this.steerVis += (steer - this.steerVis) * Math.min(1, dt * 10);
    const wet = this.y < tr.waterY - 0.05;
    this.boosting = inp.nitro && this.nitro > 0 && !dead && thr > 0 && !this.air;
    if (this.boosting) this.nitro = Math.max(0, this.nitro - 26 * dt); else this.nitro = Math.min(st.nitroCap, this.nitro + 2.2 * dt);
    const top = st.top * this.speedMul * (this.boosting ? 1.28 : 1) * (wet ? 0.78 : 1);
    // heading first, then decompose velocity along the new axes
    const sp0 = this.speed, asp = Math.abs(sp0);
    if (!this.air) {
      const rate = st.turn * Math.min(1, asp / 7) * (1 - 0.58 * Math.min(1, asp / st.top)) * (hb ? 1.35 : 1);
      this.h -= this.steerVis * rate * dt * (sp0 < -0.5 ? -1 : 1);
    }
    const fx = Math.sin(this.h), fz = Math.cos(this.h), lx = fz, lz = -fx;
    let fwd = this.vx * fx + this.vz * fz, side = this.vx * lx + this.vz * lz;
    if (!this.air) {
      if (thr > 0) fwd += st.accel * this.speedMul * thr * (this.boosting ? 1.7 * st.nitroPow : 1) * Math.max(0, 1 - (Math.max(0, fwd) / top) ** 2) * dt;
      else if (thr < 0) { if (fwd > 1) fwd += 36 * thr * dt; else fwd = Math.max(-st.top * 0.3, fwd + st.accel * 0.7 * thr * dt); }
      fwd -= fwd * (0.1 + (hb ? 0.3 : 0) + (wet ? 0.5 : 0)) * dt + Math.sign(fwd) * Math.min(Math.abs(fwd), (thr === 0 ? 2.2 : 0.4) * dt);
      if (fwd > top) fwd -= (fwd - top) * 1.6 * dt;
      if (this.parked) fwd *= Math.exp(-2.6 * dt);
      const v0 = Math.hypot(fwd, side), g = hb ? st.grip * 0.42 / st.drift : st.grip;
      side *= Math.exp(-g * dt);
      const v1 = Math.hypot(fwd, side); if (v1 > 0.5 && fwd > 0) fwd *= 1 + (v0 / v1 - 1) * 0.65;
    }
    this.slip = this.air ? 0 : Math.abs(side) + (hb ? asp * 0.1 : 0);
    this.vx = fx * fwd + lx * side; this.vz = fz * fwd + lz * side; this.speed = fwd; this.side = side;
    const lastY = this.y;
    this.x += this.vx * dt; this.z += this.vz * dt;
    const pi = this.idx; this.idx = tr.locate(this.x, this.z, this.idx);
    if (!tr.isArena && this.idx !== pi) { const c = Math.floor(this.idx * 3 / tr.N); if (c === (this.cp + 1) % 3) { this.cp = c; if (c === 0) game.lapDone(this); } }
    const hit = tr.constrain(this);
    if (hit > 2.5) { game.wallHit(this, hit); }
    for (const hzd of tr.hazards) {
      const dx = this.x - hzd.x, dz = this.z - hzd.z, d2 = dx * dx + dz * dz, rr = hzd.r + 1.3;
      if (d2 < rr * rr && d2 > 0.001) { const d = Math.sqrt(d2), nx = dx / d, nz = dz / d; this.x = hzd.x + nx * rr; this.z = hzd.z + nz * rr; const vn = this.vx * nx + this.vz * nz; if (vn < 0) { this.vx -= nx * vn * 1.5; this.vz -= nz * vn * 1.5; this.vx *= 0.8; this.vz *= 0.8; if (-vn > 2.5) game.wallHit(this, -vn * 1.3); } }
    }
    // open world: the back of a tall ramp is a wall
    if (tr.heightAt && tr.heightAt(this.x, this.z) - this.y > 1.1) { const v = Math.hypot(this.vx, this.vz); this.x -= this.vx * dt; this.z -= this.vz * dt; this.vx *= -0.2; this.vz *= -0.2; if (v > 4) game.wallHit(this, v * 0.6); }
    // vertical
    const gy = tr.groundY(this.idx, this.x, this.z);
    this.vy -= 30 * dt; this.y += this.vy * dt;
    if (this.air) this.airT += dt;
    if (this.y <= gy) { if (this.air && this.vy < -9) game.landed(this, -this.vy); if (this.air && this.airT > 0.5 && game.jumped) game.jumped(this); this.y = gy; this.vy = clamp((gy - lastY) / dt, -40, tr.maxUp || 14); this.air = false; }
    else if (this.y > gy + 0.2) { if (!this.air) { this.airX = this.x; this.airZ = this.z; this.airT = 0; } this.air = true; }
    this.syncModel(dt, tr);
  }

  syncModel(dt, tr) {
    const m = this.model, g = m.group;
    g.position.set(this.x, this.y, this.z); g.rotation.order = 'YXZ'; g.rotation.y = this.h;
    let pitch = 0;
    if (tr && !tr.isArena) { const a = tr.samples[(this.idx + 1) % tr.N].p.y, b = tr.samples[(this.idx + tr.N - 1) % tr.N].p.y; pitch = -Math.atan((a - b) / 6); if (tr.jumps.some(j => Math.abs(j - this.idx) < 2)) pitch = g.rotation.x; }
    if (tr && tr.heightAt && !this.air) { const fx = Math.sin(this.h), fz = Math.cos(this.h), Lh = this.veh.shape.len * 0.34; pitch = -Math.atan2(tr.heightAt(this.x + fx * Lh, this.z + fz * Lh) - tr.heightAt(this.x - fx * Lh, this.z - fz * Lh), 2 * Lh); }
    if (this.air) pitch = clamp(-this.vy * 0.02, -0.35, 0.35);
    g.rotation.x += (pitch - g.rotation.x) * Math.min(1, dt * 8 || 1);
    const f = this.speed / this.stats.top;
    m.body.rotation.z += (clamp(this.steerVis * f * 0.09 + this.side * 0.012, -0.14, 0.14) - m.body.rotation.z) * Math.min(1, dt * 6 || 1);
    m.body.rotation.x = clamp(-(this.input.thr > 0 ? 0.02 : 0) + (this.input.thr < 0 && this.speed > 3 ? 0.04 : 0), -0.05, 0.05);
    this.spin += this.speed * dt / this.veh.shape.wheel;
    for (const w of m.wheels) { w.w.rotation.x = this.spin; if (w.front) w.piv.rotation.y = -this.steerVis * 0.42; }
    m.shield.visible = this.shield > 0; if (m.shield.visible) m.shield.material.opacity = 0.2 + 0.1 * Math.sin(this.shield * 14);
    const dmg = 1 - clamp(this.health / this.stats.health, 0, 1);
    m.paint.color.copy(m.baseColor).lerp(Car.scorch, dmg * 0.75); m.paint.roughness = 0.26 + dmg * 0.55; m.paint.clearcoat = 1 - dmg;
    g.visible = this.wrecked <= 0 && (this.invuln <= 0 || Math.floor(this.invuln * 12) % 2 === 0);
  }
}
Car.scorch = new THREE.Color(0x18130f);
