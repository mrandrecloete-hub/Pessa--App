// PROJECT X: game data. Vehicles, tracks, weapons, characters, career. All original.

export const VEHICLES = [
  { id: 'wisp', name: 'Wisp GT', cls: 'Lightweight speed racer', price: 0,
    top: 64, accel: 21, turn: 2.5, grip: 8.5, drift: 2.2, armor: 0.8, mass: 0.8, nitro: 1.0,
    shape: { len: 4.3, wid: 1.85, h: 0.95, ride: 0.28, wheel: 0.36, cab: 0.52, nose: 0.25, tail: 0.5, spoiler: 1 }, color: 0xf2b21a },
  { id: 'bastion', name: 'Bastion', cls: 'Heavy armoured racer', price: 0,
    top: 54, accel: 15, turn: 2.0, grip: 9.5, drift: 1.6, armor: 1.6, mass: 1.7, nitro: 0.9,
    shape: { len: 5.0, wid: 2.25, h: 1.45, ride: 0.45, wheel: 0.5, cab: 0.45, nose: 0.6, tail: 0.75, spoiler: 0, bull: 1 }, color: 0x7fa01c },
  { id: 'dune', name: 'Dune Hound', cls: 'Off road combat vehicle', price: 0,
    top: 57, accel: 18, turn: 2.3, grip: 7.8, drift: 2.0, armor: 1.15, mass: 1.2, nitro: 1.0,
    shape: { len: 4.4, wid: 2.1, h: 1.35, ride: 0.62, wheel: 0.56, cab: 0.5, nose: 0.5, tail: 0.6, spoiler: 0, rack: 1 }, color: 0xd98a1e },
  { id: 'brawler', name: 'Brawler V8', cls: 'Muscle racing vehicle', price: 2500,
    top: 61, accel: 20, turn: 2.1, grip: 7.6, drift: 2.4, armor: 1.1, mass: 1.25, nitro: 1.1,
    shape: { len: 4.9, wid: 2.0, h: 1.1, ride: 0.32, wheel: 0.42, cab: 0.56, nose: 0.42, tail: 0.55, spoiler: 1, scoop: 1 }, color: 0xc0261c },
  { id: 'halo', name: 'Halo S', cls: 'Futuristic supercar', price: 6000,
    top: 69, accel: 23, turn: 2.4, grip: 9.2, drift: 1.9, armor: 0.9, mass: 0.95, nitro: 1.15,
    shape: { len: 4.7, wid: 2.05, h: 0.9, ride: 0.22, wheel: 0.38, cab: 0.47, nose: 0.2, tail: 0.42, spoiler: 2, glow: 1 }, color: 0x2b8cff },
  { id: 'warden', name: 'Warden', cls: 'Tactical weapon vehicle', price: 4000,
    top: 58, accel: 18, turn: 2.2, grip: 8.6, drift: 1.8, armor: 1.3, mass: 1.35, nitro: 0.95, weaponBonus: 1.5,
    shape: { len: 4.7, wid: 2.1, h: 1.25, ride: 0.4, wheel: 0.46, cab: 0.48, nose: 0.5, tail: 0.65, spoiler: 0, rack: 1, bull: 1 }, color: 0x4a5560 },
  { id: 'slipstream', name: 'Slipstream', cls: 'Drift specialist', price: 3500,
    top: 62, accel: 20, turn: 2.8, grip: 7.0, drift: 3.0, armor: 0.9, mass: 0.95, nitro: 1.05,
    shape: { len: 4.5, wid: 1.9, h: 1.0, ride: 0.26, wheel: 0.38, cab: 0.55, nose: 0.3, tail: 0.5, spoiler: 2 }, color: 0xb026d9 },
  { id: 'xr1', name: 'XR-1 Prototype', cls: 'Experimental championship vehicle', price: 12000,
    top: 73, accel: 25, turn: 2.6, grip: 9.6, drift: 2.2, armor: 1.05, mass: 1.0, nitro: 1.3,
    shape: { len: 4.8, wid: 2.1, h: 0.85, ride: 0.2, wheel: 0.4, cab: 0.44, nose: 0.16, tail: 0.38, spoiler: 2, glow: 1, fins: 1 }, color: 0x16181d },
];
export const vehicleById = id => VEHICLES.find(v => v.id === id) || VEHICLES[0];

export const UPGRADES = [
  { id: 'engine', name: 'Engine', desc: 'Higher top speed' },
  { id: 'turbo', name: 'Turbo', desc: 'Stronger acceleration' },
  { id: 'trans', name: 'Transmission', desc: 'Faster launch and shifts' },
  { id: 'susp', name: 'Suspension', desc: 'Sharper steering' },
  { id: 'tires', name: 'Tires', desc: 'More grip in corners' },
  { id: 'armor', name: 'Armour', desc: 'More vehicle health' },
  { id: 'nitro', name: 'Nitro', desc: 'Longer, stronger boost' },
  { id: 'weapons', name: 'Weapon systems', desc: 'More ammunition per pickup' },
];
export const UPGRADE_MAX = 3;
export const upgradeCost = lvl => 500 + lvl * 700;

// Final driving stats for a vehicle with upgrade levels applied.
export function buildStats(veh, up = {}) {
  const l = k => up[k] || 0;
  return {
    top: veh.top * (1 + 0.035 * l('engine')),
    accel: veh.accel * (1 + 0.06 * l('turbo') + 0.03 * l('trans')),
    turn: veh.turn * (1 + 0.04 * l('susp')),
    grip: veh.grip * (1 + 0.06 * l('tires')),
    drift: veh.drift,
    health: 100 * veh.armor * (1 + 0.12 * l('armor')),
    mass: veh.mass,
    nitroCap: 100 * veh.nitro * (1 + 0.15 * l('nitro')),
    nitroPow: 1 + 0.05 * l('nitro'),
    ammoMul: (veh.weaponBonus || 1) * (1 + 0.2 * l('weapons')),
  };
}

export const PAINTS = [0xf2b21a, 0xc0261c, 0x2b8cff, 0x7fa01c, 0xb026d9, 0xe8e8ec, 0x16181d, 0xff6a00, 0x12b8a6, 0xd9c7a0];
export const RIMS = [0x1b1d22, 0xc9ccd4, 0xe0a020, 0xd02828, 0x2b8cff];

export const WEAPONS = {
  mg:      { name: 'Machine guns',      ammo: 60, cd: 0.09, dmg: 4,  auto: true },
  rocket:  { name: 'Rockets',           ammo: 3,  cd: 0.7,  dmg: 34 },
  missile: { name: 'Homing missiles',   ammo: 2,  cd: 1.0,  dmg: 30 },
  mine:    { name: 'Land mines',        ammo: 3,  cd: 0.6,  dmg: 40 },
  emp:     { name: 'EMP',               ammo: 1,  cd: 1.5,  dmg: 10 },
  shell:   { name: 'Explosive shells',  ammo: 3,  cd: 0.9,  dmg: 44 },
  shield:  { name: 'Shield',            ammo: 1,  cd: 1.0,  dmg: 0 },
};
export const WEAPON_IDS = Object.keys(WEAPONS);

// Tracks: closed loops of control points [x, z, y]. Units are metres.
export const TRACKS = [
  { id: 'desert', name: 'Desert Canyon', laps: 3, width: 12,
    blurb: 'Cliff roads, a canyon jump and drifting sand.',
    pts: [[0,0,0],[140,-10,0],[260,-60,6],[330,-170,14],[300,-290,20],[190,-340,14],[80,-300,6],[10,-360,2],[-110,-390,0],[-220,-330,4],[-250,-210,12],[-180,-120,18],[-230,-20,10],[-150,40,2]],
    theme: { sky: [0xf7b267, 0x8fc1e3], fog: 0xe6b98a, fogD: 0.0016, ground: 0xc98d55, road: 0x4a4038, wall: 0x9b5a2e, glow: 0xff9a3c, sun: 0xfff0d0, sunI: 2.6, amb: 0.9, props: 'rocks', dust: 0xd9a066, weather: 'sand' } },
  { id: 'city', name: 'Futuristic Industrial City', laps: 3, width: 13,
    blurb: 'Factory highways and tunnels under night lights.',
    pts: [[0,0,0],[160,0,0],[250,-50,0],[260,-160,4],[200,-240,8],[80,-250,8],[40,-330,4],[-90,-350,0],[-200,-300,0],[-230,-190,0],[-150,-130,6],[-170,-40,6],[-90,10,0]],
    theme: { sky: [0x1a2238, 0x070a14], fog: 0x121a2c, fogD: 0.0022, ground: 0x15181f, road: 0x34373f, wall: 0x4a5264, glow: 0x3ab7ff, sun: 0x9db8ff, sunI: 1.1, amb: 0.75, props: 'factory', dust: 0x556070, night: true, tunnel: true } },
  { id: 'mountain', name: 'Mountain Highway', laps: 3, width: 11,
    blurb: 'Narrow bends, bridges and steep descents.',
    pts: [[0,0,0],[120,-20,8],[200,-100,20],[170,-200,34],[240,-290,44],[170,-380,36],[50,-360,24],[-20,-270,30],[-120,-300,22],[-210,-240,12],[-190,-130,16],[-260,-50,8],[-170,30,2],[-70,20,0]],
    theme: { sky: [0xbfd9f2, 0x4f86c6], fog: 0xc7d8e8, fogD: 0.0014, ground: 0x6f7a72, road: 0x3a3d42, wall: 0xb8bcc2, glow: 0xffffff, sun: 0xffffff, sunI: 2.8, amb: 1.0, props: 'pines', dust: 0xdfe6ea, snow: true } },
  { id: 'military', name: 'Abandoned Military Zone', laps: 3, width: 13,
    blurb: 'Broken concrete, wrecks and barriers on the road.',
    pts: [[0,0,0],[150,10,0],[240,-40,2],[250,-150,2],[330,-230,0],[280,-330,0],[160,-320,4],[90,-230,6],[-10,-250,4],[-60,-340,0],[-190,-330,0],[-250,-230,0],[-200,-130,3],[-240,-40,3],[-140,20,0]],
    theme: { sky: [0x9a8f86, 0x4e5560], fog: 0x77736e, fogD: 0.0024, ground: 0x4d4a42, road: 0x35353a, wall: 0x6e6a60, glow: 0xff5a2a, sun: 0xffd9b0, sunI: 1.9, amb: 0.85, props: 'bunkers', dust: 0x8a8378, hazards: 'heavy' } },
  { id: 'jungle', name: 'Tropical Jungle', laps: 3, width: 11,
    blurb: 'Mud roads, water crossings and old ruins.',
    pts: [[0,0,0],[110,-30,2],[190,-110,0],[160,-210,-2],[230,-300,0],[150,-380,4],[30,-350,8],[-40,-260,4],[-140,-280,0],[-220,-200,-2],[-180,-100,0],[-240,-10,4],[-140,40,2],[-60,30,0]],
    theme: { sky: [0xbfe3c0, 0x4fa3b8], fog: 0x9ec4a0, fogD: 0.0028, ground: 0x2f5a2c, road: 0x5a4632, wall: 0x6b5a3a, glow: 0xa6ff5a, sun: 0xfff4c8, sunI: 2.2, amb: 1.0, props: 'jungle', dust: 0x7a5e3c, water: true } },
  { id: 'neon', name: 'Neon Metropolis', laps: 3, width: 13,
    blurb: 'Wet highways and tunnels between neon towers.',
    pts: [[0,0,0],[170,0,0],[270,-70,3],[250,-180,6],[310,-270,6],[230,-360,3],[100,-340,0],[50,-250,0],[-60,-240,4],[-130,-330,4],[-240,-290,0],[-260,-170,0],[-180,-100,0],[-220,-10,0],[-110,30,0]],
    theme: { sky: [0x2a0f4a, 0x05030f], fog: 0x1a0b33, fogD: 0.002, ground: 0x0d0b16, road: 0x2b2a3a, wall: 0x3a2a5a, glow: 0xff2bd6, sun: 0xb99cff, sunI: 0.9, amb: 0.7, props: 'towers', dust: 0x5a4a80, night: true, wet: true, tunnel: true } },
];
export const trackById = id => TRACKS.find(t => t.id === id) || TRACKS[0];
export const ARENA = { id: 'arena', name: 'The Crucible', radius: 95,
  theme: { sky: [0x40262a, 0x0c0a10], fog: 0x241a1c, fogD: 0.003, ground: 0x2b2a2e, road: 0x2b2a2e, wall: 0x7a2a22, glow: 0xff4a1a, sun: 0xffc9a0, sunI: 1.6, amb: 0.8, props: 'none', dust: 0x6a5a55, night: true } };

// Characters. personality: skill 0..1, aggro 0..1, defend 0..1
export const PLAYER = { name: 'Rian Vega', team: 'Independent', bio: 'A salvage pilot from the Dust Belt with a borrowed car and a debt to clear.' };
export const RIVALS = [
  { id: 'kade', name: 'Kade Mercer', team: 'Ironline', car: 'bastion', skill: 0.72, aggro: 0.9, defend: 0.3, line: 'Stay behind me or stay in pieces.' },
  { id: 'sol', name: 'Sol Okoro', team: 'Sunforge', car: 'wisp', skill: 0.9, aggro: 0.35, defend: 0.5, line: 'Clean lines win races. Watch and learn.' },
  { id: 'nyx', name: 'Nyx Arden', team: 'Violet Static', car: 'slipstream', skill: 0.82, aggro: 0.6, defend: 0.6, line: 'I drift where you brake.' },
  { id: 'brask', name: 'Brask Hollin', team: 'Ironline', car: 'dune', skill: 0.66, aggro: 0.75, defend: 0.45, line: 'Mud, sand, rubble. All mine.' },
  { id: 'ivy', name: 'Ivy Castell', team: 'Glasswing', car: 'halo', skill: 0.86, aggro: 0.4, defend: 0.85, line: 'You will not land a shot on me.' },
  { id: 'tor', name: 'Tor Vashti', team: 'Sunforge', car: 'brawler', skill: 0.76, aggro: 0.8, defend: 0.35, line: 'Power first. Everything else later.' },
  { id: 'wren', name: 'Wren Sato', team: 'Glasswing', car: 'warden', skill: 0.78, aggro: 0.7, defend: 0.7, line: 'Every pickup on this track is already mine.' },
];
export const BOSSES = [
  { id: 'gauntlet', name: 'Marshal Gauntlet', team: 'Circuit Enforcer', car: 'bastion', skill: 0.88, aggro: 1, defend: 0.7, hp: 2.2, line: 'The Circuit sent me to end your season.' },
  { id: 'seraph', name: 'Seraph Nine', team: 'Reigning Champion', car: 'xr1', skill: 0.97, aggro: 0.8, defend: 0.9, hp: 2.0, line: 'Nine titles. You are not the tenth name on that trophy.' },
];
export const ORGANISER = { name: 'Director Halden Voss', role: 'Meridian Circuit Authority' };

export const DIFFICULTY = { easy: { name: 'Easy', spd: 0.86, aim: 0.5 }, normal: { name: 'Normal', spd: 0.93, aim: 0.75 }, hard: { name: 'Hard', spd: 0.99, aim: 1 }, extreme: { name: 'Extreme', spd: 1.04, aim: 1.2 } };

export const POINTS = [10, 7, 5, 4, 3, 2];
export const PRIZE = [1200, 800, 550, 400, 300, 200];

// Career: ordered events. needPos = worst finishing place that still passes.
export const CAREER = [
  { type: 'race', track: 'desert', diff: 'easy', needPos: 3, reward: 800,
    title: 'Qualifier: Dust Belt', story: 'Director Voss gives every newcomer one chance. Finish in the top three at Desert Canyon and the Meridian Circuit signs you. Finish lower and you go back to hauling scrap.' },
  { type: 'race', track: 'city', diff: 'easy', needPos: 3, reward: 1000,
    title: 'Night Shift', story: 'Ironline owns the factory district and Kade Mercer does not like new faces. Weapons are live from the first corner.' },
  { type: 'trial', track: 'mountain', target: 78, reward: 900,
    title: 'Proving Lap', story: 'Sunforge will lend you track time on the Mountain Highway if you can post a lap under 1:18. No rivals, no weapons, only the clock.' },
  { type: 'race', track: 'military', diff: 'normal', needPos: 3, reward: 1400, unlockCar: 'brawler',
    title: 'The Graveyard', story: 'The old base is full of wrecks and worse. Tor Vashti has put up his spare Brawler V8 for whoever beats him to the podium.' },
  { type: 'boss', boss: 'gauntlet', track: 'city', diff: 'normal', reward: 2500,
    title: 'Boss: Marshal Gauntlet', story: 'You are winning too fast. The Circuit Authority sends its enforcer to push you out. One on one, three laps. Beat Marshal Gauntlet to the line.' },
  { type: 'race', track: 'jungle', diff: 'normal', needPos: 2, reward: 1600,
    title: 'Green Hell', story: 'Brask Hollin grew up on these mud roads. Finish first or second to keep your licence.' },
  { type: 'arena', diff: 'normal', needPos: 2, reward: 1800, unlockCar: 'warden',
    title: 'The Crucible', story: 'No laps. No finish line. Three minutes in the arena. Score more wrecks than the field and Glasswing hands over a Warden.' },
  { type: 'race', track: 'neon', diff: 'hard', needPos: 2, reward: 2200,
    title: 'Neon Run', story: 'The Metropolis final qualifier. Ivy Castell and Nyx Arden both need this result as much as you do.' },
  { type: 'race', track: 'mountain', diff: 'hard', needPos: 1, reward: 2600, unlockCar: 'slipstream',
    title: 'Last Ascent', story: 'Only the winner goes to the title race. Sol Okoro has never lost on this mountain.' },
  { type: 'boss', boss: 'seraph', track: 'neon', diff: 'hard', reward: 6000, unlockCar: 'xr1',
    title: 'Final: Seraph Nine', story: 'Nine titles in nine years. Seraph Nine drives the XR-1 Prototype and has never been beaten head to head. Win, and both the car and the championship are yours.' },
];
