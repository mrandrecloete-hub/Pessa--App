// Local save with checksum validation and a backup copy for recovery.
// The data model is plain JSON with a version field so it can later sync to a cloud profile.
const KEY = 'projectx.save.v1', BAK = 'projectx.save.v1.bak';

export function defaultSave() {
  return {
    v: 1, profile: { name: 'Rian Vega', created: Date.now() },
    credits: 1500, career: 0, introSeen: false,
    owned: ['wisp', 'bastion', 'dune'], car: 'wisp',
    upgrades: {}, paint: {}, rims: {}, startWeapon: 'mg',
    tracks: ['desert', 'city', 'mountain'],
    bestLap: {}, champ: { best: null, wins: 0 }, achievements: {},
    stats: { races: 0, wins: 0, wrecks: 0 },
    settings: { gfx: 'auto', vol: 0.8, voice: true, cam: 1, sens: 1, diff: 'normal', touch: 'auto', touchScale: 1 },
  };
}

function sum(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
function read(key) {
  try {
    const raw = localStorage.getItem(key); if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o.d !== 'string' || sum(o.d) !== o.c) return null;
    return JSON.parse(o.d);
  } catch (e) { return null; }
}
// Fill in anything missing so old or partial saves still load.
function repair(s) {
  const d = defaultSave();
  if (!s || typeof s !== 'object') return d;
  for (const k in d) {
    if (s[k] === undefined || s[k] === null || typeof s[k] !== typeof d[k]) s[k] = d[k];
    else if (d[k] && typeof d[k] === 'object' && !Array.isArray(d[k])) for (const j in d[k]) if (s[k][j] === undefined) s[k][j] = d[k][j];
  }
  if (!Array.isArray(s.owned) || !s.owned.length) s.owned = d.owned;
  if (!s.owned.includes(s.car)) s.car = s.owned[0];
  if (!(s.credits >= 0)) s.credits = 0;
  return s;
}

export const Save = {
  data: defaultSave(), recovered: false,
  load() {
    let s = read(KEY);
    if (!s) { s = read(BAK); if (s) this.recovered = true; }
    this.data = repair(s);
    return this.data;
  },
  write() {
    try {
      const d = JSON.stringify(this.data), rec = JSON.stringify({ d, c: sum(d) });
      const prev = localStorage.getItem(KEY);
      if (prev) localStorage.setItem(BAK, prev);
      localStorage.setItem(KEY, rec);
      return true;
    } catch (e) { return false; }
  },
  reset() { this.data = defaultSave(); this.write(); },
  award(id, name) { if (this.data.achievements[id]) return null; this.data.achievements[id] = { name, at: Date.now() }; return name; },
};
