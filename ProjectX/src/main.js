// PROJECT X: application shell. Renderer, quality tiers, input, game mode flow, rewards.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { makeSky } from './track.js';
import { Save } from './save.js';
import { AudioSys } from './audio.js';
import { Race } from './game.js';
import { UI } from './ui.js';
import { buildCarModel } from './car.js';
import { VEHICLES, vehicleById, TRACKS, CAREER, RIVALS, BOSSES, POINTS, PRIZE, PLAYER, RIMS } from './data.js';

const TIERS = {
  low: { name: 'Low', px: 1, shadows: 0, particles: 0.45, density: 0.55, bloom: false, aa: false, post: false },
  medium: { name: 'Medium', px: 1.25, shadows: 1024, particles: 0.75, density: 0.8, bloom: false, aa: true, post: true, msaa: 2 },
  high: { name: 'High', px: 2, shadows: 2048, particles: 1, density: 1, bloom: true, aa: true, post: true, msaa: 4 },
};
// Final screen pass: speed blur, colour grade, vignette, light film grain.
const FinalShader = {
  uniforms: { tDiffuse: { value: null }, blur: { value: 0 }, vig: { value: 0.4 }, sat: { value: 1.14 }, tint: { value: new THREE.Color(1, 1, 1) }, time: { value: 0 }, grain: { value: 0.03 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float blur; uniform float vig; uniform float sat; uniform float time; uniform float grain; uniform vec3 tint; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    void main(){ vec2 c = vUv - 0.5; float r2 = dot(c, c), amt = blur * r2 * 0.24; vec3 col = vec3(0.0);
      for (int i = 0; i < 6; i++) col += texture2D(tDiffuse, 0.5 + c * (1.0 - amt * float(i) / 5.0)).rgb;
      col /= 6.0; float l = dot(col, vec3(0.2126, 0.7152, 0.0722)); col = mix(vec3(l), col, sat) * tint;
      col *= 1.0 - vig * smoothstep(0.1, 0.62, r2 * 1.5);
      col += (hash(vUv * 900.0 + time) - 0.5) * grain * (0.3 + l);
      gl_FragColor = vec4(max(col, 0.0), 1.0); }`,
};
const GRADE = { roam: [1.0, 1.0, 1.03, 1.12], desert: [1.06, 1.0, 0.9, 1.15], city: [0.94, 1.0, 1.1, 1.1], mountain: [0.98, 1.0, 1.05, 1.1], military: [1.04, 1.0, 0.93, 0.85], jungle: [0.97, 1.06, 0.95, 1.2], neon: [1.02, 0.95, 1.12, 1.25], arena: [1.08, 0.97, 0.92, 1.1] };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const app = {
  save: null, audio: new AudioSys(), input: { thr: 0, steer: 0, hb: false, nitro: false, fire: false, reset: false }, race: null, paused: false, champ: null, autopilot: false,
  keys: {}, touch: {}, saveNote: '',

  boot() {
    this.save = Save.load(); if (Save.recovered) this.saveNote = 'Save restored from backup.';
    this.settings = this.save.settings;
    const canvas = document.getElementById('view');
    this.mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900);
    this.pickTier();
    try { this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.q.aa, powerPreference: 'high-performance' }); }
    catch (e) { document.getElementById('nogl').hidden = false; return; }
    const r = this.renderer; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05; r.outputColorSpace = THREE.SRGBColorSpace; r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    const pm = new THREE.PMREMGenerator(r); this.env = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
    this.px = this.q.px; this.buildGarage(); this.ui = new UI(this);
    this.applySettings(); this.bindInput(); addEventListener('resize', () => this.resize()); this.resize();
    this.ui.title(); this.last = performance.now(); this.fpsT = 0; this.fpsN = 0;
    const loop = t => { requestAnimationFrame(loop); this.frame(t); }; requestAnimationFrame(loop);
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.race && this.ui.screen === 'hud') this.pause(true); });
  },
  pickTier() {
    let g = this.settings.gfx;
    if (g === 'auto' || !TIERS[g]) { const mem = navigator.deviceMemory || 4, cores = navigator.hardwareConcurrency || 4; g = this.mobile ? (mem >= 6 && cores >= 8 ? 'medium' : 'low') : (cores >= 4 ? 'high' : 'medium'); }
    this.q = Object.assign({}, TIERS[g]); this.q.px = Math.min(this.q.px, devicePixelRatio || 1); this.tierName = TIERS[g].name + (this.settings.gfx === 'auto' ? ' (chosen for this device)' : '');
    this.deviceNote = this.mobile ? 'Phone or tablet detected.' : 'Desktop detected.';
  },
  applySettings() {
    const s = this.settings; this.audio.setVol(s.vol); this.audio.voiceOn = s.voice !== false;
    const showTouch = s.touch === 'on' || (s.touch !== 'off' && (this.mobile || matchMedia('(pointer: coarse)').matches));
    document.body.classList.toggle('touch', showTouch); document.body.classList.toggle('swap', !!s.touchSwap);
    document.documentElement.style.setProperty('--ts', s.touchScale || 1);
    const old = this.q; this.pickTier(); if (this.race) this.q = old; // tier change applies from the next race
  },
  persist() { if (!Save.write()) this.saveNote = 'Progress cannot be stored in this browser.'; },
  wipe() { Save.reset(); this.save = Save.data; this.settings = this.save.settings; this.champ = null; this.ui.gcar = this.save.car; this.applySettings(); },
  resize() {
    const w = innerWidth, h = innerHeight; this.renderer.setPixelRatio(this.px); this.renderer.setSize(w, h, false);
    if (this.composer) { this.composer.setPixelRatio(this.px); this.composer.setSize(w, h); }
    for (const c of [this.race && this.race.camera, this.gcam]) if (c) { c.aspect = w / h; c.updateProjectionMatrix(); }
    if (this.race) this.race.fx.setScale(h * this.px);
  },

  // ---------- input
  bindInput() {
    const K = this.keys;
    addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return; K[e.code] = true;
      if (this.race && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      if ((e.code === 'Escape' || e.code === 'KeyP') && this.race) { if (this.ui.screen === 'hud') this.pause(true); else if (this.ui.screen === 'pause') this.pause(false); }
      if (e.code === 'KeyR') this.input.reset = true;
      if (e.code === 'KeyE' && this.race) this.input.use = true;
      if (e.code === 'KeyC') { const s = this.settings; s.cam = s.cam < 0.9 ? 1 : s.cam < 1.2 ? 1.35 : 0.75; this.persist(); }
    });
    addEventListener('keyup', e => { K[e.code] = false; });
    addEventListener('blur', () => { for (const k in K) K[k] = false; for (const k in this.touch) this.touch[k] = false; });
    document.querySelectorAll('[data-k]').forEach(b => {
      const k = b.dataset.k, on = e => { e.preventDefault(); this.touch[k] = true; b.classList.add('down'); this.audio.init(); }, off = e => { this.touch[k] = false; b.classList.remove('down'); };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off); b.addEventListener('contextmenu', e => e.preventDefault());
    });
  },
  readInput(dt) {
    const K = this.keys, T = this.touch, I = this.input; let thr = 0, st = 0, hb = false, ni = false, fi = false;
    if (K.ArrowUp || K.KeyW || T.gas) thr = 1; if (K.ArrowDown || K.KeyS || T.brake) thr = -1;
    if (K.ArrowLeft || K.KeyA || T.left) st -= 1; if (K.ArrowRight || K.KeyD || T.right) st += 1;
    hb = !!(K.Space || T.drift); ni = !!(K.ShiftLeft || K.ShiftRight || K.KeyN || T.nitro); fi = !!(K.KeyF || K.KeyJ || K.ControlLeft || T.fire);
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue; const b = i => p.buttons[i] ? p.buttons[i].value : 0;
      const ax = p.axes[0] || 0; if (Math.abs(ax) > 0.12) st = ax; if (b(7) > 0.05) thr = b(7); if (b(6) > 0.05) thr = -b(6);
      hb = hb || b(1) > 0.5; ni = ni || b(0) > 0.5; fi = fi || b(2) > 0.5;
      const start = b(9) > 0.5; if (start && !this.padStart && this.race) { if (this.ui.screen === 'hud') this.pause(true); else if (this.ui.screen === 'pause') this.pause(false); } this.padStart = start;
      const y = b(3) > 0.5; if (y && !this.padY) { if (this.race && this.race.mode === 'roam') I.use = true; else I.reset = true; } this.padY = y; break;
    }
    if (T.use && !this._tu) I.use = true; this._tu = !!T.use;
    const rate = 5.5 * (this.settings.sens || 1); I.steer += clamp(st - I.steer, -rate * dt, rate * dt); if (st === 0 && Math.abs(I.steer) < 0.05) I.steer = 0;
    I.thr = thr; I.hb = hb; I.nitro = ni; I.fire = fi;
  },

  // Reflection map made from the circuit's own sky, so paint and wet roads mirror the world they are in.
  skyEnv(theme, sunDir) {
    if (!this.renderer) return null;
    const sc = new THREE.Scene(), sky = makeSky(theme, sunDir); sc.add(sky);
    const gnd = new THREE.Mesh(new THREE.CircleGeometry(1700, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.road).lerp(new THREE.Color(theme.ground), 0.6) })); gnd.rotation.x = -Math.PI / 2; gnd.position.y = -3; sc.add(gnd);
    if (theme.night) for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283, p = new THREE.Mesh(new THREE.PlaneGeometry(240, 60), new THREE.MeshBasicMaterial({ color: new THREE.Color(i % 3 ? theme.glow : 0xffe2b0).multiplyScalar(i % 3 ? 2.5 : 4), side: THREE.DoubleSide })); p.position.set(Math.cos(a) * 700, 40 + (i % 4) * 50, Math.sin(a) * 700); p.lookAt(0, 0, 0); sc.add(p); }
    const pm = new THREE.PMREMGenerator(this.renderer), tex = pm.fromScene(sc, 0, 1, 4000).texture; pm.dispose();
    sc.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); return tex;
  },

  // ---------- garage showroom
  buildGarage() {
    const s = this.gscene = new THREE.Scene(); s.background = new THREE.Color(0x0b0c10); s.fog = new THREE.Fog(0x0b0c10, 14, 40); s.environment = this.env;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.25, metalness: 0.7 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);
    for (let i = 0; i < 7; i++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.25, 5.5, 0.1), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff7a1a : 0xfff1dc })); const a = -1.2 + i * 0.4; bar.position.set(Math.sin(a) * 15, 2.75, -Math.cos(a) * 15); bar.lookAt(0, 2.75, 0); s.add(bar); }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.05, 8, 96), new THREE.MeshBasicMaterial({ color: 0xff7a1a })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.03; s.add(ring);
    const key = new THREE.SpotLight(0xffffff, 260, 40, 0.6, 0.5); key.position.set(5, 9, 6); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); s.add(key);
    const rimL = new THREE.SpotLight(0xff8030, 160, 40, 0.8, 0.6); rimL.position.set(-7, 4, -6); s.add(rimL); s.add(new THREE.HemisphereLight(0x8899bb, 0x111111, 0.6));
    this.gcam = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 100); this.gspin = 0.6;
  },
  garageCar(id) {
    if (this.gmodel) { this.gscene.remove(this.gmodel.group); this.gmodel.group.traverse(o => { o.geometry?.dispose?.(); }); }
    const v = vehicleById(id); this.gmodel = buildCarModel(v, this.save.paint[id], this.save.rims[id]); this.gscene.add(this.gmodel.group);
  },

  // ---------- mode flow
  unlockedTracks() { const t = new Set(this.save.tracks); CAREER.forEach((e, i) => { if (e.track && i <= this.save.career) t.add(e.track); }); return TRACKS.map(x => x.id).filter(id => t.has(id)); },
  bossOpen(id) { const i = CAREER.findIndex(e => e.boss === id); return this.save.career >= i; },
  carLocked(id) { return CAREER.some(e => e.unlockCar === id) && !this.save.owned.includes(id); },
  field(n, seed = 0) { const r = RIVALS.slice(seed % RIVALS.length).concat(RIVALS.slice(0, seed % RIVALS.length)); return r.slice(0, n); },
  baseCfg() { const s = this.save, id = s.car; return { car: id, upgrades: s.upgrades[id], paint: s.paint[id], rim: s.rims[id], startWeapon: s.startWeapon, playerName: PLAYER.name, diff: s.settings.diff }; },
  startMode(mode, sel) {
    const c = this.baseCfg(); this.ctx = { kind: mode };
    if (mode === 'quick') Object.assign(c, { mode: 'race', track: sel.track, laps: sel.laps, field: this.field(5, Math.floor(Math.random() * 7)) });
    else if (mode === 'trial') Object.assign(c, { mode: 'trial', track: sel.track, laps: 3, field: [] });
    else if (mode === 'arena') Object.assign(c, { mode: 'arena', field: this.field(5, 2) });
    else if (mode === 'roam') Object.assign(c, { mode: 'roam', field: [] });
    else if (mode === 'boss') { const b = BOSSES.find(x => x.id === sel.boss); this.ctx.boss = b; Object.assign(c, { mode: 'boss', track: b.id === 'seraph' ? 'neon' : 'city', laps: 3, field: [Object.assign({ hpMul: b.hp }, b)] }); }
    this.launch(c);
  },
  startCareer() {
    const i = this.save.career, ev = CAREER[i]; if (!ev) return; const c = this.baseCfg(); this.ctx = { kind: 'career', ev, i };
    if (ev.type === 'race') Object.assign(c, { mode: 'race', track: ev.track, laps: 3, diff: ev.diff, field: this.field(5, i) });
    else if (ev.type === 'trial') Object.assign(c, { mode: 'trial', track: ev.track, laps: 3, field: [] });
    else if (ev.type === 'arena') Object.assign(c, { mode: 'arena', diff: ev.diff, field: this.field(5, i) });
    else { const b = BOSSES.find(x => x.id === ev.boss); this.ctx.boss = b; Object.assign(c, { mode: 'boss', track: ev.track, laps: 3, diff: ev.diff, field: [Object.assign({ hpMul: b.hp }, b)] }); }
    this.launch(c);
  },
  champNext() {
    if (!this.champ) this.champ = { round: 0, pts: {}, diff: this.save.settings.diff };
    const ch = this.champ; if (ch.round >= TRACKS.length) return this.ui.champ();
    this.ctx = { kind: 'champ' }; this.launch(Object.assign(this.baseCfg(), { mode: 'race', track: TRACKS[ch.round].id, laps: 3, diff: ch.diff, field: this.field(5, 0) }));
  },
  champTable() { const ch = this.champ, rows = [{ name: PLAYER.name, id: 'player', isPlayer: true }].concat(this.field(5, 0).map(r => ({ name: r.name, id: r.id }))); rows.forEach(r => r.pts = ch.pts[r.id] || 0); return rows.sort((a, b) => b.pts - a.pts); },

  launch(cfg) {
    this.endRace(); this.lastCfg = cfg; this.pickTier(); this.px = this.q.px;
    this.renderer.shadowMap.enabled = !!this.q.shadows;
    this.race = new Race(this, cfg); this.paused = false;
    this.composer = null; this.final = null;
    if (this.q.post) {
      const night = this.race.theme.night, rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: this.q.msaa || 0 });
      const c = this.composer = new EffectComposer(this.renderer, rt); c.addPass(new RenderPass(this.race.scene, this.race.camera));
      if (this.q.bloom) c.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), cfg.mode === 'roam' ? 0.18 : night ? 0.85 : 0.3, 0.7, cfg.mode === 'roam' ? 2.6 : night ? 0.72 : 0.95));
      const f = this.final = new ShaderPass(FinalShader), gr = GRADE[cfg.mode === 'arena' || cfg.mode === 'roam' ? cfg.mode : cfg.track] || [1, 1, 1, 1.1];
      f.uniforms.tint.value.setRGB(gr[0], gr[1], gr[2]); f.uniforms.sat.value = gr[3]; c.addPass(f); c.addPass(new OutputPass());
    }
    this.resize(); this.audio.init(); this.audio.startEngine(); this.ui.hudStart(this.race);
  },
  endRace() { if (this.race) { this.audio.stopEngine(); this.race.dispose(); this.race = null; if (this.composer) { this.composer.dispose?.(); this.composer = null; } } },
  pause(on) { if (!this.race || this.race.done) return; this.paused = on; this.ui.show(on ? 'pause' : 'hud'); this.audio.setEngine(0, 0, 0, 0, false, !on); },
  restart() { if (this.lastCfg) this.launch(this.lastCfg); },
  quitRace() { this.endRace(); this.ui.menu(); },
  onScreen(id) { if (id !== 'hud' && id !== 'pause' && id !== 'results' && id !== 'settings' && this.race) this.endRace(); },
  checkCollector() { if (this.save.owned.length >= VEHICLES.length) Save.award('collector', 'Full garage: own every vehicle'); },

  onRaceEnd(res) {
    const s = this.save, ctx = this.ctx || {}, out = { title: '', line: '', reward: 0, unlocks: [], ach: [], pass: null };
    const A = (id, name) => { const a = Save.award(id, name); if (a) out.ach.push(a); };
    s.stats.races++; const tid = res.cfg.track;
    if (res.bestLap && tid && (!s.bestLap[tid] || res.bestLap < s.bestLap[tid])) { s.bestLap[tid] = res.bestLap; A('record', 'Record setter: post a personal best lap'); }
    if (res.kills > 0) A('firstblood', 'First blood: wreck an opponent');
    if (res.mode !== 'trial' && res.pos === 1) { s.stats.wins++; A('firstwin', 'First win'); if (res.deaths === 0) A('untouchable', 'Untouchable: win without being wrecked'); }
    if (res.mode === 'trial') { out.reward = 300 + (res.record ? 400 : 0); out.title = 'Time Trial'; out.line = res.record ? 'A new personal best for this circuit.' : 'No new record this time.'; }
    else if (res.mode === 'arena') { out.reward = res.kills * 200 + (PRIZE[res.pos - 1] || 100) * 0.5; out.title = 'Combat Arena'; out.line = res.kills + ' wrecks scored, wrecked ' + res.deaths + ' times.'; }
    else if (res.mode === 'boss') { out.reward = res.pos === 1 ? 1500 : 200; out.title = 'Boss Battle'; out.line = res.pos === 1 ? ctx.boss.name + ' is beaten.' : ctx.boss.name + ' crossed the line first.'; if (res.pos === 1) A('boss_' + ctx.boss.id, 'Giant killer: beat ' + ctx.boss.name); }
    else { out.reward = (PRIZE[res.pos - 1] || 100) * (ctx.kind === 'quick' ? 0.6 : 1); out.title = ctx.kind === 'champ' ? 'Championship round ' + (this.champ.round + 1) : ctx.kind === 'career' ? ctx.ev.title : 'Quick Race'; out.line = res.pos === 1 ? 'You took the win.' : res.pos <= 3 ? 'A podium finish.' : 'Off the podium this time.'; }
    if (ctx.kind === 'career') {
      const ev = ctx.ev; out.title = ev.title;
      const pass = ev.type === 'trial' ? (res.bestLap > 0 && res.bestLap <= ev.target) : ev.type === 'boss' ? res.pos === 1 : res.pos <= ev.needPos;
      out.pass = pass;
      if (pass && s.career === ctx.i) {
        s.career++; out.reward += ev.reward; out.line = 'Event passed. ' + out.line;
        if (ev.unlockCar && !s.owned.includes(ev.unlockCar)) { s.owned.push(ev.unlockCar); out.unlocks.push('Vehicle: ' + vehicleById(ev.unlockCar).name); }
        const nx = CAREER[s.career]; if (nx) { out.unlocks.push('Career event: ' + nx.title); if (nx.track && !this.save.tracks.includes(nx.track)) { s.tracks.push(nx.track); out.unlocks.push('Circuit: ' + TRACKS.find(t => t.id === nx.track).name); } }
        else A('champion', 'Champion of the Meridian Circuit');
      } else if (!pass) out.line = 'Goal missed. ' + (ev.type === 'trial' ? 'You need a lap under ' + ev.target + ' seconds.' : 'Try again from the Career screen.');
    }
    if (ctx.kind === 'champ') {
      const ch = this.champ; res.standings.forEach((r, i) => { ch.pts[r.id] = (ch.pts[r.id] || 0) + (POINTS[i] || 0); }); ch.round++;
      if (ch.round >= TRACKS.length) { const place = this.champTable().findIndex(r => r.isPlayer) + 1, bonus = [3000, 1800, 1000][place - 1] || 0; out.reward += bonus; out.line += ' Championship finished in place ' + place + '.'; if (!s.champ.best || place < s.champ.best) s.champ.best = place; if (place === 1) { s.champ.wins++; A('cup', 'Cup winner: win a championship'); } }
    }
    out.reward = Math.round(out.reward); s.credits += out.reward; this.checkCollector(); this.persist();
    this.audio.setEngine(0, 0, 0, 0, false, false); this.lastOut = out; this.ui.results(res, out);
  },
  afterResults() { const k = (this.ctx || {}).kind; this.endRace(); if (k === 'champ') this.ui.champ(); else if (k === 'career') this.ui.career(); else this.ui.menu(); },

  // ---------- frame
  frame(t) {
    let dt = Math.min(0.05, (t - this.last) / 1000); this.last = t; if (dt <= 0) return;
    const scr = this.ui.screen;
    if (this.race && (scr === 'hud' || scr === 'pause' || scr === 'results' || scr === 'settings')) {
      const r = this.race;
      if (!this.paused && scr !== 'settings') { this.readInput(dt); const n = dt > 0.022 ? 2 : 1; for (let i = 0; i < n; i++) r.step(dt / n); r.updateCamera(dt); if (scr === 'hud') this.ui.hud(r, dt); }
      if (this.final) { this.final.uniforms.blur.value = this.paused ? 0 : r.blur; this.final.uniforms.time.value = (t * 0.001) % 10; }
      if (this.composer) this.composer.render(); else this.renderer.render(r.scene, r.camera);
      // adaptive resolution
      this.fpsT += dt; this.fpsN++;
      if (this.fpsT >= 1.5) { const fps = this.fpsN / this.fpsT; this.fps = fps; this.fpsT = 0; this.fpsN = 0; if (!this.paused) { const old = this.px; if (fps < 42 && this.px > 0.6) this.px = Math.max(0.6, this.px - 0.15); else if (fps > 57 && this.px < this.q.px) this.px = Math.min(this.q.px, this.px + 0.1); if (old !== this.px) this.resize(); } }
    } else if (scr === 'garage' && this.gmodel) {
      this.gspin += dt * 0.35; const a = this.gspin, narrow = innerWidth < 760;
      this.gcam.position.set(Math.sin(a) * 9.5, 3.1, Math.cos(a) * 9.5); this.gcam.lookAt(narrow ? 0 : 1.6 * Math.cos(a), narrow ? -0.6 : 0.5, narrow ? 0 : -1.6 * Math.sin(a));
      for (const w of this.gmodel.wheels) w.w.rotation.x += dt * 0.6;
      this.renderer.render(this.gscene, this.gcam);
    }
  },
};

// Test hook: run a full session without rendering, with the autopilot driving the player.
window.PX = { app, THREE, Race,
  simulate(cfg, seconds, step = 1 / 60) {
    app.audio.ctx = null; const base = Object.assign(app.baseCfg(), cfg); app.autopilot = cfg.autopilot !== false; let res = null; const keep = app.onRaceEnd, ui = app.ui;
    app.onRaceEnd = r => { res = r; }; const r = new Race(app, base); r.app = Object.assign(Object.create(app), { ui: { toast() {}, count() {} }, onRaceEnd: x => { res = x; } });
    let t = 0; while (t < seconds && !res) { r.step(step); t += step; }
    const out = { finished: !!res, simTime: t, res: res || r.results(), laps: r.cars.map(c => ({ name: c.name, lap: c.lap, best: c.bestLap, kills: c.kills, deaths: c.deaths, health: Math.round(c.health) })), shots: r.combat.shots.length };
    r.dispose(); app.onRaceEnd = keep; app.autopilot = false; return out;
  } };
app.boot();
