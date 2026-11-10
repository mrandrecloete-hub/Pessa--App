// Menus, HUD and results. Every control is wired to a real game system through app.
import { VEHICLES, vehicleById, UPGRADES, UPGRADE_MAX, upgradeCost, buildStats, PAINTS, RIMS, WEAPONS, WEAPON_IDS, TRACKS, trackById, CAREER, RIVALS, BOSSES, DIFFICULTY, PLAYER, ORGANISER } from './data.js';
import { fmt } from './game.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hex = c => '#' + c.toString(16).padStart(6, '0');
const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : Math.min(n % 10, 4) % 4] || 'th');
const LOGO = '<div class="logo"><span>PROJECT</span><b>X</b><i>COMBAT RACING</i></div>';

export class UI {
  constructor(app) {
    this.app = app; this.screen = 'title'; this.cache = {}; this.sel = { mode: 'quick', track: 'desert', laps: 3, boss: 'gauntlet' }; this.gtab = 'upgrades'; this.gcar = app.save.car; this.toastT = 0;
    document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (!el || el.disabled) return; app.audio.init(); app.audio.ui(); const f = this['act_' + el.dataset.act]; if (f) f.call(this, el.dataset, el); });
    document.addEventListener('input', e => { const el = e.target; if (el.dataset && el.dataset.set) this.setting(el.dataset.set, el.type === 'range' ? +el.value : el.value); });
    this.mm = $('minimap').getContext('2d');
  }
  get s() { return this.app.save; }
  show(id) {
    this.screen = id; document.querySelectorAll('.screen').forEach(e => e.hidden = e.id !== 'scr-' + id);
    $('hud').hidden = id !== 'hud' && id !== 'pause'; $('scr-pause').hidden = id !== 'pause';
    document.body.dataset.screen = id; this.app.onScreen(id);
  }
  money() { return '<span class="cr">' + this.s.credits.toLocaleString('en-US') + ' CR</span>'; }
  head(title, back = 'menu') { return `<header class="bar"><button class="btn ghost" data-act="go" data-to="${back}">Back</button><h2>${title}</h2>${this.money()}</header>`; }

  // ---------- screens
  title() { $('scr-title').innerHTML = `<div class="titlebox">${LOGO}<p class="tag">Six circuits. Eight machines. Live weapons.</p><button class="btn big" data-act="start">Start</button><p class="fine">Sound starts when you press Start. Keyboard, controller and touch are supported.</p></div>`; this.show('title'); }
  menu() {
    const ev = CAREER[this.s.career], items = [['play', 'Play', 'Choose a game mode'], ['career', 'Career', ev ? 'Next: ' + ev.title : 'Career complete'], ['quick', 'Quick Race', 'Any unlocked circuit'], ['roam', 'Free Roam', 'Open world, ramps, on foot'], ['champ', 'Championship', 'Six rounds for points'], ['garage', 'Garage', 'Vehicles, paint, wheels'], ['upgrades', 'Vehicle Upgrades', 'Engine, armour, weapons'], ['settings', 'Settings', 'Graphics, sound, controls'], ['exit', 'Exit', 'Back to the title screen']];
    $('scr-menu').innerHTML = `<div class="menucol">${LOGO}<nav>${items.map(i => `<button class="mi" data-act="menu" data-id="${i[0]}"><b>${i[1]}</b><span>${i[2]}</span></button>`).join('')}</nav></div>
      <div class="pilot"><b>${esc(PLAYER.name)}</b><span>${this.money()} · ${Object.keys(this.s.achievements).length} achievements</span>${this.app.saveNote ? `<span class="warn">${this.app.saveNote}</span>` : ''}</div>`;
    this.show('menu');
  }
  act_start() { if (!this.s.introSeen) this.story('The Meridian Circuit', `The year is 2187. The old nations are dust, and the Meridian Circuit is all that is left worth fighting for. Six arenas. Eight machines. One rule: cross the line first, or do not cross it at all.\n\nYou are ${PLAYER.name}. ${PLAYER.bio} ${ORGANISER.name} of the ${ORGANISER.role} has agreed to one qualifying race.\n\nThey call it Project X. Start your engine.`, 'intro', () => { this.s.introSeen = true; this.app.persist(); this.menu(); }); else this.menu(); }
  act_go(d) { this.app.audio.stopVoice(); if (d.to === 'menu') this.menu(); else this[d.to](); }
  act_menu(d) {
    const id = d.id;
    if (id === 'play') this.modes(); else if (id === 'career') this.career(); else if (id === 'quick') { this.sel.mode = 'quick'; this.setup(); }
    else if (id === 'champ') this.champ(); else if (id === 'garage') { this.gtab = 'paint'; this.garage(); } else if (id === 'upgrades') { this.gtab = 'upgrades'; this.garage(); }
    else if (id === 'roam') { this.sel.mode = 'roam'; this.setup(); }
    else if (id === 'settings') this.settings(); else if (id === 'exit') this.title();
  }
  modes() {
    const m = [['career', 'Career Mode', 'Rise through the ranks'], ['quick', 'Quick Race', 'Pick a circuit and race'], ['roam', 'Free Roam', 'Open world, ramps, on foot'], ['champ', 'Championship', 'Compete for glory'], ['trial', 'Time Trial', 'Beat your best time'], ['arena', 'Combat Arena', 'Fight and survive'], ['boss', 'Boss Battles', 'Take on the champions']];
    $('scr-modes').innerHTML = this.head('Play') + `<div class="grid modes">${m.map(x => `<button class="card" data-act="mode" data-id="${x[0]}"><b>${x[1]}</b><span>${x[2]}</span></button>`).join('')}</div>`;
    this.show('modes');
  }
  act_mode(d) { if (d.id === 'career') this.career(); else if (d.id === 'champ') this.champ(); else { this.sel.mode = d.id; this.setup(); } }

  carPick() { return `<h3>Vehicle</h3><div class="row cars">${this.s.owned.map(id => { const v = vehicleById(id); return `<button class="chip ${id === this.s.car ? 'on' : ''}" data-act="car" data-id="${id}"><i style="background:${hex(this.s.paint[id] ?? v.color)}"></i>${v.name}</button>`; }).join('')}</div>`; }
  diffPick() { return `<h3>Difficulty</h3><div class="row">${Object.keys(DIFFICULTY).map(k => `<button class="chip ${k === this.s.settings.diff ? 'on' : ''}" data-act="diff" data-id="${k}">${DIFFICULTY[k].name}</button>`).join('')}</div>`; }
  setup() {
    const m = this.sel.mode, un = this.app.unlockedTracks(); if (!un.includes(this.sel.track)) this.sel.track = un[0];
    const names = { quick: 'Quick Race', trial: 'Time Trial', arena: 'Combat Arena', boss: 'Boss Battles', roam: 'Free Roam' };
    let body = '';
    if (m === 'quick' || m === 'trial') body += `<h3>Circuit</h3><div class="grid tracks">${TRACKS.map(t => { const ok = un.includes(t.id); return `<button class="card trk ${t.id === this.sel.track ? 'on' : ''}" ${ok ? '' : 'disabled'} data-act="track" data-id="${t.id}"><em style="background:linear-gradient(135deg,${hex(t.theme.sky[0])},${hex(t.theme.sky[1])} 60%,${hex(t.theme.glow)})"></em><b>${t.name}</b><span>${ok ? t.blurb : 'Locked. Reach it in Career.'}</span><small>Best lap ${fmt(this.s.bestLap[t.id])}</small></button>`; }).join('')}</div>`;
    if (m === 'quick') body += `<h3>Laps</h3><div class="row">${[1, 2, 3, 5].map(n => `<button class="chip ${n === this.sel.laps ? 'on' : ''}" data-act="laps" data-id="${n}">${n}</button>`).join('')}</div>`;
    if (m === 'trial') body += `<p class="note">Three timed laps. No rivals and no weapons. Nitro pickups stay on the road.</p>`;
    if (m === 'roam') body += `<p class="note">A huge open white world with no walls and 40 ramps: kickers, gap jumps, tabletops, whoops and a mega ramp. Every vehicle is parked in the lot behind you. Press E to get out and walk, and E again next to any vehicle to get in. Weapons and pickups work. Nothing here changes your Career.</p>`;
    if (m === 'arena') body += `<p class="note">The Crucible. Two and a half minutes, five rivals, score the most wrecks. Wrecked cars return after a few seconds.</p>`;
    if (m === 'boss') body += `<h3>Opponent</h3><div class="grid tracks">${BOSSES.map((b, i) => { const ok = this.app.bossOpen(b.id); return `<button class="card ${b.id === this.sel.boss ? 'on' : ''}" ${ok ? '' : 'disabled'} data-act="boss" data-id="${b.id}"><b>${b.name}</b><span>${ok ? '“' + b.line + '”' : 'Locked. Reach this battle in Career.'}</span><small>${b.team} · ${vehicleById(b.car).name}</small></button>`; }).join('')}</div>`;
    if (m !== 'trial' && m !== 'roam') body += this.diffPick();
    body += this.carPick() + `<div class="foot"><button class="btn big" data-act="race">Start</button></div>`;
    $('scr-setup').innerHTML = this.head(names[m], 'modes') + `<div class="pane">${body}</div>`; this.show('setup');
  }
  act_track(d) { this.sel.track = d.id; this.setup(); }
  act_laps(d) { this.sel.laps = +d.id; this.setup(); }
  act_boss(d) { this.sel.boss = d.id; this.setup(); }
  act_diff(d) { this.s.settings.diff = d.id; this.app.persist(); this[this.screen](); }
  act_car(d) { this.s.car = d.id; this.app.persist(); this[this.screen](); }
  act_race() { this.app.startMode(this.sel.mode, this.sel); }

  career() {
    const i = this.s.career, ev = CAREER[i];
    const list = CAREER.map((e, k) => `<li class="${k < i ? 'done' : k === i ? 'now' : 'lock'}"><b>${k + 1}. ${e.title}</b><span>${k < i ? 'Complete' : k === i ? 'Next event' : 'Locked'}</span></li>`).join('');
    const goal = ev ? (ev.type === 'trial' ? 'Set a lap under ' + fmt(ev.target) : ev.type === 'boss' ? 'Finish ahead of ' + BOSSES.find(b => b.id === ev.boss).name : ev.type === 'arena' ? 'Finish ' + ord(ev.needPos) + ' or better on wrecks' : 'Finish ' + ord(ev.needPos) + ' or better') : '';
    $('scr-career').innerHTML = this.head('Career') + `<div class="pane split"><ol class="events">${list}</ol><div>${ev ? `<h3>${ev.title}</h3><p class="story">${esc(ev.story)}</p><p class="note"><b>Goal:</b> ${goal}. <b>Reward:</b> ${ev.reward.toLocaleString('en-US')} CR${ev.unlockCar ? ' and the ' + vehicleById(ev.unlockCar).name : ''}.</p>${ev.track ? `<p class="note">Circuit: ${trackById(ev.track).name}</p>` : ''}${this.carPick()}<div class="foot"><button class="btn big" data-act="event">Start event</button></div>` : `<h3>Champion of the Meridian Circuit</h3><p class="story">Seraph Nine is beaten and the title is yours. Every circuit and every battle stays open in the other modes.</p>`}</div></div>`;
    this.show('career');
  }
  act_event() { this.app.startCareer(); }

  champ() {
    const c = this.app.champ;
    let body;
    if (!c) body = `<p class="story">Six rounds, one on every circuit, three laps each. Points for the top six: 10, 7, 5, 4, 3, 2. Highest total after Neon Metropolis takes the cup.</p><p class="note">Best result so far: ${this.s.champ.best ? ord(this.s.champ.best) : 'none yet'} · Cups won: ${this.s.champ.wins}</p>${this.diffPick()}${this.carPick()}<div class="foot"><button class="btn big" data-act="champgo">Start championship</button></div>`;
    else {
      const rows = this.app.champTable().map((r, i) => `<tr class="${r.isPlayer ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.name)}</td><td>${r.pts}</td></tr>`).join('');
      body = `<h3>${c.round >= TRACKS.length ? 'Final standings' : 'Round ' + (c.round + 1) + ' of ' + TRACKS.length + ': ' + TRACKS[c.round].name}</h3><table class="tbl"><tr><th></th><th>Driver</th><th>Points</th></tr>${rows}</table><div class="foot">${c.round >= TRACKS.length ? `<button class="btn big" data-act="champend">Finish</button>` : `<button class="btn ghost" data-act="champend">Abandon</button><button class="btn big" data-act="champgo">Race round ${c.round + 1}</button>`}</div>`;
    }
    $('scr-champ').innerHTML = this.head('Championship') + `<div class="pane">${body}</div>`; this.show('champ');
  }
  act_champgo() { this.app.champNext(); }
  act_champend() { this.app.champ = null; this.menu(); }

  garage() {
    const s = this.s, v = vehicleById(this.gcar), own = s.owned.includes(v.id), up = s.upgrades[v.id] || {}, st = buildStats(v, up), base = { top: 73, accel: 25, turn: 2.8, health: 160, nitroCap: 130 };
    const bar = (n, val, max) => `<div class="stat"><span>${n}</span><i><u style="width:${Math.min(100, val / max * 100).toFixed(0)}%"></u></i></div>`;
    const idx = VEHICLES.indexOf(v); let tab = '';
    if (!own) tab = `<p class="note">${this.app.carLocked(v.id) ? 'This vehicle is a Career reward and cannot be bought.' : 'Buy this vehicle to upgrade and customise it.'}</p>`;
    else if (this.gtab === 'upgrades') tab = UPGRADES.map(u => { const l = up[u.id] || 0, cost = upgradeCost(l); return `<div class="up"><div><b>${u.name}</b><span>${u.desc}</span></div><em>${'●'.repeat(l)}${'○'.repeat(UPGRADE_MAX - l)}</em>${l >= UPGRADE_MAX ? '<button class="btn sm" disabled>Max</button>' : `<button class="btn sm" data-act="upgrade" data-id="${u.id}" ${s.credits < cost ? 'disabled' : ''}>${cost} CR</button>`}</div>`; }).join('');
    else if (this.gtab === 'paint') tab = `<div class="row sw">${PAINTS.map(c => `<button class="swatch ${(s.paint[v.id] ?? v.color) === c ? 'on' : ''}" style="background:${hex(c)}" data-act="paint" data-id="${c}" aria-label="Paint ${hex(c)}"></button>`).join('')}</div>`;
    else if (this.gtab === 'wheels') tab = `<div class="row sw">${RIMS.map(c => `<button class="swatch ${(s.rims[v.id] ?? RIMS[0]) === c ? 'on' : ''}" style="background:${hex(c)}" data-act="rim" data-id="${c}" aria-label="Wheel ${hex(c)}"></button>`).join('')}</div>`;
    else tab = `<p class="note">The weapon you start each race with, at half ammunition. Pickups on the road replace it.</p><div class="row">${WEAPON_IDS.map(w => `<button class="chip ${s.startWeapon === w ? 'on' : ''}" data-act="sw" data-id="${w}">${WEAPONS[w].name}</button>`).join('')}</div>`;
    $('scr-garage').innerHTML = this.head('Garage') + `<div class="garage"><div class="gnav"><button class="btn ghost" data-act="gcar" data-d="-1" aria-label="Previous vehicle">‹</button><div><b>${v.name}</b><span>${v.cls}</span></div><button class="btn ghost" data-act="gcar" data-d="1" aria-label="Next vehicle">›</button></div>
      <aside class="gpanel"><div class="stats">${bar('Top speed', st.top, base.top * 1.1)}${bar('Acceleration', st.accel, base.accel * 1.25)}${bar('Handling', st.turn * st.grip, base.turn * 11)}${bar('Armour', st.health, base.health * 1.3)}${bar('Nitro', st.nitroCap, base.nitroCap * 1.4)}</div>
      <div class="buy">${own ? (s.car === v.id ? '<button class="btn" disabled>Selected</button>' : `<button class="btn" data-act="pick">Select vehicle</button>`) : this.app.carLocked(v.id) ? '<button class="btn" disabled>Career reward</button>' : `<button class="btn" data-act="buy" ${s.credits < v.price ? 'disabled' : ''}>Buy for ${v.price.toLocaleString('en-US')} CR</button>`}</div>
      <div class="tabs">${[['upgrades', 'Upgrades'], ['paint', 'Paint'], ['wheels', 'Wheels'], ['weapon', 'Weapon']].map(t => `<button class="tab ${this.gtab === t[0] ? 'on' : ''}" data-act="gtab" data-id="${t[0]}">${t[1]}</button>`).join('')}</div><div class="tabbody">${tab}</div></aside></div>`;
    this.show('garage'); this.app.garageCar(v.id);
  }
  act_gcar(d) { const i = (VEHICLES.findIndex(v => v.id === this.gcar) + +d.d + VEHICLES.length) % VEHICLES.length; this.gcar = VEHICLES[i].id; this.garage(); }
  act_gtab(d) { this.gtab = d.id; this.garage(); }
  act_pick() { this.s.car = this.gcar; this.app.persist(); this.garage(); }
  act_buy() { const v = vehicleById(this.gcar); if (this.s.credits >= v.price && !this.s.owned.includes(v.id)) { this.s.credits -= v.price; this.s.owned.push(v.id); this.s.car = v.id; this.app.checkCollector(); this.app.persist(); } this.garage(); }
  act_upgrade(d) { const u = this.s.upgrades[this.gcar] || (this.s.upgrades[this.gcar] = {}), l = u[d.id] || 0, c = upgradeCost(l); if (l < UPGRADE_MAX && this.s.credits >= c) { this.s.credits -= c; u[d.id] = l + 1; this.app.persist(); } this.garage(); }
  act_paint(d) { this.s.paint[this.gcar] = +d.id; this.app.persist(); this.garage(); }
  act_rim(d) { this.s.rims[this.gcar] = +d.id; this.app.persist(); this.garage(); }
  act_sw(d) { this.s.startWeapon = d.id; this.app.persist(); this.garage(); }

  settings(back = 'menu') {
    const g = this.s.settings, opt = (key, vals) => `<div class="row">${vals.map(v => `<button class="chip ${g[key] === v[0] ? 'on' : ''}" data-act="opt" data-k="${key}" data-id="${v[0]}">${v[1]}</button>`).join('')}</div>`;
    const sl = (key, label, min, max, step) => `<label class="sl" for="set-${key}"><span>${label}</span><input id="set-${key}" type="range" min="${min}" max="${max}" step="${step}" value="${g[key]}" data-set="${key}"></label>`;
    this.setBack = back;
    $('scr-settings').innerHTML = `<header class="bar"><button class="btn ghost" data-act="setback">Back</button><h2>Settings</h2><span></span></header><div class="pane">
      <h3>Graphics</h3>${opt('gfx', [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']])}<p class="note">Now running: ${this.app.tierName}. ${this.app.deviceNote} Resolution lowers by itself if the frame rate drops. A new graphics level applies from the next race.</p>
      <h3>Sound</h3>${sl('vol', 'Volume', 0, 1, 0.05)}${opt('voice', [[true, 'Voice over on'], [false, 'Voice over off']])}
      <h3>Camera and steering</h3>${sl('cam', 'Camera distance', 0.7, 1.6, 0.05)}${sl('sens', 'Steering sensitivity', 0.5, 1.6, 0.05)}
      <h3>Touch controls</h3>${opt('touch', [['auto', 'Auto'], ['on', 'Always show'], ['off', 'Hide']])}${sl('touchScale', 'Button size', 0.75, 1.4, 0.05)}${opt('touchSwap', [[false, 'Steer on the left'], [true, 'Steer on the right']])}
      <h3>Default difficulty</h3>${opt('diff', Object.keys(DIFFICULTY).map(k => [k, DIFFICULTY[k].name]))}
      <h3>Save data</h3><p class="note">Progress is stored on this device only.</p><div class="row"><button class="btn ghost" data-act="wipe" data-step="${this.wipeArm ? 2 : 1}">${this.wipeArm ? 'Press again to erase all progress' : 'Erase progress'}</button></div>
      <h3>Controls</h3><p class="note">Keyboard: arrows or WASD drive, Space drift, Shift nitro, F or J fire, R reset to track, C camera, Esc pause. Free Roam: E gets in or out of a vehicle; on foot W A S D walk, Shift runs, Space jumps. Controller: left stick steer, right trigger accelerate, left trigger brake, A nitro, X fire, B drift, Y reset, Start pause.</p></div>`;
    this.show('settings');
  }
  act_setback() { this.wipeArm = false; if (this.setBack === 'pause') this.show('pause'); else this.menu(); }
  act_opt(d) { let v = d.id; if (v === 'true') v = true; else if (v === 'false') v = false; this.setting(d.k, v); this.settings(this.setBack); }
  act_wipe(d) { if (d.step === '2') { this.wipeArm = false; this.app.wipe(); this.title(); } else { this.wipeArm = true; this.settings(this.setBack); } }
  setting(k, v) { this.s.settings[k] = v; this.app.applySettings(); this.app.persist(); }

  story(title, text, voice, done) {
    this.storyDone = done;
    $('scr-story').innerHTML = `<div class="storybox"><h2>${esc(title)}</h2>${text.split('\n\n').map(p => `<p>${esc(p)}</p>`).join('')}<div class="foot"><button class="btn big" data-act="storyok">Continue</button></div></div>`;
    this.show('story'); if (voice) this.app.audio.voice(voice);
  }
  act_storyok() { this.app.audio.stopVoice(); const f = this.storyDone; this.storyDone = null; if (f) f(); }

  // ---------- race HUD
  set(id, v) { if (this.cache[id] !== v) { this.cache[id] = v; $(id).textContent = v; } }
  css(id, prop, v) { const k = id + prop; if (this.cache[k] !== v) { this.cache[k] = v; $(id).style[prop] = v; } }
  toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); this.toastT = 2.2; }
  count(n) { const c = $('count'); c.textContent = n === 0 ? 'GO' : n; c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); this.countT = n === 0 ? 1 : 1.2; }
  hudStart(r) {
    this.cache = {}; $('count').textContent = ''; $('h-hint').textContent = ''; $('toast').classList.remove('on'); $('hud').dataset.mode = r.mode;
    const S = r.track.samples; let a = 1e9, b = -1e9, c = 1e9, d = -1e9; for (const s of S) { a = Math.min(a, s.p.x); b = Math.max(b, s.p.x); c = Math.min(c, s.p.z); d = Math.max(d, s.p.z); }
    const sc = 132 / Math.max(b - a, d - c); this.mmT = p => [8 + (p.x - a) * sc + (132 - (b - a) * sc) / 2, 8 + (p.z - c) * sc + (132 - (d - c) * sc) / 2];
    this.show('hud');
  }
  roamMap(r) { // heading-up map of the area around you: ramps, pickups and vehicles
    const g = this.mm, p = r.onFoot ? r.walker : r.player, sc = 0.42, ca = Math.cos(p.h), sa = Math.sin(p.h);
    const P = (x, z) => { const dx = x - p.x, dz = z - p.z; return [75 - sc * (dx * ca - dz * sa), 75 - sc * (dx * sa + dz * ca)]; };
    g.clearRect(0, 0, 150, 150); g.save(); g.beginPath(); g.arc(75, 75, 73, 0, 6.283); g.clip(); g.fillStyle = 'rgba(238,240,245,.88)'; g.fillRect(0, 0, 150, 150);
    g.fillStyle = '#ff7a1a';
    for (const q of r.track.ramps) {
      if ((q.x - p.x) ** 2 + (q.z - p.z) ** 2 > 260 * 260) continue; const hw = q.wid / 2;
      const a = P(q.x - q.nx * hw, q.z - q.nz * hw), b = P(q.x + q.nx * hw, q.z + q.nz * hw), c = P(q.x + q.dx * q.len + q.nx * hw, q.z + q.dz * q.len + q.nz * hw), d = P(q.x + q.dx * q.len - q.nx * hw, q.z + q.dz * q.len - q.nz * hw);
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath(); g.fill();
    }
    const cols = { w: '#ff7a1a', n: '#2ea8ff', h: '#2fbf5a' };
    for (const k of r.combat.pickups) { if (k.t > 0 || (k.x - p.x) ** 2 + (k.z - p.z) ** 2 > 200 * 200) continue; const q = P(k.x, k.z); g.fillStyle = cols[k.type]; g.fillRect(q[0] - 2, q[1] - 2, 4, 4); }
    for (const c of r.cars) { if (c.wrecked > 0 || (c === r.player && !r.onFoot)) continue; const q = P(c.x, c.z); g.fillStyle = c.parked ? '#6b7280' : '#e3261b'; g.beginPath(); g.arc(q[0], q[1], 3.4, 0, 6.3); g.fill(); }
    g.fillStyle = '#16181d'; g.beginPath(); g.moveTo(75, 66); g.lineTo(81, 82); g.lineTo(75, 78); g.lineTo(69, 82); g.closePath(); g.fill();
    g.restore(); g.strokeStyle = 'rgba(20,22,28,.7)'; g.lineWidth = 2; g.beginPath(); g.arc(75, 75, 73, 0, 6.283); g.stroke();
  }
  hudRoam(r, dt) {
    const p = r.player, w = r.walker, foot = r.onFoot, touch = document.body.classList.contains('touch');
    this.set('h-speed', String(Math.round(Math.abs(foot ? w.speed : p.speed) * 3.6))); this.set('h-gear', foot ? 'ON FOOT' : p.gear());
    this.css('h-nitro', 'width', (foot ? 0 : p.nitro / p.stats.nitroCap * 100).toFixed(0) + '%'); const hp = Math.max(0, p.health / p.stats.health);
    this.css('h-health', 'width', (hp * 100).toFixed(0) + '%'); this.css('h-health', 'background', hp < 0.3 ? 'var(--bad)' : hp < 0.6 ? 'var(--warn)' : 'var(--good)');
    this.set('h-weapon', foot ? 'No weapon on foot' : p.weapon ? WEAPONS[p.weapon].name : 'No weapon'); this.set('h-ammo', !foot && p.weapon ? '×' + p.ammo : '');
    this.set('h-pos', 'Free roam'); this.set('h-lap', foot ? PLAYER.name + ' on foot' : p.veh.name); this.set('h-time', 'Best jump ' + (r.jumpBest ? Math.round(r.jumpBest) + ' m' : '--')); this.set('h-best', !foot && p.air ? 'Air ' + p.airT.toFixed(1) + ' s' : '');
    this.set('h-state', !foot && p.wrecked > 0 ? 'WRECKED' : !foot && p.emp > 0 ? 'SYSTEMS DOWN' : !foot && p.shield > 0 ? 'SHIELD ' + p.shield.toFixed(1) : '');
    const key = touch ? 'Tap Use' : 'Press E'; let hint = '';
    if (foot) { const c = r.nearestCar(w, 4.6); hint = c ? key + ' to get in: ' + c.veh.name : touch ? 'Walk up to a vehicle to get in' : 'W A S D walk · Shift run · Space jump · walk up to a vehicle'; }
    else if (Math.abs(p.speed) < 9 && !p.air && p.wrecked <= 0) hint = key + ' to get out';
    this.set('h-hint', hint); this.set('h-board', ''); this.set('h-feed', r.feed.map(f => f.msg).join('\n'));
    this.css('vign', 'opacity', r.flash > 0 ? (r.flash * 2).toFixed(2) : '0');
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) $('toast').classList.remove('on'); }
    this.roamMap(r);
  }
  hud(r, dt) {
    if (r.mode === 'roam') return this.hudRoam(r, dt);
    const p = r.player, pos = r.position(p);
    this.set('h-speed', String(Math.round(Math.abs(p.speed) * 3.6))); this.set('h-gear', p.gear());
    this.css('h-nitro', 'width', (p.nitro / p.stats.nitroCap * 100).toFixed(0) + '%'); const hp = Math.max(0, p.health / p.stats.health);
    this.css('h-health', 'width', (hp * 100).toFixed(0) + '%'); this.css('h-health', 'background', hp < 0.3 ? 'var(--bad)' : hp < 0.6 ? 'var(--warn)' : 'var(--good)');
    this.set('h-weapon', p.weapon ? WEAPONS[p.weapon].name : (r.noWeapons ? 'Weapons off' : 'No weapon')); this.set('h-ammo', p.weapon ? '×' + p.ammo : '');
    if (r.mode === 'arena') { this.set('h-pos', ord(pos)); this.set('h-lap', 'Wrecks ' + p.kills); this.set('h-time', fmt(Math.max(0, r.timeLimit - r.raceTime))); this.set('h-best', 'Lost ' + p.deaths); }
    else { this.set('h-pos', r.cars.length > 1 ? ord(pos) + ' / ' + r.cars.length : 'Solo'); this.set('h-lap', 'Lap ' + Math.max(1, Math.min(r.laps, p.lap)) + ' / ' + r.laps); this.set('h-time', fmt(r.raceTime)); this.set('h-best', 'Best ' + fmt(p.bestLap || r.best)); }
    this.set('h-state', p.wrecked > 0 ? 'WRECKED' : p.emp > 0 ? 'SYSTEMS DOWN' : p.shield > 0 ? 'SHIELD ' + p.shield.toFixed(1) : '');
    this.css('vign', 'opacity', r.flash > 0 ? (r.flash * 2).toFixed(2) : '0');
    const st = r.standings(), rows = st.slice(0, 6).map((c, i) => `${i + 1} ${c.name}${r.mode === 'arena' ? ' · ' + c.kills : ''}${c.wrecked > 0 ? ' ✖' : ''}`).join('\n'); this.set('h-board', rows);
    this.set('h-feed', r.feed.map(f => f.msg).join('\n'));
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) $('toast').classList.remove('on'); }
    if (this.countT > 0) { this.countT -= dt; if (this.countT <= 0) $('count').textContent = ''; }
    // minimap
    const g = this.mm, S = r.track.samples; g.clearRect(0, 0, 150, 150); g.lineWidth = 5; g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineJoin = 'round'; g.beginPath();
    for (let i = 0; i <= S.length; i += 2) { const q = this.mmT(S[i % S.length].p); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); } g.closePath(); g.stroke();
    for (const c of r.cars) { if (c.wrecked > 0) continue; const q = this.mmT(c); g.fillStyle = c.isPlayer ? '#ffd23c' : '#ff4a2a'; g.beginPath(); g.arc(q[0], q[1], c.isPlayer ? 4.5 : 3.2, 0, 6.3); g.fill(); }
  }
  act_pause() { this.app.pause(true); }
  act_resume() { this.app.pause(false); }
  act_restart() { this.app.restart(); }
  act_quit() { this.app.quitRace(); }
  act_psettings() { this.settings('pause'); }

  results(res, out) {
    const rows = res.standings.map((r, i) => `<tr class="${r.isPlayer ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.name)}</td><td>${res.mode === 'arena' ? r.kills + ' wrecks' : r.time ? fmt(r.time) : 'Did not finish'}</td><td>${res.mode === 'arena' ? r.deaths + ' lost' : fmt(r.bestLap)}</td></tr>`).join('');
    const head = res.mode === 'trial' ? 'Best lap ' + fmt(res.bestLap) : ord(res.pos) + ' place';
    $('scr-results').innerHTML = `<div class="resbox"><p class="eyebrow">${out.title}</p><h2 class="${out.pass === false ? 'fail' : ''}">${head}</h2><p class="note">${out.line}</p>
      <div class="rgrid"><div><span>Race time</span><b>${fmt(res.time)}</b></div><div><span>Best lap</span><b>${fmt(res.bestLap)}</b></div><div><span>Wrecks scored</span><b>${res.kills}</b></div><div><span>Reward</span><b>+${out.reward.toLocaleString('en-US')} CR</b></div></div>
      ${out.unlocks.length ? `<div class="unl"><b>Unlocked</b>${out.unlocks.map(u => `<span>${esc(u)}</span>`).join('')}</div>` : ''}${out.ach.length ? `<div class="unl ach"><b>Achievements</b>${out.ach.map(u => `<span>${esc(u)}</span>`).join('')}</div>` : ''}
      <table class="tbl"><tr><th></th><th>Driver</th><th>${res.mode === 'arena' ? 'Score' : 'Time'}</th><th>${res.mode === 'arena' ? '' : 'Best lap'}</th></tr>${rows}</table>
      <div class="foot"><button class="btn ghost" data-act="retry">Retry</button><button class="btn big" data-act="cont">Continue</button></div></div>`;
    this.show('results');
  }
  act_retry() { this.app.restart(); }
  act_cont() { this.app.afterResults(); }
}
