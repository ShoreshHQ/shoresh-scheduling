/**
 * Hand editing on the Generated Schedule screen (ADR 0010 §38): the shared week editor embedded
 * with this screen's saver, locks, Lock menu and checks. One test per connection, each failing if
 * that connection is taken away. Synthetic data only.
 */
import { createElement } from "lwc";
import ShoreshGeneratedSchedule from "c/shoreshGeneratedSchedule";
import { find, editorRoot } from "shoresh-jest/week-editor";
import getInputs from "@salesforce/apex/GeneratedScheduleController.getInputs";
import saveWeekOnServer from "@salesforce/apex/GeneratedScheduleController.saveWeek";
import setLocksOnServer from "@salesforce/apex/GeneratedScheduleController.setLocks";
import saveSlots from "@salesforce/apex/GeneratedScheduleController.saveSlots";
import addOnGenerated from "@salesforce/apex/GeneratedScheduleController.addActivity";
import addOnManualBuild from "@salesforce/apex/ManualBuildController.addActivity";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";
import { PROGRAM, SCHEDULE, SMALL, WEEK, camp } from "./data/camp";
import { nextTurn } from "../pieces";

const apex = () => ({ default: jest.fn() });
jest.mock(
  "@salesforce/apex/GeneratedScheduleController.getInputs",
  () => apex(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/GeneratedScheduleController.saveWeek",
  () => apex(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/GeneratedScheduleController.setLocks",
  () => apex(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/GeneratedScheduleController.saveSlots",
  () => apex(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/GeneratedScheduleController.addActivity",
  () => apex(),
  { virtual: true }
);
jest.mock("@salesforce/apex/ManualBuildController.addActivity", () => apex(), {
  virtual: true
});

const SETUP = nsRecord({
  season: { Id: "a0Z000000000001AAA", Name: "Summer 2026" },
  weeks: [{ Id: WEEK, Name: "Week 1" }],
  programs: [
    {
      program: { Id: PROGRAM, Name: "Main", Monday__c: true },
      divisions: [
        {
          division: { Id: "a0D000000000001AAA", Name: "Juniors" },
          groups: [{ Id: "a0G000000000001AAA" }]
        }
      ],
      timeBlocks: [{ Id: "a0B000000000001AAA", Name: "Period 1" }]
    }
  ],
  activities: [{ Id: "a0A000000000001AAA", Name: "Swim" }],
  locations: []
});
const terms = buildTerms([
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true }
]);

const flush = () =>
  [...Array(10)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );
/** Gives the page turns until done() says yes (a build runs in pieces, between turns). */
async function until(done, tries = 200) {
  await flush();
  if (done() || !tries) {
    return;
  }
  await nextTurn();
  await until(done, tries - 1);
}
const slow = () => {
  const held = {};
  held.promise = new Promise((resolve) => {
    held.answer = resolve;
  });
  return held;
};

/**
 * A saved week (SMALL: Flag, Period 1, Period 2, Period 3; Bunk 2 mornings only): Bunk 1 swims in
 * Period 1 both days; rows and locks per day can be given.
 */
function savedWeek({ rows = ["1,2,,", "1,,,"], locks = [], revision } = {}) {
  const inputs = camp({ ...SMALL, scheduleId: SCHEDULE });
  const swim = {
    kind: "A",
    id: inputs.activities[0].Id,
    name: "Swim",
    gone: false
  };
  inputs.days = inputs.days.map((day, d) => ({
    ...day,
    items: [...day.items, swim],
    rows: d === 0 ? rows : ["1,2,,", "1,,,"],
    locks: locks[d] || undefined
  }));
  if (revision) {
    inputs.revision = revision;
  }
  return inputs;
}

/** saveSlots's answer: the week as saved now (Monday's rows and locks), at a revision. */
function slotAnswer(rows, mondayLocks, revision = "2026-06-29:2|2026-06-30:1") {
  const week = savedWeek({ rows });
  return {
    conflicts: [],
    revision,
    schedule: {
      schedule: { id: SCHEDULE },
      days: week.days.map((day, d) => ({
        ...day,
        locks: d === 0 ? mondayLocks : []
      }))
    }
  };
}

async function render(inputs = savedWeek()) {
  getInputs.mockResolvedValue(inputs);
  const element = createElement("c-shoresh-generated-schedule", {
    is: ShoreshGeneratedSchedule
  });
  element.terms = terms;
  element.setup = SETUP;
  document.body.appendChild(element);
  await flush();
  return element;
}

const q = (element, selector) => find(element, selector);
const editor = (element) => q(element, "c-shoresh-week-editor");
const grid = (element) => q(element, '[data-id="edit-grid"]');
const cellAt = (element, key) =>
  grid(element).shadowRoot.querySelector(`[data-cell="${key}"]`);
const textAt = (element, key) =>
  cellAt(element, key).querySelector(".cell-name").textContent;
const lockAt = (element, key) => {
  const icon = cellAt(element, key).querySelector(".cell-lock lightning-icon");
  return icon ? icon.alternativeText : null;
};
const menuLabels = (element) =>
  [...element.shadowRoot.querySelectorAll("lightning-menu-item")].map(
    (i) => i.label
  );
const action = (element, name) => q(element, `[data-action="${name}"]`);
const notice = (element) => {
  const line = editorRoot(element).querySelector('[data-id="notice"]');
  return line ? line.textContent : null;
};

async function press(target, key) {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, composed: true })
  );
  await flush();
}

/** Clears Bunk 1's Monday Period 1 (Swim) by hand. */
async function clearSwim(element) {
  await press(cellAt(element, "0-1"), "Delete");
}

describe("hand editing on the Generated Schedule screen", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.resetAllMocks();
  });

  it("draws the week in the shared editor, with Undo and the activity list", async () => {
    const element = await render();
    expect(editor(element)).not.toBeNull();
    expect(textAt(element, "0-1")).toBe("Swim");
    expect(q(element, '[data-id="undo"]')).not.toBeNull();
    expect(q(element, "c-shoresh-build-palette")).not.toBeNull();
  });

  it("keeps one toolbar, as on the desktop: the pickers, the views, Undo and Redo, then Rebuild", async () => {
    const element = await render();
    // No second row of the screen's own: the editor's toolbar holds it all.
    expect(element.shadowRoot.querySelector(".toolbar")).toBeNull();
    const toolbar = editorRoot(element).querySelector(".toolbar");
    const slotOf = (node) => node.assignedSlot;
    const pickers = slotOf(q(element, '[data-id="week"]'));
    const tools = slotOf(action(element, "Rebuild").parentElement);
    expect(pickers.name).toBe("pickers");
    expect(tools.name).toBe("tools");
    expect(slotOf(action(element, "StartOver"))).toBe(tools);
    expect(slotOf(q(element, '[data-id="lock-menu"]').parentElement)).toBe(
      tools
    );
    // In this order: the week, the views, Undo, Redo, then Rebuild (desktop: "Sits with undo/redo").
    const inOrder = [
      pickers,
      toolbar.querySelector(".view-toggle"),
      q(element, '[data-id="undo"]'),
      q(element, '[data-id="redo"]'),
      tools
    ];
    inOrder.forEach((node) => expect(toolbar.contains(node)).toBe(true));
    inOrder.reduce((before, after) => {
      expect(
        before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      return after;
    });
  });

  it("a hand edit is saved through Generated's slot save, naming the locks seen, and locks what it changes at once", async () => {
    const element = await render(savedWeek({ rows: ["1,,,", "1,,,"] }));
    saveSlots.mockReturnValue(new Promise(() => {}));
    // Bunk 1's Monday Period 2: Swim typed in.
    await press(cellAt(element, "0-2"), "Enter");
    const input = q(element, '[data-id="slot-input"]');
    input.value = "swim";
    input.dispatchEvent(new CustomEvent("input"));
    await flush();
    await press(input, "Enter");
    expect(saveSlots).toHaveBeenCalledTimes(1);
    const request = saveSlots.mock.calls[0][0];
    expect(request.scheduleId).toBe(SCHEDULE);
    expect(request.revision).toBe("2026-06-29:1");
    const [run] = request.edits[0].runs;
    expect(run.after).toEqual([`A:${savedWeek().activities[0].Id}`]);
    expect(run.locksBefore).toEqual([""]);
    // Shown at once, with its lock.
    expect(textAt(element, "0-2")).toBe("Swim");
    expect(lockAt(element, "0-2")).toBe("Locked");
    expect(saveWeekOnServer).not.toHaveBeenCalled();
  });

  it("the week saved by a hand edit replaces the screen's: Rebuild builds on its revision and locks", async () => {
    const element = await render();
    saveSlots.mockResolvedValue(
      slotAnswer(["1,,,", "1,,,"], [",,,", ",,,"], "2026-06-29:7|2026-06-30:1")
    );
    await clearSwim(element);
    expect(saveSlots).toHaveBeenCalledTimes(1);
    saveWeekOnServer.mockResolvedValue({
      conflict: false,
      scheduleId: SCHEDULE,
      revision: "2026-06-29:8|2026-06-30:2",
      versionId: null,
      locks: []
    });
    action(element, "Rebuild").click();
    await flush();
    q(element, '[data-id="confirm-go"]').click();
    await until(() => saveWeekOnServer.mock.calls.length > 0);
    await flush();
    expect(saveWeekOnServer.mock.calls[0][0].request.revision).toBe(
      "2026-06-29:7|2026-06-30:1"
    );
  });

  it("builds, Lock and the week picker wait while a hand edit saves", async () => {
    const element = await render();
    const held = slow();
    saveSlots.mockReturnValue(held.promise);
    await clearSwim(element);
    expect(action(element, "Rebuild").disabled).toBe(true);
    expect(action(element, "TryAnother").disabled).toBe(true);
    expect(q(element, '[data-id="lock-menu"]').disabled).toBe(true);
    expect(q(element, '[data-id="week"]').disabled).toBe(true);
    held.answer(slotAnswer(["1,,,", "1,,,"], [",,,", ",,,"]));
    await flush();
    expect(action(element, "Rebuild").disabled).toBe(false);
    expect(action(element, "TryAnother").disabled).toBe(false);
    expect(q(element, '[data-id="week"]').disabled).toBe(false);
  });

  it("a second hand edit made while the first saves is sent from the first's revision, and Rebuild from the second's", async () => {
    const element = await render();
    const first = slow();
    const second = slow();
    saveSlots
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    await clearSwim(element);
    // Bunk 1's Monday Period 2: Swim typed in while the clear still saves.
    await press(cellAt(element, "0-2"), "Enter");
    const input = q(element, '[data-id="slot-input"]');
    input.value = "swim";
    input.dispatchEvent(new CustomEvent("input"));
    await flush();
    await press(input, "Enter");
    expect(saveSlots).toHaveBeenCalledTimes(1);
    first.answer(
      slotAnswer(["1,,,", "1,,,"], [",,,", ",,,"], "2026-06-29:2|2026-06-30:1")
    );
    await flush();
    expect(saveSlots).toHaveBeenCalledTimes(2);
    expect(saveSlots.mock.calls[1][0].revision).toBe(
      "2026-06-29:2|2026-06-30:1"
    );
    second.answer(
      slotAnswer(
        ["1,1,,", "1,,,"],
        [",1,,", ",,,"],
        "2026-06-29:3|2026-06-30:1"
      )
    );
    await flush();
    saveWeekOnServer.mockResolvedValue({
      conflict: false,
      scheduleId: SCHEDULE,
      revision: "2026-06-29:4|2026-06-30:2",
      versionId: null,
      locks: []
    });
    action(element, "Rebuild").click();
    await flush();
    q(element, '[data-id="confirm-go"]').click();
    await until(() => saveWeekOnServer.mock.calls.length > 0);
    await flush();
    expect(saveWeekOnServer.mock.calls[0][0].request.revision).toBe(
      "2026-06-29:3|2026-06-30:1"
    );
  });

  it("shows the locks the week has, and the lock in the legend", async () => {
    const element = await render(savedWeek({ locks: [[",1,,", ",,,"]] }));
    expect(lockAt(element, "0-1")).toBe("Locked");
    expect(lockAt(element, "0-2")).toBeNull();
    expect(q(element, ".legend").textContent).toContain("Locked");
  });

  it("Enter on a locked cell doesn't unlock it: the Lock menu offers its Unlock, the line says it is locked, and focus stays on the cell", async () => {
    const element = await render(savedWeek({ locks: [[",1,,", ",,,"]] }));
    const cell = cellAt(element, "0-1");
    await press(cell, "Enter");
    expect(setLocksOnServer).not.toHaveBeenCalled();
    expect(q(element, '[data-id="slot-editor"]')).toBeNull();
    expect(menuLabels(element)).toContain("Unlock Bunk 1 · Monday · Period 1");
    expect(notice(element)).toBe("Bunk 1 · Monday · Period 1 is locked.");
    expect(grid(element).shadowRoot.activeElement).toBe(cell);
  });

  it("the cell keyboard focus reaches in the editor is the one the Lock menu offers", async () => {
    const element = await render();
    cellAt(element, "0-2").dispatchEvent(
      new CustomEvent("focusin", { bubbles: true, composed: true })
    );
    await flush();
    expect(menuLabels(element)).toContain("Lock Bunk 1 · Monday · Period 2");
  });

  it("an Unlock from the menu reaches the editor: the line saying it is locked goes, and the cell can be typed into again", async () => {
    const element = await render(savedWeek({ locks: [[",1,,", ",,,"]] }));
    await press(cellAt(element, "0-1"), "Enter");
    expect(notice(element)).toBe("Bunk 1 · Monday · Period 1 is locked.");
    const unlocked = savedWeek();
    setLocksOnServer.mockResolvedValue({
      conflict: false,
      revision: "2026-06-29:2|2026-06-30:1",
      schedule: {
        schedule: { id: SCHEDULE },
        days: unlocked.days.map((day) => ({ ...day, locks: [] }))
      }
    });
    const item = [
      ...element.shadowRoot.querySelectorAll("lightning-menu-item")
    ].find((i) => i.label === "Unlock Bunk 1 · Monday · Period 1");
    q(element, '[data-id="lock-menu"]').dispatchEvent(
      new CustomEvent("select", { detail: { value: item.value } })
    );
    await flush();
    expect(lockAt(element, "0-1")).toBeNull();
    expect(notice(element)).toBeNull();
    await press(cellAt(element, "0-1"), "Enter");
    expect(q(element, '[data-id="slot-editor"]')).not.toBeNull();
  });

  it("a dot follows the locks on screen while an edit saves: the over-limit dot skips the session just locked", async () => {
    // Swim (at most 2 a week) in Bunk 1's Period 1 on Monday and Tuesday; a third on Tuesday's
    // Period 2 is typed in and still saving. It is locked on screen, so the dot goes on the
    // latest unlocked session, Tuesday's Period 1, as the engine places it.
    const element = await render();
    saveSlots.mockReturnValue(new Promise(() => {}));
    q(element, '[data-id="day-pills"] button:nth-child(2)').click();
    await flush();
    await press(cellAt(element, "0-2"), "Enter");
    const input = q(element, '[data-id="slot-input"]');
    input.value = "swim";
    input.dispatchEvent(new CustomEvent("input"));
    await flush();
    await press(input, "Enter");
    expect(textAt(element, "0-2")).toBe("Swim");
    const dotAt = (key) => {
      const dot = cellAt(element, key).querySelector("c-shoresh-dot");
      return dot ? dot.label : "";
    };
    expect(dotAt("0-1")).toMatch(/weekly limit/);
    expect(dotAt("0-2")).not.toMatch(/weekly limit/);
  });

  it("after a build Undo starts over; after an Unlock the editor has the week as saved", async () => {
    const element = await render(savedWeek({ locks: [[",1,,", ",,,"]] }));
    saveSlots.mockResolvedValue(slotAnswer(["1,2,,", "1,,,"], [",1,,", ",,,"]));
    // A hand edit on Tuesday... (Bunk 1's Period 2, then undone later by a build).
    await press(cellAt(element, "0-2"), "Delete");
    setLocksOnServer.mockResolvedValue({
      conflict: false,
      revision: "2026-06-29:3|2026-06-30:1",
      schedule: {
        schedule: { id: SCHEDULE },
        days: savedWeek().days.map((day) => ({ ...day, locks: [] }))
      }
    });
    await press(cellAt(element, "0-1"), "Enter");
    const item = [
      ...element.shadowRoot.querySelectorAll("lightning-menu-item")
    ].find((i) => i.label === "Unlock Bunk 1 · Monday · Period 1");
    q(element, '[data-id="lock-menu"]').dispatchEvent(
      new CustomEvent("select", { detail: { value: item.value } })
    );
    await flush();
    expect(editor(element).savedWeek.days[0].locks).toEqual([]);
    // Fill the open cells: a build. Undo had a step; now it has none.
    await press(cellAt(element, "0-1"), "Delete");
    expect(q(element, '[data-id="undo"]').disabled).toBe(false);
    saveWeekOnServer.mockResolvedValue({
      conflict: false,
      scheduleId: SCHEDULE,
      revision: "2026-06-29:9|2026-06-30:9",
      versionId: null,
      locks: []
    });
    action(element, "TryAnother").click();
    await until(() => saveWeekOnServer.mock.calls.length > 0);
    await flush();
    expect(saveWeekOnServer).toHaveBeenCalled();
    expect(q(element, '[data-id="undo"]').disabled).toBe(true);
  });

  it("coming back to the window doesn't read the week over a typing box left open", async () => {
    const element = await render();
    await press(cellAt(element, "0-2"), "Enter");
    expect(q(element, '[data-id="slot-editor"]')).not.toBeNull();
    const reads = getInputs.mock.calls.length;
    window.dispatchEvent(new CustomEvent("focus"));
    await flush();
    expect(getInputs.mock.calls.length).toBe(reads);
  });

  it("the dots in the editor are Generated's own: an Open cell no activity fits shows the engine's reason", async () => {
    // Bunk 1's Monday: Swim, Art, then the one Open Period 3; every activity is two blocks long
    // here, so none fits it.
    const week = savedWeek({ rows: ["1,2,3,", "1,,,"] });
    const art = {
      kind: "A",
      id: week.activities[1].Id,
      name: "Art",
      gone: false
    };
    week.days = week.days.map((day) => ({
      ...day,
      items: [...day.items, art]
    }));
    const length = Object.keys(week.activities[0]).find((k) =>
      /Length__c$/.test(k)
    );
    week.activities = week.activities.map((a) => ({ ...a, [length]: 2 }));
    const element = await render(week);
    const dot = cellAt(element, "0-3").querySelector("c-shoresh-dot");
    expect(dot).not.toBeNull();
    expect(dot.label).toBe("No activity fits this gap");
  });

  it("a counter's lit cells are lit in the editor's grid", async () => {
    const element = await render(savedWeek({ rows: ["1,,,", "1,,,"] }));
    const checks = q(element, "c-shoresh-week-checks");
    checks.shadowRoot.querySelector('[data-counter="open"]').click();
    await flush();
    expect(cellAt(element, "0-2").className).toContain("cell_lit");
  });

  it("Add <name> to activities adds on the Generated draft, not Manual Build's, and places it", async () => {
    const element = await render(savedWeek({ rows: ["1,,,", "1,,,"] }));
    saveSlots.mockReturnValue(new Promise(() => {}));
    const archery = "a0A000000000009AAA";
    addOnGenerated.mockResolvedValue({
      id: archery,
      name: "Archery",
      length: 1,
      notFor: [],
      record: nsRecord({
        Id: archery,
        Name: "Archery",
        Length__c: 1,
        TimesPerWeekMin__c: 0,
        TimesPerWeekMax__c: 1,
        GroupsAtOnce__c: 1
      })
    });
    addOnManualBuild.mockResolvedValue({
      id: "a0A000000000008AAA",
      name: "Wrong draft",
      length: 1,
      notFor: []
    });
    await press(cellAt(element, "0-2"), "Enter");
    const input = q(element, '[data-id="slot-input"]');
    input.value = "Archery";
    input.dispatchEvent(new CustomEvent("input"));
    await flush();
    await press(input, "Enter");
    expect(addOnGenerated).toHaveBeenCalledWith({
      scheduleId: SCHEDULE,
      name: "Archery"
    });
    expect(addOnManualBuild).not.toHaveBeenCalled();
    expect(textAt(element, "0-2")).toBe("Archery");
    expect(saveSlots.mock.calls[0][0].edits[0].runs[0].after).toEqual([
      `A:${archery}`
    ]);
    // Known to the checks at once: counted in the activity list before the week is read again.
    expect(cellAt(element, "0-2").querySelector("c-shoresh-dot")).toBeNull();
    const palette = q(element, "c-shoresh-build-palette").shadowRoot;
    const chip = palette.querySelector(`[data-id="${archery}"]`);
    expect(chip.querySelector(".chip-count").textContent.trim()).toMatch(
      /^1 placed/
    );
    // Its setup is known too: a second Archery this week goes over its weekly limit of 1.
    await press(cellAt(element, "0-3"), "Enter");
    const again = q(element, '[data-id="slot-input"]');
    again.value = "Archery";
    again.dispatchEvent(new CustomEvent("input"));
    await flush();
    await press(again, "Enter");
    expect(textAt(element, "0-3")).toBe("Archery");
    const dots = [cellAt(element, "0-2"), cellAt(element, "0-3")]
      .map((c) => c.querySelector("c-shoresh-dot"))
      .filter(Boolean)
      .map((d) => d.label);
    expect(dots.join(" ")).toMatch(/weekly limit/);
  });

  it("an activity added while another edit saves is on the Activity View as this week's, not deleted, after both save", async () => {
    const element = await render();
    const first = slow();
    const archery = "a0A000000000009AAA";
    saveSlots
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(new Promise(() => {}));
    addOnGenerated.mockResolvedValue({
      id: archery,
      name: "Archery",
      length: 1,
      notFor: [],
      record: nsRecord({
        Id: archery,
        Name: "Archery",
        Length__c: 1,
        TimesPerWeekMin__c: 0,
        TimesPerWeekMax__c: 1,
        GroupsAtOnce__c: 1
      })
    });
    // Swim cleared (saving), then Archery added and typed into Period 2.
    await clearSwim(element);
    await press(cellAt(element, "0-2"), "Enter");
    const input = q(element, '[data-id="slot-input"]');
    input.value = "Archery";
    input.dispatchEvent(new CustomEvent("input"));
    await flush();
    await press(input, "Enter");
    expect(addOnGenerated).toHaveBeenCalled();
    first.answer(slotAnswer(["1,,,", "1,,,"], [",,,", ",,,"]));
    await flush();
    expect(saveSlots).toHaveBeenCalledTimes(2);
    q(element, '[data-view="activity"]').click();
    await flush();
    const cards = [
      ...editorRoot(element).querySelectorAll(
        '[data-id="activity-cards"] .card'
      )
    ];
    const card = cards.find((c) => c.dataset.key === archery);
    expect(card).toBeDefined();
    expect(card.textContent).not.toContain("deleted since");
  });

  it("a read of the week already on its way when a hand edit is made doesn't replace it", async () => {
    const element = await render();
    const read = slow();
    getInputs.mockReturnValueOnce(read.promise);
    window.dispatchEvent(new CustomEvent("focus"));
    await flush();
    saveSlots.mockResolvedValue(slotAnswer(["1,,,", "1,,,"], [",,,", ",,,"]));
    await clearSwim(element);
    read.answer(savedWeek());
    await flush();
    expect(textAt(element, "0-1")).toBe("Open");
  });

  it("a hand edit the server refuses says why, and the week is read again", async () => {
    const element = await render();
    saveSlots.mockRejectedValue({
      body: { message: "Group A isn't at camp." }
    });
    const reads = getInputs.mock.calls.length;
    await clearSwim(element);
    expect(q(element, '[data-id="build-error"]').textContent).toContain(
      "Not saved"
    );
    expect(getInputs.mock.calls.length).toBe(reads + 1);
  });

  it("an edit waits while a Lock is saved", async () => {
    const element = await render();
    setLocksOnServer.mockReturnValue(new Promise(() => {}));
    cellAt(element, "0-1").dispatchEvent(
      new CustomEvent("focusin", { bubbles: true, composed: true })
    );
    await flush();
    const item = [
      ...element.shadowRoot.querySelectorAll("lightning-menu-item")
    ].find((i) => i.label === "Lock Bunk 1 · Monday · Period 1");
    q(element, '[data-id="lock-menu"]').dispatchEvent(
      new CustomEvent("select", { detail: { value: item.value } })
    );
    await flush();
    await clearSwim(element);
    expect(saveSlots).not.toHaveBeenCalled();
    expect(notice(element)).toBe(
      "One moment: the week is being saved or restored."
    );
  });

  it("an edit waits while a build is saved", async () => {
    const element = await render();
    saveWeekOnServer.mockReturnValue(new Promise(() => {}));
    action(element, "TryAnother").click();
    await flush();
    expect(saveWeekOnServer).toHaveBeenCalledTimes(1);
    await clearSwim(element);
    expect(saveSlots).not.toHaveBeenCalled();
    expect(textAt(element, "0-1")).toBe("Swim");
    expect(notice(element)).toBe(
      "One moment: the week is being saved or restored."
    );
  });

  it("the setup read again while an edit saves waits for it, then reads the week", async () => {
    const element = await render();
    const held = slow();
    saveSlots.mockReturnValue(held.promise);
    await clearSwim(element);
    const reads = getInputs.mock.calls.length;
    element.setup = { ...SETUP };
    await flush();
    expect(getInputs.mock.calls.length).toBe(reads);
    held.answer(slotAnswer(["1,,,", "1,,,"], [",,,", ",,,"]));
    await flush();
    expect(getInputs.mock.calls.length).toBe(reads + 1);
  });
});
