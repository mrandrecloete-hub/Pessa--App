// One race session: scene, cars, laps, damage, camera. Used by every game mode.
import * as THREE from 'three';
import { vehicleById, trackById, ARENA, DIFFICULTY, WEAPONS, VEHICLES } from './data.js';
import { buildTrack, buildArena, makeSky } from './track.js';
import { buildRoam } from './roam.js';
import { Walker } from './walker.js';
import { Save } from './save.js';
import { Car, wrap } from './car.js';
import { FX, Combat, Skids } from './combat.js';
import { makeAI, updateAI } from './ai.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DUSTY = { rocks: 1, jungle: 1, bunkers: 1, pines: 0.4 };

export class Race {
  // cfg: { mode: 'race'|'trial'|'arena'|'boss', track, laps, diff, car, upgrades, paint, rim, startWeapon, field: [{name, car, skill, aggro, defend, hpMul}] }
  constructor(app, cfg) {
    this.app = app; this.cfg = cfg; this.audio = app.audio; this.mode = cfg.mode; this.diff = DIFFICULTY[cfg.diff] || DIFFICULTY.normal;
    const q = app.q, arena = cfg.mode === 'arena', roam = cfg.mode === 'roam';
    this.scene = new THREE.Scene();
    this.track = roam ? buildRoam(q) : arena ? buildArena(ARENA) : buildTrack(trackById(cfg.track), q);
    const th = this.theme = this.track.theme;
    this.scene.fog = new THREE.FogExp2(th.fog, th.fogD); this.scene.add(this.track.group);
    this.scene.add(new THREE.HemisphereLight(th.sky[1], th.ground, th.amb * 1.4));
    const sun = this.sun = new THREE.DirectionalLight(th.sun, th.sunI); this.sunDir = new THREE.Vector3(...(th.night ? [0.3, 0.5, 0.55] : [0.5, 0.52, 0.42])).normalize();
    this.scene.add(makeSky(th, this.sunDir));
    this.envTex = app.skyEnv ? app.skyEnv(th, this.sunDir) : null; this.scene.environment = this.envTex || app.env || null; this.scene.environmentIntensity = th.night ? 1.1 : 1;
    if (q.shadows) { sun.castShadow = true; sun.shadow.mapSize.set(q.shadows, q.shadows); const c = sun.shadow.camera; c.left = c.bottom = -55; c.right = c.top = 55; c.near = 10; c.far = 220; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05; }
    this.scene.add(sun, sun.target);
    this.camera = new THREE.PerspectiveCamera(65, 16 / 9, 0.3, 2400);
    this.fx = new FX(this.scene, q.particles); this.combat = new Combat(this); this.skids = new Skids(this.scene, q.particles < 0.6 ? 300 : 800); this.blur = 0;
    this.dustCol = new THREE.Color(th.dust); this.dusty = DUSTY[th.props] || 0;
    this.laps = (arena || roam) ? 0 : (cfg.laps || this.track.def.laps); this.timeLimit = arena ? 150 : 0;
    this.noWeapons = cfg.mode === 'trial';
    // cars
    this.cars = [];
    const field = cfg.field || [];
    field.forEach((f, i) => { const c = new Car(vehicleById(f.car), { name: f.name, ai: makeAI(f), hpMul: f.hpMul }); c.driver = f; c.speedMul = this.diff.spd * (0.93 + 0.07 * f.skill); c.baseMul = c.speedMul; this.cars.push(c); });
    const pc = this.player = new Car(vehicleById(cfg.car), { name: cfg.playerName || 'You', isPlayer: true, upgrades: cfg.upgrades, paint: cfg.paint, rim: cfg.rim });
    this.cars.push(pc);
    if (roam) VEHICLES.filter(v => v.id !== cfg.car).forEach(v => { const c = new Car(v, { name: v.name }); c.parked = true; this.cars.push(c); }); // every other vehicle waits in the lot
    if (th.night) { const hl = new THREE.SpotLight(0xdfeaff, 900, 110, 0.5, 0.7, 1.4); hl.position.set(0, 0.9, 1.6); hl.target.position.set(0, -0.6, 30); pc.model.group.add(hl, hl.target); }
    this.cars.forEach((c, i) => { c.place(this.track.grid(i)); c.home = this.track.grid(i); this.scene.add(c.model.group); c.lastHitT = -99; });
    if (cfg.startWeapon && !this.noWeapons) { this.combat.give(pc, cfg.startWeapon); pc.ammo = Math.max(1, Math.ceil(pc.ammo / 2)); }
    this.combat.spawnPickups(this.track, this.noWeapons ? ['n'] : ['w', 'n', 'h']);
    this.time = 0; this.raceTime = 0; this.state = roam ? 'racing' : 'countdown'; this.count = roam ? 0 : 3.6; this.lastCount = 4; this.locked = !roam; this.endT = 0;
    this.walker = new Walker(); this.scene.add(this.walker.group); this.walker.group.visible = false; this.onFoot = false; this.jumpBest = 0; this.edgeT = -9;
    this.order = []; this.feed = []; this.shake = 0; this.camH = pc.h; this.fov = 65; this.flash = 0; this.newRecord = false; this.done = false;
    this.camPos = new THREE.Vector3(pc.x - Math.sin(pc.h) * 9, pc.y + 4, pc.z - Math.cos(pc.h) * 9); this.camera.position.copy(this.camPos);
    this.best = app.save.bestLap[cfg.track] || 0;
  }
  prog(c) { return (c.lap - 1) * this.track.N + c.idx; }
  rollWeapon() { const w = ['mg', 'mg', 'mg', 'rocket', 'rocket', 'rocket', 'missile', 'missile', 'mine', 'mine', 'emp', 'shell', 'shell', 'shield', 'shield']; return w[Math.floor(Math.random() * w.length)]; }
  say(msg) { this.feed.unshift({ msg, t: 4 }); if (this.feed.length > 4) this.feed.pop(); }
  standings() {
    if (this.mode === 'arena') return [...this.cars].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    return [...this.cars].sort((a, b) => (a.finished && b.finished) ? a.finishTime - b.finishTime : a.finished ? -1 : b.finished ? 1 : this.prog(b) - this.prog(a));
  }
  position(c) { return this.standings().indexOf(c) + 1; }

  lapDone(c) {
    if (this.state === 'countdown') return;
    if (c.lap >= 1) {
      const t = this.raceTime - c.lapStart; c.lapTimes.push(t); if (!c.bestLap || t < c.bestLap) c.bestLap = t;
      if (c.isPlayer && (!this.best || t < this.best)) { this.best = t; this.newRecord = true; this.app.ui.toast('New lap record  ' + fmt(t)); this.audio.voice('record'); }
    }
    c.lap++; c.lapStart = this.raceTime;
    if (c.lap > this.laps) { c.finished = true; c.finishTime = this.raceTime; c.lap = this.laps; this.order.push(c); if (c.isPlayer) this.end(); else this.say(c.name + ' finished'); }
    else if (c.isPlayer && c.lap === this.laps && this.laps > 1) { this.app.ui.toast('Final lap'); if (!this.audio.voice('finallap')) this.audio.beep(true); }
  }
  end() { if (this.state === 'finished') return; this.state = 'finished'; this.endT = 3.2; const p = this.position(this.player); if (!this.audio.voice(p === 1 ? 'victory' : 'raceover')) this.audio.beep(true); }

  damage(c, amt, by) {
    if (this.state !== 'racing' || c.shield > 0 || c.invuln > 0 || c.wrecked > 0 || amt <= 0) return;
    if (c.isPlayer) { amt *= { Easy: 0.55, Normal: 0.8, Hard: 1, Extreme: 1.15 }[this.diff.name]; this.flash = 0.35; this.shake = Math.max(this.shake, Math.min(1, amt / 25)); }
    c.health -= amt; if (by && by !== c) { c.lastHit = by; c.lastHitT = this.time; }
    if (c.health <= 0) this.wreck(c);
  }
  wreck(c) {
    c.health = 0; c.wrecked = 2.6; c.deaths++; c.emp = 0; c.vx = c.vz = 0; c.speed = 0;
    const by = c.lastHit && this.time - c.lastHitT < 6 ? c.lastHit : null; if (by) by.kills++;
    this.fx.explosion(c.x, c.y + 0.5, c.z, 1.6); this.audio.boom(c.x, c.z, 1.3); this.shakeAt(c.x, c.z, 1.5);
    this.say(by ? by.name + ' wrecked ' + c.name : c.name + ' wrecked');
    if (c.isPlayer) { this.app.save.stats.wrecks++; this.audio.voice('wrecked'); }
  }
  respawn(c, soft) {
    const tr = this.track;
    if (tr.isRoam) { if (!soft) { const hm = c.home || tr.grid(0); c.x = hm.x; c.z = hm.z; c.h = hm.h; } c.y = tr.heightAt(c.x, c.z); }
    else if (tr.isArena) { const a = Math.random() * 6.283, d = 30 + Math.random() * 45; c.x = Math.cos(a) * d; c.z = Math.sin(a) * d; c.h = Math.atan2(-c.x, -c.z); c.y = 0; }
    else { const i = c.idx, p = tr.pointAt(i, 0); c.x = p.x; c.z = p.z; c.y = p.y; c.h = tr.heading(i); }
    c.vx = c.vy = c.vz = 0; c.speed = 0; c.wrecked = 0; c.invuln = soft ? 1 : 2.5; c.model.group.rotation.x = 0;
    if (!soft) { c.health = c.stats.health; c.weapon = null; c.ammo = 0; c.nitro = Math.max(c.nitro, c.stats.nitroCap * 0.4); }
  }
  wallHit(c, v) { this.fx.sparks(c.x, c.y + 0.5, c.z, 6, c.vx, c.vz); this.audio.crash(c, v); this.damage(c, (v - 2.5) * (c.isPlayer ? 0.8 : 0.3), null); if (c.isPlayer) this.shake = Math.max(this.shake, Math.min(1, v / 20)); }
  landed(c, v) { for (let i = 0; i < 5; i++) this.fx.dust(c.x, c.y, c.z, this.dustCol, 0.4); if (c.isPlayer) { this.shake = Math.max(this.shake, Math.min(0.8, v / 25)); this.audio.crash(c, v * 0.5); } }
  shakeAt(x, z, s) { const d = Math.hypot(x - this.player.x, z - this.player.z); this.shake = Math.max(this.shake, Math.min(1, s * 14 / (d + 8))); }
  onPickup(type, c) { if (type === 'w') { this.app.ui.toast(WEAPONS[c.weapon].name); this.audio.voice('armed'); } }

  award(id, name) { const a = Save.award(id, name); if (a) { this.app.ui.toast('Achievement: ' + name); this.app.persist(); } }
  jumped(c) { // called by a car that lands after a long time in the air
    if (!c.isPlayer || this.mode !== 'roam') return;
    const d = Math.hypot(c.x - c.airX, c.z - c.airZ); if (d < 12) return; if (d > this.jumpBest) this.jumpBest = d;
    this.app.ui.toast('Jump ' + Math.round(d) + ' m  ·  ' + c.airT.toFixed(1) + ' s in the air');
    if (d >= 60) this.award('bigair', 'Big air: jump 60 m or more'); if (d >= 120) this.award('hugeair', 'Mega air: jump 120 m or more');
  }
  nearestCar(w, range) { let best = null, bd = range * range; for (const c of this.cars) { if (c.wrecked > 0) continue; const d = (c.x - w.x) ** 2 + (c.z - w.z) ** 2; if (d < bd) { bd = d; best = c; } } return best; }
  // Get out of the car you are driving, or into the nearest one when on foot.
  tryUse() {
    if (this.mode !== 'roam' || this.state !== 'racing') return;
    const ui = this.app.ui, w = this.walker;
    if (!this.onFoot) {
      const p = this.player; if (p.wrecked > 0) return;
      if (Math.abs(p.speed) > 9 || p.air) { ui.toast('Slow down to get out'); return; }
      const off = p.veh.shape.wid / 2 + 1.1, sx = p.x + Math.cos(p.h) * off, sz = p.z - Math.sin(p.h) * off;
      w.place(sx, this.track.heightAt(sx, sz), sz, p.h);
      p.isPlayer = false; p.parked = true; p.boosting = false; Object.assign(p.input, { thr: 0, steer: 0, hb: true, nitro: false, fire: false });
      this.onFoot = true; w.group.visible = true; this.camH = p.h; this.audio.door(); this.award('onfoot', 'On foot: get out of your vehicle');
    } else {
      const c = this.nearestCar(w, 4.6); if (!c) { ui.toast('No vehicle nearby'); return; }
      c.parked = false; c.isPlayer = true; this.player = c; this.onFoot = false; w.group.visible = false; this.camH = c.h; this.audio.door(); ui.toast('Driving ' + c.veh.name);
    }
  }

  collide() {
    const cs = this.cars;
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
      const a = cs[i], b = cs[j]; if (a.wrecked > 0 || b.wrecked > 0) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz; if (d2 > 7.8 || d2 < 0.0001 || Math.abs(a.y - b.y) > 2) continue;
      const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, pen = 2.8 - d, ma = a.stats.mass, mb = b.stats.mass, t = ma + mb;
      a.x -= nx * pen * mb / t; a.z -= nz * pen * mb / t; b.x += nx * pen * ma / t; b.z += nz * pen * ma / t;
      const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (rv < 0) { const jimp = -1.3 * rv / t; a.vx -= nx * jimp * mb; a.vz -= nz * jimp * mb; b.vx += nx * jimp * ma; b.vz += nz * jimp * ma;
        if (-rv > 6) { this.damage(a, (-rv - 6) * 0.5 * mb, b); this.damage(b, (-rv - 6) * 0.5 * ma, a); this.fx.sparks((a.x + b.x) / 2, a.y + 0.6, (a.z + b.z) / 2, 6); this.audio.crash(a.isPlayer ? a : b, -rv); } }
    }
  }

  step(dt) {
    this.time += dt; const p = this.player, inp = this.app.input;
    if (this.state === 'countdown') {
      this.count -= dt; const n = Math.ceil(this.count - 0.6);
      if (n !== this.lastCount && n >= 0 && n <= 3) { this.lastCount = n; if (!this.audio.voice(['go', 'one', 'two', 'three'][n])) this.audio.beep(n === 0); this.app.ui.count(n); }
      if (this.count <= 0.6) { this.state = 'racing'; this.locked = false; }
    } else if (this.state === 'racing') {
      this.raceTime += dt;
      if (this.timeLimit && this.raceTime >= this.timeLimit) this.end();
    } else if (this.state === 'finished') { this.raceTime += dt; this.endT -= dt; if (this.endT <= 0 && !this.done) { this.done = true; this.app.onRaceEnd(this.results()); } }
    const roam = this.mode === 'roam';
    if (roam && inp.use) { inp.use = false; this.tryUse(); }
    // player input (autopilot after the finish, or in tests)
    if (roam && this.onFoot) { this.walker.update(dt, inp, this); Object.assign(p.input, { thr: 0, steer: 0, hb: true, nitro: false, fire: false }); inp.reset = false; }
    else if (this.app.autopilot || (p.finished && !this.track.isArena)) { if (!p.ai) { p.ai = makeAI({ skill: 0.85, aggro: 0.7, defend: 0.5 }); } updateAI(p, dt, this); }
    else { p.input.thr = inp.thr; p.input.steer = inp.steer; p.input.hb = inp.hb; p.input.nitro = inp.nitro; p.input.fire = inp.fire; if (inp.reset && this.state === 'racing' && p.wrecked <= 0) { inp.reset = false; this.respawn(p, true); } }
    const pp = roam ? 0 : this.prog(p);
    for (const c of this.cars) {
      if (roam) { if (c.parked) Object.assign(c.input, { thr: 0, steer: 0, hb: true, nitro: false, fire: false }); }
      else if (c !== p) {
        updateAI(c, dt, this);
        if (!this.track.isArena) { const gap = (pp - this.prog(c)) * 3; c.speedMul = c.baseMul * (1 + clamp(gap / 2500, -0.04, 0.05)); } // gentle catch up, capped
      }
      if (c.input.fire && !this.noWeapons && this.state === 'racing') this.combat.fire(c);
      c.update(dt, this);
      this.emit(c, dt);
    }
    this.collide(); this.combat.update(dt); this.fx.update(dt);
    if (roam) { const s = this.onFoot ? this.walker : p; if (Math.hypot(s.x, s.z) > this.track.radius - 14 && this.time - this.edgeT > 4) { this.edgeT = this.time; this.app.ui.toast('Edge of the world: turn back'); } }
    for (const f of this.feed) f.t -= dt; while (this.feed.length && this.feed[this.feed.length - 1].t <= 0) this.feed.pop();
    if (this.flash > 0) this.flash -= dt;
  }

  emit(c, dt) {
    if (c.wrecked > 0) { c._sk = null; return; } const fx = this.fx, R = Math.random, d2 = (c.x - this.camPos.x) ** 2 + (c.z - this.camPos.z) ** 2; if (d2 > 160 * 160) { c._sk = null; return; }
    const bx = c.x - Math.sin(c.h) * 2, bz = c.z - Math.cos(c.h) * 2, sp = Math.abs(c.speed);
    if (!c.air) {
      if (this.dusty && sp > 12 && R() < this.dusty * 0.5) fx.dust(bx, c.y, bz, this.dustCol, 0.3);
      if (c.slip > 5 && R() < 0.7) fx.smoke(bx, c.y + 0.2, bz, 0.75, 1.4, 0.3);
      if (c.y < this.track.waterY && sp > 5) for (let i = 0; i < 2; i++) fx.alpha.emit(bx + (R() - 0.5) * 2, this.track.waterY + 0.1, bz + (R() - 0.5) * 2, (R() - 0.5) * 6, 4 + R() * 5, (R() - 0.5) * 6, 0.6, 1, 3, 0.75, 0.9, 0.95, 0.5, 14);
    }
    if (!c.air && c.slip > 5.5) { const lx = Math.cos(c.h), lz = -Math.sin(c.h), w = c.veh.shape.wid * 0.45, cur = [{ x: bx + lx * w, y: c.y, z: bz + lz * w }, { x: bx - lx * w, y: c.y, z: bz - lz * w }]; if (c._sk && (c._sk[0].x - cur[0].x) ** 2 + (c._sk[0].z - cur[0].z) ** 2 < 16) { this.skids.add(c._sk[0], cur[0], lx, lz); this.skids.add(c._sk[1], cur[1], lx, lz); } c._sk = cur; } else c._sk = null;
    if (c.boosting) { const lx = Math.cos(c.h) * 0.45, lz = -Math.sin(c.h) * 0.45; fx.flame(bx + lx, c.y + 0.35, bz + lz, -c.vx * 0.2, 0, -c.vz * 0.2, true); fx.flame(bx - lx, c.y + 0.35, bz - lz, -c.vx * 0.2, 0, -c.vz * 0.2, true); }
    const hp = c.health / c.stats.health;
    if (hp < 0.5) { c.smokeT -= dt; if (c.smokeT <= 0) { c.smokeT = 0.05 + hp * 0.25; fx.smoke(c.x + Math.sin(c.h) * 1.2, c.y + 1, c.z + Math.cos(c.h) * 1.2, 0.12 + hp * 0.3, 1.6, 0.55); if (hp < 0.25) fx.flame(c.x + Math.sin(c.h) * 1.2, c.y + 1, c.z + Math.cos(c.h) * 1.2, c.vx * 0.5, 3, c.vz * 0.5); } }
    if (c.emp > 0 && R() < 0.4) fx.sparks(c.x, c.y + 1, c.z, 2);
  }

  updateCamera(dt) {
    const p = this.player, cam = this.camera, s = this.app.settings;
    if (this.onFoot) { // third person camera behind the pilot
      const w = this.walker, tr = this.track;
      this.camH += wrap(w.h - this.camH) * (1 - Math.exp(-dt * 5));
      const dist = 4.6 * (s.cam || 1), tx = w.x - Math.sin(this.camH) * dist, tz = w.z - Math.cos(this.camH) * dist, ty = Math.max(w.y + 2.1, tr.heightAt(tx, tz) + 1.0);
      const k = 1 - Math.exp(-dt * 10); this.camPos.x += (tx - this.camPos.x) * k; this.camPos.z += (tz - this.camPos.z) * k; this.camPos.y += (ty - this.camPos.y) * (1 - Math.exp(-dt * 8));
      cam.position.copy(this.camPos); cam.lookAt(w.x + Math.sin(w.h) * 2.5, w.y + 1.35, w.z + Math.cos(w.h) * 2.5);
      this.blur += (0 - this.blur) * Math.min(1, dt * 5); this.fov += (64 - this.fov) * Math.min(1, dt * 4); if (Math.abs(cam.fov - this.fov) > 0.05) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
      this.sun.position.set(w.x + this.sunDir.x * 90, w.y + this.sunDir.y * 90, w.z + this.sunDir.z * 90); this.sun.target.position.set(w.x, w.y, w.z);
      this.audio.ear.x = w.x; this.audio.ear.z = w.z; this.audio.setEngine(0, 0, 0, 0, false, false); return;
    }
    const sp = Math.abs(p.speed), f = clamp(sp / p.stats.top, 0, 1.3);
    // follow the direction of travel a little so drifts swing the view
    const travel = sp > 6 ? Math.atan2(p.vx, p.vz) : p.h, aim = p.h + wrap(travel - p.h) * 0.35;
    this.camH += wrap(aim - this.camH) * (1 - Math.exp(-dt * (4.5 * (s.sens || 1))));
    const dist = (6.2 + f * 2.2) * (s.cam || 1), height = (2.5 + f * 0.5) * (0.8 + 0.2 * (s.cam || 1)) + (p.air ? 0.8 : 0);
    let tx = p.x - Math.sin(this.camH) * dist, tz = p.z - Math.cos(this.camH) * dist, ty = p.y + height;
    if (!this.track.isArena) { const i = this.track.locate(tx, tz, p.idx), gy = this.track.groundY(i, tx, tz); const lat = this.track.lateral(i, tx, tz), lim = this.track.halfW - 0.8; if (Math.abs(lat) > lim) { const sN = this.track.samples[i], o = (Math.abs(lat) - lim) * Math.sign(lat); tx -= sN.n.x * o; tz -= sN.n.z * o; } ty = Math.max(ty, gy + 1.3); if (this.track.inTunnel(i)) ty = Math.min(ty, gy + 5.6); }
    else if (this.track.heightAt) ty = Math.max(ty, this.track.heightAt(tx, tz) + 1.3);
    const k = 1 - Math.exp(-dt * 9); this.camPos.x += (tx - this.camPos.x) * k; this.camPos.z += (tz - this.camPos.z) * k; this.camPos.y += (ty - this.camPos.y) * (1 - Math.exp(-dt * 6));
    cam.position.copy(this.camPos);
    if (this.shake > 0.01) { const a = this.shake * 0.45; cam.position.x += (Math.random() - 0.5) * a; cam.position.y += (Math.random() - 0.5) * a; cam.position.z += (Math.random() - 0.5) * a; this.shake *= Math.exp(-dt * 5); }
    cam.lookAt(p.x + Math.sin(p.h) * 5, p.y + 1.3, p.z + Math.cos(p.h) * 5);
    this.blur += ((Math.max(0, f - 0.5) * 1.1 + (p.boosting ? 0.7 : 0)) - this.blur) * Math.min(1, dt * 5);
    const fov = 62 + f * 20 + (p.boosting ? 8 : 0); this.fov += (fov - this.fov) * Math.min(1, dt * 4);
    if (Math.abs(cam.fov - this.fov) > 0.05) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    this.sun.position.set(p.x + this.sunDir.x * 90, p.y + this.sunDir.y * 90, p.z + this.sunDir.z * 90); this.sun.target.position.set(p.x, p.y, p.z);
    this.audio.ear.x = p.x; this.audio.ear.z = p.z;
    if (this.theme.weather === 'sand') this.fx.weather('sand', cam.position, dt, this.dustCol); else if (this.theme.snow) this.fx.weather('snow', cam.position, dt); else if (this.theme.wet) this.fx.weather('rain', cam.position, dt);
    this.audio.setEngine(p.rpm(), Math.max(0, p.input.thr), f, p.slip, p.boosting, p.wrecked <= 0 && this.state !== 'done');
  }

  results() {
    const st = this.standings(), p = this.player;
    return { mode: this.mode, cfg: this.cfg, pos: st.indexOf(p) + 1, total: st.length, time: p.finished ? p.finishTime : (this.timeLimit ? Math.min(this.raceTime, this.timeLimit) : this.raceTime), bestLap: p.bestLap, record: this.newRecord, kills: p.kills, deaths: p.deaths,
      standings: st.map((c, i) => ({ name: c.name, isPlayer: c.isPlayer, time: c.finished ? c.finishTime : 0, kills: c.kills, deaths: c.deaths, bestLap: c.bestLap, id: c.driver ? c.driver.id : 'player' })) };
  }
  dispose() {
    if (this.envTex) this.envTex.dispose();
    this.scene.traverse(o => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose?.(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.map?.dispose?.(); m.emissiveMap?.dispose?.(); m.dispose?.(); }); });
  }
}
export function fmt(t) { if (!t || t <= 0) return '--:--.--'; const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2); }
