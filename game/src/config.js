// Halcyon Heist — every tuning number, colour and level in one place.
// The playfield is a fixed 1280x800 logical area (32x20 tiles of 40 px);
// the renderer scales it to the window, so no rule depends on screen size.
//
// Map legend (one character per tile):
//   # wall (blocks movement and sight)   . floor
//   C crate (blocks movement and sight)  B potted plant (walkable, hides)
//   S shadow rug (walkable, hides)       V vault (hold E to crack: the objective)
//   F safe (hold E to crack: bonus loot) G gold bar (pickup)   I intel (pickup)
//   P thief spawn                        E getaway van (exit)
//   L laser grid (level 3: live half the time, crossing it live trips the alarm)
// Guards and cameras are placed per level below the maps (tile coordinates).

export const TILE = 40;
export const COLS = 32;
export const ROWS = 20;
export const FIELD = { width: 1280, height: 800 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 13,
  walkSpeed: 205,
  sprintSpeed: 305,
  /** Extra speed lost per gold bar carried: a heavy bag slows the getaway. */
  carrySlow: 5,
  maxCarrySlow: 30,
};

export const GUARD = {
  radius: 14,
  patrolSpeed: 78,
  chaseSpeed: 185,
  investigateSpeed: 130,
  /** Vision cone: how far a guard sees, in pixels, and its half-angle. */
  sightRange: 265,
  halfAngle: 0.62,
  /** A guard only spots a hidden thief (bush / shadow / smoke) this close. */
  hiddenSpotRange: 52,
  /** Seconds of full sight before the alarm trips. */
  spotTime: 1.15,
  /** Seconds a guard stares before walking over to check. */
  suspiciousTime: 0.9,
  /** Seconds of searching before giving up and returning to patrol. */
  investigateTime: 5,
};

export const CAMERA = {
  sightRange: 250,
  halfAngle: 0.5,
  /** Seconds a camera needs to see you before the alarm trips. */
  spotTime: 0.9,
  /** Seconds a hack (H) keeps a camera dark. */
  hackDuration: 10,
};

export const ALARM = {
  /** Points per second the alarm climbs while any watcher sees the thief. */
  risePerSecond: 46,
  /** Points per second it falls back while unseen. */
  decayPerSecond: 9,
  /** At 100 the alarm trips: every guard hunts for this many seconds. */
  tripSeconds: 12,
  /** Below this the hunt ends early and guards stand down. */
  standDownBelow: 35,
};

export const TOOLS = {
  smokeCount: 2,
  smokeSeconds: 4.5,
  smokeRadius: 95,
  hackCount: 2,
};

export const CRACK = {
  vaultSeconds: 3.0,
  safeSeconds: 1.6,
  /** Cracking is loud: guards this close hear it and turn. */
  noiseRadius: 190,
};

export const LASER = {
  /** Seconds of the cycle the grid is live, then dark. */
  liveSeconds: 2.2,
  darkSeconds: 2.2,
};

export const SCORES = {
  gold: 150,
  intel: 250,
  safe: 400,
  vault: 1000,
  ghostBonus: 500,
  /** Time bonus: this many points per second under par. */
  timePerSecond: 12,
};

export const PALETTE = {
  backdrop: '#0d0f1a',
  floor: '#2a2e4c',
  floorAlt: '#262a45',
  floorEdge: '#2e3352',
  wall: '#101223',
  wallTop: '#3a3f63',
  wallFace: '#1b1e33',
  crate: '#6b4a2a',
  crateTop: '#8a6238',
  crateEdge: '#4a3018',
  plant: '#1e5c34',
  plantLight: '#2f8a4e',
  shadow: '#161a30',
  vault: '#f2c94c',
  vaultDark: '#a8842a',
  safe: '#8f9bb3',
  gold: '#ffd94d',
  intel: '#7fe7ff',
  exit: '#39d98a',
  exitDark: '#1d7a4c',
  player: '#e8ecf5',
  playerCoat: '#232a4a',
  guard: '#e5534b',
  guardDark: '#8f2f28',
  cone: '#ffd94d',
  coneAlert: '#ff5a3c',
  camera: '#7fe7ff',
  cameraCone: '#7fe7ff',
  laser: '#ff3b6b',
  smoke: '#9aa3b8',
  alarm: '#ff5a3c',
  panel: '#12152a',
  panelEdge: '#2e3352',
  text: '#eef1f5',
  muted: '#9aa3b8',
  goldText: '#ffd94d',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'halcyon-heist.best';

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

const L1_MAP = [
  '################################',
  '#P...B.......C....G............#',
  '#.............#................#',
  '#..C.........#.....B.I..C......#',
  '#.............#................#',
  '#....G.......#..........G......#',
  '#.............#................#',
  '#..B.....C....#....C...........#',
  '#.............#..........B.....#',
  '#..............................#',
  '#..C..........#....G...........#',
  '#.............#................#',
  '#....B....F...#.....C....B.....#',
  '#.............#................#',
  '#..G..........#..........C.....#',
  '#.............#................#',
  '#....F....B...#....B.....I.....#',
  '#.............#................#',
  '#..V.....C....#....E....G......#',
  '################################',
];

const L2_MAP = [
  '################################',
  '#P...C....B.......C....G.......#',
  '#..............................#',
  '#..B....C....F....C....B.......#',
  '#..............................#',
  '#....G......C..........C....G..#',
  '#..............................#',
  '#..C.I..B..........C.....B.....#',
  '#........C....#........C.......#',
  '#.............#................#',
  '#..F.....C....#....C.....F.....#',
  '#.............#................#',
  '#....B....C...#.....B....C.....#',
  '#...................I..........#',
  '#..C..........#..........G.....#',
  '#.............#.........I......#',
  '#....G....B...#....C....B......#',
  '#.............#................#',
  '#..V....C.....#....E....C......#',
  '################################',
];

const L3_MAP = [
  '################################',
  '#P...B....L....L....G....B.....#',
  '#.........L....L...............#',
  '#..C.....L....L....C....B......#',
  '#.........L....L...............#',
  '#....G....L....L.........G.....#',
  '#.........L....L...............#',
  '#..B.....L....L....I....B......#',
  '#.........L....L.........C.....#',
  '#..............................#',
  '#..F.....L....L....F.I..B......#',
  '#.........L....L...............#',
  '#....C...L....L....C....G......#',
  '#.........L....L...............#',
  '#..B.....L....L....B....C......#',
  '#.........L....L...............#',
  '#....G...L....L....C....B......#',
  '#.........L....L...............#',
  '#..V.....L....L....E....G......#',
  '################################',
];

export const LEVELS = [
  {
    name: 'The Gallery',
    par: 75,
    vault: 'the Aurum Idol',
    map: L1_MAP,
    guards: [
      { waypoints: [[5, 2], [12, 2], [12, 6], [5, 6]], speed: 78 },
      { waypoints: [[20, 4], [27, 4], [27, 8], [20, 8]], speed: 82 },
      { waypoints: [[19, 11], [27, 11], [27, 15], [19, 15]], speed: 78 },
    ],
    cameras: [{ x: 28, y: 1, base: Math.PI / 2, sweep: 0.55, range: 1.1 }],
  },
  {
    name: 'The Vault Floor',
    par: 100,
    vault: 'the Meridian Diamonds',
    map: L2_MAP,
    guards: [
      { waypoints: [[4, 2], [11, 2], [11, 6], [4, 6]], speed: 82 },
      { waypoints: [[19, 2], [27, 2], [27, 6], [19, 6]], speed: 86 },
      { waypoints: [[5, 11], [12, 11], [12, 14], [5, 14]], speed: 82 },
      { waypoints: [[19, 11], [27, 11], [27, 15], [18, 15]], speed: 86 },
    ],
    cameras: [
      { x: 16, y: 1, base: Math.PI / 2, sweep: 0.5, range: 1.2 },
      { x: 15, y: 18, base: -Math.PI / 2, sweep: 0.5, range: 1.2 },
    ],
  },
  {
    name: 'The Neon Rooftop',
    par: 120,
    vault: 'the Halcyon Ledger',
    map: L3_MAP,
    guards: [
      { waypoints: [[4, 2], [9, 2], [9, 6], [4, 6]], speed: 88 },
      { waypoints: [[20, 2], [27, 2], [27, 6], [20, 6]], speed: 88 },
      { waypoints: [[4, 11], [9, 11], [9, 14], [4, 14]], speed: 92 },
      { waypoints: [[20, 11], [27, 11], [27, 16], [20, 16]], speed: 92 },
      { waypoints: [[14, 4], [17, 4], [17, 15], [14, 15]], speed: 80 },
    ],
    cameras: [
      { x: 10, y: 1, base: Math.PI / 2, sweep: 0.6, range: 1.0 },
      { x: 21, y: 1, base: Math.PI / 2, sweep: 0.6, range: 1.0 },
      { x: 16, y: 18, base: -Math.PI / 2, sweep: 0.6, range: 1.0 },
    ],
    lasers: true,
  },
];
