import { createElement } from "lwc";
import ShoreshManualBuild from "c/shoreshManualBuild";
import getDraft from "@salesforce/apex/ManualBuildController.getDraft";
import saveSlots from "@salesforce/apex/ManualBuildController.saveSlots";
import saveVersion from "@salesforce/apex/ManualBuildController.saveVersion";
import restoreVersion from "@salesforce/apex/ManualBuildController.restoreVersion";
import deleteVersion from "@salesforce/apex/ManualBuildController.deleteVersion";
import getWeekSources from "@salesforce/apex/ManualBuildController.getWeekSources";
import startFromWeek from "@salesforce/apex/ManualBuildController.startFromWeek";
import getVersions from "@salesforce/apex/SchedulesController.getVersions";
import { buildTerms } from "c/shoreshTerms";
import { WITH_SWIM, draft } from "./data/draftFixture";

// Versions on Manual Build (Save version, Restore, rename, delete) and Start from another week.
// Synthetic camp: draftFixture.

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
jest.mock("@salesforce/apex/ManualBuildController.saveVersion", () => apex(), {
  virtual: true
});
jest.mock(
  "@salesforce/apex/ManualBuildController.restoreVersion",
  () => apex(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/ManualBuildController.deleteVersion",
  () => apex(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/ManualBuildController.getWeekSources",
  () => apex(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/ManualBuildController.startFromWeek",
  () => apex(),
  { virtual: true }
);
jest.mock("@salesforce/apex/SchedulesController.getVersions", () => apex(), {
  virtual: true
});
jest.mock("@salesforce/apex/SchedulesController.renameSchedule", () => apex(), {
  virtual: true
});

const SETUP = {
  season: { Id: "se1", Name: "Summer 2026" },
  weeks: [
    { Id: "w1", Name: "Week 1" },
    { Id: "w2", Name: "Week 2" }
  ],
  programs: [{ program: { Id: "p1", Name: "Main" } }],
  activities: [],
  locations: []
};
const LABELS = [
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true }
];
const VERSIONS = [
  {
    id: "v1",
    name: "Before the trip",
    origin: "Manual",
    reason: "SavedByHand",
    savedAt: "2026-10-17T14:00:00.000Z"
  }
];

const flush = () =>
  [...Array(10)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

async function render(first) {
  getDraft.mockResolvedValue(first);
  getVersions.mockResolvedValue(VERSIONS);
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
const versionsPanel = async (element) => {
  const versions = q(element, '[data-id="versions"]');
  versions.shadowRoot.querySelector('[data-id="versions-button"]').click();
  await flush();
  return versions.shadowRoot;
};

describe("c-shoresh-manual-build: versions and Start from another week", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("lists the week's versions, each with Restore", async () => {
    const element = await render(draft(WITH_SWIM, ["1,2,", "1,,"]));
    expect(getVersions).toHaveBeenCalledWith({ programId: "p1", weekId: "w1" });
    const panel = await versionsPanel(element);
    const restore = panel.querySelector('[data-action="open"]');
    expect(restore.textContent.trim()).toBe("Restore");
    expect(panel.querySelector('[data-id="save-name"]').placeholder).toBe(
      "Name current version…"
    );
  });

  it("Restore copies the version in, starts Undo over, and says so", async () => {
    const element = await render(draft(WITH_SWIM, ["1,2,", "1,,"]));
    saveSlots.mockResolvedValue({
      conflicts: [],
      schedule: draft(WITH_SWIM, ["1,2,", "1,,"]).schedule
    });
    restoreVersion.mockResolvedValue(draft(WITH_SWIM, ["1,,", "1,,"]));
    const panel = await versionsPanel(element);
    panel.querySelector('[data-action="open"]').click();
    await flush();
    expect(restoreVersion).toHaveBeenCalledWith({
      scheduleId: "d1",
      versionId: "v1"
    });
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      "Restored Before the trip."
    );
    expect(q(element, '[data-id="undo"]').disabled).toBe(true);
    // The list is read again ("Before Restore" is in it now).
    expect(getVersions).toHaveBeenCalledTimes(2);
  });

  it("Save version keeps the week under the name typed", async () => {
    const element = await render(draft(WITH_SWIM, ["1,2,", "1,,"]));
    saveVersion.mockResolvedValue("v2");
    const panel = await versionsPanel(element);
    const input = panel.querySelector('[data-id="save-name"]');
    input.value = " After lunch swap ";
    input.dispatchEvent(new CustomEvent("input"));
    await flush();
    panel.querySelector('[data-id="save-button"]').click();
    await flush();
    expect(saveVersion).toHaveBeenCalledWith({
      scheduleId: "d1",
      name: "After lunch swap"
    });
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      "Saved After lunch swap."
    );
  });

  it("delete asks once more (Delete?) before it deletes", async () => {
    const element = await render(draft(WITH_SWIM, ["1,2,", "1,,"]));
    deleteVersion.mockResolvedValue(undefined);
    const panel = await versionsPanel(element);
    const del = panel.querySelector('[data-action="delete"]');
    del.click();
    await flush();
    expect(deleteVersion).not.toHaveBeenCalled();
    expect(del.textContent.trim()).toBe("Delete?");
    del.click();
    await flush();
    expect(deleteVersion).toHaveBeenCalledWith({
      scheduleId: "d1",
      versionId: "v1"
    });
  });

  it("a week not started yet can start from another week, and lists what was left out", async () => {
    getWeekSources.mockResolvedValue([
      {
        id: "d9",
        weekName: "Week 2",
        name: "Manual Build",
        isVersion: false
      },
      { id: "v1", weekName: "Week 1", name: "Before the trip", isVersion: true }
    ]);
    const element = await render(null);
    const menu = q(element, '[data-id="start-from"]');
    expect(
      [...menu.querySelectorAll("lightning-menu-item")].map((i) => i.label)
    ).toEqual(["Week 2 · Manual Build", "Week 1 · Before the trip (version)"]);
    startFromWeek.mockResolvedValue({
      ...draft(WITH_SWIM, ["1,2,", "1,,"]),
      leftOut: ["Swim · Bunk 2 · Monday: not at camp then"]
    });
    menu.dispatchEvent(new CustomEvent("select", { detail: { value: "d9" } }));
    await flush();
    expect(startFromWeek).toHaveBeenCalledWith({
      programId: "p1",
      weekId: "w1",
      sourceId: "d9"
    });
    expect(q(element, '[data-id="left-out"]').textContent).toContain(
      "Swim · Bunk 2 · Monday: not at camp then"
    );
  });
});
