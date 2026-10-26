import { createElement } from "lwc";
import ShoreshManualBuild from "c/shoreshManualBuild";
import getDraft from "@salesforce/apex/ManualBuildController.getDraft";
import saveSlots from "@salesforce/apex/ManualBuildController.saveSlots";
import addActivity from "@salesforce/apex/ManualBuildController.addActivity";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";
import { find } from "shoresh-jest/week-editor";
import {
  day,
  draft,
  schedule
} from "../../shoreshWeekEditor/__tests__/data/draftFixture";

// The counters and the Why list on the Manual Build screen (nothing from the checks is on the
// grid: wiki engine care plan Q18) (c/shoreshEngine's checkWeek does
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

/**
 * A draft as the server sends it: with the season's activity and location records, the program's
 * groups (with their divisions), and its fixed and recurring activities.
 */
function withRecords(start, setup = SETUP) {
  const program = setup.programs[0];
  return {
    ...start,
    activityRecords: setup.activities,
    locationRecords: setup.locations,
    groupRecords: program.divisions.flatMap((d) => d.groups),
    fixedActivityRecords: program.fixedActivities,
    recurringActivityRecords: program.recurringActivities
  };
}

async function render(start, setup = SETUP) {
  // The server sends the season's activity and location records with the week.
  getDraft.mockResolvedValue(withRecords(start, setup));
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

const q = (element, selector) => find(element, selector);
// Inside the counters and their list (c-shoresh-week-checks).
const qc = (element, selector) => {
  const checks = q(element, "c-shoresh-week-checks");
  return checks ? checks.shadowRoot.querySelector(selector) : null;
};
const cell = (element, key) =>
  q(element, '[data-id="edit-grid"]').shadowRoot.querySelector(
    `[data-cell="${key}"]`
  );
// Nothing from the checks is drawn on a cell (wiki engine care plan Q18).
const dotIn = (element, key) =>
  cell(element, key).querySelector("c-shoresh-dot");
const said = (el) => el.textContent.replace(/\s+/g, " ").trim();
/** The rail's counter (c-shoresh-week-checks): its word, and what it says ("2of 6 placed"). */
const counterWord = (element) =>
  qc(element, '[data-id="counter"]').shadowRoot.querySelector(
    '[data-id="button"]'
  );
const counter = (element) => said(counterWord(element));
async function openCounter(element) {
  if (counterWord(element).getAttribute("aria-expanded") !== "true") {
    counterWord(element).click();
    await flush();
  }
}
/** The dropdown's counts, as read: still needed, then under, over and to look at when shown. */
const heads = (element) =>
  ["still-needed", "under", "over", "look"]
    .map((id) => qc(element, `[data-id="${id}"]`))
    .filter(Boolean)
    .map(said);
const qcAll = (element, selector) => {
  const checks = q(element, "c-shoresh-week-checks");
  return checks ? [...checks.shadowRoot.querySelectorAll(selector)] : [];
};
/** The under and over rows: each activity, then "placed of goal". */
const activityRows = (element) =>
  qcAll(element, "button[data-activity]").map(said);
const listLines = (element) => qcAll(element, ".look-row").map(said);
/** The Why list's lines to look at, the counter's dropdown opened. */
async function whyLines(element) {
  await openCounter(element);
  return listLines(element);
}
const lineButton = (element, text) =>
  qcAll(element, ".look-row").find((b) => said(b) === text);
const activityRow = (element, name) =>
  qcAll(element, "button[data-activity]").find((b) => said(b).startsWith(name));

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

  it("two bunks at Soccer at once: nothing on the grid, two cells to look at", async () => {
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,2,", "1,2,"]));
    expect(dotIn(element, "0-1")).toBeNull();
    expect(dotIn(element, "1-1")).toBeNull();
    expect(dotIn(element, "0-0")).toBeNull();
    expect(dotIn(element, "0-2")).toBeNull();
    // As the desktop counts it: each cell that overlaps (a bunk in a time block). Swim (once a
    // week for Bunk 1) and Soccer (twice for each bunk) are 3 short.
    await openCounter(element);
    expect(heads(element)).toEqual([
      "4still needed",
      "3under",
      "0over",
      "2to look at"
    ]);
  });

  it("the counter opens its dropdown: under and over by activity, then the cells to look at; again, it closes", async () => {
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,2,", "1,2,"]));
    expect(counterWord(element).getAttribute("aria-expanded")).toBe("false");
    counterWord(element).click();
    await flush();
    expect(counterWord(element).getAttribute("aria-expanded")).toBe("true");
    expect(activityRows(element)).toEqual(["Swim0of 1", "Soccer2of 4"]);
    expect(listLines(element)).toEqual([
      "Bunk 1 · Monday · Period 2: Over its limit of 1 Bunk at once",
      "Bunk 2 · Monday · Period 2: Over its limit of 1 Bunk at once"
    ]);
    counterWord(element).click();
    await flush();
    expect(counterWord(element).getAttribute("aria-expanded")).toBe("false");
  });

  it("placed counts cells filled of those to fill: not the fixed ones, not where a bunk is away", async () => {
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,2,", "1,2,"]));
    // Two days; Bunk 1 has Period 2 and Lunch to fill, Bunk 2 only Period 2 (away at Lunch).
    expect(counter(element)).toBe("2of 6 placed");
    expect(counterWord(element).getAttribute("aria-label")).toBe(
      "2 of 6 placed, needs a look"
    );
  });

  it("a placement for a bunk it isn't set up for is a line to look at, not a dot", async () => {
    const element = await render(draft([FLAGPOLE, SWIM], ["1,,", "1,2,"]));
    expect(dotIn(element, "1-1")).toBeNull();
    expect(await whyLines(element)).toEqual([
      "Bunk 2 · Monday · Period 2 · Swim: Not set up for Bunk 2"
    ]);
  });

  it("the dot and the overlap go as soon as the cause moves", async () => {
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,2,", "1,2,"]));
    saveSlots.mockResolvedValueOnce({
      conflicts: [],
      schedule: schedule([FLAGPOLE, SOCCER], ["1,2,", "1,,"])
    });
    await press(cell(element, "1-1"), "Delete");
    expect(dotIn(element, "0-1")).toBeNull();
    await openCounter(element);
    expect(heads(element)).toEqual(["5still needed", "4under", "0over"]);
  });

  it("under and over show their 0 when the camp has goals and limits; nothing to look at shows nothing", async () => {
    const element = await render(
      draft([FLAGPOLE, SWIM, SOCCER], ["1,2,3", "1,3,"])
    );
    // Nothing overlaps and nothing is over; Soccer is one short for each bunk.
    await openCounter(element);
    expect(heads(element)).toEqual(["3still needed", "2under", "0over"]);
    expect(qc(element, '[data-id="look"]')).toBeNull();
    // Off target (under), so the counter carries the corner.
    expect(
      counterWord(element).querySelector(".shoresh-look-mark")
    ).not.toBeNull();
  });

  it("under isn't shown when no activity has a weekly minimum", async () => {
    const start = draft([FLAGPOLE, SOCCER], ["1,2,", "1,,"]);
    start.activities = start.activities.map((a) => ({ ...a, minPerWeek: 0 }));
    const element = await render(start, NO_MINIMUMS);
    await openCounter(element);
    expect(heads(element)).toEqual(["5still needed", "0over"]);
    expect(counterWord(element).querySelector(".shoresh-look-mark")).toBeNull();
  });

  it("one Escape on a cell that breaks a rule lets go of what was picked up", async () => {
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,2,", "1,2,"]));
    cell(element, "0-1").dispatchEvent(
      new CustomEvent("focusin", { bubbles: true, composed: true })
    );
    await press(cell(element, "0-1"), " ");
    expect(cell(element, "0-1").className).toContain("cell_picked");
    await press(cell(element, "0-1"), "Escape");
    expect(cell(element, "0-1").className).not.toContain("cell_picked");
    expect(dotIn(element, "0-1")).toBeNull();
  });

  it("the dropdown stays open while the week changes under it, and follows it", async () => {
    // No minimums: only the overlap is listed.
    const start = draft([FLAGPOLE, SOCCER], ["1,2,", "1,2,"]);
    start.activities = start.activities.map((a) => ({ ...a, minPerWeek: 0 }));
    const element = await render(start, NO_MINIMUMS);
    await openCounter(element);
    expect(heads(element)).toEqual(["4still needed", "0over", "2to look at"]);
    saveSlots.mockResolvedValueOnce({
      conflicts: [],
      schedule: schedule([FLAGPOLE, SOCCER], ["1,2,", "1,,"])
    });
    await press(cell(element, "1-1"), "Delete");
    expect(counterWord(element).getAttribute("aria-expanded")).toBe("true");
    // Bunk 1: Period 2 filled, Lunch open on both days; Bunk 2: Period 2 open on both days.
    expect(heads(element)).toEqual(["5still needed", "0over"]);
  });

  it("over its weekly limit: only the session past the limit is listed, the latest in the week", async () => {
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
    expect(dotIn(element, "1-1")).toBeNull();
    expect(await whyLines(element)).toEqual([
      "Bunk 1 · Tuesday · Period 2 · Swim: Over its weekly limit"
    ]);
  });

  it("the extra session is the latest one that day too; twice in a day still lists both", async () => {
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
    expect(await whyLines(element)).toEqual([
      "Bunk 1 · Tuesday · Period 2 · Swim: Twice in a day",
      "Bunk 1 · Tuesday · Lunch · Swim: Over its weekly limit · Twice in a day"
    ]);
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
    await openCounter(element);
    // Once a week for each bunk: Bunk 2 has it, Bunk 1 not yet.
    expect(activityRows(element)).toContain("Kayak1of 2");
  });

  it("an under or over row shows that activity, in Activity View", async () => {
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,2,", "1,,"]));
    await openCounter(element);
    expect(activityRows(element)).toEqual(["Swim0of 1", "Soccer1of 4"]);
    activityRow(element, "Soccer").click();
    await flush();
    expect(
      q(element, '[data-view="activity"]').getAttribute("aria-pressed")
    ).toBe("true");
    expect(q(element, ".drill-name").textContent).toBe("Soccer");
    expect(counterWord(element).getAttribute("aria-expanded")).toBe("false");
  });

  it("a line to look at takes you to its bunk's week, with focus on its cell", async () => {
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,2,", "1,2,"]));
    await openCounter(element);
    lineButton(
      element,
      "Bunk 2 · Monday · Period 2: Over its limit of 1 Bunk at once"
    ).click();
    await flush();
    expect(counterWord(element).getAttribute("aria-expanded")).toBe("false");
    expect(q(element, '[data-view="group"]').getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(q(element, '[data-id="edit-grid"]').label).toBe("Bunk 2");
    await openCounter(element);
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

  it("a screen reader hears, once, the line an edit brings and the one it takes away", async () => {
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,2,", "1,,"]));
    saveSlots.mockResolvedValueOnce({
      conflicts: [],
      schedule: schedule([FLAGPOLE, SOCCER], ["1,2,", "1,2,"])
    });
    await press(cell(element, "1-1"), "Enter");
    const input = q(element, '[data-id="slot-input"]');
    input.value = "soccer";
    input.dispatchEvent(new CustomEvent("input"));
    await flush();
    await press(input, "Enter");
    expect(q(element, '[data-id="announce"]').textContent.trim()).toBe(
      "Placed Soccer · Bunk 2 · Monday · Period 2. Soccer · Bunk 1: Over its limit of 1 Bunk at once, and 1 more"
    );
    saveSlots.mockResolvedValueOnce({
      conflicts: [],
      schedule: schedule([FLAGPOLE, SOCCER], ["1,2,", "1,,"])
    });
    await press(cell(element, "1-1"), "Delete");
    // Bunk 2's Soccer is gone, not fixed: only Bunk 1's is fine now.
    expect(q(element, '[data-id="announce"]').textContent.trim()).toBe(
      "Cleared Bunk 2 · Monday · Period 2. Soccer · Bunk 1: fine now"
    );
  });

  it("clearing the first of two clashing bunks says the other is fine now, not the cleared one", async () => {
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,2,", "1,2,"]));
    saveSlots.mockResolvedValueOnce({
      conflicts: [],
      schedule: schedule([FLAGPOLE, SOCCER], ["1,,", "1,2,"])
    });
    await press(cell(element, "0-1"), "Delete");
    expect(q(element, '[data-id="announce"]').textContent).toContain(
      "Soccer · Bunk 2: fine now"
    );
    expect(q(element, '[data-id="announce"]').textContent).not.toContain(
      "Soccer · Bunk 1: fine now"
    );
  });

  it("the program's divisions reach the checks: one division at a time", async () => {
    // Bunk 2 is in Seniors; Soccer is for one division at a time, with no limit of bunks.
    const twoDivisions = nsRecord({
      ...SETUP,
      programs: [
        {
          ...SETUP.programs[0],
          divisions: [
            {
              division: { Id: "dv1", Name: "Juniors" },
              groups: [{ Id: "g1", Name: "Bunk 1", Division__c: "dv1" }]
            },
            {
              division: { Id: "dv2", Name: "Seniors" },
              groups: [{ Id: "g2", Name: "Bunk 2", Division__c: "dv2" }]
            }
          ]
        }
      ],
      activities: SETUP.activities.map((a) => {
        return a.Id === "a3"
          ? { ...a, NoGroupLimit__c: true, SameDivisionOnly__c: true }
          : a;
      })
    });
    const element = await render(
      draft([FLAGPOLE, SOCCER], ["1,2,", "1,2,"]),
      twoDivisions
    );
    expect(await whyLines(element)).toContain(
      "Bunk 1 · Monday · Period 2: With another division at the same time"
    );
  });

  it("the checks follow the week as it is read again, even when the week itself is unchanged", async () => {
    const start = draft([FLAGPOLE, SWIM], ["1,2,", "1,,"]);
    start.schedule.days[1] = day(
      "2026-06-30",
      [FLAGPOLE, SWIM],
      ["1,2,", "1,,"]
    );
    const element = await render(start);
    expect(await whyLines(element)).toEqual([]);
    // Someone sets Swim to once a week elsewhere; the week is read again (the window gets focus).
    getDraft.mockResolvedValue({
      ...start,
      activityRecords: nsRecord(
        SETUP.activities.map((a) => {
          return a.Id === "a1" ? { ...a, TimesPerWeekMax__c: 1 } : a;
        })
      ),
      locationRecords: []
    });
    window.dispatchEvent(new CustomEvent("focus"));
    await flush();
    expect(listLines(element)).toEqual([
      "Bunk 1 · Tuesday · Period 2 · Swim: Over its weekly limit"
    ]);
  });

  it("a week with no days shows no counters", async () => {
    const start = draft();
    start.schedule.days = [];
    const element = await render(start);
    expect(q(element, "c-shoresh-week-checks")).toBeNull();
  });

  it("the counter is one rail item with its chevron, never raised while closed", async () => {
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,2,", "1,,"]));
    const word = counterWord(element);
    expect(word.querySelector(".shoresh-chevron")).not.toBeNull();
    expect(word.className).toBe("shoresh-item");
    expect(word.getAttribute("aria-controls")).toBeTruthy();
    word.click();
    await flush();
    expect(word.className).toContain("shoresh-raised");
  });

  it("an early-week goal still short is a line to look at", async () => {
    const earlySwim = nsRecord({
      ...SETUP,
      activities: SETUP.activities.map((a) => {
        return a.Id === "a1"
          ? { ...a, EarlyWeekCount__c: 1, EarlyWeekByDay__c: "Monday" }
          : a;
      })
    });
    const element = await render(
      draft([FLAGPOLE, SOCCER], ["1,2,", "1,,"]),
      earlySwim
    );
    await openCounter(element);
    expect(heads(element)).toEqual([
      "5still needed",
      "4under",
      "0over",
      "1to look at"
    ]);
    expect(listLines(element)).toEqual([
      "Swim · Bunk 1: 1 still needed by Monday"
    ]);
  });

  it("another week shown closes the dropdown", async () => {
    const twoWeeks = nsRecord({
      ...SETUP,
      weeks: [...SETUP.weeks, { Id: "w2", Name: "Week 2" }]
    });
    const element = await render(
      draft([FLAGPOLE, SOCCER], ["1,2,", "1,,"]),
      twoWeeks
    );
    await openCounter(element);
    q(element, '[data-id="week"]').dispatchEvent(
      new CustomEvent("change", { detail: { value: "w2" } })
    );
    await flush();
    expect(counterWord(element).getAttribute("aria-expanded")).toBe("false");
  });

  it("places come with the week too: a place made smaller elsewhere shows once the week is read again", async () => {
    // Swim at the Pool, which fits 2; both bunks swim Monday Period 2.
    const pool = nsRecord({
      ...SETUP,
      activities: SETUP.activities.map((a) => {
        return a.Id === "a1" ? { ...a, Location__c: "l1" } : a;
      }),
      locations: [{ Id: "l1", Name: "Pool", GroupsThatFit__c: 2 }]
    });
    const start = draft([FLAGPOLE, SWIM], ["1,2,", "1,2,"]);
    start.activities = start.activities.map((a) => ({ ...a, notFor: [] }));
    const element = await render(start, pool);
    expect(await whyLines(element)).toEqual([]);
    getDraft.mockResolvedValue({
      ...withRecords(start, pool),
      locationRecords: nsRecord([
        { Id: "l1", Name: "Pool", GroupsThatFit__c: 1 }
      ])
    });
    window.dispatchEvent(new CustomEvent("focus"));
    await flush();
    expect(listLines(element)).toContain(
      "Bunk 1 · Monday · Period 2: More Bunks at Pool than fit"
    );
  });

  it("another program at the Pool counts by clock time: only past what fits is listed", async () => {
    // Swim at the Pool, which fits 2; Bunk 1 swims Monday Period 2 (10:00 to 10:45).
    const pool = nsRecord({
      ...SETUP,
      activities: SETUP.activities.map((a) => {
        return a.Id === "a1" ? { ...a, Location__c: "l1" } : a;
      }),
      locations: [{ Id: "l1", Name: "Pool", GroupsThatFit__c: 2 }]
    });
    const start = draft([FLAGPOLE, SWIM], ["1,2,", "1,,"]);
    // Another program's published schedule: one of its groups at the Pool 10:30 to 11:15.
    const others = (groups, names = ["Teen swim"]) => [
      {
        dateValue: "2026-06-29",
        startTime: "10:30",
        endTime: "11:15",
        locationId: "l1",
        activityId: null,
        groups,
        names
      }
    ];
    getDraft.mockResolvedValue({
      ...withRecords(start, pool),
      otherPrograms: others(1)
    });
    const element = createElement("c-shoresh-manual-build", {
      is: ShoreshManualBuild
    });
    element.terms = buildTerms(LABELS);
    element.setup = pool;
    document.body.appendChild(element);
    await flush();
    // Two groups at a place that fits two: no conflict.
    await openCounter(element);
    expect(qc(element, '[data-id="look"]')).toBeNull();

    getDraft.mockResolvedValue({
      ...withRecords(start, pool),
      otherPrograms: others(2)
    });
    window.dispatchEvent(new CustomEvent("focus"));
    await flush();
    // Named as the desktop names it: what is at the place, not which program.
    await openCounter(element);
    expect(heads(element)).toContain("1to look at");
    expect(listLines(element)).toEqual([
      "Bunk 1 · Monday · Period 2: More Bunks at Pool than fit, in use by Teen swim"
    ]);

    // What the user can't read comes with no name: the line names nothing, and still shows.
    getDraft.mockResolvedValue({
      ...withRecords(start, pool),
      otherPrograms: others(2, [])
    });
    window.dispatchEvent(new CustomEvent("focus"));
    await flush();
    expect(listLines(element)).toEqual([
      "Bunk 1 · Monday · Period 2: More Bunks at Pool than fit"
    ]);
  });

  it("another program doing Soccer counts against its bunks at once; one only at a place doesn't", async () => {
    // Soccer: one bunk at a time. Bunk 1 plays Monday Period 2 (10:00 to 10:45).
    const start = draft([FLAGPOLE, SOCCER], ["1,2,", "1,,"]);
    const entry = (extra) => ({
      dateValue: "2026-06-29",
      startTime: "10:00",
      endTime: "10:45",
      locationId: null,
      activityId: null,
      groups: 1,
      ...extra
    });
    // Another program's group at a place (not doing Soccer): Soccer still has room.
    getDraft.mockResolvedValue({
      ...withRecords(start),
      otherPrograms: [entry({ locationId: "l9" })]
    });
    const element = createElement("c-shoresh-manual-build", {
      is: ShoreshManualBuild
    });
    element.terms = buildTerms(LABELS);
    element.setup = SETUP;
    document.body.appendChild(element);
    await flush();
    expect(await whyLines(element)).toEqual([]);

    getDraft.mockResolvedValue({
      ...withRecords(start),
      otherPrograms: [entry({ activityId: "a3" })]
    });
    window.dispatchEvent(new CustomEvent("focus"));
    await flush();
    expect(listLines(element)).toEqual([
      "Bunk 1 · Monday · Period 2: Over its limit of 1 Bunk at once, with another program"
    ]);
  });

  it("a director's edit that changes what the checks say pulses no cell: the grid stays clean", async () => {
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,2,", "1,,"]));
    saveSlots.mockResolvedValueOnce({
      conflicts: [],
      schedule: schedule([FLAGPOLE, SOCCER], ["1,2,", "1,2,"])
    });
    await press(cell(element, "1-1"), "Enter");
    const input = q(element, '[data-id="slot-input"]');
    input.value = "soccer";
    input.dispatchEvent(new CustomEvent("input"));
    await flush();
    await press(input, "Enter");
    expect(cell(element, "0-1").className).not.toContain("cell_pulse");
    expect(cell(element, "1-1").className).not.toContain("cell_pulse");
    expect(dotIn(element, "0-1")).toBeNull();
    expect(dotIn(element, "1-1")).toBeNull();
  });

  it("a line whose words change is said too, not only a new line", async () => {
    // Both bunks have Soccer Monday Period 2 (over its limit of 1 at once); Bunk 1 gets a second.
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,2,", "1,2,"]));
    saveSlots.mockResolvedValueOnce({
      conflicts: [],
      schedule: schedule([FLAGPOLE, SOCCER], ["1,2,2", "1,2,"])
    });
    await press(cell(element, "0-2"), "Enter");
    const input = q(element, '[data-id="slot-input"]');
    input.value = "soccer";
    input.dispatchEvent(new CustomEvent("input"));
    await flush();
    await press(input, "Enter");
    expect(q(element, '[data-id="announce"]').textContent).toContain(
      "Twice in a day"
    );
  });

  it("a row taken from the counter lets go of what was picked up", async () => {
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,2,", "1,,"]));
    cell(element, "0-1").dispatchEvent(
      new CustomEvent("focusin", { bubbles: true, composed: true })
    );
    await press(cell(element, "0-1"), " ");
    expect(cell(element, "0-1").className).toContain("cell_picked");
    await openCounter(element);
    activityRow(element, "Soccer").click();
    await flush();
    q(element, '[data-view="day"]').click();
    await flush();
    expect(cell(element, "0-1").className).not.toContain("cell_picked");
  });
});
