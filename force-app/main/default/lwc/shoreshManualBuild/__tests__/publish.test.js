import { createElement } from "lwc";
import ShoreshManualBuild from "c/shoreshManualBuild";
import getDraft from "@salesforce/apex/ManualBuildController.getDraft";
import saveSlots from "@salesforce/apex/ManualBuildController.saveSlots";
import previewPublish from "@salesforce/apex/ManualBuildController.previewPublish";
import publish from "@salesforce/apex/ManualBuildController.publish";
import restoreVersion from "@salesforce/apex/ManualBuildController.restoreVersion";
import getVersions from "@salesforce/apex/SchedulesController.getVersions";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";
import { find } from "shoresh-jest/week-editor";
import {
  WITH_SWIM,
  day,
  draft
} from "../../shoreshWeekEditor/__tests__/data/draftFixture";

// Publish on Manual Build (Greg, Manual Build round 1 #1 and round 2 #4): the server previews,
// the screen asks when there is something to show (what changes, what is still to do), and
// publishes the week the preview showed. Synthetic camp: draftFixture.

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
jest.mock("@salesforce/apex/ManualBuildController.addActivity", () => apex(), {
  virtual: true
});
jest.mock("@salesforce/apex/ManualBuildController.saveVersion", () => apex(), {
  virtual: true
});
jest.mock(
  "@salesforce/apex/ManualBuildController.restoreVersion",
  () => apex(),
  {
    virtual: true
  }
);
jest.mock(
  "@salesforce/apex/ManualBuildController.deleteVersion",
  () => apex(),
  {
    virtual: true
  }
);
jest.mock(
  "@salesforce/apex/ManualBuildController.getWeekSources",
  () => apex(),
  {
    virtual: true
  }
);
jest.mock(
  "@salesforce/apex/ManualBuildController.startFromWeek",
  () => apex(),
  {
    virtual: true
  }
);
jest.mock(
  "@salesforce/apex/ManualBuildController.previewPublish",
  () => apex(),
  {
    virtual: true
  }
);
jest.mock("@salesforce/apex/ManualBuildController.publish", () => apex(), {
  virtual: true
});
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

// A finished week: every cell filled, no activity with a weekly target, nothing dotted.
const CRAFTS = {
  id: "a8",
  name: "Crafts",
  length: 1,
  notFor: [],
  minPerWeek: 0,
  maxPerWeek: null
};
const ARCHERY = { ...CRAFTS, id: "a9", name: "Archery" };
const FINISHED_ITEMS = [
  { kind: "F", id: "f1", name: "Flagpole", gone: false },
  { kind: "A", id: "a8", name: "Crafts", gone: false },
  { kind: "A", id: "a9", name: "Archery", gone: false }
];
// The week's revisions as the screen read it; a preview of the same week sends the same.
const REV = "2026-06-29:1,2026-06-30:1";
/** A week as the screen reads it, with its revisions. */
function read(start) {
  return { ...start, schedule: { ...start.schedule, revisions: REV } };
}
function finished(published = null) {
  const base = draft();
  return {
    ...base,
    activities: [CRAFTS, ARCHERY],
    published,
    schedule: {
      ...base.schedule,
      revisions: REV,
      days: [
        day("2026-06-29", FINISHED_ITEMS, ["1,2,3", "1,3,"]),
        day("2026-06-30", FINISHED_ITEMS, ["1,3,2", "1,2,"])
      ]
    }
  };
}
const PUBLISHED = {
  id: "pub1",
  publishedAt: "2026-10-18T10:00:00.000Z",
  publishedBy: "Pat Director",
  changedSince: false
};
const FIRST_PREVIEW = {
  revisions: REV,
  published: null,
  changes: [],
  changeCount: 0
};
const DONE = {
  published: PUBLISHED,
  draftChanged: false,
  publishedChanged: false,
  unchanged: false
};

const flush = () =>
  [...Array(10)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

async function render(first) {
  getDraft.mockResolvedValue(first);
  getVersions.mockResolvedValue([]);
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
const pending = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
async function clickPublish(element) {
  q(element, '[data-id="publish"]').click();
  await flush();
}
const ask = (element) => q(element, '[data-id="publish-ask"]');
async function answer(element, yes) {
  ask(element).dispatchEvent(new CustomEvent("answer", { detail: { yes } }));
  await flush();
}
const notice = (element) => q(element, '[data-id="notice"]').textContent;
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

describe("c-shoresh-manual-build: Publish", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("offers Publish once a week is open, and not before", async () => {
    const element = await render(null);
    expect(q(element, '[data-id="publish"]')).toBeNull();
    element.remove();
    const open = await render(finished());
    expect(q(open, '[data-id="publish"]').textContent.trim()).toBe("Publish");
    // Not published yet: no line saying when.
    expect(q(open, '[data-id="published"]')).toBeNull();
  });

  it("publishes a finished week's first publish at once, and says when and by whom", async () => {
    const element = await render(finished());
    previewPublish.mockResolvedValue(FIRST_PREVIEW);
    publish.mockResolvedValue(DONE);
    await clickPublish(element);
    expect(previewPublish).toHaveBeenCalledWith({ scheduleId: "d1" });
    expect(ask(element)).toBeNull();
    expect(publish).toHaveBeenCalledWith({
      scheduleId: "d1",
      seenRevisions: REV,
      seenPublishedId: null
    });
    expect(notice(element)).toBe("Published Week 1.");
    const line = q(element, '[data-id="published"]');
    expect(line.textContent).toContain("Published");
    expect(line.textContent).toContain("by Pat Director");
    expect(q(element, '[data-id="changed-since"]')).toBeNull();
    expect(q(element, '[data-id="publish"]').disabled).toBe(false);
  });

  it("asks first when the week still has Open cells, naming them; Cancel publishes nothing", async () => {
    const element = await render(read(draft(WITH_SWIM, ["1,2,", "1,,"])));
    previewPublish.mockResolvedValue(FIRST_PREVIEW);
    await clickPublish(element);
    expect(ask(element).heading).toBe("Publish Week 1?");
    expect(ask(element).confirmLabel).toBe("Publish");
    expect(ask(element).lines).toContain("5 of 6 cells still Open.");
    // Publish waits for the answer.
    expect(q(element, '[data-id="publish"]').disabled).toBe(true);
    await answer(element, false);
    expect(publish).not.toHaveBeenCalled();
    expect(ask(element)).toBeNull();
    expect(q(element, '[data-id="publish"]').disabled).toBe(false);
  });

  it("publishing again lists what changes, and sends the published schedule the preview showed", async () => {
    const element = await render(
      finished({ ...PUBLISHED, changedSince: true })
    );
    expect(q(element, '[data-id="changed-since"]')).not.toBeNull();
    previewPublish.mockResolvedValue({
      revisions: REV,
      published: PUBLISHED,
      changes: ["Bunk 1 · Monday · Period 2: Swim → Crafts"],
      changeCount: 1
    });
    publish.mockResolvedValue({
      ...DONE,
      published: { ...PUBLISHED, id: "pub2" }
    });
    await clickPublish(element);
    expect(ask(element).heading).toBe("Publish Week 1 again?");
    expect(ask(element).lines).toEqual([
      "This replaces the published schedule. 1 cell changes:",
      "Bunk 1 · Monday · Period 2: Swim → Crafts"
    ]);
    expect(publish).not.toHaveBeenCalled();
    await answer(element, true);
    expect(publish).toHaveBeenCalledWith({
      scheduleId: "d1",
      seenRevisions: REV,
      seenPublishedId: "pub1"
    });
    expect(notice(element)).toBe("Published Week 1.");
    expect(q(element, '[data-id="changed-since"]')).toBeNull();
  });

  it("a week already published as it is says so and publishes nothing", async () => {
    const element = await render(finished(PUBLISHED));
    previewPublish.mockResolvedValue({
      revisions: REV,
      published: PUBLISHED,
      changes: [],
      changeCount: 0
    });
    await clickPublish(element);
    expect(ask(element)).toBeNull();
    expect(publish).not.toHaveBeenCalled();
    expect(notice(element)).toBe("Week 1 is already published as it is.");
  });

  it("refused because someone changed the week since: says nothing was published and reads it again", async () => {
    const element = await render(finished());
    previewPublish.mockResolvedValue(FIRST_PREVIEW);
    publish.mockResolvedValue({
      published: null,
      draftChanged: true,
      publishedChanged: false,
      unchanged: false
    });
    expect(getDraft).toHaveBeenCalledTimes(1);
    await clickPublish(element);
    expect(notice(element)).toBe(
      "Someone else changed this week since, so nothing was published. Look it over, then publish again."
    );
    expect(getDraft).toHaveBeenCalledTimes(2);
    expect(q(element, '[data-id="published"]')).toBeNull();
  });

  it("refused because someone else published since: says nothing was replaced", async () => {
    const element = await render(finished());
    previewPublish.mockResolvedValue(FIRST_PREVIEW);
    publish.mockResolvedValue({
      published: null,
      draftChanged: false,
      publishedChanged: true,
      unchanged: false
    });
    await clickPublish(element);
    expect(notice(element)).toBe(
      "Someone else published this week since, so nothing was replaced. Look it over, then publish again."
    );
    expect(getDraft).toHaveBeenCalledTimes(2);
  });

  it("a preview that fails says the week was not published", async () => {
    const element = await render(finished());
    previewPublish.mockRejectedValue({ body: { message: "No access." } });
    await clickPublish(element);
    expect(publish).not.toHaveBeenCalled();
    expect(q(element, '[data-id="build-error"]').textContent).toContain(
      "Week 1 was not published."
    );
    expect(q(element, '[data-id="publish"]').disabled).toBe(false);
  });

  it("waits while an edit saves, and an edit marks the week changed since it was published", async () => {
    const element = await render({
      ...draft(WITH_SWIM, ["1,2,", "1,,"]),
      published: PUBLISHED
    });
    expect(q(element, '[data-id="changed-since"]')).toBeNull();
    const save = pending();
    saveSlots.mockReturnValue(save.promise);
    await clearSwim(element);
    expect(q(element, '[data-id="publish"]').disabled).toBe(true);
    expect(q(element, '[data-id="changed-since"]')).not.toBeNull();
    save.resolve({
      conflicts: [],
      schedule: draft(WITH_SWIM, ["1,,", "1,,"]).schedule
    });
    await flush();
    expect(q(element, '[data-id="publish"]').disabled).toBe(false);
  });

  it("edits and Versions wait while a publish is on its way, and its answer is shown", async () => {
    const element = await render(finished());
    const preview = pending();
    previewPublish.mockReturnValue(preview.promise);
    await clickPublish(element);
    expect(q(element, '[data-id="versions"]').busy).toBe(true);
    await clearSwim(element);
    expect(saveSlots).not.toHaveBeenCalled();
    expect(notice(element)).toBe(
      "One moment: the week is being saved or restored."
    );
    const sent = pending();
    publish.mockReturnValue(sent.promise);
    preview.resolve(FIRST_PREVIEW);
    await flush();
    // Still waiting while the publish itself is on its way.
    await clearSwim(element);
    expect(saveSlots).not.toHaveBeenCalled();
    sent.resolve(DONE);
    await flush();
    expect(notice(element)).toBe("Published Week 1.");
    expect(q(element, '[data-id="published"]')).not.toBeNull();
    expect(q(element, '[data-id="versions"]').busy).toBe(false);
  });

  it("a refusal during a publish is shown after edits were held back", async () => {
    const element = await render(finished());
    previewPublish.mockResolvedValue(FIRST_PREVIEW);
    const sent = pending();
    publish.mockReturnValue(sent.promise);
    await clickPublish(element);
    await clearSwim(element);
    sent.resolve({
      published: null,
      draftChanged: true,
      publishedChanged: false,
      unchanged: false
    });
    await flush();
    expect(notice(element)).toBe(
      "Someone else changed this week since, so nothing was published. Look it over, then publish again."
    );
    expect(getDraft).toHaveBeenCalledTimes(2);
  });

  it("the week and program can't change, and coming back to the window doesn't reload, while publishing", async () => {
    const element = await render(finished());
    const preview = pending();
    previewPublish.mockReturnValue(preview.promise);
    await clickPublish(element);
    expect(q(element, '[data-id="week"]').disabled).toBe(true);
    window.dispatchEvent(new CustomEvent("focus"));
    await flush();
    expect(getDraft).toHaveBeenCalledTimes(1);
    preview.resolve({
      revisions: REV,
      published: PUBLISHED,
      changes: ["Bunk 1 · Monday · Period 2: Swim → Crafts"],
      changeCount: 1
    });
    await flush();
    // Still publishing while the question is open.
    expect(q(element, '[data-id="week"]').disabled).toBe(true);
    window.dispatchEvent(new CustomEvent("focus"));
    await flush();
    expect(getDraft).toHaveBeenCalledTimes(1);
    await answer(element, false);
    expect(q(element, '[data-id="week"]').disabled).toBe(false);
  });

  async function chooseWeek2(element, next) {
    getDraft.mockResolvedValue(next);
    // Even if a change got past the locked picker, an answer for Week 1 isn't shown on Week 2.
    q(element, '[data-id="week"]').dispatchEvent(
      new CustomEvent("change", { detail: { value: "w2" } })
    );
    await flush();
  }

  it("a preview answered after another week is shown asks nothing", async () => {
    const element = await render(finished());
    const preview = pending();
    previewPublish.mockReturnValue(preview.promise);
    await clickPublish(element);
    await chooseWeek2(element, finished());
    preview.resolve({
      revisions: REV,
      published: PUBLISHED,
      changes: ["Bunk 1 · Monday · Period 2: Swim → Crafts"],
      changeCount: 1
    });
    await flush();
    expect(ask(element)).toBeNull();
    expect(publish).not.toHaveBeenCalled();
  });

  it("a publish answered after another week is shown isn't shown on that week", async () => {
    const element = await render(finished());
    previewPublish.mockResolvedValue(FIRST_PREVIEW);
    const sent = pending();
    publish.mockReturnValue(sent.promise);
    await clickPublish(element);
    await chooseWeek2(element, finished());
    sent.resolve(DONE);
    await flush();
    // Week 2 was never published: no line saying it was.
    expect(q(element, '[data-id="published"]')).toBeNull();
  });

  it("after a Restore, the toolbar says whether the week matches what was published", async () => {
    const element = await render(finished(PUBLISHED));
    getVersions.mockResolvedValue([
      { id: "v1", name: "Before the trip", createdDate: "2026-10-17T10:00:00Z" }
    ]);
    // Opening the week read its versions before this list was set: read it again.
    window.dispatchEvent(new CustomEvent("focus"));
    await flush();
    expect(q(element, '[data-id="changed-since"]')).toBeNull();
    restoreVersion.mockResolvedValue({
      ...finished({ ...PUBLISHED, changedSince: true }),
      changedSince: false
    });
    q(element, '[data-id="versions"]').dispatchEvent(
      new CustomEvent("open", { detail: { id: "v1" } })
    );
    await flush();
    expect(restoreVersion).toHaveBeenCalled();
    expect(q(element, '[data-id="changed-since"]')).not.toBeNull();
  });

  it("focus goes back to Publish when the question closes", async () => {
    const element = await render(read(draft(WITH_SWIM, ["1,2,", "1,,"])));
    previewPublish.mockResolvedValue(FIRST_PREVIEW);
    await clickPublish(element);
    expect(ask(element)).not.toBeNull();
    await answer(element, false);
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="publish"]')
    );
    publish.mockResolvedValue(DONE);
    await clickPublish(element);
    await answer(element, true);
    expect(notice(element)).toBe("Published Week 1.");
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="publish"]')
    );
  });

  it("a week someone else saved since the screen read it is shown first, not published", async () => {
    const element = await render(finished());
    // The server's week is newer than the one on screen.
    previewPublish.mockResolvedValue({
      ...FIRST_PREVIEW,
      revisions: "2026-06-29:2,2026-06-30:1"
    });
    await clickPublish(element);
    expect(publish).not.toHaveBeenCalled();
    expect(ask(element)).toBeNull();
    expect(notice(element)).toBe(
      "Someone else changed this week since, so nothing was published. Look it over, then publish again."
    );
    // The week is read again, for the director to see.
    expect(getDraft).toHaveBeenCalledTimes(2);
    expect(q(element, '[data-id="publish"]').disabled).toBe(false);
  });

  it("publishing again lists the schedule it replaced in Versions straight away", async () => {
    const element = await render(
      finished({ ...PUBLISHED, changedSince: true })
    );
    expect(q(element, '[data-id="versions"]').versions).toEqual([]);
    previewPublish.mockResolvedValue({
      revisions: REV,
      published: PUBLISHED,
      changes: ["Bunk 1 · Monday · Period 2: Swim → Crafts"],
      changeCount: 1
    });
    publish.mockResolvedValue({
      ...DONE,
      published: { ...PUBLISHED, id: "pub2" }
    });
    const replaced = {
      id: "pub1",
      name: "Published schedule",
      createdDate: "2026-10-18T10:00:00Z"
    };
    getVersions.mockResolvedValue([replaced]);
    await clickPublish(element);
    await answer(element, true);
    expect(notice(element)).toBe("Published Week 1.");
    expect(q(element, '[data-id="versions"]').versions).toEqual([replaced]);
  });

  it("a week whose still needed lines were all accepted publishes at once, as its counters say", async () => {
    // Archery wants 3 a week: Bunk 1 has 2 and Bunk 2 has 1, so two still needed lines.
    const element = await render({
      ...finished(),
      activityRecords: nsRecord([
        { Id: "a8", Name: "Crafts", NoGroupLimit__c: true },
        {
          Id: "a9",
          Name: "Archery",
          TimesPerWeekMin__c: 3,
          NoGroupLimit__c: true
        }
      ]),
      groupRecords: nsRecord([
        { Id: "g1", Name: "Bunk 1", Division__c: "d1" },
        { Id: "g2", Name: "Bunk 2", Division__c: "d1" }
      ])
    });
    const checks = q(element, "c-shoresh-week-checks");
    checks.shadowRoot.querySelector('[data-counter="stillNeeded"]').click();
    await flush();
    const accepts = [
      ...checks.shadowRoot.querySelectorAll('[aria-label^="Accept: "]')
    ];
    expect(accepts).toHaveLength(2);
    accepts[0].click();
    await flush();
    accepts[1].click();
    await flush();
    expect(
      checks.shadowRoot.querySelector('[data-counter="stillNeeded"]')
        .textContent
    ).toContain("0");
    previewPublish.mockResolvedValue(FIRST_PREVIEW);
    publish.mockResolvedValue(DONE);
    await clickPublish(element);
    expect(ask(element)).toBeNull();
    expect(publish).toHaveBeenCalled();
    expect(notice(element)).toBe("Published Week 1.");
  });

  it("asks with the counters' own lines: one of two still needed lines accepted leaves 1", async () => {
    // Archery wants 3 a week: Bunk 1 has 2 and Bunk 2 has 1, so two still needed lines.
    const element = await render({
      ...finished(),
      activityRecords: nsRecord([
        { Id: "a8", Name: "Crafts", NoGroupLimit__c: true },
        {
          Id: "a9",
          Name: "Archery",
          TimesPerWeekMin__c: 3,
          NoGroupLimit__c: true
        }
      ]),
      groupRecords: nsRecord([
        { Id: "g1", Name: "Bunk 1", Division__c: "d1" },
        { Id: "g2", Name: "Bunk 2", Division__c: "d1" }
      ])
    });
    const checks = q(element, "c-shoresh-week-checks");
    const counter = () =>
      checks.shadowRoot.querySelector('[data-counter="stillNeeded"]');
    counter().click();
    await flush();
    const accepts = [
      ...checks.shadowRoot.querySelectorAll('[aria-label^="Accept: "]')
    ];
    expect(accepts).toHaveLength(2);
    accepts[0].click();
    await flush();
    expect(counter().textContent).toContain("1");
    previewPublish.mockResolvedValue(FIRST_PREVIEW);
    await clickPublish(element);
    // The week's checks alone would say 2; the box says what the counter shows.
    expect(ask(element).lines).toEqual(["Still needed: 1"]);
    await answer(element, false);
    expect(publish).not.toHaveBeenCalled();
  });

  it("focus goes back to Publish when it finishes without asking: published, already published, or failed", async () => {
    const element = await render(finished());
    const publishButton = () => q(element, '[data-id="publish"]');
    previewPublish.mockResolvedValue(FIRST_PREVIEW);
    publish.mockResolvedValue(DONE);
    await clickPublish(element);
    expect(notice(element)).toBe("Published Week 1.");
    expect(element.shadowRoot.activeElement).toBe(publishButton());
    publishButton().blur();
    previewPublish.mockResolvedValue({
      revisions: REV,
      published: PUBLISHED,
      changes: [],
      changeCount: 0
    });
    await clickPublish(element);
    expect(notice(element)).toBe("Week 1 is already published as it is.");
    expect(element.shadowRoot.activeElement).toBe(publishButton());
    publishButton().blur();
    previewPublish.mockRejectedValue({ body: { message: "No access." } });
    await clickPublish(element);
    expect(q(element, '[data-id="build-error"]')).not.toBeNull();
    expect(element.shadowRoot.activeElement).toBe(publishButton());
  });
});
