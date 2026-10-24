import { RootsTravel } from "c/shoreshRootsTravel";

/** A clock the test turns by hand. */
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

const box = (left, top, width, height) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height
});

/** Roots as the travel sees it: a card at (300, 200), 250 by 180, tilted a degree. */
function fakeRoots() {
  const card = { x: 300, y: 200, w: 250, h: 180, r: 1, s: 1, radius: 12 };
  return {
    offsetHeight: 700,
    frames: [],
    cardPose: jest.fn(() => ({ ...card })),
    cardVelocity: jest.fn(() => ({})),
    prepareHome: jest.fn(() => ({ ...card })),
    travel: jest.fn(function travel(v, key) {
      this.frames.push({ ...v, key });
    }),
    endTravel: jest.fn()
  };
}

function setUp() {
  const clock = fakeClock();
  const roots = fakeRoots();
  const wrap = document.createElement("div");
  wrap.getBoundingClientRect = () => box(100, 50, 1000, 700);
  const body = document.createElement("div");
  body.getBoundingClientRect = () => box(100, 50, 1000, 700);
  const done = jest.fn();
  const travel = new RootsTravel(
    { roots: () => roots, screen: () => wrap, body: () => body, done },
    clock
  );
  return { clock, roots, wrap, body, done, travel };
}

describe("c/shoreshRootsTravel", () => {
  beforeAll(() => {
    window.innerHeight = 900;
  });

  it("grows the screen out of the card, clipped to the sheet, then lets it be itself", () => {
    const { clock, roots, wrap, body, done, travel } = setUp();
    expect(travel.out("activities", "activities")).toBe(true);
    // The first frame is the card itself: its place, size and tilt, and none of the screen.
    expect(roots.frames[0]).toMatchObject({
      x: 300,
      y: 200,
      w: 250,
      h: 180,
      r: 1,
      p: 0
    });
    expect(roots.frames[0].key).toBe("activities");
    expect(Number(wrap.style.opacity)).toBe(0);
    expect(wrap.style.clipPath).toBe(
      "inset(60.0px 675.0px 460.0px 75.0px round 12.0px)"
    );
    expect(body.style.minHeight).toBe("700px");
    clock.run(300);
    const midway = roots.frames[roots.frames.length - 1];
    expect(midway.p).toBeGreaterThan(0);
    expect(midway.p).toBeLessThan(1);
    clock.run(3000);
    // Arrived: the frame's body, untilted; the screen is itself again, nothing clipped.
    const last = roots.frames[roots.frames.length - 1];
    expect(last).toMatchObject({ x: 600, y: 400, w: 1000, h: 700, r: 0, p: 1 });
    expect(done).toHaveBeenCalledWith("out", expect.anything());
    expect(wrap.style.clipPath).toBe("");
    expect(wrap.style.opacity).toBe("");
    expect(body.style.minHeight).toBe("");
    expect(roots.endTravel).toHaveBeenCalled();
    expect(travel.busy).toBe(false);
  });

  it("shrinks home into the card the cursor is put on", () => {
    const { clock, roots, done, travel } = setUp();
    expect(travel.home("activities", "activities")).toBe(true);
    expect(roots.prepareHome).toHaveBeenCalledWith("activities");
    expect(roots.frames[0]).toMatchObject({ w: 1000, h: 700, p: 1 });
    clock.run(3000);
    expect(roots.frames[roots.frames.length - 1]).toMatchObject({
      x: 300,
      y: 200,
      w: 250,
      h: 180,
      p: 0
    });
    expect(done).toHaveBeenCalledWith("home", expect.anything());
  });

  it("turned round mid-way, it goes back from wherever it is, with no jump", () => {
    const { clock, roots, done, travel } = setUp();
    travel.out("activities", "activities");
    clock.run(200);
    const at = roots.frames[roots.frames.length - 1];
    travel.home("activities", "activities");
    clock.run(16);
    const next = roots.frames[roots.frames.length - 1];
    expect(Math.abs(next.w - at.w)).toBeLessThan(80);
    expect(Math.abs(next.p - at.p)).toBeLessThan(0.15);
    clock.run(3000);
    expect(done).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledWith("home", expect.anything());
  });

  it("does nothing when Roots has no such card", () => {
    const { roots, travel } = setUp();
    roots.cardPose.mockReturnValue(null);
    expect(travel.out("scheduleWeeks", "scheduleWeeks")).toBe(false);
    roots.prepareHome.mockReturnValue(null);
    expect(travel.home("scheduleWeeks", "scheduleWeeks")).toBe(false);
    expect(travel.busy).toBe(false);
  });

  it("finished early, the screen and Roots are themselves at once", () => {
    const { clock, roots, wrap, travel } = setUp();
    travel.out("activities", "activities");
    clock.run(100);
    travel.finish();
    expect(wrap.style.clipPath).toBe("");
    expect(roots.endTravel).toHaveBeenCalled();
    expect(travel.busy).toBe(false);
  });
});
