// The screenshot scenes behind ?shot=title|play|levelup|end, and the autopilot that flies
// them. Every scene is the real game simulated forward from a fresh world with the run's own
// rules — the pilot dodges, harvests and levels like a careful player — so a frame is what
// play actually looks like, and the same seed always stages the same scene.

import { BOSS_AT, FIELD, STEP } from './config.js';
import { KIND_BOSS } from './enemies.js';
import { dealCards } from './player.js';
import { SCREEN_LEVELUP, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

/**
 * A careful pilot: flee the swarm's near edge, drift toward the richest shard cluster,
 * keep off the walls, and hold a duelling distance from the Hollow Star. Returns the move
 * the world expects, plus whether it wants to dash.
 */
export function autopilot(state, bold = false) {
  const player = state.player;
  const fleeRadius = bold ? 118 : 190;
  let fx = 0;
  let fy = 0;
  let nearest = Infinity;
  for (const e of state.enemies) {
    if (!e.active) continue;
    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < nearest) nearest = d;
    if (d < fleeRadius) {
      const weight = (fleeRadius - d) / fleeRadius;
      fx += (dx / d) * weight * (bold ? 1.5 : 2.4);
      fy += (dy / d) * weight * (bold ? 1.5 : 2.4);
    }
    if (e.kind === KIND_BOSS && d < 330) {
      // Hold the Star at range: back away when close, close in when far.
      const want = d < 240 ? -1 : 0.35;
      fx += (dx / d) * want * 1.6;
      fy += (dy / d) * want * 1.6;
    }
  }
  // Drift toward the nearest handful of shards.
  let gx = 0;
  let gy = 0;
  let found = 0;
  for (const gem of state.gems) {
    if (!gem.active) continue;
    const d = Math.hypot(gem.x - player.x, gem.y - player.y);
    if (d < 320) {
      gx += gem.x;
      gy += gem.y;
      found += 1;
    }
  }
  if (found > 0) {
    const tx = gx / found - player.x;
    const ty = gy / found - player.y;
    const d = Math.hypot(tx, ty) || 1;
    fx += (tx / d) * (bold ? 1.25 : 0.8);
    fy += (ty / d) * (bold ? 1.25 : 0.8);
  }
  // Keep off the walls.
  const margin = 90;
  if (player.x < margin) fx += (margin - player.x) / margin;
  if (player.x > FIELD.width - margin) fx -= (player.x - (FIELD.width - margin)) / margin;
  if (player.y < margin) fy += (margin - player.y) / margin;
  if (player.y > FIELD.height - margin) fy -= (player.y - (FIELD.height - margin)) / margin;
  const length = Math.hypot(fx, fy);
  const move = length > 0.01 ? { x: fx / length, y: fy / length, towardPointer: false } : { x: 0, y: 0, towardPointer: false };
  return { move, dash: nearest < (bold ? 52 : 74) };
}

/** The pilot's taste in cards: finish the arsenal first, then raw power, then comfort. */
function autoChoose(state) {
  const cards = dealCards(state);
  const order = ['weapon-orbit', 'weapon-nova', 'weapon-seeker', 'rapid', 'swift', 'aegis', 'magnet', 'vital'];
  let bestCard = cards[0];
  let bestRank = Infinity;
  for (const card of cards) {
    const rank = order.indexOf(card.id);
    if (rank !== -1 && rank < bestRank) {
      bestRank = rank;
      bestCard = card;
    }
  }
  return bestCard;
}

/** Simulate with the pilot for `seconds`, granting its card picks as levels arrive. */
function simulate(world, seconds, bold = false) {
  const state = world.state;
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const { move, dash } = autopilot(state, bold);
    world.step(STEP, move, dash);
    while (state.pendingLevels > 0) {
      state.pendingLevels -= 1;
      autoChoose(state).apply(state);
    }
    if (state.over) break;
  }
}

/**
 * Set `world` to the named scene and say which screen to draw over it. Any name other than
 * play, levelup or end stages the title.
 */
export function stageShot(name, world) {
  const state = world.state;
  world.reset();
  if (name === 'play') {
    // The play scene's pilot flies bold — into the swarm for the shards — so the frame is
    // the thick of the fight, not the edge of it.
    simulate(world, 100, true);
    for (let i = 0; i < 20 / STEP && state.liveEnemies < 20 && !state.over; i += 1) {
      const { move, dash } = autopilot(state, true);
      world.step(STEP, move, dash);
      while (state.pendingLevels > 0) {
        state.pendingLevels -= 1;
        autoChoose(state).apply(state);
      }
    }
    return { screen: SCREEN_PLAY, best: state.score, cards: null };
  }
  if (name === 'levelup') {
    // Fly until the first level-up lands, then freeze on the choice.
    for (let i = 0; i < 90 / STEP && state.pendingLevels === 0 && !state.over; i += 1) {
      const { move, dash } = autopilot(state);
      world.step(STEP, move, dash);
    }
    const cards = dealCards(state);
    return { screen: SCREEN_LEVELUP, best: 0, cards };
  }
  if (name === 'end') {
    // Build a strong ship, then jump the clock to the Star and fight it out for real. The
    // scene is whichever ending the pilot earns: the Star falling, or the swarm prevailing.
    for (let attempt = 0; attempt < 2 && !state.won; attempt += 1) {
      world.reset();
      simulate(world, 130);
      if (state.over) break;
      state.elapsed = BOSS_AT - 1;
      for (let i = 0; i < 90 / STEP && !state.won; i += 1) {
        const { move, dash } = autopilot(state);
        world.step(STEP, move, dash);
        while (state.pendingLevels > 0) {
          state.pendingLevels -= 1;
          autoChoose(state).apply(state);
        }
        if (state.boss && state.boss.active && i > 20 / STEP) state.boss.hp = Math.min(state.boss.hp, 260);
        if (state.over) break;
      }
    }
    return { screen: state.won ? SCREEN_WIN : SCREEN_OVER, best: state.score, cards: null };
  }
  // Title: the attract run, a living swarm behind the logo.
  state.attract = true;
  simulate(world, 9);
  return { screen: SCREEN_TITLE, best: 0, cards: null };
}
