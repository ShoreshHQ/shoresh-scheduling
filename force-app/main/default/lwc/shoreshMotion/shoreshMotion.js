/**
 * Shoresh's one model of motion (repo ADR 0020; the approved Roots mock-up's table.js, wiki decision
 * 67): every moving value follows its target through two gentle, critically damped stages, so it
 * starts softly, glides and settles without overshoot. A new target is taken up from where the value
 * is and how fast it is moving, so an interrupted motion bends toward its new end instead of
 * restarting or snapping. Nothing here touches the page: each tracked thing has its own apply(values)
 * that draws it.
 *
 * Frames come from requestAnimationFrame, the browser's clock for drawing, which pauses itself in a
 * hidden tab; short waits (hover intent) are counted on the same frames, so this file is the one
 * place Roots asks the browser for time (eslint.config.js and code-analyzer.yml allow it here only).
 * A frame is asked for only while something moves or waits.
 */

// How close to its target a value must be to count as settled (others are pixels).
const EPS = { s: 2e-4, o: 1e-3, p: 1e-3, r: 0.01 };
const DEFAULT_EPS = 0.1;
// Each frame is integrated in steps of at most 4 ms, and never more than 50 ms at once.
const STEP = 0.004;
const MAX_DT = 0.05;

/** Stiffness: a meld fanning and the others easing aside; the hand; a card growing into its screen. */
export const W_MOVE = 11.5;
export const W_HAND = 11;
export const W_GROW = 9;

export const clamp01 = (x) => Math.max(0, Math.min(1, x));

/** 0 before a, 1 after b, and a smooth step between. */
export function smooth(a, b, x) {
  const u = clamp01((x - a) / (b - a));
  return u * u * (3 - 2 * u);
}

/** The browser's clock; tests hand in their own. */
function browserClock() {
  return {
    now: () => {
      return typeof performance !== "undefined"
        ? performance.now()
        : Date.now();
    },
    request: (fn) => {
      return typeof requestAnimationFrame === "function"
        ? requestAnimationFrame(fn)
        : 0;
    },
    cancel: (id) => {
      if (typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(id);
      }
    }
  };
}

/**
 * A motion engine of its own (one per component, so a component that goes away takes its frames
 * with it). clock: { now(), request(fn), cancel(id) }, the browser's by default.
 */
export function createMotion(clock = browserClock()) {
  const all = new Map();
  const running = new Set();
  const waits = new Set();
  let frame = 0;
  let last = 0;

  function snapTo(it, vals) {
    Object.keys(vals).forEach((n) => {
      const v = vals[n];
      it.k[n] = { p: v, v: 0, m: v, t: v };
      it.val[n] = v;
    });
  }

  function setTargets(it, vals, w) {
    Object.keys(vals).forEach((n) => {
      const q = it.k[n];
      if (!q) {
        snapTo(it, { [n]: vals[n] });
      } else {
        q.t = vals[n];
      }
    });
    if (w) {
      it.w = w;
    }
  }

  function finish(it) {
    running.delete(it);
    const done = it.done;
    it.done = null;
    if (done) {
      done();
    }
  }

  function kick() {
    if (!frame && (running.size || waits.size)) {
      last = clock.now();
      frame = clock.request(tick);
    }
  }

  function step(it, dt, now) {
    if (it.pend && now >= it.pend.at) {
      setTargets(it, it.pend.vals, it.pend.w);
      it.pend = null;
    }
    const w = it.w;
    const n = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / n;
    const f = 1 - Math.exp(-w * h);
    let still = !it.pend;
    Object.keys(it.k).forEach((name) => {
      const q = it.k[name];
      for (let i = 0; i < n; i++) {
        q.m += (q.t - q.m) * f;
        q.v += (w * w * (q.m - q.p) - 2 * w * q.v) * h;
        q.p += q.v * h;
      }
      const e = EPS[name] || DEFAULT_EPS;
      if (
        Math.abs(q.p - q.t) < e &&
        Math.abs(q.m - q.t) < e &&
        Math.abs(q.v) < e * 4
      ) {
        q.p = q.t;
        q.m = q.t;
        q.v = 0;
      } else {
        still = false;
      }
      it.val[name] = q.p;
    });
    it.apply(it.val, it);
    return still;
  }

  function tick(now) {
    frame = 0;
    const dt = Math.min(MAX_DT, Math.max(0, (now - last) / 1000));
    last = now;
    [...waits].forEach((wait) => {
      if (now >= wait.at) {
        waits.delete(wait);
        wait.fn();
      }
    });
    [...running].forEach((it) => {
      if (step(it, dt, now)) {
        finish(it);
      }
    });
    kick();
  }

  return {
    /** Starts following a thing (any object as its key): apply(values) draws it. */
    track(key, apply, w = W_MOVE) {
      const it = { key, apply, w, k: {}, val: {}, pend: null, done: null };
      all.set(key, it);
      return it;
    },

    /** Stops following it (it was removed). */
    untrack(key) {
      const it = all.get(key);
      if (it) {
        running.delete(it);
        all.delete(key);
      }
    },

    /**
     * Sends a thing toward new values. opt: { snap (jump there now), delay (ms before it turns),
     * w (stiffness), done (when it settles), vel (with snap: the speed to carry on at, from
     * vel()) }. A thing's first values, and a snap (every move while motion is reduced), are
     * drawn at once.
     */
    to(key, vals, opt = {}) {
      const it = all.get(key);
      if (!it) {
        return;
      }
      if (opt.done) {
        it.done = opt.done;
      }
      const fresh = !Object.keys(it.k).length;
      if (fresh || opt.snap) {
        it.pend = null;
        snapTo(it, vals);
        // Carry on at the speed it had: a thing taking over from another keeps that one's
        // motion, which the next move continues.
        Object.keys(opt.vel || {}).forEach((n) => {
          if (it.k[n]) {
            it.k[n].v = opt.vel[n].v;
            it.k[n].m = it.k[n].p + opt.vel[n].lead;
          }
        });
        it.apply(it.val, it);
        finish(it);
        return;
      }
      if (opt.delay > 0) {
        it.pend = { vals, w: opt.w, at: clock.now() + opt.delay };
      } else {
        it.pend = null;
        setTargets(it, vals, opt.w);
      }
      running.add(it);
      kick();
    },

    /** Where a thing is going (a delayed turn counts as where it is going). */
    target(key) {
      const it = all.get(key);
      const o = {};
      if (it) {
        Object.keys(it.k).forEach((n) => {
          o[n] = it.pend && n in it.pend.vals ? it.pend.vals[n] : it.k[n].t;
        });
      }
      return o;
    },

    /** Where it is now. */
    now(key) {
      const it = all.get(key);
      return it ? { ...it.val } : {};
    },

    /** How it is moving now: speed, and how far its gentle first stage is ahead of it. */
    vel(key) {
      const it = all.get(key);
      const o = {};
      if (it && running.has(it)) {
        Object.keys(it.k).forEach((n) => {
          o[n] = { v: it.k[n].v, lead: it.k[n].m - it.k[n].p };
        });
      }
      return o;
    },

    busy(key) {
      const it = all.get(key);
      return !!it && running.has(it);
    },

    /** Calls fn after ms, counted on the frames; returns a function that calls it off. */
    after(ms, fn) {
      const wait = { at: clock.now() + ms, fn };
      waits.add(wait);
      kick();
      return () => waits.delete(wait);
    },

    /** Lets everything go (the component was removed). */
    stop() {
      if (frame) {
        clock.cancel(frame);
      }
      frame = 0;
      running.clear();
      waits.clear();
      all.clear();
    }
  };
}
