import { createElement } from "lwc";
import ShoreshManualBuild from "c/shoreshManualBuild";
import getDraft from "@salesforce/apex/ManualBuildController.getDraft";
import getSetupChanges from "@salesforce/apex/SetupMatchController.getSetupChanges";
import updateToMatchSetup from "@salesforce/apex/SetupMatchController.updateToMatchSetup";
import restoreVersion from "@salesforce/apex/ManualBuildController.restoreVersion";
import getVersions from "@salesforce/apex/SchedulesController.getVersions";
import saveSlots from "@salesforce/apex/ManualBuildController.saveSlots";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";
import { find } from "shoresh-jest/week-editor";
import { draft } from "../../shoreshWeekEditor/__tests__/data/draftFixture";

// "Setup changed since the week started" on Manual Build (ADR 0008 part 6): the dots the server
// works out (SetupMatch), the line under the toolbar, and "Update to match setup", shown first,
// one change at a time or all at once. Synthetic camp: draftFixture.

const apex = () => ({ default: jest.fn() });
jest.mock("@salesforce/apex/ManualBuildController.getDraft", () => apex(), {
  virtual: true
});
jest.mock(
  "@salesforce/apex/ManualBuildController.startBlankWeek",
  () => apex(),
  {
    virtual: true
  }
);
jest.mock("@salesforce/apex/ManualBuildController.saveSlots", () => apex(), {
  virtual: true
});
jest.mock(
  "@salesforce/apex/SetupMatchController.getSetupChanges",
  () => apex(),
  {
    virtual: true
  }
);
jest.mock(
  "@salesforce/apex/SetupMatchController.updateToMatchSetup",
  () => apex(),
  {
    virtual: true
  }
);
jest.mock("@salesforce/apex/SchedulesController.getVersions", () => apex(), {
  virtual: true
});
jest.mock(
  "@salesforce/apex/ManualBuildController.restoreVersion",
  () => apex(),
  {
    virtual: true
  }
);

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
      fixedActivities: [],
      recurringActivities: []
    }
  ],
  activities: [{ Id: "a1", Name: "Swim" }],
  locations: []
});
const LABELS = [
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true },
  { term: "Week", singular: "Session", plural: "Sessions", isCustom: true }
];
const FLAGPOLE = { kind: "F", id: "f1", name: "Flagpole", gone: false };
const SWIM = { kind: "A", id: "a1", name: "Swim", gone: false };
const BOATING = { kind: "A", id: "a2", name: "Boating", gone: false };

// Monday: Swim in Bunk 1's Period 2 (deleted from setup since); Flagpole now set up for Bunk 2
// in Period 2 too.
const SWIM_DELETED = {
  key: "k1",
  dateValue: "2026-06-29",
  summary: null,
  takesChoices: true,
  lines: [
    {
      place: "Bunk 1 · Monday · Period 2",
      before: "Swim",
      after: "Open",
      reason: "Deleted from setup"
    }
  ]
};
const FLAGPOLE_NOW = {
  key: "k2",
  dateValue: "2026-06-29",
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
  revisions: "2026-06-29:1,2026-06-30:1",
  closedActivityIds: [],
  problem: null,
  dots: [
    { key: "2026-06-29|g1|t2", words: "Deleted from setup" },
    { key: "2026-06-29|g2|t2", words: "Flagpole is set up here now" }
  ],
  changes: [SWIM_DELETED, FLAGPOLE_NOW]
};
const NOTHING = {
  revisions: "2026-06-29:2,2026-06-30:1",
  closedActivityIds: [],
  problem: null,
  dots: [],
  changes: []
};

const flush = () =>
  [...Array(12)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

function swimWeek() {
  return draft([FLAGPOLE, SWIM], ["1,2,", "1,,"]);
}

const TWO_PROGRAMS = nsRecord({
  ...SETUP,
  weeks: [
    { Id: "w1", Name: "Week 1" },
    { Id: "w2", Name: "Week 2" }
  ],
  programs: [
    ...SETUP.programs,
    {
      ...SETUP.programs[0],
      program: { Id: "p2", Name: "Teens" }
    }
  ]
});
const THREE_CHANGES = {
  ...PREVIEW,
  changes: [
    SWIM_DELETED,
    FLAGPOLE_NOW,
    { ...FLAGPOLE_NOW, key: "k3", lines: [{ ...FLAGPOLE_NOW.lines[0] }] }
  ]
};
/** What is left after one change: the given rows. */
const leaving = (...changes) => ({
  ...PREVIEW,
  revisions: `left-${changes.length}`,
  changes
});
const VERSION = {
  id: "v1",
  name: "Before the trip",
  origin: "Manual",
  reason: "Saved",
  savedAt: "2026-10-17T13:00:00.000Z",
  publishedAt: null
};
const PUBLISHED = {
  id: "pub1",
  publishedAt: "2026-10-18T10:00:00.000Z",
  publishedBy: "Pat Director",
  changedSince: false
};
const made = (published = null) => ({
  refused: null,
  kept: false,
  view: { ...draft([FLAGPOLE], ["1,,", "1,1,"]), published }
});
const TWO_WEEKS = nsRecord({
  ...SETUP,
  weeks: [
    { Id: "w1", Name: "Week 1" },
    { Id: "w2", Name: "Week 2" }
  ]
});

async function render(preview = PREVIEW, start = swimWeek(), setup = SETUP) {
  getDraft.mockResolvedValue(start);
  getSetupChanges.mockResolvedValue(preview);
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
const cell = (element, key) =>
  q(element, '[data-id="edit-grid"]').shadowRoot.querySelector(
    `[data-cell="${key}"]`
  );
const dotIn = (element, key) =>
  cell(element, key).querySelector("c-shoresh-dot");
/** Delete on a cell, as the keyboard sends it. */
const clearCell = (element, key) =>
  cell(element, key).dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Delete",
      bubbles: true,
      composed: true
    })
  );
const cellText = (element, key) =>
  cell(element, key).querySelector(".cell-name").textContent;
/** The week and program pickers, and whether each is locked. */
const pickersLocked = (element) =>
  ['[data-id="week"]', '[data-id="program"]'].map(
    (selector) => q(element, selector).disabled
  );
const dialog = (element) => q(element, '[data-id="setup-match"]');
const inDialog = (element, selector) =>
  dialog(element).shadowRoot.querySelector(selector);
/** Each row as read: its summary, then each line's place, change and why, joined by " | ". */
const rowsIn = (element) =>
  [...dialog(element).shadowRoot.querySelectorAll('[data-id="change"]')].map(
    (row) =>
      [...row.querySelectorAll(".summary, .place, .from-to, .reason")]
        .map((part) => part.textContent.trim())
        .join(" | ")
  );

const pending = () => {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};
const saved = async (element) => {
  q(element, "c-shoresh-week-editor").dispatchEvent(
    new CustomEvent("saved", { detail: {} })
  );
  await flush();
};
const editorText = (element) => {
  const shown = q(element, '[data-id="build-error"]');
  return shown ? shown.textContent.trim() : null;
};

async function openUpdate(element) {
  q(element, '[data-id="update-to-match"]').click();
  await flush();
}

describe("c-shoresh-manual-build: setup changed since the week started", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("asks for the week's setup changes once the week is shown, and dots the cells", async () => {
    const element = await render();
    expect(getSetupChanges).toHaveBeenCalledWith({ scheduleId: "d1" });
    // Bunk 1's Swim and Bunk 2's Open Period 2: the server's words, on the cell.
    expect(dotIn(element, "0-1").label).toBe("Deleted from setup");
    expect(dotIn(element, "1-1").label).toBe("Flagpole is set up here now");
    expect(dotIn(element, "0-2")).toBeNull();
  });

  it("setup saved on another screen reads the week's setup changes again", async () => {
    const element = await render(NOTHING);
    expect(dotIn(element, "0-1")).toBeNull();
    // Camp Setup reloads the season after a save elsewhere: a new setup, the same week.
    getSetupChanges.mockResolvedValue(PREVIEW);
    element.setup = nsRecord({ ...SETUP });
    await flush();
    expect(getDraft).toHaveBeenCalledTimes(2);
    expect(getSetupChanges).toHaveBeenCalledTimes(2);
    expect(dotIn(element, "0-1").label).toBe("Deleted from setup");
  });

  it("setup saved on another screen while an edit is saving still reads its setup changes", async () => {
    const element = await render(NOTHING);
    saveSlots.mockReturnValue(pending().promise);
    clearCell(element, "0-1");
    await flush();
    // The week can't be read again while its edit saves, and a save that finds the week matched
    // setup reads nothing after: the setup changes are read now, or never.
    getSetupChanges.mockResolvedValue(PREVIEW);
    element.setup = nsRecord({ ...SETUP });
    await flush();
    expect(getDraft).toHaveBeenCalledTimes(1);
    expect(getSetupChanges).toHaveBeenCalledTimes(2);
    expect(q(element, '[data-id="setup-changed"]')).not.toBeNull();
  });

  it("joins a setup dot to the checks' own words on the same placement", async () => {
    // Swim in Bunk 2, which it isn't set up for, and deleted from setup since.
    const start = draft([FLAGPOLE, SWIM], ["1,,", "1,2,"]);
    const element = await render(
      {
        ...PREVIEW,
        dots: [{ key: "2026-06-29|g2|t2", words: "Deleted from setup" }]
      },
      start
    );
    expect(dotIn(element, "1-1").label).toBe(
      "Not set up for Bunk 2 · Deleted from setup"
    );
  });

  it("says the week doesn't match setup, with Update to match setup", async () => {
    const element = await render();
    const line = q(element, '[data-id="setup-changed"]');
    // Never "setup changed": an activity closed this week placed by hand differs from setup
    // too, with setup unchanged.
    expect(line.querySelector("c-shoresh-dot").label).toBe(
      "Week 1 doesn't match setup"
    );
    expect(q(element, '[data-id="update-to-match"]').textContent.trim()).toBe(
      "Update to match setup"
    );
  });

  it("shows nothing when the week matches setup", async () => {
    const element = await render(NOTHING);
    expect(q(element, '[data-id="setup-changed"]')).toBeNull();
  });

  it("says why the week can't be compared, with no button", async () => {
    const element = await render({
      ...NOTHING,
      problem: "No Bunks of Main are at camp in Week 1."
    });
    expect(q(element, '[data-id="setup-changed"] c-shoresh-dot').label).toBe(
      "No Bunks of Main are at camp in Week 1."
    );
    expect(q(element, '[data-id="update-to-match"]')).toBeNull();
  });

  it("shows every change first, read fresh, and holds edits while it is open", async () => {
    const element = await render();
    await openUpdate(element);
    expect(getSetupChanges).toHaveBeenCalledTimes(2);
    expect(inDialog(element, "h2").textContent).toBe(
      "Update Week 1 to match setup?"
    );
    expect(rowsIn(element)).toEqual([
      "Bunk 1 · Monday · Period 2 | Swim → Open | Deleted from setup",
      "Bunk 2 · Monday · Period 2 | Open → Flagpole | Flagpole is set up here now"
    ]);
    // Each row's Update is named for its cell.
    expect(
      [
        ...dialog(element).shadowRoot.querySelectorAll('[data-id="update-one"]')
      ].map((b) => b.getAttribute("aria-label"))
    ).toEqual([
      "Update Bunk 1 · Monday · Period 2",
      "Update Bunk 2 · Monday · Period 2"
    ]);
    expect(q(element, "c-shoresh-week-editor").restoring).toBe(true);
    expect(updateToMatchSetup).not.toHaveBeenCalled();
  });

  it("Update on one row makes that change only, and the list stays with what is left", async () => {
    const element = await render();
    await openUpdate(element);
    const after = draft([FLAGPOLE], ["1,,", "1,,"]);
    updateToMatchSetup.mockResolvedValue({ refused: null, view: after });
    getSetupChanges.mockResolvedValue({
      ...PREVIEW,
      revisions: "2026-06-29:2,2026-06-30:1",
      dots: [PREVIEW.dots[1]],
      changes: [FLAGPOLE_NOW]
    });
    inDialog(element, '[data-key="k1"]').click();
    await flush();
    expect(updateToMatchSetup).toHaveBeenCalledWith({
      scheduleId: "d1",
      ask: {
        keys: ["k1"],
        seenRevisions: PREVIEW.revisions,
        versionKept: false
      }
    });
    // The week as the server now has it: Swim is gone, and its dot with it.
    expect(dotIn(element, "0-1")).toBeNull();
    expect(rowsIn(element)).toEqual([
      "Bunk 2 · Monday · Period 2 | Open → Flagpole | Flagpole is set up here now"
    ]);
  });

  it("Update all makes every change listed and closes the list", async () => {
    const element = await render();
    await openUpdate(element);
    updateToMatchSetup.mockResolvedValue({
      refused: null,
      view: draft([FLAGPOLE], ["1,,", "1,1,"])
    });
    getSetupChanges.mockResolvedValue(NOTHING);
    inDialog(element, '[data-id="update-all"]').click();
    await flush();
    expect(updateToMatchSetup).toHaveBeenCalledWith({
      scheduleId: "d1",
      ask: {
        keys: ["k1", "k2"],
        seenRevisions: PREVIEW.revisions,
        versionKept: false
      }
    });
    expect(dialog(element)).toBeNull();
    expect(q(element, '[data-id="setup-changed"]')).toBeNull();
    expect(q(element, "c-shoresh-week-editor").restoring).toBe(false);
  });

  it("Update all closes the list even when changes are left afterwards", async () => {
    const element = await render();
    await openUpdate(element);
    updateToMatchSetup.mockResolvedValue({
      refused: null,
      view: draft([FLAGPOLE], ["1,,", "1,1,"])
    });
    // Setup changed again meanwhile: the box says so, but the list doesn't open by itself.
    getSetupChanges.mockResolvedValue({ ...PREVIEW, changes: [FLAGPOLE_NOW] });
    inDialog(element, '[data-id="update-all"]').click();
    await flush();
    expect(dialog(element)).toBeNull();
    expect(q(element, '[data-id="setup-changed"]')).not.toBeNull();
  });

  it("Cancel changes nothing", async () => {
    const element = await render();
    await openUpdate(element);
    inDialog(element, '[data-id="close"]').click();
    await flush();
    expect(dialog(element)).toBeNull();
    expect(updateToMatchSetup).not.toHaveBeenCalled();
    expect(dotIn(element, "0-1").label).toBe("Deleted from setup");
  });

  it("someone else saved the week since: nothing is updated, it says so, and reads the week again", async () => {
    const element = await render();
    await openUpdate(element);
    updateToMatchSetup.mockResolvedValue({ refused: "changedSince" });
    inDialog(element, '[data-id="update-all"]').click();
    await flush();
    expect(dialog(element)).toBeNull();
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      "Someone else changed this Session since, so nothing was updated."
    );
    expect(getDraft).toHaveBeenCalledTimes(2);
  });

  it("setup changed again since the list was shown: it shows what it would change now", async () => {
    const element = await render();
    await openUpdate(element);
    updateToMatchSetup.mockResolvedValue({ refused: "setupChanged" });
    getSetupChanges.mockResolvedValue({
      ...PREVIEW,
      changes: [FLAGPOLE_NOW]
    });
    inDialog(element, '[data-key="k1"]').click();
    await flush();
    expect(inDialog(element, '[data-id="notice"]').textContent).toBe(
      "Setup changed again since you looked, so nothing was updated. This is what it would change now."
    );
    expect(rowsIn(element)).toHaveLength(1);
  });

  it("reads the setup changes again after a save while the week differs from setup", async () => {
    const element = await render();
    expect(getSetupChanges).toHaveBeenCalledTimes(1);
    q(element, "c-shoresh-week-editor").dispatchEvent(
      new CustomEvent("saved", { detail: {} })
    );
    await flush();
    expect(getSetupChanges).toHaveBeenCalledTimes(2);
  });

  it("doesn't read them again after a save when the week matches setup and nothing is closed", async () => {
    const element = await render(NOTHING);
    q(element, "c-shoresh-week-editor").dispatchEvent(
      new CustomEvent("saved", { detail: {} })
    );
    await flush();
    expect(getSetupChanges).toHaveBeenCalledTimes(1);
  });

  it("reads them again after a save when an activity is closed this week (placing it is a new difference)", async () => {
    const element = await render({ ...NOTHING, closedActivityIds: ["a1"] });
    q(element, "c-shoresh-week-editor").dispatchEvent(
      new CustomEvent("saved", { detail: {} })
    );
    await flush();
    expect(getSetupChanges).toHaveBeenCalledTimes(2);
  });

  it("a failed read keeps the box and the dots, and says it couldn't check", async () => {
    const element = await render();
    getSetupChanges.mockRejectedValue({ body: { message: "No access." } });
    await saved(element);
    // Hiding them would make the week look as if it matched setup.
    expect(q(element, '[data-id="setup-changed"]')).not.toBeNull();
    expect(dotIn(element, "0-1").label).toBe("Deleted from setup");
    expect(editorText(element)).toBe(
      "Shoresh couldn't check Week 1 against setup. No access."
    );
    // Update to match setup reads fresh, fails the same way, and opens nothing.
    await openUpdate(element);
    expect(dialog(element)).toBeNull();
    expect(q(element, '[data-id="update-to-match"]')).not.toBeNull();
  });

  it("a read that works after a failed one clears the couldn't-check message", async () => {
    const element = await render();
    getSetupChanges.mockRejectedValueOnce({ body: { message: "No access." } });
    await saved(element);
    expect(editorText(element)).toBe(
      "Shoresh couldn't check Week 1 against setup. No access."
    );
    getSetupChanges.mockResolvedValue(NOTHING);
    await saved(element);
    expect(q(element, '[data-id="setup-changed"]')).toBeNull();
    expect(editorText(element)).toBeNull();
  });

  it("a read that works leaves any other error on screen", async () => {
    const element = await render();
    q(element, "c-shoresh-week-editor").dispatchEvent(
      new CustomEvent("errorchange", {
        detail: { message: "Bunk 1 is busy then." }
      })
    );
    await saved(element);
    expect(getSetupChanges).toHaveBeenCalledTimes(2);
    expect(editorText(element)).toBe("Bunk 1 is busy then.");
  });

  it("Update to match setup says why when the week can't be compared now, never that it matches", async () => {
    const element = await render();
    const problem = "No Bunks of Main are at camp in Week 1.";
    getSetupChanges.mockResolvedValue({ ...NOTHING, problem });
    await openUpdate(element);
    expect(dialog(element)).toBeNull();
    expect(q(element, '[data-id="notice"]').textContent).toBe(problem);
    expect(q(element, '[data-id="setup-changed"] c-shoresh-dot').label).toBe(
      problem
    );
  });

  it("setup changed again and nothing is left to change: the list closes and says why", async () => {
    const element = await render();
    await openUpdate(element);
    updateToMatchSetup.mockResolvedValue({ refused: "setupChanged" });
    getSetupChanges.mockResolvedValue(NOTHING);
    inDialog(element, '[data-key="k1"]').click();
    await flush();
    expect(dialog(element)).toBeNull();
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      "Setup changed again since you looked, so nothing was updated. Week 1 matches setup now."
    );
  });

  it("a reload already on its way doesn't paint the week as it was over the update", async () => {
    const element = await render();
    // Coming back to the window reads the week again; that read is slow.
    const old = pending();
    getDraft.mockReturnValueOnce(old.promise);
    window.dispatchEvent(new FocusEvent("focus"));
    await flush();
    expect(getDraft).toHaveBeenCalledTimes(2);
    await openUpdate(element);
    updateToMatchSetup.mockResolvedValue({
      refused: null,
      view: draft([FLAGPOLE], ["1,,", "1,1,"])
    });
    getSetupChanges.mockResolvedValue(NOTHING);
    inDialog(element, '[data-id="update-all"]').click();
    await flush();
    expect(cellText(element, "0-1")).toBe("Open");
    // The old read, Swim and all, arrives after the update: it is dropped.
    old.resolve(swimWeek());
    await flush();
    expect(cellText(element, "0-1")).toBe("Open");
    expect(cellText(element, "1-1")).toBe("Flagpole");
  });

  it("Update to match setup waits while an edit is still saving", async () => {
    const element = await render();
    saveSlots.mockReturnValue(pending().promise);
    clearCell(element, "0-1");
    await flush();
    const button = q(element, '[data-id="update-to-match"]');
    expect(button.disabled).toBe(true);
    // Pressed anyway (the button drawn before the edit began): it still waits, and says so.
    getSetupChanges.mockClear();
    button.disabled = false;
    button.click();
    await flush();
    expect(getSetupChanges).not.toHaveBeenCalled();
    expect(dialog(element)).toBeNull();
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      "One moment: an edit is still saving."
    );
  });

  it("drops an older answer that arrives after a newer one", async () => {
    const element = await render();
    const first = pending();
    const second = pending();
    getSetupChanges
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    await saved(element);
    await saved(element);
    second.resolve(NOTHING);
    await flush();
    first.resolve(PREVIEW);
    await flush();
    expect(q(element, '[data-id="setup-changed"]')).toBeNull();
    expect(dotIn(element, "0-1")).toBeNull();
  });

  it("another week shows none of the last week's setup changes while its own are read", async () => {
    const element = await render(PREVIEW, swimWeek(), TWO_WEEKS);
    expect(q(element, '[data-id="setup-changed"]')).not.toBeNull();
    getSetupChanges.mockReturnValue(pending().promise);
    q(element, '[data-id="week"]').dispatchEvent(
      new CustomEvent("change", { detail: { value: "w2" } })
    );
    await flush();
    expect(q(element, "c-shoresh-week-editor")).not.toBeNull();
    expect(q(element, '[data-id="setup-changed"]')).toBeNull();
    expect(dotIn(element, "0-1")).toBeNull();
  });

  it("reads the setup changes again after a Restore", async () => {
    getVersions.mockResolvedValue([
      {
        id: "v1",
        name: "Before the trip",
        origin: "Manual",
        reason: "Saved",
        savedAt: "2026-10-17T13:00:00.000Z",
        publishedAt: null
      }
    ]);
    const element = await render();
    restoreVersion.mockResolvedValue(swimWeek());
    getSetupChanges.mockResolvedValue(NOTHING);
    const versions = q(element, '[data-id="versions"]');
    versions.shadowRoot.querySelector('[data-id="versions-button"]').click();
    await flush();
    versions.shadowRoot.querySelector('[data-action="open"]').click();
    await flush();
    expect(restoreVersion).toHaveBeenCalled();
    expect(getSetupChanges).toHaveBeenCalledTimes(2);
    expect(q(element, '[data-id="setup-changed"]')).toBeNull();
  });

  it("Cancel puts focus back on Update to match setup", async () => {
    const element = await render();
    await openUpdate(element);
    inDialog(element, '[data-id="close"]').click();
    await flush();
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="update-to-match"]')
    );
  });

  it("an update starts Undo over, as Restore does", async () => {
    const element = await render();
    // An edit first: Undo has something to take back.
    saveSlots.mockResolvedValue({
      conflicts: [],
      schedule: draft([FLAGPOLE, SWIM], ["1,,", "1,,"]).schedule
    });
    clearCell(element, "0-1");
    await flush();
    expect(q(element, '[data-id="undo"]').disabled).toBe(false);
    await openUpdate(element);
    updateToMatchSetup.mockResolvedValue({
      refused: null,
      view: draft([FLAGPOLE], ["1,,", "1,1,"])
    });
    getSetupChanges.mockResolvedValue(NOTHING);
    inDialog(element, '[data-id="update-all"]').click();
    await flush();
    expect(q(element, '[data-id="undo"]').disabled).toBe(true);
  });

  it("an update that fails closes the list and says what didn't happen", async () => {
    const element = await render();
    await openUpdate(element);
    updateToMatchSetup.mockRejectedValue({ body: { message: "No access." } });
    inDialog(element, '[data-id="update-all"]').click();
    await flush();
    expect(dialog(element)).toBeNull();
    expect(editorText(element)).toBe("Week 1 was not updated. No access.");
    expect(q(element, "c-shoresh-week-editor").restoring).toBe(false);
  });

  it("after one change the open list says it was made, inside the dialog", async () => {
    const element = await render();
    await openUpdate(element);
    updateToMatchSetup.mockResolvedValue({
      refused: null,
      view: draft([FLAGPOLE], ["1,,", "1,,"])
    });
    getSetupChanges.mockResolvedValue({
      ...PREVIEW,
      dots: [PREVIEW.dots[1]],
      changes: [FLAGPOLE_NOW]
    });
    inDialog(element, '[data-key="k1"]').click();
    await flush();
    expect(inDialog(element, '[data-id="announce"]').textContent.trim()).toBe(
      "Updated to match setup."
    );
  });

  it("a setup dot on any period of a longer activity shows on the activity, said once", async () => {
    // Boating runs Period 2 and Lunch for Bunk 1; only Lunch's cell has a dot.
    const start = draft([FLAGPOLE, SWIM, BOATING], ["1,3,^", "1,,"]);
    const element = await render(
      {
        ...PREVIEW,
        dots: [{ key: "2026-06-29|g1|t3", words: "Its Periods changed" }]
      },
      start
    );
    expect(dotIn(element, "0-1").label).toBe("Its Periods changed");
  });

  it("the same words on two periods of one activity are said once", async () => {
    const start = draft([FLAGPOLE, SWIM, BOATING], ["1,3,^", "1,,"]);
    const element = await render(
      {
        ...PREVIEW,
        dots: [
          { key: "2026-06-29|g1|t2", words: "Deleted from setup" },
          { key: "2026-06-29|g1|t3", words: "Deleted from setup" }
        ]
      },
      start
    );
    expect(dotIn(element, "0-1").label).toBe("Deleted from setup");
  });
  // ---------- review round 3 ----------

  it("a late answer for the last week never shows on the week chosen next", async () => {
    const element = await render(PREVIEW, swimWeek(), TWO_WEEKS);
    const late = pending();
    getSetupChanges.mockReturnValueOnce(late.promise);
    await saved(element);
    // Week 2 is chosen; its draft is still being read when Week 1's late answer arrives.
    const week2 = pending();
    getDraft.mockReturnValueOnce(week2.promise);
    getSetupChanges.mockReturnValue(pending().promise);
    q(element, '[data-id="week"]').dispatchEvent(
      new CustomEvent("change", { detail: { value: "w2" } })
    );
    await flush();
    late.resolve(PREVIEW);
    await flush();
    week2.resolve(swimWeek());
    await flush();
    expect(q(element, "c-shoresh-week-editor")).not.toBeNull();
    expect(q(element, '[data-id="setup-changed"]')).toBeNull();
    expect(dotIn(element, "0-1")).toBeNull();
  });

  it("a late failed check for the last week says nothing on the week chosen next", async () => {
    const element = await render(PREVIEW, swimWeek(), TWO_WEEKS);
    const late = pending();
    getSetupChanges.mockReturnValueOnce(late.promise);
    await saved(element);
    // Week 2 is chosen and shown; its own check is still on its way when Week 1's fails.
    getSetupChanges.mockReturnValue(pending().promise);
    q(element, '[data-id="week"]').dispatchEvent(
      new CustomEvent("change", { detail: { value: "w2" } })
    );
    await flush();
    late.reject({ body: { message: "No access." } });
    await flush();
    expect(q(element, "c-shoresh-week-editor")).not.toBeNull();
    expect(editorText(element)).toBeNull();
  });

  it("week and program stay put, and Versions waits, while the list is open", async () => {
    const element = await render(PREVIEW, swimWeek(), TWO_PROGRAMS);
    expect(pickersLocked(element)).toEqual([false, false]);
    await openUpdate(element);
    expect(pickersLocked(element)).toEqual([true, true]);
    expect(q(element, '[data-id="versions"]').busy).toBe(true);
    expect(q(element, '[data-id="publish"]').disabled).toBe(true);
    inDialog(element, '[data-id="close"]').click();
    await flush();
    expect(pickersLocked(element)).toEqual([false, false]);
    expect(q(element, '[data-id="versions"]').busy).toBe(false);
  });

  it("week and program stay put while the list is read and while an update is on its way", async () => {
    const element = await render(PREVIEW, swimWeek(), TWO_PROGRAMS);
    // Reading the list fresh.
    const reading = pending();
    getSetupChanges.mockReturnValueOnce(reading.promise);
    q(element, '[data-id="update-to-match"]').click();
    await flush();
    expect(pickersLocked(element)).toEqual([true, true]);
    expect(q(element, '[data-id="versions"]').busy).toBe(true);
    expect(q(element, "c-shoresh-week-editor").restoring).toBe(true);
    // Coming back to the window meanwhile doesn't read the week again.
    window.dispatchEvent(new FocusEvent("focus"));
    await flush();
    expect(getDraft).toHaveBeenCalledTimes(1);
    reading.resolve(PREVIEW);
    await flush();
    // An update on its way.
    const working = pending();
    updateToMatchSetup.mockReturnValueOnce(working.promise);
    inDialog(element, '[data-id="update-all"]').click();
    await flush();
    expect(pickersLocked(element)).toEqual([true, true]);
    expect(q(element, '[data-id="versions"]').busy).toBe(true);
    getSetupChanges.mockResolvedValue(NOTHING);
    working.resolve(made());
    await flush();
    expect(pickersLocked(element)).toEqual([false, false]);
  });

  it("coming back to the window doesn't read the week again while the list is open or an update is on its way", async () => {
    const element = await render();
    await openUpdate(element);
    window.dispatchEvent(new FocusEvent("focus"));
    await flush();
    expect(getDraft).toHaveBeenCalledTimes(1);
    const working = pending();
    updateToMatchSetup.mockReturnValueOnce(working.promise);
    inDialog(element, '[data-id="update-all"]').click();
    await flush();
    window.dispatchEvent(new FocusEvent("focus"));
    await flush();
    expect(getDraft).toHaveBeenCalledTimes(1);
    getSetupChanges.mockResolvedValue(NOTHING);
    working.resolve(made());
    await flush();
    window.dispatchEvent(new FocusEvent("focus"));
    await flush();
    expect(getDraft).toHaveBeenCalledTimes(2);
  });

  it("Update all with nothing left: focus goes to Publish, and it says how many were made", async () => {
    const element = await render();
    await openUpdate(element);
    inDialog(element, '[data-id="update-all"]').focus();
    updateToMatchSetup.mockResolvedValue(made());
    getSetupChanges.mockResolvedValue(NOTHING);
    inDialog(element, '[data-id="update-all"]').click();
    await flush();
    expect(dialog(element)).toBeNull();
    // Update to match setup is gone with the box: focus goes on to Publish, not the page.
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="publish"]')
    );
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      "Updated 2 changes to match setup."
    );
  });

  it("Update all with changes left: focus goes back to Update to match setup", async () => {
    const element = await render();
    await openUpdate(element);
    updateToMatchSetup.mockResolvedValue(made());
    getSetupChanges.mockResolvedValue(leaving(FLAGPOLE_NOW));
    inDialog(element, '[data-id="update-all"]').click();
    await flush();
    expect(dialog(element)).toBeNull();
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="update-to-match"]')
    );
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      "Updated 2 changes to match setup."
    );
  });

  it("after an update: publish state, the checks and Versions are as the week is now", async () => {
    getVersions.mockResolvedValue([VERSION]);
    const element = await render(PREVIEW, {
      ...swimWeek(),
      published: PUBLISHED
    });
    // Restored first: Versions marks that version as the week shown.
    restoreVersion.mockResolvedValue({ ...swimWeek(), published: PUBLISHED });
    const versions = q(element, '[data-id="versions"]');
    versions.shadowRoot.querySelector('[data-id="versions-button"]').click();
    await flush();
    versions.shadowRoot.querySelector('[data-action="open"]').click();
    await flush();
    expect(versions.openId).toBe("v1");
    expect(q(element, '[data-id="changed-since"]')).toBeNull();
    const checksKey = q(element, "c-shoresh-week-checks").resetKey;
    getSetupChanges.mockResolvedValue(PREVIEW);
    await openUpdate(element);
    getVersions.mockClear();
    updateToMatchSetup.mockResolvedValue({
      ...made({ ...PUBLISHED, changedSince: true }),
      kept: true
    });
    getSetupChanges.mockResolvedValue(NOTHING);
    inDialog(element, '[data-id="update-all"]').click();
    await flush();
    // The published copy is untouched, and the week now differs from it.
    expect(q(element, '[data-id="changed-since"]')).not.toBeNull();
    // The checks start over on the week as it is now.
    expect(q(element, "c-shoresh-week-checks").resetKey).not.toBe(checksKey);
    // No longer the version restored; the version just kept is listed.
    expect(versions.openId).toBeNull();
    expect(getVersions).toHaveBeenCalledTimes(1);
  });

  it("after an update, a refused Restore's line goes: the week shown is the week as it is now", async () => {
    getVersions.mockResolvedValue([VERSION]);
    const element = await render();
    restoreVersion.mockResolvedValue({ changedSince: true });
    const versions = q(element, '[data-id="versions"]');
    versions.shadowRoot.querySelector('[data-id="versions-button"]').click();
    await flush();
    versions.shadowRoot.querySelector('[data-action="open"]').click();
    await flush();
    expect(q(element, '[data-id="restore-refused"]')).not.toBeNull();
    await openUpdate(element);
    updateToMatchSetup.mockResolvedValue(made());
    getSetupChanges.mockResolvedValue(NOTHING);
    inDialog(element, '[data-id="update-all"]').click();
    await flush();
    expect(q(element, '[data-id="restore-refused"]')).toBeNull();
  });

  it("one opening of the list keeps one version: the first update that keeps one, then none", async () => {
    const element = await render(THREE_CHANGES);
    await openUpdate(element);
    updateToMatchSetup.mockResolvedValueOnce({ ...made(), kept: true });
    getSetupChanges.mockResolvedValue(
      leaving(FLAGPOLE_NOW, THREE_CHANGES.changes[2])
    );
    inDialog(element, '[data-key="k1"]').click();
    await flush();
    updateToMatchSetup.mockResolvedValueOnce(made());
    getSetupChanges.mockResolvedValue(leaving(THREE_CHANGES.changes[2]));
    inDialog(element, '[data-key="k2"]').click();
    await flush();
    expect(
      updateToMatchSetup.mock.calls.map(([args]) => args.ask.versionKept)
    ).toEqual([false, true]);
    // Opened again: a new opening, whose first update may keep one again.
    inDialog(element, '[data-id="close"]').click();
    await flush();
    await openUpdate(element);
    updateToMatchSetup.mockResolvedValueOnce(made());
    getSetupChanges.mockResolvedValue(NOTHING);
    inDialog(element, '[data-key="k3"]').click();
    await flush();
    expect(updateToMatchSetup.mock.calls[2][0].ask.versionKept).toBe(false);
  });

  it("one opening keeps one version past the second update: every later one keeps none", async () => {
    const fourth = {
      ...FLAGPOLE_NOW,
      key: "k4",
      lines: [{ ...FLAGPOLE_NOW.lines[0] }]
    };
    const element = await render({
      ...THREE_CHANGES,
      changes: [...THREE_CHANGES.changes, fourth]
    });
    await openUpdate(element);
    updateToMatchSetup.mockResolvedValueOnce({ ...made(), kept: true });
    getSetupChanges.mockResolvedValue(
      leaving(FLAGPOLE_NOW, THREE_CHANGES.changes[2], fourth)
    );
    inDialog(element, '[data-key="k1"]').click();
    await flush();
    // The second and third keep none, so their answers say kept: false.
    updateToMatchSetup.mockResolvedValueOnce(made());
    getSetupChanges.mockResolvedValue(
      leaving(THREE_CHANGES.changes[2], fourth)
    );
    inDialog(element, '[data-key="k2"]').click();
    await flush();
    updateToMatchSetup.mockResolvedValueOnce(made());
    getSetupChanges.mockResolvedValue(leaving(fourth));
    inDialog(element, '[data-key="k3"]').click();
    await flush();
    updateToMatchSetup.mockResolvedValueOnce(made());
    getSetupChanges.mockResolvedValue(NOTHING);
    inDialog(element, '[data-key="k4"]').click();
    await flush();
    expect(
      updateToMatchSetup.mock.calls.map(([args]) => args.ask.versionKept)
    ).toEqual([false, true, true, true]);
  });

  it("Update to match setup still opens when the week is read again while it reads", async () => {
    const element = await render();
    // Coming back to the window reads the week again; that read is slow.
    const reload = pending();
    getDraft.mockReturnValueOnce(reload.promise);
    window.dispatchEvent(new FocusEvent("focus"));
    await flush();
    // Pressed meanwhile: its read of the setup changes is slow too.
    const asked = pending();
    getSetupChanges.mockReturnValueOnce(asked.promise);
    q(element, '[data-id="update-to-match"]').click();
    await flush();
    // The week arrives first and reads the setup changes again, overtaking the click's read.
    reload.resolve(swimWeek());
    await flush();
    asked.resolve(PREVIEW);
    await flush();
    expect(dialog(element)).not.toBeNull();
    expect(rowsIn(element)).toHaveLength(2);
  });

  it("a version kept is remembered when setup changed again and the list stays open", async () => {
    const element = await render(THREE_CHANGES);
    await openUpdate(element);
    updateToMatchSetup.mockResolvedValueOnce({ ...made(), kept: true });
    getSetupChanges.mockResolvedValue(
      leaving(FLAGPOLE_NOW, THREE_CHANGES.changes[2])
    );
    inDialog(element, '[data-key="k1"]').click();
    await flush();
    updateToMatchSetup.mockResolvedValueOnce({ refused: "setupChanged" });
    inDialog(element, '[data-key="k2"]').click();
    await flush();
    updateToMatchSetup.mockResolvedValueOnce(made());
    inDialog(element, '[data-key="k3"]').click();
    await flush();
    expect(
      updateToMatchSetup.mock.calls.map(([args]) => args.ask.versionKept)
    ).toEqual([false, true, true]);
  });

  it("a second one-row update is read out again, though its words are the same", async () => {
    const element = await render(THREE_CHANGES);
    await openUpdate(element);
    updateToMatchSetup.mockResolvedValue(made());
    getSetupChanges.mockResolvedValue(
      leaving(FLAGPOLE_NOW, THREE_CHANGES.changes[2])
    );
    inDialog(element, '[data-key="k1"]').click();
    await flush();
    const first = inDialog(element, '[data-id="announce"]').textContent;
    getSetupChanges.mockResolvedValue(leaving(THREE_CHANGES.changes[2]));
    inDialog(element, '[data-key="k2"]').click();
    await flush();
    const second = inDialog(element, '[data-id="announce"]').textContent;
    expect(first.trim()).toBe("Updated to match setup.");
    expect(second.trim()).toBe("Updated to match setup.");
    // A live region is read out when its words change: they did.
    expect(second).not.toBe(first);
  });

  // ---------- review round 4 ----------

  it("a save before the first check answers reads again, and the check from before the edit is dropped", async () => {
    // The week's first check is slow; it read the week before the edit.
    const first = pending();
    getSetupChanges.mockReturnValueOnce(first.promise);
    const element = await render();
    await saved(element);
    expect(getSetupChanges).toHaveBeenCalledTimes(2);
    first.resolve(NOTHING);
    await flush();
    expect(dotIn(element, "0-1").label).toBe("Deleted from setup");
    expect(q(element, '[data-id="setup-changed"]')).not.toBeNull();
  });

  it("an update whose answer comes after another week is chosen leaves that week as it is", async () => {
    const element = await render(PREVIEW, swimWeek(), TWO_WEEKS);
    await openUpdate(element);
    const working = pending();
    updateToMatchSetup.mockReturnValueOnce(working.promise);
    inDialog(element, '[data-id="update-all"]').click();
    await flush();
    // Week 2 is chosen and shown while Week 1's update is on its way.
    getDraft.mockResolvedValueOnce(draft([FLAGPOLE, BOATING], ["1,2,", "1,,"]));
    getSetupChanges.mockResolvedValue(NOTHING);
    q(element, '[data-id="week"]').dispatchEvent(
      new CustomEvent("change", { detail: { value: "w2" } })
    );
    await flush();
    expect(cellText(element, "0-1")).toBe("Boating");
    working.resolve(made());
    await flush();
    expect(cellText(element, "0-1")).toBe("Boating");
    const notice = q(element, '[data-id="notice"]');
    expect(notice ? notice.textContent : "").not.toContain("Updated");
  });

  it("Update to match setup says the week matches when a fresh read finds nothing to change", async () => {
    const element = await render();
    // Setup was put back since the line was shown.
    getSetupChanges.mockResolvedValue(NOTHING);
    await openUpdate(element);
    expect(dialog(element)).toBeNull();
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      "Week 1 matches setup."
    );
  });
});
