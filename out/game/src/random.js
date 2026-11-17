// A small seeded random source (mulberry32): the same seed always deals the same run, which is
// what makes the staged screenshots reproducible and the autopilot's practice runs honest.

export function createRandom(seed) {
  let state = seed >>> 0;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    /** A float in [min, max). */
    range(min, max) {
      return min + next() * (max - min);
    },
    /** An integer in [min, max]. */
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    /** One item of a non-empty array. */
    pick(items) {
      return items[Math.floor(next() * items.length)];
    },
    /** True with probability p. */
    chance(p) {
      return next() < p;
    },
  };
}
