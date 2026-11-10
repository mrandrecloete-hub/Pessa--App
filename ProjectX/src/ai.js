// Opponent driving and combat decisions. Each driver has skill, aggression and defence traits.
import { wrap } from './car.js';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Highest speed at which this car can still turn tightly enough for curvature k.
function cornerSpeed(car, k) {
  const st = car.stats, top = st.top * car.speedMul; if (k < 0.0015) return top * 1.3;
  for (let v = top; v > 9; v -= 2.5) { const rate = st.turn * Math.min(1, v / 7) * (1 - 0.58 * Math.min(1, v / st.top)); if (rate / v >= k) return v; }
  return 9;
}

export function makeAI(p) { return { skill: p.skill, aggro: p.aggro, defend: p.defend, lane: (Math.random() - 0.5) * 8, laneT: 0, lat: 0, nitroT: 0, fireT: 1 + Math.random() * 2, stuck: 0, think: 0 }; }

export function updateAI(car, dt, g) {
  const a = car.ai, tr = g.track, inp = car.input;
  inp.fire = false; inp.hb = false;
  if (car.wrecked > 0) return;
  if (Math.abs(car.speed) < 2.5 && !g.locked) { a.stuck += dt; if (a.stuck > 2.6) { a.stuck = 0; g.respawn(car, true); return; } } else a.stuck = 0;
  if (tr.isArena) return arenaAI(car, dt, g);
  const N = tr.N, S = tr.samples, sp = Math.max(car.speed, 4);
  a.laneT -= dt; if (a.laneT <= 0) { a.laneT = 3 + Math.random() * 5; a.lane = (Math.random() - 0.5) * tr.halfW * 0.9; }
  const look = Math.round(3 + sp * 0.14), kAhead = S[(car.idx + look + 4) % N].k;
  let want = a.lane * 0.45 - clamp(kAhead * 1100, -1, 1) * tr.halfW * 0.5 * a.skill;
  const myLat = tr.lateral(car.idx, car.x, car.z);
  // avoid cars and obstacles ahead
  for (const o of g.cars) {
    if (o === car || o.wrecked > 0) continue; const di = (o.idx - car.idx + N) % N; if (di < 1 || di > 7) continue;
    const ol = tr.lateral(o.idx, o.x, o.z); if (Math.abs(ol - want) < 3.2 && o.speed < car.speed + 3) want = ol + (ol > 0 ? -4.2 : 4.2);
  }
  for (const h of tr.hazards) { const di = (h.idx - car.idx + N) % N; if (di > 0 && di < 16 && Math.abs(h.lat - want) < 4.2) want = h.lat + (h.lat > 0 ? -5 : 5); }
  want = clamp(want, -tr.halfW + 2.6, tr.halfW - 2.6); a.lat += (want - a.lat) * Math.min(1, dt * 2.5);
  const tp = tr.pointAt(car.idx + look, a.lat, updateAI.v), diff = wrap(Math.atan2(tp.x - car.x, tp.z - car.z) - car.h);
  inp.steer = clamp(-diff * 3.2, -1, 1);
  // speed plan: brake for the tightest corner ahead
  let allow = 999, kmax = 0; const margin = 1.32 - 0.22 * a.skill;
  for (let j = 1; j <= 34; j += 3) {
    const k = Math.abs(S[(car.idx + j) % N].k) * margin; kmax = Math.max(kmax, k);
    const v = Math.sqrt(cornerSpeed(car, k) ** 2 + 2 * 26 * j * 3); if (v < allow) allow = v;
  }
  if (Math.abs(diff) > 0.5) allow = Math.min(allow, 22);
  inp.thr = car.speed < allow - 1 ? 1 : car.speed > allow + 2.5 ? -1 : 0.25;
  if (Math.abs(diff) > 0.35 && car.speed > car.stats.top * 0.5 && a.skill > 0.75) inp.hb = true;
  if (Math.abs(myLat) > tr.halfW - 1.6 && Math.abs(car.speed) < 4) inp.thr = 1;
  // nitro on straights
  a.nitroT -= dt;
  if (a.nitroT <= 0 && kmax < 0.005 && car.nitro > 35 && inp.thr > 0.9 && Math.random() < dt * (0.4 + a.skill)) a.nitroT = 1.5 + Math.random() * 1.5;
  inp.nitro = a.nitroT > 0 && kmax < 0.012 && inp.thr > 0.9;
  combatAI(car, dt, g);
}
updateAI.v = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };

function combatAI(car, dt, g) {
  const a = car.ai, w = car.weapon; a.fireT -= dt; if (!w || g.locked || g.noWeapons) return;
  const aim = g.diff.aim;
  if (w === 'shield') { if (car.health < car.stats.health * (0.35 + 0.4 * a.defend) || g.combat.shots.some(s => s.tgt === car)) car.input.fire = true; return; }
  if (w === 'mine') { if (a.fireT <= 0 && g.cars.some(o => o !== car && o.wrecked <= 0 && behind(car, o) && dist(car, o) < 30)) { car.input.fire = true; a.fireT = 2 + Math.random() * 3 / aim; } return; }
  if (w === 'emp') { if (a.fireT <= 0 && g.cars.some(o => o !== car && o.wrecked <= 0 && dist(car, o) < 32)) { car.input.fire = true; a.fireT = 2; } return; }
  const cone = w === 'mg' ? 0.14 : w === 'missile' ? 0.7 : 0.22, t = g.combat.target(car, w === 'mg' ? 90 : 140, cone);
  if (!t) return;
  if (w === 'mg') { if (a.fireT <= 0) { a.burst = 0.5 + a.aggro * 0.8; a.fireT = a.burst + (1.6 - a.aggro) * (1.4 / aim); } if (a.fireT > (1.6 - a.aggro) * (1.4 / aim)) car.input.fire = true; return; }
  if (a.fireT <= 0) { car.input.fire = true; a.fireT = (2.2 - a.aggro * 1.4) / aim + Math.random(); }
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const behind = (c, o) => (o.x - c.x) * Math.sin(c.h) + (o.z - c.z) * Math.cos(c.h) < -2;

function arenaAI(car, dt, g) {
  const a = car.ai, inp = car.input, R = g.track.radius;
  a.think -= dt;
  if (a.think <= 0 || !a.tgt || a.tgt.wrecked > 0) {
    a.think = 1.5 + Math.random() * 2; let bd = 1e9; a.tgt = null;
    for (const o of g.cars) if (o !== car && o.wrecked <= 0) { const d = dist(car, o) * (o.isPlayer ? 0.8 + 0.4 * (1 - a.aggro) : 1); if (d < bd) { bd = d; a.tgt = o; } }
    a.pick = (!car.weapon || car.health < car.stats.health * 0.4) ? g.combat.pickups.filter(p => p.t <= 0 && (car.weapon ? p.type === 'h' : p.type === 'w')).sort((p, q) => Math.hypot(p.x - car.x, p.z - car.z) - Math.hypot(q.x - car.x, q.z - car.z))[0] : null;
  }
  let tx = 0, tz = 0; if (a.pick) { tx = a.pick.x; tz = a.pick.z; } else if (a.tgt) { tx = a.tgt.x + a.tgt.vx * 0.4; tz = a.tgt.z + a.tgt.vz * 0.4; }
  const fx = Math.sin(car.h), fz = Math.cos(car.h);
  for (const h of g.track.hazards) { const dx = h.x - car.x, dz = h.z - car.z, d = Math.hypot(dx, dz); if (d < 16 && (dx * fx + dz * fz) > 0) { const s = Math.sign(dx * fz - dz * fx) || 1; tx = car.x + fx * 10 - fz * s * 12; tz = car.z + fz * 10 + fx * s * 12; } }
  if (Math.hypot(car.x + fx * 14, car.z + fz * 14) > R - 4) { tx = 0; tz = 0; }
  const diff = wrap(Math.atan2(tx - car.x, tz - car.z) - car.h);
  inp.steer = clamp(-diff * 2.6, -1, 1); inp.thr = Math.abs(diff) > 1.2 && car.speed > 16 ? -0.5 : 1; inp.hb = Math.abs(diff) > 1.0 && car.speed > 20;
  inp.nitro = Math.abs(diff) < 0.2 && a.tgt && dist(car, a.tgt) > 40;
  combatAI(car, dt, g);
}
