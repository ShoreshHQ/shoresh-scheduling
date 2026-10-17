import { createElement } from "lwc";
import ShoreshManualBuild from "c/shoreshManualBuild";
import getDraft from "@salesforce/apex/ManualBuildController.getDraft";
import saveSlots from "@salesforce/apex/ManualBuildController.saveSlots";
import { buildTerms } from "c/shoreshTerms";
import { draft, schedule } from "./data/draftFixture";
import {
  listedCells,
  useYoursSendsWhatWasShown as shownIsSent
} from "./data/shownIsSent";

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

function later() {
  let answer;
  const promise = new Promise((resolve) => {
    answer = resolve;
  });
  return { promise, answer };
}

const flush = () =>
  [...Array(10)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

// Monday: Bunk 1 has Swim in Period 2; Bunk 2 has Soccer in Period 2.
const MONDAY_ITEMS = [FLAGPOLE, SWIM, SOCCER];
const MONDAY_ROWS = ["1,2,", "1,3,"];

// The week as the director saw it: each test's saves answer with it.
let lastStart;

async function render(start = draft(MONDAY_ITEMS, MONDAY_ROWS)) {
  lastStart = start;
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
/** The cells the question lists, as "day|group|block" positions. */
const rowCells = (element) => listedCells(element);

/** Use yours sends a change to exactly the cells the question listed (and to nothing unseen). */
const useYoursSendsWhatWasShown = (element) =>
  shownIsSent(element, saveSlots, lastStart.schedule, flush);

async function fire(target, type) {
  target.dispatchEvent(new CustomEvent(type, { bubbles: true }));
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
      "Longer activities don't swap."
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
    const handle = cell(element, "0-1").querySelector("[data-handle-bar]");
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
    // A real dragend crosses into the page (composed), as the browser sends it.
    cell(element, "0-1").dispatchEvent(
      new CustomEvent("dragend", { bubbles: true, composed: true })
    );
    await flush();
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
    // Their Boating's Lunch would be cleared too: it is listed, not done unseen.
    expect(rowCells(element)).toEqual(["0|0|1", "0|0|2"]);
    expect(
      [
        ...q(element, '[data-id="conflict"]').querySelectorAll(
          '[data-id="yours"]'
        )
      ].map((d) => d.textContent)
    ).toEqual(["Swim", "Open"]);
    await useYoursSendsWhatWasShown(element);
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
      cell(element, "0-1").querySelector("[data-handle-bar]"),
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

  it("when a swap meets someone else's change, the question lists every cell that differs", async () => {
    const element = await render();
    // Someone put Boating in both Bunk 1's and Bunk 2's Period 2.
    saveSlots.mockResolvedValueOnce({
      conflicts: [0],
      schedule: schedule([FLAGPOLE, BOATING], ["1,2,", "1,2,"])
    });
    await fire(cell(element, "0-1"), "dragstart");
    await fire(cell(element, "1-1"), "drop");
    const rows = [
      ...q(element, '[data-id="conflict"]').querySelectorAll(".conflict-row")
    ].map((row) =>
      [...row.querySelectorAll("p, dt, dd")].map((n) => n.textContent).join(" ")
    );
    expect(rows).toEqual([
      "Bunk 1 · Monday · Period 2 Theirs Boating Yours Soccer",
      "Bunk 2 · Monday · Period 2 Theirs Boating Yours Swim"
    ]);
    expect(q(element, '[data-id="announce"]').textContent).toBe(
      "2 cells changed since you opened it."
    );
    await useYoursSendsWhatWasShown(element);
  });

  it("when a move meets someone else's change, the cell it leaves is listed too", async () => {
    const element = await render();
    saveSlots.mockResolvedValueOnce({
      conflicts: [0],
      schedule: schedule([FLAGPOLE, BOATING], ["1,2,", "1,,2"])
    });
    // Swim moves down to Bunk 1's Lunch; someone had put Boating where it was.
    await fire(cell(element, "0-1"), "dragstart");
    await fire(cell(element, "0-2"), "drop");
    const wheres = [
      ...q(element, '[data-id="conflict"]').querySelectorAll(".conflict-where")
    ].map((w) => w.textContent);
    expect(wheres).toEqual(["Bunk 1 · Monday · Period 2"]);
    expect(q(element, '[data-id="theirs"]').textContent).toBe("Boating");
  });

  it("an Undo of a swap that meets someone else's change lists both cells", async () => {
    const element = await render();
    await fire(cell(element, "0-1"), "dragstart");
    await fire(cell(element, "1-1"), "drop");
    saveSlots.mockResolvedValueOnce({
      conflicts: [0],
      schedule: schedule([FLAGPOLE, BOATING], ["1,2,", "1,2,"])
    });
    q(element, '[data-id="undo"]').click();
    await flush();
    expect(
      q(element, '[data-id="conflict"]').querySelectorAll(".conflict-row")
        .length
    ).toBe(2);
  });

  it("Use yours drops an Undo of the same change still waiting, and Undo stays true", async () => {
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,,", "1,2,"]));
    const placing = later();
    saveSlots.mockReturnValueOnce(placing.promise);
    await fire(chip(element, "a1"), "dragstart");
    await fire(cell(element, "0-1"), "drop");
    // Undo straight away, while the placing is still saving.
    await press(cell(element, "0-1"), "z", { ctrlKey: true });
    // Someone had put two-block Boating there.
    placing.answer({
      conflicts: [0],
      schedule: schedule([FLAGPOLE, SOCCER, BOATING], ["1,3,^", "1,2,"])
    });
    await flush();
    await useYoursSendsWhatWasShown(element);
    // Only the Use yours went: the waiting Undo was dropped.
    expect(saveSlots).toHaveBeenCalledTimes(2);
    expect(sentRuns(1)[0]).toMatchObject({
      before: ["A:a2", "^A:a2"],
      after: ["A:a1", ""]
    });
    expect(q(element, '[data-id="undo"]').title).toBe(
      "Undo: Placed Swim · Bunk 1 · Monday · Period 2"
    );
  });

  it("Use yours on an Undo's question doesn't make an Undo of an Undo", async () => {
    const element = await render();
    await press(cell(element, "0-1"), "Delete");
    saveSlots.mockResolvedValueOnce({
      conflicts: [0],
      schedule: schedule([FLAGPOLE, SOCCER], ["1,2,", "1,2,"])
    });
    q(element, '[data-id="undo"]').click();
    await flush();
    await useYoursSendsWhatWasShown(element);
    expect(q(element, '[data-id="undo"]').title).toBe("Undo");
    expect(q(element, '[data-id="undo"]').disabled).toBe(true);
  });

  it("a swap never sends an activity to where its new bunk isn't at camp", async () => {
    // Swim left in Bunk 2's Lunch (Bunk 2 isn't at camp then), Soccer in Bunk 1's Period 2.
    const element = await render(
      draft([FLAGPOLE, SWIM, SOCCER], ["1,3,", "1,,2"])
    );
    await fire(cell(element, "1-2"), "dragstart");
    await fire(cell(element, "0-1"), "drop");
    expect(saveSlots).not.toHaveBeenCalled();
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      "Bunk 2 isn't at camp then."
    );
    expect(q(element, '[data-id="build-error"]')).toBeNull();
  });

  it("Space on a fixed activity says it stays put", async () => {
    const element = await render();
    await press(cell(element, "0-0"), " ");
    expect(q(element, '[data-id="announce"]').textContent).toBe(
      "Flagpole stays where it is set up."
    );
  });

  it("a length ending in another bunk, or before it starts, says so", async () => {
    const element = await render();
    cell(element, "0-1").querySelector("[data-handle]").click();
    await flush();
    cell(element, "1-2").click();
    await flush();
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      "Swim can only change length within Bunk 1 · Monday."
    );
    cell(element, "0-1").querySelector("[data-handle]").click();
    await flush();
    cell(element, "0-0").click();
    await flush();
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      "Swim can't end before it starts."
    );
    expect(saveSlots).not.toHaveBeenCalled();
  });

  it("placing after the start of their longer activity lists the part of theirs before it", async () => {
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,,", "1,2,"]));
    // Someone had put two-block Boating in Bunk 1's Period 2 and Lunch; I drop Swim on Lunch.
    saveSlots.mockResolvedValueOnce({
      conflicts: [0],
      schedule: schedule([FLAGPOLE, SOCCER, BOATING], ["1,3,^", "1,2,"])
    });
    await fire(chip(element, "a1"), "dragstart");
    await fire(cell(element, "0-2"), "drop");
    expect(rowCells(element)).toEqual(["0|0|1", "0|0|2"]);
    const yours = [
      ...q(element, '[data-id="conflict"]').querySelectorAll(
        '[data-id="yours"]'
      )
    ].map((d) => d.textContent);
    expect(yours).toEqual(["Open", "Swim"]);
    await useYoursSendsWhatWasShown(element);
  });

  it("with something picked up, a click on another placement's handle puts it down there", async () => {
    const element = await render();
    await press(cell(element, "1-1"), " ");
    cell(element, "0-1").querySelector("[data-handle]").click();
    await flush();
    // Soccer swapped with Swim, rather than Swim's length being picked up instead.
    expect(sentRuns()).toHaveLength(2);
    expect(q(element, '[data-id="announce"]').textContent).not.toContain(
      "choose where it ends"
    );
  });

  it("a drag that starts in the handle's click area but off the bar is a move", async () => {
    const element = await render();
    await fire(
      cell(element, "0-1").querySelector("[data-handle]"),
      "dragstart"
    );
    await fire(cell(element, "0-2"), "drop");
    expect(sentRuns()[0]).toMatchObject({
      before: ["A:a1", ""],
      after: ["", "A:a1"]
    });
  });

  it("Use yours on a Redo leaves the change there to undo", async () => {
    const element = await render();
    await press(cell(element, "0-1"), "Delete");
    q(element, '[data-id="undo"]').click();
    await flush();
    saveSlots.mockResolvedValueOnce({
      conflicts: [0],
      schedule: schedule([FLAGPOLE, SOCCER], ["1,2,", "1,2,"])
    });
    q(element, '[data-id="redo"]').click();
    await flush();
    await useYoursSendsWhatWasShown(element);
    expect(q(element, '[data-id="undo"]').title).toBe(
      "Undo: Cleared Bunk 1 · Monday · Period 2"
    );
  });

  it("Space on a fixed activity says it stays put, on the quiet line too", async () => {
    const element = await render();
    await press(cell(element, "0-0"), " ");
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      "Flagpole stays where it is set up."
    );
  });

  it("after Use yours, the director's saved change can always be undone", async () => {
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,,", "1,2,"]));
    const placing = later();
    saveSlots.mockReturnValueOnce(placing.promise);
    // Swim placed, undone at once, and Soccer placed elsewhere, all before Swim's save answers.
    await fire(chip(element, "a1"), "dragstart");
    await fire(cell(element, "0-1"), "drop");
    await press(cell(element, "0-1"), "z", { ctrlKey: true });
    await fire(chip(element, "a3"), "dragstart");
    await fire(cell(element, "0-2"), "drop");
    // Swim's save meets someone's Boating.
    placing.answer({
      conflicts: [0],
      schedule: schedule([FLAGPOLE, SOCCER, BOATING], ["1,3,", "1,2,"])
    });
    await flush();
    await useYoursSendsWhatWasShown(element);
    expect(q(element, '[data-id="undo"]').title).toBe(
      "Undo: Placed Swim · Bunk 1 · Monday · Period 2"
    );
  });

  it("a Redo dropped by Use yours is said, and stays on the line after the save", async () => {
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,,", "1,2,"]));
    const placing = later();
    saveSlots.mockReturnValueOnce(placing.promise);
    await fire(chip(element, "a1"), "dragstart");
    await fire(cell(element, "0-1"), "drop");
    await press(cell(element, "0-1"), "z", { ctrlKey: true });
    await press(cell(element, "0-1"), "z", { ctrlKey: true, shiftKey: true });
    placing.answer({
      conflicts: [0],
      schedule: schedule([FLAGPOLE, SOCCER, BOATING], ["1,3,", "1,2,"])
    });
    await flush();
    await useYoursSendsWhatWasShown(element);
    expect(q(element, '[data-id="notice"]').textContent).toBe("Redo skipped.");
    expect(q(element, '[data-id="announce"]').textContent).toBe(
      "Placed Swim · Bunk 1 · Monday · Period 2. Redo skipped."
    );
  });

  it("after a cell left the week, Undo doesn't offer the change that never saved, and doesn't break", async () => {
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,,", "1,2,"]));
    const shorter = schedule([FLAGPOLE, SOCCER], ["1,", "1,2"]);
    shorter.days[0] = {
      ...shorter.days[0],
      blocks: shorter.days[0].blocks.slice(0, 2)
    };
    saveSlots.mockResolvedValueOnce({ conflicts: [0], schedule: shorter });
    // Two-block Boating dropped on Bunk 1's Period 2; Lunch was taken out of the day meanwhile.
    await fire(chip(element, "a2"), "dragstart");
    await fire(cell(element, "0-1"), "drop");
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      "Bunk 1 · Monday · Lunch isn't in the week any more."
    );
    expect(q(element, '[data-id="undo"]').disabled).toBe(true);
    await press(cell(element, "0-1"), "z", { ctrlKey: true });
    await press(cell(element, "0-1"), "z", { ctrlKey: true, shiftKey: true });
    expect(saveSlots).toHaveBeenCalledTimes(1);
  });

  it("an Undo of a change whose block has gone says it can't, instead of breaking", async () => {
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,,", "1,2,"]));
    const shorter = schedule([FLAGPOLE, SWIM, SOCCER], ["1,", "1,3"]);
    shorter.days[0] = {
      ...shorter.days[0],
      blocks: shorter.days[0].blocks.slice(0, 2)
    };
    // Swim placed in Lunch and saved; the server's answer no longer has Lunch.
    saveSlots.mockResolvedValueOnce({ conflicts: [], schedule: shorter });
    await fire(chip(element, "a1"), "dragstart");
    await fire(cell(element, "0-2"), "drop");
    await press(cell(element, "0-1"), "z", { ctrlKey: true });
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      "Can't undo Placed Swim · Bunk 1 · Monday · Lunch: the week has changed."
    );
    expect(saveSlots).toHaveBeenCalledTimes(1);
    expect(q(element, '[data-id="undo"]').disabled).toBe(true);
  });

  it("a time block added inside the change says the bunk's day changed, and nothing saves", async () => {
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,,", "1,2,"]));
    const wider = schedule([FLAGPOLE, SOCCER], ["1,,,", "1,2,,"]);
    const blocks = wider.days[0].blocks;
    wider.days[0] = {
      ...wider.days[0],
      blocks: [
        blocks[0],
        blocks[1],
        {
          id: "t9",
          name: "Rest",
          startTime: "11:00",
          endTime: "11:30",
          gone: false
        },
        blocks[2]
      ]
    };
    saveSlots.mockResolvedValueOnce({ conflicts: [0], schedule: wider });
    await fire(chip(element, "a2"), "dragstart");
    await fire(cell(element, "0-1"), "drop");
    expect(q(element, '[data-id="conflict"]')).toBeNull();
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      "Bunk 1 · Monday has changed. Try again."
    );
    expect(saveSlots).toHaveBeenCalledTimes(1);
    expect(q(element, '[data-id="undo"]').disabled).toBe(true);
  });

  it("a fixed activity now where the change goes stays, and says so", async () => {
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,,", "1,2,"]));
    saveSlots.mockResolvedValueOnce({
      conflicts: [0],
      schedule: schedule([FLAGPOLE, SOCCER], ["1,1,", "1,2,"])
    });
    await fire(chip(element, "a1"), "dragstart");
    await fire(cell(element, "0-1"), "drop");
    expect(q(element, '[data-id="conflict"]')).toBeNull();
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      "Flagpole stays where it is set up."
    );
  });

  it("Redo skipped is kept through a second question", async () => {
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,,", "1,2,"]));
    const placing = later();
    saveSlots.mockReturnValueOnce(placing.promise);
    await fire(chip(element, "a1"), "dragstart");
    await fire(cell(element, "0-1"), "drop");
    await press(cell(element, "0-1"), "z", { ctrlKey: true });
    await press(cell(element, "0-1"), "z", { ctrlKey: true, shiftKey: true });
    placing.answer({
      conflicts: [0],
      schedule: schedule([FLAGPOLE, SOCCER, BOATING], ["1,3,", "1,2,"])
    });
    await flush();
    // Use yours meets yet another change (Soccer there now).
    saveSlots.mockResolvedValueOnce({
      conflicts: [0],
      schedule: schedule([FLAGPOLE, SOCCER], ["1,2,", "1,2,"])
    });
    await useYoursSendsWhatWasShown(element);
    await useYoursSendsWhatWasShown(element);
    expect(q(element, '[data-id="notice"]').textContent).toBe("Redo skipped.");
  });

  it("an Undo after the screen refreshed to someone else's change asks before replacing it", async () => {
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,,", "1,2,"]));
    // Swim placed and saved; by the answer, someone has changed it to Soccer.
    const theirs = schedule([FLAGPOLE, SOCCER], ["1,2,", "1,2,"]);
    saveSlots.mockResolvedValueOnce({ conflicts: [], schedule: theirs });
    await fire(chip(element, "a1"), "dragstart");
    await fire(cell(element, "0-1"), "drop");
    expect(q(element, '[data-id="undo"]').title).toBe(
      "Undo: Placed Swim · Bunk 1 · Monday · Period 2"
    );
    saveSlots.mockResolvedValueOnce({ conflicts: [0], schedule: theirs });
    await press(cell(element, "0-1"), "z", { ctrlKey: true });
    // The Undo expects Swim there: Soccer is someone else's, so it is asked about.
    expect(sentRuns(1)[0].before).toEqual(["A:a1"]);
    expect(rowCells(element)).toEqual(["0|0|1"]);
    expect(q(element, '[data-id="theirs"]').textContent).toBe("Soccer");
    await useYoursSendsWhatWasShown(element);
  });

  it("a Redo after the screen refreshed to someone else's change asks before replacing it", async () => {
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,,", "1,2,"]));
    saveSlots.mockResolvedValueOnce({
      conflicts: [],
      schedule: schedule([FLAGPOLE, SWIM, SOCCER], ["1,2,", "1,3,"])
    });
    await fire(chip(element, "a1"), "dragstart");
    await fire(cell(element, "0-1"), "drop");
    // Undone and saved; by the answer, someone has put Soccer there.
    const theirs = schedule([FLAGPOLE, SOCCER], ["1,2,", "1,2,"]);
    saveSlots.mockResolvedValueOnce({ conflicts: [], schedule: theirs });
    await press(cell(element, "0-1"), "z", { ctrlKey: true });
    saveSlots.mockResolvedValueOnce({ conflicts: [0], schedule: theirs });
    await press(cell(element, "0-1"), "z", { ctrlKey: true, shiftKey: true });
    expect(sentRuns(2)[0].before).toEqual([""]);
    expect(rowCells(element)).toEqual(["0|0|1"]);
    expect(q(element, '[data-id="theirs"]').textContent).toBe("Soccer");
    q(element, '[data-id="keep-theirs"]').click();
    await flush();
    expect(saveSlots).toHaveBeenCalledTimes(3);
    expect(q(element, '[data-id="redo"]').disabled).toBe(true);
  });

  it("a change that couldn't be made stays on the line while the next one saves", async () => {
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,,", "1,2,"]));
    const placing = later();
    const clearing = later();
    const placingAgain = later();
    saveSlots
      .mockReturnValueOnce(placing.promise)
      .mockReturnValueOnce(clearing.promise)
      .mockReturnValueOnce(placingAgain.promise);
    await fire(chip(element, "a1"), "dragstart");
    await fire(cell(element, "0-1"), "drop");
    await press(cell(element, "1-1"), "Delete");
    await fire(chip(element, "a1"), "dragstart");
    await fire(cell(element, "0-2"), "drop");
    placing.answer({
      conflicts: [0],
      schedule: schedule([FLAGPOLE, SOCCER], ["1,1,", "1,2,"])
    });
    await flush();
    clearing.answer({
      conflicts: [],
      schedule: schedule([FLAGPOLE, SOCCER], ["1,1,", "1,,"])
    });
    await flush();
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      "Flagpole stays where it is set up."
    );
    // Said again with the first save after it, which would otherwise talk over it…
    expect(q(element, '[data-id="announce"]').textContent.trim()).toBe(
      "Cleared Bunk 2 · Monday · Period 2. Flagpole stays where it is set up."
    );
    // …and only that one; it stays on the line.
    placingAgain.answer({
      conflicts: [],
      schedule: schedule([FLAGPOLE, SWIM], ["1,1,2", "1,,"])
    });
    await flush();
    expect(saveSlots).toHaveBeenCalledTimes(3);
    expect(q(element, '[data-id="announce"]').textContent.trim()).toBe(
      "Placed Swim · Bunk 1 · Monday · Lunch"
    );
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      "Flagpole stays where it is set up."
    );
    // The director's next change clears it.
    await press(cell(element, "1-1"), "z", { ctrlKey: true });
    expect(q(element, '[data-id="notice"]')).toBeNull();
  });

  it("a refused Undo says it can't be undone, not to try again", async () => {
    const element = await render(draft([FLAGPOLE, SOCCER], ["1,,", "1,2,"]));
    await fire(chip(element, "a1"), "dragstart");
    await fire(cell(element, "0-1"), "drop");
    // Flagpole is now set up where the Undo goes.
    saveSlots.mockResolvedValueOnce({
      conflicts: [0],
      schedule: schedule([FLAGPOLE, SOCCER], ["1,1,", "1,2,"])
    });
    await press(cell(element, "0-1"), "z", { ctrlKey: true });
    expect(q(element, '[data-id="conflict"]')).toBeNull();
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      "Can't undo Placed Swim · Bunk 1 · Monday · Period 2: Flagpole stays where it is set up."
    );
    expect(q(element, '[data-id="redo"]').disabled).toBe(true);
  });
});
