import { createMotion, smooth, clamp01 } from "c/shoreshMotion";

/** A clock the test turns by hand: frames run only when asked for, 16 ms apart. */
function fakeClock() {
  const frames = new Map();
  let next = 1;
  let time = 0;
  return {
    now: () => time,
    request: (fn) => {
      const id = next++;
      frames.set(id, fn);
      return id;
    },
    cancel: (id) => frames.delete(id),
    pending: () => frames.size,
    run(ms) {
      for (let t = 0; t < ms; t += 16) {
        time += 16;
        const due = [...frames.values()];
        frames.clear();
        const now = time;
        due.forEach((fn) => fn(now));
      }
    }
  };
}

describe("c/shoreshMotion", () => {
  it("draws a thing's first values at once, without a frame", () => {
    const clock = fakeClock();
    const motion = createMotion(clock);
    const drawn = [];
    motion.track("a", (v) => drawn.push({ ...v }));
    motion.to("a", { x: 10 });
    expect(drawn).toEqual([{ x: 10 }]);
    expect(clock.pending()).toBe(0);
  });

  it("glides to its target and settles exactly there, never past it", () => {
    const clock = fakeClock();
    const motion = createMotion(clock);
    const xs = [];
    let done = false;
    motion.track("a", (v) => xs.push(v.x));
    motion.to("a", { x: 0 });
    motion.to("a", { x: 100 }, { done: () => (done = true) });
    clock.run(3000);
    expect(done).toBe(true);
    expect(xs[xs.length - 1]).toBe(100);
    // Soft in and out: it starts slowly, and never overshoots.
    expect(xs[1]).toBeLessThan(5);
    expect(Math.max(...xs)).toBeLessThanOrEqual(100);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1] - 1e-9);
    }
    // Nothing moves: no more frames.
    expect(clock.pending()).toBe(0);
  });

  it("an interrupted motion bends toward its new end from where it is, at the speed it has", () => {
    const clock = fakeClock();
    const motion = createMotion(clock);
    let x = 0;
    motion.track("a", (v) => (x = v.x));
    motion.to("a", { x: 0 });
    motion.to("a", { x: 100 });
    clock.run(160);
    const midway = x;
    expect(midway).toBeGreaterThan(5);
    expect(midway).toBeLessThan(95);
    motion.to("a", { x: -100 });
    clock.run(16);
    // No restart and no snap: the next frame is a small step from where it was, still moving on
    // for a moment before it turns.
    expect(Math.abs(x - midway)).toBeLessThan(15);
    clock.run(3000);
    expect(x).toBe(-100);
  });

  it("a snap jumps there now; with a speed, the next move carries it on", () => {
    const clock = fakeClock();
    const motion = createMotion(clock);
    let x = 0;
    motion.track("a", (v) => (x = v.x));
    motion.to("a", { x: 0 });
    motion.to("a", { x: 50 }, { snap: true, vel: { x: { v: 500, lead: 20 } } });
    expect(x).toBe(50);
    motion.to("a", { x: 50 });
    clock.run(16);
    expect(x).toBeGreaterThan(50);
  });

  it("a delayed turn waits, then goes; target() already says where it is going", () => {
    const clock = fakeClock();
    const motion = createMotion(clock);
    let x = 0;
    motion.track("a", (v) => (x = v.x));
    motion.to("a", { x: 0 });
    motion.to("a", { x: 100 }, { delay: 100 });
    expect(motion.target("a")).toEqual({ x: 100 });
    clock.run(80);
    expect(x).toBe(0);
    clock.run(400);
    expect(x).toBeGreaterThan(0);
  });

  it("counts a wait on the frames, and a wait called off never comes", () => {
    const clock = fakeClock();
    const motion = createMotion(clock);
    const calls = [];
    motion.after(170, () => calls.push("open"));
    const off = motion.after(170, () => calls.push("never"));
    off();
    clock.run(150);
    expect(calls).toEqual([]);
    clock.run(40);
    expect(calls).toEqual(["open"]);
    expect(clock.pending()).toBe(0);
  });

  it("lets everything go when stopped", () => {
    const clock = fakeClock();
    const motion = createMotion(clock);
    motion.track("a", () => {});
    motion.to("a", { x: 0 });
    motion.to("a", { x: 100 });
    expect(clock.pending()).toBe(1);
    motion.stop();
    expect(clock.pending()).toBe(0);
    expect(motion.busy("a")).toBe(false);
  });

  it("asks for no frame without a clock (a browser that can't draw)", () => {
    const motion = createMotion({
      now: () => 0,
      request: () => 0,
      cancel: () => {}
    });
    let x = 0;
    motion.track("a", (v) => (x = v.x));
    motion.to("a", { x: 0 });
    motion.to("a", { x: 5 }, { snap: true });
    expect(x).toBe(5);
  });

  it("smooth and clamp01 ease between their ends", () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(smooth(0.2, 0.8, 0)).toBe(0);
    expect(smooth(0.2, 0.8, 0.5)).toBeCloseTo(0.5);
    expect(smooth(0.2, 0.8, 1)).toBe(1);
  });
});
