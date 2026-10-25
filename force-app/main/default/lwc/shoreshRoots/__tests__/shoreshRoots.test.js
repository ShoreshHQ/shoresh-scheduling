import { createElement } from "lwc";
import ShoreshRoots from "c/shoreshRoots";
import { buildTerms } from "c/shoreshTerms";
import { setupProblems } from "c/shoreshSetupRules";
import { nsRecord } from "shoresh-jest/namespace";
import getTable from "@salesforce/apex/RootsController.getTable";

jest.mock(
  "@salesforce/apex/RootsController.getTable",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

const LABELS = [
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true },
  { term: "Division", singular: "Unit", plural: "Units", isCustom: true },
  { term: "Elective", singular: "Chug", plural: "Chugim", isCustom: true },
  {
    term: "Activity",
    singular: "Activity",
    plural: "Activities",
    isCustom: false
  },
  {
    term: "Location",
    singular: "Location",
    plural: "Locations",
    isCustom: false
  },
  {
    term: "TimeBlock",
    singular: "Time block",
    plural: "Time blocks",
    isCustom: false
  },
  { term: "Week", singular: "Week", plural: "Weeks", isCustom: false },
  {
    term: "FixedActivity",
    singular: "Fixed activity",
    plural: "Fixed activities",
    isCustom: false
  },
  { term: "Season", singular: "Season", plural: "Seasons", isCustom: false },
  {
    term: "RainPlan",
    singular: "Rain plan",
    plural: "Rain plans",
    isCustom: false
  }
];
const terms = buildTerms(LABELS);

const bunks = (n) =>
  [...Array(n)].map((_, i) => ({ Id: `g${i}`, Name: `Bunk ${i + 1}` }));

// A made-up camp: no real campers or staff.
const SETUP = {
  season: {
    Id: "s1",
    Name: "Summer 2026",
    StartDate__c: "2026-06-29",
    EndDate__c: "2026-08-07"
  },
  labels: LABELS,
  weeks: [
    {
      Id: "w1",
      Name: "Week 1",
      StartDate__c: "2026-06-29",
      EndDate__c: "2026-07-03"
    },
    {
      Id: "w2",
      Name: "Week 2",
      StartDate__c: "2026-07-06",
      EndDate__c: "2026-07-10"
    }
  ],
  programs: [
    {
      program: { Name: "Main", Monday__c: true, Friday__c: false },
      timeBlocks: [
        {
          Id: "b1",
          Name: "Period 1",
          StartTime__c: 32400000,
          EndTime__c: 35100000
        },
        {
          Id: "b2",
          Name: "Lunch",
          StartTime__c: 43200000,
          EndTime__c: 45900000
        }
      ],
      fixedActivities: [{ Name: "Flagpole", TimeBlock__c: "b2" }],
      divisions: [
        { division: { Id: "d1", Name: "Juniors" }, groups: bunks(6) },
        { division: { Id: "d2", Name: "Seniors" }, groups: [] }
      ]
    }
  ],
  locations: [{ Id: "l1", Name: "Pool", GroupsThatFit__c: 1 }],
  activities: [
    { Id: "a1", Name: "Swim", Location__c: "l1", GroupsAtOnce__c: 1 },
    { Id: "a2", Name: "Soccer", Outdoor__c: true }
  ]
};

const TABLE = {
  thisWeekId: "w2",
  shownWeekId: "w2",
  builtWeekIds: ["w1", "w2"],
  manual: {
    groups: ["Bunk 1", "Bunk 2", "Bunk 3"],
    rows: [
      {
        startTime: "09:00",
        cells: [
          { name: "Swim", locked: true },
          { name: "Soccer", locked: false },
          { name: "", locked: false }
        ]
      },
      { startTime: "12:00", fixed: "Flagpole", cells: [] }
    ]
  },
  generated: null,
  seats: [{ name: "Archery", seats: 12, taken: 9, minimum: null }],
  latestVersion: {
    name: "Friday swap",
    weekId: "w2",
    savedAt: "2026-07-09T14:15:00.000Z",
    published: false
  }
};

const flush = () => Promise.resolve();
// A few turns of the microtask queue: the request, its answer, and the redraws after it.
const settle = () => flush().then(flush).then(flush).then(flush).then(flush);

async function render(setup = SETUP, { active = true, problems, table } = {}) {
  if (table) {
    getTable.mockResolvedValue(table);
  }
  const element = createElement("c-shoresh-roots", { is: ShoreshRoots });
  element.setup = nsRecord(setup);
  element.terms = terms;
  element.problems = problems || setupProblems(nsRecord(setup), terms);
  element.active = active;
  document.body.appendChild(element);
  await settle();
  return element;
}

const $ = (element, selector) => element.shadowRoot.querySelector(selector);
const $$ = (element, selector) => [
  ...element.shadowRoot.querySelectorAll(selector)
];
const card = (element, key) => $(element, `[data-card="${key}"]`);
const glimpseOf = (element, key) =>
  card(element, key).querySelector("c-shoresh-roots-glimpse");
const wordsOf = (element, key) =>
  [...glimpseOf(element, key).shadowRoot.querySelectorAll("text")].map((t) =>
    t.textContent.trim()
  );

beforeEach(() => {
  getTable.mockReset();
  getTable.mockResolvedValue(TABLE);
});

afterEach(() => {
  while (document.body.firstChild) {
    document.body.removeChild(document.body.firstChild);
  }
});

describe("c-shoresh-roots: the table", () => {
  it("puts the cursor on its heading when the page opens it", async () => {
    const element = await render();
    element.focusHeading();
    expect(element.shadowRoot.activeElement).toBe($(element, "[data-heading]"));
  });

  it("lies on the living dot field (wiki decision 49), its cards covering the dots", async () => {
    const element = await render();
    const fields = $$(element, "c-shoresh-dot-field");
    expect(fields).toHaveLength(1);
    expect(fields[0].solid).toBe(true);
    expect(fields[0].querySelector('[data-id="table"]')).not.toBeNull();
  });

  it("holds the menu's three sections as melds, in its order, every card in the camp's words", async () => {
    const element = await render();
    const melds = $$(element, "[data-meld]");
    expect(melds.map((m) => m.getAttribute("aria-label"))).toEqual([
      "Camp",
      "Activities & Events",
      "Schedules"
    ]);
    expect(
      melds.map((m) =>
        [...m.querySelectorAll("[data-card]")].map((c) =>
          c.getAttribute("aria-label")
        )
      )
    ).toEqual([
      [
        "Weeks",
        "Programs",
        "Units",
        "Bunks",
        "Time blocks",
        "Locations",
        "Camp words"
      ],
      [
        "Activities",
        "Fixed activities",
        "Recurring activities",
        "Special events",
        "Chugim"
      ],
      ["Generated Schedule", "Manual Build", "Chug seats", "Saved versions"]
    ]);
  });

  it("the Schedules title is a doorway to the season's weeks; the others are plain names", async () => {
    const element = await render();
    const doors = $$(element, "button.mlabel");
    expect(doors.map((d) => d.textContent.trim())).toEqual(["Schedules"]);
    const handler = jest.fn();
    element.addEventListener("navigate", handler);
    doors[0].click();
    expect(handler.mock.calls[0][0].detail).toEqual({
      screen: "scheduleWeeks"
    });
  });

  it("each card opens its real screen, from the card", async () => {
    const element = await render();
    const handler = jest.fn();
    element.addEventListener("navigate", handler);
    ["groups", "manualBuild", "electives"].forEach((key) =>
      card(element, key).click()
    );
    expect(handler.mock.calls.map((c) => c[0].detail)).toEqual([
      { screen: "groups", fromCard: "groups" },
      { screen: "manualBuild", fromCard: "manualBuild" },
      { screen: "electives", fromCard: "electives" }
    ]);
  });

  it("reads its table in one request each time it is shown, never while hidden", async () => {
    const element = await render(SETUP, { active: false });
    expect(getTable).not.toHaveBeenCalled();
    element.active = true;
    await settle();
    expect(getTable).toHaveBeenCalledTimes(1);
    expect(getTable).toHaveBeenCalledWith({ seasonId: "s1" });
    element.active = false;
    element.active = true;
    await settle();
    expect(getTable).toHaveBeenCalledTimes(2);
  });

  it("says so when its table can't be read, and still draws what the setup holds", async () => {
    getTable.mockRejectedValue({ body: { message: "No access." } });
    const element = createElement("c-shoresh-roots", { is: ShoreshRoots });
    const toasts = jest.fn();
    element.addEventListener("lightning__showtoast", toasts);
    element.setup = nsRecord(SETUP);
    element.terms = terms;
    element.problems = [];
    element.active = true;
    document.body.appendChild(element);
    await settle();
    expect(toasts).toHaveBeenCalledTimes(1);
    expect(toasts.mock.calls[0][0].detail).toMatchObject({
      title: "Roots could not read your schedules",
      variant: "error"
    });
    expect(wordsOf(element, "activities")).toEqual(["Swim", "Soccer"]);
  });

  it("draws every face from the camp's own data", async () => {
    const element = await render();
    // Weeks: the season's first and last days, the season's year beside the name.
    expect(wordsOf(element, "weeks")).toEqual(
      expect.arrayContaining(["JUN 29", "JUL 10", "1", "2"])
    );
    expect(card(element, "weeks").querySelector("small").textContent).toBe(
      "2026"
    );
    // This week (the table's) wears the highlight.
    const bars = [
      ...glimpseOf(element, "weeks").shadowRoot.querySelectorAll("rect.fhl")
    ];
    expect(bars).toHaveLength(1);
    // Activities by name; one with no place is an outline.
    expect(wordsOf(element, "activities")).toEqual(["Swim", "Soccer"]);
    expect(
      glimpseOf(element, "activities").shadowRoot.querySelectorAll("rect.dash")
    ).toHaveLength(1);
    // Locations: Pool and what is held there, then what waits for a place.
    expect(wordsOf(element, "locations")).toEqual(["Pool", "Swim", "Soccer"]);
    // Camp words: the standard word, then the camp's own.
    expect(wordsOf(element, "campWords")).toEqual(
      expect.arrayContaining([
        "Group",
        "Bunk",
        "Division",
        "Unit",
        "Elective",
        "Chug"
      ])
    );
    // Manual Build: the shown week's day, by bunk, with Flagpole across.
    expect(
      card(element, "manualBuild").querySelector("small").textContent
    ).toBe("WEEK 2");
    expect(wordsOf(element, "manualBuild")).toEqual(
      expect.arrayContaining(["Bunk 1", "9:00", "Swim", "Soccer", "Flagpole"])
    );
    // Seats and the latest saved version.
    expect(wordsOf(element, "electiveSeats")).toEqual(["Archery"]);
    expect(wordsOf(element, "schedules")).toEqual([
      "Week 2 · Friday swap",
      "JUL 9"
    ]);
  });

  it("an empty camp's cards show what is missing by its outline, with no words", async () => {
    getTable.mockResolvedValue({});
    const element = await render({
      season: { Id: "s1", Name: "Summer 2026" },
      labels: [],
      weeks: [],
      programs: [],
      locations: [],
      activities: []
    });
    [
      "weeks",
      "activities",
      "manualBuild",
      "generatedSchedule",
      "electiveSeats"
    ].forEach((key) => {
      expect(wordsOf(element, key)).toEqual([]);
      expect(
        glimpseOf(element, key).shadowRoot.querySelectorAll("rect.dash").length
      ).toBeGreaterThan(0);
    });
  });

  it("is accessible", async () => {
    const element = await render();
    await expect(element).toBeAccessible();
  });
});

const handOf = (element) => $(element, "c-shoresh-roots-hand");
const handCards = (element) => [
  ...handOf(element).shadowRoot.querySelectorAll("[data-hand]:not([data-gone])")
];

describe("c-shoresh-roots: the hand, what needs a look (slice R2)", () => {
  it("deals what needs a look in this camp once the table is read, each card saying what is off", async () => {
    const element = await render({ ...SETUP, weeks: [] });
    const cards = handCards(element);
    const group = handOf(element).shadowRoot.querySelector('[data-id="hand"]');
    expect(group.getAttribute("role")).toBe("group");
    expect(group.getAttribute("aria-label")).toBe("Needs a look");
    // Every signal the attention list had, in the menu's order of the screens that fix them.
    expect(cards.map((c) => c.getAttribute("aria-label"))).toEqual([
      "Summer 2026: No weeks yet.",
      "Seniors: No Bunks yet.",
      "Soccer has no location.",
      "Soccer: Outdoors and has no rain plan.",
      expect.stringMatching(/^Flagpole: /)
    ]);
    const face = cards[1].querySelector("c-shoresh-roots-hand-face");
    expect(face.card).toMatchObject({
      name: "Bunks",
      small: "SENIORS",
      off: "none yet"
    });
  });

  it("opens the exact thing a card is about, grown out of the card", async () => {
    const element = await render(SETUP, {
      table: { ...TABLE, soonWeekIds: ["w2"], builtWeekIds: ["w1"] }
    });
    const handler = jest.fn();
    element.addEventListener("navigate", handler);
    const week = handCards(element).find(
      (c) => c.dataset.hand === "hand:weekNotBuilt|w2"
    );
    week.click();
    expect(handler.mock.calls[0][0].detail).toEqual({
      screen: "scheduleWeeks",
      fromCard: "hand:weekNotBuilt|w2",
      weekId: "w2"
    });
  });

  it("is an empty hand while all is calm, and says so to a screen reader", async () => {
    // Every activity has its place; nothing else is off.
    const element = await render(
      {
        ...SETUP,
        activities: SETUP.activities.map((a) => ({ ...a, Location__c: "l1" }))
      },
      { problems: [] }
    );
    expect(handCards(element)).toHaveLength(0);
    const calm = handOf(element).shadowRoot.querySelector('[data-id="calm"]');
    expect(calm.getAttribute("role")).toBe("status");
    expect(calm.textContent).toBe("Nothing needs a look");
  });

  it("holds still while Roots is away, and changes on the next visit once the table is read", async () => {
    const element = await render();
    const before = handCards(element).map((c) => c.dataset.hand);
    expect(before).toContain("hand:noRainPlan|activities");
    // Away on a screen: the rain plan is given.
    element.active = false;
    const fixed = {
      ...SETUP,
      activities: SETUP.activities.map((a) => {
        return a.Id === "a2" ? { ...a, RainPlan__c: "a1" } : a;
      })
    };
    element.setup = nsRecord(fixed);
    element.problems = setupProblems(nsRecord(fixed), terms);
    await settle();
    expect(handCards(element).map((c) => c.dataset.hand)).toEqual(before);
    // Back on Roots: nothing changes until this showing's table is read.
    let answer;
    getTable.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      })
    );
    element.active = true;
    await settle();
    expect(handCards(element).map((c) => c.dataset.hand)).toEqual(before);
    answer(TABLE);
    await settle();
    expect(handCards(element).map((c) => c.dataset.hand)).not.toContain(
      "hand:noRainPlan|activities"
    );
  });

  it("keeps what the table fed when a later read fails, rather than playing it away", async () => {
    const element = await render(SETUP, {
      table: { ...TABLE, soonWeekIds: ["w2"], builtWeekIds: ["w1"] }
    });
    expect(handCards(element).map((c) => c.dataset.hand)).toContain(
      "hand:weekNotBuilt|w2"
    );
    element.active = false;
    getTable.mockRejectedValue({ body: { message: "Offline" } });
    element.active = true;
    await settle();
    expect(handCards(element).map((c) => c.dataset.hand)).toContain(
      "hand:weekNotBuilt|w2"
    );
  });

  it("never deals one season's table into another's hand when the new read fails", async () => {
    const element = await render(SETUP, {
      table: {
        ...TABLE,
        shortSeats: [{ name: "Ropes", fewest: 5, minimum: 6, seats: 12 }]
      }
    });
    expect(handCards(element).map((c) => c.dataset.hand)).toContain(
      "hand:seatsShort|"
    );
    getTable.mockRejectedValue({ body: { message: "Offline" } });
    element.setup = nsRecord({
      ...SETUP,
      season: { ...SETUP.season, Id: "s2" }
    });
    await settle();
    expect(handCards(element).map((c) => c.dataset.hand)).not.toContain(
      "hand:seatsShort|"
    );
  });

  it("is accessible with cards in hand", async () => {
    const element = await render({ ...SETUP, weeks: [] });
    expect(handCards(element).length).toBeGreaterThan(0);
    await expect(element).toBeAccessible();
  });
});

describe("c-shoresh-roots: the camp's workbook", () => {
  it("a camp with setup: the import recedes to Re-import last year, and still opens", async () => {
    const element = await render();
    const imports = $$(element, 'lightning-button[data-id="import"]');
    expect(imports.map((b) => b.label)).toEqual(["Re-import last year"]);
    const handler = jest.fn();
    element.addEventListener("navigate", handler);
    imports[0].click();
    expect(handler.mock.calls[0][0].detail).toEqual({ screen: "import" });
  });

  it("an empty camp: Import last year is the first thing to do", async () => {
    const element = await render({
      ...SETUP,
      programs: [{ program: { Name: "Main" }, timeBlocks: [], divisions: [] }]
    });
    const imports = $$(element, 'lightning-button[data-id="import"]');
    expect(imports.map((b) => [b.label, b.variant])).toEqual([
      ["Import last year", "brand"]
    ]);
  });

  it("shows the last import with Undo last import, which asks the page to undo it", async () => {
    const element = await render({
      ...SETUP,
      lastImport: {
        Id: "im1",
        Files__c: "maple-grove.xlsx",
        CreatedDate: "2027-06-20T14:00:00.000Z"
      }
    });
    const line = $(element, '[data-id="last-import"]');
    expect(line.textContent).toContain("Last import: maple-grove.xlsx");
    expect(line.textContent).toContain(
      "Anything you have edited since stays as it is."
    );
    const handler = jest.fn();
    element.addEventListener("undoimport", handler);
    $(element, 'lightning-button[data-id="undo-import"]').click();
    expect(handler.mock.calls[0][0].detail).toEqual({
      importId: "im1",
      files: "maple-grove.xlsx"
    });
  });

  it("shows no last import when there is none", async () => {
    const element = await render();
    expect($(element, '[data-id="last-import"]')).toBeNull();
  });

  it("Download worksheet saves every list and the extra sheets in one file", async () => {
    const XLSX = require("xlsx");
    window.XLSX = XLSX;
    const blobs = new Map();
    URL.createObjectURL = (blob) => {
      blobs.set("blob:test", blob);
      return "blob:test";
    };
    URL.revokeObjectURL = () => undefined;
    const saved = [];
    const spy = jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function click() {
        saved.push(this);
      });
    const element = await render({
      ...SETUP,
      season: { Id: "s1", Name: "Summer 2027" }
    });
    const button = $(element, 'lightning-button[data-id="download-workbook"]');
    // The desktop's word (RootsHomeScreen.jsx, ImportScreen.jsx: "Download worksheet").
    expect(button.label).toBe("Download worksheet");
    button.click();
    await settle();
    expect(saved).toHaveLength(1);
    expect(saved[0].download).toBe("Summer 2027 - worksheet.xlsx");
    const bytes = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result));
      reader.readAsArrayBuffer(blobs.get(saved[0].href));
    });
    const wb = XLSX.read(bytes, { type: "array" });
    expect(wb.SheetNames).toContain("Runs in");
    spy.mockRestore();
    delete window.XLSX;
    delete URL.createObjectURL;
    delete URL.revokeObjectURL;
  });
});

// ---------- motion: the browser's clock and size, made up ----------

describe("c-shoresh-roots: the melds move", () => {
  const realMatchMedia = window.matchMedia;
  let media;
  let frames;
  let nextFrame;
  let time;

  beforeEach(() => {
    media = { reduce: false, coarse: false };
    frames = new Map();
    nextFrame = 1;
    time = 1000;
    window.matchMedia = jest.fn((query) => ({
      get matches() {
        return query.includes("reduced-motion") ? media.reduce : media.coarse;
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
  });

  afterEach(() => {
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

  /** Gives the table a size (jsdom has no layout) and lays it out. */
  async function sized(element, w = 1200, h = 640) {
    const table = $(element, '[data-id="table"]');
    Object.defineProperty(table, "clientWidth", {
      value: w,
      configurable: true
    });
    Object.defineProperty(table, "clientHeight", {
      value: h,
      configurable: true
    });
    window.dispatchEvent(new CustomEvent("resize"));
    run(2000);
    await settle();
    return table;
  }

  const scaleOf = (b) => {
    const m = /scale\(([\d.]+)\)/.exec(b.style.transform);
    return m ? Number(m[1]) : null;
  };
  const xOf = (b) => {
    const m = /translate\((-?[\d.]+)px/.exec(b.style.transform);
    return m ? Number(m[1]) : null;
  };
  const meld = (element, key) => $(element, `[data-meld="${key}"]`);

  it("at rest, each meld lies slightly fanned: three cards show, the rest wait behind", async () => {
    const element = await render();
    await sized(element);
    ["camp", "activities", "schedules"].forEach((key) => {
      const cards = [...meld(element, key).querySelectorAll("[data-card]")];
      expect(cards.filter((c) => !c.hasAttribute("data-gone"))).toHaveLength(3);
      expect(cards.filter((c) => c.hasAttribute("data-front"))).toHaveLength(1);
    });
    // The menu's order left to right: Camp, Activities & Events, Schedules.
    expect(xOf(card(element, "weeks"))).toBeLessThan(
      xOf(card(element, "activities"))
    );
    expect(xOf(card(element, "activities"))).toBeLessThan(
      xOf(card(element, "manualBuild"))
    );
    expect(card(element, "weeks").hasAttribute("data-front")).toBe(true);
    expect(card(element, "manualBuild").hasAttribute("data-front")).toBe(true);
  });

  it("on a short screen every meld's name stays on the table, clear of the cards above it", async () => {
    const element = await render();
    const H = 330;
    await sized(element, 1200, H);
    const yOf = (el) => {
      const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(
        el.style.transform
      );
      return m ? Number(m[2]) : null;
    };
    const labelTop = (key) =>
      yOf(meld(element, key).querySelector("[data-label]"));
    const cardsBottom = (key) =>
      Math.max(
        ...[...meld(element, key).querySelectorAll("[data-card]")]
          .filter((c) => !c.hasAttribute("data-gone"))
          .map((c) => {
            const s = scaleOf(c);
            const ch = parseFloat(
              $(element, '[data-id="table"]').style.getPropertyValue("--ch")
            );
            return yOf(c) + ch / 2 + (ch * s) / 2;
          })
      );
    // At rest, and with Camp open (the other two step aside, stacked on the right).
    ["camp", "activities", "schedules"].forEach((key) => {
      expect(labelTop(key)).toBeGreaterThanOrEqual(0);
    });
    card(element, "weeks").focus();
    run(2000);
    expect(meld(element, "camp").hasAttribute("data-open")).toBe(true);
    expect(labelTop("activities")).toBeGreaterThanOrEqual(0);
    // The lower stack's name (24 px tall) lies below the upper stack's cards.
    expect(labelTop("schedules")).toBeGreaterThan(cardsBottom("activities"));
  });

  it("tabbing into a meld fans it; the others ease aside, smaller", async () => {
    const element = await render();
    await sized(element);
    const before = scaleOf(card(element, "activities"));
    card(element, "weeks").focus();
    run(2000);
    expect(meld(element, "camp").hasAttribute("data-open")).toBe(true);
    // Every card of the open meld shows; the others are smaller than at rest.
    const camp = [...meld(element, "camp").querySelectorAll("[data-card]")];
    expect(camp.every((c) => !c.hasAttribute("data-gone"))).toBe(true);
    expect(scaleOf(card(element, "activities"))).toBeLessThan(before);
  });

  it("arrows move between a meld's cards, Escape closes it with the cursor on its front card", async () => {
    const element = await render();
    await sized(element);
    card(element, "weeks").focus();
    run(500);
    const press = (key) =>
      element.shadowRoot.activeElement.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true })
      );
    press("ArrowRight");
    expect(element.shadowRoot.activeElement).toBe(card(element, "programs"));
    press("ArrowLeft");
    press("ArrowLeft");
    expect(element.shadowRoot.activeElement).toBe(card(element, "campWords"));
    press("Escape");
    run(500);
    expect(meld(element, "camp").hasAttribute("data-open")).toBe(false);
    expect(element.shadowRoot.activeElement).toBe(card(element, "weeks"));
    press("ArrowDown");
    expect(meld(element, "camp").hasAttribute("data-open")).toBe(true);
  });

  it("Tab after Escape opens the meld again, so the card the cursor lands on shows", async () => {
    const element = await render();
    await sized(element);
    card(element, "weeks").focus();
    run(500);
    element.shadowRoot.activeElement.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    run(500);
    expect(meld(element, "camp").hasAttribute("data-open")).toBe(false);
    // At rest the fourth card is gone from sight; Tab lands there next.
    expect(card(element, "groups").hasAttribute("data-gone")).toBe(true);
    card(element, "programs").focus();
    run(500);
    expect(meld(element, "camp").hasAttribute("data-open")).toBe(true);
    card(element, "groups").focus();
    run(500);
    expect(meld(element, "camp").hasAttribute("data-open")).toBe(true);
    expect(card(element, "groups").hasAttribute("data-gone")).toBe(false);
  });

  it("opens on hover intent and closes a moment after the pointer leaves", async () => {
    const element = await render();
    await sized(element);
    const m = meld(element, "activities");
    card(element, "activities").dispatchEvent(
      new CustomEvent("pointerover", { bubbles: true })
    );
    run(100);
    expect(m.hasAttribute("data-open")).toBe(false);
    run(200);
    expect(m.hasAttribute("data-open")).toBe(true);
    card(element, "activities").dispatchEvent(
      new CustomEvent("pointerout", { bubbles: true })
    );
    run(200);
    expect(m.hasAttribute("data-open")).toBe(true);
    run(300);
    expect(m.hasAttribute("data-open")).toBe(false);
  });

  it("moves continuously: a meld changing its mind bends from where its cards are", async () => {
    const element = await render();
    await sized(element);
    const b = card(element, "activities");
    const rest = xOf(b);
    card(element, "weeks").focus();
    run(120);
    const midway = xOf(b);
    // Part of the way toward the side; not snapped there.
    expect(midway).not.toBe(rest);
    card(element, "manualBuild").focus();
    run(16);
    // The next frame starts from where it was, not from its rest or its last target.
    expect(Math.abs(xOf(b) - midway)).toBeLessThan(40);
  });

  it("with reduced motion, nothing moves: every change is drawn at once, with no frames", async () => {
    media.reduce = true;
    const element = await render();
    await sized(element);
    frames.clear();
    card(element, "weeks").focus();
    expect(meld(element, "camp").hasAttribute("data-open")).toBe(true);
    expect(frames.size).toBe(0);
  });

  it("a card a screen grows out of hands its face to the sheet, and takes it back after", async () => {
    const element = await render();
    await sized(element);
    expect(element.hasCard("activities")).toBe(true);
    expect(element.hasCard("scheduleWeeks")).toBe(false);
    const pose = element.cardPose("activities");
    expect(pose.w).toBeGreaterThan(0);
    element.travel({ ...pose, p: 0.1 }, "activities");
    await settle();
    const face = card(element, "activities").querySelector('[data-id="face"]');
    expect(face.style.opacity).toBe("0");
    const sheet = $(element, '[data-id="sheet"]');
    expect(sheet.hidden).toBe(false);
    expect(sheet.getAttribute("aria-hidden")).toBe("true");
    expect(
      sheet.querySelector('[data-id="ghost"] .name-text').textContent
    ).toBe("Activities");
    element.endTravel();
    await settle();
    expect(face.style.opacity).toBe("");
    expect(sheet.hidden).toBe(true);
  });

  it("a hand card a screen grows out of lends its face to the sheet; home, the cursor is on it", async () => {
    const element = await render({ ...SETUP, weeks: [] });
    await sized(element);
    const key = "hand:noWeeks|weeks";
    expect(element.hasCard(key)).toBe(true);
    const pose = element.cardPose(key);
    expect(pose).not.toBeNull();
    element.travel({ ...pose, p: 0.1 }, key);
    await settle();
    const sheet = $(element, '[data-id="sheet"]');
    expect(sheet.querySelector("c-shoresh-roots-hand-face").card.name).toBe(
      "Weeks"
    );
    element.endTravel();
    await settle();
    expect(element.prepareHome(key)).not.toBeNull();
    expect(handOf(element).shadowRoot.activeElement.dataset.hand).toBe(key);
    element.endTravel();
  });

  it("a card played from the hand lands on its meld's front card, which settles", async () => {
    const element = await render();
    await sized(element);
    const target = handOf(element).playTo("camp");
    const weeks = element.cardPose("weeks");
    expect(target).toEqual({ x: weeks.x, y: weeks.y, w: weeks.w, r: weeks.r });
    handOf(element).dispatchEvent(
      new CustomEvent("landed", { detail: { meld: "camp" } })
    );
    expect(card(element, "weeks").hasAttribute("data-nudge")).toBe(true);
    run(1000);
    expect(card(element, "weeks").hasAttribute("data-nudge")).toBe(false);
  });

  it("an open meld has the hand ease aside, and closing it brings the hand back", async () => {
    const element = await render();
    await sized(element);
    const hand = handOf(element).shadowRoot.querySelector('[data-id="hand"]');
    run(3000);
    const full = parseFloat(hand.style.height);
    expect(full).toBeGreaterThan(150);
    card(element, "weeks").focus();
    run(3000);
    expect(parseFloat(hand.style.height)).toBeLessThan(full - 80);
    card(element, "weeks").blur();
    run(3000);
    expect(parseFloat(hand.style.height)).toBeCloseTo(full, 0);
  });

  it("the hand's last card with the cursor played away: the cursor goes to its meld", async () => {
    const element = await render();
    await sized(element);
    handOf(element).dispatchEvent(
      new CustomEvent("leftfocus", { detail: { meld: "schedules" } })
    );
    expect(element.shadowRoot.activeElement).toBe(card(element, "manualBuild"));
    // The meld rests closed, so the card in flight lands where it was aimed.
    expect(meld(element, "schedules").hasAttribute("data-open")).toBe(false);
  });

  it("coming home opens the card's meld and puts the cursor on it", async () => {
    const element = await render();
    await sized(element);
    const pose = element.prepareHome("electiveSeats");
    expect(pose).not.toBeNull();
    expect(element.shadowRoot.activeElement).toBe(
      card(element, "electiveSeats")
    );
    expect(meld(element, "schedules").hasAttribute("data-open")).toBe(true);
  });
});
