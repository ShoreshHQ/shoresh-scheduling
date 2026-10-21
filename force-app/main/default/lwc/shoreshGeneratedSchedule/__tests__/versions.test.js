/**
 * Versions on the Generated Schedule screen (ADR 0010 "Choices (Versions)"), as on Manual Build
 * (ADR 0008 part 4b): the week's versions in the shared list, Save version, Restore (the week read
 * again with the version's locks and option, Undo started over), rename, and delete (never for a
 * copy ever published). Versions wait for builds, reads, hand edits, Lock and Publish, and they
 * wait for Versions. One test per connection, each failing if that connection is taken away.
 * Synthetic data only.
 */
import { createElement } from "lwc";
import ShoreshGeneratedSchedule from "c/shoreshGeneratedSchedule";
import { editorRoot, find, lockRows } from "shoresh-jest/week-editor";
import getInputs from "@salesforce/apex/GeneratedScheduleController.getInputs";
import saveWeekOnServer from "@salesforce/apex/GeneratedScheduleController.saveWeek";
import setLocksOnServer from "@salesforce/apex/GeneratedScheduleController.setLocks";
import saveSlots from "@salesforce/apex/GeneratedScheduleController.saveSlots";
import previewPublish from "@salesforce/apex/GeneratedScheduleController.previewPublish";
import publish from "@salesforce/apex/GeneratedScheduleController.publish";
import unpublish from "@salesforce/apex/GeneratedScheduleController.unpublish";
import saveVersion from "@salesforce/apex/GeneratedScheduleController.saveVersion";
import restoreVersion from "@salesforce/apex/GeneratedScheduleController.restoreVersion";
import restoreVersionAsNew from "@salesforce/apex/GeneratedScheduleController.restoreVersionAsNew";
import deleteVersion from "@salesforce/apex/GeneratedScheduleController.deleteVersion";
import getVersions from "@salesforce/apex/SchedulesController.getVersions";
import renameSchedule from "@salesforce/apex/SchedulesController.renameSchedule";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";
import { PROGRAM, SCHEDULE, WEEK, camp } from "./data/camp";
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
  "@salesforce/apex/GeneratedScheduleController.previewPublish",
  () => apex(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/GeneratedScheduleController.publish",
  () => apex(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/GeneratedScheduleController.unpublish",
  () => apex(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/GeneratedScheduleController.saveVersion",
  () => apex(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/GeneratedScheduleController.restoreVersion",
  () => apex(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/GeneratedScheduleController.restoreVersionAsNew",
  () => apex(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/GeneratedScheduleController.deleteVersion",
  () => apex(),
  { virtual: true }
);
jest.mock("@salesforce/apex/SchedulesController.getVersions", () => apex(), {
  virtual: true
});
jest.mock("@salesforce/apex/SchedulesController.renameSchedule", () => apex(), {
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

const REVISION = "2026-06-29:1";
const RESTORED_AT = "2026-06-29:4";
const MINE = "a0S000000000021AAA";
const HISTORY = "a0S000000000022AAA";
const VERSIONS = [
  {
    id: MINE,
    name: "Before the trip",
    origin: "Generated",
    reason: "SavedByHand",
    savedAt: "2026-10-18T13:00:00.000Z",
    publishedAt: null,
    namedByPublish: false
  },
  {
    id: HISTORY,
    name: "Published Oct 18, 10:04 AM",
    origin: "Manual",
    reason: null,
    savedAt: "2026-10-18T14:04:00.000Z",
    publishedAt: "2026-10-18T14:04:00.000Z",
    namedByPublish: true
  }
];

const flush = () =>
  [...Array(10)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );
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
 * One bunk, one day, Flag then Period 1 holding Swim: a generated week. locked: Period 1 locked
 * (as a restored version may bring it). option and revision as the server would send them.
 */
function week({ locked = false, option = 1, revision = REVISION } = {}) {
  const inputs = camp({
    bunks: [{ name: "Bunk 1" }],
    days: 1,
    blocks: [
      { name: "Flag", start: "08:30", end: "09:00" },
      { name: "Period 1", start: "09:00", end: "10:00" }
    ],
    activities: [{ name: "Swim", min: 0, max: 5, atOnce: 1 }],
    scheduleId: SCHEDULE,
    option
  });
  inputs.revision = revision;
  inputs.days = inputs.days.map((day) => ({
    ...day,
    items: [
      ...day.items,
      { kind: "A", id: inputs.activities[0].Id, name: "Swim", gone: false }
    ],
    rows: ["1,2"],
    locks: locked ? [",1"] : undefined
  }));
  return inputs;
}

async function render(inputs = week()) {
  getInputs.mockResolvedValue(inputs);
  getVersions.mockResolvedValue(VERSIONS);
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
const versions = (element) => q(element, '[data-id="versions"]');
const action = (element, name) => q(element, `[data-action="${name}"]`);
const publishButton = (element) => q(element, '[data-id="publish"]');
const notice = (element) => {
  const line = editorRoot(element).querySelector('[data-id="notice"]');
  return line ? line.textContent : null;
};
const grid = (element) => q(element, '[data-id="edit-grid"]');
const cellAt = (element, key) =>
  grid(element).shadowRoot.querySelector(`[data-cell="${key}"]`);
const lockAt = (element, key) => {
  const icon = cellAt(element, key).querySelector(".cell-lock lightning-icon");
  return icon ? icon.alternativeText : null;
};
async function press(target, key) {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, composed: true })
  );
  await flush();
}
async function fire(element, name, detail) {
  versions(element).dispatchEvent(new CustomEvent(name, { detail }));
  await flush();
}
const restore = (element, id = MINE) => fire(element, "open", { id });
/** The list's own rows, as drawn in the shared component. */
const rows = (element) =>
  [...versions(element).shadowRoot.querySelectorAll(".version")].map((row) =>
    row.textContent.replace(/\s+/g, " ").trim()
  );
async function openList(element) {
  versions(element)
    .shadowRoot.querySelector('[data-id="versions-button"]')
    .click();
  await flush();
}

const PUBLISHED = {
  id: "a0S000000000009AAA",
  publishedAt: "2026-10-18T14:04:00.000Z",
  publishedBy: "Pat",
  origin: "Generated"
};

/** Swim cleared from Period 1 by hand and saved: a step Undo could take back. */
async function undoStep(element) {
  const cleared = week();
  saveSlots.mockResolvedValue({
    conflicts: [],
    revision: "2026-06-29:2",
    schedule: {
      schedule: { id: SCHEDULE },
      days: cleared.days.map((day) => ({ ...day, rows: ["1,"], locks: [] }))
    }
  });
  await press(cellAt(element, "0-1"), "Delete");
  await until(() => saveSlots.mock.calls.length > 0);
  await flush();
  expect(q(element, '[data-id="undo"]').disabled).toBe(false);
}

describe("Versions on the Generated Schedule screen", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.resetAllMocks();
  });

  it("sits on the rail after Build (Start over) and before Publish, listing the week's versions", async () => {
    const element = await render();
    const list = versions(element);
    expect(list).not.toBeNull();
    expect(list.assignedSlot.name).toBe("end");
    expect(list.restore).toBe(true);
    expect(getVersions).toHaveBeenCalledWith({
      programId: PROGRAM,
      weekId: WEEK
    });
    expect(list.versions).toEqual(VERSIONS);
    // In this order: Start over, Versions, then Publish (desktop: Versions set off by a divider).
    const startOver = action(element, "StartOver");
    const publishArea = q(element, '[data-id="publish-area"]');
    expect(
      startOver.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      list.compareDocumentPosition(publishArea) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("a copy once published shows as Published and has no delete; a plain version has one", async () => {
    const element = await render();
    await openList(element);
    const [mine, history] = rows(element);
    expect(mine).toContain("delete");
    expect(history).toContain("Published Oct 18, 10:04 AM");
    expect(history).not.toContain("delete");
    expect(history).toContain("rename");
    expect(history).toContain("Restore");
  });

  /** The week as it is before it is generated: no Generated Schedule yet. */
  const notGenerated = () => {
    const inputs = week();
    inputs.scheduleId = null;
    inputs.revision = "";
    return inputs;
  };

  it("a week not generated yet lists its versions under Let the app propose one (decision 9)", async () => {
    const element = await render(notGenerated());
    expect(getVersions).toHaveBeenCalledWith({
      programId: PROGRAM,
      weekId: WEEK
    });
    const list = versions(element);
    expect(list).not.toBeNull();
    expect(q(element, '[data-id="start"]').contains(list)).toBe(true);
    expect(list.restore).toBe(true);
    await openList(element);
    // Restore and rename; nothing to save as a version, and no week to delete one from.
    const [mine] = rows(element);
    expect(mine).toContain("Restore");
    expect(mine).toContain("rename");
    expect(mine).not.toContain("delete");
    expect(
      list.shadowRoot.querySelector('[data-id="save-version"]')
    ).toBeNull();
  });

  it("…and none when it has no versions, as on the desktop", async () => {
    getInputs.mockResolvedValue(notGenerated());
    const element = createElement("c-shoresh-generated-schedule", {
      is: ShoreshGeneratedSchedule
    });
    getVersions.mockResolvedValue([]);
    element.terms = terms;
    element.setup = SETUP;
    document.body.appendChild(element);
    await flush();
    expect(getVersions).toHaveBeenCalled();
    expect(versions(element)).toBeNull();
    expect(q(element, '[data-id="start"]')).not.toBeNull();
  });

  it("Restore on a week not generated yet makes it the week's Generated Schedule and shows it", async () => {
    const element = await render(notGenerated());
    restoreVersionAsNew.mockResolvedValue(true);
    getInputs.mockResolvedValue(week({ locked: true, revision: RESTORED_AT }));
    await restore(element);
    await flush();
    expect(restoreVersionAsNew).toHaveBeenCalledWith({
      programId: PROGRAM,
      weekId: WEEK,
      versionId: MINE
    });
    expect(restoreVersion).not.toHaveBeenCalled();
    expect(getInputs).toHaveBeenCalledTimes(2);
    expect(q(element, '[data-id="start"]')).toBeNull();
    expect(lockAt(element, "0-1")).toBe("Locked");
    expect(versions(element).openId).toBe(MINE);
    expect(notice(element)).toBe("Restored Before the trip.");
    // The list and its button went with the start: focus goes to Rebuild, as after Generate.
    await until(
      () => element.shadowRoot.activeElement === action(element, "Rebuild")
    );
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="build-menu"]')
    );
  });

  it("…the list there waits while its Restore is on its way", async () => {
    const element = await render(notGenerated());
    expect(versions(element).busy).toBe(false);
    restoreVersionAsNew.mockReturnValue(new Promise(() => {}));
    await restore(element);
    expect(versions(element).busy).toBe(true);
  });

  it("…and renames a version there", async () => {
    const element = await render(notGenerated());
    renameSchedule.mockResolvedValue(undefined);
    getVersions.mockClear();
    const onDone = jest.fn();
    await fire(element, "rename", { id: MINE, name: "Trip week", onDone });
    expect(renameSchedule).toHaveBeenCalledWith({
      scheduleId: MINE,
      name: "Trip week"
    });
    expect(onDone).toHaveBeenCalledWith(true);
    expect(getVersions).toHaveBeenCalledTimes(1);
  });

  it("…refused when the week was generated meanwhile: nothing changed, Reload offered", async () => {
    const element = await render(notGenerated());
    restoreVersionAsNew.mockResolvedValue(false);
    await restore(element);
    expect(getInputs).toHaveBeenCalledTimes(1);
    expect(q(element, '[data-id="restore-refused"]').textContent).toContain(
      "nothing was restored."
    );
  });

  it("Save version keeps the week under the name, reads the list again and says so", async () => {
    const element = await render();
    saveVersion.mockResolvedValue("a0S000000000023AAA");
    getVersions.mockClear();
    const onDone = jest.fn();
    await fire(element, "save", { name: "Rainy Monday", onDone });
    expect(saveVersion).toHaveBeenCalledWith({
      scheduleId: SCHEDULE,
      name: "Rainy Monday"
    });
    expect(getVersions).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(true);
    expect(notice(element)).toBe("Saved Rainy Monday.");
  });

  it("a refused Save version says why and keeps the name typed", async () => {
    const element = await render();
    saveVersion.mockRejectedValue({
      body: { message: "Give the version a name." }
    });
    const onDone = jest.fn();
    await fire(element, "save", { name: " ", onDone });
    expect(onDone).toHaveBeenCalledWith(false);
    expect(q(element, '[data-id="build-error"]').textContent).toContain(
      "Give the version a name."
    );
    // Nothing was saved, so nothing says it was.
    expect(notice(element) || "").not.toContain("Saved");
  });

  it("Restore sends the revision the week was read at, then shows the week read again with its locks and option", async () => {
    const element = await render(week());
    expect(lockAt(element, "0-1")).toBeNull();
    restoreVersion.mockResolvedValue(true);
    getInputs.mockResolvedValue(
      week({ locked: true, option: 3, revision: RESTORED_AT })
    );
    await restore(element);
    expect(restoreVersion).toHaveBeenCalledWith({
      scheduleId: SCHEDULE,
      versionId: MINE,
      seenRevisions: REVISION
    });
    expect(getInputs).toHaveBeenCalledTimes(2);
    // The version's lock comes with it, and its option.
    expect(lockAt(element, "0-1")).toBe("Locked");
    expect(q(element, '[data-option="3"]').getAttribute("aria-checked")).toBe(
      "true"
    );
    expect(versions(element).openId).toBe(MINE);
    expect(notice(element)).toBe("Restored Before the trip.");
  });

  it("Restore starts Undo over: its steps were made on the week it replaced", async () => {
    const element = await render(week());
    // Swim cleared from Period 1: saved, nothing locked (an Open cell isn't).
    const cleared = week();
    saveSlots.mockResolvedValue({
      conflicts: [],
      revision: "2026-06-29:2",
      schedule: {
        schedule: { id: SCHEDULE },
        days: cleared.days.map((day) => ({ ...day, rows: ["1,"], locks: [] }))
      }
    });
    await press(cellAt(element, "0-1"), "Delete");
    await until(() => saveSlots.mock.calls.length > 0);
    await flush();
    expect(q(element, '[data-id="undo"]').disabled).toBe(false);
    restoreVersion.mockResolvedValue(true);
    getInputs.mockResolvedValue(week({ revision: RESTORED_AT }));
    await restore(element);
    expect(q(element, '[data-id="undo"]').disabled).toBe(true);
  });

  it("a Rebuild after Restore is built on the restored week's revision", async () => {
    const element = await render(week());
    restoreVersion.mockResolvedValue(true);
    getInputs.mockResolvedValue(week({ locked: true, revision: RESTORED_AT }));
    await restore(element);
    saveWeekOnServer.mockReturnValue(new Promise(() => {}));
    action(element, "TryAnother").click();
    await until(() => saveWeekOnServer.mock.calls.length > 0);
    const request = saveWeekOnServer.mock.calls[0][0].request;
    expect(request.revision).toBe(RESTORED_AT);
  });

  it("a Restore refused because someone else saved the week changes nothing and offers Reload", async () => {
    const element = await render(week());
    restoreVersion.mockResolvedValue(false);
    await restore(element);
    expect(getInputs).toHaveBeenCalledTimes(1);
    // The quiet line Manual Build shows for it (not the alert box), read out once.
    expect(q(element, '[data-id="conflict"]')).toBeNull();
    const line = q(element, '[data-id="restore-refused"]');
    expect(line.textContent).toContain(
      "Someone else changed this week since you opened it, so nothing was restored."
    );
    await flush();
    expect(q(element, '[data-id="announce"]').textContent).toContain(
      "nothing was restored."
    );
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="reload"]')
    );
    expect(versions(element).openId).toBeFalsy();
    // Builds and Versions wait until Reload shows the week as it is now.
    expect(action(element, "Rebuild").disabled).toBe(true);
    expect(versions(element).busy).toBe(true);
    getInputs.mockResolvedValue(week({ revision: "2026-06-29:2" }));
    q(element, '[data-id="reload"]').click();
    await flush();
    expect(getInputs).toHaveBeenCalledTimes(2);
    expect(action(element, "Rebuild").disabled).toBe(false);
  });

  it("the restored version is on screen now until the week is saved again", async () => {
    const element = await render(week());
    restoreVersion.mockResolvedValue(true);
    getInputs.mockResolvedValue(week({ revision: RESTORED_AT }));
    await restore(element);
    expect(versions(element).openId).toBe(MINE);
    // Coming back to the window with the week as restored: still on screen.
    window.dispatchEvent(new CustomEvent("focus"));
    await flush();
    expect(versions(element).openId).toBe(MINE);
    // Someone saved it since: no longer.
    getInputs.mockResolvedValue(week({ revision: "2026-06-29:5" }));
    window.dispatchEvent(new CustomEvent("focus"));
    await flush();
    expect(versions(element).openId).toBeFalsy();
  });

  it("…and a hand edit makes it no longer the version on screen at once", async () => {
    const element = await render(week());
    restoreVersion.mockResolvedValue(true);
    getInputs.mockResolvedValue(week({ revision: RESTORED_AT }));
    await restore(element);
    saveSlots.mockReturnValue(new Promise(() => {}));
    await press(cellAt(element, "0-1"), "Delete");
    expect(versions(element).openId).toBeFalsy();
  });

  it("while a Restore runs, builds, Lock, Publish, the pickers and hand edits wait", async () => {
    const element = await render(week());
    const held = slow();
    restoreVersion.mockReturnValue(held.promise);
    await restore(element);
    expect(action(element, "Rebuild").disabled).toBe(true);
    expect(action(element, "TryAnother").disabled).toBe(true);
    expect(action(element, "StartOver").disabled).toBe(true);
    expect(lockRows(element).every((row) => row.disabled)).toBe(true);
    expect(publishButton(element).disabled).toBe(true);
    expect(q(element, '[data-id="week"]').disabled).toBe(true);
    expect(versions(element).busy).toBe(true);
    await press(cellAt(element, "0-1"), "Delete");
    expect(saveSlots).not.toHaveBeenCalled();
    expect(notice(element)).toBe(
      "One moment: the week is being saved or restored."
    );
    getInputs.mockResolvedValue(week({ revision: RESTORED_AT }));
    held.answer(true);
    await flush();
    expect(action(element, "Rebuild").disabled).toBe(false);
    expect(publishButton(element).disabled).toBe(false);
    expect(q(element, '[data-id="week"]').disabled).toBe(false);
  });

  it("coming back to the window during a Restore doesn't read the week", async () => {
    const element = await render(week());
    const held = slow();
    restoreVersion.mockReturnValue(held.promise);
    await restore(element);
    window.dispatchEvent(new CustomEvent("focus"));
    await flush();
    expect(getInputs).toHaveBeenCalledTimes(1);
    getInputs.mockResolvedValue(week({ revision: RESTORED_AT }));
    held.answer(true);
    await flush();
    expect(getInputs).toHaveBeenCalledTimes(2);
  });

  it("the season read again during a Restore waits for it, then reads the week", async () => {
    const element = await render(week());
    const held = slow();
    restoreVersion.mockReturnValue(held.promise);
    await restore(element);
    element.setup = { ...SETUP };
    await flush();
    expect(getInputs).toHaveBeenCalledTimes(1);
    getInputs.mockResolvedValue(week({ revision: RESTORED_AT }));
    held.answer(false);
    await flush();
    // Refused (a conflict): the box stays until Reload, so nothing is read yet.
    expect(getInputs).toHaveBeenCalledTimes(1);
  });

  it("the season read again during a Save version reads the week once it is saved", async () => {
    const element = await render(week());
    const held = slow();
    saveVersion.mockReturnValue(held.promise);
    await fire(element, "save", { name: "Mine", onDone: () => {} });
    element.setup = { ...SETUP };
    await flush();
    expect(getInputs).toHaveBeenCalledTimes(1);
    held.answer("a0S000000000023AAA");
    await flush();
    expect(getInputs).toHaveBeenCalledTimes(2);
  });

  it("a week that can't be read just after a Restore is read again once the Restore is over", async () => {
    const element = await render(week());
    restoreVersion.mockResolvedValue(true);
    getInputs
      .mockRejectedValueOnce({ body: { message: "Timed out." } })
      .mockResolvedValue(week({ locked: true, revision: RESTORED_AT }));
    await restore(element);
    await flush();
    expect(getInputs).toHaveBeenCalledTimes(3);
    expect(lockAt(element, "0-1")).toBe("Locked");
  });

  it("…and then it is shown as the restored week: Undo started over, on screen now, said so", async () => {
    const element = await render(week());
    await undoStep(element);
    restoreVersion.mockResolvedValue(true);
    getInputs
      .mockRejectedValueOnce({ body: { message: "Timed out." } })
      .mockResolvedValue(week({ revision: RESTORED_AT }));
    await restore(element);
    await flush();
    expect(getInputs).toHaveBeenCalledTimes(3);
    expect(q(element, '[data-id="undo"]').disabled).toBe(true);
    expect(versions(element).openId).toBe(MINE);
    expect(notice(element)).toBe("Restored Before the trip.");
    // The read that failed was read again: its error doesn't stay up beside the restored week.
    expect(q(element, '[data-id="build-error"]')).toBeNull();
  });

  it("…once only: a later read of the week is shown as any read is (Undo kept)", async () => {
    const element = await render(week());
    restoreVersion.mockResolvedValue(true);
    getInputs
      .mockRejectedValueOnce({ body: { message: "Timed out." } })
      .mockResolvedValue(week({ revision: RESTORED_AT }));
    await restore(element);
    await flush();
    expect(getInputs).toHaveBeenCalledTimes(3);
    await undoStep(element);
    // Coming back to the window reads the week again: not a Restore, so Undo stays.
    getInputs.mockResolvedValue(week({ revision: "2026-06-29:2" }));
    window.dispatchEvent(new CustomEvent("focus"));
    await flush();
    expect(getInputs).toHaveBeenCalledTimes(4);
    expect(q(element, '[data-id="undo"]').disabled).toBe(false);
  });

  it("…but if the week still can't be read, the error stays", async () => {
    const element = await render(week());
    restoreVersion.mockResolvedValue(true);
    getInputs.mockRejectedValue({ body: { message: "Timed out." } });
    await restore(element);
    await flush();
    expect(getInputs).toHaveBeenCalledTimes(3);
    expect(q(element, '[data-id="build-error"]').textContent).toContain(
      "Timed out."
    );
  });

  it("a Restore answering after the screen moved on to another week shows nothing there", async () => {
    const element = await render(week());
    const held = slow();
    restoreVersion.mockReturnValue(held.promise);
    await restore(element);
    getInputs.mockResolvedValue(week());
    element.setup = {
      ...SETUP,
      weeks: [{ Id: "a0K000000000002AAA", Name: "Week 2" }]
    };
    await flush();
    expect(getInputs).toHaveBeenCalledTimes(2);
    // Refused for Week 1: Week 2 gets no Reload box for it.
    held.answer(false);
    await flush();
    expect(q(element, '[data-id="conflict"]')).toBeNull();
    expect(getInputs).toHaveBeenCalledTimes(2);
  });

  it("a Restore's read answering after the screen moved on to another week shows nothing there", async () => {
    const element = await render(week());
    restoreVersion.mockResolvedValue(true);
    const reading = slow();
    getInputs.mockReturnValueOnce(reading.promise);
    await restore(element);
    getInputs.mockResolvedValue(week());
    element.setup = {
      ...SETUP,
      weeks: [{ Id: "a0K000000000002AAA", Name: "Week 2" }]
    };
    await flush();
    expect(getInputs).toHaveBeenCalledTimes(3);
    // Week 1 as restored (with its lock) is never put on Week 2's screen.
    reading.answer(week({ locked: true, revision: RESTORED_AT }));
    await flush();
    expect(lockAt(element, "0-1")).toBeNull();
    expect(versions(element).openId).toBeFalsy();
    expect(notice(element) || "").not.toContain("Restored");
  });

  it("the season read again while a Restore reads the week reads it once more after", async () => {
    const element = await render(week());
    await undoStep(element);
    restoreVersion.mockResolvedValue(true);
    const reading = slow();
    getInputs.mockReturnValueOnce(reading.promise);
    await restore(element);
    expect(getInputs).toHaveBeenCalledTimes(2);
    element.setup = { ...SETUP };
    await flush();
    expect(getInputs).toHaveBeenCalledTimes(2);
    getInputs.mockResolvedValue(week({ locked: true, revision: RESTORED_AT }));
    reading.answer(week({ revision: RESTORED_AT }));
    await flush();
    // The week shown is the one read after the season was: never one asked for before it.
    expect(getInputs).toHaveBeenCalledTimes(3);
    expect(lockAt(element, "0-1")).toBe("Locked");
    expect(q(element, '[data-id="undo"]').disabled).toBe(true);
    expect(versions(element).openId).toBe(MINE);
  });

  it("a Restore's read failing after the screen moved on to another week reads nothing more", async () => {
    const element = await render(week());
    restoreVersion.mockResolvedValue(true);
    const reading = slow();
    getInputs.mockReturnValueOnce(reading.promise);
    await restore(element);
    getInputs.mockResolvedValue(week());
    element.setup = {
      ...SETUP,
      weeks: [{ Id: "a0K000000000002AAA", Name: "Week 2" }]
    };
    await flush();
    expect(getInputs).toHaveBeenCalledTimes(3);
    reading.answer(Promise.reject({ body: { message: "Timed out." } }));
    await flush();
    expect(getInputs).toHaveBeenCalledTimes(3);
  });

  it("a refused Restore takes focus to Reload", async () => {
    const element = await render(week());
    restoreVersion.mockResolvedValue(false);
    await restore(element);
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="reload"]')
    );
  });

  it("after a Restore, the published line and the counts are the restored week's", async () => {
    const inputs = week();
    inputs.published = { ...PUBLISHED, changedSince: false };
    const element = await render(inputs);
    expect(q(element, '[data-id="changed-since"]')).toBeNull();
    const before = q(element, "c-shoresh-week-checks").resetKey;
    restoreVersion.mockResolvedValue(true);
    const restored = week({ revision: RESTORED_AT });
    restored.published = { ...PUBLISHED, changedSince: true };
    getInputs.mockResolvedValue(restored);
    await restore(element);
    expect(q(element, '[data-id="changed-since"]')).not.toBeNull();
    // The counts start over (nothing lit from the week it replaced).
    expect(q(element, "c-shoresh-week-checks").resetKey).toBeGreaterThan(
      before
    );
  });

  it("hand edits all saved during a Save version don't read the week until it is over", async () => {
    const element = await render(week());
    const held = slow();
    saveVersion.mockReturnValue(held.promise);
    await fire(element, "save", { name: "Mine", onDone: () => {} });
    element.setup = { ...SETUP };
    q(element, '[data-id="week-editor"]').dispatchEvent(
      new CustomEvent("editstate", {
        detail: { busy: false, queueEmpty: true }
      })
    );
    await flush();
    expect(getInputs).toHaveBeenCalledTimes(1);
    held.answer("a0S000000000023AAA");
    await flush();
    expect(getInputs).toHaveBeenCalledTimes(2);
  });

  it("a read of the week answering after a Restore started can't put back the old week", async () => {
    const element = await render(week());
    const reading = slow();
    getInputs.mockReturnValue(reading.promise);
    window.dispatchEvent(new CustomEvent("focus"));
    await flush();
    // Versions wait while the week is read: nothing is restored then.
    expect(versions(element).busy).toBe(true);
    await restore(element);
    expect(restoreVersion).not.toHaveBeenCalled();
    reading.answer(week());
    await flush();
    expect(versions(element).busy).toBe(false);
  });

  describe("Start over acts at once, with Undo (Greg's decision 2, 2026-10-20)", () => {
    const KEPT = "a0S000000000025AAA";
    const STARTED_AT = "2026-06-29:2";
    const startedLine = (element) => q(element, '[data-id="started-over"]');
    const undoButton = (element) => q(element, '[data-id="start-over-undo"]');

    /** Start over saved: Period 1 emptied, a version kept first. */
    async function startOver(element) {
      const cleared = week();
      saveWeekOnServer.mockResolvedValueOnce({
        conflict: false,
        scheduleId: SCHEDULE,
        revision: STARTED_AT,
        versionId: KEPT,
        locks: []
      });
      action(element, "StartOver").click();
      await until(() => !q(element, '[data-id="busy"]'));
      return cleared;
    }

    it("clears the week without a question, then offers Undo on a quiet line", async () => {
      const element = await render(week({ locked: true }));
      await startOver(element);
      expect(q(element, '[data-id="confirm"]')).toBeNull();
      expect(saveWeekOnServer.mock.calls[0][0].request.action).toBe(
        "StartOver"
      );
      expect(cellAt(element, "0-1").className).toContain("cell_open");
      expect(startedLine(element).textContent).toContain("Started Week 1 over");
      expect(undoButton(element).getAttribute("aria-label")).toBe(
        "Undo Started Week 1 over"
      );
      // Its Undo is the next stop, as after Clear week on Manual Build; and it is said.
      expect(element.shadowRoot.activeElement).toBe(undoButton(element));
      expect(q(element, '[data-id="announce"]').textContent).toContain(
        "Started Week 1 over."
      );
    });

    it("Undo brings back the version Start over kept, locks and all, and says so", async () => {
      const element = await render(week({ locked: true }));
      await startOver(element);
      restoreVersion.mockResolvedValue(true);
      getInputs.mockResolvedValue(week({ locked: true, revision: "x:3" }));
      undoButton(element).click();
      await until(() => !versions(element).busy);
      expect(restoreVersion).toHaveBeenCalledWith({
        scheduleId: SCHEDULE,
        versionId: KEPT,
        seenRevisions: STARTED_AT
      });
      expect(lockAt(element, "0-1")).toBe("Locked");
      expect(notice(element)).toBe("Undone: Started Week 1 over.");
      // The line goes with the week it was about; focus goes back to Start over.
      expect(startedLine(element)).toBeNull();
      expect(element.shadowRoot.activeElement).toBe(
        q(element, '[data-id="build-menu"]')
      );
    });

    it("Undo refused because someone else saved since changes nothing and offers Reload", async () => {
      const element = await render(week());
      await startOver(element);
      restoreVersion.mockResolvedValue(false);
      undoButton(element).click();
      await flush();
      expect(q(element, '[data-id="restore-refused"]')).not.toBeNull();
      expect(startedLine(element)).toBeNull();
    });

    it("the Undo line goes once the week is saved again", async () => {
      const element = await render(week());
      await startOver(element);
      saveWeekOnServer.mockResolvedValueOnce({
        conflict: false,
        scheduleId: SCHEDULE,
        revision: "2026-06-29:3",
        versionId: null,
        locks: []
      });
      action(element, "FillOpen").click();
      await until(() => !q(element, '[data-id="busy"]'));
      expect(startedLine(element)).toBeNull();
    });

    it("no Undo when the server kept no version", async () => {
      const element = await render(week());
      saveWeekOnServer.mockResolvedValueOnce({
        conflict: false,
        scheduleId: SCHEDULE,
        revision: STARTED_AT,
        versionId: null,
        locks: []
      });
      action(element, "StartOver").click();
      await until(() => !q(element, '[data-id="busy"]'));
      expect(startedLine(element)).toBeNull();
    });
  });

  it("a build reads the list again (Rebuild keeps a version first)", async () => {
    const element = await render(week());
    getVersions.mockClear();
    saveWeekOnServer.mockResolvedValue({
      conflict: false,
      scheduleId: SCHEDULE,
      revision: "2026-06-29:2",
      versionId: "a0S000000000024AAA",
      locks: []
    });
    action(element, "TryAnother").click();
    await until(() => getVersions.mock.calls.length > 0);
    expect(getVersions).toHaveBeenCalledTimes(1);
  });

  it("publishing reads the list again (a replaced copy is a version now)", async () => {
    const element = await render(week());
    getVersions.mockClear();
    previewPublish.mockResolvedValue({
      revisions: REVISION,
      published: null,
      changes: [],
      changeCount: 0,
      moreLines: 0
    });
    publish.mockResolvedValue({
      published: {
        id: "a0S000000000009AAA",
        publishedAt: "2026-10-18T14:04:00.000Z",
        publishedBy: "Pat",
        origin: "Generated"
      }
    });
    publishButton(element).click();
    await flush();
    expect(publish).toHaveBeenCalledTimes(1);
    expect(getVersions).toHaveBeenCalledTimes(1);
  });

  it("unpublishing reads the list again (the copy is kept there, marked Published)", async () => {
    const inputs = week();
    inputs.published = {
      id: "a0S000000000009AAA",
      publishedAt: "2026-10-18T14:04:00.000Z",
      publishedBy: "Pat",
      origin: "Generated",
      changedSince: false
    };
    const element = await render(inputs);
    getVersions.mockClear();
    unpublish.mockResolvedValue({ publishedChanged: false });
    q(element, '[data-id="unpublish"]').click();
    await flush();
    q(element, '[data-id="unpublish-ask"]').dispatchEvent(
      new CustomEvent("answer", { detail: { yes: true } })
    );
    await flush();
    expect(unpublish).toHaveBeenCalledTimes(1);
    expect(getVersions).toHaveBeenCalledTimes(1);
  });

  it("Versions wait while a build, a hand edit, a Lock or a publish is on its way", async () => {
    // A build.
    let element = await render(week());
    saveWeekOnServer.mockReturnValue(new Promise(() => {}));
    action(element, "TryAnother").click();
    await until(() => saveWeekOnServer.mock.calls.length > 0);
    expect(versions(element).busy).toBe(true);
    await restore(element);
    expect(restoreVersion).not.toHaveBeenCalled();
    document.body.removeChild(element);
    // A hand edit.
    element = await render(week());
    saveSlots.mockReturnValue(new Promise(() => {}));
    await press(cellAt(element, "0-1"), "Delete");
    expect(versions(element).busy).toBe(true);
    document.body.removeChild(element);
    // A Lock.
    element = await render(week());
    setLocksOnServer.mockReturnValue(new Promise(() => {}));
    lockRows(element)
      .find((row) => row.textContent.trim().startsWith("Lock "))
      .click();
    await flush();
    expect(versions(element).busy).toBe(true);
    document.body.removeChild(element);
    // A publish.
    element = await render(week());
    previewPublish.mockReturnValue(new Promise(() => {}));
    publishButton(element).click();
    await flush();
    expect(versions(element).busy).toBe(true);
    await fire(element, "delete", { id: MINE });
    expect(deleteVersion).not.toHaveBeenCalled();
  });

  it("delete takes the version away from this week's Generated Schedule and says so", async () => {
    const element = await render();
    deleteVersion.mockResolvedValue(undefined);
    getVersions.mockClear();
    getVersions.mockResolvedValue([VERSIONS[1]]);
    await fire(element, "delete", { id: MINE });
    expect(deleteVersion).toHaveBeenCalledWith({
      scheduleId: SCHEDULE,
      versionId: MINE
    });
    expect(getVersions).toHaveBeenCalledTimes(1);
    expect(versions(element).versions).toEqual([VERSIONS[1]]);
    expect(notice(element)).toBe("Deleted Before the trip.");
  });

  it("after a delete, focus goes to the next version once the list without it is back", async () => {
    const element = await render();
    deleteVersion.mockResolvedValue(undefined);
    const list = slow();
    getVersions.mockReturnValueOnce(list.promise);
    await openList(element);
    const panel = versions(element).shadowRoot;
    const del = panel.querySelector('[data-action="delete"]');
    del.click();
    await flush();
    del.click();
    await flush();
    // Deleted on the server, the list not back yet: still busy, so focus waits for it.
    expect(deleteVersion).toHaveBeenCalled();
    expect(versions(element).busy).toBe(true);
    list.answer([VERSIONS[1]]);
    await flush();
    const restoreNext = panel.querySelector('[data-action="open"]');
    expect(restoreNext.getAttribute("aria-label")).toBe(
      "Restore Published Oct 18, 10:04 AM"
    );
    expect(panel.activeElement).toBe(restoreNext);
  });

  it("a refused delete says why", async () => {
    const element = await render();
    deleteVersion.mockRejectedValue({
      body: {
        message:
          '"Published Oct 18, 10:04 AM" was the published schedule, which is kept as history, so it can\'t be deleted.'
      }
    });
    await fire(element, "delete", { id: HISTORY });
    expect(q(element, '[data-id="build-error"]').textContent).toContain(
      "kept as history"
    );
    // Nothing was deleted, so nothing says it was.
    expect(notice(element) || "").not.toContain("Deleted");
  });

  it("rename renames the version and reads the list again", async () => {
    const element = await render();
    renameSchedule.mockResolvedValue(undefined);
    getVersions.mockClear();
    const onDone = jest.fn();
    await fire(element, "rename", {
      id: HISTORY,
      name: "First publish",
      onDone
    });
    expect(renameSchedule).toHaveBeenCalledWith({
      scheduleId: HISTORY,
      name: "First publish"
    });
    expect(onDone).toHaveBeenCalledWith(true);
    expect(getVersions).toHaveBeenCalledTimes(1);
  });

  it("a refused rename says why and keeps the name typed", async () => {
    const element = await render();
    renameSchedule.mockRejectedValue({
      body: { message: "Give the version a name." }
    });
    const onDone = jest.fn();
    await fire(element, "rename", { id: HISTORY, name: " ", onDone });
    expect(onDone).toHaveBeenCalledWith(false);
    expect(q(element, '[data-id="build-error"]').textContent).toContain(
      "Give the version a name."
    );
  });

  it("another week shows none of this week's versions, and nothing as on screen now", async () => {
    const element = await render(week());
    restoreVersion.mockResolvedValue(true);
    getInputs.mockResolvedValue(week({ revision: RESTORED_AT }));
    await restore(element);
    expect(versions(element).openId).toBe(MINE);
    // Week 2, saved at the same revision text, while its own list is still on its way.
    getVersions.mockReturnValue(new Promise(() => {}));
    element.setup = {
      ...SETUP,
      weeks: [{ Id: "a0K000000000002AAA", Name: "Week 2" }]
    };
    await flush();
    expect(versions(element).versions).toEqual([]);
    expect(versions(element).openId).toBeFalsy();
  });

  it("an older read of the list answering after a newer one is not shown", async () => {
    const late = slow();
    getInputs.mockResolvedValue(week());
    getVersions.mockReturnValueOnce(late.promise);
    const element = createElement("c-shoresh-generated-schedule", {
      is: ShoreshGeneratedSchedule
    });
    element.terms = terms;
    element.setup = SETUP;
    document.body.appendChild(element);
    await flush();
    // Save version reads the list again; that newer answer comes first.
    const saved = [
      { ...VERSIONS[0], id: "a0S000000000023AAA", name: "Rainy Monday" },
      ...VERSIONS
    ];
    getVersions.mockResolvedValue(saved);
    saveVersion.mockResolvedValue("a0S000000000023AAA");
    await fire(element, "save", { name: "Rainy Monday", onDone: () => {} });
    expect(versions(element).versions).toEqual(saved);
    late.answer(VERSIONS);
    await flush();
    expect(versions(element).versions).toEqual(saved);
  });

  it("a list read for the week before is not shown for this one", async () => {
    const late = slow();
    getInputs.mockResolvedValue(week());
    getVersions.mockReturnValueOnce(late.promise).mockResolvedValue([]);
    const element = createElement("c-shoresh-generated-schedule", {
      is: ShoreshGeneratedSchedule
    });
    element.terms = terms;
    element.setup = SETUP;
    document.body.appendChild(element);
    await flush();
    // The season read again with another week: the screen moves on to it, and its list is empty.
    element.setup = {
      ...SETUP,
      weeks: [{ Id: "a0K000000000002AAA", Name: "Week 2" }]
    };
    await flush();
    expect(getVersions).toHaveBeenLastCalledWith({
      programId: PROGRAM,
      weekId: "a0K000000000002AAA"
    });
    late.answer(VERSIONS);
    await flush();
    expect(versions(element).versions).toEqual([]);
  });
});
