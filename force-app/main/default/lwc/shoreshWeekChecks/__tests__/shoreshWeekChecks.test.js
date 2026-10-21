import { createElement } from "lwc";
import ShoreshWeekChecks from "c/shoreshWeekChecks";
import { measureWeek } from "c/shoreshEngine";

// The rail's counter on its own, given a week's measure (c/shoreshEngine measureWeek of a checked
// week made by hand). The screens' own tests cover it with the real engine.

const DAYS = [{ groups: [{ id: "g1" }, { id: "g2" }] }];
const ACTIVITIES = [
  { id: "a1", name: "Swim", minPerWeek: 2, maxPerWeek: null, notFor: [] },
  { id: "a2", name: "Soccer", minPerWeek: 0, maxPerWeek: 1, notFor: [] }
];
const CHECKED = {
  cells: { filled: 4, total: 10 },
  placements: [
    { kind: "A", groupId: "g1", id: "a1" },
    { kind: "A", groupId: "g1", id: "a2" },
    { kind: "A", groupId: "g1", id: "a2" },
    { kind: "A", groupId: "g2", id: "a2" }
  ],
  overlapping: [
    {
      dateValue: "2026-06-29",
      groupId: "g1",
      blockId: "t2",
      rules: ["groupsAtOnce"],
      text: "Bunk 1 · Monday · Period 2: Over its limit of 1 Bunk at once"
    }
  ],
  spread: [],
  spreadBy: [],
  hasSpreadTargets: false
};
const MEASURE = measureWeek(CHECKED, ACTIVITIES, DAYS);

const flush = () =>
  [...Array(5)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

function render(props = {}) {
  const element = createElement("c-shoresh-week-checks", {
    is: ShoreshWeekChecks
  });
  Object.assign(element, { measure: MEASURE, resetKey: 1, ...props });
  document.body.appendChild(element);
  return element;
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);
const qa = (element, selector) => [
  ...element.shadowRoot.querySelectorAll(selector)
];
const pop = (element) => q(element, '[data-id="counter"]');
const word = (element) =>
  pop(element).shadowRoot.querySelector('[data-id="button"]');
const text = (el) => el.textContent.replace(/\s+/g, " ").trim();

describe("c-shoresh-week-checks: the counter", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("is one rail item, '4 of 10 placed', with the corner when anything is off target", async () => {
    const element = render();
    await flush();
    expect(text(word(element))).toBe("4of 10 placed");
    expect(word(element).querySelector("b").textContent).toBe("4");
    expect(word(element).querySelector(".shoresh-look-mark")).not.toBeNull();
    expect(word(element).getAttribute("aria-label")).toBe(
      "4 of 10 placed, needs a look"
    );
    expect(word(element).querySelector(".shoresh-chevron")).not.toBeNull();
    // Never raised while closed.
    expect(word(element).className).not.toContain("raised");
  });

  it("no corner when everything is on target", async () => {
    const element = render({
      measure: measureWeek(
        { cells: { filled: 2, total: 2 }, placements: [] },
        [],
        DAYS
      )
    });
    await flush();
    expect(word(element).querySelector(".shoresh-look-mark")).toBeNull();
    expect(word(element).getAttribute("aria-label")).toBe("2 of 2 placed");
  });

  it("opens: the bar, still needed, under, over, and what else needs a look", async () => {
    const element = render();
    await flush();
    word(element).click();
    await flush();
    expect(word(element).getAttribute("aria-expanded")).toBe("true");
    expect(q(element, ".bar-fill").getAttribute("style")).toBe("width: 40%;");
    expect(text(q(element, '[data-id="still-needed"]'))).toBe("6still needed");
    // Swim: two a week for two bunks; Bunk 1 has one, Bunk 2 none: 1 of 4, 3 under.
    expect(text(q(element, '[data-id="under"]'))).toBe("3under");
    const under = qa(element, 'ul[aria-labelledby] button[data-activity="a1"]');
    expect(under.map(text)).toEqual(["Swim1of 4"]);
    expect(under[0].getAttribute("aria-label")).toBe("Swim: 1 of 4");
    // Soccer: one a week at most, Bunk 1 has two: 2 of 1, 1 over, with the corner.
    expect(text(q(element, '[data-id="over"]'))).toBe("1over");
    const over = q(element, 'button[data-activity="a2"]');
    expect(text(over)).toBe("Soccer2of 1");
    expect(over.querySelector(".shoresh-look-mark")).not.toBeNull();
    expect(over.getAttribute("aria-label")).toBe("Soccer: 2 of 1, over");
    expect(text(q(element, '[data-id="look"]'))).toBe("1to look at");
    expect(qa(element, ".look-row").map(text)).toEqual([
      "Bunk 1 · Monday · Period 2: Over its limit of 1 Bunk at once"
    ]);
    await expect(element).toBeAccessible();
  });

  it("under and over show their 0 when the camp has goals and limits; nothing to look at shows nothing", async () => {
    const element = render({
      measure: measureWeek(
        {
          cells: { filled: 2, total: 2 },
          placements: [
            { kind: "A", groupId: "g1", id: "a1" },
            { kind: "A", groupId: "g1", id: "a1" },
            { kind: "A", groupId: "g2", id: "a1" },
            { kind: "A", groupId: "g2", id: "a1" }
          ]
        },
        ACTIVITIES,
        DAYS
      )
    });
    await flush();
    expect(text(q(element, '[data-id="under"]'))).toBe("0under");
    expect(text(q(element, '[data-id="over"]'))).toBe("0over");
    expect(q(element, '[data-id="look"]')).toBeNull();
  });

  it("without goals or limits there is no under or over", async () => {
    const element = render({
      measure: measureWeek(
        { cells: { filled: 1, total: 2 }, placements: [] },
        [],
        DAYS
      )
    });
    await flush();
    expect(q(element, '[data-id="under"]')).toBeNull();
    expect(q(element, '[data-id="over"]')).toBeNull();
  });

  it("an under or over row shows that activity, and the dropdown closes on the counter", async () => {
    const element = render();
    const shown = [];
    element.addEventListener("showactivity", (e) => shown.push(e.detail));
    await flush();
    word(element).click();
    await flush();
    q(element, 'button[data-activity="a2"]').click();
    await flush();
    expect(shown).toEqual([{ activityId: "a2" }]);
    expect(word(element).getAttribute("aria-expanded")).toBe("false");
    expect(pop(element).shadowRoot.activeElement).toBe(word(element));
  });

  it("a line to look at takes the director there", async () => {
    const element = render();
    const located = [];
    element.addEventListener("locate", (e) => located.push(e.detail));
    await flush();
    word(element).click();
    await flush();
    q(element, ".look-row").click();
    expect(located).toEqual([
      expect.objectContaining({
        kind: "overlapping",
        groupId: "g1",
        dateValue: "2026-06-29",
        blockId: "t2"
      })
    ]);
  });

  it("Escape closes it, with focus back on the counter", async () => {
    const element = render();
    await flush();
    word(element).click();
    await flush();
    const row = q(element, 'button[data-activity="a1"]');
    row.focus();
    row.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        composed: true
      })
    );
    await flush();
    expect(word(element).getAttribute("aria-expanded")).toBe("false");
    expect(pop(element).shadowRoot.activeElement).toBe(word(element));
  });

  it("a week shown fresh closes it", async () => {
    const element = render();
    await flush();
    word(element).click();
    await flush();
    element.resetKey = 2;
    await flush();
    expect(word(element).getAttribute("aria-expanded")).toBe("false");
  });

  it("before a week is measured: 0 of 0 placed", async () => {
    const element = render({ measure: null });
    await flush();
    expect(text(word(element))).toBe("0of 0 placed");
  });
});
