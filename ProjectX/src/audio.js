// Sound: recorded clips where available (voice over, explosion, guns) with synthesised fallbacks for everything.
const CLIPS = ['intro', 'three', 'two', 'one', 'go', 'finallap', 'wrecked', 'victory', 'raceover', 'record', 'armed', 'explosion', 'mg', 'rocket', 'engine', 'emp'];

export class AudioSys {
  constructor() { this.ctx = null; this.buf = {}; this.vol = 0.8; this.voiceOn = true; this.ear = { x: 0, z: 0 }; this.eng = null; this.last = {}; this.voiceSrc = null; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC(); this.master = c.createGain(); this.master.gain.value = this.vol;
    const comp = c.createDynamicsCompressor(); this.master.connect(comp); comp.connect(c.destination);
    const n = c.sampleRate * 2, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; this.noiseBuf = b;
    for (const name of CLIPS) fetch('assets/audio/' + name + '.mp3').then(r => r.ok ? r.arrayBuffer() : null).then(a => a && c.decodeAudioData(a)).then(b => { if (b) this.buf[name] = b; }).catch(() => {});
  }
  setVol(v) { this.vol = v; if (this.master) this.master.gain.value = v; }
  near(x, z) { const d = Math.hypot(x - this.ear.x, z - this.ear.z); return 1 / (1 + (d / 28) ** 2); }
  throttle(key, gap) { const t = this.ctx.currentTime; if (this.last[key] && t - this.last[key] < gap) return true; this.last[key] = t; return false; }
  clip(name, vol = 1, rate = 1) {
    if (!this.ctx || !this.buf[name]) return null;
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain(); s.buffer = this.buf[name]; s.playbackRate.value = rate; g.gain.value = vol; s.connect(g); g.connect(this.master); s.start(); return s;
  }
  voice(name) {
    if (!this.ctx || !this.voiceOn) return false;
    if (this.voiceSrc) { try { this.voiceSrc.stop(); } catch (e) {} }
    this.voiceSrc = this.clip(name, 1.5); return !!this.voiceSrc;
  }
  stopVoice() { if (this.voiceSrc) { try { this.voiceSrc.stop(); } catch (e) {} this.voiceSrc = null; } }
  tone(f0, f1, dur, type = 'sine', vol = 0.3, delay = 0) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, vol, f0, f1, type = 'lowpass', q = 0.8) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; s.loop = true; f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
  ui() { this.tone(660, 990, 0.07, 'square', 0.08); }
  beep(hi) { this.tone(hi ? 880 : 440, hi ? 880 : 440, hi ? 0.5 : 0.18, 'square', 0.16); }
  shot(type, car) {
    if (!this.ctx) return; const v = car.isPlayer ? 1 : this.near(car.x, car.z) * 0.8; if (v < 0.03) return;
    if (type === 'mg') {
      if (this.buf.mg) { if (!this.throttle('mg' + (car.isPlayer ? 'p' : car.name), 0.5)) this.clip('mg', 0.55 * v, 0.95 + Math.random() * 0.1); }
      else { this.noise(0.07, 0.35 * v, 3200, 500, 'bandpass', 0.6); this.tone(170, 60, 0.06, 'square', 0.22 * v); }
    } else if (type === 'rocket') { if (!this.clip('rocket', 0.8 * v)) { this.noise(0.7, 0.5 * v, 500, 4200, 'bandpass', 1.2); this.tone(220, 70, 0.3, 'sawtooth', 0.2 * v); } }
    else if (type === 'shell') { this.noise(0.25, 0.6 * v, 900, 120); this.tone(120, 40, 0.25, 'sine', 0.6 * v); }
    else if (type === 'mine') { this.tone(900, 900, 0.06, 'square', 0.15 * v); this.tone(600, 600, 0.06, 'square', 0.15 * v, 0.09); }
    else if (type === 'emp') { if (!this.clip('emp', 0.9 * v)) { this.tone(1800, 60, 0.7, 'sawtooth', 0.3 * v); this.noise(0.6, 0.3 * v, 6000, 300, 'bandpass', 3); } }
    else if (type === 'shield') { this.tone(300, 900, 0.4, 'sine', 0.25 * v); this.tone(450, 1350, 0.4, 'sine', 0.15 * v); }
  }
  boom(x, z, sc = 1) {
    if (!this.ctx) return; const v = Math.min(1, this.near(x, z) * 1.6) * sc; if (v < 0.03) return;
    if (this.buf.explosion && sc > 0.6) { if (!this.throttle('boom', 0.12)) this.clip('explosion', 1.1 * v, 0.9 + Math.random() * 0.2); }
    else { this.noise(0.9 * sc + 0.2, 0.9 * v, 1800, 60); this.tone(90, 28, 0.6, 'sine', 0.9 * v); }
  }
  hit(car) { if (!this.ctx || this.throttle('hit', 0.05)) return; const v = car.isPlayer ? 0.5 : this.near(car.x, car.z) * 0.3; this.noise(0.05, v, 2500, 700, 'bandpass', 2); this.tone(300, 120, 0.05, 'triangle', v * 0.6); }
  crash(car, sp) { if (!this.ctx || this.throttle('crash' + car.name, 0.2)) return; const v = (car.isPlayer ? 1 : this.near(car.x, car.z) * 0.6) * Math.min(1, sp / 18); this.noise(0.3, 0.7 * v, 1400, 90); this.tone(110, 45, 0.18, 'square', 0.3 * v); }
  pickup(car, type) { if (!car.isPlayer) return; const f = type === 'w' ? 520 : type === 'n' ? 700 : 440; this.tone(f, f, 0.08, 'square', 0.14); this.tone(f * 1.5, f * 1.5, 0.12, 'square', 0.14, 0.08); }

  startEngine() {
    if (!this.ctx || this.eng) return; const c = this.ctx, e = this.eng = {};
    e.out = c.createGain(); e.out.gain.value = 0; e.out.connect(this.master);
    e.lp = c.createBiquadFilter(); e.lp.type = 'lowpass'; e.lp.frequency.value = 700; e.lp.Q.value = 2;
    const sh = c.createWaveShaper(), cv = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; cv[i] = Math.tanh(x * 3); } sh.curve = cv;
    e.o1 = c.createOscillator(); e.o1.type = 'sawtooth'; e.o2 = c.createOscillator(); e.o2.type = 'square'; e.o3 = c.createOscillator(); e.o3.type = 'sawtooth';
    const g1 = c.createGain(), g2 = c.createGain(), g3 = c.createGain(); g1.gain.value = 0.5; g2.gain.value = 0.35; g3.gain.value = 0.25;
    e.o1.connect(g1); e.o2.connect(g2); e.o3.connect(g3); g1.connect(sh); g2.connect(sh); g3.connect(sh); sh.connect(e.lp); e.lp.connect(e.out);
    e.o1.start(); e.o2.start(); e.o3.start();
    if (this.buf.engine) { const b = this.buf.engine; e.smp = c.createBufferSource(); e.smp.buffer = b; e.smp.loop = true; e.smp.loopStart = Math.min(0.25, b.duration * 0.15); e.smp.loopEnd = b.duration - Math.min(0.25, b.duration * 0.15); e.sg = c.createGain(); e.sg.gain.value = 0; e.smp.connect(e.sg); e.sg.connect(this.master); e.smp.start(); }
    const mk = (type, f, q) => { const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(); s.buffer = this.noiseBuf; s.loop = true; fl.type = type; fl.frequency.value = f; fl.Q.value = q; g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(this.master); s.start(); return { g, fl }; };
    e.tire = mk('bandpass', 1500, 4); e.wind = mk('lowpass', 500, 0.5); e.boost = mk('bandpass', 2600, 1.2);
  }
  setEngine(rpm, load, speedFrac, slip, boost, alive) {
    const e = this.eng; if (!e) return; const t = this.ctx.currentTime, k = 0.06, f = 42 + rpm * 135 + speedFrac * 40;
    e.o1.frequency.setTargetAtTime(f, t, k); e.o2.frequency.setTargetAtTime(f * 0.5, t, k); e.o3.frequency.setTargetAtTime(f * 1.51, t, k);
    e.lp.frequency.setTargetAtTime(350 + rpm * 1500 + load * 900, t, k);
    e.out.gain.setTargetAtTime(alive ? (e.smp ? 0.1 : 0.17) + load * 0.07 : 0, t, 0.08);
    if (e.smp) { e.smp.playbackRate.setTargetAtTime(0.55 + rpm * 0.75 + speedFrac * 0.25, t, k); e.sg.gain.setTargetAtTime(alive ? 0.22 + load * 0.2 : 0, t, 0.08); }
    e.tire.g.gain.setTargetAtTime(alive ? Math.min(0.22, Math.max(0, slip - 3.5) * 0.03) : 0, t, 0.05); e.tire.fl.frequency.setTargetAtTime(1200 + slip * 40, t, 0.1);
    e.wind.g.gain.setTargetAtTime(speedFrac * speedFrac * 0.16, t, 0.2); e.wind.fl.frequency.setTargetAtTime(300 + speedFrac * 900, t, 0.2);
    e.boost.g.gain.setTargetAtTime(boost ? 0.22 : 0, t, 0.06);
  }
  stopEngine() {
    const e = this.eng; if (!e) return; this.eng = null;
    try { e.out.gain.value = 0; e.o1.stop(); e.o2.stop(); e.o3.stop(); if (e.smp) e.smp.stop(); for (const n of [e.tire, e.wind, e.boost]) n.g.gain.value = 0; e.out.disconnect(); if (e.sg) e.sg.disconnect(); e.tire.g.disconnect(); e.wind.g.disconnect(); e.boost.g.disconnect(); } catch (err) {}
  }
}
