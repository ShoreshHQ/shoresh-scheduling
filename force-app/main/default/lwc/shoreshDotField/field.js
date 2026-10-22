/**
 * The living dot field's arithmetic, apart from the page so it can be tested alone
 * (wiki decision 49, ADR 0015 choice 13). No DOM here: positions, warmth and colour.
 */

/** The primary (sage, --shoresh-color-primary-500) and the highlight (forest,
 * --shoresh-color-highlight), for a browser that can't read the tokens. */
export const REST_FALLBACK = [174, 182, 167];
export const GLOW_FALLBACK = [31, 102, 81];
/** Space between dots, in CSS pixels (the proof of concept's 18). */
export const GAP = 18;
/** How far the cursor warms dots, in CSS pixels. */
export const REACH = 90;
/** Room kept around words and controls, in CSS pixels: wider than the largest dot. */
export const CLEAR = 6;
/** How quickly warm dots settle: their warmth falls by e every this many seconds. */
export const SETTLE = 0.5;
/** Warmth below this is rest. */
const REST = 0.002;
/** A dot at rest, and how much more a warm one adds (alpha, radius, share of the glow colour). */
export const DOT = {
  restAlpha: 0.35,
  warmAlpha: 0.4,
  restRadius: 1.1,
  warmRadius: 1.6,
  glowShare: 0.6
};
/** Rest dots are drawn in this many steps of fade, one fill each, so a frame stays cheap. */
export const FADE_STEPS = 8;

/**
 * How strongly a dot shows at (x, y) in a w by h field: full at the edges, fading to nothing a
 * fifth of the way in, so the field's middle (where its content is) stays clear.
 */
export function edgeFade(x, y, w, h) {
  if (w <= 0 || h <= 0) return 0;
  const ex = Math.min(x, w - x) / w;
  const ey = Math.min(y, h - y) / h;
  return Math.max(0, 1 - Math.min(ex, ey) * 5);
}

const inside = (x, y, r) =>
  x >= r.left - CLEAR &&
  x <= r.right + CLEAR &&
  y >= r.top - CLEAR &&
  y <= r.bottom + CLEAR;

/**
 * The dots of a w by h field: every GAP, fading in from the edges, none within CLEAR of a
 * rectangle in `clear` (words and controls, in the field's own coordinates), so a dot is never
 * under words. Returns parallel arrays: x, y, and fade (0 to 1).
 */
export function layoutDots(w, h, clear = []) {
  const xs = [];
  const ys = [];
  const fades = [];
  const cols = Math.ceil(w / GAP) + 1;
  const rows = Math.ceil(h / GAP) + 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = i * GAP;
      const y = j * GAP;
      const fade = edgeFade(x, y, w, h);
      if (fade > 0 && !clear.some((r) => inside(x, y, r))) {
        xs.push(x);
        ys.push(y);
        fades.push(fade);
      }
    }
  }
  return {
    x: Float32Array.from(xs),
    y: Float32Array.from(ys),
    fade: Float32Array.from(fades),
    count: xs.length
  };
}

/** Warms the dots near (px, py), never cooling one already warmer. True if any was in reach. */
export function warm(heat, dots, px, py) {
  let any = false;
  for (let k = 0; k < dots.count; k++) {
    const d = Math.hypot(dots.x[k] - px, dots.y[k] - py);
    if (d < REACH) {
      heat[k] = Math.max(heat[k], 1 - d / REACH);
      any = true;
    }
  }
  return any;
}

/** Lets every dot settle for dt seconds. True while any is still warm. */
export function settle(heat, dt) {
  const keep = Math.exp(-dt / SETTLE);
  let any = false;
  for (let k = 0; k < heat.length; k++) {
    if (heat[k] > REST) {
      heat[k] *= keep;
      any = true;
    } else {
      heat[k] = 0;
    }
  }
  return any;
}

/** "#aeb6a7" (or " #AEB6A7 ") as [174, 182, 167]; null if it is not a 6-digit colour. */
export function rgb(hex) {
  const m = /^\s*#([0-9a-f]{6})\s*$/i.exec(hex || "");
  if (!m) return null;
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
}

/** The colour of a dot with warmth h: the rest colour, some of the way toward the glow. */
export function dotColour(rest, glow, h) {
  const t = h * DOT.glowShare;
  return rest.map((v, k) => Math.round(v + (glow[k] - v) * t));
}
