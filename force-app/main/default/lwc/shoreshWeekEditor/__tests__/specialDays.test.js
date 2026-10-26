// Special days and events on the week (ADR 0014 slice 4; decision 47.2 to 47.4, 51; mock-ups
// design-research/special-r1 placed.html and placed-day.png): a day a special day replaces shows
// its own schedule read-only, with its line where the drawer was and no counter; events are put
// on one cell or the cells chosen together, from the drawer's Events section or by typing, and
// bunks side by side holding one are one cell. Synthetic data only.
import { createElement } from "lwc";
import ShoreshWeekEditor from "c/shoreshWeekEditor";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";
import { GROUPS, draft } from "./data/draftFixture";

const EVENT_ID_FOR_SETUP = "a0E000000000001AAA";
// The season setup carries its special events (SeasonSetupController: special.specialEvents).
const SETUP = {
  activities: [],
  locations: [{ Id: "l1", Name: "Main field" }],
  special: {
    specialDays: [],
    specialEvents: [
      { Id: EVENT_ID_FOR_SETUP, Name: "Carnival", Location__c: "l1" }
    ],
    briefs: []
  }
};
const LABELS = [
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true }
];
const FLAGPOLE = { kind: "F", id: "f1", name: "Flagpole", gone: false };
const SWIM = { kind: "A", id: "a1", name: "Swim", gone: false };
const EVENT_ID = "a0E000000000001AAA";
const CARNIVAL = { kind: "S", id: EVENT_ID, name: "Carnival", gone: false };

// Tuesday (the fixture's second day) is Visiting Day: its own two time blocks.
const VISITING_DAY = {
  dateValue: "2026-06-30",
  day: "Tuesday",
  specialDayId: "sd1",
  name: "Visiting Day",
  notes: "Families 10:30 to 3:00",
  plan: {
    dateValue: "2026-06-30",
    problem: null,
    blocks: [
      { id: "b1", name: "Morning", startTime: "09:00", endTime: "10:20" },
      { id: "b2", name: "Swim time", startTime: "10:30", endTime: "11:25" }
    ],
    groups: GROUPS,
    items: [
      { kind: "A", id: "a9", name: "Bunk clean-up", gone: false },
      { kind: "A", id: "a1", name: "Family swim", gone: false },
      { kind: "A", id: "a8", name: "Lake tour", gone: false }
    ],
    rows: ["1,2", "1,3"]
  }
};

const SPECIALS = { days: [VISITING_DAY] };

const flush = () =>
  [...Array(10)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

async function render(items, rows, options = {}) {
  const element = createElement("c-shoresh-week-editor", {
    is: ShoreshWeekEditor
  });
  element.terms = buildTerms(LABELS);
  element.setup = nsRecord(SETUP);
  element.weekName = "Week 1";
  element.programName = "Main";
  let shown = null;
  element.addEventListener("statechange", (e) => {
    shown = e.detail.draft;
  });
  const saveRuns = jest.fn(() =>
    Promise.resolve({
      status: "saved",
      conflicts: [],
      schedule: shown.schedule
    })
  );
  element.saveRuns = saveRuns;
  if (options.setUpWith) {
    element.setUpWith = options.setUpWith;
  }
  if (options.takeOffWith) {
    element.takeOffWith = options.takeOffWith;
  }
  document.body.appendChild(element);
  const week = draft(items, rows);
  if (options.tuesday) {
    week.schedule.days[1] = { ...week.schedule.days[1], ...options.tuesday };
  }
  element.show({ ...week, specials: options.specials || SPECIALS }, true);
  await flush();
  return { element, saveRuns };
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);
const grid = (element) => q(element, '[data-id="edit-grid"]');
const drawn = (gridElement) =>
  [...gridElement.shadowRoot.querySelectorAll("[data-cell]")].map((c) => ({
    key: c.dataset.cell,
    text: (c.querySelector(".cell-name") || {}).textContent,
    colSpan: c.getAttribute("aria-colspan")
  }));
const sentRuns = (saveRuns, n) => saveRuns.mock.calls[n][0][0].runs;

async function fromGrid(element, name, detail) {
  grid(element).dispatchEvent(new CustomEvent(name, { detail }));
  await flush();
}

async function showTuesday(element) {
  const pills = [
    ...q(element, '[data-id="day-pills"]').querySelectorAll("button")
  ];
  pills[1].click();
  await flush();
}

describe("c-shoresh-week-editor: special days and events", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("names the special day on its day's pill", async () => {
    const { element } = await render();
    const pills = [
      ...q(element, '[data-id="day-pills"]').querySelectorAll("button")
    ];
    expect(pills[0].textContent.trim()).toBe("Mon");
    expect(pills[1].textContent.replace(/\s+/g, " ").trim()).toBe(
      "Tue · Visiting Day"
    );
    expect(pills[1].getAttribute("aria-label")).toBe(
      "Tuesday, Jun 30, Visiting Day"
    );
  });

  it("shows a replaced day's own schedule read-only, its line, and no counter", async () => {
    const { element } = await render();
    const opened = jest.fn();
    element.addEventListener("openspecial", opened);
    expect(q(element, 'slot[name="checks"]')).not.toBeNull();
    await showTuesday(element);
    expect(grid(element)).toBeNull();
    const plan = q(element, '[data-id="special-day-grid"]');
    expect(plan.editable).toBe(false);
    expect(plan.label).toBe("Visiting Day");
    // The same thing in both bunks over the same block is one cell; different things stay two.
    const cells = drawn(plan);
    expect(cells.filter((c) => c.text === "Bunk clean-up")).toEqual([
      expect.objectContaining({ colSpan: "2" })
    ]);
    expect(cells.map((c) => c.text)).toEqual(
      expect.arrayContaining(["Family swim", "Lake tour"])
    );
    // No drawer and no counter on it (decision 47.4): the special day's line instead.
    expect(q(element, "c-shoresh-build-palette")).toBeNull();
    expect(q(element, 'slot[name="checks"]')).toBeNull();
    expect(q(element, '[data-id="special-notes"]').textContent.trim()).toBe(
      "Families 10:30 to 3:00"
    );
    const open = q(element, '[data-id="open-special"]');
    expect(open.textContent.trim()).toBe("Open Visiting Day");
    open.click();
    expect(opened.mock.calls[0][0].detail).toEqual({ itemId: "sd1" });
  });

  it("offers Take off <day> on a replaced day's line only when the host can", async () => {
    const { element } = await render();
    await showTuesday(element);
    expect(q(element, '[data-id="take-off-special"]')).toBeNull();
    const host = await render(undefined, undefined, { takeOffWith: jest.fn() });
    await showTuesday(host.element);
    expect(
      q(host.element, '[data-id="take-off-special"]').textContent.trim()
    ).toBe("Take off Tuesday");
  });

  it("takes the special day off: the day's own cells are back, said, focus on its pill", async () => {
    const host = {};
    const takeOffWith = jest.fn(() => {
      // The host reads the week again: Tuesday is no longer replaced.
      host.element.show(
        { ...draft([SWIM], ["1,,", "1,,"]), specials: { days: [] } },
        false
      );
      return Promise.resolve(
        'Tuesday of "Week 1" has its regular schedule again. "Visiting Day" stays saved.'
      );
    });
    const { element } = await render([SWIM], ["1,,", "1,,"], { takeOffWith });
    host.element = element;
    await showTuesday(element);
    q(element, '[data-id="take-off-special"]').click();
    await flush();
    expect(takeOffWith).toHaveBeenCalledWith({
      specialDayId: "sd1",
      day: "Tuesday"
    });
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      'Tuesday of "Week 1" has its regular schedule again. "Visiting Day" stays saved.'
    );
    expect(q(element, '[data-id="special-line"]')).toBeNull();
    expect(grid(element)).not.toBeNull();
    const pills = [
      ...q(element, '[data-id="day-pills"]').querySelectorAll("button")
    ];
    expect(pills[1].getAttribute("aria-pressed")).toBe("true");
    expect(element.shadowRoot.activeElement).toBe(pills[1]);
  });

  it("says why when the special day couldn't be taken off, and keeps the day", async () => {
    const takeOffWith = jest
      .fn()
      .mockRejectedValue({ body: { message: "No access." } });
    const { element } = await render(undefined, undefined, { takeOffWith });
    const errors = jest.fn();
    element.addEventListener("errorchange", errors);
    await showTuesday(element);
    q(element, '[data-id="take-off-special"]').click();
    await flush();
    expect(errors.mock.calls[0][0].detail.message).toMatch(
      /^Visiting Day wasn't taken off Tuesday\. Nothing was changed\./
    );
    expect(q(element, '[data-id="special-line"]')).not.toBeNull();
  });

  it("leaves a replaced day out of the checks and counts", async () => {
    // Swim twice on Tuesday in Bunk 1 would be over its weekly limit of 2 with Monday's.
    const tuesday = {
      items: [FLAGPOLE, SWIM],
      rows: ["1,2,2", "1,,"]
    };
    const { element } = await render([FLAGPOLE, SWIM], ["1,2,", "1,,"], {
      tuesday
    });
    // Monday only: Bunk 1 has Period 2 and Lunch to fill, Bunk 2 Period 2.
    expect(element.measure.total).toBe(3);
    expect(element.measure.placed).toBe(1);
    expect(element.measure.over.count).toBe(0);
  });

  it("shows a replaced day as one named cell in Group View", async () => {
    const { element } = await render();
    q(element, '[data-view="group"]').click();
    await flush();
    const cells = drawn(grid(element));
    expect(cells.find((c) => c.key === "1-special").text).toBe("Visiting Day");
    expect(
      cells.filter((c) => c.key.startsWith("1-") && c.key !== "1-special")
    ).toEqual([]);
  });

  it("puts an event from the drawer's Events section on a cell", async () => {
    const { element, saveRuns } = await render();
    const palette = q(element, "c-shoresh-build-palette");
    expect(palette.events).toEqual([
      {
        id: EVENT_ID,
        name: "Carnival",
        said: "Carnival, Special event, Main field"
      }
    ]);
    expect(palette.eventsHeading).toBe("Events");
    palette.dispatchEvent(
      new CustomEvent("pickevent", { detail: { id: EVENT_ID } })
    );
    await flush();
    expect(palette.pickedEventId).toBe(EVENT_ID);
    await fromGrid(element, "cellclick", { key: "0-1" });
    expect(sentRuns(saveRuns, 0)).toEqual([
      expect.objectContaining({
        groupId: "g1",
        firstBlockId: "t2",
        before: [""],
        after: [`S:${EVENT_ID}`]
      })
    ]);
    // The cell carries the quiet flag and the event's place (decision 47.3).
    const cell = grid(element).shadowRoot.querySelector('[data-cell="0-1"]');
    expect(cell.querySelector(".flag")).not.toBeNull();
    expect(cell.querySelector(".event-where").textContent).toBe("Main field");
  });

  it("types an event's name over the cells chosen together, as one step", async () => {
    const { element, saveRuns } = await render();
    await fromGrid(element, "cellfocus", { key: "0-1" });
    await fromGrid(element, "cellselect", { key: "1-1", extend: true });
    await fromGrid(element, "editcell", {
      key: "0-1",
      rect: { bottom: 0, left: 0 }
    });
    const input = q(element, '[data-id="slot-input"]');
    input.value = "carn";
    input.dispatchEvent(new CustomEvent("input"));
    await flush();
    const options = [...q(element, '[role="listbox"]').querySelectorAll("li")];
    expect(options[0].textContent.trim()).toBe("Carnival");
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    await flush();
    expect(saveRuns).toHaveBeenCalledTimes(1);
    const runs = sentRuns(saveRuns, 0);
    expect(runs.map((r) => [r.groupId, r.after])).toEqual([
      ["g1", [`S:${EVENT_ID}`]],
      ["g2", [`S:${EVENT_ID}`]]
    ]);
    // Bunk 1 and Bunk 2 side by side: one cell.
    const cells = drawn(grid(element)).filter((c) => c.text === "Carnival");
    expect(cells).toEqual([expect.objectContaining({ colSpan: "2" })]);
  });

  it("keeps focus on the cell an event merged into, typed over a range", async () => {
    const { element } = await render();
    const gridElement = grid(element);
    // Shift+Right from Bunk 1 chose Bunk 1 and Bunk 2, and left focus on Bunk 2's cell.
    gridElement.shadowRoot.querySelector('[data-cell="1-1"]').focus();
    await fromGrid(element, "cellfocus", { key: "0-1" });
    await fromGrid(element, "cellselect", { key: "1-1", extend: true });
    await fromGrid(element, "editcell", {
      key: "1-1",
      rect: { bottom: 0, left: 0 }
    });
    const input = q(element, '[data-id="slot-input"]');
    input.value = "carn";
    input.dispatchEvent(new CustomEvent("input"));
    await flush();
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    await flush();
    expect(
      gridElement.shadowRoot.querySelector('[data-cell="1-1"]')
    ).toBeNull();
    const focused = gridElement.shadowRoot.activeElement;
    expect(focused && focused.dataset.cell).toBe("0-1");
    expect(focused.getAttribute("tabindex")).toBe("0");
  });

  it("keeps focus on the cell an event merged into, put down beside itself", async () => {
    const { element } = await render([FLAGPOLE, CARNIVAL], ["1,2,", "1,,"]);
    const gridElement = grid(element);
    gridElement.shadowRoot.querySelector('[data-cell="1-1"]').focus();
    q(element, "c-shoresh-build-palette").dispatchEvent(
      new CustomEvent("pickevent", { detail: { id: EVENT_ID } })
    );
    await flush();
    gridElement.shadowRoot.querySelector('[data-cell="1-1"]').focus();
    await fromGrid(element, "editcell", { key: "1-1" });
    expect(
      gridElement.shadowRoot.querySelector('[data-cell="1-1"]')
    ).toBeNull();
    const focused = gridElement.shadowRoot.activeElement;
    expect(focused && focused.dataset.cell).toBe("0-1");
  });

  it("clears an event drawn across bunks from all of them at once", async () => {
    const { element, saveRuns } = await render(
      [FLAGPOLE, CARNIVAL],
      ["1,2,", "1,2,"]
    );
    await fromGrid(element, "clearcell", { key: "0-1" });
    const runs = sentRuns(saveRuns, 0);
    expect(runs.map((r) => [r.groupId, r.before, r.after])).toEqual([
      ["g1", [`S:${EVENT_ID}`], [""]],
      ["g2", [`S:${EVENT_ID}`], [""]]
    ]);
  });

  it("puts an event over the cells chosen when its tile is picked", async () => {
    const { element, saveRuns } = await render();
    await fromGrid(element, "cellfocus", { key: "0-1" });
    await fromGrid(element, "cellselect", { key: "1-1", extend: true });
    q(element, "c-shoresh-build-palette").dispatchEvent(
      new CustomEvent("pickevent", { detail: { id: EVENT_ID } })
    );
    await flush();
    expect(sentRuns(saveRuns, 0).map((r) => r.groupId)).toEqual(["g1", "g2"]);
  });

  it("puts an event over a fixed activity by hand (Greg, 2026-10-26: a hand edit is always made)", async () => {
    const { element, saveRuns } = await render();
    await fromGrid(element, "cellfocus", { key: "0-0" });
    await fromGrid(element, "cellselect", { key: "0-1", extend: true });
    q(element, "c-shoresh-build-palette").dispatchEvent(
      new CustomEvent("pickevent", { detail: { id: EVENT_ID } })
    );
    await flush();
    expect(sentRuns(saveRuns, 0)).toEqual([
      expect.objectContaining({
        groupId: "g1",
        firstBlockId: "t1",
        before: ["F:f1", ""],
        after: [`S:${EVENT_ID}`, `^S:${EVENT_ID}`]
      })
    ]);
  });

  it("offers Set it up on a cell a file noted as an event", async () => {
    const setUpWith = jest
      .fn()
      .mockResolvedValue('"Color War" is set up as a special event.');
    const noted = { kind: "S", id: "", name: "Color War", gone: false };
    const { element } = await render([FLAGPOLE, noted], ["1,2,", "1,,"], {
      setUpWith
    });
    expect(q(element, '[data-id="set-up-offer"]')).toBeNull();
    await fromGrid(element, "cellfocus", { key: "0-1" });
    const offer = q(element, '[data-id="set-up-offer"]');
    expect(offer.textContent.replace(/\s+/g, " ").trim()).toMatch(
      /^Color War isn't set up yet ·\s?Set it up$/
    );
    const button = q(element, '[data-id="set-up"]');
    expect(button.getAttribute("aria-label")).toBe(
      "Set up Color War as an event"
    );
    button.click();
    await flush();
    expect(setUpWith).toHaveBeenCalledWith({ kind: "S", name: "Color War" });
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      '"Color War" is set up as a special event.'
    );
  });

  it("lets the offer go once a noted special day is set up and replaces its day", async () => {
    const noted = { kind: "D", id: "", name: "Visiting Day", gone: false };
    const mondayVisit = {
      ...VISITING_DAY,
      dateValue: "2026-06-29",
      day: "Monday"
    };
    const host = {};
    // As the host does: set it up, then send the week back with Monday replaced.
    const setUpWith = jest.fn(() => {
      host.element.show(
        {
          ...draft([FLAGPOLE, noted], ["1,2,", "1,,"]),
          specials: { days: [mondayVisit] }
        },
        false
      );
      return Promise.resolve('"Visiting Day" is set up as a special day.');
    });
    const { element } = await render([FLAGPOLE, noted], ["1,2,", "1,,"], {
      setUpWith,
      specials: { days: [] }
    });
    host.element = element;
    await fromGrid(element, "cellfocus", { key: "0-1" });
    const button = q(element, '[data-id="set-up"]');
    expect(button.getAttribute("aria-label")).toBe(
      "Set up Visiting Day as a special day"
    );
    button.click();
    await flush();
    expect(setUpWith).toHaveBeenCalledWith({ kind: "D", name: "Visiting Day" });
    expect(q(element, '[data-id="set-up-offer"]')).toBeNull();
    expect(q(element, '[data-id="set-up"]')).toBeNull();
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      '"Visiting Day" is set up as a special day.'
    );
  });

  it("puts focus back on the cell once a noted event is set up", async () => {
    const noted = { kind: "S", id: "", name: "Color War", gone: false };
    const colorWar = {
      kind: "S",
      id: "a0E000000000002AAA",
      name: "Color War",
      gone: false
    };
    const host = {};
    const setUpWith = jest.fn(() => {
      host.element.show(draft([FLAGPOLE, colorWar], ["1,2,", "1,,"]), false);
      return Promise.resolve('"Color War" is set up as a special event.');
    });
    const { element } = await render([FLAGPOLE, noted], ["1,2,", "1,,"], {
      setUpWith
    });
    host.element = element;
    await fromGrid(element, "cellfocus", { key: "0-1" });
    const button = q(element, '[data-id="set-up"]');
    button.focus();
    button.click();
    await flush();
    expect(q(element, '[data-id="set-up"]')).toBeNull();
    const focused = grid(element).shadowRoot.activeElement;
    expect(focused && focused.dataset.cell).toBe("0-1");
  });

  it("puts focus on Open <name> once a noted special day replaces the day", async () => {
    const noted = { kind: "D", id: "", name: "Visiting Day", gone: false };
    const mondayVisit = {
      ...VISITING_DAY,
      dateValue: "2026-06-29",
      day: "Monday"
    };
    const host = {};
    const setUpWith = jest.fn(() => {
      host.element.show(
        {
          ...draft([FLAGPOLE, noted], ["1,2,", "1,,"]),
          specials: { days: [mondayVisit] }
        },
        false
      );
      return Promise.resolve('"Visiting Day" is set up as a special day.');
    });
    const { element } = await render([FLAGPOLE, noted], ["1,2,", "1,,"], {
      setUpWith,
      specials: { days: [] }
    });
    host.element = element;
    await fromGrid(element, "cellfocus", { key: "0-1" });
    const button = q(element, '[data-id="set-up"]');
    button.focus();
    button.click();
    await flush();
    const open = q(element, '[data-id="open-special"]');
    expect(open.textContent.trim()).toBe("Open Visiting Day");
    expect(element.shadowRoot.activeElement).toBe(open);
  });

  it("keeps focus on Set it up when it fails", async () => {
    const noted = { kind: "S", id: "", name: "Color War", gone: false };
    const setUpWith = jest.fn().mockRejectedValue(new Error("nope"));
    const { element } = await render([FLAGPOLE, noted], ["1,2,", "1,,"], {
      setUpWith
    });
    await fromGrid(element, "cellfocus", { key: "0-1" });
    const button = q(element, '[data-id="set-up"]');
    button.focus();
    button.click();
    await flush();
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="set-up"]')
    );
  });

  it("offers nothing to set up when the host can't", async () => {
    const noted = { kind: "D", id: "", name: "Field Day", gone: false };
    const { element } = await render([FLAGPOLE, noted], ["1,2,", "1,,"]);
    await fromGrid(element, "cellfocus", { key: "0-1" });
    expect(q(element, '[data-id="set-up-offer"]')).toBeNull();
  });

  it("Clear week leaves a replaced day as it is, and says so", async () => {
    const tuesday = { items: [FLAGPOLE, SWIM], rows: ["1,2,", "1,,"] };
    const { element, saveRuns } = await render(
      [FLAGPOLE, SWIM],
      ["1,2,", "1,,"],
      {
        tuesday
      }
    );
    element.runTool({
      kind: "clear",
      dates: ["2026-06-29", "2026-06-30"],
      name: "Week 1",
      inWeek: true
    });
    await flush();
    const runs = sentRuns(saveRuns, 0);
    expect(runs.map((r) => r.day)).toEqual(["2026-06-29"]);
    expect(
      q(element, '[data-id="tool-notice"]').textContent.replace(/\s+/g, " ")
    ).toMatch(/Tuesday is Visiting Day: left as it is\./);
  });

  it("Copy day to refuses copying from a replaced day", async () => {
    const { element, saveRuns } = await render();
    element.runTool({
      kind: "copy",
      from: "2026-06-30",
      dates: ["2026-06-29"],
      fromName: "Tuesday",
      toName: "Monday"
    });
    await flush();
    expect(saveRuns).not.toHaveBeenCalled();
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      "Tuesday is Visiting Day: open it to change that day."
    );
  });
});
