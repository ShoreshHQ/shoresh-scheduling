import { createElement } from "lwc";
import ShoreshWeekChecks from "c/shoreshWeekChecks";
import { measureWeek } from "c/shoreshEngine";
import readAccepted from "@salesforce/apex/WeekAccepts.accepted";
import keepAccepted from "@salesforce/apex/WeekAccepts.accept";

jest.mock(
  "@salesforce/apex/WeekAccepts.accepted",
  () => ({ default: jest.fn() }),
  {
    virtual: true
  }
);
jest.mock(
  "@salesforce/apex/WeekAccepts.accept",
  () => ({ default: jest.fn() }),
  {
    virtual: true
  }
);

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
  beforeEach(() => {
    // Nothing kept with the week unless a test says so.
    readAccepted.mockReset();
    readAccepted.mockResolvedValue("[]");
    keepAccepted.mockReset();
    keepAccepted.mockResolvedValue("[]");
  });
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
        "Accepted: Swim, 1 of 4."
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

    // A week whose Swim and Soccer counts are given: Swim needs 2 a bunk (goal 4), Soccer 1 a bunk.
    const swimSoccer = (swims, soccers, spread) =>
      measureWeek(
        {
          ...CHECKED,
          overlapping: [],
          placements: [
            ...swims.map((g) => ({ kind: "A", groupId: g, id: "a1" })),
            ...soccers.map((g) => ({ kind: "A", groupId: g, id: "a2" }))
          ],
          ...(spread || {})
        },
        ACTIVITIES,
        DAYS
      );
    const swimRow = (element) => q(element, 'button[data-activity="a1"]');
    const soccerRow = (element) => q(element, 'button[data-activity="a2"]');

    it("CORE-6.8: an accepted under line comes back when it gets worse, and stays away when the same or better", async () => {
      // Swim 2 of 4 accepted.
      const element = await open({ measure: swimSoccer(["g1", "g2"], []) });
      q(element, '.accept[data-key^="under|a1|"]').click();
      await flush();
      expect(swimRow(element)).toBeNull();
      // Better: 3 of 4. Still accepted.
      element.measure = swimSoccer(["g1", "g2", "g2"], []);
      await flush();
      expect(swimRow(element)).toBeNull();
      // Back to 2 of 4: the same as accepted. Still accepted.
      element.measure = swimSoccer(["g1", "g2"], []);
      await flush();
      expect(swimRow(element)).toBeNull();
      // Worse: 1 of 4. It comes back, no longer accepted.
      element.measure = swimSoccer(["g1"], []);
      await flush();
      expect(text(swimRow(element))).toBe("Swim1of 4");
      // Back to 2 of 4, what was accepted: tucked away again, as on the desktop.
      element.measure = swimSoccer(["g1", "g2"], []);
      await flush();
      expect(swimRow(element)).toBeNull();
    });

    it("CORE-6.8: an accepted over line comes back when further over, and stays away when the same or better", async () => {
      // Soccer 4 of 2, over by 2, accepted.
      const element = await open({
        measure: swimSoccer([], ["g1", "g1", "g2", "g2"])
      });
      expect(text(soccerRow(element))).toBe("Soccer4of 2");
      q(element, '.accept[data-key^="over|a2|"]').click();
      await flush();
      expect(soccerRow(element)).toBeNull();
      // Better: 3 of 2.
      element.measure = swimSoccer([], ["g1", "g1", "g2"]);
      await flush();
      expect(soccerRow(element)).toBeNull();
      // Worse: 5 of 2.
      element.measure = swimSoccer([], ["g1", "g1", "g1", "g2", "g2"]);
      await flush();
      expect(text(soccerRow(element))).toBe("Soccer5of 2");
    });

    it("CORE-6.8: an accepted early-week goal comes back when more is missing by its day", async () => {
      const by = (missing) => ({
        hasSpreadTargets: true,
        spread: [`Swim · Bunk 2: ${missing} more needed by Wednesday`],
        spreadBy: [
          { groupId: "g2", activityId: "a1", missing, byDay: "Wednesday" }
        ]
      });
      const element = await open({ measure: swimSoccer(["g1"], [], by(1)) });
      q(element, '.accept[data-key^="spread|"]').click();
      await flush();
      expect(q(element, ".look-row")).toBeNull();
      element.measure = swimSoccer(["g1"], [], by(2));
      await flush();
      expect(text(q(element, ".look-row"))).toContain(
        "2 more needed by Wednesday"
      );
    });

    // The week's accepts as kept with it (WeekAccepts), as the server stores them.
    const kept = (lines) =>
      JSON.stringify(lines.map(([k, s, n]) => ({ k, s, n })));

    it("CORE-6.9: an Accept is kept with the week, and a later visit reads it back: the line stays away", async () => {
      const element = await open({
        measure: swimSoccer(["g1", "g2"], []),
        scheduleId: "s1"
      });
      expect(readAccepted).toHaveBeenCalledWith({ scheduleId: "s1" });
      q(element, '.accept[data-key^="under|a1|"]').click();
      await flush();
      expect(keepAccepted).toHaveBeenCalledWith({
        scheduleId: "s1",
        line: JSON.stringify({ k: "under|a1|2|4", s: "under|a1", n: 2 })
      });
      document.body.removeChild(element);
      // Someone opens the week later: what was kept is read, and Swim 2 of 4 stays away.
      readAccepted.mockResolvedValue(kept([["under|a1|2|4", "under|a1", 2]]));
      const later = await open({
        measure: swimSoccer(["g1", "g2"], []),
        scheduleId: "s1"
      });
      expect(swimRow(later)).toBeNull();
    });

    it("CORE-6.9: a kept accept still comes back when the week is worse than when it was accepted (CORE-6.8)", async () => {
      readAccepted.mockResolvedValue(kept([["under|a1|2|4", "under|a1", 2]]));
      const worse = await open({
        measure: swimSoccer(["g1"], []),
        scheduleId: "s1"
      });
      expect(text(swimRow(worse))).toBe("Swim1of 4");
      document.body.removeChild(worse);
      const better = await open({
        measure: swimSoccer(["g1", "g2", "g2"], []),
        scheduleId: "s1"
      });
      expect(swimRow(better)).toBeNull();
    });

    it("CORE-6.9: an over line and an early-week goal are kept the same way", async () => {
      readAccepted.mockResolvedValue(
        kept([
          ["over|a2|4|2", "over|a2", 2],
          ["x", "spread|g2|a1|Wednesday", 1]
        ])
      );
      const element = await open({
        measure: swimSoccer(["g1"], ["g1", "g1", "g2", "g2"], {
          hasSpreadTargets: true,
          spread: ["Swim · Bunk 2: 1 more needed by Wednesday"],
          spreadBy: [
            { groupId: "g2", activityId: "a1", missing: 1, byDay: "Wednesday" }
          ]
        }),
        scheduleId: "s1"
      });
      expect(soccerRow(element)).toBeNull();
      expect(q(element, ".look-row")).toBeNull();
    });

    it("CORE-6.9: a rebuild (shown again with nothing kept) shows every line; another week's accepts never touch this one (CORE-6.8)", async () => {
      readAccepted.mockResolvedValue(kept([["under|a1|2|4", "under|a1", 2]]));
      const element = await open({
        measure: swimSoccer(["g1", "g2"], []),
        scheduleId: "s1"
      });
      expect(swimRow(element)).toBeNull();
      // Rebuilt: the server cleared the week's accepts, and the page shows it again.
      readAccepted.mockResolvedValue("[]");
      element.resetKey = 2;
      await flush();
      word(element).click();
      await flush();
      expect(swimRow(element)).not.toBeNull();
      // Another week, the same Swim numbers, nothing accepted there: this week's accept is not used.
      readAccepted.mockImplementation(({ scheduleId }) =>
        Promise.resolve(
          scheduleId === "s1" ? kept([["under|a1|2|4", "under|a1", 2]]) : "[]"
        )
      );
      element.scheduleId = "s2";
      await flush();
      expect(swimRow(element)).not.toBeNull();
    });

    it("CORE-6.9: an Accept that can't be kept says so", async () => {
      keepAccepted.mockRejectedValue(new Error("no access"));
      const element = await open({
        measure: swimSoccer(["g1", "g2"], []),
        scheduleId: "s1"
      });
      q(element, '.accept[data-key^="under|a1|"]').click();
      await flush();
      expect(q(element, '[data-id="accept-said"]').textContent).toBe(
        "Accepted until you leave this week, not kept with it: Swim, 2 of 4."
      );
    });
  });
  describe("the Why list's Open cells and notes", () => {
    // Generated: the editor adds the Open cells (with the engine's words) and the lines with no
    // cell to the measure.
    const WHY = {
      ...MEASURE,
      open: [
        {
          key: "open|2026-06-29|g2|t3|No activity fits here",
          kind: "open",
          text: "Bunk 2 · Monday · Period 3: No activity fits here",
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
        "Bunk 2 · Monday · Period 3: No activity fits here",
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
      accept("Accept: Bunk 2 · Monday · Period 3: No activity fits here");
      await flush();
      accept("Accept: Arts: Groups at once is blank, so it counts as 1");
      await flush();
      expect(q(element, '[data-id="open"]')).toBeNull();
      expect(q(element, '[data-id="notes"]')).toBeNull();
      expect(text(q(element, '[data-id="accept-said"]'))).toBe(
        "Accepted: Arts: Groups at once is blank, so it counts as 1."
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

  // CORE-6.4 CORE-1.33
  it("shows the week's measures under still needed: priorities met, then spread", async () => {
    const element = render({
      measure: {
        ...MEASURE,
        priorities: [
          { priority: "high", met: 9, total: 10 },
          { priority: "low", met: 4, total: 6 }
        ],
        spread: { days: 18, sessions: 20 }
      }
    });
    await flush();
    word(element).click();
    await flush();
    expect(text(q(element, '[data-id="priority-high"]'))).toBe(
      "High priority9of 10 minimums met"
    );
    expect(text(q(element, '[data-id="priority-low"]'))).toBe(
      "Low priority4of 6 minimums met"
    );
    expect(text(q(element, '[data-id="spread"]'))).toBe(
      "Spread across the week18of 20 on different days"
    );
  });
});
