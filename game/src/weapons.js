// The player's three weapons, all automatic: the pilot flies, the arsenal works. Seeker
// Sparks hunt the nearest swarmers, Orbit Blades circle the ship as a shredding halo, and the
// Pulse Nova throws an expanding ring that shoves the swarm back. Each has five levels; the
// level-up cards in player.js raise them.

export const WEAPON_SEEKER = 'seeker';
export const WEAPON_ORBIT = 'orbit';
export const WEAPON_NOVA = 'nova';
export const WEAPON_ORDER = [WEAPON_SEEKER, WEAPON_ORBIT, WEAPON_NOVA];

export const WEAPON_DEFS = {
  seeker: {
    name: 'Seeker Sparks',
    color: '#4dd8ff',
    line: (level) => `Homing bolts that hunt the swarm. Lv${level}: more sparks, harder hits.`,
    stats: (level) => ({ interval: 0.62 - level * 0.05, count: 1 + Math.floor((level - 1) / 2) + (level >= 2 ? 1 : 0), damage: 2 + level, speed: 560 }),
  },
  orbit: {
    name: 'Orbit Blades',
    color: '#b388ff',
    line: (level) => `Shards circling the ship, shredding what they touch. Lv${level}: more blades, wider arc.`,
    stats: (level) => ({ blades: level + 2, radius: 66 + level * 9, damage: 1 + level, spin: 2.6 + level * 0.35 }),
  },
  nova: {
    name: 'Pulse Nova',
    color: '#ffd54d',
    line: (level) => `A shockwave ring that wounds and shoves the swarm back. Lv${level}: faster, wider, heavier.`,
    stats: (level) => ({ interval: 3.4 - level * 0.32, damage: 3 + level * 2, maxRadius: 170 + level * 26, knockback: 320 }),
  },
};

export function createWeapons() {
  return {
    seeker: { level: 1, timer: 0.4 },
    orbit: { level: 0, angle: 0 },
    nova: { level: 0, timer: 1.2 },
  };
}

export function createProjectileRecord() {
  return { active: false, x: 0, y: 0, vx: 0, vy: 0, damage: 0, life: 0, target: null, turn: 5.2 };
}

function fireProjectile(state, x, y, angle, speed, damage) {
  const p = state.projectiles.find((item) => !item.active);
  if (!p) return;
  p.active = true;
  p.x = x;
  p.y = y;
  p.vx = Math.cos(angle) * speed;
  p.vy = Math.sin(angle) * speed;
  p.damage = damage;
  p.life = 1.15;
  p.target = null;
}

function nearestEnemies(state, x, y, count) {
  const found = [];
  for (const e of state.enemies) {
    if (!e.active) continue;
    const d = (e.x - x) ** 2 + (e.y - y) ** 2;
    found.push({ e, d });
  }
  found.sort((a, b) => a.d - b.d);
  return found.slice(0, count).map((item) => item.e);
}

/**
 * Advance every weapon one step. Damage goes through the world's damageEnemy so deaths,
 * score and shards stay in one place; visual and audio cues come back as event flags.
 */
export function updateWeapons(state, dt, damageEnemy) {
  const events = { shot: false, nova: false, blade: false };
  const { player, weapons } = state;
  const cooldownScale = state.cooldownScale;

  const seeker = weapons.seeker;
  if (seeker.level > 0) {
    const stats = WEAPON_DEFS.seeker.stats(seeker.level);
    seeker.timer -= dt;
    if (seeker.timer <= 0) {
      const targets = nearestEnemies(state, player.x, player.y, stats.count);
      if (targets.length > 0) {
        seeker.timer = stats.interval * cooldownScale;
        for (const target of targets) {
          const angle = Math.atan2(target.y - player.y, target.x - player.x) + state.random.range(-0.1, 0.1);
          fireProjectile(state, player.x, player.y, angle, stats.speed, stats.damage);
        }
        events.shot = true;
      } else {
        seeker.timer = 0.12;
      }
    }
  }

  const orbit = weapons.orbit;
  if (orbit.level > 0) {
    const stats = WEAPON_DEFS.orbit.stats(orbit.level);
    orbit.angle += dt * stats.spin;
    for (let i = 0; i < stats.blades; i += 1) {
      const angle = orbit.angle + (i / stats.blades) * Math.PI * 2;
      const bx = player.x + Math.cos(angle) * stats.radius;
      const by = player.y + Math.sin(angle) * stats.radius;
      if (state.elapsed * 60 % 3 < 1) state.particles.trail(bx, by, WEAPON_DEFS.orbit.color, 7);
      for (const e of state.enemies) {
        if (!e.active || e.orbitCooldown > 0) continue;
        const d = Math.hypot(e.x - bx, e.y - by);
        if (d < e.radius + 11) {
          e.orbitCooldown = 0.38;
          damageEnemy(e, stats.damage, (e.x - player.x) * 1.4, (e.y - player.y) * 1.4);
          events.blade = true;
        }
      }
    }
  }

  const nova = weapons.nova;
  if (nova.level > 0) {
    const stats = WEAPON_DEFS.nova.stats(nova.level);
    nova.timer -= dt;
    if (nova.timer <= 0 && state.liveEnemies > 0) {
      nova.timer = stats.interval * cooldownScale;
      state.pulses.push({ x: player.x, y: player.y, r: 12, maxRadius: stats.maxRadius, damage: stats.damage, knockback: stats.knockback, hit: new Set() });
      state.particles.ring(player.x, player.y, WEAPON_DEFS.nova.color, stats.maxRadius * 0.6);
      events.nova = true;
    }
  }

  // Expanding nova rings: damage and shove whatever the front reaches, once each.
  for (let i = state.pulses.length - 1; i >= 0; i -= 1) {
    const pulse = state.pulses[i];
    pulse.r += 460 * dt;
    for (const e of state.enemies) {
      if (!e.active || pulse.hit.has(e)) continue;
      const d = Math.hypot(e.x - pulse.x, e.y - pulse.y);
      if (Math.abs(d - pulse.r) < e.radius + 16) {
        pulse.hit.add(e);
        const ux = d === 0 ? 1 : (e.x - pulse.x) / d;
        const uy = d === 0 ? 0 : (e.y - pulse.y) / d;
        damageEnemy(e, pulse.damage, ux * pulse.knockback, uy * pulse.knockback);
      }
    }
    if (pulse.r >= pulse.maxRadius) state.pulses.splice(i, 1);
  }

  return events;
}

/** Homing and flight for the seeker bolts; a bolt dies on the first enemy it touches. */
export function updateProjectiles(state, dt, damageEnemy) {
  for (const p of state.projectiles) {
    if (!p.active) continue;
    p.life -= dt;
    if (p.life <= 0) {
      p.active = false;
      continue;
    }
    if (!p.target || !p.target.active) {
      const found = nearestEnemies(state, p.x, p.y, 1);
      p.target = found.length > 0 ? found[0] : null;
    }
    if (p.target) {
      const want = Math.atan2(p.target.y - p.y, p.target.x - p.x);
      const now = Math.atan2(p.vy, p.vx);
      let turn = want - now;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      const angle = now + Math.max(-p.turn * dt, Math.min(p.turn * dt, turn));
      const speed = Math.hypot(p.vx, p.vy);
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    state.particles.trail(p.x, p.y, WEAPON_DEFS.seeker.color, 5);
    for (const e of state.enemies) {
      if (!e.active) continue;
      if (Math.hypot(e.x - p.x, e.y - p.y) < e.radius + 5) {
        damageEnemy(e, p.damage, p.vx * 0.35, p.vy * 0.35);
        p.active = false;
        break;
      }
    }
  }
}
