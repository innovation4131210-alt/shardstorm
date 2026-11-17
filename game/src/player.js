// The pilot: one shard-ship with health, a dash and a magnet heart, and the deck of upgrade
// cards a level-up deals. Cards are data plus an apply function, so the renderer can show
// them and the world can grant them without either knowing the other's business.

import { FIELD, PLAYER } from './config.js';
import { WEAPON_DEFS, WEAPON_NOVA, WEAPON_ORBIT, WEAPON_ORDER, WEAPON_SEEKER } from './weapons.js';

export function createPlayer() {
  return {
    x: FIELD.width / 2,
    y: FIELD.height / 2,
    vx: 0,
    vy: 0,
    radius: PLAYER.radius,
    hp: PLAYER.maxHp,
    maxHp: PLAYER.maxHp,
    speed: PLAYER.speed,
    magnet: PLAYER.magnet,
    armor: 0,
    level: 1,
    xp: 0,
    dashTimer: 0,
    dashCooldown: 0,
    invulnerable: 0,
    facing: -Math.PI / 2,
    hurtFlash: 0,
  };
}

const WEAPON_CARD_TITLES = {
  [WEAPON_SEEKER]: ['Seeker Sparks', 'Seeker Swarm', 'Seeker Storm', 'Seeker Tempest', 'Seeker Maelstrom'],
  [WEAPON_ORBIT]: ['Orbit Blades', 'Orbit Halo', 'Orbit Guillotine', 'Orbit Event Horizon', 'Orbit Singularity'],
  [WEAPON_NOVA]: ['Pulse Nova', 'Pulse Supernova', 'Pulse Hypernova', 'Pulse Quasar', 'Pulse Big Bloom'],
};

function weaponCard(weaponId) {
  return {
    id: `weapon-${weaponId}`,
    color: WEAPON_DEFS[weaponId].color,
    glyph: weaponId === WEAPON_SEEKER ? '➤' : weaponId === WEAPON_ORBIT ? '✦' : '◎',
    available: (state) => state.weapons[weaponId].level < 5,
    title: (state) => {
      const level = state.weapons[weaponId].level;
      return level === 0 ? `New weapon: ${WEAPON_DEFS[weaponId].name}` : WEAPON_CARD_TITLES[weaponId][level];
    },
    line: (state) => WEAPON_DEFS[weaponId].line(state.weapons[weaponId].level + 1),
    apply: (state) => {
      state.weapons[weaponId].level += 1;
    },
  };
}

/** Every card the deck can deal; stat cards carry a stack count on the run's state. */
export const CARD_DECK = [
  weaponCard(WEAPON_SEEKER),
  weaponCard(WEAPON_ORBIT),
  weaponCard(WEAPON_NOVA),
  {
    id: 'swift',
    color: '#69f0ae',
    glyph: '»',
    available: (state) => state.stacks.swift < 5,
    title: () => 'Swift Core',
    line: () => 'The ship flies 9% faster, forever. Stacks to 5.',
    apply: (state) => {
      state.stacks.swift += 1;
      state.player.speed *= 1.09;
    },
  },
  {
    id: 'vital',
    color: '#ff8a80',
    glyph: '♥',
    available: () => true,
    title: () => 'Vital Core',
    line: () => '+20 max hull, and repairs 45 hull right now.',
    apply: (state) => {
      state.stacks.vital += 1;
      state.player.maxHp += 20;
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + 45);
    },
  },
  {
    id: 'magnet',
    color: '#4dd8ff',
    glyph: '◉',
    available: (state) => state.stacks.magnet < 5,
    title: () => 'Magnet Coil',
    line: () => 'Shards fly to the ship from 40% farther away. Stacks to 5.',
    apply: (state) => {
      state.stacks.magnet += 1;
      state.player.magnet *= 1.4;
    },
  },
  {
    id: 'rapid',
    color: '#ffd54d',
    glyph: '↯',
    available: (state) => state.stacks.rapid < 5,
    title: () => 'Rapid Mind',
    line: () => 'Every weapon cycles 9% faster. Stacks to 5.',
    apply: (state) => {
      state.stacks.rapid += 1;
      state.cooldownScale *= 0.91;
    },
  },
  {
    id: 'aegis',
    color: '#90caf9',
    glyph: '⛨',
    available: (state) => state.stacks.aegis < 4,
    title: () => 'Aegis Weave',
    line: () => 'The hull takes 12% less damage. Stacks to 4.',
    apply: (state) => {
      state.stacks.aegis += 1;
      state.player.armor = 1 - Math.pow(0.88, state.stacks.aegis);
    },
  },
];

/** Deal three distinct available cards, weapons first while any weapon is still unowned. */
export function dealCards(state) {
  const available = CARD_DECK.filter((card) => card.available(state));
  const unowned = WEAPON_ORDER.filter((id) => state.weapons[id].level === 0);
  const dealt = [];
  if (unowned.length > 0) {
    const first = available.find((card) => card.id === `weapon-${state.random.pick(unowned)}`);
    if (first) dealt.push(first);
  }
  const rest = available.filter((card) => !dealt.includes(card));
  while (dealt.length < 3 && rest.length > 0) {
    const index = Math.floor(state.random.next() * rest.length);
    dealt.push(rest.splice(index, 1)[0]);
  }
  return dealt;
}
