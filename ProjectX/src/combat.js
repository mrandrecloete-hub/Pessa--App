// Particles, projectiles, weapons and pickups.
import * as THREE from 'three';
import { WEAPONS } from './data.js';
import { wrap } from './car.js';

// ---------- Particle system (two blended point clouds)
const VS = `attribute float size; attribute vec4 col; varying vec4 vc; uniform float scale;
void main(){ vc = col; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = size*scale/max(0.1,-mv.z); gl_Position = projectionMatrix*mv; }`;
const FS = `varying vec4 vc; void main(){ vec2 d = gl_PointCoord-0.5; float a = 1.0 - smoothstep(0.12,0.5,length(d)); gl_FragColor = vec4(vc.rgb, vc.a*a); }`;

class Cloud {
  constructor(n, additive) {
    this.n = n; this.next = 0;
    this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3); this.c = new Float32Array(n * 4); this.s = new Float32Array(n);
    this.life = new Float32Array(n); this.max = new Float32Array(n); this.s0 = new Float32Array(n); this.s1 = new Float32Array(n); this.a0 = new Float32Array(n); this.grav = new Float32Array(n); this.drag = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3)); g.setAttribute('col', new THREE.BufferAttribute(this.c, 4)); g.setAttribute('size', new THREE.BufferAttribute(this.s, 1));
    this.mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: { scale: { value: 600 } }, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.mesh = new THREE.Points(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 6 : 5;
  }
  emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, grav = 0, drag = 0) {
    const i = this.next; this.next = (i + 1) % this.n;
    this.p.set([x, y, z], i * 3); this.v.set([vx, vy, vz], i * 3); this.c.set([r, g, b, a], i * 4);
    this.life[i] = this.max[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a; this.grav[i] = grav; this.drag[i] = drag;
  }
  update(dt) {
    const { p, v, c, s, life, max } = this;
    for (let i = 0; i < this.n; i++) {
      if (life[i] <= 0) { if (s[i] !== 0) { s[i] = 0; c[i * 4 + 3] = 0; } continue; }
      life[i] -= dt; const t = 1 - Math.max(0, life[i]) / max[i], j = i * 3, d = Math.max(0, 1 - this.drag[i] * dt);
      v[j] *= d; v[j + 2] *= d; v[j + 1] = v[j + 1] * d - this.grav[i] * dt;
      p[j] += v[j] * dt; p[j + 1] += v[j + 1] * dt; p[j + 2] += v[j + 2] * dt;
      s[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t; c[i * 4 + 3] = this.a0[i] * (1 - t * t);
    }
    const a = this.mesh.geometry.attributes; a.position.needsUpdate = a.col.needsUpdate = a.size.needsUpdate = true;
  }
}

export class FX {
  constructor(scene, quality = 1) {
    this.q = quality; this.add = new Cloud(Math.round(1400 * quality) + 200, true); this.alpha = new Cloud(Math.round(900 * quality) + 150, false);
    scene.add(this.add.mesh, this.alpha.mesh);
    this.rings = []; this.scene = scene;
    this.light = new THREE.PointLight(0xffa040, 0, 60, 1.6); scene.add(this.light); this.lightT = 0;
  }
  setScale(h) { this.add.mat.uniforms.scale.value = this.alpha.mat.uniforms.scale.value = h * 0.9; }
  n(k) { return Math.max(1, Math.round(k * this.q)); }
  explosion(x, y, z, sc = 1) {
    const R = Math.random;
    for (let i = 0; i < this.n(26); i++) { const a = R() * 6.283, e = R() * 1.4, sp = (4 + R() * 14) * sc; this.add.emit(x, y + 0.5, z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 3, Math.sin(a) * Math.cos(e) * sp, 0.35 + R() * 0.5, 3 * sc, 9 * sc, 1, 0.45 + R() * 0.35, 0.08, 0.9, -2, 2.5); }
    for (let i = 0; i < this.n(14); i++) { const a = R() * 6.283, sp = (2 + R() * 6) * sc; this.alpha.emit(x, y + 1, z, Math.cos(a) * sp, 2 + R() * 5, Math.sin(a) * sp, 1.2 + R() * 1.2, 4 * sc, 14 * sc, 0.12, 0.11, 0.1, 0.7, -1.5, 1.2); }
    for (let i = 0; i < this.n(22); i++) { const a = R() * 6.283, sp = (10 + R() * 26) * sc; this.add.emit(x, y + 0.6, z, Math.cos(a) * sp, 6 + R() * 16, Math.sin(a) * sp, 0.5 + R() * 0.7, 0.7, 0.2, 1, 0.8, 0.4, 1, 26, 0.6); }
    this.add.emit(x, y + 1.2, z, 0, 0, 0, 0.16, 26 * sc, 46 * sc, 1, 0.9, 0.7, 1);
    for (let i = 0; i < this.n(8); i++) { const a = R() * 6.283, sp = (3 + R() * 5) * sc; this.add.emit(x, y + 0.8, z, Math.cos(a) * sp, 5 + R() * 6, Math.sin(a) * sp, 0.7 + R() * 0.5, 6 * sc, 13 * sc, 1, 0.32, 0.05, 0.7, -3, 1.5); }
    this.light.position.set(x, y + 3, z); this.light.intensity = 900 * sc; this.light.color.set(0xffa040); this.lightT = 0.25;
    this.ring(x, y + 0.3, z, 0xffb060, 10 * sc, 0.35);
  }
  sparks(x, y, z, n = 8, vx = 0, vz = 0) { const R = Math.random; for (let i = 0; i < this.n(n); i++) this.add.emit(x, y, z, vx * 0.4 + (R() - 0.5) * 12, 2 + R() * 7, vz * 0.4 + (R() - 0.5) * 12, 0.25 + R() * 0.4, 0.55, 0.15, 1, 0.75, 0.35, 1, 24, 0.5); }
  smoke(x, y, z, dark = 0.2, size = 2.2, a = 0.5) { const R = Math.random; this.alpha.emit(x + (R() - 0.5), y, z + (R() - 0.5), (R() - 0.5) * 1.5, 1.5 + R() * 2, (R() - 0.5) * 1.5, 0.9 + R() * 0.8, size, size * 3.2, dark, dark, dark, a, -0.8, 0.8); }
  dust(x, y, z, col, a = 0.35) { const R = Math.random; this.alpha.emit(x + (R() - 0.5) * 1.2, y + 0.2, z + (R() - 0.5) * 1.2, (R() - 0.5) * 2, 0.6 + R() * 1.4, (R() - 0.5) * 2, 0.6 + R() * 0.7, 1.4, 5, col.r, col.g, col.b, a, -0.3, 1); }
  flame(x, y, z, vx, vy, vz, blue) { const R = Math.random; this.add.emit(x, y, z, vx + (R() - 0.5) * 2, vy + (R() - 0.5) * 2, vz + (R() - 0.5) * 2, 0.18 + R() * 0.2, 1.6, 0.3, blue ? 0.3 : 1, blue ? 0.7 : 0.55, blue ? 1 : 0.12, 0.9); }
  trail(x, y, z, r, g, b, size = 1.2, life = 0.5) { this.alpha.emit(x, y, z, 0, 0.4, 0, life, size, size * 2.6, r, g, b, 0.45); }
  ring(x, y, z, color, radius, time) {
    let r = this.rings.find(q => q.t <= 0);
    if (!r) { const m = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 40), new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; this.scene.add(m); r = { m, t: 0 }; this.rings.push(r); }
    r.m.material.color.set(color); r.m.position.set(x, y, z); r.t = r.T = time; r.R = radius; r.m.visible = true;
  }
  weather(kind, cam, dt, col) {
    const R = Math.random, k = this.n(kind === 'rain' ? 5 : 3);
    for (let i = 0; i < k; i++) {
      const x = cam.x + (R() - 0.5) * 70, z = cam.z + (R() - 0.5) * 70, y = cam.y + (R() - 0.3) * 16;
      if (kind === 'sand') this.alpha.emit(x, y, z, 14 + R() * 8, (R() - 0.5) * 2, 4, 1.4, 1.5, 4, col.r, col.g, col.b, 0.22);
      else if (kind === 'snow') this.alpha.emit(x, y + 6, z, 2, -5 - R() * 3, 1, 1.6, 0.45, 0.45, 1, 1, 1, 0.8);
      else this.add.emit(x, y + 8, z, 1, -38, 0.5, 0.5, 0.35, 0.35, 0.5, 0.6, 0.9, 0.5);
    }
  }
  update(dt) {
    this.add.update(dt); this.alpha.update(dt);
    if (this.lightT > 0) { this.lightT -= dt; this.light.intensity *= Math.exp(-dt * 14); if (this.lightT <= 0) this.light.intensity = 0; }
    for (const r of this.rings) if (r.t > 0) { r.t -= dt; const k = 1 - r.t / r.T, s = 0.5 + r.R * k; r.m.scale.set(s, s, s); r.m.material.opacity = 0.85 * (1 - k); if (r.t <= 0) r.m.visible = false; }
  }
}

// Tyre marks: a ring buffer of dark quads laid on the road.
export class Skids {
  constructor(scene, n = 700) {
    this.n = n; this.i = 0; this.pos = new Float32Array(n * 12); const idx = []; for (let q = 0; q < n; q++) { const o = q * 4; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, side: THREE.DoubleSide })); this.mesh.frustumCulled = false; scene.add(this.mesh);
  }
  // a, b: previous and current points {x,y,z}; nx,nz: sideways unit vector
  add(a, b, nx, nz, w = 0.17) { const o = this.i * 12; this.i = (this.i + 1) % this.n; this.pos.set([a.x - nx * w, a.y + 0.07, a.z - nz * w, a.x + nx * w, a.y + 0.07, a.z + nz * w, b.x - nx * w, b.y + 0.07, b.z - nz * w, b.x + nx * w, b.y + 0.07, b.z + nz * w], o); this.mesh.geometry.attributes.position.needsUpdate = true; }
}

// ---------- Projectiles and weapons
const GEO = {
  mg: new THREE.BoxGeometry(0.09, 0.09, 2.6), rocket: new THREE.CylinderGeometry(0.16, 0.2, 1.3, 8).rotateX(Math.PI / 2),
  missile: new THREE.ConeGeometry(0.2, 1.5, 8).rotateX(Math.PI / 2), shell: new THREE.SphereGeometry(0.32, 10, 8), mine: new THREE.CylinderGeometry(0.75, 0.9, 0.3, 12),
};
const MAT = {
  mg: new THREE.MeshBasicMaterial({ color: 0xffe070 }), rocket: new THREE.MeshStandardMaterial({ color: 0xb02020, emissive: 0x551010, metalness: 0.6, roughness: 0.4 }),
  missile: new THREE.MeshStandardMaterial({ color: 0xe8e8ee, emissive: 0x333344, metalness: 0.7, roughness: 0.3 }), shell: new THREE.MeshBasicMaterial({ color: 0xffb030 }),
  mine: new THREE.MeshStandardMaterial({ color: 0x2a2d33, emissive: 0xff2010, emissiveIntensity: 1, metalness: 0.7, roughness: 0.4 }),
};

export class Combat {
  constructor(game) { this.g = game; this.shots = []; this.pool = {}; this.pickups = []; }
  mesh(type) { const p = this.pool[type] || (this.pool[type] = []); const m = p.pop() || new THREE.Mesh(GEO[type], MAT[type]); m.visible = true; if (!m.parent) this.g.scene.add(m); return m; }
  free(s) { s.mesh.visible = false; (this.pool[s.type] || (this.pool[s.type] = [])).push(s.mesh); }

  // Best target ahead of a car inside a cone.
  target(car, range, cone) {
    let best = null, bd = range; const fx = Math.sin(car.h), fz = Math.cos(car.h);
    for (const o of this.g.cars) {
      if (o === car || o.wrecked > 0 || o.finished) continue;
      const dx = o.x - car.x, dz = o.z - car.z, d = Math.hypot(dx, dz); if (d > bd || d < 1) continue;
      if ((dx * fx + dz * fz) / d < Math.cos(cone)) continue; best = o; bd = d;
    }
    return best;
  }
  give(car, id) { car.weapon = id; car.ammo = Math.max(1, Math.round(WEAPONS[id].ammo * car.stats.ammoMul)); }

  fire(car) {
    const g = this.g, id = car.weapon; if (!id || car.ammo <= 0 || car.cd > 0 || car.wrecked > 0 || car.emp > 0 || g.locked) return false;
    const W = WEAPONS[id]; car.cd = W.cd; car.ammo--;
    const fx = Math.sin(car.h), fz = Math.cos(car.h), mx = car.x + fx * 2.4, mz = car.z + fz * 2.4, my = car.y + car.model.gunY;
    const base = { owner: car, type: id, x: mx, y: my, z: mz, idx: car.idx, age: 0 };
    if (id === 'mg') {
      const t = this.target(car, 130, 0.2); let dx = fx, dz = fz;
      if (t) { const lead = Math.hypot(t.x - mx, t.z - mz) / 240, ax = t.x + t.vx * lead - mx, az = t.z + t.vz * lead - mz, d = Math.hypot(ax, az); dx = ax / d; dz = az / d; }
      const sp = (Math.random() - 0.5) * 0.03; dx += -dz * sp; dz += dx * sp;
      const side = (car.ammo % 2 ? 1 : -1) * 0.14;
      this.add({ ...base, x: mx + fz * side, z: mz - fx * side, vx: dx * 240, vy: 0, vz: dz * 240, life: 0.55, dmg: W.dmg, r: 2.1 });
      g.fx.flame(mx, my, mz, fx * 6, 0, fz * 6); g.audio.shot('mg', car);
    } else if (id === 'rocket') {
      const sp = Math.max(0, car.speed) + 75; this.add({ ...base, vx: fx * sp, vy: 0, vz: fz * sp, life: 3, dmg: W.dmg, r: 2.4, splash: 7 }); g.audio.shot('rocket', car);
    } else if (id === 'missile') {
      const sp = Math.max(0, car.speed) * 0.6 + 62; this.add({ ...base, vx: fx * sp, vy: 0, vz: fz * sp, sp, life: 5, dmg: W.dmg, r: 2.4, splash: 5, tgt: this.target(car, 190, 0.9) }); g.audio.shot('rocket', car);
    } else if (id === 'shell') {
      const t = this.target(car, 150, 0.5), T = 0.93; let hv = Math.max(0, car.speed) + 40, dx = fx, dz = fz;
      if (t) { const ax = t.x + t.vx * T - mx, az = t.z + t.vz * T - mz, d = Math.hypot(ax, az); hv = Math.min(130, Math.max(20, d / T)); dx = ax / d; dz = az / d; }
      this.add({ ...base, vx: dx * hv, vy: 14, vz: dz * hv, life: 4, dmg: W.dmg, r: 2.6, splash: 9, grav: 30 }); g.audio.shot('shell', car);
    } else if (id === 'mine') {
      this.add({ ...base, x: car.x - fx * 3.2, z: car.z - fz * 3.2, y: car.y + 0.15, vx: 0, vy: 0, vz: 0, life: 45, dmg: W.dmg, r: 3.2, splash: 6 }); g.audio.shot('mine', car);
    } else if (id === 'emp') {
      g.fx.ring(car.x, car.y + 0.5, car.z, 0x60c8ff, 40, 0.6); g.fx.ring(car.x, car.y + 1, car.z, 0xffffff, 26, 0.4); g.audio.shot('emp', car);
      for (const o of g.cars) if (o !== car && o.wrecked <= 0 && Math.hypot(o.x - car.x, o.z - car.z) < 40 && o.shield <= 0 && o.invuln <= 0) { o.emp = 2.6; g.damage(o, W.dmg, car); g.fx.sparks(o.x, o.y + 1, o.z, 10); }
    } else if (id === 'shield') { car.shield = 6; g.audio.shot('shield', car); }
    if (car.ammo <= 0) car.weapon = null;
    return true;
  }
  add(s) { s.mesh = this.mesh(s.type); s.mesh.position.set(s.x, s.y, s.z); this.shots.push(s); }

  boom(s) {
    const g = this.g; g.fx.explosion(s.x, s.y, s.z, s.splash ? s.splash / 7 : 0.4); g.audio.boom(s.x, s.z, s.splash ? 1 : 0.4);
    if (s.splash) for (const o of g.cars) { if (o.wrecked > 0) continue; const d = Math.hypot(o.x - s.x, o.z - s.z); if (d < s.splash && (o !== s.owner || s.type === 'mine')) { g.damage(o, s.dmg * (1 - 0.6 * d / s.splash), s.owner); const k = (1 - d / s.splash) * 9 / o.stats.mass; o.vx += (o.x - s.x) / (d + 0.5) * k; o.vz += (o.z - s.z) / (d + 0.5) * k; if (!o.air) o.vy = 4 * k / 9 + 2; } }
    g.shakeAt(s.x, s.z, s.splash ? 1 : 0.2);
  }

  update(dt) {
    const g = this.g, tr = g.track;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i]; s.age += dt; s.life -= dt; let dead = s.life <= 0, hit = false;
      if (s.type === 'missile' && s.tgt && s.tgt.wrecked <= 0) {
        const want = Math.atan2(s.tgt.x - s.x, s.tgt.z - s.z), cur = Math.atan2(s.vx, s.vz), d = wrap(want - cur), a = cur + Math.max(-2.6 * dt, Math.min(2.6 * dt, d));
        s.vx = Math.sin(a) * s.sp; s.vz = Math.cos(a) * s.sp; s.sp = Math.min(95, s.sp + 20 * dt);
      }
      if (s.grav) s.vy -= s.grav * dt;
      const steps = s.type === 'mg' ? 2 : 1;
      for (let k = 0; k < steps && !hit; k++) {
        s.x += s.vx * dt / steps; s.y += s.vy * dt / steps; s.z += s.vz * dt / steps;
        const armed = s.type !== 'mine' || s.age > 0.7;
        if (armed) for (const o of g.cars) {
          if (o.wrecked > 0 || (o === s.owner && (s.type !== 'mine' || s.age < 2.5))) continue;
          const dx = o.x - s.x, dz = o.z - s.z; if (dx * dx + dz * dz < s.r * s.r && Math.abs(o.y + 0.7 - s.y) < 2.4) { hit = true; if (!s.splash) { g.damage(o, s.dmg, s.owner); g.fx.sparks(s.x, s.y, s.z, 5, o.vx, o.vz); g.audio.hit(o); } break; }
        }
      }
      if (s.type !== 'mine') {
        s.idx = tr.locate(s.x, s.z, s.idx); const gy = tr.groundY(s.idx, s.x, s.z);
        if (s.grav) { if (s.y <= gy + 0.2) hit = true; } else if (s.type !== 'mg') s.y += (gy + 0.9 - s.y) * Math.min(1, dt * 6);
        if (tr.isArena ? Math.hypot(s.x, s.z) > tr.radius : Math.abs(tr.lateral(s.idx, s.x, s.z)) > tr.halfW + 0.4) { if (s.type === 'mg') dead = true; else hit = true; }
        for (const h of tr.hazards) if ((h.x - s.x) ** 2 + (h.z - s.z) ** 2 < h.r * h.r && s.y < gy + 6) { if (s.type === 'mg') { dead = true; g.fx.sparks(s.x, s.y, s.z, 3); } else hit = true; }
      }
      s.mesh.position.set(s.x, s.y, s.z);
      if (s.type === 'mine') { s.mesh.material.emissiveIntensity = 0.4 + (Math.sin(g.time * 10) > 0 ? 1.6 : 0); }
      else { s.mesh.rotation.y = Math.atan2(s.vx, s.vz); if (s.type === 'rocket' || s.type === 'missile') { g.fx.flame(s.x, s.y, s.z, -s.vx * 0.1, 0, -s.vz * 0.1, s.type === 'missile'); g.fx.trail(s.x, s.y, s.z, 0.75, 0.75, 0.75, 0.9, 0.45); } else if (s.type === 'shell') g.fx.flame(s.x, s.y, s.z, 0, 0, 0); }
      if (hit && (s.splash || s.type !== 'mg')) this.boom(s);
      if (hit || dead) { this.free(s); this.shots.splice(i, 1); }
    }
    // pickups
    for (const p of this.pickups) {
      if (p.t > 0) { p.t -= dt; if (p.t <= 0) p.mesh.visible = true; continue; }
      p.mesh.rotation.y += dt * 2; p.mesh.position.y = p.y + 1.1 + Math.sin(g.time * 3 + p.x) * 0.15;
      for (const c of g.cars) {
        if (c.parked || c.wrecked > 0 || (c.x - p.x) ** 2 + (c.z - p.z) ** 2 > 7.3 || Math.abs(c.y - p.y) > 3) continue;
        if (p.type === 'w') { if (c.weapon && c.ammo > 0 && !c.isPlayer && Math.random() < 0.5) continue; this.give(c, g.rollWeapon()); }
        else if (p.type === 'n') c.nitro = Math.min(c.stats.nitroCap, c.nitro + 50);
        else { if (c.health >= c.stats.health) continue; c.health = Math.min(c.stats.health, c.health + c.stats.health * 0.35); }
        p.t = 9; p.mesh.visible = false; g.audio.pickup(c, p.type); g.fx.ring(p.x, p.y + 0.4, p.z, p.col, 4, 0.3); if (c.isPlayer) g.onPickup(p.type, c); break;
      }
    }
  }

  spawnPickups(track, allow) {
    const cols = { w: 0xff8a1e, n: 0x2ea8ff, h: 0x3be06a }, geo = new THREE.BoxGeometry(1.5, 1.5, 1.5), ig = new THREE.OctahedronGeometry(0.55, 0);
    for (const s of track.pickupSpots) {
      if (!allow.includes(s.type)) continue;
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: cols[s.type], emissive: cols[s.type], emissiveIntensity: 0.9, transparent: true, opacity: 0.45, roughness: 0.2 }));
      m.add(new THREE.Mesh(ig, new THREE.MeshBasicMaterial({ color: 0xffffff })));
      m.position.set(s.x, s.y + 1.1, s.z); this.g.scene.add(m);
      this.pickups.push({ ...s, mesh: m, t: 0, col: cols[s.type] });
    }
  }
}
