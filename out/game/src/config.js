// Shardstorm's tuning table: the field, the run's shape and every balance number lives here, so
// the rest of the code reads as rules rather than magic numbers.

/** The logical field the game is played on; the renderer scales it to the window. */
export const FIELD = { width: 1280, height: 800 };

/** The simulation step: the world advances in fixed sixtieths of a second. */
export const STEP = 1 / 60;

/** Seconds a run lasts before the Hollow Star arrives; kill it to win, or fall trying. */
export const RUN_SECONDS = 240;
/** The second at which the boss enters (it may outlive the clock; the run ends when it dies). */
export const BOSS_AT = 200;

export const PLAYER = {
  radius: 14,
  speed: 268,
  maxHp: 100,
  /** Seconds of dash burst, and the invulnerable window that comes with it. */
  dashTime: 0.18,
  dashCooldown: 2.1,
  dashSpeed: 3.1,
  /** Pickup radius before any Magnet Coil upgrade. */
  magnet: 98,
  /** How close a shard must be to be collected once it drifts in. */
  collect: 22,
};

/** Experience needed to go from level n to n + 1: xpForLevel(n) = base + growth * (n - 1). */
export const XP = { base: 5, growth: 4 };

export function xpForLevel(level) {
  return XP.base + XP.growth * (level - 1);
}

/** The kill-streak combo: each kill refreshes the timer; the multiplier grows every 8 streak. */
export const COMBO = { window: 3.2, perTier: 8, maxTier: 7 };

/** Enemy pressure over a run: spawn interval (seconds) shrinks, health scales up. */
export const SPAWN = {
  startInterval: 0.95,
  endInterval: 0.32,
  /** Health multiplier added per minute survived. */
  hpPerMinute: 0.55,
  /** At most this many live enemies; the director waits rather than flooding past it. */
  cap: 150,
};

export const SCORE = { kill: 10, shard: 2, boss: 5000, secondSurvived: 5 };

/** localStorage key for the best score. */
export const BEST_KEY = 'shardstorm-best';
