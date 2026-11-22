// The Meridian Vault — a top-down stealth heist game.
// Every tuning number, colour and level layout in one place. The playfield is a fixed
// 1280x720 logical area; the renderer scales it to the window, so no rule below depends
// on the screen size. All art is drawn in code: no image, font or sound files.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 14,
  speed: 235,
  sneakSpeed: 125,
  /** How much slower suspicion grows while sneaking. */
  sneakStealth: 0.45,
};

export const LIVES = 3;

/** Guard vision: how far a guard sees, and the half-angle of the cone. */
export const GUARD = {
  radius: 15,
  patrolSpeed: 62,
  chaseSpeed: 168,
  viewRange: 235,
  viewHalfAngle: 0.62,
  /** Suspicion gained per second while the thief is in view (scaled by closeness). */
  suspicionRate: 1.5,
  suspicionDecay: 0.45,
  /** Seconds a guard keeps chasing after losing sight. */
  chaseMemory: 2.5,
  /** Seconds a guard stands at each waypoint before walking on. */
  waypointPause: 1.4,
};

/** Security cameras: fixed to a wall, sweeping their cone back and forth. */
export const CAMERA = {
  viewRange: 265,
  viewHalfAngle: 0.42,
  /** Alarm gained per second while a camera sees the thief. */
  alarmRate: 26,
};

export const ALARM = {
  /** Alarm gained per second while any guard is suspicious or chasing. */
  guardRate: 9,
  chaseRate: 22,
  /** Alarm lost per second while nobody sees the thief. */
  decay: 7,
  /** At 100 the vault locks down: every guard hunts the thief for this long. */
  lockdownSeconds: 7,
  lockdownFallTo: 42,
};

export const LOOT = {
  /** Radius inside which the thief pockets a piece of loot. */
  grabRadius: 34,
};

/** Seconds of play per level before the time bonus runs out. */
export const LEVEL_TIME_BONUS = 15000;

export const PALETTE = {
  backdrop: '#0a0c12',
  floorA: '#171a24',
  floorB: '#1b1f2c',
  floorLine: '#222735',
  carpet: '#5d1f2b',
  carpetTrim: '#c9a227',
  wall: '#2e3444',
  wallTop: '#4a5470',
  wallTrim: '#c9a227',
  caseGlass: 'rgba(150, 200, 255, 0.10)',
  caseFrame: '#3d465e',
  pedestal: '#39415a',
  text: '#eef1f5',
  muted: '#9aa3b5',
  gold: '#f2c94c',
  goldDark: '#c9a227',
  thief: '#2b2f3a',
  thiefHood: '#171a22',
  thiefMask: '#f2c94c',
  guard: '#2e4a7a',
  guardCap: '#1d3355',
  coneCalm: 'rgba(242, 201, 76, 0.16)',
  coneEdge: 'rgba(242, 201, 76, 0.35)',
  coneAlert: 'rgba(229, 83, 75, 0.20)',
  coneAlertEdge: 'rgba(229, 83, 75, 0.45)',
  cameraCone: 'rgba(120, 200, 255, 0.13)',
  cameraConeEdge: 'rgba(120, 200, 255, 0.32)',
  cameraBody: '#8a94a8',
  exitClosed: '#3a4152',
  exitOpen: '#2fbf71',
  panel: 'rgba(16, 19, 28, 0.94)',
  panelBorder: '#c9a227',
  alarmLow: '#2fbf71',
  alarmMid: '#f2c94c',
  alarmHigh: '#e5534b',
  danger: '#e5534b',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'meridian-vault.best';

/**
 * The three heists. Walls and cases block movement and sight; guards walk their waypoints;
 * cameras sweep; loot is pocketed by walking close; the exit opens once every loot is taken.
 * Coordinates are in the 1280x720 field. The outer walls are implicit (the field border).
 */
export const LEVELS = [
  {
    name: 'The Meridian Gallery',
    intro: 'Lift all five pieces, then slip out the green door. Stay out of the yellow cones.',
    start: { x: 90, y: 620 },
    exit: { x: 1216, y: 96, w: 12, h: 76 },
    walls: [
      { x: 300, y: 0, w: 26, h: 260 },
      { x: 300, y: 420, w: 26, h: 300 },
      { x: 640, y: 140, w: 26, h: 300 },
      { x: 640, y: 560, w: 26, h: 160 },
      { x: 940, y: 0, w: 26, h: 300 },
      { x: 940, y: 460, w: 26, h: 260 },
    ],
    cases: [
      { x: 150, y: 150, w: 110, h: 60 },
      { x: 430, y: 480, w: 110, h: 60 },
      { x: 760, y: 150, w: 110, h: 60 },
      { x: 1080, y: 480, w: 110, h: 60 },
    ],
    loot: [
      { x: 205, y: 130, kind: 'painting', name: 'Portrait of the Duchess', value: 1200 },
      { x: 485, y: 460, kind: 'gem', name: 'The Meridian Star', value: 2500 },
      { x: 815, y: 130, kind: 'vase', name: 'Celadon Phoenix Vase', value: 1500 },
      { x: 1135, y: 460, kind: 'bars', name: 'Gold Ingots', value: 2000 },
      { x: 1135, y: 210, kind: 'crown', name: 'The Gilded Crown', value: 3000 },
    ],
    guards: [
      { waypoints: [{ x: 200, y: 360 }, { x: 560, y: 360 }], speed: 62 },
      { waypoints: [{ x: 1180, y: 120 }, { x: 1180, y: 440 }, { x: 1000, y: 440 }, { x: 1000, y: 120 }], speed: 58 },
    ],
    cameras: [
      { x: 640, y: 8, baseAngle: Math.PI / 2, sweep: 0.85, speed: 0.55 },
      { x: 1272, y: 360, baseAngle: Math.PI, sweep: 0.7, speed: 0.7 },
    ],
  },
  {
    name: 'The Vault Floor',
    intro: 'More guards, more cameras. The Star Sapphire is worth the risk.',
    start: { x: 90, y: 90 },
    exit: { x: 64, y: 640, w: 76, h: 12 },
    walls: [
      { x: 260, y: 140, w: 26, h: 220 },
      { x: 260, y: 480, w: 26, h: 240 },
      { x: 560, y: 0, w: 26, h: 200 },
      { x: 560, y: 320, w: 26, h: 400 },
      { x: 860, y: 140, w: 26, h: 220 },
      { x: 860, y: 480, w: 26, h: 240 },
      { x: 1080, y: 300, w: 200, h: 26 },
    ],
    cases: [
      { x: 150, y: 300, w: 60, h: 110 },
      { x: 420, y: 560, w: 110, h: 60 },
      { x: 700, y: 300, w: 60, h: 110 },
      { x: 1000, y: 560, w: 110, h: 60 },
      { x: 1120, y: 120, w: 110, h: 60 },
    ],
    loot: [
      { x: 180, y: 280, kind: 'painting', name: 'The Laughing Fox', value: 1400 },
      { x: 475, y: 540, kind: 'bars', name: 'Vault Gold', value: 2200 },
      { x: 730, y: 280, kind: 'gem', name: 'The Star Sapphire', value: 3200 },
      { x: 1055, y: 540, kind: 'vase', name: 'Ming Moon Jar', value: 1800 },
      { x: 1175, y: 100, kind: 'crown', name: 'The Winter Tiara', value: 3400 },
      { x: 420, y: 100, kind: 'gem', name: 'The Ember Opal', value: 2600 },
    ],
    guards: [
      { waypoints: [{ x: 130, y: 620 }, { x: 130, y: 440 }, { x: 200, y: 440 }, { x: 200, y: 620 }], speed: 66 },
      { waypoints: [{ x: 660, y: 120 }, { x: 660, y: 620 }, { x: 780, y: 620 }, { x: 780, y: 120 }], speed: 62 },
      { waypoints: [{ x: 960, y: 420 }, { x: 1180, y: 420 }, { x: 1180, y: 660 }, { x: 960, y: 660 }], speed: 70 },
    ],
    cameras: [
      { x: 560, y: 712, baseAngle: -Math.PI / 2, sweep: 0.9, speed: 0.6 },
      { x: 8, y: 360, baseAngle: 0, sweep: 0.75, speed: 0.8 },
      { x: 1272, y: 120, baseAngle: Math.PI, sweep: 0.8, speed: 0.65 },
    ],
  },
  {
    name: 'The Penthouse Vault',
    intro: 'The last job. Four guards, three cameras, one very nervous curator.',
    start: { x: 640, y: 690 },
    exit: { x: 1216, y: 620, w: 12, h: 76 },
    walls: [
      { x: 200, y: 0, w: 26, h: 240 },
      { x: 200, y: 380, w: 26, h: 340 },
      { x: 520, y: 180, w: 26, h: 260 },
      { x: 520, y: 560, w: 26, h: 160 },
      { x: 820, y: 0, w: 26, h: 240 },
      { x: 820, y: 380, w: 26, h: 340 },
      { x: 1040, y: 300, w: 240, h: 26 },
    ],
    cases: [
      { x: 330, y: 100, w: 110, h: 60 },
      { x: 640, y: 420, w: 110, h: 60 },
      { x: 950, y: 100, w: 110, h: 60 },
      { x: 330, y: 560, w: 110, h: 60 },
      { x: 950, y: 560, w: 110, h: 60 },
    ],
    loot: [
      { x: 385, y: 80, kind: 'gem', name: 'The Midnight Diamond', value: 5000 },
      { x: 695, y: 400, kind: 'painting', name: 'The Last Sunrise', value: 2600 },
      { x: 1005, y: 80, kind: 'crown', name: 'The Obsidian Crown', value: 4200 },
      { x: 385, y: 540, kind: 'bars', name: 'Penthouse Bullion', value: 3000 },
      { x: 1005, y: 540, kind: 'vase', name: 'The Jade Dragon', value: 2800 },
      { x: 640, y: 100, kind: 'gem', name: 'The Aurora Pearl', value: 3800 },
    ],
    guards: [
      { waypoints: [{ x: 120, y: 320 }, { x: 460, y: 320 }], speed: 72 },
      { waypoints: [{ x: 600, y: 120 }, { x: 600, y: 520 }, { x: 780, y: 520 }, { x: 780, y: 120 }], speed: 68 },
      { waypoints: [{ x: 900, y: 500 }, { x: 900, y: 360 }, { x: 1180, y: 360 }, { x: 1180, y: 500 }], speed: 74 },
      { waypoints: [{ x: 600, y: 640 }, { x: 780, y: 640 }], speed: 66 },
    ],
    cameras: [
      { x: 8, y: 120, baseAngle: 0, sweep: 0.8, speed: 0.7 },
      { x: 640, y: 8, baseAngle: Math.PI / 2, sweep: 1.0, speed: 0.5 },
      { x: 1272, y: 600, baseAngle: Math.PI, sweep: 0.8, speed: 0.75 },
    ],
  },
];
