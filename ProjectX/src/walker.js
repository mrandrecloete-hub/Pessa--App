// On-foot pilot for Free Roam: walk, run and jump, then get back into any vehicle.
import * as THREE from 'three';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Walker {
  constructor() {
    const g = this.group = new THREE.Group();
    const jacket = new THREE.MeshStandardMaterial({ color: 0xffb21e, roughness: 0.55, metalness: 0.1 }), pants = new THREE.MeshStandardMaterial({ color: 0x20242c, roughness: 0.8 });
    const helmet = new THREE.MeshStandardMaterial({ color: 0xf4f4f6, roughness: 0.28, metalness: 0.3 }), visor = new THREE.MeshStandardMaterial({ color: 0x0a1018, roughness: 0.08, metalness: 0.95 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.7 }), red = new THREE.MeshStandardMaterial({ color: 0xe3261b, roughness: 0.5 });
    const add = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
    const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const pivot = (x, y) => { const p = new THREE.Group(); p.position.set(x, y, 0); g.add(p); return p; };
    this.legL = pivot(0.13, 0.94); this.legR = pivot(-0.13, 0.94);
    for (const l of [this.legL, this.legR]) { add(B(0.18, 0.86, 0.22), pants, 0, -0.45, 0, l); add(B(0.2, 0.14, 0.34), dark, 0, -0.9, 0.05, l); }
    add(B(0.52, 0.64, 0.3), jacket, 0, 1.26, 0); add(B(0.54, 0.12, 0.32), red, 0, 1.0, 0); add(B(0.4, 0.5, 0.16), dark, 0, 1.3, -0.22);
    this.armL = pivot(0.37, 1.52); this.armR = pivot(-0.37, 1.52);
    for (const a of [this.armL, this.armR]) { add(B(0.14, 0.62, 0.16), jacket, 0, -0.3, 0, a); add(B(0.15, 0.14, 0.17), dark, 0, -0.66, 0, a); }
    add(new THREE.SphereGeometry(0.19, 16, 12), helmet, 0, 1.78, 0); add(B(0.28, 0.1, 0.14), visor, 0, 1.79, 0.13);
    this.x = this.y = this.z = 0; this.h = 0; this.vy = 0; this.air = false; this.speed = 0; this.phase = 0; this.jumpHeld = false; this.lastSin = 0;
  }
  place(x, y, z, h) { this.x = x; this.y = y; this.z = z; this.h = h; this.vy = 0; this.air = false; this.speed = 0; this.sync(0); }

  update(dt, inp, game) {
    const tr = game.track, run = inp.nitro;
    const want = inp.thr > 0 ? (run ? 8.6 : 3.9) : inp.thr < 0 ? -2.3 : 0;
    this.speed += (want - this.speed) * Math.min(1, dt * (want === 0 ? 10 : 7));
    this.h -= inp.steer * (run ? 1.9 : 2.5) * dt;
    if (inp.hb && !this.jumpHeld && !this.air) { this.vy = 7.4; this.air = true; this.jumpHeld = true; } if (!inp.hb) this.jumpHeld = false;
    let nx = this.x + Math.sin(this.h) * this.speed * dt, nz = this.z + Math.cos(this.h) * this.speed * dt;
    const push = (cx, cz, rad) => { const dx = nx - cx, dz = nz - cz, d2 = dx * dx + dz * dz; if (d2 < rad * rad && d2 > 1e-6) { const d = Math.sqrt(d2); nx = cx + dx / d * rad; nz = cz + dz / d * rad; } };
    for (const c of game.cars) {
      if (c.wrecked > 0 || Math.abs(c.y - this.y) > 3) continue;
      const s = c.veh.shape, rad = s.wid * 0.55 + 0.4, fx = Math.sin(c.h) * s.len * 0.28, fz = Math.cos(c.h) * s.len * 0.28;
      push(c.x, c.z, rad); push(c.x + fx, c.z + fz, rad); push(c.x - fx, c.z - fz, rad);
    }
    for (const h of tr.hazards) push(h.x, h.z, h.r + 0.55);
    const dd = Math.hypot(nx, nz), lim = tr.radius - 3; if (dd > lim) { nx *= lim / dd; nz *= lim / dd; }
    if (tr.heightAt(nx, nz) - this.y > 0.9) { nx = this.x; nz = this.z; this.speed = 0; } // too steep or too tall: blocked
    this.x = nx; this.z = nz;
    const gy = tr.heightAt(this.x, this.z);
    if (this.air) { this.vy -= 22 * dt; this.y += this.vy * dt; if (this.y <= gy) { this.y = gy; this.vy = 0; this.air = false; game.audio.step(); } }
    else if (this.y - gy > 0.35) { this.air = true; this.vy = 0; } else this.y = gy;
    this.phase += Math.abs(this.speed) * dt * 2.3;
    const sn = Math.sin(this.phase); if (!this.air && Math.abs(this.speed) > 0.8 && sn * this.lastSin < 0) game.audio.step(); this.lastSin = sn;
    this.sync(dt);
  }
  sync(dt) {
    const g = this.group; g.position.set(this.x, this.y, this.z); g.rotation.y = this.h;
    const amp = clamp(Math.abs(this.speed) / 3.9, 0, 1.5) * 0.8, s = Math.sin(this.phase) * amp * Math.sign(this.speed || 1);
    if (this.air) { this.legL.rotation.x = -0.7; this.legR.rotation.x = 0.35; this.armL.rotation.x = -2.2; this.armR.rotation.x = -2.2; }
    else { this.legL.rotation.x = s; this.legR.rotation.x = -s; this.armL.rotation.x = -s * 0.9; this.armR.rotation.x = s * 0.9; }
    g.rotation.x = this.air ? 0 : Math.min(0.28, Math.abs(this.speed) * 0.025);
  }
}
