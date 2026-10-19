import { createElement } from "lwc";
import ShoreshManualBuild from "c/shoreshManualBuild";
import getDraft from "@salesforce/apex/ManualBuildController.getDraft";
import getSetupChanges from "@salesforce/apex/SetupMatchController.getSetupChanges";
import updateToMatchSetup from "@salesforce/apex/SetupMatchController.updateToMatchSetup";
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

async function render(preview = PREVIEW, start = swimWeek()) {
  getDraft.mockResolvedValue(start);
  getSetupChanges.mockResolvedValue(preview);
  const element = createElement("c-shoresh-manual-build", {
    is: ShoreshManualBuild
  });
  element.terms = buildTerms(LABELS);
  element.setup = SETUP;
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

  it("says setup changed, in the camp's words, with Update to match setup", async () => {
    const element = await render();
    const line = q(element, '[data-id="setup-changed"]');
    expect(line.querySelector("c-shoresh-dot").label).toBe(
      "Setup changed since this Session started"
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
      keys: ["k1"],
      seenRevisions: PREVIEW.revisions
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
      keys: ["k1", "k2"],
      seenRevisions: PREVIEW.revisions
    });
    expect(dialog(element)).toBeNull();
    expect(q(element, '[data-id="setup-changed"]')).toBeNull();
    expect(q(element, "c-shoresh-week-editor").restoring).toBe(false);
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
});
