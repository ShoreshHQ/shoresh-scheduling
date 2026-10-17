import { createElement } from "lwc";
import ShoreshManualBuild from "c/shoreshManualBuild";
import getDraft from "@salesforce/apex/ManualBuildController.getDraft";
import saveSlots from "@salesforce/apex/ManualBuildController.saveSlots";
import { buildTerms } from "c/shoreshTerms";
import { draft, schedule } from "./data/draftFixture";

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

const SETUP = {
  season: { Id: "se1", Name: "Summer 2026" },
  weeks: [{ Id: "w1", Name: "Week 1" }],
  programs: [{ program: { Id: "p1", Name: "Main" } }],
  activities: [],
  locations: []
};
const LABELS = [
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true },
  { term: "TimeBlock", singular: "Period", plural: "Periods", isCustom: true }
];
const FLAGPOLE = { kind: "F", id: "f1", name: "Flagpole", gone: false };
const SWIM = { kind: "A", id: "a1", name: "Swim", gone: false };
const SOCCER = { kind: "A", id: "a3", name: "Soccer", gone: false };
const BOATING = { kind: "A", id: "a2", name: "Boating", gone: false };

const flush = () =>
  [...Array(10)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

// Monday: Bunk 1 has Swim in Period 2; Bunk 2 has Soccer in Period 2.
const MONDAY_ITEMS = [FLAGPOLE, SWIM, SOCCER];
const MONDAY_ROWS = ["1,2,", "1,3,"];

async function render(start = draft(MONDAY_ITEMS, MONDAY_ROWS)) {
  getDraft.mockResolvedValue(start);
  saveSlots.mockImplementation(() =>
    Promise.resolve({ conflicts: [], schedule: start.schedule })
  );
  const element = createElement("c-shoresh-manual-build", {
    is: ShoreshManualBuild
  });
  element.terms = buildTerms(LABELS);
  element.setup = SETUP;
  document.body.appendChild(element);
  await flush();
  return element;
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);
const grid = (element) => q(element, '[data-id="edit-grid"]');
const cell = (element, key) =>
  grid(element).shadowRoot.querySelector(`[data-cell="${key}"]`);
const palette = (element) => q(element, "c-shoresh-build-palette");
const chip = (element, id) =>
  palette(element).shadowRoot.querySelector(`button[data-id="${id}"]`);
const sentRuns = (call = 0) => saveSlots.mock.calls[call][0].edits[0].runs;

async function fire(target, type) {
  target.dispatchEvent(
    new CustomEvent(type, { bubbles: true, composed: true })
  );
  await flush();
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

describe("c-shoresh-manual-build: moving things", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("shows the activity list beside Daily and Group View, not Activity View", async () => {
    const element = await render();
    expect(palette(element)).not.toBeNull();
    expect(palette(element).heading).toBe("Activities");
    expect(palette(element).stillNeeded.map((c) => c.name)).toEqual(["Soccer"]);
    q(element, '[data-view="activity"]').click();
    await flush();
    expect(palette(element)).toBeNull();
  });

  it("an activity dragged from the list onto a slot is placed at its full length", async () => {
    const element = await render();
    await fire(chip(element, "a2"), "dragstart");
    await fire(cell(element, "1-2"), "drop");
    // Bunk 2 is not at camp at Lunch in the fixture: refused.
    expect(saveSlots).not.toHaveBeenCalled();
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      "Bunk 2 isn't at camp then."
    );
    await fire(chip(element, "a2"), "dragstart");
    await fire(cell(element, "0-2"), "drop");
    expect(sentRuns()).toEqual([
      {
        day: "2026-06-29",
        groupId: "g1",
        firstBlockId: "t3",
        before: [""],
        after: ["A:a2"]
      }
    ]);
    // Only one Period left before the day ends: placed as far as it goes, and said so.
    expect(q(element, '[data-id="announce"]').textContent).toBe(
      "Placed Boating · Bunk 1 · Monday · Lunch (1 of 2)"
    );
    expect(q(element, '[data-id="undo"]').title).toBe(
      "Undo: Placed Boating · Bunk 1 · Monday · Lunch (1 of 2)"
    );
  });

  it("a placement dragged onto an Open slot moves; onto a filled one they swap", async () => {
    const element = await render();
    await fire(cell(element, "0-1"), "dragstart");
    await fire(cell(element, "0-2"), "drop");
    expect(sentRuns(0)).toEqual([
      {
        day: "2026-06-29",
        groupId: "g1",
        firstBlockId: "t2",
        before: ["A:a1", ""],
        after: ["", "A:a1"]
      }
    ]);
    await render();
    const second = document.body.lastChild;
    await fire(cell(second, "0-1"), "dragstart");
    await fire(cell(second, "1-1"), "drop");
    expect(sentRuns(1)).toEqual([
      {
        day: "2026-06-29",
        groupId: "g1",
        firstBlockId: "t2",
        before: ["A:a1"],
        after: ["A:a3"]
      },
      {
        day: "2026-06-29",
        groupId: "g2",
        firstBlockId: "t2",
        before: ["A:a3"],
        after: ["A:a1"]
      }
    ]);
    expect(q(second, '[data-id="undo"]').title).toBe(
      "Undo: Swapped Swim and Soccer"
    );
  });

  it("a swap with a multi-block activity is refused in a few words", async () => {
    const element = await render(
      draft([FLAGPOLE, SWIM, BOATING], ["1,2,", "1,3,^"])
    );
    // Bunk 2's Boating runs two blocks, but Bunk 2 is away at Lunch in the fixture's setup;
    // the grid still shows what was saved.
    await fire(cell(element, "0-1"), "dragstart");
    await fire(cell(element, "1-1"), "drop");
    expect(saveSlots).not.toHaveBeenCalled();
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      "Only activities one Period long swap."
    );
  });

  it("a placement dragged back onto the list is taken out", async () => {
    const element = await render();
    await fire(cell(element, "1-1"), "dragstart");
    palette(element)
      .shadowRoot.querySelector('[data-id="palette"]')
      .dispatchEvent(new CustomEvent("drop"));
    await flush();
    expect(sentRuns()).toEqual([
      {
        day: "2026-06-29",
        groupId: "g2",
        firstBlockId: "t2",
        before: ["A:a3"],
        after: [""]
      }
    ]);
  });

  it("from the keyboard: Space picks up, arrows choose, Space puts down", async () => {
    const element = await render();
    await press(cell(element, "0-1"), " ");
    expect(cell(element, "0-1").className).toContain("cell_picked");
    expect(q(element, '[data-id="announce"]').textContent).toBe(
      "Swim picked up from Bunk 1 · Monday · Period 2."
    );
    await press(cell(element, "0-1"), "ArrowDown");
    await press(cell(element, "0-2"), " ");
    expect(sentRuns()[0].after).toEqual(["", "A:a1"]);
    expect(cell(element, "0-2").className).not.toContain("cell_picked");
  });

  it("a list activity picked with the keyboard is put down on a slot; Escape lets go", async () => {
    const element = await render();
    chip(element, "a3").click();
    await flush();
    expect(palette(element).pickedId).toBe("a3");
    await press(cell(element, "0-2"), "Escape");
    expect(palette(element).pickedId).toBeNull();
    expect(saveSlots).not.toHaveBeenCalled();
    chip(element, "a3").click();
    await flush();
    await press(cell(element, "0-2"), "Enter");
    expect(sentRuns()[0]).toMatchObject({
      firstBlockId: "t3",
      after: ["A:a3"]
    });
    // Enter put it down; the typing box did not open.
    expect(q(element, '[data-id="slot-editor"]')).toBeNull();
  });

  it("Shift with Down makes a placement longer, Shift with Up shorter", async () => {
    const element = await render();
    await press(cell(element, "0-1"), "ArrowDown", { shiftKey: true });
    expect(sentRuns(0)).toEqual([
      {
        day: "2026-06-29",
        groupId: "g1",
        firstBlockId: "t2",
        before: ["A:a1", ""],
        after: ["A:a1", "^A:a1"]
      }
    ]);
    expect(q(element, '[data-id="undo"]').title).toBe(
      "Undo: Swim runs 2 Periods · Bunk 1 · Monday · Period 2"
    );
    // A two-block Swim: Shift with Up takes its last block off.
    const longer = await render(draft([FLAGPOLE, SWIM], ["1,2,^", "1,,"]));
    await press(cell(longer, "0-1"), "ArrowUp", { shiftKey: true });
    expect(sentRuns(1)[0].after).toEqual(["A:a1", ""]);
  });

  it("the bottom handle dragged to a lower slot makes it reach there", async () => {
    const element = await render();
    const handle = cell(element, "0-1").querySelector("[data-handle]");
    await fire(handle, "dragstart");
    await fire(cell(element, "0-2"), "drop");
    expect(sentRuns()[0].after).toEqual(["A:a1", "^A:a1"]);
  });

  it("Undo sends the change back the other way, and Redo again; Ctrl+Z and Ctrl+Shift+Z too", async () => {
    const element = await render();
    expect(q(element, '[data-id="undo"]').disabled).toBe(true);
    await fire(cell(element, "1-1"), "dragstart");
    await fire(cell(element, "1-0"), "drop");
    // Flagpole stays where it is set up: refused, nothing to undo.
    expect(q(element, '[data-id="undo"]').disabled).toBe(true);
    await press(cell(element, "1-1"), "Delete");
    expect(q(element, '[data-id="undo"]').disabled).toBe(false);
    q(element, '[data-id="undo"]').click();
    await flush();
    expect(sentRuns(1)).toEqual([
      {
        day: "2026-06-29",
        groupId: "g2",
        firstBlockId: "t2",
        before: [""],
        after: ["A:a3"]
      }
    ]);
    expect(q(element, '[data-id="redo"]').title).toBe(
      "Redo: Cleared Bunk 2 · Monday · Period 2"
    );
    await press(cell(element, "1-1"), "z", { ctrlKey: true, shiftKey: true });
    expect(sentRuns(2)[0].after).toEqual([""]);
    await press(cell(element, "1-1"), "z", { metaKey: true });
    expect(sentRuns(3)[0].after).toEqual(["A:a3"]);
  });

  it("an Undo someone else's change got in the way of, kept as theirs, is gone from Undo", async () => {
    const element = await render();
    await press(cell(element, "0-1"), "Delete");
    // Meanwhile someone put Soccer there; my Undo (putting Swim back) conflicts.
    saveSlots.mockResolvedValueOnce({
      conflicts: [0],
      schedule: schedule([FLAGPOLE, SOCCER], ["1,2,", "1,2,"])
    });
    q(element, '[data-id="undo"]').click();
    await flush();
    expect(q(element, '[data-id="theirs"]').textContent).toBe("Soccer");
    q(element, '[data-id="keep-theirs"]').click();
    await flush();
    expect(q(element, '[data-id="undo"]').disabled).toBe(true);
    expect(q(element, '[data-id="redo"]').disabled).toBe(true);
  });

  it("Ctrl+Z typed in the Filter box doesn't undo a schedule change", async () => {
    const element = await render();
    await press(cell(element, "0-1"), "Delete");
    const filter = palette(element).shadowRoot.querySelector(
      '[data-id="palette-filter"]'
    );
    await press(filter, "z", { ctrlKey: true });
    expect(saveSlots).toHaveBeenCalledTimes(1);
  });

  it("a drag that ended without a drop can't act later", async () => {
    const element = await render();
    await fire(cell(element, "0-1"), "dragstart");
    await fire(cell(element, "0-1"), "dragend");
    palette(element)
      .shadowRoot.querySelector('[data-id="palette"]')
      .dispatchEvent(new CustomEvent("drop"));
    await flush();
    await fire(cell(element, "0-2"), "drop");
    expect(saveSlots).not.toHaveBeenCalled();
  });

  it("after Use yours, Undo takes back what was really saved", async () => {
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,,", "1,2,"]));
    // I place Swim in Bunk 1's Period 2; someone had put two-block Boating there.
    saveSlots.mockResolvedValueOnce({
      conflicts: [0],
      schedule: schedule([FLAGPOLE, SOCCER, BOATING], ["1,3,^", "1,2,"])
    });
    await fire(chip(element, "a1"), "dragstart");
    await fire(cell(element, "0-1"), "drop");
    q(element, '[data-id="use-yours"]').click();
    await flush();
    expect(sentRuns(1)[0]).toMatchObject({
      before: ["A:a2", "^A:a2"],
      after: ["A:a1", ""]
    });
    q(element, '[data-id="undo"]').click();
    await flush();
    // Boating comes back, all of it.
    expect(sentRuns(2)[0]).toMatchObject({
      before: ["A:a1", ""],
      after: ["A:a2", "^A:a2"]
    });
  });

  it("what was picked up is let go when the day, view, or bunk changes", async () => {
    const element = await render();
    await press(cell(element, "0-1"), " ");
    q(element, '[data-id="day-pills"] button:nth-child(2)').click();
    await flush();
    expect(cell(element, "0-1").className).not.toContain("cell_picked");
    await press(cell(element, "0-2"), " ");
    expect(saveSlots).not.toHaveBeenCalled();
  });

  it("a picked slot is selected for screen readers too", async () => {
    const element = await render();
    await press(cell(element, "0-1"), " ");
    expect(cell(element, "0-1").getAttribute("aria-selected")).toBe("true");
  });

  it("the handle dropped low on a multi-block cell keeps the blocks above", async () => {
    const element = await render(draft([FLAGPOLE, BOATING], ["1,2,^", "1,,"]));
    await fire(
      cell(element, "0-1").querySelector("[data-handle]"),
      "dragstart"
    );
    // The drop lands on Boating's own cell: near the top means Period 2 only.
    grid(element)
      .shadowRoot.querySelector('[data-cell="0-1"]')
      .dispatchEvent(
        new CustomEvent("drop", { bubbles: true, composed: true })
      );
    await flush();
    expect(sentRuns()[0].after).toEqual(["A:a2", ""]);
  });

  it("a click on the handle, then a click on a slot below, sets where it ends", async () => {
    const element = await render();
    cell(element, "0-1").querySelector("[data-handle]").click();
    await flush();
    expect(q(element, '[data-id="announce"]').textContent).toBe(
      "Swim: choose where it ends."
    );
    cell(element, "0-2").click();
    await flush();
    expect(sentRuns()[0].after).toEqual(["A:a1", "^A:a1"]);
  });
});
