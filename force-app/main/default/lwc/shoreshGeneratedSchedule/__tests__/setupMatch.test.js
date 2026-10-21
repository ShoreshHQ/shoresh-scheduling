/**
 * "Setup changed since the week was built" on the Generated Schedule screen (ADR 0010 §56; Greg's
 * look-and-feel decision 1, 2026-10-20), as on Manual Build (ADR 0008 part 6): the dots the
 * server works out (SetupMatch), the box under the toolbar in Manual Build's place, and "Update
 * to match setup", shown first, one change at a time or all at once, the week read again after
 * each update. Synthetic data only.
 */
import { createElement } from "lwc";
import ShoreshGeneratedSchedule from "c/shoreshGeneratedSchedule";
import { expectFocusInGrid, find } from "shoresh-jest/week-editor";
import getInputs from "@salesforce/apex/GeneratedScheduleController.getInputs";
import saveWeekOnServer from "@salesforce/apex/GeneratedScheduleController.saveWeek";
import getSetupChanges from "@salesforce/apex/SetupMatchController.getSetupChanges";
import updateToMatchSetup from "@salesforce/apex/SetupMatchController.updateToMatchSetup";
import getVersions from "@salesforce/apex/SchedulesController.getVersions";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";
import { PROGRAM, SCHEDULE, WEEK, camp, dateAt } from "./data/camp";

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
  "@salesforce/apex/SetupMatchController.getSetupChanges",
  () => apex(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/SetupMatchController.updateToMatchSetup",
  () => apex(),
  { virtual: true }
);
jest.mock("@salesforce/apex/SchedulesController.getVersions", () => apex(), {
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
const BUNK_1 = "a0G000000000001AAA";
const BUNK_2 = "a0G000000000002AAA";
const PERIOD_1 = "a0B000000000002AAA";
const PERIOD_2 = "a0B000000000003AAA";
const key = (groupId, blockId) => `${dateAt(0)}|${groupId}|${blockId}`;

/**
 * Two bunks, one day: Flagpole, then Period 1 (Swim for Bunk 1, locked by a hand edit) and
 * Period 2. A generated week, as the server sends it.
 */
function week({ revision = REVISION, rows = ["1,2,", "1,,"] } = {}) {
  const inputs = camp({
    bunks: [{ name: "Bunk 1" }, { name: "Bunk 2" }],
    days: 1,
    blocks: [
      { name: "Flag", start: "08:30", end: "09:00" },
      { name: "Period 1", start: "09:00", end: "10:00" },
      { name: "Period 2", start: "10:00", end: "11:00" }
    ],
    activities: [{ name: "Swim", min: 0, max: 5, atOnce: 2 }],
    scheduleId: SCHEDULE
  });
  inputs.revision = revision;
  inputs.days = inputs.days.map((day) => ({
    ...day,
    items: [
      ...day.items,
      { kind: "A", id: inputs.activities[0].Id, name: "Swim", gone: false }
    ],
    rows,
    locks: [",1,", ",,"]
  }));
  return inputs;
}

const SWIM_GONE = {
  key: "k1",
  dateValue: dateAt(0),
  summary: null,
  takesChoices: true,
  lines: [
    {
      place: "Bunk 1 · Monday · Period 1",
      before: "Swim",
      after: "Open",
      reason: "Deleted from setup"
    }
  ]
};
const FLAGPOLE_NOW = {
  key: "k2",
  dateValue: dateAt(0),
  summary: null,
  takesChoices: false,
  lines: [
    {
      place: "Bunk 2 · Monday · Period 2",
      before: "Open",
      after: "Flagpole",
      reason: "Flagpole is set up here now"
    }
  ]
};
const PREVIEW = {
  revisions: REVISION,
  changes: [SWIM_GONE, FLAGPOLE_NOW],
  dots: [
    { key: key(BUNK_1, PERIOD_1), words: "Deleted from setup" },
    { key: key(BUNK_2, PERIOD_2), words: "Flagpole is set up here now" }
  ],
  closedActivityIds: [],
  problem: null
};
const NOTHING = { ...PREVIEW, changes: [], dots: [] };
const LEFT = {
  ...PREVIEW,
  revisions: "2026-06-29:2",
  changes: [FLAGPOLE_NOW],
  dots: [PREVIEW.dots[1]]
};

const flush = () =>
  [...Array(12)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );
const pending = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

// What the screen told the page about setup changed, in order (the menu's foot, ADR 0015).
const toldStates = [];
async function render(preview = PREVIEW, inputs = week()) {
  getInputs.mockResolvedValue(inputs);
  getVersions.mockResolvedValue([]);
  getSetupChanges.mockResolvedValue(preview);
  const element = createElement("c-shoresh-generated-schedule", {
    is: ShoreshGeneratedSchedule
  });
  element.terms = terms;
  element.setup = SETUP;
  element.addEventListener("setupstate", (event) =>
    toldStates.push(event.detail)
  );
  document.body.appendChild(element);
  await flush();
  return element;
}

const q = (element, selector) => find(element, selector);
const cell = (element, at) =>
  q(element, '[data-id="edit-grid"]').shadowRoot.querySelector(
    `[data-cell="${at}"]`
  );
const dotIn = (element, at) => cell(element, at).querySelector("c-shoresh-dot");
const box = (element) => q(element, '[data-id="setup-changed"]');
const updateButton = (element) => q(element, '[data-id="update-to-match"]');
const dialog = (element) => q(element, '[data-id="setup-match"]');
const inDialog = (element, selector) =>
  dialog(element).shadowRoot.querySelector(selector);
const rowsIn = (element) =>
  [...dialog(element).shadowRoot.querySelectorAll('[data-id="change"]')].map(
    (row) =>
      [...row.querySelectorAll(".place, .from-to, .reason")]
        .map((part) => part.textContent.trim())
        .join(" | ")
  );
const notice = (element) => {
  const line = q(element, '[data-id="notice"]');
  return line ? line.textContent : null;
};
const errorText = (element) => {
  const shown = q(element, '[data-id="build-error"]');
  return shown ? shown.textContent.trim() : null;
};

async function openUpdate(element) {
  updateButton(element).click();
  await flush();
}

describe("Setup changed on the Generated Schedule screen", () => {
  afterEach(() => {
    toldStates.length = 0;
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.resetAllMocks();
  });

  it("asks for the week's setup changes once the week is shown, and dots the cells", async () => {
    const element = await render();
    expect(getSetupChanges).toHaveBeenCalledWith({ scheduleId: SCHEDULE });
    expect(dotIn(element, "0-1").label).toContain("Deleted from setup");
    expect(dotIn(element, "1-2").label).toContain(
      "Flagpole is set up here now"
    );
    // The lock stays drawn beside the dot: the director's choice is still the director's.
    expect(cell(element, "0-1").querySelector(".cell-lock")).not.toBeNull();
  });

  it("a week not generated yet reads nothing and shows no box", async () => {
    const inputs = week();
    inputs.scheduleId = null;
    inputs.revision = "";
    const element = await render(PREVIEW, inputs);
    expect(getSetupChanges).not.toHaveBeenCalled();
    expect(box(element)).toBeNull();
  });

  it("says the week doesn't match setup in Manual Build's place, first under the toolbar", async () => {
    const element = await render();
    const line = box(element);
    expect(line.assignedSlot.name).toBe("status");
    expect(line.querySelector("c-shoresh-dot").label).toBe(
      "Week 1 doesn't match setup"
    );
    expect(updateButton(element).textContent.trim()).toBe(
      "Update to match setup"
    );
    // First of the status items, as on Manual Build (after the counters, before any line).
    const status = [
      ...q(element, "c-shoresh-week-editor").querySelectorAll('[slot="status"]')
    ];
    expect(status[0]).toBe(line);
    await expect(element).toBeAccessible();
  });

  it("tells the page it can be updated to match setup, and the menu's Update opens the same list", async () => {
    const element = await render();
    expect(toldStates[toldStates.length - 1]).toEqual({
      changed: true,
      busy: false
    });
    element.updateToMatchSetup();
    await flush();
    expect(dialog(element)).not.toBeNull();
    expect(toldStates[toldStates.length - 1]).toEqual({
      changed: true,
      busy: true
    });
  });

  it("tells the page nothing needs updating when the week matches setup", async () => {
    await render(NOTHING);
    expect(toldStates[toldStates.length - 1]).toEqual({
      changed: false,
      busy: false
    });
  });

  it("shows nothing when the week matches setup", async () => {
    const element = await render(NOTHING);
    expect(box(element)).toBeNull();
  });

  it("says why the week can't be compared, with no button", async () => {
    const element = await render({
      ...NOTHING,
      problem: "No Bunks of Main are at camp in Week 1."
    });
    expect(box(element).querySelector("c-shoresh-dot").label).toBe(
      "No Bunks of Main are at camp in Week 1."
    );
    expect(updateButton(element)).toBeNull();
  });

  it("shows every change first, read fresh, and holds builds, Lock, Publish, Versions, pickers and edits", async () => {
    const element = await render();
    await openUpdate(element);
    expect(getSetupChanges).toHaveBeenCalledTimes(2);
    expect(inDialog(element, "h2").textContent).toBe(
      "Update Week 1 to match setup?"
    );
    expect(rowsIn(element)).toEqual([
      "Bunk 1 · Monday · Period 1 | Swim → Open | Deleted from setup",
      "Bunk 2 · Monday · Period 2 | Open → Flagpole | Flagpole is set up here now"
    ]);
    expect(q(element, '[data-action="Rebuild"]').disabled).toBe(true);
    expect(q(element, '[data-action="StartOver"]').disabled).toBe(true);
    expect(q(element, '[data-id="lock-menu"]').disabled).toBe(true);
    expect(q(element, '[data-id="publish"]').disabled).toBe(true);
    expect(q(element, '[data-id="versions"]').busy).toBe(true);
    expect(q(element, '[data-id="week"]').disabled).toBe(true);
    expect(q(element, "c-shoresh-week-editor").restoring).toBe(true);
    expect(updateToMatchSetup).not.toHaveBeenCalled();
  });

  it("Update on one row makes that change only, reads the week again, and the list stays with what is left", async () => {
    const element = await render();
    await openUpdate(element);
    updateToMatchSetup.mockResolvedValue({ refused: null, kept: true });
    getInputs.mockResolvedValue(
      week({ revision: "2026-06-29:2", rows: ["1,,", "1,,"] })
    );
    getSetupChanges.mockResolvedValue(LEFT);
    inDialog(element, '[data-key="k1"]').click();
    await flush();
    expect(updateToMatchSetup).toHaveBeenCalledWith({
      scheduleId: SCHEDULE,
      ask: { keys: ["k1"], seenRevisions: REVISION, versionKept: false }
    });
    // The week as the server now has it: read again, Swim gone and its dot with it.
    expect(getInputs).toHaveBeenCalledTimes(2);
    expect(dotIn(element, "0-1")).toBeNull();
    expect(rowsIn(element)).toEqual([
      "Bunk 2 · Monday · Period 2 | Open → Flagpole | Flagpole is set up here now"
    ]);
    expect(inDialog(element, '[data-id="announce"]').textContent.trim()).toBe(
      "Updated to match setup."
    );
    // The week as it was is a version now: Versions lists it.
    expect(getVersions).toHaveBeenCalledTimes(2);
  });

  it("one opening of the list keeps one version: the next update in it asks for none", async () => {
    const element = await render();
    await openUpdate(element);
    updateToMatchSetup.mockResolvedValue({ refused: null, kept: true });
    getInputs.mockResolvedValue(week({ revision: "2026-06-29:2" }));
    getSetupChanges.mockResolvedValue(LEFT);
    inDialog(element, '[data-key="k1"]').click();
    await flush();
    updateToMatchSetup.mockResolvedValue({ refused: null, kept: false });
    getSetupChanges.mockResolvedValue(NOTHING);
    inDialog(element, '[data-key="k2"]').click();
    await flush();
    expect(updateToMatchSetup).toHaveBeenLastCalledWith({
      scheduleId: SCHEDULE,
      ask: {
        keys: ["k2"],
        seenRevisions: LEFT.revisions,
        versionKept: true
      }
    });
  });

  it("Update all makes every change listed, closes the list, and focus goes to the grid once nothing is left", async () => {
    const element = await render();
    await openUpdate(element);
    updateToMatchSetup.mockResolvedValue({ refused: null, kept: true });
    getInputs.mockResolvedValue(
      week({ revision: "2026-06-29:2", rows: ["1,,", "1,,"] })
    );
    getSetupChanges.mockResolvedValue(NOTHING);
    inDialog(element, '[data-id="update-all"]').click();
    await flush();
    expect(updateToMatchSetup).toHaveBeenCalledWith({
      scheduleId: SCHEDULE,
      ask: {
        keys: ["k1", "k2"],
        seenRevisions: REVISION,
        versionKept: false
      }
    });
    expect(dialog(element)).toBeNull();
    expect(box(element)).toBeNull();
    expect(q(element, "c-shoresh-week-editor").restoring).toBe(false);
    // Update to match setup is gone with the box: the grid's cell, not Publish or the page.
    await flush();
    expectFocusInGrid(element);
  });

  it("Update all with changes left: the box stays and focus goes back to Update to match setup", async () => {
    const element = await render();
    await openUpdate(element);
    updateToMatchSetup.mockResolvedValue({ refused: null, kept: false });
    getInputs.mockResolvedValue(week({ revision: "2026-06-29:2" }));
    getSetupChanges.mockResolvedValue(LEFT);
    inDialog(element, '[data-id="update-all"]').click();
    await flush();
    expect(dialog(element)).toBeNull();
    expect(box(element)).not.toBeNull();
    const focused = element.shadowRoot.activeElement;
    expect(focused && focused.dataset.id).toBe("update-to-match");
  });

  it("Cancel changes nothing and puts focus back on Update to match setup", async () => {
    const element = await render();
    await openUpdate(element);
    inDialog(element, '[data-id="close"]').click();
    await flush();
    expect(dialog(element)).toBeNull();
    expect(updateToMatchSetup).not.toHaveBeenCalled();
    expect(dotIn(element, "0-1").label).toContain("Deleted from setup");
    const focused = element.shadowRoot.activeElement;
    expect(focused && focused.dataset.id).toBe("update-to-match");
  });

  it("someone else saved the week since: nothing is updated, it says so, and reads the week again", async () => {
    const element = await render();
    await openUpdate(element);
    updateToMatchSetup.mockResolvedValue({ refused: "changedSince" });
    inDialog(element, '[data-id="update-all"]').click();
    await flush();
    expect(dialog(element)).toBeNull();
    expect(notice(element)).toBe(
      "Someone else changed this week since, so nothing was updated."
    );
    expect(getInputs).toHaveBeenCalledTimes(2);
  });

  it("setup changed again since the list was shown: it shows what it would change now", async () => {
    const element = await render();
    await openUpdate(element);
    updateToMatchSetup.mockResolvedValue({ refused: "setupChanged" });
    getSetupChanges.mockResolvedValue(LEFT);
    inDialog(element, '[data-id="update-all"]').click();
    await flush();
    expect(inDialog(element, '[data-id="notice"]').textContent).toBe(
      "Setup changed again, so nothing was updated."
    );
    expect(rowsIn(element)).toEqual([
      "Bunk 2 · Monday · Period 2 | Open → Flagpole | Flagpole is set up here now"
    ]);
    expect(getInputs).toHaveBeenCalledTimes(1);
  });

  it("an update that fails closes the list and says what didn't happen", async () => {
    const element = await render();
    await openUpdate(element);
    updateToMatchSetup.mockRejectedValue({ body: { message: "Boom" } });
    inDialog(element, '[data-id="update-all"]').click();
    await flush();
    expect(dialog(element)).toBeNull();
    expect(errorText(element)).toContain("Week 1 was not updated.");
  });

  it("a failed read keeps the box and the dots, and says it couldn't check; a later read clears it", async () => {
    const element = await render();
    getSetupChanges.mockRejectedValue({ body: { message: "Boom" } });
    window.dispatchEvent(new CustomEvent("focus"));
    await flush();
    expect(errorText(element)).toContain(
      "Shoresh couldn't check Week 1 against setup."
    );
    expect(box(element)).not.toBeNull();
    expect(dotIn(element, "0-1").label).toContain("Deleted from setup");
    getSetupChanges.mockResolvedValue(PREVIEW);
    window.dispatchEvent(new CustomEvent("focus"));
    await flush();
    expect(errorText(element)).toBeNull();
  });

  it("Start over's save reads the setup changes again", async () => {
    const element = await render();
    saveWeekOnServer.mockResolvedValue({
      conflict: false,
      scheduleId: SCHEDULE,
      revision: "2026-06-29:2",
      versionId: "a0S000000000031AAA",
      locks: []
    });
    getSetupChanges.mockResolvedValue(NOTHING);
    q(element, '[data-action="StartOver"]').click();
    await flush();
    expect(saveWeekOnServer).toHaveBeenCalled();
    expect(getSetupChanges).toHaveBeenCalledTimes(2);
    expect(box(element)).toBeNull();
  });

  it("reads them again after a hand edit saves while the week differs from setup, and not when it matches", async () => {
    const element = await render();
    const editor = q(element, "c-shoresh-week-editor");
    editor.dispatchEvent(new CustomEvent("saved", { detail: {} }));
    await flush();
    expect(getSetupChanges).toHaveBeenCalledTimes(2);
    getSetupChanges.mockResolvedValue(NOTHING);
    editor.dispatchEvent(new CustomEvent("saved", { detail: {} }));
    await flush();
    expect(getSetupChanges).toHaveBeenCalledTimes(3);
    editor.dispatchEvent(new CustomEvent("saved", { detail: {} }));
    await flush();
    expect(getSetupChanges).toHaveBeenCalledTimes(3);
  });

  it("coming back to the window doesn't read the week again while the list is open or an update is on its way", async () => {
    const element = await render();
    await openUpdate(element);
    window.dispatchEvent(new CustomEvent("focus"));
    await flush();
    expect(getInputs).toHaveBeenCalledTimes(1);
    const held = pending();
    updateToMatchSetup.mockReturnValue(held.promise);
    inDialog(element, '[data-id="update-all"]').click();
    await flush();
    window.dispatchEvent(new CustomEvent("focus"));
    await flush();
    expect(getInputs).toHaveBeenCalledTimes(1);
    getInputs.mockResolvedValue(week({ revision: "2026-06-29:2" }));
    getSetupChanges.mockResolvedValue(NOTHING);
    held.resolve({ refused: null, kept: false });
    await flush();
    // Read once, by the update itself.
    expect(getInputs).toHaveBeenCalledTimes(2);
  });

  it("setup saved on another screen while the list is open reads the week once the list closes", async () => {
    const element = await render();
    await openUpdate(element);
    element.setup = nsRecord({ ...SETUP });
    await flush();
    expect(getInputs).toHaveBeenCalledTimes(1);
    inDialog(element, '[data-id="close"]').click();
    await flush();
    expect(getInputs).toHaveBeenCalledTimes(2);
  });
});
