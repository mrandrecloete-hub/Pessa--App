// Free Roam test: ramps launch cars, you can get out, walk, jump, get into another vehicle, and wrecked cars come back.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }), p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8377/index.html'); await p.waitForFunction(() => window.PX && PX.app.ui);
let fail = 0; const ok = (n, c, i = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
const r = await p.evaluate(() => {
  const a = PX.app; a.audio.ctx = null; a.save.tracks = a.save.tracks; const race = new PX.Race(a, { ...a.baseCfg(), mode: 'roam', field: [] }), I = a.input, out = {};
  const step = (n) => { for (let i = 0; i < n; i++) race.step(1 / 60); };
  const car = race.player; out.cars = race.cars.length; out.startOnFoot = race.onFoot; out.state = race.state;
  // 1: drive straight at the Gap Jump (ramp starts at z=340)
  Object.assign(car, { x: 0, z: 200, h: 0, speed: 0, vx: 0, vz: 0 }); Object.assign(I, { thr: 1, steer: 0, nitro: true, hb: false }); let maxY = 0, wasAir = false, airFrames = 0, hitWall = 0;
  for (let i = 0; i < 60 * 14; i++) { step(1); maxY = Math.max(maxY, car.y); if (car.air) { wasAir = true; airFrames++; } if (car.z > 520) break; }
  out.maxY = maxY; out.wasAir = wasAir; out.airSec = airFrames / 60; out.jumpBest = race.jumpBest; out.afterJump = { z: car.z, y: car.y, health: Math.round(car.health) };
  // 2: stop, get out
  Object.assign(I, { thr: -1, nitro: false, hb: true }); for (let i = 0; i < 400 && Math.abs(car.speed) > 2; i++) step(1); Object.assign(I, { thr: 0, hb: true }); step(60); I.hb = false;
  out.speedBeforeExit = Math.abs(car.speed); I.use = true; step(2); out.onFoot = race.onFoot; out.walkerVisible = race.walker.group.visible; out.oldIsParked = car.parked; out.oldIsPlayer = car.isPlayer;
  // 3: walk forward 2 seconds, then jump
  const w0 = { x: race.walker.x, z: race.walker.z }; Object.assign(I, { thr: 1, nitro: false }); step(120); out.walked = Math.hypot(race.walker.x - w0.x, race.walker.z - w0.z);
  Object.assign(I, { thr: 0, hb: true }); step(3); I.hb = false; let jumpMax = 0; for (let i = 0; i < 60; i++) { step(1); jumpMax = Math.max(jumpMax, race.walker.y - race.track.heightAt(race.walker.x, race.walker.z)); } out.jumpHeight = jumpMax;
  // 4: run into a ramp wall? walker cannot climb a tall back face: put walker at the back of the mega landing ramp
  // 5: go to another car and get in
  const other = race.cars.find(c => c !== car && c.parked && c.veh.id === 'halo'); race.walker.x = other.x + 3.2; race.walker.z = other.z; race.walker.y = 0;
  out.nearest = race.nearestCar(race.walker, 4.6) === other; I.use = true; step(2);
  out.nowPlayer = race.player === other; out.onFootAfter = race.onFoot; out.walkerHidden = !race.walker.group.visible; out.otherIsPlayer = other.isPlayer; out.otherParked = other.parked;
  Object.assign(I, { thr: 1, steer: 0, nitro: false }); step(180); out.newCarSpeed = other.speed;
  // 6: a parked car that is destroyed comes back at its parking slot
  const t = race.cars.find(c => c !== car && c !== other && c.parked); const home = { x: t.home.x, z: t.home.z }; t.x += 40; race.damage(t, 9999, other); out.wreckedFlag = t.wrecked > 0; Object.assign(I, { thr: 0, hb: true }); step(60 * 4);
  out.respawned = t.wrecked <= 0 && t.health > 0 && Math.hypot(t.x - home.x, t.z - home.z) < 1;
  // 7: far edge of the world is a soft limit
  Object.assign(other, { x: 880, z: 0, h: Math.PI / 2, speed: 0, vx: 0, vz: 0 }); Object.assign(I, { thr: 1, hb: false, nitro: true }); step(60 * 6); out.edgeDist = Math.hypot(other.x, other.z); out.edgeHealth = other.health / other.stats.health;
  // heights
  out.rampTopMega = race.track.heightAt(0, -220 - 96 * 0.999); out.flat = race.track.heightAt(500, 500);
  race.dispose(); return out;
});
console.log(JSON.stringify(r));
ok('free roam starts straight away on 8 vehicles', r.state === 'racing' && r.cars === 8 && !r.startOnFoot, 'cars ' + r.cars);
ok('ramp launches the car into the air', r.wasAir && r.maxY > 3, `max height ${r.maxY.toFixed(1)} m, air ${r.airSec.toFixed(2)} s`);
ok('jump distance is measured', r.jumpBest > 12, r.jumpBest.toFixed(0) + ' m');
ok('car survives the landing', r.afterJump.health > 40, JSON.stringify(r.afterJump));
ok('can get out when slow', r.onFoot && r.walkerVisible && r.oldIsParked && !r.oldIsPlayer, 'speed ' + r.speedBeforeExit.toFixed(1));
ok('pilot walks', r.walked > 6, r.walked.toFixed(1) + ' m in 2 s');
ok('pilot jumps', r.jumpHeight > 0.8, r.jumpHeight.toFixed(2) + ' m');
ok('nearest vehicle is found', r.nearest);
ok('can get into a different vehicle', r.nowPlayer && !r.onFootAfter && r.walkerHidden && r.otherIsPlayer && !r.otherParked);
ok('new vehicle drives', r.newCarSpeed > 10, r.newCarSpeed.toFixed(1) + ' m/s');
ok('wrecked parked car returns to its slot', r.wreckedFlag && r.respawned);
ok('world edge is a soft limit', r.edgeDist <= 898 && r.edgeHealth > 0.99, `dist ${r.edgeDist.toFixed(0)} health ${(r.edgeHealth * 100).toFixed(0)}%`);
ok('mega ramp is 21 m high at the lip', r.rampTopMega > 15 && r.flat === 0, r.rampTopMega.toFixed(1));
ok('no script errors', errs.length === 0, errs.slice(0, 4).join(' | '));
await b.close(); console.log(fail ? fail + ' FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
