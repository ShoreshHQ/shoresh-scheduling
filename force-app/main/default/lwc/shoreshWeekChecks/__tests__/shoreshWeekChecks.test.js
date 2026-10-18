import { createElement } from "lwc";
import ShoreshWeekChecks from "c/shoreshWeekChecks";

// The counters and the "Still to place" list on their own, given a checked week by hand (what
// c/shoreshEngine checkWeek returns). The screens' own tests cover them with the real engine.

const CHECKED = {
  cells: { filled: 4, total: 10 },
  overlapping: [
    {
      dateValue: "2026-06-29",
      groupId: "g1",
      blockId: "t2",
      rules: ["groupsAtOnce"],
      text: "Bunk 1 · Monday · Period 2: Over its limit of 1 Bunk at once"
    }
  ],
  stillNeeded: ["Swim · Bunk 1: 1 still needed"],
  stillNeededBy: [{ activityId: "a1", groupId: "g1", missing: 1 }],
  spread: [],
  spreadBy: [],
  hasCoverageTargets: true,
  hasSpreadTargets: false
};

const flush = () =>
  [...Array(5)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

function render(props = {}) {
  const element = createElement("c-shoresh-week-checks", {
    is: ShoreshWeekChecks
  });
  Object.assign(element, { checked: CHECKED, resetKey: 1, ...props });
  document.body.appendChild(element);
  return element;
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);
const lines = (element) =>
  [...element.shadowRoot.querySelectorAll(".line-text")].map((b) =>
    b.textContent.trim()
  );

describe("c-shoresh-week-checks", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("shows Filled, Overlapping and Still needed; Spread only with an early-week goal", async () => {
    const element = render();
    await flush();
    expect(q(element, '[data-id="filled"]').textContent).toContain("4 of 10");
    expect(q(element, '[data-counter="overlapping"]')).not.toBeNull();
    expect(q(element, '[data-counter="stillNeeded"]')).not.toBeNull();
    expect(q(element, '[data-counter="spread"]')).toBeNull();
    expect(element.route).toBe("manual");
  });

  it("a line raises locate with what it names, and the list closes", async () => {
    const element = render();
    const located = jest.fn();
    element.addEventListener("locate", located);
    q(element, '[data-counter="overlapping"]').click();
    await flush();
    element.shadowRoot.querySelector(".line-text").click();
    await flush();
    expect(located.mock.calls[0][0].detail).toMatchObject({
      kind: "overlapping",
      groupId: "g1",
      dateValue: "2026-06-29",
      blockId: "t2"
    });
    expect(q(element, '[data-id="counter-list"]')).toBeNull();
  });

  it("Accept hides the line, raises accept, and a new resetKey brings it back", async () => {
    const element = render();
    const accepted = jest.fn();
    element.addEventListener("accept", accepted);
    q(element, '[data-counter="stillNeeded"]').click();
    await flush();
    q(element, ".line-accept").click();
    await flush();
    expect(accepted.mock.calls[0][0].detail).toMatchObject({
      kind: "stillNeeded",
      groupId: "g1"
    });
    expect(lines(element)).toEqual([
      "Bunk 1 · Monday · Period 2: Over its limit of 1 Bunk at once"
    ]);
    element.resetKey = 2;
    await flush();
    expect(q(element, '[data-id="counter-list"]')).toBeNull();
    q(element, '[data-counter="stillNeeded"]').click();
    await flush();
    expect(lines(element)).toContain("Swim · Bunk 1: 1 still needed");
  });

  it("with nothing checked yet, shows zeros and no list", async () => {
    const element = render({ checked: null });
    await flush();
    expect(q(element, '[data-id="filled"]').textContent).toContain("0 of 0");
    expect(
      q(element, '[data-counter="overlapping"]').getAttribute("aria-disabled")
    ).toBe("true");
  });

  describe("the generated route", () => {
    const GENERATED = {
      ...CHECKED,
      openCells: [
        {
          dateValue: "2026-06-29",
          groupId: "g2",
          blockId: "t3",
          text: "Bunk 2 · Monday · Period 3: Already busy then"
        }
      ]
    };
    const generated = (props = {}) =>
      render({ checked: GENERATED, route: "generated", ...props });

    it("counts Open instead of Overlapping, lists Open cells first, and still lists overlaps", async () => {
      const element = generated();
      await flush();
      expect(q(element, '[data-counter="open"]')).not.toBeNull();
      expect(q(element, '[data-counter="overlapping"]')).toBeNull();
      q(element, '[data-id="review-all"]').click();
      await flush();
      expect(lines(element)).toEqual([
        "Bunk 2 · Monday · Period 3: Already busy then",
        "Bunk 1 · Monday · Period 2: Over its limit of 1 Bunk at once",
        "Swim · Bunk 1: 1 still needed"
      ]);
      expect(q(element, '[data-id="review-all"]').textContent.trim()).toBe(
        "Hide list"
      );
    });

    it("a counter shows only its lines and lights up their cells; again, it turns them off", async () => {
      const element = generated();
      const lit = jest.fn();
      element.addEventListener("highlight", lit);
      await flush();
      q(element, '[data-counter="stillNeeded"]').click();
      await flush();
      expect(lines(element)).toEqual(["Swim · Bunk 1: 1 still needed"]);
      const last = () => lit.mock.calls[lit.mock.calls.length - 1][0].detail;
      expect(last().kind).toBe("stillNeeded");
      expect(last().lines).toEqual([
        expect.objectContaining({ groupId: "g1", activityId: "a1" })
      ]);
      expect(
        q(element, '[data-counter="stillNeeded"]').getAttribute("aria-expanded")
      ).toBe("true");
      expect(
        q(element, '[data-counter="open"]').getAttribute("aria-expanded")
      ).toBe("false");

      q(element, '[data-counter="open"]').click();
      await flush();
      expect(lines(element)).toEqual([
        "Bunk 2 · Monday · Period 3: Already busy then"
      ]);
      expect(last()).toMatchObject({ kind: "open" });

      q(element, '[data-counter="open"]').click();
      await flush();
      expect(q(element, '[data-id="counter-list"]')).toBeNull();
      expect(last()).toEqual({ kind: null, lines: [] });
    });

    it("clicking a line, Close, or a new week turns the lit cells off", async () => {
      const element = generated();
      const lit = jest.fn();
      element.addEventListener("highlight", lit);
      const last = () => lit.mock.calls[lit.mock.calls.length - 1][0].detail;
      await flush();
      q(element, '[data-counter="open"]').click();
      await flush();
      element.shadowRoot.querySelector(".line-text").click();
      await flush();
      expect(last().kind).toBeNull();

      q(element, '[data-counter="open"]').click();
      await flush();
      q(element, '[data-id="close-list"]').click();
      await flush();
      expect(last().kind).toBeNull();

      q(element, '[data-counter="open"]').click();
      await flush();
      element.resetKey = 9;
      await flush();
      expect(last().kind).toBeNull();
    });

    it("lit cells follow the lines when the week is read again", async () => {
      const element = generated();
      const lit = jest.fn();
      element.addEventListener("highlight", lit);
      await flush();
      q(element, '[data-counter="open"]').click();
      await flush();
      element.checked = {
        ...GENERATED,
        openCells: [
          ...GENERATED.openCells,
          {
            dateValue: "2026-06-30",
            groupId: "g1",
            blockId: "t1",
            text: "Bunk 1 · Tuesday · Period 1"
          }
        ]
      };
      await flush();
      const last = lit.mock.calls[lit.mock.calls.length - 1][0].detail;
      expect(last.kind).toBe("open");
      expect(last.lines.map((l) => l.blockId)).toEqual(["t3", "t1"]);
    });

    it("Accept takes the line's cells out of the lit ones", async () => {
      const element = generated();
      const lit = jest.fn();
      element.addEventListener("highlight", lit);
      await flush();
      q(element, '[data-counter="stillNeeded"]').click();
      await flush();
      q(element, ".line-accept").click();
      await flush();
      const last = lit.mock.calls[lit.mock.calls.length - 1][0].detail;
      expect(last.lines).toEqual([]);
    });

    it("the manual route is unchanged: no Open counter, no Review all, no highlight", async () => {
      const element = render({ checked: GENERATED });
      const lit = jest.fn();
      element.addEventListener("highlight", lit);
      await flush();
      expect(q(element, '[data-counter="open"]')).toBeNull();
      expect(q(element, '[data-id="review-all"]')).toBeNull();
      q(element, '[data-counter="stillNeeded"]').click();
      await flush();
      expect(lines(element)).toEqual([
        "Bunk 1 · Monday · Period 2: Over its limit of 1 Bunk at once",
        "Swim · Bunk 1: 1 still needed"
      ]);
      expect(lit).not.toHaveBeenCalled();
    });
  });
});
