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

  // CORE-6.5
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

  // CORE-6.5
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

  describe("Accept (decisions 16 and 43)", () => {
    // Swim under, Soccer over, one overlap and one spread line to look at.
    const SPREAD = {
      ...CHECKED,
      hasSpreadTargets: true,
      spread: ["Swim · Bunk 2: 1 more needed by Wednesday"],
      spreadBy: [
        { groupId: "g2", activityId: "a1", missing: 1, byDay: "Wednesday" }
      ]
    };
    const open = async (props) => {
      const element = render(props);
      await flush();
      word(element).click();
      await flush();
      return element;
    };
    const accepts = (element) =>
      qa(element, ".accept").map((b) => b.getAttribute("aria-label"));
    const keyOn = (target, key) =>
      target.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, composed: true })
      );

    it("an under, over or spread line has Accept; a clash between cells has none, as on the desktop", async () => {
      const element = await open({
        measure: measureWeek(SPREAD, ACTIVITIES, DAYS)
      });
      expect(accepts(element)).toEqual([
        "Accept: Swim, 1 of 4",
        "Accept: Soccer, 2 of 1, over",
        "Accept: Swim · Bunk 2: 1 more needed by Wednesday"
      ]);
      await expect(element).toBeAccessible();
    });

    it("Accept tucks the line away, says so, keeps the dropdown open, and focus moves to the next line", async () => {
      const element = await open();
      const accepted = jest.fn();
      element.addEventListener("accept", accepted);
      q(element, '.accept[data-key^="under|a1|"]').click();
      await flush();
      expect(q(element, 'button[data-activity="a1"]')).toBeNull();
      expect(accepted.mock.calls[0][0].detail).toMatchObject({
        id: "a1",
        placed: 1,
        goal: 4
      });
      expect(q(element, '[data-id="accept-said"]').textContent).toBe(
        "Accepted for this visit: Swim, 1 of 4."
      );
      expect(word(element).getAttribute("aria-expanded")).toBe("true");
      expect(element.shadowRoot.activeElement).toBe(
        q(element, 'button[data-activity="a2"]')
      );
      // The numbers stay the week's: the drawer shows the same ones.
      expect(text(q(element, '[data-id="under"]'))).toBe("3under");
    });

    it("the keyboard reaches Accept: Down from a line, Enter accepts it", async () => {
      const element = await open();
      const row = q(element, 'button[data-activity="a2"]');
      row.focus();
      keyOn(row, "ArrowDown");
      await flush();
      const accept = q(element, '.accept[data-key^="over|a2|"]');
      expect(element.shadowRoot.activeElement).toBe(accept);
      accept.click();
      await flush();
      expect(q(element, 'button[data-activity="a2"]')).toBeNull();
      // The next line: the one to look at.
      expect(element.shadowRoot.activeElement).toBe(q(element, ".look-row"));
    });

    it("the corner goes once every line is accepted; with none left, focus goes to the counter", async () => {
      const measure = measureWeek(
        { ...CHECKED, overlapping: [] },
        ACTIVITIES,
        DAYS
      );
      const element = await open({ measure });
      q(element, '.accept[data-key^="under|"]').click();
      await flush();
      expect(word(element).querySelector(".shoresh-look-mark")).not.toBeNull();
      q(element, '.accept[data-key^="over|"]').click();
      await flush();
      expect(word(element).querySelector(".shoresh-look-mark")).toBeNull();
      expect(word(element).getAttribute("aria-label")).toBe("4 of 10 placed");
      expect(pop(element).shadowRoot.activeElement).toBe(word(element));
    });

    it("a line whose numbers change comes back, and so does every line when a week is shown fresh", async () => {
      const element = await open();
      q(element, '.accept[data-key^="under|a1|"]').click();
      await flush();
      expect(q(element, 'button[data-activity="a1"]')).toBeNull();
      // Bunk 2 gets a Swim: 2 of 4 now, a different line.
      element.measure = measureWeek(
        {
          ...CHECKED,
          placements: [
            ...CHECKED.placements,
            { kind: "A", groupId: "g2", id: "a1" }
          ]
        },
        ACTIVITIES,
        DAYS
      );
      await flush();
      expect(text(q(element, 'button[data-activity="a1"]'))).toBe("Swim2of 4");
      q(element, '.accept[data-key^="under|a1|"]').click();
      await flush();
      expect(q(element, 'button[data-activity="a1"]')).toBeNull();
      element.resetKey = 2;
      await flush();
      word(element).click();
      await flush();
      expect(q(element, 'button[data-activity="a1"]')).not.toBeNull();
    });
  });
  describe("the Why list's Open cells and notes", () => {
    // Generated: the editor adds the Open cells (with the engine's words) and the lines with no
    // cell to the measure.
    const WHY = {
      ...MEASURE,
      open: [
        {
          key: "open|2026-06-29|g2|t3|No activity fits this gap",
          kind: "open",
          text: "Bunk 2 · Monday · Period 3: No activity fits this gap",
          groupId: "g2",
          dateValue: "2026-06-29",
          blockId: "t3"
        }
      ],
      notes: [
        {
          key: "note|Arts: Groups at once is blank, so it counts as 1",
          kind: "note",
          text: "Arts: Groups at once is blank, so it counts as 1"
        }
      ]
    };
    const opened = async () => {
      const element = render({ measure: WHY });
      await flush();
      word(element).click();
      await flush();
      return element;
    };

    it("Open comes first and notes last, each under its own word, with no count", async () => {
      const element = await opened();
      expect(text(q(element, '[data-id="open"]'))).toBe("Open");
      expect(text(q(element, '[data-id="notes"]'))).toBe("Notes");
      expect(qa(element, "[data-line]").map(text)).toEqual([
        "Bunk 2 · Monday · Period 3: No activity fits this gap",
        "Swim1of 4",
        "Soccer2of 1",
        "Bunk 1 · Monday · Period 2: Over its limit of 1 Bunk at once",
        // A note's row for focus is its Accept.
        "Accept"
      ]);
      expect(text(q(element, ".note"))).toBe(
        "Arts: Groups at once is blank, so it counts as 1"
      );
      await expect(element).toBeAccessible();
    });

    it("an Open cell takes the director there; a note names no cell, so it is not a button", async () => {
      const element = await opened();
      const located = [];
      element.addEventListener("locate", (e) => located.push(e.detail));
      // The first line is the Open cell's.
      q(element, ".look-row").click();
      expect(located).toEqual([
        expect.objectContaining({
          kind: "open",
          groupId: "g2",
          dateValue: "2026-06-29",
          blockId: "t3"
        })
      ]);
      expect(q(element, ".note").tagName).toBe("P");
    });

    it("both can be accepted for the visit", async () => {
      const element = await opened();
      const accept = (label) =>
        qa(element, ".accept")
          .find((b) => b.getAttribute("aria-label") === label)
          .click();
      accept("Accept: Bunk 2 · Monday · Period 3: No activity fits this gap");
      await flush();
      accept("Accept: Arts: Groups at once is blank, so it counts as 1");
      await flush();
      expect(q(element, '[data-id="open"]')).toBeNull();
      expect(q(element, '[data-id="notes"]')).toBeNull();
      expect(text(q(element, '[data-id="accept-said"]'))).toBe(
        "Accepted for this visit: Arts: Groups at once is blank, so it counts as 1."
      );
    });

    it("accepting the line before a note puts focus on the note's Accept, a row the keys work on", async () => {
      // No clash: the line before the note is Soccer's over row.
      const element = render({ measure: { ...WHY, look: [] } });
      await flush();
      word(element).click();
      await flush();
      const key = (k) =>
        element.shadowRoot.activeElement.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: k,
            bubbles: true,
            composed: true
          })
        );
      qa(element, ".accept")
        .find(
          (b) => b.getAttribute("aria-label") === "Accept: Soccer, 2 of 1, over"
        )
        .click();
      await flush();
      const noteAccept = () =>
        qa(element, ".accept").find(
          (b) =>
            b.getAttribute("aria-label") ===
            "Accept: Arts: Groups at once is blank, so it counts as 1"
        );
      expect(element.shadowRoot.activeElement).toBe(noteAccept());
      // Up moves to the row before it.
      key("ArrowUp");
      await flush();
      expect(element.shadowRoot.activeElement).not.toBe(noteAccept());
      key("ArrowDown");
      await flush();
      expect(element.shadowRoot.activeElement).toBe(noteAccept());
      // Escape closes the dropdown, focus back on the counter.
      key("Escape");
      await flush();
      expect(word(element).getAttribute("aria-expanded")).toBe("false");
    });

    it("an Open cell alone puts the corner on the counter", async () => {
      const element = render({
        measure: {
          ...measureWeek(
            { cells: { filled: 1, total: 2 }, placements: [] },
            [],
            DAYS
          ),
          open: WHY.open
        }
      });
      await flush();
      expect(word(element).querySelector(".shoresh-look-mark")).not.toBeNull();
    });
  });
});
