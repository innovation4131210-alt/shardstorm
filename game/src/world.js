// The world: one run of Shardstorm as pure state and rules. It owns the player, the swarm,
// the gems they drop and the boss, advances everything in fixed steps, and reports what
// happened as event flags so the boot code can play the right sounds. Rendering and input
// live elsewhere; nothing here touches the DOM, which is what lets the screenshot scenes
// replay a run exactly.

import { COMBO, FIELD, PLAYER, SCORE, xpForLevel } from './config.js';
import { createParticles } from './particles.js';
import { createPlayer } from './player.js';
import { ENEMY_TYPES, KIND_BOSS, KIND_BRUTE, KIND_SPLITTER, createEnemyRecord, directSpawns, moveEnemy, spawnMotesAround } from './enemies.js';
import { createProjectileRecord, createWeapons, updateProjectiles, updateWeapons } from './weapons.js';

export const EVT_SHOOT = 1;
export const EVT_NOVA = 2;
export const EVT_BLADE = 4;
export const EVT_EXPLOSION = 8;
export const EVT_BIG_EXPLOSION = 16;
export const EVT_PICKUP = 32;
export const EVT_HURT = 64;
export const EVT_LEVELUP = 128;
export const EVT_DASH = 256;
export const EVT_BOSS = 512;
export const EVT_WIN = 1024;
export const EVT_LOSE = 2048;

const ENEMY_POOL = 240;
const PROJECTILE_POOL = 200;
const BOLT_POOL = 160;
const GEM_POOL = 420;

function createGemRecord() {
  return { active: false, x: 0, y: 0, vx: 0, vy: 0, value: 1, magnetised: false };
}

function createBoltRecord() {
  return { active: false, x: 0, y: 0, vx: 0, vy: 0, damage: 10, life: 0 };
}

export function createWorld(random) {
  const state = {
    random,
    particles: createParticles(random),
    player: createPlayer(),
    weapons: createWeapons(),
    enemies: [],
    projectiles: [],
    bolts: [],
    gems: [],
    pulses: [],
    elapsed: 0,
    score: 0,
    scoreFloat: 0,
    kills: 0,
    shardsCollected: 0,
    comboStreak: 0,
    comboTimer: 0,
    pickupStreak: 0,
    pickupTimer: 0,
    cooldownScale: 1,
    stacks: { swift: 0, vital: 0, magnet: 0, rapid: 0, aegis: 0 },
    spawnTimer: 0.6,
    liveEnemies: 0,
    bossSpawned: false,
    boss: null,
    pendingLevels: 0,
    shake: 0,
    hitStop: 0,
    over: false,
    won: false,
    attract: false,
  };
  for (let i = 0; i < ENEMY_POOL; i += 1) state.enemies.push(createEnemyRecord());
  for (let i = 0; i < PROJECTILE_POOL; i += 1) state.projectiles.push(createProjectileRecord());
  for (let i = 0; i < BOLT_POOL; i += 1) state.bolts.push(createBoltRecord());
  for (let i = 0; i < GEM_POOL; i += 1) state.gems.push(createGemRecord());

  function reset() {
    state.player = createPlayer();
    state.weapons = createWeapons();
    for (const e of state.enemies) e.active = false;
    for (const p of state.projectiles) p.active = false;
    for (const b of state.bolts) b.active = false;
    for (const g of state.gems) g.active = false;
    state.pulses.length = 0;
    state.particles.clear();
    state.elapsed = 0;
    state.score = 0;
    state.scoreFloat = 0;
    state.kills = 0;
    state.shardsCollected = 0;
    state.comboStreak = 0;
    state.comboTimer = 0;
    state.pickupStreak = 0;
    state.pickupTimer = 0;
    state.cooldownScale = 1;
    state.stacks = { swift: 0, vital: 0, magnet: 0, rapid: 0, aegis: 0 };
    state.spawnTimer = 0.6;
    state.liveEnemies = 0;
    state.bossSpawned = false;
    state.boss = null;
    state.pendingLevels = 0;
    state.shake = 0;
    state.hitStop = 0;
    state.over = false;
    state.won = false;
  }

  function comboMultiplier() {
    return 1 + Math.min(Math.floor(state.comboStreak / COMBO.perTier), COMBO.maxTier);
  }

  function dropGems(x, y, value) {
    let remaining = value;
    while (remaining > 0) {
      const gem = state.gems.find((g) => !g.active);
      if (!gem) return;
      const chunk = remaining >= 5 ? 5 : 1;
      remaining -= chunk;
      gem.active = true;
      gem.value = chunk;
      gem.magnetised = false;
      gem.x = x + random.range(-8, 8);
      gem.y = y + random.range(-8, 8);
      const angle = random.next() * Math.PI * 2;
      const speed = random.range(30, 130);
      gem.vx = Math.cos(angle) * speed;
      gem.vy = Math.sin(angle) * speed;
    }
  }

  /** All damage to enemies flows through here: flash, knockback, death and its rewards. */
  function damageEnemy(e, amount, kx, ky) {
    if (!e.active || state.over) return 0;
    e.hp -= amount;
    e.flash = 0.09;
    const mass = e.radius / 11;
    e.vx += (kx / mass) * (e.kind === KIND_BOSS ? 0.05 : 1);
    e.vy += (ky / mass) * (e.kind === KIND_BOSS ? 0.05 : 1);
    if (e.hp > 0) return EVT_BLADE;
    e.active = false;
    state.kills += 1;
    state.comboStreak += 1;
    state.comboTimer = COMBO.window;
    const gained = SCORE.kill * comboMultiplier() * (e.elite ? 5 : 1);
    state.scoreFloat += gained;
    const type = ENEMY_TYPES[e.kind];
    state.particles.burst(e.x, e.y, type.color, e.kind === KIND_BRUTE || e.kind === KIND_BOSS ? 42 : 14, e.kind === KIND_BOSS ? 420 : 260);
    if (e.elite || e.kind === KIND_BRUTE || e.kind === KIND_BOSS) {
      state.particles.text(e.x, e.y - e.radius, `+${gained}`, '#ffffff', e.kind === KIND_BOSS ? 30 : 17);
    }
    dropGems(e.x, e.y, e.xp);
    if (e.kind === KIND_SPLITTER) spawnMotesAround(state, e.x, e.y, 1 + (state.elapsed / 60) * 0.55);
    if (e.kind === KIND_BRUTE) {
      state.shake = Math.max(state.shake, 7);
      state.hitStop = Math.max(state.hitStop, 0.045);
      return EVT_BIG_EXPLOSION;
    }
    if (e.kind === KIND_BOSS) {
      state.shake = 16;
      state.hitStop = 0.12;
      state.particles.ring(e.x, e.y, type.color, 260);
      state.particles.ring(e.x, e.y, '#ffffff', 170);
      state.scoreFloat += SCORE.boss;
      state.score = Math.floor(state.scoreFloat);
      if (state.attract) {
        // Behind the title the Star can fall without ending anything; it may come again.
        state.boss = null;
        state.bossSpawned = false;
        return EVT_BIG_EXPLOSION;
      }
      state.won = true;
      state.over = true;
      return EVT_BIG_EXPLOSION | EVT_WIN;
    }
    return EVT_EXPLOSION;
  }

  function hurtPlayer(amount) {
    const player = state.player;
    if (state.attract || player.invulnerable > 0 || state.over) return 0;
    player.hp -= amount * (1 - player.armor);
    player.invulnerable = 0.45;
    player.hurtFlash = 0.25;
    state.shake = Math.max(state.shake, 6);
    state.comboStreak = 0;
    if (player.hp <= 0) {
      player.hp = 0;
      state.over = true;
      state.particles.burst(player.x, player.y, '#4dd8ff', 46, 340);
      state.particles.ring(player.x, player.y, '#4dd8ff', 150);
      return EVT_HURT | EVT_LOSE;
    }
    return EVT_HURT;
  }

  function stepPlayer(dt, move, dashWanted) {
    const player = state.player;
    let events = 0;
    player.dashCooldown = Math.max(0, player.dashCooldown - dt);
    player.invulnerable = Math.max(0, player.invulnerable - dt);
    player.hurtFlash = Math.max(0, player.hurtFlash - dt);
    let dx = move.x;
    let dy = move.y;
    if (move.towardPointer) {
      const px = move.x - player.x;
      const py = move.y - player.y;
      const dist = Math.hypot(px, py);
      if (dist > 8) {
        dx = px / dist;
        dy = py / dist;
      } else {
        dx = 0;
        dy = 0;
      }
    }
    if (dashWanted && player.dashCooldown <= 0 && player.dashTimer <= 0 && (dx !== 0 || dy !== 0)) {
      player.dashTimer = PLAYER.dashTime;
      player.dashCooldown = PLAYER.dashCooldown;
      player.invulnerable = Math.max(player.invulnerable, PLAYER.dashTime + 0.08);
      events |= EVT_DASH;
    }
    let speed = player.speed;
    if (player.dashTimer > 0) {
      player.dashTimer -= dt;
      speed *= PLAYER.dashSpeed;
      state.particles.trail(player.x, player.y, '#4dd8ff', 16);
    }
    player.vx = dx * speed;
    player.vy = dy * speed;
    player.x = Math.min(FIELD.width - player.radius, Math.max(player.radius, player.x + player.vx * dt));
    player.y = Math.min(FIELD.height - player.radius, Math.max(player.radius, player.y + player.vy * dt));
    if (dx !== 0 || dy !== 0) player.facing = Math.atan2(dy, dx);
    return events;
  }

  function stepBoss(dt) {
    const boss = state.boss;
    if (!boss || !boss.active) return;
    boss.burstTimer -= dt;
    boss.summonTimer -= dt;
    if (boss.burstTimer <= 0) {
      boss.burstTimer = 3.6;
      const count = 14;
      const offset = random.next() * Math.PI;
      for (let i = 0; i < count; i += 1) {
        const bolt = state.bolts.find((b) => !b.active);
        if (!bolt) break;
        const angle = offset + (i / count) * Math.PI * 2;
        bolt.active = true;
        bolt.x = boss.x + Math.cos(angle) * (boss.radius + 8);
        bolt.y = boss.y + Math.sin(angle) * (boss.radius + 8);
        bolt.vx = Math.cos(angle) * 128;
        bolt.vy = Math.sin(angle) * 128;
        bolt.damage = 10;
        bolt.life = 7;
      }
      state.particles.ring(boss.x, boss.y, ENEMY_TYPES[KIND_BOSS].color, 90);
    }
    if (boss.summonTimer <= 0) {
      boss.summonTimer = 6.5;
      spawnMotesAround(state, boss.x, boss.y, 1.6);
    }
  }

  function step(dt, move, dashWanted) {
    let events = 0;
    if (state.over) {
      state.particles.step(dt);
      return events;
    }
    state.elapsed += dt;
    state.scoreFloat += SCORE.secondSurvived * dt;
    state.score = Math.floor(state.scoreFloat);

    if (state.attract) {
      // The title's attract run borrows the first ninety seconds of pressure, forever.
      const realElapsed = state.elapsed;
      state.elapsed = Math.min(realElapsed, 90);
      directSpawns(state, dt);
      state.elapsed = realElapsed;
    } else if (directSpawns(state, dt) === 'boss') {
      events |= EVT_BOSS;
    }
    events |= stepPlayer(dt, move, dashWanted);

    const weaponEvents = updateWeapons(state, dt, (e, amount, kx, ky) => {
      events |= damageEnemy(e, amount, kx, ky);
    });
    if (weaponEvents.shot) events |= EVT_SHOOT;
    if (weaponEvents.nova) events |= EVT_NOVA;
    updateProjectiles(state, dt, (e, amount, kx, ky) => {
      events |= damageEnemy(e, amount, kx, ky);
    });

    // The swarm moves, keeps a little distance from itself, and bites on contact.
    let live = 0;
    for (const e of state.enemies) {
      if (!e.active) continue;
      live += 1;
      e.flash = Math.max(0, e.flash - dt);
      e.hitCooldown = Math.max(0, e.hitCooldown - dt);
      e.orbitCooldown = Math.max(0, e.orbitCooldown - dt);
      moveEnemy(e, state.player, dt, state.elapsed);
    }
    state.liveEnemies = live;
    const actives = state.enemies.filter((e) => e.active);
    for (let i = 0; i < actives.length; i += 1) {
      const a = actives[i];
      for (let j = i + 1; j < actives.length; j += 1) {
        const b = actives[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0.01 && d2 < min * min) {
          const d = Math.sqrt(d2);
          const push = ((min - d) / d) * 0.5 * 30 * dt;
          a.x -= dx * push;
          a.y -= dy * push;
          b.x += dx * push;
          b.y += dy * push;
        }
      }
    }
    stepBoss(dt);
    for (const e of actives) {
      if (!e.active) continue;
      const d = Math.hypot(e.x - state.player.x, e.y - state.player.y);
      if (d < e.radius + state.player.radius - 2 && e.hitCooldown <= 0) {
        e.hitCooldown = 0.7;
        events |= hurtPlayer(e.damage);
        if (state.over) return events;
      }
    }

    // The boss's star-bolts fly straight and burn out at the walls.
    for (const bolt of state.bolts) {
      if (!bolt.active) continue;
      bolt.life -= dt;
      bolt.x += bolt.vx * dt;
      bolt.y += bolt.vy * dt;
      if (bolt.life <= 0 || bolt.x < -20 || bolt.x > FIELD.width + 20 || bolt.y < -20 || bolt.y > FIELD.height + 20) {
        bolt.active = false;
        continue;
      }
      if (Math.hypot(bolt.x - state.player.x, bolt.y - state.player.y) < state.player.radius + 6) {
        bolt.active = false;
        events |= hurtPlayer(bolt.damage);
        if (state.over) return events;
      }
    }

    // Gems drift, then fly to the ship once inside its magnet heart.
    const player = state.player;
    for (const gem of state.gems) {
      if (!gem.active) continue;
      const dx = player.x - gem.x;
      const dy = player.y - gem.y;
      const dist = Math.hypot(dx, dy);
      if (gem.magnetised || dist < player.magnet) {
        gem.magnetised = true;
        const pull = 640;
        gem.vx += (dx / (dist || 1)) * pull * dt * 4;
        gem.vy += (dy / (dist || 1)) * pull * dt * 4;
      } else {
        gem.vx *= Math.max(0, 1 - 4 * dt);
        gem.vy *= Math.max(0, 1 - 4 * dt);
      }
      gem.x += gem.vx * dt;
      gem.y += gem.vy * dt;
      if (dist < PLAYER.collect + 6) {
        gem.active = false;
        state.shardsCollected += gem.value;
        state.pickupStreak += 1;
        state.pickupTimer = 0.9;
        events |= EVT_PICKUP;
        player.xp += gem.value;
        while (player.xp >= xpForLevel(player.level)) {
          player.xp -= xpForLevel(player.level);
          player.level += 1;
          state.pendingLevels += 1;
          events |= EVT_LEVELUP;
        }
      }
    }

    state.comboTimer -= dt;
    if (state.comboTimer <= 0) state.comboStreak = 0;
    state.pickupTimer -= dt;
    if (state.pickupTimer <= 0) state.pickupStreak = 0;
    state.shake = Math.max(0, state.shake - dt * 26);
    state.particles.step(dt);
    return events;
  }

  return { state, reset, step, damageEnemy, comboMultiplier };
}
