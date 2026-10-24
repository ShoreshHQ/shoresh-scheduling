/**
 * The living dot field (wiki decision 49, ADR 0015 choice 13): it follows a mouse, is still for
 * reduced motion and touch, draws nothing while off screen or in a hidden tab, and never draws a
 * dot under words.
 */
import { createElement } from "lwc";
import ShoreshDotField from "c/shoreshDotField";
import ShoreshEmptyState from "c/shoreshEmptyState";
import {
  CLEAR,
  GAP,
  edgeFade,
  layoutDots,
  tableFade,
  rgb,
  settle,
  warm,
  dotColour,
  GLOW_FALLBACK,
  REST_FALLBACK
} from "../field";

const fs = require("fs");
const path = require("path");

let media; // { reduce, fine }
let mediaListeners;
let frames; // pending requestAnimationFrame callbacks by id
let nextFrame;
let observers;
let ctx;
let hidden;
const realMatchMedia = window.matchMedia;

function fakeContext() {
  return {
    arcs: [],
    fills: 0,
    clears: 0,
    fillStyle: "",
    setTransform: jest.fn(),
    clearRect() {
      this.clears += 1;
      this.arcs = [];
    },
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    arc(x, y, r) {
      this.arcs.push({ x, y, r, style: this.fillStyle });
    },
    fill() {
      this.fills += 1;
    }
  };
}

const rect = (left, top, width, height) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
  x: left,
  y: top
});

beforeEach(() => {
  media = { reduce: false, fine: true };
  mediaListeners = [];
  frames = new Map();
  nextFrame = 1;
  observers = [];
  hidden = false;
  ctx = fakeContext();
  window.matchMedia = jest.fn((query) => ({
    get matches() {
      return query.includes("reduced-motion") ? media.reduce : media.fine;
    },
    addEventListener: (type, fn) => mediaListeners.push(fn),
    removeEventListener: (type, fn) => {
      mediaListeners = mediaListeners.filter((f) => f !== fn);
    }
  }));
  window.requestAnimationFrame = jest.fn((fn) => {
    const id = nextFrame++;
    frames.set(id, fn);
    return id;
  });
  window.cancelAnimationFrame = jest.fn((id) => frames.delete(id));
  global.IntersectionObserver = class {
    constructor(fn) {
      this.fn = fn;
      observers.push(this);
    }
    observe() {}
    disconnect() {
      this.gone = true;
    }
  };
  global.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(() => ctx);
  jest
    .spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect")
    .mockImplementation(() => rect(0, 0, 400, 200));
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden
  });
});

afterEach(() => {
  while (document.body.firstChild) {
    document.body.removeChild(document.body.firstChild);
  }
  jest.restoreAllMocks();
  window.matchMedia = realMatchMedia;
  delete global.IntersectionObserver;
  delete global.ResizeObserver;
  delete document.hidden;
});

async function mount() {
  const element = createElement("c-shoresh-dot-field", { is: ShoreshDotField });
  document.body.appendChild(element);
  await Promise.resolve();
  await Promise.resolve();
  return element;
}

const field = (element) =>
  element.shadowRoot.querySelector('[data-id="field"]');
const canvas = (element) =>
  element.shadowRoot.querySelector('[data-id="dots"]');

function moveMouse(x, y, pointerType = "mouse") {
  const event = new CustomEvent("pointermove");
  Object.assign(event, { clientX: x, clientY: y, pointerType });
  window.dispatchEvent(event);
}

/** Runs the frames asked for, one round at a time, `ms` apart; how many rounds ran. */
function runFrames(rounds = 1, ms = 16) {
  let ran = 0;
  while (ran < rounds && frames.size) {
    const pending = [...frames.values()];
    const time = (ran + 1) * ms;
    frames.clear();
    pending.forEach((fn) => fn(time));
    ran += 1;
  }
  return ran;
}

const warmArcs = () => ctx.arcs.filter((a) => a.r > 1.1);

describe("c-shoresh-dot-field", () => {
  it("is decoration only: hidden from screen readers, no focus, accessible", async () => {
    const element = await mount();
    const c = canvas(element);
    expect(c.getAttribute("aria-hidden")).toBe("true");
    expect(c.hasAttribute("tabindex")).toBe(false);
    expect(element.shadowRoot.textContent.trim()).toBe("");
    await expect(element).toBeAccessible();
  });

  it("draws the faint field once, then no frames while the cursor is still", async () => {
    const element = await mount();
    expect(field(element).dataset.motion).toBe("live");
    expect(ctx.arcs.length).toBeGreaterThan(0);
    expect(warmArcs()).toEqual([]);
    expect(frames.size).toBe(0);
  });

  it("warms the dots near a mouse toward forest, then settles and stops asking for frames", async () => {
    await mount();
    moveMouse(10, 10);
    expect(frames.size).toBe(1);
    runFrames(1);
    const warmNow = warmArcs();
    expect(warmNow.length).toBeGreaterThan(0);
    // The warmest dot is the nearest one, and leans toward forest (#1f6651) from sage.
    const nearest = warmNow.reduce((a, b) => (a.r > b.r ? a : b));
    expect(Math.hypot(nearest.x - 10, nearest.y - 10)).toBeLessThan(GAP);
    const [r, g, b] = nearest.style.match(/\d+/g).map(Number);
    expect(r).toBeLessThan(174);
    expect(b).toBeLessThan(167);
    expect(g).toBeLessThan(182);
    // Left alone, it settles within a few seconds and asks for nothing more.
    const rounds = runFrames(1000);
    expect(rounds).toBeLessThan(400);
    expect(frames.size).toBe(0);
    expect(warmArcs()).toEqual([]);
  });

  it("asks for one frame at a time however fast the mouse moves", async () => {
    await mount();
    moveMouse(10, 10);
    moveMouse(20, 12);
    moveMouse(30, 14);
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
  });

  it("ignores a mouse far from the field", async () => {
    await mount();
    moveMouse(900, 900);
    expect(frames.size).toBe(0);
  });

  it("is still for reduced motion: drawn once, never following the mouse", async () => {
    media.reduce = true;
    const element = await mount();
    expect(field(element).dataset.motion).toBe("still");
    expect(ctx.arcs.length).toBeGreaterThan(0);
    moveMouse(10, 10);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
    expect(warmArcs()).toEqual([]);
  });

  it("stops at once when reduced motion is turned on while it glows", async () => {
    const element = await mount();
    moveMouse(10, 10);
    runFrames(1);
    expect(frames.size).toBe(1);
    media.reduce = true;
    mediaListeners.forEach((fn) => fn());
    await Promise.resolve();
    expect(frames.size).toBe(0);
    expect(warmArcs()).toEqual([]);
    expect(field(element).dataset.motion).toBe("still");
  });

  it("is still on a touch screen, and ignores touch and pen pointers", async () => {
    media.fine = false;
    const element = await mount();
    expect(field(element).dataset.motion).toBe("still");
    moveMouse(10, 10, "touch");
    moveMouse(10, 10);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();

    document.body.removeChild(element);
    media.fine = true;
    await mount();
    moveMouse(10, 10, "touch");
    moveMouse(10, 10, "pen");
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("pauses while off screen, and draws again when back", async () => {
    await mount();
    moveMouse(10, 10);
    const watcher = observers[observers.length - 1];
    watcher.fn([{ isIntersecting: false }]);
    expect(frames.size).toBe(0);
    moveMouse(12, 12);
    expect(frames.size).toBe(0);
    const clears = ctx.clears;
    watcher.fn([{ isIntersecting: true }]);
    expect(ctx.clears).toBe(clears + 1);
    moveMouse(14, 14);
    expect(frames.size).toBe(1);
  });

  it("pauses while the browser tab is hidden", async () => {
    await mount();
    moveMouse(10, 10);
    hidden = true;
    document.dispatchEvent(new CustomEvent("visibilitychange"));
    expect(frames.size).toBe(0);
    moveMouse(12, 12);
    expect(frames.size).toBe(0);
    hidden = false;
    document.dispatchEvent(new CustomEvent("visibilitychange"));
    moveMouse(14, 14);
    expect(frames.size).toBe(1);
  });

  it("lets go of everything when removed", async () => {
    const element = await mount();
    moveMouse(10, 10);
    document.body.removeChild(element);
    expect(frames.size).toBe(0);
    expect(observers.every((o) => o.gone)).toBe(true);
    expect(mediaListeners).toEqual([]);
    moveMouse(12, 12);
    expect(frames.size).toBe(0);
  });

  it("draws nothing where the browser can't say whether motion is wanted", async () => {
    window.matchMedia = undefined;
    const element = await mount();
    expect(HTMLCanvasElement.prototype.getContext).not.toHaveBeenCalled();
    expect(field(element).dataset.motion).toBe("still");
  });

  it("never draws a dot under the words or the picture put inside it", async () => {
    jest
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function where() {
        return this.tagName === "P" ? rect(0, 0, 200, 40) : rect(0, 0, 0, 0);
      });
    jest
      .spyOn(SVGElement.prototype, "getBoundingClientRect")
      .mockImplementation(() => rect(300, 150, 40, 40));
    const empty = createElement("c-shoresh-empty-state", {
      is: ShoreshEmptyState
    });
    empty.title = "No programs yet";
    document.body.appendChild(empty);
    await Promise.resolve();
    await Promise.resolve();
    expect(ctx.arcs.length).toBeGreaterThan(0);
    const under = (r) => (a) =>
      a.x >= r.left - CLEAR &&
      a.x <= r.right + CLEAR &&
      a.y >= r.top - CLEAR &&
      a.y <= r.bottom + CLEAR;
    expect(ctx.arcs.filter(under(rect(0, 0, 200, 40)))).toEqual([]);
    expect(ctx.arcs.filter(under(rect(300, 150, 40, 40)))).toEqual([]);
    // Elsewhere along the edges the field is there.
    expect(ctx.arcs.some((a) => a.y > 100)).toBe(true);
  });
});

describe("a solid field (Roots' table, ADR 0020)", () => {
  it("fills its whole box, the middle too, and measures nothing it holds", async () => {
    const spy = jest.spyOn(HTMLElement.prototype, "getBoundingClientRect");
    const element = createElement("c-shoresh-dot-field", {
      is: ShoreshDotField
    });
    element.solid = true;
    document.body.appendChild(element);
    await Promise.resolve();
    await Promise.resolve();
    expect(field(element).className).toBe("field field_solid");
    // Dots in the middle of the field, where an ordinary field has none.
    expect(
      ctx.arcs.some((a) => a.x > 150 && a.x < 250 && a.y > 70 && a.y < 130)
    ).toBe(true);
    // The field did not look for words to keep clear of: what it holds covers it.
    expect(spy).not.toHaveBeenCalled();
    // And it still follows the mouse.
    moveMouse(200, 100);
    runFrames(1);
    expect(warmArcs().length).toBeGreaterThan(0);
  });

  it("is fainter in the middle than at its edges", () => {
    expect(tableFade(0, 100, 400, 200)).toBe(1);
    expect(tableFade(200, 100, 400, 200)).toBeCloseTo(0.45);
    expect(tableFade(10, 10, 0, 0)).toBe(0);
  });
});

describe("the dot field's arithmetic", () => {
  it("shows dots at the edges and none in the middle", () => {
    expect(edgeFade(0, 50, 400, 200)).toBe(1);
    expect(edgeFade(200, 100, 400, 200)).toBe(0);
    expect(edgeFade(10, 10, 0, 0)).toBe(0);
    const dots = layoutDots(400, 200);
    for (let k = 0; k < dots.count; k++) {
      expect(dots.fade[k]).toBeGreaterThan(0);
    }
    expect(layoutDots(0, 0).count).toBe(0);
  });

  it("is the same field for the same box (same inputs, same output)", () => {
    expect(layoutDots(640, 300)).toEqual(layoutDots(640, 300));
  });

  it("warms only within reach and settles to rest", () => {
    const dots = layoutDots(400, 200);
    const heat = new Float32Array(dots.count);
    expect(warm(heat, dots, -500, -500)).toBe(false);
    expect(warm(heat, dots, 0, 0)).toBe(true);
    expect(Math.max(...heat)).toBe(1);
    let t = 0;
    while (settle(heat, 1 / 60)) t += 1 / 60;
    expect(t).toBeLessThan(4);
    expect(heat.every((h) => h === 0)).toBe(true);
  });

  it("takes its colours from the design system's tokens", () => {
    const tokens = fs.readFileSync(
      path.join(__dirname, "../../shoreshTokens/shoreshTokens.css"),
      "utf8"
    );
    const token = (name) =>
      rgb(new RegExp(`${name}:\\s*(#[0-9a-f]{6});`, "i").exec(tokens)[1]);
    expect(REST_FALLBACK).toEqual(token("--shoresh-color-primary-500"));
    expect(GLOW_FALLBACK).toEqual(token("--shoresh-color-highlight"));
    expect(rgb(" #AEB6A7 ")).toEqual([174, 182, 167]);
    expect(rgb("#1f6651")).toEqual([31, 102, 81]);
    expect(rgb("var(--x)")).toBeNull();
    expect(dotColour([174, 182, 167], [31, 102, 81], 0)).toEqual([
      174, 182, 167
    ]);
    expect(dotColour([174, 182, 167], [31, 102, 81], 1)).toEqual([
      88, 134, 115
    ]);
  });
});
