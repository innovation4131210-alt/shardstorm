// The juice: one pooled particle system (sparks, glows, shards and rings) plus floating score
// text. Everything is simulated in world code and only drawn by the renderer, so staged
// screenshots show the same bursts a player sees. Pools are fixed-size rings: no allocation
// in the step, and a burst can never grow the arrays.

const MAX_PARTICLES = 900;
const MAX_TEXTS = 48;

export const PARTICLE_SPARK = 0;
export const PARTICLE_GLOW = 1;
export const PARTICLE_SHARD = 2;
export const PARTICLE_RING = 3;

export function createParticles(random) {
  const pool = [];
  for (let i = 0; i < MAX_PARTICLES; i += 1) {
    pool.push({ active: false, kind: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#ffffff', drag: 1, gravity: 0 });
  }
  const texts = [];
  for (let i = 0; i < MAX_TEXTS; i += 1) {
    texts.push({ active: false, x: 0, y: 0, life: 0, maxLife: 1, value: '', color: '#ffffff', size: 15 });
  }
  let cursor = 0;
  let textCursor = 0;

  function spawn(kind, x, y, options) {
    const p = pool[cursor];
    cursor = (cursor + 1) % MAX_PARTICLES;
    p.active = true;
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.vx = options.vx ?? 0;
    p.vy = options.vy ?? 0;
    p.maxLife = options.life ?? 0.5;
    p.life = p.maxLife;
    p.size = options.size ?? 3;
    p.color = options.color ?? '#ffffff';
    p.drag = options.drag ?? 2.2;
    p.gravity = options.gravity ?? 0;
  }

  return {
    pool,
    texts,
    /** A radial burst of sparks and one glow flash: the standard enemy death. */
    burst(x, y, color, count = 14, speed = 260) {
      for (let i = 0; i < count; i += 1) {
        const angle = random.next() * Math.PI * 2;
        const v = speed * (0.3 + random.next() * 0.9);
        spawn(PARTICLE_SPARK, x, y, {
          vx: Math.cos(angle) * v,
          vy: Math.sin(angle) * v,
          life: 0.3 + random.next() * 0.4,
          size: 1.5 + random.next() * 2.5,
          color,
        });
      }
      spawn(PARTICLE_GLOW, x, y, { life: 0.22, size: 30, color });
    },
    /** A ring shockwave (nova pulses, boss deaths). */
    ring(x, y, color, size = 90) {
      spawn(PARTICLE_RING, x, y, { life: 0.38, size, color });
    },
    /** A few tumbling shards, for pickups and big breaks. */
    shards(x, y, color, count = 5) {
      for (let i = 0; i < count; i += 1) {
        const angle = random.next() * Math.PI * 2;
        const v = 60 + random.next() * 150;
        spawn(PARTICLE_SHARD, x, y, {
          vx: Math.cos(angle) * v,
          vy: Math.sin(angle) * v - 40,
          life: 0.4 + random.next() * 0.3,
          size: 3 + random.next() * 4,
          color,
          gravity: 300,
          drag: 1.2,
        });
      }
    },
    /** A fading trail mote, dropped behind a dashing or fast-moving thing. */
    trail(x, y, color, size = 8) {
      spawn(PARTICLE_GLOW, x, y, { life: 0.3, size, color, drag: 0 });
    },
    /** Floating score or event text that rises and fades. */
    text(x, y, value, color = '#e8f6ff', size = 15) {
      const t = texts[textCursor];
      textCursor = (textCursor + 1) % MAX_TEXTS;
      t.active = true;
      t.x = x;
      t.y = y;
      t.maxLife = 0.9;
      t.life = t.maxLife;
      t.value = value;
      t.color = color;
      t.size = size;
    },
    step(dt) {
      for (const p of pool) {
        if (!p.active) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.active = false;
          continue;
        }
        const dragK = Math.max(0, 1 - p.drag * dt);
        p.vx *= dragK;
        p.vy = p.vy * dragK + p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      for (const t of texts) {
        if (!t.active) continue;
        t.life -= dt;
        if (t.life <= 0) t.active = false;
        else t.y -= 34 * dt;
      }
    },
    clear() {
      for (const p of pool) p.active = false;
      for (const t of texts) t.active = false;
    },
  };
}
