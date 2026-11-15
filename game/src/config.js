// Every tuning number, colour and definition in one place. The playfield is a fixed
// 1280x720 logical area; the renderer scales it to the window, so no rule below depends
// on the screen size. Tidekeeper is a tower defence: tide creatures march along a reef
// channel from the left edge to the right; the keeper builds towers on the reef to stop
// them. 15 waves; win by clearing wave 15, lose when 20 lives leak away.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Grid of buildable reef cells (80 px each). */
export const GRID = { cols: 16, rows: 9, cell: 80 };

/**
 * The tide channel, as grid cells (col, row). It snakes left -> right across the reef:
 * row 1 across, down column 12, row 4 back left, down column 3, row 7 out to the sea.
 */
export const PATH_CELLS = [
  ...Array.from({ length: 13 }, (_, i) => [i, 1]),
  [12, 2], [12, 3], [12, 4],
  ...Array.from({ length: 8 }, (_, i) => [11 - i, 4]),
  [3, 5], [3, 6], [3, 7],
  ...Array.from({ length: 12 }, (_, i) => [4 + i, 7]),
];

/** Pixel waypoints (cell centres) the creatures walk, off-screen in and out. */
export const WAYPOINTS = [
  [-40, 120], [1000, 120], [1000, 360], [280, 360], [280, 600], [1320, 600],
];

export const START_GOLD = 200;
export const START_LIVES = 20;
export const TOTAL_WAVES = 15;
export const INTERMISSION = 8; // seconds between waves before the next auto-starts
export const EARLY_CALL_GOLD_PER_SEC = 3; // bonus gold per second of intermission skipped
export const SELL_REFUND = 0.7;
export const MAX_TOWER_LEVEL = 3;

export const TOWERS = {
  coral: {
    key: 'coral', name: 'Coral Shooter', hotkey: '1', cost: 50,
    range: 150, damage: 8, rate: 2.0, projectileSpeed: 540,
    splash: 0, slowFactor: 1, slowDuration: 0,
    color: '#ff8a70', dark: '#c94b38', desc: 'Fast coral darts',
  },
  kelp: {
    key: 'kelp', name: 'Frost Kelp', hotkey: '2', cost: 75,
    range: 145, damage: 3, rate: 1.0, projectileSpeed: 460,
    splash: 0, slowFactor: 0.55, slowDuration: 1.6,
    color: '#7fe3ff', dark: '#2f9db8', desc: 'Chills and slows',
  },
  anemone: {
    key: 'anemone', name: 'Cannon Anemone', hotkey: '3', cost: 120,
    range: 175, damage: 26, rate: 0.55, projectileSpeed: 400,
    splash: 78, slowFactor: 1, slowDuration: 0,
    color: '#c99aff', dark: '#7a4fd0', desc: 'Splash shells',
  },
};
export const TOWER_ORDER = ['coral', 'kelp', 'anemone'];

/** Upgrade cost multiplier per target level (level 2 costs 0.8x base, level 3 costs 1.4x). */
export const UPGRADE_COST = { 2: 0.8, 3: 1.4 };
/** Per-level stat growth. */
export const UPGRADE_DAMAGE = 1.5;
export const UPGRADE_RANGE = 1.12;
export const UPGRADE_RATE = 1.1;

export const ENEMIES = {
  minnow: { name: 'Minnow', hp: 30, speed: 72, bounty: 6, radius: 12, damage: 1, color: '#ffb347', dark: '#d97b1e' },
  jelly: { name: 'Jelly', hp: 58, speed: 56, bounty: 8, radius: 14, damage: 1, color: '#ff9de2', dark: '#c65a9e' },
  crab: { name: 'Crab', hp: 130, speed: 38, bounty: 11, radius: 16, damage: 1, color: '#ff6b6b', dark: '#b03030' },
  leviathan: { name: 'Leviathan', hp: 1900, speed: 26, bounty: 150, radius: 30, damage: 5, color: '#8be04e', dark: '#4a7d24' },
};

/** Enemy hit points grow 38% per wave on top of the base. */
export const HP_GROWTH_PER_WAVE = 0.38;

export const POOL_ENEMIES = 96;
export const POOL_PROJECTILES = 128;
export const POOL_PARTICLES = 256;
export const POOL_FLOATERS = 48;

export const PALETTE = {
  backdrop: '#06121f',
  waterDeep: '#0a2438',
  water: '#0d3049',
  waterLight: '#11405e',
  sand: '#c9a86a',
  sandDark: '#a8874f',
  reef: '#123f2e',
  reefLight: '#1a5a3c',
  coralPink: '#ff7fa5',
  coralOrange: '#ff9a5c',
  panel: '#0b1c2bcc',
  panelSolid: '#0d2233',
  panelEdge: '#2b5876',
  text: '#eef7ff',
  muted: '#9db8c9',
  gold: '#ffd94d',
  red: '#ff6b6b',
  green: '#7fe08a',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'tidekeeper.best';
