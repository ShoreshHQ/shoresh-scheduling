// The schedule inside a special day or event (ADR 0014 choices 14 to 17), opened from its details:
// the plan in the week editor as one named day, filled by typing in a cell, its time blocks and an
// event's stations changed under the grid, Clear, Import and Download. Made-up camp.
import { createElement } from "lwc";
import ShoreshSpecialSchedule from "c/shoreshSpecialSchedule";
import openPlan from "@salesforce/apex/SpecialScheduleController.openPlan";
import saveCells from "@salesforce/apex/SpecialScheduleController.saveCells";
import changeFrame from "@salesforce/apex/SpecialScheduleController.changeFrame";
import importPlan from "@salesforce/apex/SpecialScheduleController.importPlan";
import { downloadWorkbook } from "c/shoreshDownload";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";

const apex = () => ({ default: jest.fn() });
jest.mock("@salesforce/apex/SpecialScheduleController.openPlan", () => apex(), {
  virtual: true
});
jest.mock(
  "@salesforce/apex/SpecialScheduleController.saveCells",
  () => apex(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/SpecialScheduleController.changeFrame",
  () => apex(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/SpecialScheduleController.addActivity",
  () => apex(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/SpecialScheduleController.importPlan",
  () => apex(),
  { virtual: true }
);
jest.mock("c/shoreshDownload", () => ({
  downloadWorkbook: jest.fn(() => Promise.resolve()),
  fileNameOf: (title) => `${title}.xlsx`
}));

const LABELS = [
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true },
  { term: "TimeBlock", singular: "Period", plural: "Periods", isCustom: true }
];

const block = (id, name, startTime, endTime) => ({
  id,
  name,
  startTime,
  endTime,
  gone: false
});
const ref = (id, name, kind) => ({ id, name, kind, gone: false });

/** A special day's plan: Cedar and Birch across, Opening and Lunch down, Lunch fixed. */
function dayPlan(rows = [",1", ",1"], extra = {}) {
  return {
    itemId: "sd1",
    kind: "SpecialDay",
    name: "Color War",
    notes: "Teams announced at breakfast.",
    revision: 1,
    problem: null,
    hasEntries: true,
    schedule: {
      schedule: { id: "sd1", name: "Color War" },
      days: [
        {
          dateValue: "2000-01-03",
          problem: null,
          blocks: [
            block("b1", "Opening", "09:00", "09:45"),
            block("b2", "Lunch", "11:30", "12:20")
          ],
          groups: [ref("g1", "Cedar"), ref("g2", "Birch")],
          items: [ref("f1", "Lunch", "F"), ref("a1", "Relay races", "A")],
          rows,
          locks: []
        }
      ]
    },
    activities: [
      {
        id: "a1",
        name: "Relay races",
        length: 1,
        minPerWeek: 0,
        maxPerWeek: 0,
        notFor: []
      }
    ],
    ...extra
  };
}

/** An event with nothing yet. */
function emptyEvent() {
  return {
    itemId: "ev1",
    kind: "SpecialEvent",
    name: "Sports Day",
    notes: null,
    revision: null,
    problem: null,
    hasEntries: false,
    schedule: {
      schedule: { id: "ev1", name: "Sports Day" },
      days: [
        {
          dateValue: "2000-01-03",
          problem: null,
          blocks: [],
          groups: [],
          items: [],
          rows: [],
          locks: []
        }
      ]
    },
    activities: []
  };
}

const flush = () =>
  [...Array(12)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

async function render(plan) {
  openPlan.mockResolvedValue(plan);
  const element = createElement("c-shoresh-special-schedule", {
    is: ShoreshSpecialSchedule
  });
  element.terms = buildTerms(LABELS);
  element.setup = nsRecord({ activities: [], locations: [] });
  const heard = { close: [], changed: 0 };
  element.addEventListener("close", (e) => heard.close.push(e.detail));
  element.addEventListener("changed", () => (heard.changed += 1));
  document.body.appendChild(element);
  element.itemId = plan.itemId;
  await flush();
  return { element, heard };
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);
const editor = (element) => q(element, '[data-id="week-editor"]');
const inEditor = (element, selector) =>
  editor(element).shadowRoot.querySelector(selector);
const grid = (element) => inEditor(element, '[data-id="edit-grid"]');
const cell = (element, key) =>
  grid(element).shadowRoot.querySelector(`[data-cell="${key}"]`);

async function press(target, key) {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, composed: true })
  );
  await flush();
}

describe("c-shoresh-special-schedule", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("opens a special day: its name on the rail, the bunks across, its own periods down", async () => {
    const { element } = await render(dayPlan());
    expect(openPlan).toHaveBeenCalledWith({ itemId: "sd1" });
    const heading = q(element, "[data-heading]");
    expect(heading.textContent.trim()).toBe("Color War");
    expect(element.shadowRoot.activeElement).toBe(heading);
    expect(editor(element).planName).toBe("Color War");
    // One day: no view buttons, no day pills, no drawer.
    expect(inEditor(element, '[data-view="day"]')).toBeNull();
    expect(inEditor(element, '[data-id="day-pills"]')).toBeNull();
    expect(inEditor(element, "c-shoresh-build-palette")).toBeNull();
    expect(cell(element, "0-0").textContent).toContain("Open");
    expect(cell(element, "0-1").textContent).toContain("Lunch");
    expect(q(element, '[data-id="notes"]').textContent).toContain(
      "Teams announced at breakfast."
    );
    // A special day's columns are the camp's bunks: no + Station.
    expect(q(element, '[data-id="add-block"]').textContent.trim()).toBe(
      "+ Period"
    );
    expect(q(element, '[data-id="add-station"]')).toBeNull();
    await expect(element).toBeAccessible();
  });

  it("a name typed into a cell is saved as Manual Build saves it", async () => {
    const { element, heard } = await render(dayPlan());
    saveCells.mockResolvedValue({
      conflicts: [],
      revision: "2",
      schedule: dayPlan(["2,1", ",1"]).schedule
    });
    await press(cell(element, "0-0"), "Enter");
    const input = inEditor(element, '[data-id="slot-input"]');
    input.value = "relay";
    input.dispatchEvent(new CustomEvent("input"));
    await flush();
    await press(input, "Enter");
    await flush();
    expect(saveCells).toHaveBeenCalledTimes(1);
    const { itemId, edits } = saveCells.mock.calls[0][0];
    expect(itemId).toBe("sd1");
    expect(edits[0].runs[0]).toMatchObject({
      day: "2000-01-03",
      groupId: "g1",
      firstBlockId: "b1",
      before: [""],
      after: ["A:a1"],
      blockIds: ["b1"]
    });
    expect(heard.changed).toBe(1);
    // Lines name the plan, never a weekday.
    expect(inEditor(element, '[data-id="announce"]').textContent).not.toMatch(
      /Monday/
    );
  });

  it("an event with nothing yet says what to add; + Period adds one with its times", async () => {
    const { element } = await render(emptyEvent());
    expect(q(element, '[data-id="empty"]').title).toBe(
      "Add a Period and a station to start, or import this schedule from a file."
    );
    expect(grid(element)).toBeNull();
    const withBlock = emptyEvent();
    withBlock.revision = 1;
    withBlock.schedule.days[0].blocks = [
      block("b1", "Relays", "09:50", "11:20")
    ];
    changeFrame.mockResolvedValue(withBlock);
    q(element, '[data-id="add-block"]').click();
    await flush();
    expect(
      q(element, '[data-id="frame-form"]').getAttribute("aria-label")
    ).toBe("New Period");
    const set = (id, value) => {
      const input = q(element, `[data-id="${id}"]`);
      input.value = value;
      input.dispatchEvent(new CustomEvent("change"));
    };
    set("form-name", "Relays");
    set("form-start", "09:50:00.000");
    set("form-end", "11:20:00.000");
    q(element, '[data-id="form-save"]').click();
    await flush();
    expect(changeFrame).toHaveBeenCalledWith({
      itemId: "ev1",
      revision: null,
      change: {
        action: "addBlock",
        targetId: null,
        name: "Relays",
        startTime: "09:50:00.000",
        endTime: "11:20:00.000"
      }
    });
    expect(q(element, '[data-id="frame-form"]')).toBeNull();
    expect(q(element, '[data-id="announce"]').textContent).toBe("Relays added");
    expect(q(element, '[data-id="empty"]').title).toBe(
      "Add a station to start, or import this schedule from a file."
    );
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="add-block"]')
    );
  });

  it("taking out a period with something in it asks first", async () => {
    const { element } = await render(dayPlan());
    q(element, '[data-id="edit-blocks"]').click();
    await flush();
    const remove = q(element, '[data-action="removeBlock"][data-target="b2"]');
    expect(remove.getAttribute("aria-label")).toBe("Remove Lunch");
    remove.click();
    await flush();
    const ask = q(element, '[data-id="ask"]');
    expect(ask.heading).toBe("Remove Lunch?");
    expect(ask.lines).toEqual([
      "2 cells in it go with it. This can't be undone."
    ]);
    changeFrame.mockResolvedValue(dayPlan());
    ask.dispatchEvent(new CustomEvent("answer", { detail: { yes: true } }));
    await flush();
    expect(changeFrame.mock.calls[0][0].change).toEqual({
      action: "removeBlock",
      targetId: "b2"
    });
  });

  it("Clear schedule asks first, then empties every cell", async () => {
    const { element } = await render(dayPlan());
    const clear = inEditor(element, '[data-id="clear-schedule"]');
    expect(clear.disabled).toBe(false);
    editor(element).dispatchEvent(
      new CustomEvent("editselect", { detail: { value: "clear" } })
    );
    await flush();
    const ask = q(element, '[data-id="ask"]');
    expect(ask.heading).toBe("Clear Color War?");
    expect(ask.confirmLabel).toBe("Clear");
    changeFrame.mockResolvedValue(dayPlan([",", ","]));
    ask.dispatchEvent(new CustomEvent("answer", { detail: { yes: true } }));
    await flush();
    expect(changeFrame.mock.calls[0][0]).toEqual({
      itemId: "sd1",
      revision: 1,
      change: { action: "clear", targetId: null }
    });
  });

  it("Import over entries is refused, as on the desktop; Download saves the grid", async () => {
    const { element } = await render(dayPlan(["2,1", ",1"]));
    q(element, '[data-id="import"]').click();
    await flush();
    expect(q(element, '[data-id="error"]').textContent.trim()).toBe(
      "Color War already has entries. Clear it first if you want to replace it with an import, or add to it by hand."
    );
    q(element, '[data-id="download"]').click();
    await flush();
    const [, sheets, fileName] = downloadWorkbook.mock.calls[0];
    expect(fileName).toBe("Color War.xlsx");
    expect(sheets[0].name).toBe("Color War");
    expect(sheets[0].rows[0]).toEqual(["Period", "Cedar", "Birch"]);
    expect(sheets[0].rows[2]).toEqual([
      "Lunch (11:30 AM – 12:20 PM)",
      "Lunch",
      "Lunch"
    ]);
  });

  it("a special day holding only what it started with is imported into, and says what the file replaced", async () => {
    const { element } = await render(dayPlan());
    q(element, '[data-id="import"]').click();
    await flush();
    expect(q(element, '[data-id="error"]')).toBeNull();
    importPlan.mockResolvedValue({
      plan: dayPlan(["2,", ","]),
      added: [],
      notGroups: [],
      replaced: ["Lunch"],
      placed: 1,
      asks: false,
      frame: {
        renamed: [{ was: "Opening", now: "9:00 AM – 9:45 AM" }],
        removed: ["Lunch"],
        added: [],
        stationsRemoved: [],
        stationsAdded: []
      }
    });
    openPlan.mockResolvedValue(dayPlan(["2,", ","]));
    const input = q(element, '[data-id="import-file"]');
    Object.defineProperty(input, "files", {
      value: [
        {
          name: "Color War.csv",
          text: () => Promise.resolve("Time,Cedar\n9:00-9:45,Relay races")
        }
      ],
      configurable: true
    });
    input.dispatchEvent(new CustomEvent("change"));
    await flush();
    expect(importPlan).toHaveBeenCalledTimes(1);
    expect(importPlan.mock.calls[0][0].imported.replaceEdited).toBe(false);
    const lines = [
      ...element.shadowRoot.querySelectorAll('[data-id="import-lines"] li')
    ].map((li) => li.textContent);
    // Every change to the frame is named where what it replaced is.
    expect(lines).toEqual([
      "Imported Color War.csv: 1 cell filled.",
      "Replaced by the file, brought in when Color War started: Lunch.",
      "Periods renamed by the file: Opening to 9:00 AM – 9:45 AM.",
      "Periods removed by the file: Lunch."
    ]);
  });

  /** Chooses a file for Import, as the director does. */
  async function chooseFile(element, name, text) {
    const input = q(element, '[data-id="import-file"]');
    Object.defineProperty(input, "files", {
      value: [{ name, text: () => Promise.resolve(text) }],
      configurable: true
    });
    input.dispatchEvent(new CustomEvent("change"));
    await flush();
  }

  const ASKS = {
    asks: true,
    plan: null,
    added: [],
    notGroups: [],
    replaced: [],
    placed: 0,
    frame: {
      renamed: [{ was: "Relays", now: "Stations" }],
      removed: [],
      added: [],
      stationsRemoved: ["Gold"],
      stationsAdded: ["Green"]
    }
  };

  it("an import that would replace time blocks or stations the director changed asks first, and goes ahead on yes", async () => {
    const plan = dayPlan([",", ","], {
      kind: "SpecialEvent",
      itemId: "ev1",
      name: "Sports Day",
      revision: 4
    });
    const { element } = await render(plan);
    importPlan.mockResolvedValueOnce(ASKS).mockResolvedValueOnce({
      ...ASKS,
      asks: false,
      plan,
      placed: 1
    });
    await chooseFile(element, "Sports Day.csv", "Time,Blue\n9:00-9:45,Relay");
    const ask = q(element, '[data-id="ask"]');
    expect(ask.heading).toBe("Replace the Periods and stations in Sports Day?");
    expect(ask.lines).toEqual([
      "Periods renamed: Relays to Stations.",
      "Stations removed: Gold.",
      "Stations added: Green.",
      "This can't be undone."
    ]);
    expect(ask.confirmLabel).toBe("Import");
    expect(q(element, '[data-id="import-lines"]')).toBeNull();

    ask.dispatchEvent(new CustomEvent("answer", { detail: { yes: true } }));
    await flush();
    expect(importPlan).toHaveBeenCalledTimes(2);
    const [first, second] = importPlan.mock.calls.map((call) => call[0]);
    expect(second).toEqual({
      ...first,
      imported: { ...first.imported, replaceEdited: true }
    });
    expect(second.revision).toBe(4);
    const lines = [
      ...element.shadowRoot.querySelectorAll('[data-id="import-lines"] li')
    ].map((li) => li.textContent);
    expect(lines).toEqual([
      "Imported Sports Day.csv: 1 cell filled.",
      "Periods renamed by the file: Relays to Stations.",
      "Stations removed by the file: Gold.",
      "Stations added by the file: Green."
    ]);
  });

  it("no to replacing what the director changed imports nothing", async () => {
    const { element } = await render(dayPlan([",", ","]));
    importPlan.mockResolvedValueOnce(ASKS);
    await chooseFile(element, "Sports Day.csv", "Time,Cedar\n9:00-9:45,Relay");
    const ask = q(element, '[data-id="ask"]');
    expect(ask.heading).toBe("Replace the Periods in Color War?");
    ask.dispatchEvent(new CustomEvent("answer", { detail: { yes: false } }));
    await flush();
    expect(importPlan).toHaveBeenCalledTimes(1);
    expect(q(element, '[data-id="ask"]')).toBeNull();
    expect(q(element, '[data-id="import-lines"]')).toBeNull();
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="import"]')
    );
  });

  it("an event's schedule is imported from a file, and what it did is said", async () => {
    const { element } = await render(emptyEvent());
    const done = dayPlan([",", ","]);
    importPlan.mockResolvedValue({
      plan: done,
      added: ["Opening ceremony"],
      notGroups: [],
      placed: 3
    });
    openPlan.mockResolvedValue(done);
    const input = q(element, '[data-id="import-file"]');
    const file = {
      name: "Sports Day.csv",
      text: () =>
        Promise.resolve(
          "Time,Blue,Gold\n9:00-9:45,Opening ceremony,Opening ceremony\nPeriod 2,Swim,Swim"
        )
    };
    Object.defineProperty(input, "files", { value: [file] });
    input.dispatchEvent(new CustomEvent("change"));
    await flush();
    const sent = importPlan.mock.calls[0][0];
    expect(sent.itemId).toBe("ev1");
    expect(sent.imported.blocks).toEqual([
      { name: "", startTime: "09:00", endTime: "09:45" }
    ]);
    expect(sent.imported.columns).toEqual([
      { name: "Blue", cells: ["Opening ceremony"] },
      { name: "Gold", cells: ["Opening ceremony"] }
    ]);
    const lines = [
      ...element.shadowRoot.querySelectorAll('[data-id="import-lines"] li')
    ].map((li) => li.textContent);
    expect(lines).toEqual([
      "Imported Sports Day.csv: 3 cells filled.",
      "Added to activities: Opening ceremony.",
      "Left out, no times: Period 2."
    ]);
  });

  it("a file with its times across the top is imported; one with times on both sides is refused", async () => {
    const { element } = await render(emptyEvent());
    const done = dayPlan([",", ","]);
    importPlan.mockResolvedValue({
      plan: done,
      added: [],
      notGroups: [],
      placed: 3
    });
    openPlan.mockResolvedValue(emptyEvent());
    const input = q(element, '[data-id="import-file"]');
    const choose = async (name, text) => {
      Object.defineProperty(input, "files", {
        value: [{ name, text: () => Promise.resolve(text) }],
        configurable: true
      });
      input.dispatchEvent(new CustomEvent("change"));
      await flush();
    };
    await choose(
      "Color War.csv",
      "Team,9:00-9:45,9:50-10:30\nBlue,Opening,Relay\nGold,Opening,Swim"
    );
    const sent = importPlan.mock.calls[0][0];
    expect(sent.imported.blocks).toEqual([
      { name: "", startTime: "09:00", endTime: "09:45" },
      { name: "", startTime: "09:50", endTime: "10:30" }
    ]);
    expect(sent.imported.columns).toEqual([
      { name: "Blue", cells: ["Opening", "Relay"] },
      { name: "Gold", cells: ["Opening", "Swim"] }
    ]);
    await choose(
      "Both.csv",
      "Time,9:00-9:45,9:50-10:30\n9:00-9:45,Opening,Relay\n9:50-10:30,Swim,Art"
    );
    expect(importPlan).toHaveBeenCalledTimes(1);
    expect(q(element, '[data-id="error"]').textContent.trim()).toBe(
      "Couldn't tell which side of Both.csv is the schedule's times. Check that the file has a clear time column or time row, and try again."
    );
  });

  it("removing an event's only station leaves focus on + Station", async () => {
    const plan = dayPlan([","], {
      kind: "SpecialEvent",
      itemId: "ev1",
      name: "Sports Day",
      notes: null
    });
    plan.schedule.days[0].groups = [ref("g1", "Cedar")];
    plan.schedule.days[0].rows = ["", ""];
    const { element } = await render(plan);
    q(element, '[data-id="edit-stations"]').click();
    await flush();
    const gone = dayPlan([], {
      kind: "SpecialEvent",
      itemId: "ev1",
      name: "Sports Day",
      notes: null,
      revision: 2
    });
    gone.schedule.days[0].groups = [];
    gone.schedule.days[0].rows = ["", ""];
    changeFrame.mockResolvedValue(gone);
    q(element, '[data-action="removeStation"][data-target="g1"]').click();
    await flush();
    expect(changeFrame.mock.calls[0][0].change).toEqual({
      action: "removeStation",
      targetId: "g1"
    });
    expect(q(element, '[data-id="edit-stations"]')).toBeNull();
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="add-station"]')
    );
  });

  it("an event's stations are added, renamed and moved under the grid", async () => {
    const plan = dayPlan([",", ","], {
      kind: "SpecialEvent",
      itemId: "ev1",
      name: "Sports Day",
      notes: null
    });
    const { element } = await render(plan);
    expect(q(element, '[data-id="add-station"]')).not.toBeNull();
    q(element, '[data-id="edit-stations"]').click();
    await flush();
    const right = q(
      element,
      '[data-action="moveStation"][data-target="g1"][data-direction="1"]'
    );
    expect(right.getAttribute("aria-label")).toBe("Move Cedar right");
    changeFrame.mockResolvedValue(plan);
    right.click();
    await flush();
    expect(changeFrame.mock.calls[0][0].change).toEqual({
      action: "moveStation",
      targetId: "g1",
      direction: 1
    });
    expect(q(element, '[data-id="announce"]').textContent).toBe("Cedar moved");
  });

  it("moving an item to the end keeps focus on that item's other move button", async () => {
    const plan = dayPlan([",", ","], {
      kind: "SpecialEvent",
      itemId: "ev1",
      name: "Sports Day",
      notes: null
    });
    const { element } = await render(plan);
    q(element, '[data-id="edit-stations"]').click();
    await flush();
    const moved = dayPlan([",", ","], {
      kind: "SpecialEvent",
      itemId: "ev1",
      name: "Sports Day",
      notes: null,
      revision: 2
    });
    moved.schedule.days[0].groups = [ref("g2", "Birch"), ref("g1", "Cedar")];
    changeFrame.mockResolvedValue(moved);
    q(
      element,
      '[data-action="moveStation"][data-target="g1"][data-direction="1"]'
    ).click();
    await flush();
    const right = q(
      element,
      '[data-action="moveStation"][data-target="g1"][data-direction="1"]'
    );
    expect(right.disabled).toBe(true);
    expect(element.shadowRoot.activeElement).toBe(
      q(
        element,
        '[data-action="moveStation"][data-target="g1"][data-direction="-1"]'
      )
    );
  });

  it("a second move while the first saves waits instead of sending an old revision", async () => {
    const plan = dayPlan();
    const { element } = await render(plan);
    q(element, '[data-id="edit-blocks"]').click();
    await flush();
    let finish;
    changeFrame.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const later = () =>
      q(
        element,
        '[data-action="moveBlock"][data-target="b1"][data-direction="1"]'
      );
    later().click();
    await flush();
    expect(later().disabled).toBe(true);
    // A click that still lands (it was on its way) changes nothing.
    element.shadowRoot
      .querySelectorAll('[data-action="moveBlock"]')
      .forEach((b) => b.dispatchEvent(new CustomEvent("click")));
    await flush();
    expect(changeFrame).toHaveBeenCalledTimes(1);
    finish({ ...plan, revision: 2 });
    await flush();
    expect(q(element, '[data-id="error"]')).toBeNull();
    expect(later().disabled).toBe(false);
  });

  it("back goes to Special events", async () => {
    const { element, heard } = await render(dayPlan());
    q(element, '[data-id="back"]').click();
    expect(heard.close).toEqual([{ itemId: "sd1" }]);
  });
});
