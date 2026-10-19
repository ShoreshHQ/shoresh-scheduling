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
import startBlankWeek from "@salesforce/apex/ManualBuildController.startBlankWeek";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";
import { find } from "shoresh-jest/week-editor";
import {
  WITH_SOCCER,
  WITH_SWIM,
  draft
} from "../../shoreshWeekEditor/__tests__/data/draftFixture";

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
  // Everything building needs (desktop readiness.js), so the start buttons are offered.
  programs: [
    {
      program: { Id: "p1", Name: "Main", Monday__c: true },
      divisions: [
        { division: { Id: "d1", Name: "Juniors" }, groups: [{ Id: "g1" }] }
      ],
      timeBlocks: [{ Id: "t1", Name: "Period 1" }]
    }
  ],
  activities: [{ Id: "a1", Name: "Swim" }],
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
  element.setup = nsRecord(SETUP);
  document.body.appendChild(element);
  await flush();
  return element;
}

const q = (element, selector) => find(element, selector);
const cellText = (element, key) =>
  q(element, '[data-id="edit-grid"]')
    .shadowRoot.querySelector(`[data-cell="${key}"]`)
    .querySelector(".cell-name").textContent;
const withRevisions = (d, revisions) => ({
  ...d,
  schedule: { ...d.schedule, revisions }
});
const pending = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
async function clearSwim(element) {
  q(element, '[data-id="edit-grid"]')
    .shadowRoot.querySelector('[data-cell="0-1"]')
    .dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Delete",
        bubbles: true,
        composed: true
      })
    );
  await flush();
}
const restoreButton = (panel) => panel.querySelector('[data-action="open"]');
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

  it("Restore copies the version in, shows it, starts Undo over, and says so", async () => {
    const element = await render(
      withRevisions(draft(WITH_SWIM, ["1,2,", "1,,"]), "2026-06-29:1")
    );
    // An edit first: Undo has something to take back, and the week's revision moves on.
    saveSlots.mockResolvedValue({
      conflicts: [],
      schedule: withRevisions(draft(WITH_SWIM, ["1,,", "1,,"]), "2026-06-29:2")
        .schedule
    });
    await clearSwim(element);
    expect(q(element, '[data-id="undo"]').disabled).toBe(false);
    restoreVersion.mockResolvedValue(draft(WITH_SWIM, ["1,2,", "1,2,"]));
    const panel = await versionsPanel(element);
    restoreButton(panel).click();
    await flush();
    // The revisions sent are the ones on screen (after the edit), so a newer week is refused.
    expect(restoreVersion).toHaveBeenCalledWith({
      scheduleId: "d1",
      versionId: "v1",
      seenRevisions: "2026-06-29:2"
    });
    expect(cellText(element, "0-1")).toBe("Swim");
    expect(cellText(element, "1-1")).toBe("Swim");
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      "Restored Before the trip."
    );
    expect(q(element, '[data-id="undo"]').disabled).toBe(true);
    // The list is read again ("Before Restore" is in it now), and the restored version is the
    // one on screen.
    expect(getVersions).toHaveBeenCalledTimes(2);
    const again = await versionsPanel(element);
    expect(again.querySelector(".on-screen")).not.toBeNull();
  });

  it("a Restore refused because someone else changed the week changes nothing and offers Reload", async () => {
    const element = await render(draft(WITH_SWIM, ["1,2,", "1,,"]));
    restoreVersion.mockResolvedValue({ changedSince: true });
    const panel = await versionsPanel(element);
    restoreButton(panel).click();
    await flush();
    // The grid is as it was; nothing says Restored.
    expect(cellText(element, "0-1")).toBe("Swim");
    expect(q(element, '[data-id="notice"]')).toBeNull();
    const refused = q(element, '[data-id="restore-refused"]');
    expect(refused.textContent).toContain(
      "Someone else changed this week since you opened it, so nothing was restored."
    );
    getDraft.mockResolvedValue(draft(WITH_SWIM, ["1,,", "1,,"]));
    getDraft.mockClear();
    q(element, '[data-id="reload"]').click();
    await flush();
    expect(getDraft).toHaveBeenCalledTimes(1);
    expect(q(element, '[data-id="restore-refused"]')).toBeNull();
  });

  it("Restore waits while an edit is still saving: its button is disabled", async () => {
    const element = await render(draft(WITH_SWIM, ["1,2,", "1,,"]));
    const save = pending();
    saveSlots.mockReturnValue(save.promise);
    await clearSwim(element);
    const panel = await versionsPanel(element);
    expect(restoreButton(panel).disabled).toBe(true);
    expect(panel.querySelector('[data-action="delete"]').disabled).toBe(true);
    save.resolve({
      conflicts: [],
      schedule: draft(WITH_SWIM, ["1,,", "1,,"]).schedule
    });
    await flush();
    expect(restoreButton(panel).disabled).toBe(false);
  });

  it("while a Restore runs the week can't be changed, and an answer for another week is dropped", async () => {
    const element = await render(draft(WITH_SWIM, ["1,2,", "1,,"]));
    const restore = pending();
    restoreVersion.mockReturnValue(restore.promise);
    const panel = await versionsPanel(element);
    restoreButton(panel).click();
    await flush();
    const week = q(element, '[data-id="week"]');
    expect(week.disabled).toBe(true);
    // Even if a change got through, Week 1's restored draft never shows under Week 2.
    getDraft.mockResolvedValue(null);
    getWeekSources.mockResolvedValue([]);
    week.dispatchEvent(new CustomEvent("change", { detail: { value: "w2" } }));
    await flush();
    restore.resolve(draft(WITH_SWIM, ["1,,", "1,,"]));
    await flush();
    expect(q(element, '[data-id="edit-grid"]')).toBeNull();
    expect(q(element, '[data-id="start-week"]')).not.toBeNull();
    expect(week.disabled).toBe(false);
  });

  it("coming back to the window during a Restore doesn't read the week again", async () => {
    const element = await render(draft(WITH_SWIM, ["1,2,", "1,,"]));
    const restore = pending();
    restoreVersion.mockReturnValue(restore.promise);
    const panel = await versionsPanel(element);
    restoreButton(panel).click();
    await flush();
    getDraft.mockClear();
    window.dispatchEvent(new CustomEvent("focus"));
    await flush();
    expect(getDraft).not.toHaveBeenCalled();
    restore.resolve(draft(WITH_SOCCER, ["1,2,", "1,,"]));
    await flush();
    expect(cellText(element, "0-1")).toBe("Soccer");
  });

  it("a reload already on its way when Restore starts can't paint the old week over it", async () => {
    const element = await render(draft(WITH_SWIM, ["1,2,", "1,,"]));
    const reload = pending();
    getDraft.mockReturnValue(reload.promise);
    window.dispatchEvent(new CustomEvent("focus"));
    await flush();
    restoreVersion.mockResolvedValue(draft(WITH_SOCCER, ["1,2,", "1,,"]));
    const panel = await versionsPanel(element);
    restoreButton(panel).click();
    await flush();
    reload.resolve(draft(WITH_SWIM, ["1,2,", "1,,"]));
    await flush();
    expect(cellText(element, "0-1")).toBe("Soccer");
  });

  it("Undo and Redo wait while a Restore runs, and say so", async () => {
    const element = await render(draft(WITH_SWIM, ["1,2,", "1,,"]));
    saveSlots.mockResolvedValue({
      conflicts: [],
      schedule: draft(WITH_SWIM, ["1,,", "1,,"]).schedule
    });
    await clearSwim(element);
    saveSlots.mockClear();
    const restore = pending();
    restoreVersion.mockReturnValue(restore.promise);
    const panel = await versionsPanel(element);
    restoreButton(panel).click();
    await flush();
    q(element, '[data-id="undo"]').click();
    await flush();
    expect(saveSlots).not.toHaveBeenCalled();
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      "One moment: the week is being saved or restored."
    );
    restore.resolve(draft(WITH_SWIM, ["1,2,", "1,,"]));
    await flush();
  });

  it("a refused Save version says why, keeps the name typed, and says nothing was saved", async () => {
    const element = await render(draft(WITH_SWIM, ["1,2,", "1,,"]));
    saveVersion.mockRejectedValue({ body: { message: "That name is taken." } });
    const panel = await versionsPanel(element);
    const input = panel.querySelector('[data-id="save-name"]');
    input.value = "Before the trip";
    input.dispatchEvent(new CustomEvent("input"));
    await flush();
    panel.querySelector('[data-id="save-button"]').click();
    await flush();
    expect(q(element, '[data-id="build-error"]').textContent).toContain(
      "That name is taken."
    );
    expect(q(element, '[data-id="notice"]')).toBeNull();
    expect(panel.querySelector('[data-id="save-name"]').value).toBe(
      "Before the trip"
    );
  });

  it("a slow list of versions for the week before is not shown for this one", async () => {
    const slow = pending();
    getVersions.mockReturnValueOnce(slow.promise);
    getDraft.mockResolvedValue(draft(WITH_SWIM, ["1,2,", "1,,"]));
    const element = createElement("c-shoresh-manual-build", {
      is: ShoreshManualBuild
    });
    element.terms = buildTerms(LABELS);
    element.setup = nsRecord(SETUP);
    document.body.appendChild(element);
    await flush();
    getVersions.mockResolvedValue([]);
    q(element, '[data-id="week"]').dispatchEvent(
      new CustomEvent("change", { detail: { value: "w2" } })
    );
    await flush();
    slow.resolve(VERSIONS);
    await flush();
    const panel = await versionsPanel(element);
    expect(panel.querySelector('[data-action="open"]')).toBeNull();
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
      {
        id: "pub1",
        weekName: "Week 1",
        // Named in the camp's word when it was published; labelled in today's.
        name: "Posted plan",
        isVersion: false,
        isPublished: true
      },
      {
        id: "v2",
        weekName: "Week 1",
        name: "Published schedule",
        isVersion: true,
        isPublished: false
      },
      { id: "v1", weekName: "Week 1", name: "Before the trip", isVersion: true }
    ]);
    const element = await render(null);
    const menu = q(element, '[data-id="start-from"]');
    // The week's published schedule now, and the one it replaced (a version).
    expect(
      [...menu.querySelectorAll("lightning-menu-item")].map((i) => i.label)
    ).toEqual([
      "Week 2 · Manual Build",
      "Week 1 · Published schedule",
      "Week 1 · Published schedule (version)",
      "Week 1 · Before the trip (version)"
    ]);
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

  it("versions with the same name are told apart by when they were saved", async () => {
    // Published twice, then unpublished: two kept copies with the same name.
    const first = new Date(2026, 5, 29, 9, 0).toISOString();
    const second = new Date(2026, 6, 2, 14, 30).toISOString();
    getWeekSources.mockResolvedValue([
      {
        id: "v3",
        weekName: "Week 1",
        name: "Published schedule",
        isVersion: true,
        savedAt: second
      },
      {
        id: "v2",
        weekName: "Week 1",
        name: "Published schedule",
        isVersion: true,
        savedAt: first
      }
    ]);
    const element = await render(null);
    const when = (iso) =>
      new Date(iso).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      });
    const labels = [
      ...q(element, '[data-id="start-from"]').querySelectorAll(
        "lightning-menu-item"
      )
    ].map((i) => i.label);
    expect(labels).toEqual([
      `Week 1 · Published schedule (version) · ${when(second)}`,
      `Week 1 · Published schedule (version) · ${when(first)}`
    ]);
    expect(labels[0]).not.toBe(labels[1]);
  });

  it("a copy named by when it was published isn't given the time again", async () => {
    getWeekSources.mockResolvedValue([
      {
        id: "v3",
        weekName: "Week 1",
        name: "Published Oct 18, 2:40 PM",
        isVersion: true,
        savedAt: "2026-10-18T18:40:00.000Z",
        namedByPublish: true
      }
    ]);
    const element = await render(null);
    const labels = [
      ...q(element, '[data-id="start-from"]').querySelectorAll(
        "lightning-menu-item"
      )
    ].map((i) => i.label);
    expect(labels).toEqual(["Week 1 · Published Oct 18, 2:40 PM (version)"]);
  });

  it("says so when someone else had started the week (nothing copied)", async () => {
    getWeekSources.mockResolvedValue([
      { id: "d9", weekName: "Week 2", name: "Manual Build", isVersion: false }
    ]);
    const element = await render(null);
    startFromWeek.mockResolvedValue({
      ...draft(WITH_SWIM, ["1,2,", "1,,"]),
      startedBySomeoneElse: true
    });
    q(element, '[data-id="start-from"]').dispatchEvent(
      new CustomEvent("select", { detail: { value: "d9" } })
    );
    await flush();
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      "Someone else started this week; nothing was copied."
    );
    expect(q(element, '[data-id="announce"]').textContent).not.toContain(
      "from Week 2"
    );
  });

  it("Start from another week: buttons wait while it runs; a start for a week no longer chosen is dropped", async () => {
    getWeekSources.mockResolvedValue([
      { id: "d9", weekName: "Week 2", name: "Manual Build", isVersion: false }
    ]);
    const element = await render(null);
    const start = pending();
    startFromWeek.mockReturnValue(start.promise);
    q(element, '[data-id="start-from"]').dispatchEvent(
      new CustomEvent("select", { detail: { value: "d9" } })
    );
    await flush();
    expect(q(element, '[data-id="start-from"]').disabled).toBe(true);
    expect(q(element, '[data-id="start-week"]').disabled).toBe(true);
    const week = q(element, '[data-id="week"]');
    expect(week.disabled).toBe(true);
    getDraft.mockResolvedValue(null);
    week.dispatchEvent(new CustomEvent("change", { detail: { value: "w2" } }));
    await flush();
    getVersions.mockClear();
    start.resolve(draft(WITH_SWIM, ["1,2,", "1,,"]));
    await flush();
    expect(q(element, '[data-id="edit-grid"]')).toBeNull();
    expect(getVersions).not.toHaveBeenCalled();
    expect(q(element, '[data-id="announce"]').textContent).not.toContain(
      "Started"
    );
  });

  it("after Start from another week, it says so and reads the week's versions", async () => {
    getWeekSources.mockResolvedValue([
      { id: "d9", weekName: "Week 2", name: "Manual Build", isVersion: false }
    ]);
    const element = await render(null);
    startFromWeek.mockResolvedValue(draft(WITH_SWIM, ["1,2,", "1,,"]));
    getVersions.mockClear();
    q(element, '[data-id="start-from"]').dispatchEvent(
      new CustomEvent("select", { detail: { value: "d9" } })
    );
    await flush();
    expect(q(element, '[data-id="announce"]').textContent).toBe(
      "Started Week 1 from Week 2."
    );
    expect(getVersions).toHaveBeenCalledWith({ programId: "p1", weekId: "w1" });
  });

  it("while a version is being restored, edits wait and say so", async () => {
    const element = await render(draft(WITH_SWIM, ["1,2,", "1,,"]));
    let finish;
    restoreVersion.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const panel = await versionsPanel(element);
    panel.querySelector('[data-action="open"]').click();
    await flush();
    const grid = q(element, '[data-id="edit-grid"]');
    grid.shadowRoot.querySelector('[data-cell="0-1"]').dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Delete",
        bubbles: true,
        composed: true
      })
    );
    await flush();
    expect(saveSlots).not.toHaveBeenCalled();
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      "One moment: the week is being saved or restored."
    );
    finish(draft(WITH_SWIM, ["1,,", "1,,"]));
    await flush();
  });

  it("Start a blank week reads the week's versions too (a Generated one can be restored)", async () => {
    getWeekSources.mockResolvedValue([]);
    const element = await render(null);
    startBlankWeek.mockResolvedValue(draft(WITH_SWIM, ["1,,", "1,,"]));
    getVersions.mockClear();
    q(element, '[data-id="start-week"]').click();
    await flush();
    expect(getVersions).toHaveBeenCalledWith({ programId: "p1", weekId: "w1" });
  });

  describe("after Restore and delete", () => {
    const TWO = [
      ...VERSIONS,
      {
        id: "v2",
        name: "Lunch swap",
        origin: "Manual",
        reason: "SavedByHand",
        savedAt: "2026-10-17T15:00:00.000Z"
      }
    ];
    const onScreen = async (element) => {
      const panel = await versionsPanel(element);
      const badge = panel.querySelector(".on-screen");
      // Close it again (the same button).
      q(element, '[data-id="versions"]')
        .shadowRoot.querySelector('[data-id="versions-button"]')
        .click();
      await flush();
      return badge !== null;
    };
    async function restored() {
      const element = await render(
        withRevisions(draft(WITH_SWIM, ["1,2,", "1,,"]), "2026-06-29:1")
      );
      restoreVersion.mockResolvedValue(
        withRevisions(draft(WITH_SWIM, ["1,2,", "1,,"]), "2026-06-29:2")
      );
      const panel = await versionsPanel(element);
      restoreButton(panel).click();
      await flush();
      return element;
    }

    it("the restored version is on screen now until the next edit", async () => {
      const element = await restored();
      expect(await onScreen(element)).toBe(true);
      saveSlots.mockResolvedValue({
        conflicts: [],
        schedule: withRevisions(
          draft(WITH_SWIM, ["1,,", "1,,"]),
          "2026-06-29:3"
        ).schedule
      });
      await clearSwim(element);
      expect(await onScreen(element)).toBe(false);
    });

    it("…and until someone else saves (a reload with newer revisions), not after one with the same", async () => {
      const element = await restored();
      getDraft.mockResolvedValue(
        withRevisions(draft(WITH_SWIM, ["1,,", "1,,"]), "2026-06-29:2")
      );
      window.dispatchEvent(new CustomEvent("focus"));
      await flush();
      expect(await onScreen(element)).toBe(true);
      getDraft.mockResolvedValue(
        withRevisions(draft(WITH_SWIM, ["1,2,", "1,,"]), "2026-06-29:5")
      );
      window.dispatchEvent(new CustomEvent("focus"));
      await flush();
      expect(await onScreen(element)).toBe(false);
    });

    it("…and not once another week is opened and this one opened again", async () => {
      const element = await restored();
      const week = q(element, '[data-id="week"]');
      week.dispatchEvent(
        new CustomEvent("change", { detail: { value: "w2" } })
      );
      await flush();
      week.dispatchEvent(
        new CustomEvent("change", { detail: { value: "w1" } })
      );
      await flush();
      expect(await onScreen(element)).toBe(false);
    });

    it("Restore starts the counters over (their list closes)", async () => {
      const element = await render(draft(WITH_SWIM, ["1,2,", "1,,"]));
      const before = q(element, "c-shoresh-week-checks").resetKey;
      restoreVersion.mockResolvedValue(draft(WITH_SWIM, ["1,,", "1,,"]));
      const panel = await versionsPanel(element);
      restoreButton(panel).click();
      await flush();
      expect(q(element, "c-shoresh-week-checks").resetKey).not.toBe(before);
    });

    it("a refused Restore is said aloud, and its line goes once the week is read again or edited", async () => {
      const element = await render(
        withRevisions(draft(WITH_SWIM, ["1,2,", "1,,"]), "2026-06-29:1")
      );
      restoreVersion.mockResolvedValue({ changedSince: true });
      let panel = await versionsPanel(element);
      restoreButton(panel).click();
      await flush();
      expect(q(element, '[data-id="announce"]').textContent).toBe(
        "Someone else changed this week since you opened it, so nothing was restored."
      );
      // Coming back to the window reads the newer week: the line has done its job.
      getDraft.mockResolvedValue(
        withRevisions(draft(WITH_SWIM, ["1,2,", "1,,"]), "2026-06-29:4")
      );
      window.dispatchEvent(new CustomEvent("focus"));
      await flush();
      expect(q(element, '[data-id="restore-refused"]')).toBeNull();
      // Refused again; this time the director edits.
      panel = await versionsPanel(element);
      restoreButton(panel).click();
      await flush();
      expect(q(element, '[data-id="restore-refused"]')).not.toBeNull();
      saveSlots.mockResolvedValue({
        conflicts: [],
        schedule: withRevisions(
          draft(WITH_SWIM, ["1,,", "1,,"]),
          "2026-06-29:5"
        ).schedule
      });
      await clearSwim(element);
      expect(q(element, '[data-id="restore-refused"]')).toBeNull();
    });

    it("after a delete, focus goes to the next version once the list without it is back", async () => {
      getVersions.mockResolvedValue(TWO);
      const element = await render(draft(WITH_SWIM, ["1,2,", "1,,"]));
      getVersions.mockResolvedValue(TWO);
      deleteVersion.mockResolvedValue(undefined);
      const list = pending();
      getVersions.mockReturnValueOnce(list.promise);
      const panel = await versionsPanel(element);
      const del = panel.querySelector('[data-action="delete"]');
      del.click();
      await flush();
      del.click();
      await flush();
      // Deleted on the server, the list not back yet: still busy, so the deleted row's
      // Restore can't be pressed.
      expect(deleteVersion).toHaveBeenCalled();
      expect(restoreButton(panel).disabled).toBe(true);
      list.resolve([TWO[1]]);
      await flush();
      const restore = restoreButton(panel);
      expect(restore.getAttribute("aria-label")).toBe("Restore Lunch swap");
      expect(panel.activeElement).toBe(restore);
    });

    it("Restore and delete sent while an edit saves wait and say so", async () => {
      const element = await render(draft(WITH_SWIM, ["1,2,", "1,,"]));
      const save = pending();
      saveSlots.mockReturnValue(save.promise);
      await clearSwim(element);
      const versions = q(element, '[data-id="versions"]');
      versions.dispatchEvent(new CustomEvent("open", { detail: { id: "v1" } }));
      versions.dispatchEvent(
        new CustomEvent("delete", { detail: { id: "v1" } })
      );
      await flush();
      expect(restoreVersion).not.toHaveBeenCalled();
      expect(deleteVersion).not.toHaveBeenCalled();
      expect(q(element, '[data-id="notice"]').textContent).toBe(
        "One moment: an edit is still saving."
      );
      save.resolve({
        conflicts: [],
        schedule: draft(WITH_SWIM, ["1,,", "1,,"]).schedule
      });
      await flush();
    });

    it("coming back to the window while a week is starting doesn't read it again", async () => {
      getWeekSources.mockResolvedValue([]);
      const element = await render(null);
      const start = pending();
      startBlankWeek.mockReturnValue(start.promise);
      q(element, '[data-id="start-week"]').click();
      await flush();
      getDraft.mockClear();
      window.dispatchEvent(new CustomEvent("focus"));
      await flush();
      expect(getDraft).not.toHaveBeenCalled();
      start.resolve(draft(WITH_SWIM, ["1,,", "1,,"]));
      await flush();
    });

    it("a slow list of weeks to start from, for the week before, is not shown for this one", async () => {
      const slow = pending();
      getWeekSources.mockReturnValueOnce(slow.promise);
      const element = await render(null);
      getWeekSources.mockResolvedValue([]);
      q(element, '[data-id="week"]').dispatchEvent(
        new CustomEvent("change", { detail: { value: "w2" } })
      );
      await flush();
      slow.resolve([
        { id: "d9", weekName: "Week 3", name: "Manual Build", isVersion: false }
      ]);
      await flush();
      expect(q(element, '[data-id="start-from"]')).toBeNull();
    });

    it("the camp's word for a week is in the notice while a Restore runs", async () => {
      getWeekSources.mockResolvedValue([]);
      getDraft.mockResolvedValue(draft(WITH_SWIM, ["1,2,", "1,,"]));
      getVersions.mockResolvedValue(VERSIONS);
      const element = createElement("c-shoresh-manual-build", {
        is: ShoreshManualBuild
      });
      element.terms = buildTerms([
        ...LABELS,
        {
          term: "Week",
          singular: "Session",
          plural: "Sessions",
          isCustom: true
        }
      ]);
      element.setup = nsRecord(SETUP);
      document.body.appendChild(element);
      await flush();
      saveSlots.mockResolvedValue({
        conflicts: [],
        schedule: draft(WITH_SWIM, ["1,,", "1,,"]).schedule
      });
      await clearSwim(element);
      saveSlots.mockClear();
      const restore = pending();
      restoreVersion.mockReturnValue(restore.promise);
      const panel = await versionsPanel(element);
      restoreButton(panel).click();
      await flush();
      q(element, '[data-id="undo"]').click();
      await flush();
      expect(saveSlots).not.toHaveBeenCalled();
      expect(q(element, '[data-id="notice"]').textContent).toBe(
        "One moment: the Session is being saved or restored."
      );
      restore.resolve(draft(WITH_SWIM, ["1,2,", "1,,"]));
      await flush();
    });

    it("the camp's word for a week names Start from another week and what was left out", async () => {
      getWeekSources.mockResolvedValue([
        {
          id: "d9",
          weekName: "Session 2",
          name: "Manual Build",
          isVersion: false
        }
      ]);
      getDraft.mockResolvedValue(null);
      getVersions.mockResolvedValue([]);
      const element = createElement("c-shoresh-manual-build", {
        is: ShoreshManualBuild
      });
      element.terms = buildTerms([
        ...LABELS,
        {
          term: "Week",
          singular: "Session",
          plural: "Sessions",
          isCustom: true
        }
      ]);
      element.setup = nsRecord(SETUP);
      document.body.appendChild(element);
      await flush();
      const menu = q(element, '[data-id="start-from"]');
      expect(menu.label).toBe("Start from another Session");
      startFromWeek.mockResolvedValue({
        ...draft(WITH_SWIM, ["1,2,", "1,,"]),
        leftOut: ["Monday: not in this Session"]
      });
      menu.dispatchEvent(
        new CustomEvent("select", { detail: { value: "d9" } })
      );
      await flush();
      expect(q(element, '[data-id="left-out"] c-shoresh-dot').label).toBe(
        "Left Open: it couldn't go there this Session"
      );
    });
  });
});
