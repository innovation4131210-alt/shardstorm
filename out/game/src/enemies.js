// The swarm: five enemy kinds with their own shapes, colours and habits, plus the director
// that deals them onto the field edges at a pace that grows with the run clock.

import { BOSS_AT, FIELD, SPAWN } from './config.js';

export const KIND_MOTE = 0;
export const KIND_DART = 1;
export const KIND_SPLITTER = 2;
export const KIND_BRUTE = 3;
export const KIND_BOSS = 4;

/** Per-kind stats. `unlock` is the run second from which the director may deal the kind. */
export const ENEMY_TYPES = [
  { name: 'Mote', radius: 11, hp: 3, speed: 82, damage: 8, xp: 1, color: '#ff5da2', unlock: 0, weight: 10 },
  { name: 'Dart', radius: 10, hp: 2, speed: 168, damage: 7, xp: 1, color: '#ffb84d', unlock: 35, weight: 5 },
  { name: 'Splitter', radius: 17, hp: 9, speed: 62, damage: 10, xp: 2, color: '#7dff6a', unlock: 75, weight: 4 },
  { name: 'Brute', radius: 26, hp: 34, speed: 44, damage: 16, xp: 5, color: '#c86bff', unlock: 120, weight: 3 },
  { name: 'The Hollow Star', radius: 46, hp: 2400, speed: 34, damage: 20, xp: 60, color: '#ffe066', unlock: BOSS_AT, weight: 0 },
];

/** A fresh, inactive enemy record for the world's pool. */
export function createEnemyRecord() {
  return {
    active: false, kind: 0, elite: false, x: 0, y: 0, vx: 0, vy: 0,
    hp: 1, maxHp: 1, radius: 10, speed: 0, damage: 0, xp: 1,
    hitCooldown: 0, orbitCooldown: 0, flash: 0, wobble: 0, burstTimer: 0, summonTimer: 0, angle: 0,
  };
}

function activate(pool, kind, x, y, hpScale, elite, random) {
  const e = pool.find((item) => !item.active);
  if (!e) return null;
  const type = ENEMY_TYPES[kind];
  e.active = true;
  e.kind = kind;
  e.elite = elite;
  e.x = x;
  e.y = y;
  e.vx = 0;
  e.vy = 0;
  e.maxHp = e.hp = Math.round(type.hp * hpScale * (elite ? 3.2 : 1));
  e.radius = type.radius * (elite ? 1.45 : 1);
  e.speed = type.speed * (elite ? 0.92 : 1);
  e.damage = type.damage * (elite ? 1.5 : 1);
  e.xp = type.xp * (elite ? 5 : 1);
  e.hitCooldown = 0;
  e.orbitCooldown = 0;
  e.flash = 0;
  e.wobble = random.next() * Math.PI * 2;
  e.burstTimer = 2.6;
  e.summonTimer = 5;
  e.angle = 0;
  return e;
}

/** A spawn point just outside a random edge of the field. */
function edgePoint(random) {
  const side = random.int(0, 3);
  const margin = 36;
  if (side === 0) return { x: random.range(0, FIELD.width), y: -margin };
  if (side === 1) return { x: FIELD.width + margin, y: random.range(0, FIELD.height) };
  if (side === 2) return { x: random.range(0, FIELD.width), y: FIELD.height + margin };
  return { x: -margin, y: random.range(0, FIELD.height) };
}

/**
 * The director: keeps a spawn timer, deals ordinary enemies at the edges with weights by
 * kind (new kinds join as the clock passes), and brings the Hollow Star in once, at BOSS_AT.
 * Returns 'boss' on the step the boss enters, else null.
 */
export function directSpawns(state, dt) {
  const { random, elapsed } = state;
  let event = null;
  if (!state.bossSpawned && elapsed >= BOSS_AT) {
    const point = edgePoint(random);
    const boss = activate(state.enemies, KIND_BOSS, point.x, point.y, 1, false, random);
    if (boss) {
      state.bossSpawned = true;
      state.boss = boss;
      event = 'boss';
    }
  }
  state.spawnTimer -= dt;
  const progress = Math.min(elapsed / 240, 1);
  const interval = SPAWN.startInterval + (SPAWN.endInterval - SPAWN.startInterval) * progress;
  if (state.spawnTimer <= 0 && state.liveEnemies < SPAWN.cap) {
    state.spawnTimer = interval * random.range(0.7, 1.25) * (state.boss && state.boss.active ? 1.5 : 1);
    let totalWeight = 0;
    for (const type of ENEMY_TYPES) if (elapsed >= type.unlock) totalWeight += type.weight;
    let roll = random.next() * totalWeight;
    let kind = KIND_MOTE;
    for (let i = 0; i < ENEMY_TYPES.length; i += 1) {
      if (elapsed < ENEMY_TYPES[i].unlock) continue;
      roll -= ENEMY_TYPES[i].weight;
      if (roll <= 0) {
        kind = i;
        break;
      }
    }
    const point = edgePoint(random);
    const hpScale = 1 + (elapsed / 60) * SPAWN.hpPerMinute;
    const elite = elapsed > 150 && kind !== KIND_BOSS && random.chance(0.08);
    activate(state.enemies, kind, point.x, point.y, hpScale, elite, random);
  }
  return event;
}

/** Splitter deaths call this: three motes burst out of the corpse. */
export function spawnMotesAround(state, x, y, hpScale) {
  for (let i = 0; i < 3; i += 1) {
    const angle = (i / 3) * Math.PI * 2 + state.random.next() * 0.8;
    const mote = activate(state.enemies, KIND_MOTE, x + Math.cos(angle) * 14, y + Math.sin(angle) * 14, hpScale, false, state.random);
    if (mote) {
      mote.vx = Math.cos(angle) * 150;
      mote.vy = Math.sin(angle) * 150;
    }
  }
}

/**
 * One step of one enemy: each kind moves in its own way. Darts pause and lunge; everything
 * else presses toward the player, with a wobble so the swarm feels alive, and the boss keeps
 * its distance like a siege engine. Knockback velocity (vx, vy) decays into the motion.
 */
export function moveEnemy(e, player, dt, elapsed) {
  const dx = player.x - e.x;
  const dy = player.y - e.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  e.wobble += dt * 3;
  let mx = ux;
  let my = uy;
  if (e.kind === KIND_DART) {
    // Darts circle at range, then lunge: a 1.4 s cycle of stalk (slow) and strike (fast).
    const phase = (elapsed * 0.7 + e.wobble) % 1.4;
    const striking = phase > 0.95;
    const speed = e.speed * (striking ? 2.1 : 0.45);
    mx = ux * speed;
    my = uy * speed;
    e.x += (mx + e.vx) * dt;
    e.y += (my + e.vy) * dt;
  } else if (e.kind === KIND_BOSS) {
    const hold = dist > 300 ? 1 : 0.25;
    e.angle += dt * 0.7;
    e.x += (ux * e.speed * hold + e.vx + -uy * 14) * dt;
    e.y += (uy * e.speed * hold + e.vy + ux * 14) * dt;
  } else {
    const sway = Math.sin(e.wobble) * 0.35;
    mx = (ux + -uy * sway) * e.speed;
    my = (uy + ux * sway) * e.speed;
    e.x += (mx + e.vx) * dt;
    e.y += (my + e.vy) * dt;
  }
  const decay = Math.max(0, 1 - 6 * dt);
  e.vx *= decay;
  e.vy *= decay;
}
