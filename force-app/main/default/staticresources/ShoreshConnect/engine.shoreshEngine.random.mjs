/**
 * The generator's only source of chance. Every number comes from a seeded stream, so the same
 * program, week and option give the same week in every browser (ADR 0010). Nothing here reads
 * Math.random, the clock, or the locale.
 */

/** A 32-bit FNV-1a hash of a string: the same number in every browser. */
export function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32, as the desktop generator uses: numbers in [0, 1) from a 32-bit seed. */
export function mulberry32(seed) {
  let state = seed | 0;
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stream seeded from text. */
export function streamFor(text) {
  return mulberry32(hash(text));
}
