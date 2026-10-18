import { createElement } from "lwc";
import ShoreshManualBuild from "c/shoreshManualBuild";
import getDraft from "@salesforce/apex/ManualBuildController.getDraft";
import saveSlots from "@salesforce/apex/ManualBuildController.saveSlots";
import addActivity from "@salesforce/apex/ManualBuildController.addActivity";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";
import { day, draft, schedule } from "./data/draftFixture";

// The counters and the bronze dots on the Manual Build screen (c/shoreshEngine's checkWeek does
// the working out; its checks.test.js covers every rule). Synthetic camp: draftFixture, with the setup below.

const apex = () => ({ default: jest.fn() });
jest.mock("@salesforce/apex/ManualBuildController.getDraft", () => apex(), {
  virtual: true
});
jest.mock(
  "@salesforce/apex/ManualBuildController.startBlankWeek",
  () => apex(),
  { virtual: true }
);
jest.mock("@salesforce/apex/ManualBuildController.saveSlots", () => apex(), {
  virtual: true
});
jest.mock("@salesforce/apex/ManualBuildController.addActivity", () => apex(), {
  virtual: true
});

// Swim: 1 to 2 a week. Soccer: 2 to 3 a week, one bunk at a time. Both bunks are in Juniors.
const SETUP = nsRecord({
  season: { Id: "se1", Name: "Summer 2026" },
  weeks: [{ Id: "w1", Name: "Week 1" }],
  programs: [
    {
      program: { Id: "p1", Name: "Main" },
      divisions: [
        {
          division: { Id: "dv1", Name: "Juniors" },
          groups: [
            { Id: "g1", Name: "Bunk 1", Division__c: "dv1" },
            { Id: "g2", Name: "Bunk 2", Division__c: "dv1" }
          ]
        }
      ],
      fixedActivities: [{ Id: "f1", Name: "Flagpole", Location__c: null }],
      recurringActivities: []
    }
  ],
  activities: [
    {
      Id: "a1",
      Name: "Swim",
      TimesPerWeekMin__c: 1,
      TimesPerWeekMax__c: 2,
      NoGroupLimit__c: true
    },
    {
      Id: "a3",
      Name: "Soccer",
      TimesPerWeekMin__c: 2,
      TimesPerWeekMax__c: 3,
      GroupsAtOnce__c: 1,
      NoGroupLimit__c: false
    }
  ],
  locations: []
});
// The same camp with no weekly minimums set (so Still needed has nothing to count).
const NO_MINIMUMS = nsRecord({
  ...SETUP,
  activities: SETUP.activities.map((a) => {
    return { ...a, TimesPerWeekMin__c: 0 };
  })
});
const LABELS = [
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true },
  { term: "TimeBlock", singular: "Period", plural: "Periods", isCustom: true }
];
const FLAGPOLE = { kind: "F", id: "f1", name: "Flagpole", gone: false };
const SWIM = { kind: "A", id: "a1", name: "Swim", gone: false };
const SOCCER = { kind: "A", id: "a3", name: "Soccer", gone: false };

const flush = () =>
  [...Array(10)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

async function render(start, setup = SETUP) {
  // The server sends the season's activity and location records with the week.
  getDraft.mockResolvedValue({
    ...start,
    activityRecords: setup.activities,
    locationRecords: setup.locations
  });
  saveSlots.mockImplementation(() =>
    Promise.resolve({ conflicts: [], schedule: start.schedule })
  );
  const element = createElement("c-shoresh-manual-build", {
    is: ShoreshManualBuild
  });
  element.terms = buildTerms(LABELS);
  element.setup = setup;
  document.body.appendChild(element);
  await flush();
  return element;
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);
const cell = (element, key) =>
  q(element, '[data-id="edit-grid"]').shadowRoot.querySelector(
    `[data-cell="${key}"]`
  );
const dotIn = (element, key) =>
  cell(element, key).querySelector("c-shoresh-dot");
const tipIn = (element, key) =>
  dotIn(element, key).shadowRoot.querySelector('[data-id="dot-tip"]');
/** A counter tile as read: its number, then its words. */
const tile = (el) =>
  [...el.querySelectorAll("span")].map((span) => span.textContent).join(" ");
const counters = (element) =>
  [...q(element, '[data-id="counters"]').querySelectorAll("button")].map(tile);
const listLines = (element) =>
  [
    ...q(element, '[data-id="counter-list"]').querySelectorAll(".line-text")
  ].map((b) => b.textContent.trim());
const lineButton = (element, text) =>
  [
    ...q(element, '[data-id="counter-list"]').querySelectorAll(".line-text")
  ].find((b) => b.textContent.trim() === text);
const acceptButton = (element, text) =>
  q(element, `[data-id="counter-list"] [aria-label="Accept: ${text}"]`);

/** Bunk 1's week in Group View (columns are days): Monday's items and rows, then Tuesday's. */
async function bunkOneWeek(monday, tuesday, setup) {
  const start = draft(...monday);
  start.schedule.days[1] = day("2026-06-30", ...tuesday);
  const element = await render(start, setup);
  q(element, '[data-view="group"]').click();
  await flush();
  return element;
}

async function press(target, key, extra = {}) {
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      composed: true,
      ...extra
    })
  );
  await flush();
}

describe("c-shoresh-manual-build: checks and counters", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("two bunks at Soccer at once: a dot on each, with the words, and two cells overlapping", async () => {
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,2,", "1,2,"]));
    expect(dotIn(element, "0-1").label).toBe(
      "Over its limit of 1 Bunk at once"
    );
    expect(dotIn(element, "1-1").label).toBe(
      "Over its limit of 1 Bunk at once"
    );
    // Fixed activities and Open cells have none.
    expect(dotIn(element, "0-0")).toBeNull();
    expect(dotIn(element, "0-2")).toBeNull();
    // As the desktop counts it: each cell that overlaps (a bunk in a time block).
    expect(counters(element)).toEqual(["2 Overlapping", "3 Still needed"]);
  });

  it("any counter opens the one list, overlaps first; again, or Close, closes it", async () => {
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,2,", "1,2,"]));
    const overlapping = q(element, '[data-counter="overlapping"]');
    expect(overlapping.getAttribute("aria-expanded")).toBe("false");
    overlapping.click();
    await flush();
    expect(overlapping.getAttribute("aria-expanded")).toBe("true");
    expect(
      q(element, '[data-counter="stillNeeded"]').getAttribute("aria-expanded")
    ).toBe("true");
    expect(
      q(element, '[data-id="counter-list"] ul').getAttribute("aria-label")
    ).toBe("Still to place");
    expect(listLines(element)).toEqual([
      "Bunk 1 · Monday · Period 2: Over its limit of 1 Bunk at once",
      "Bunk 2 · Monday · Period 2: Over its limit of 1 Bunk at once",
      "Swim · Bunk 1: 1 still needed",
      "Soccer · Bunk 1: 1 still needed",
      "Soccer · Bunk 2: 1 still needed"
    ]);
    q(element, '[data-counter="stillNeeded"]').click();
    await flush();
    expect(q(element, '[data-id="counter-list"]')).toBeNull();
    overlapping.click();
    await flush();
    q(element, '[data-id="close-list"]').click();
    await flush();
    expect(q(element, '[data-id="counter-list"]')).toBeNull();
  });

  it("Filled counts cells filled of those to fill: not the fixed ones, not where a bunk is away", async () => {
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,2,", "1,2,"]));
    // Two days; Bunk 1 has Period 2 and Lunch to fill, Bunk 2 only Period 2 (away at Lunch).
    expect(tile(q(element, '[data-id="filled"]'))).toBe("2 of 6 Filled");
  });

  it("a placement for a bunk it isn't set up for gets the dot", async () => {
    const element = await render(draft([FLAGPOLE, SWIM], ["1,,", "1,2,"]));
    expect(dotIn(element, "1-1").label).toBe("Not set up for Bunk 2");
  });

  it("the dot's words show while its cell has keyboard focus", async () => {
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,2,", "1,2,"]));
    expect(dotIn(element, "0-1").open).toBe(false);
    cell(element, "0-1").dispatchEvent(
      new CustomEvent("focusin", { bubbles: true, composed: true })
    );
    await flush();
    expect(dotIn(element, "0-1").open).toBe(true);
    expect(dotIn(element, "1-1").open).toBe(false);
  });

  it("the dot and the overlap go as soon as the cause moves", async () => {
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,2,", "1,2,"]));
    saveSlots.mockResolvedValueOnce({
      conflicts: [],
      schedule: schedule([FLAGPOLE, SOCCER], ["1,2,", "1,,"])
    });
    await press(cell(element, "1-1"), "Delete");
    expect(dotIn(element, "0-1")).toBeNull();
    expect(counters(element)).toEqual(["0 Overlapping", "3 Still needed"]);
  });

  it("a counter at zero shows grey and opens nothing; one with no targets set isn't shown", async () => {
    const element = await render(
      draft([FLAGPOLE, SWIM, SOCCER], ["1,2,3", "1,3,"])
    );
    // Nothing overlaps; no activity has an early-week goal, so Spread isn't shown (desktop).
    expect(counters(element)).toEqual(["0 Overlapping", "2 Still needed"]);
    const overlapping = q(element, '[data-counter="overlapping"]');
    expect(overlapping.disabled).toBe(true);
    expect(overlapping.hasAttribute("aria-expanded")).toBe(false);
    expect(overlapping.className).not.toContain("counter_due");
    expect(q(element, '[data-counter="stillNeeded"]').className).toContain(
      "counter_due"
    );
    expect(q(element, '[data-counter="spread"]')).toBeNull();
  });

  it("Still needed isn't shown when no activity has a weekly minimum", async () => {
    const element = await render(
      draft([FLAGPOLE, SOCCER], ["1,2,", "1,,"]),
      NO_MINIMUMS
    );
    expect(counters(element)).toEqual(["0 Overlapping"]);
  });

  it("one Escape on a cell with a dot hides the words and lets go of what was picked up", async () => {
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,2,", "1,2,"]));
    cell(element, "0-1").dispatchEvent(
      new CustomEvent("focusin", { bubbles: true, composed: true })
    );
    await press(cell(element, "0-1"), " ");
    expect(cell(element, "0-1").className).toContain("cell_picked");
    expect(tipIn(element, "0-1").textContent).toBe(
      "Over its limit of 1 Bunk at once"
    );
    await press(cell(element, "0-1"), "Escape");
    expect(cell(element, "0-1").className).not.toContain("cell_picked");
    expect(tipIn(element, "0-1")).toBeNull();
  });

  it("the words follow real keyboard focus from cell to cell, and go when focus leaves the grid", async () => {
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,2,", "1,2,"]));
    cell(element, "0-1").focus();
    await flush();
    expect(dotIn(element, "0-1").open).toBe(true);
    cell(element, "1-1").focus();
    await flush();
    expect(dotIn(element, "0-1").open).toBe(false);
    expect(dotIn(element, "1-1").open).toBe(true);
    cell(element, "1-1").blur();
    await flush();
    expect(dotIn(element, "1-1").open).toBe(false);
  });

  it("the list closes when nothing is left to list, and doesn't open again by itself", async () => {
    // No minimums: only the overlap is listed.
    const element = await render(
      draft([FLAGPOLE, SOCCER], ["1,2,", "1,2,"]),
      NO_MINIMUMS
    );
    q(element, '[data-counter="overlapping"]').click();
    await flush();
    expect(q(element, '[data-id="counter-list"]')).not.toBeNull();
    saveSlots.mockResolvedValueOnce({
      conflicts: [],
      schedule: schedule([FLAGPOLE, SOCCER], ["1,2,", "1,,"])
    });
    await press(cell(element, "1-1"), "Delete");
    expect(q(element, '[data-id="counter-list"]')).toBeNull();
    // The clash comes back (Undo): its counter counts again, the list stays closed.
    saveSlots.mockResolvedValueOnce({
      conflicts: [],
      schedule: schedule([FLAGPOLE, SOCCER], ["1,2,", "1,2,"])
    });
    await press(cell(element, "1-1"), "z", { ctrlKey: true });
    expect(counters(element)).toEqual(["2 Overlapping"]);
    expect(q(element, '[data-id="counter-list"]')).toBeNull();
  });

  it("over its weekly limit: only the session past the limit gets the dot, the latest in the week", async () => {
    // Swim at most once a week: Monday's is fine, Tuesday's is the extra one (Greg, 2026-10-17).
    const onceAWeek = nsRecord({
      ...SETUP,
      activities: SETUP.activities.map((a) => {
        return a.Id === "a1" ? { ...a, TimesPerWeekMax__c: 1 } : a;
      })
    });
    const element = await bunkOneWeek(
      [
        [FLAGPOLE, SWIM],
        ["1,2,", "1,,"]
      ],
      [
        [FLAGPOLE, SWIM],
        ["1,2,", "1,,"]
      ],
      onceAWeek
    );
    expect(dotIn(element, "0-1")).toBeNull();
    expect(dotIn(element, "1-1").label).toBe("Over its weekly limit");
  });

  it("the extra session is the latest one that day too; twice in a day still dots both", async () => {
    // Swim at most twice: Monday Period 2, then Tuesday Period 2 and Lunch. Lunch is the extra one.
    const element = await bunkOneWeek(
      [
        [FLAGPOLE, SWIM],
        ["1,2,", "1,,"]
      ],
      [
        [FLAGPOLE, SWIM],
        ["1,2,2", "1,,"]
      ]
    );
    expect(dotIn(element, "0-1")).toBeNull();
    expect(dotIn(element, "1-1").label).toBe("Twice in a day");
    expect(dotIn(element, "1-2").label).toBe(
      "Over its weekly limit · Twice in a day"
    );
  });

  it("an activity added from a slot is checked at once, from the record the server sends back", async () => {
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,2,", "1,,"]));
    // Kayak is new: the setup this page was given doesn't have it.
    addActivity.mockResolvedValue({
      id: "a7",
      name: "Kayak",
      length: 1,
      minPerWeek: 1,
      maxPerWeek: 1,
      notFor: [],
      record: nsRecord({
        Id: "a7",
        Name: "Kayak",
        TimesPerWeekMin__c: 1,
        TimesPerWeekMax__c: 1,
        GroupsAtOnce__c: 1,
        NoGroupLimit__c: false
      })
    });
    const kayak = { kind: "A", id: "a7", name: "Kayak", gone: false };
    saveSlots.mockResolvedValueOnce({
      conflicts: [],
      schedule: schedule([FLAGPOLE, SOCCER, kayak], ["1,2,", "1,3,"])
    });
    await press(cell(element, "1-1"), "Enter");
    const input = q(element, '[data-id="slot-input"]');
    input.value = "Kayak";
    input.dispatchEvent(new CustomEvent("input"));
    await flush();
    await press(input, "Enter");
    q(element, '[data-counter="stillNeeded"]').click();
    await flush();
    expect(listLines(element)).toContain("Kayak · Bunk 1: 1 still needed");
  });

  it("Accept hides a still needed line for this visit; it comes back when its numbers change", async () => {
    // No overlap here: Soccer for Bunk 1 on Monday only.
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,2,", "1,,"]));
    q(element, '[data-counter="stillNeeded"]').click();
    await flush();
    expect(listLines(element)).toEqual([
      "Swim · Bunk 1: 1 still needed",
      "Soccer · Bunk 1: 1 still needed",
      "Soccer · Bunk 2: 2 still needed"
    ]);
    acceptButton(element, "Soccer · Bunk 1: 1 still needed").click();
    await flush();
    expect(listLines(element)).toEqual([
      "Swim · Bunk 1: 1 still needed",
      "Soccer · Bunk 2: 2 still needed"
    ]);
    expect(counters(element)).toEqual(["0 Overlapping", "2 Still needed"]);
    // Bunk 1's Soccer is cleared: its line now says 2, a different line, so it shows again.
    saveSlots.mockResolvedValueOnce({
      conflicts: [],
      schedule: schedule([FLAGPOLE, SOCCER], ["1,,", "1,,"])
    });
    await press(cell(element, "0-1"), "Delete");
    expect(counters(element)).toEqual(["0 Overlapping", "3 Still needed"]);
    expect(listLines(element)).toContain("Soccer · Bunk 1: 2 still needed");
  });

  it("a line takes you to its bunk's week; an overlap's line puts focus on its cell", async () => {
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,2,", "1,2,"]));
    q(element, '[data-counter="stillNeeded"]').click();
    await flush();
    lineButton(element, "Soccer · Bunk 2: 1 still needed").click();
    await flush();
    expect(q(element, '[data-id="counter-list"]')).toBeNull();
    expect(q(element, '[data-view="group"]').className).toContain("on");
    expect(
      q(element, '[data-id="edit-grid"]').getAttribute("aria-label") ||
        q(element, '[data-id="edit-grid"]').label
    ).toBe("Bunk 2");
    q(element, '[data-counter="overlapping"]').click();
    await flush();
    lineButton(
      element,
      "Bunk 1 · Monday · Period 2: Over its limit of 1 Bunk at once"
    ).click();
    await flush();
    expect(q(element, '[data-id="edit-grid"]').label).toBe("Bunk 1");
    // Group View: Monday's column, Period 2.
    expect(
      q(element, '[data-id="edit-grid"]').shadowRoot.activeElement.dataset.cell
    ).toBe("0-1");
  });
});
