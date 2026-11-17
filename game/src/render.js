// Everything the player sees: the starfield, the swarm, the ship, the HUD and the screens.
// The world is drawn in a fixed 1280x800 field, scaled to fit the window with letterbox bars,
// and shaken by an offset the world's impacts set. Text is drawn with system fonts in heavy
// weights; the glow comes from layered strokes and additive light, never from images.

import { BOSS_AT, COMBO, FIELD, RUN_SECONDS, xpForLevel } from './config.js';
import { ENEMY_TYPES, KIND_BOSS, KIND_BRUTE, KIND_DART, KIND_MOTE, KIND_SPLITTER } from './enemies.js';
import { PARTICLE_GLOW, PARTICLE_RING, PARTICLE_SHARD, PARTICLE_SPARK } from './particles.js';
import { WEAPON_DEFS, WEAPON_ORDER } from './weapons.js';

export const SCREEN_TITLE = 0;
export const SCREEN_PLAY = 1;
export const SCREEN_LEVELUP = 2;
export const SCREEN_PAUSED = 3;
export const SCREEN_OVER = 4;
export const SCREEN_WIN = 5;

const INK = '#eaf6ff';
const DIM = '#8fa8c8';
const CYAN = '#4dd8ff';
const GOLD = '#ffd54d';

/** The three level-up card rectangles, shared by the painter and the click handler. */
export function cardRects() {
  const width = 292;
  const height = 372;
  const gap = 28;
  const total = width * 3 + gap * 2;
  const x0 = (FIELD.width - total) / 2;
  const y = (FIELD.height - height) / 2 + 26;
  return [0, 1, 2].map((i) => ({ x: x0 + i * (width + gap), y, width, height }));
}

function formatTime(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, width: FIELD.width, height: FIELD.height };

  // The background is painted once onto its own canvas: a deep-space gradient, two nebula
  // blooms and a field of stars, with a faint grid the action reads against.
  const background = document.createElement('canvas');
  background.width = FIELD.width;
  background.height = FIELD.height;
  {
    const b = background.getContext('2d');
    const gradient = b.createLinearGradient(0, 0, 0, FIELD.height);
    gradient.addColorStop(0, '#0a0d26');
    gradient.addColorStop(0.55, '#070818');
    gradient.addColorStop(1, '#0d0721');
    b.fillStyle = gradient;
    b.fillRect(0, 0, FIELD.width, FIELD.height);
    const blooms = [
      [300, 190, 340, 'rgba(88, 40, 160, 0.20)'],
      [1010, 560, 420, 'rgba(20, 90, 140, 0.18)'],
      [880, 130, 240, 'rgba(160, 40, 110, 0.12)'],
      [180, 640, 260, 'rgba(30, 130, 120, 0.12)'],
    ];
    for (const [x, y, r, color] of blooms) {
      const radial = b.createRadialGradient(x, y, 0, x, y, r);
      radial.addColorStop(0, color);
      radial.addColorStop(1, 'rgba(0,0,0,0)');
      b.fillStyle = radial;
      b.fillRect(x - r, y - r, r * 2, r * 2);
    }
    let seed = 1234567;
    const starRandom = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 240; i += 1) {
      const x = starRandom() * FIELD.width;
      const y = starRandom() * FIELD.height;
      const r = starRandom() * 1.5 + 0.4;
      b.fillStyle = `rgba(255,255,255,${0.25 + starRandom() * 0.6})`;
      b.beginPath();
      b.arc(x, y, r, 0, Math.PI * 2);
      b.fill();
    }
    b.strokeStyle = 'rgba(90, 120, 220, 0.055)';
    b.lineWidth = 1;
    for (let x = 0; x <= FIELD.width; x += 64) {
      b.beginPath();
      b.moveTo(x, 0);
      b.lineTo(x, FIELD.height);
      b.stroke();
    }
    for (let y = 0; y <= FIELD.height; y += 64) {
      b.beginPath();
      b.moveTo(0, y);
      b.lineTo(FIELD.width, y);
      b.stroke();
    }
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    view.scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
    view.width = FIELD.width * view.scale;
    view.height = FIELD.height * view.scale;
    view.x = (canvas.width - view.width) / 2;
    view.y = (canvas.height - view.height) / 2;
  }
  window.addEventListener('resize', resize);
  resize();

  function toField(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const dpr = canvas.width / rect.width;
    return {
      x: ((clientX - rect.left) * dpr - view.x) / view.scale,
      y: ((clientY - rect.top) * dpr - view.y) / view.scale,
    };
  }

  function text(value, x, y, size, color, align = 'left', weight = 700) {
    ctx.font = `${weight} ${size}px 'Segoe UI', system-ui, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(value, x, y);
  }

  function bar(x, y, width, height, fraction, color, back = 'rgba(255,255,255,0.13)') {
    ctx.fillStyle = back;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, height / 2);
    ctx.fill();
    if (fraction > 0) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, y, Math.max(height, width * Math.min(fraction, 1)), height, height / 2);
      ctx.fill();
    }
  }

  function drawGem(gem, now) {
    const big = gem.value >= 5;
    const r = big ? 8 : 5.5;
    const pulse = 1 + Math.sin(now * 5 + gem.x) * 0.12;
    ctx.save();
    ctx.translate(gem.x, gem.y);
    ctx.rotate(now * 2.2 + gem.x * 0.05);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = big ? GOLD : CYAN;
    ctx.shadowColor = big ? GOLD : CYAN;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.62, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r * 0.62, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawEnemy(e, now) {
    const type = ENEMY_TYPES[e.kind];
    const color = e.flash > 0 ? '#ffffff' : type.color;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.shadowColor = type.color;
    ctx.shadowBlur = e.kind === KIND_BOSS ? 26 : 12;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    const r = e.radius;
    if (e.kind === KIND_MOTE) {
      ctx.rotate(now * 1.6 + e.wobble);
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r, 0);
      ctx.closePath();
      ctx.fill();
    } else if (e.kind === KIND_DART) {
      ctx.rotate(Math.atan2(e.vy + Math.sin(e.wobble) * 40, e.vx + Math.cos(e.wobble) * 40) + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, -r - 3);
      ctx.lineTo(r * 0.8, r);
      ctx.lineTo(0, r * 0.45);
      ctx.lineTo(-r * 0.8, r);
      ctx.closePath();
      ctx.fill();
    } else if (e.kind === KIND_SPLITTER) {
      const wob = 1 + Math.sin(now * 4 + e.wobble) * 0.08;
      ctx.scale(wob, 2 - wob > 0 ? 1 / wob : 1);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      for (let i = 0; i < 3; i += 1) {
        const a = e.wobble + (i / 3) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, r * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (e.kind === KIND_BRUTE) {
      ctx.rotate(now * 0.5 + e.wobble);
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.kind === KIND_BOSS) {
      ctx.rotate(e.angle);
      ctx.beginPath();
      const spikes = 8;
      for (let i = 0; i < spikes * 2; i += 1) {
        const a = (i / (spikes * 2)) * Math.PI * 2;
        const rr = i % 2 === 0 ? r : r * 0.55;
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#1a1030';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    if (e.elite) {
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r + 5 + Math.sin(now * 6) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    if ((e.kind === KIND_BRUTE || e.kind === KIND_BOSS || e.elite) && e.hp < e.maxHp) {
      const w = e.radius * 2;
      bar(e.x - e.radius, e.y - e.radius - 12, w, 5, e.hp / e.maxHp, e.kind === KIND_BOSS ? GOLD : '#ff7eb6');
    }
  }

  function drawPlayer(state, now) {
    const player = state.player;
    if (state.over && !state.won) return; // The ship is gone; its burst says the rest.
    ctx.save();
    ctx.translate(player.x, player.y);
    // Engine glow.
    const flicker = 0.75 + Math.sin(now * 31) * 0.25;
    ctx.fillStyle = `rgba(77, 216, 255, ${0.25 * flicker})`;
    ctx.beginPath();
    ctx.arc(0, 0, player.radius * 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(player.facing);
    if (player.invulnerable > 0 && Math.floor(now * 14) % 2 === 0) ctx.globalAlpha = 0.45;
    ctx.shadowColor = CYAN;
    ctx.shadowBlur = 16;
    ctx.fillStyle = player.hurtFlash > 0 ? '#ff8a80' : '#bdf1ff';
    ctx.beginPath();
    ctx.moveTo(19, 0);
    ctx.lineTo(-12, -11);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-12, 11);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#0b2a3d';
    ctx.beginPath();
    ctx.arc(4, 0, 4.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Magnet heart: the faintest ring at pickup range, so players learn its reach.
    ctx.strokeStyle = 'rgba(77, 216, 255, 0.07)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.magnet, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawParticles(state) {
    for (const p of state.particles.pool) {
      if (!p.active) continue;
      const t = p.life / p.maxLife;
      ctx.globalAlpha = Math.min(1, t * 1.6);
      if (p.kind === PARTICLE_SPARK) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * 0.8;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
      } else if (p.kind === PARTICLE_GLOW) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * t + 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      } else if (p.kind === PARTICLE_SHARD) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.x * 0.1 + p.life * 9);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      } else if (p.kind === PARTICLE_RING) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3 * t + 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - t) + 6, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    for (const t of state.particles.texts) {
      if (!t.active) continue;
      ctx.globalAlpha = Math.min(1, (t.life / t.maxLife) * 2);
      text(t.value, t.x, t.y, t.size, t.color, 'center', 800);
    }
    ctx.globalAlpha = 1;
  }

  function drawWorld(state, now) {
    ctx.drawImage(background, 0, 0);
    for (const gem of state.gems) if (gem.active) drawGem(gem, now);
    // Nova fronts.
    for (const pulse of state.pulses) {
      ctx.strokeStyle = 'rgba(255, 213, 77, 0.55)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(pulse.x, pulse.y, pulse.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 213, 77, 0.16)';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(pulse.x, pulse.y, pulse.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Orbit blades.
    const orbit = state.weapons.orbit;
    if (orbit.level > 0) {
      const stats = WEAPON_DEFS.orbit.stats(orbit.level);
      ctx.strokeStyle = 'rgba(179, 136, 255, 0.18)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(state.player.x, state.player.y, stats.radius, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < stats.blades; i += 1) {
        const angle = orbit.angle + (i / stats.blades) * Math.PI * 2;
        const bx = state.player.x + Math.cos(angle) * stats.radius;
        const by = state.player.y + Math.sin(angle) * stats.radius;
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(angle + now * 9);
        ctx.fillStyle = WEAPON_DEFS.orbit.color;
        ctx.shadowColor = WEAPON_DEFS.orbit.color;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(6, 0);
        ctx.lineTo(0, 9);
        ctx.lineTo(-6, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    for (const e of state.enemies) if (e.active) drawEnemy(e, now);
    // Boss bolts.
    for (const bolt of state.bolts) {
      if (!bolt.active) continue;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = GOLD;
      ctx.shadowColor = GOLD;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(bolt.x, bolt.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // Seeker bolts.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of state.projectiles) {
      if (!p.active) continue;
      ctx.fillStyle = WEAPON_DEFS.seeker.color;
      ctx.shadowColor = WEAPON_DEFS.seeker.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    drawPlayer(state, now);
    drawParticles(state);
    if (state.player.hurtFlash > 0) {
      ctx.fillStyle = `rgba(255, 60, 60, ${state.player.hurtFlash * 0.55})`;
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    }
  }

  function drawHud(state, best, world) {
    const player = state.player;
    // Hull, top left.
    text('HULL', 24, 30, 13, DIM, 'left', 800);
    bar(70, 22, 210, 16, player.hp / player.maxHp, player.hp / player.maxHp > 0.3 ? '#69f0ae' : '#ff5252');
    text(`${Math.ceil(player.hp)}`, 292, 30, 14, INK, 'left', 800);
    // Level + dash under it.
    text(`LV ${player.level}`, 24, 58, 15, GOLD, 'left', 800);
    const dashReady = player.dashCooldown <= 0;
    text(dashReady ? 'DASH READY' : 'DASH …', 84, 58, 12, dashReady ? CYAN : DIM, 'left', 700);
    // Clock / boss, top centre.
    if (state.boss && state.boss.active) {
      text('THE HOLLOW STAR', FIELD.width / 2, 26, 14, GOLD, 'center', 800);
      bar(FIELD.width / 2 - 170, 38, 340, 10, state.boss.hp / state.boss.maxHp, GOLD);
    } else {
      const toBoss = Math.max(0, BOSS_AT - state.elapsed);
      text(formatTime(state.elapsed), FIELD.width / 2, 30, 24, INK, 'center', 800);
      text(toBoss > 30 ? `the Hollow Star stirs in ${formatTime(toBoss)}` : `THE STAR ARRIVES IN ${Math.ceil(toBoss)}`, FIELD.width / 2, 56, 12, toBoss > 30 ? DIM : '#ff7eb6', 'center', 700);
    }
    // Score, top right.
    text('SCORE', FIELD.width - 24, 24, 12, DIM, 'right', 800);
    text(String(state.score).padStart(6, '0'), FIELD.width - 24, 48, 26, INK, 'right', 800);
    text(`BEST ${Math.max(best, state.score)}`, FIELD.width - 24, 74, 12, DIM, 'right', 700);
    // Combo under the score.
    if (state.comboStreak >= 2) {
      const mult = world.comboMultiplier();
      text(`×${mult} COMBO ${state.comboStreak}`, FIELD.width - 24, 102, 17, GOLD, 'right', 900);
      bar(FIELD.width - 154, 116, 130, 5, state.comboTimer / COMBO.window, GOLD);
    }
    // Weapons, bottom right.
    let wx = FIELD.width - 24;
    for (const id of [...WEAPON_ORDER].reverse()) {
      const level = state.weapons[id].level;
      if (level === 0) continue;
      wx -= 44;
      ctx.fillStyle = 'rgba(10, 14, 34, 0.72)';
      ctx.strokeStyle = WEAPON_DEFS[id].color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(wx, FIELD.height - 52, 38, 38, 9);
      ctx.fill();
      ctx.stroke();
      text(id === 'seeker' ? '➤' : id === 'orbit' ? '✦' : '◎', wx + 19, FIELD.height - 36, 17, WEAPON_DEFS[id].color, 'center', 900);
      text(String(level), wx + 33, FIELD.height - 20, 11, INK, 'center', 800);
    }
    // Experience, along the bottom.
    const need = xpForLevel(player.level);
    bar(24, FIELD.height - 26, FIELD.width - 48, 10, player.xp / need, CYAN);
    text(`LEVEL ${player.level}`, FIELD.width / 2, FIELD.height - 44, 12, DIM, 'center', 800);
  }

  function dim(alpha) {
    ctx.fillStyle = `rgba(4, 5, 16, ${alpha})`;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  function drawTitle(state, best, now) {
    dim(0.34);
    const cx = FIELD.width / 2;
    // The logo: layered strokes give a neon sign, cyan over violet.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 104px 'Segoe UI', system-ui, sans-serif`;
    ctx.shadowColor = '#7c4dff';
    ctx.shadowBlur = 42;
    ctx.fillStyle = '#1b1040';
    ctx.fillText('SHARDSTORM', cx, 218);
    ctx.shadowColor = CYAN;
    ctx.shadowBlur = 26;
    ctx.fillStyle = '#d9f7ff';
    ctx.fillText('SHARDSTORM', cx, 218);
    ctx.shadowBlur = 0;
    text('SURVIVE THE SWARM · BREAK THE HOLLOW STAR', cx, 292, 19, GOLD, 'center', 800);
    text('The swarm pours in for four minutes. Harvest their shards, grow an arsenal,', cx, 356, 17, INK, 'center', 600);
    text('and when the Hollow Star arrives at 3:20 — break it before it breaks you.', cx, 382, 17, INK, 'center', 600);
    const pulse = 0.72 + Math.sin(now * 3.4) * 0.28;
    ctx.globalAlpha = pulse;
    text('CLICK OR PRESS ENTER TO FLY', cx, 448, 24, CYAN, 'center', 900);
    ctx.globalAlpha = 1;
    text('WASD / ARROWS or hold MOUSE — steer      SPACE / SHIFT — dash      P — pause      M — mute', cx, 690, 15, DIM, 'center', 600);
    text('On level up, click a card or press 1 · 2 · 3', cx, 716, 15, DIM, 'center', 600);
    if (best > 0) text(`BEST SCORE ${best}`, cx, 640, 17, GOLD, 'center', 800);
  }

  function drawCards(state, cards, pointer) {
    dim(0.55);
    text('LEVEL UP — CHOOSE ONE', FIELD.width / 2, 168, 30, GOLD, 'center', 900);
    const rects = cardRects();
    cards.forEach((card, i) => {
      const rect = rects[i];
      const hovered = pointer.inside && pointer.x >= rect.x && pointer.x <= rect.x + rect.width && pointer.y >= rect.y && pointer.y <= rect.y + rect.height;
      ctx.fillStyle = hovered ? 'rgba(24, 32, 66, 0.97)' : 'rgba(13, 17, 40, 0.95)';
      ctx.strokeStyle = card.color;
      ctx.lineWidth = hovered ? 3.5 : 2;
      ctx.beginPath();
      ctx.roundRect(rect.x, rect.y, rect.width, rect.height, 16);
      ctx.fill();
      ctx.stroke();
      text(card.glyph, rect.x + rect.width / 2, rect.y + 74, 54, card.color, 'center', 900);
      // The title wraps to two lines at most; card titles are written short enough for one.
      const title = card.title(state);
      ctx.font = `800 21px 'Segoe UI', system-ui, sans-serif`;
      const lines = [];
      let line = '';
      for (const word of title.split(' ')) {
        if ((line + ' ' + word).trim().length > 17 && line) {
          lines.push(line.trim());
          line = word;
        } else line += ' ' + word;
      }
      lines.push(line.trim());
      lines.slice(0, 2).forEach((l, j) => text(l, rect.x + rect.width / 2, rect.y + 138 + j * 26, 21, INK, 'center', 800));
      // The blurb, wrapped by hand at 30 characters.
      const words = card.line(state).split(' ');
      const wrapped = [];
      let current = '';
      for (const word of words) {
        if ((current + ' ' + word).trim().length > 30 && current) {
          wrapped.push(current.trim());
          current = word;
        } else current += ' ' + word;
      }
      wrapped.push(current.trim());
      wrapped.slice(0, 4).forEach((l, j) => text(l, rect.x + rect.width / 2, rect.y + 208 + j * 22, 14.5, DIM, 'center', 600));
      text(`[ ${i + 1} ]`, rect.x + rect.width / 2, rect.y + rect.height - 30, 14, DIM, 'center', 800);
    });
  }

  function drawEnd(state, best, won) {
    dim(won ? 0.45 : 0.6);
    const cx = FIELD.width / 2;
    ctx.font = `900 64px 'Segoe UI', system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = won ? GOLD : '#ff5252';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(won ? 'THE STAR FALLS' : 'THE SWARM PREVAILS', cx, 218);
    ctx.shadowBlur = 0;
    text(won ? 'You broke the Hollow Star. The dark gives back its light.' : 'Your shards scatter into the dark — the swarm keeps them warm.', cx, 276, 17, INK, 'center', 600);
    const rows = [
      ['SCORE', String(state.score)],
      ['BEST', String(Math.max(best, state.score))],
      ['TIME', formatTime(state.elapsed)],
      ['KILLS', String(state.kills)],
      ['LEVEL', String(state.player.level)],
      ['SHARDS', String(state.shardsCollected)],
    ];
    rows.forEach(([label, value], i) => {
      const x = cx - 250 + (i % 3) * 250;
      const y = 356 + Math.floor(i / 3) * 92;
      text(label, x, y, 13, DIM, 'center', 800);
      text(value, x, y + 34, 30, i === 0 ? GOLD : INK, 'center', 900);
    });
    const pulse = 0.72 + Math.sin(performance.now() / 300) * 0.28;
    ctx.globalAlpha = pulse;
    text('CLICK OR PRESS ENTER TO FLY AGAIN', cx, 620, 21, CYAN, 'center', 900);
    ctx.globalAlpha = 1;
  }

  function draw(state, screen, best, extras) {
    const now = performance.now() / 1000;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#04050e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const shakeX = state.shake > 0 ? (Math.random() * 2 - 1) * state.shake : 0;
    const shakeY = state.shake > 0 ? (Math.random() * 2 - 1) * state.shake : 0;
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);
    drawWorld(state, now);
    if (screen !== SCREEN_TITLE) drawHud(state, best, extras.world);
    if (screen === SCREEN_TITLE) drawTitle(state, best, now);
    else if (screen === SCREEN_LEVELUP) drawCards(state, extras.cards, extras.pointer);
    else if (screen === SCREEN_PAUSED) {
      dim(0.55);
      text('PAUSED', FIELD.width / 2, FIELD.height / 2 - 20, 44, INK, 'center', 900);
      text('P or Enter to resume', FIELD.width / 2, FIELD.height / 2 + 30, 16, DIM, 'center', 600);
    } else if (screen === SCREEN_OVER) drawEnd(state, best, false);
    else if (screen === SCREEN_WIN) drawEnd(state, best, true);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  return { draw, toField, view };
}
