import { createElement } from "lwc";
import ShoreshRootsHand from "c/shoreshRootsHand";

// Made-up cards, as c/shoreshRootsLooks makes them (no real campers or staff).
const card = (id, meld = "activities") => ({
  key: `hand:${id}`,
  screen: "activities",
  meld,
  name: id,
  small: null,
  off: "no place",
  label: `${id} has no place.`,
  nav: {},
  glimpse: { w: 170, h: 62, align: "xMidYMax", fade: null, shapes: [] }
});

const flush = () => Promise.resolve();
const settle = () => flush().then(flush).then(flush).then(flush);

const realMatchMedia = window.matchMedia;
let media;
let frames;
let nextFrame;
let time;

beforeEach(() => {
  media = { reduce: false };
  frames = new Map();
  nextFrame = 1;
  time = 1000;
  window.matchMedia = jest.fn(() => ({
    get matches() {
      return media.reduce;
    },
    addEventListener: () => {},
    removeEventListener: () => {}
  }));
  window.requestAnimationFrame = jest.fn((fn) => {
    const id = nextFrame++;
    frames.set(id, fn);
    return id;
  });
  window.cancelAnimationFrame = jest.fn((id) => frames.delete(id));
  jest.spyOn(performance, "now").mockImplementation(() => time);
  // jsdom lays nothing out: the hand is 1200 wide, its box from 500 to 700 down the window.
  jest
    .spyOn(HTMLElement.prototype, "clientWidth", "get")
    .mockImplementation(() => 1200);
  jest
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(() => ({
      left: 0,
      top: 500,
      right: 1200,
      bottom: 700,
      width: 1200,
      height: 200
    }));
});

afterEach(() => {
  while (document.body.firstChild) {
    document.body.removeChild(document.body.firstChild);
  }
  window.matchMedia = realMatchMedia;
  delete window.requestAnimationFrame;
  delete window.cancelAnimationFrame;
  jest.restoreAllMocks();
});

/** Runs the frames asked for, 16 ms apart, for ms. */
function run(ms) {
  for (let t = 0; t < ms; t += 16) {
    time += 16;
    const due = [...frames.entries()];
    frames.clear();
    const now = time;
    due.forEach(([, fn]) => fn(now));
  }
}

async function render(cards, playTo) {
  const element = createElement("c-shoresh-roots-hand", {
    is: ShoreshRootsHand
  });
  element.playTo = playTo || (() => ({ x: 600, y: 100, w: 120, r: 1 }));
  element.cards = cards;
  document.body.appendChild(element);
  await settle();
  return element;
}

const buttons = (element) => [
  ...element.shadowRoot.querySelectorAll("[data-hand]")
];
const live = (element) =>
  buttons(element).filter((b) => !b.hasAttribute("data-gone"));
const button = (element, id) =>
  element.shadowRoot.querySelector(`[data-hand="hand:${id}"]`);
const xOf = (b) => {
  const m = /calc\(-50% \+ (-?[\d.]+)px\)/.exec(b.style.transform);
  return m ? Number(m[1]) : null;
};

describe("c-shoresh-roots-hand", () => {
  it("holds each card as a button named by what is off", async () => {
    const element = await render([card("Canoe"), card("Pottery")]);
    expect(live(element).map((b) => b.getAttribute("aria-label"))).toEqual([
      "Canoe has no place.",
      "Pottery has no place."
    ]);
    expect(
      element.shadowRoot.querySelector('[data-id="calm"]').textContent
    ).toBe("");
  });

  it("deals new cards in from the right, one after another, into a fan", async () => {
    const element = await render([card("A"), card("B"), card("C")]);
    const [a, b, c] = live(element);
    // Waiting off to the right, unseen.
    expect(xOf(a)).toBeGreaterThan(500);
    expect(a.style.opacity).toBe("0");
    run(3000);
    expect(a.style.opacity).toBe("");
    // Fanned: left, middle, right; the middle one upright.
    expect(xOf(a)).toBeLessThan(0);
    expect(Math.abs(xOf(b))).toBeLessThan(1);
    expect(xOf(c)).toBeGreaterThan(0);
    expect(a.style.transform).toContain("rotate(-");
  });

  it("fits any number: past what fits side by side, the cards close up and overlap", async () => {
    const many = [...Array(30)].map((_, i) => card(`C${i}`));
    const element = await render(many);
    run(9000);
    const xs = live(element).map(xOf);
    const step = xs[1] - xs[0];
    // Overlapping (closer than a card is wide), all inside the hand's margins.
    expect(step).toBeLessThan(196);
    expect(step).toBeGreaterThan(0);
    expect(Math.min(...xs) - 232 / 2).toBeGreaterThan(-600);
    expect(Math.max(...xs) + 232 / 2).toBeLessThan(600);
  });

  it("opens a card on click, and the arrows move between cards", async () => {
    const element = await render([card("A"), card("B")]);
    run(3000);
    const handler = jest.fn();
    element.addEventListener("open", handler);
    const [a, b] = live(element);
    a.click();
    expect(handler.mock.calls[0][0].detail).toEqual({ key: "hand:A" });
    a.focus();
    a.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
    );
    expect(element.shadowRoot.activeElement).toBe(b);
    b.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
    );
    expect(element.shadowRoot.activeElement).toBe(a);
  });

  it("plays a card no longer held onto its meld: it travels there, the meld hears it land, and it goes", async () => {
    const playTo = jest.fn(() => ({ x: 600, y: 100, w: 120, r: 1 }));
    const element = await render([card("A"), card("B")], playTo);
    run(3000);
    const landed = jest.fn();
    element.addEventListener("landed", landed);
    const a = button(element, "A");
    const before = xOf(a);
    element.cards = [card("B")];
    await settle();
    expect(playTo).toHaveBeenCalledWith("activities");
    // Still drawn while it travels, but out of reach.
    expect(a.hasAttribute("data-gone")).toBe(true);
    expect(a.getAttribute("tabindex")).toBe("-1");
    run(150);
    expect(xOf(a)).not.toBe(before);
    run(3000);
    await settle();
    expect(landed).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { meld: "activities" } })
    );
    expect(button(element, "A")).toBeNull();
    expect(live(element)).toHaveLength(1);
  });

  it("keeps its room while the last card flies to its meld, then closes up", async () => {
    const element = await render([card("A")]);
    run(3000);
    const hand = element.shadowRoot.querySelector('[data-id="hand"]');
    const full = parseFloat(hand.style.height);
    expect(full).toBeGreaterThan(150);
    element.cards = [];
    await settle();
    run(300);
    expect(parseFloat(hand.style.height)).toBeCloseTo(full, 0);
    run(3000);
    await settle();
    run(3000);
    expect(parseFloat(hand.style.height)).toBeLessThan(20);
  });

  it("however narrow, each card keeps a strip a pointer can hit", async () => {
    jest
      .spyOn(HTMLElement.prototype, "clientWidth", "get")
      .mockImplementation(() => 320);
    const element = await render([card("A"), card("B"), card("C")]);
    run(3000);
    const xs = live(element).map(xOf);
    expect(xs[1] - xs[0]).toBeGreaterThanOrEqual(24);
  });

  it("moves the cursor to the next card when the card it was on is played", async () => {
    const element = await render([card("A"), card("B"), card("C")]);
    run(3000);
    button(element, "B").focus();
    element.cards = [card("A"), card("C")];
    await settle();
    expect(element.shadowRoot.activeElement).toBe(button(element, "C"));
  });

  it("when the last card with the cursor is played, asks Roots to take the cursor to its meld", async () => {
    const element = await render([card("A", "schedules")]);
    run(3000);
    const left = jest.fn();
    element.addEventListener("leftfocus", left);
    button(element, "A").focus();
    element.cards = [];
    await settle();
    expect(left).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { meld: "schedules" } })
    );
    run(3000);
    await settle();
    expect(
      element.shadowRoot.querySelector('[data-id="calm"]').textContent
    ).toBe("Nothing needs a look");
  });

  it("a card taken back mid-play comes back to the hand from where it is", async () => {
    const element = await render([card("A"), card("B")]);
    run(3000);
    element.cards = [card("B")];
    await settle();
    run(200);
    const midway = xOf(button(element, "A"));
    element.cards = [card("A"), card("B")];
    await settle();
    run(16);
    const a = button(element, "A");
    expect(a.hasAttribute("data-gone")).toBe(false);
    expect(Math.abs(xOf(a) - midway)).toBeLessThan(40);
  });

  it("with reduced motion nothing moves: cards are dealt and played at once", async () => {
    media.reduce = true;
    const element = await render([card("A"), card("B")]);
    frames.clear();
    expect(live(element)[0].style.opacity).toBe("");
    element.cards = [card("B")];
    await settle();
    expect(button(element, "A")).toBeNull();
    expect(frames.size).toBe(0);
    expect(
      element.shadowRoot
        .querySelector('[data-id="hand"]')
        .hasAttribute("data-alive")
    ).toBe(false);
  });

  it("tells Roots where a card is and lends its face to the sheet", async () => {
    const element = await render([card("A")]);
    run(3000);
    expect(element.hasCard("hand:A")).toBe(true);
    expect(element.hasCard("hand:Z")).toBe(false);
    const pose = element.cardPose("hand:A");
    expect(pose.w).toBe(204);
    expect(pose.x).toBeCloseTo(600, 0);
    element.showFace("hand:A", false);
    const face = button(element, "A").querySelector("[data-face]");
    expect(face.style.opacity).toBe("0");
    element.showFace("hand:A", true);
    expect(face.style.opacity).toBe("");
    expect(element.focusCard("hand:A")).toBe(true);
    expect(element.shadowRoot.activeElement).toBe(button(element, "A"));
  });

  it("is accessible", async () => {
    const element = await render([card("A"), card("B")]);
    run(3000);
    await expect(element).toBeAccessible();
  });
});
