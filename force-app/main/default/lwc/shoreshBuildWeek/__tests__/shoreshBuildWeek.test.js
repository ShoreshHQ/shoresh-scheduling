import { readFileSync } from "fs";
import { join } from "path";
import getSetupChanges from "@salesforce/apex/SetupMatchController.getSetupChanges";
import updateToMatchSetup from "@salesforce/apex/SetupMatchController.updateToMatchSetup";
import getVersions from "@salesforce/apex/SchedulesController.getVersions";
import renameSchedule from "@salesforce/apex/SchedulesController.renameSchedule";
import { BuildWeek, CHANGED_SINCE, SETUP_CHANGED } from "c/shoreshBuildWeek";
import { buildTerms } from "c/shoreshTerms";
import { flush } from "shoresh-jest/flush";

// The week on a build screen, through its interface with a fake screen: what setup changed,
// "Update to match setup", Publish and Unpublish, and Versions, the same on Generated Schedule and
// Manual Build.

// The refusal codes as the server sends them: read from the Apex source, so a rename there fails here.
const SETUP_MATCH = readFileSync(
  join(__dirname, "..", "..", "..", "classes", "SetupMatch.cls"),
  "utf8"
);
const apexCode = (name) => {
  const found = new RegExp(`static final String ${name} = '([^']*)';`).exec(
    SETUP_MATCH
  );
  return found ? found[1] : null;
};

const apex = () => ({ default: jest.fn() });
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
jest.mock("@salesforce/apex/SchedulesController.renameSchedule", () => apex(), {
  virtual: true
});

const ROW = (key) => ({ key, lines: [] });
const PREVIEW = {
  revisions: "r1",
  dots: [{ key: "c1", words: "Deleted from setup" }],
  changes: [ROW("k1"), ROW("k2")],
  closedActivityIds: [],
  awayGroupIds: [],
  problem: null
};
const NOTHING = { ...PREVIEW, revisions: "r2", dots: [], changes: [] };
const LEFT = { ...PREVIEW, revisions: "r2", changes: [ROW("k2")] };

const pending = () => {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};

/** A fake build screen: what it was told, and what it shows. */
function fakeScreen() {
  const said = [];
  const screen = {
    weekName: "Week 1",
    t: buildTerms([
      { term: "Week", singular: "Session", plural: "Sessions", isCustom: true }
    ]),
    error: null,
    setupPreview: null,
    setupAsk: null,
    setupWorking: false,
    focusOn: null,
    notices: [],
    weekEditor: { setNotice: (text) => screen.notices.push(text) },
    say: (text) => said.push(text),
    announce: jest.fn(),
    load: jest.fn(),
    tellSchedulesChanged: jest.fn(),
    // Publish and Unpublish.
    publishDisabled: false,
    editBusy: false,
    checked: null,
    measure: null,
    publishState: null,
    publishAsk: null,
    unpublishAsk: null,
    publishing: false,
    // Versions.
    programId: "p1",
    weekId: "w1",
    versions: [],
    versionsUnread: null,
    versionsBusy: false,
    versionsWorking: false
  };
  const state = {
    ticket: 0,
    week: "p1|w1",
    scheduleId: "sc1",
    busy: false,
    revision: "r1",
    reading: false
  };
  const adapter = {
    screen,
    scheduleId: () => state.scheduleId,
    revision: () => state.revision,
    origin: "Generated",
    weekKey: () => state.week,
    busy: () => state.busy,
    reading: () => state.reading,
    previewPublish: jest.fn(),
    publish: jest.fn(),
    unpublish: jest.fn(),
    saveVersion: jest.fn(),
    deleteVersion: jest.fn(),
    restoreVersion: jest.fn(),
    showRestored: jest.fn(async () => true),
    refuseRestore: jest.fn(),
    versionsOver: jest.fn(),
    sayDone: (text) => said.push(`done: ${text}`),
    showError: (error) => {
      screen.error = error;
    },
    beginUpdate: () => {
      state.ticket += 1;
      return state.ticket;
    },
    isCurrent: (ticket) => ticket === state.ticket,
    showUpdated: jest.fn(async () => true),
    readAfterWork: jest.fn(),
    readIfAsked: jest.fn()
  };
  return { week: new BuildWeek(adapter), screen, adapter, state, said };
}

async function opened(preview = PREVIEW) {
  const fake = fakeScreen();
  getSetupChanges.mockResolvedValue(preview);
  await fake.week.openSetupMatch();
  return fake;
}

describe("c/shoreshBuildWeek: setup changed and Update to match setup", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("names the refusals as SetupMatch.cls sends them", () => {
    expect(CHANGED_SINCE).toBe(apexCode("CHANGED_SINCE"));
    expect(SETUP_CHANGED).toBe(apexCode("SETUP_CHANGED"));
  });

  describe("reading what setup changed", () => {
    it("a week with no schedule yet reads nothing and shows none", async () => {
      const { week, screen, state } = fakeScreen();
      state.scheduleId = null;
      screen.setupPreview = PREVIEW;
      expect(await week.loadSetupChanges()).toBeNull();
      expect(screen.setupPreview).toBeNull();
      expect(getSetupChanges).not.toHaveBeenCalled();
    });

    it("reads the week's schedule and shows every list, empty when the server sends none", async () => {
      const { week, screen } = fakeScreen();
      getSetupChanges.mockResolvedValue({ revisions: "r9" });
      await week.loadSetupChanges();
      expect(getSetupChanges).toHaveBeenCalledWith({ scheduleId: "sc1" });
      expect(screen.setupPreview).toEqual({
        changes: [],
        dots: [],
        revisions: "r9",
        closedActivityIds: [],
        awayGroupIds: [],
        problem: null
      });
    });

    it("drops an older answer that arrives after a newer one", async () => {
      const { week, screen } = fakeScreen();
      const older = pending();
      getSetupChanges.mockReturnValueOnce(older.promise);
      getSetupChanges.mockResolvedValueOnce(NOTHING);
      week.loadSetupChanges();
      await week.loadSetupChanges();
      older.resolve(PREVIEW);
      await flush();
      expect(screen.setupPreview.revisions).toBe("r2");
    });

    it("another week: the last one's changes and list go, and its answer on the way is dropped", async () => {
      const { week, screen } = fakeScreen();
      const late = pending();
      getSetupChanges.mockReturnValueOnce(late.promise);
      week.loadSetupChanges();
      screen.setupPreview = PREVIEW;
      screen.setupAsk = { kept: false };
      week.forgetSetup();
      expect(screen.setupPreview).toBeNull();
      expect(screen.setupAsk).toBeNull();
      late.resolve(PREVIEW);
      await flush();
      expect(screen.setupPreview).toBeNull();
    });

    it("a failed read keeps what was shown and says it couldn't check; a read that works clears only that", async () => {
      const { week, screen } = fakeScreen();
      screen.setupPreview = PREVIEW;
      getSetupChanges.mockRejectedValueOnce(new Error("offline"));
      await week.loadSetupChanges();
      expect(screen.setupPreview).toBe(PREVIEW);
      expect(screen.error).toMatch(
        /^Shoresh couldn't check Week 1 against setup\./
      );
      getSetupChanges.mockResolvedValue(NOTHING);
      await week.loadSetupChanges();
      expect(screen.error).toBeNull();
      screen.error = "Week 1 couldn't be saved.";
      await week.loadSetupChanges();
      expect(screen.error).toBe("Week 1 couldn't be saved.");
    });

    it("a failed read for a week no longer shown says nothing", async () => {
      const { week, screen } = fakeScreen();
      const late = pending();
      getSetupChanges.mockReturnValueOnce(late.promise);
      week.loadSetupChanges();
      week.forgetSetup();
      late.reject(new Error("offline"));
      await flush();
      expect(screen.error).toBeNull();
    });
  });

  describe("opening Update to match setup", () => {
    it("waits while the screen is busy: says so, reads nothing", async () => {
      const { week, state, said } = fakeScreen();
      state.busy = true;
      await week.openSetupMatch();
      expect(said).toEqual(["One moment: an edit is still saving."]);
      expect(getSetupChanges).not.toHaveBeenCalled();
    });

    it("reads fresh and opens the list on its changes, keeping no version yet", async () => {
      const { screen, adapter } = await opened();
      expect(screen.setupAsk).toEqual({
        notice: null,
        kept: false,
        updated: false
      });
      expect(screen.setupWorking).toBe(false);
      expect(screen.focusOn).toBeNull();
      expect(adapter.readIfAsked).not.toHaveBeenCalled();
    });

    it("says the week matches when the fresh read finds nothing, and focus goes back to the menu's Update", async () => {
      const { screen, said, adapter } = await opened(NOTHING);
      expect(screen.setupAsk).toBeNull();
      expect(said).toEqual(["Week 1 matches setup."]);
      expect(screen.focusOn).toBe("update-to-match");
      expect(adapter.readIfAsked).toHaveBeenCalled();
    });

    it("says why the week can't be compared now, never that it matches", async () => {
      const { screen, said } = await opened({
        ...PREVIEW,
        problem: "Week 1's days changed."
      });
      expect(screen.setupAsk).toBeNull();
      expect(said).toEqual(["Week 1's days changed."]);
    });

    it("an answer for a week no longer shown opens nothing and moves no focus", async () => {
      const { week, screen, adapter, state, said } = fakeScreen();
      const read = pending();
      getSetupChanges.mockReturnValueOnce(read.promise);
      const opening = week.openSetupMatch();
      state.week = "p1|w2";
      read.resolve(PREVIEW);
      await opening;
      expect(screen.setupAsk).toBeNull();
      expect(said).toEqual([]);
      // Focus stays where the director has it: the menu's Update was for the week before.
      expect(screen.focusOn).toBeNull();
      expect(adapter.readIfAsked).not.toHaveBeenCalled();
    });

    it("a read overtaken by a newer one waits for the newer one's answer", async () => {
      const { week, screen } = fakeScreen();
      const first = pending();
      getSetupChanges.mockReturnValueOnce(first.promise);
      const opening = week.openSetupMatch();
      getSetupChanges.mockResolvedValueOnce(PREVIEW);
      week.loadSetupChanges();
      first.resolve(NOTHING);
      await opening;
      expect(screen.setupAsk).not.toBeNull();
    });

    it("Close: the list goes, focus goes back to the menu's Update, and a read asked for meanwhile is done", async () => {
      const { week, screen, adapter } = await opened();
      week.closeSetupMatch();
      expect(screen.setupAsk).toBeNull();
      expect(screen.focusOn).toBe("update-to-match");
      expect(adapter.readIfAsked).toHaveBeenCalledTimes(1);
    });
  });

  describe("updating", () => {
    it("one row: made on the week as the list showed it, kept a version, and the list stays with what is left, saying so", async () => {
      const { week, screen, adapter, said } = await opened();
      updateToMatchSetup.mockResolvedValue({ refused: null, kept: true });
      getSetupChanges.mockResolvedValue(LEFT);
      await week.updateToMatchSetup(["k1"]);
      expect(updateToMatchSetup).toHaveBeenCalledWith({
        scheduleId: "sc1",
        ask: { keys: ["k1"], seenRevisions: "r1", versionKept: false }
      });
      expect(adapter.showUpdated).toHaveBeenCalled();
      expect(getVersions).toHaveBeenCalled();
      expect(screen.tellSchedulesChanged).toHaveBeenCalled();
      expect(screen.setupAsk).toMatchObject({
        notice: null,
        announcement: "Updated to match setup.",
        kept: true,
        updated: true
      });
      expect(said).toEqual([]);
      expect(screen.focusOn).toBeNull();
    });

    it("one opening keeps one version: every later update in it asks for none", async () => {
      const { week } = await opened({
        ...PREVIEW,
        changes: [ROW("k1"), ROW("k2"), ROW("k3")]
      });
      updateToMatchSetup.mockResolvedValueOnce({ refused: null, kept: true });
      getSetupChanges.mockResolvedValue({
        ...PREVIEW,
        changes: [ROW("k2"), ROW("k3")]
      });
      await week.updateToMatchSetup(["k1"]);
      updateToMatchSetup.mockResolvedValue({ refused: null, kept: false });
      await week.updateToMatchSetup(["k2"]);
      await week.updateToMatchSetup(["k3"]);
      const keptAsked = updateToMatchSetup.mock.calls.map(
        ([request]) => request.ask.versionKept
      );
      expect(keptAsked).toEqual([false, true, true]);
    });

    it("a second one-row update is read out again, though its words are the same", async () => {
      const { week, screen } = await opened({
        ...PREVIEW,
        changes: [ROW("k1"), ROW("k2"), ROW("k3")]
      });
      updateToMatchSetup.mockResolvedValue({ refused: null, kept: false });
      getSetupChanges.mockResolvedValue(PREVIEW);
      await week.updateToMatchSetup(["k1"]);
      const first = screen.setupAsk.said;
      await week.updateToMatchSetup(["k2"]);
      expect(screen.setupAsk.announcement).toBe("Updated to match setup.");
      expect(screen.setupAsk.said).toBeGreaterThan(first);
    });

    it("all of them: the list closes, says how many were made, and focus goes back", async () => {
      const { week, screen, said, adapter } = await opened();
      updateToMatchSetup.mockResolvedValue({ refused: null, kept: false });
      getSetupChanges.mockResolvedValue(LEFT);
      await week.updateToMatchSetup(["k1", "k2"]);
      expect(screen.setupAsk).toBeNull();
      expect(said).toEqual(["done: Made 2 changes to match setup."]);
      expect(screen.focusOn).toBe("update-to-match");
      expect(adapter.readIfAsked).toHaveBeenCalled();
      expect(getVersions).not.toHaveBeenCalled();
    });

    it("someone else changed the week since: nothing updated, the editor says so, and the week is read again after", async () => {
      const { week, screen, adapter } = await opened();
      updateToMatchSetup.mockResolvedValue({ refused: CHANGED_SINCE });
      await week.updateToMatchSetup(["k1"]);
      expect(screen.setupAsk).toBeNull();
      expect(screen.notices).toEqual([
        "Someone else changed this Session since, so nothing was updated."
      ]);
      expect(adapter.readAfterWork).toHaveBeenCalled();
      expect(adapter.readIfAsked).toHaveBeenCalled();
      expect(adapter.readAfterWork.mock.invocationCallOrder[0]).toBeLessThan(
        adapter.readIfAsked.mock.invocationCallOrder[0]
      );
      expect(adapter.showUpdated).not.toHaveBeenCalled();
    });

    it("setup changed again: the list shows what it would change now, saying why, and remembers a version kept", async () => {
      const { week, screen } = await opened({
        ...PREVIEW,
        changes: [ROW("k1"), ROW("k2"), ROW("k3")]
      });
      updateToMatchSetup.mockResolvedValueOnce({ refused: null, kept: true });
      getSetupChanges.mockResolvedValue(PREVIEW);
      await week.updateToMatchSetup(["k1"]);
      updateToMatchSetup.mockResolvedValueOnce({ refused: SETUP_CHANGED });
      getSetupChanges.mockResolvedValue(LEFT);
      await week.updateToMatchSetup(["k2"]);
      expect(screen.setupPreview.revisions).toBe("r2");
      expect(screen.setupAsk).toMatchObject({
        notice: "Something changed while you looked, so nothing was updated.",
        announcement: null,
        kept: true,
        updated: true
      });
    });

    it("setup changed again with nothing left: the list closes and says why", async () => {
      const { week, screen, said } = await opened();
      updateToMatchSetup.mockResolvedValue({ refused: SETUP_CHANGED });
      getSetupChanges.mockResolvedValue(NOTHING);
      await week.updateToMatchSetup(["k1"]);
      expect(screen.setupAsk).toBeNull();
      expect(said).toEqual([
        "Something changed while you looked, so nothing was updated. Week 1 matches setup now."
      ]);
    });

    it("updated but the week can't be shown now: the list closes and says it was done, reading nothing more", async () => {
      const { week, screen, adapter, said } = await opened();
      updateToMatchSetup.mockResolvedValue({ refused: null, kept: false });
      adapter.showUpdated.mockResolvedValue(false);
      getSetupChanges.mockClear();
      await week.updateToMatchSetup(["k1"]);
      expect(screen.setupAsk).toBeNull();
      expect(said).toEqual(["done: Updated to match setup."]);
      expect(getSetupChanges).not.toHaveBeenCalled();
    });

    it("an answer after another week is shown changes nothing there", async () => {
      const { week, screen, adapter, state, said } = await opened();
      const answer = pending();
      updateToMatchSetup.mockReturnValue(answer.promise);
      const updating = week.updateToMatchSetup(["k1"]);
      state.ticket += 1;
      answer.resolve({ refused: null, kept: true });
      await updating;
      expect(adapter.showUpdated).not.toHaveBeenCalled();
      expect(getVersions).not.toHaveBeenCalled();
      expect(screen.focusOn).toBeNull();
      expect(adapter.readIfAsked).not.toHaveBeenCalled();
      expect(said).toEqual([]);
    });

    it("an update that fails closes the list and says what didn't happen", async () => {
      const { week, screen } = await opened();
      updateToMatchSetup.mockRejectedValue(new Error("offline"));
      await week.updateToMatchSetup(["k1"]);
      expect(screen.setupAsk).toBeNull();
      expect(screen.error).toMatch(/^Week 1 was not updated\./);
      expect(screen.setupWorking).toBe(false);
    });

    it("does nothing with no list open, no rows chosen, or an update already on its way", async () => {
      const { week, screen } = await opened();
      await week.updateToMatchSetup([]);
      screen.setupWorking = true;
      await week.updateToMatchSetup(["k1"]);
      screen.setupWorking = false;
      screen.setupAsk = null;
      await week.updateToMatchSetup(["k1"]);
      expect(updateToMatchSetup).not.toHaveBeenCalled();
    });
  });
});

describe("c/shoreshBuildWeek: Publish and Unpublish", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  const PUBLISHED = { id: "pub1", origin: "Generated", publishedAt: "t1" };
  // A week never published, nothing to look at: published at once.
  const FIRST = {
    revisions: "r1",
    published: null,
    changes: [],
    changeCount: 0
  };
  // Published before, two cells changed since: asked first.
  const AGAIN = {
    revisions: "r1",
    published: PUBLISHED,
    changes: ["Bunk 1 · Monday · Swim → Crafts"],
    changeCount: 1
  };
  const DONE = {
    published: { id: "pub2", origin: "Generated" },
    draftChanged: false,
    publishedChanged: false,
    unchanged: false
  };
  const REFUSED = { ...DONE, published: null, draftChanged: true };

  /** A screen whose Publish question is open (the week published before, changed since). */
  async function asked() {
    const fake = fakeScreen();
    fake.adapter.previewPublish.mockResolvedValue(AGAIN);
    await fake.week.publish();
    return fake;
  }

  /** A screen whose Unpublish question is open. */
  function askedUnpublish() {
    const fake = fakeScreen();
    fake.screen.publishState = { ...PUBLISHED, changedSince: false };
    fake.week.askUnpublish();
    return fake;
  }

  describe("Publish", () => {
    it("waits while the screen is busy, saying so when an edit is still saving", async () => {
      const { week, screen, adapter, said } = fakeScreen();
      screen.publishDisabled = true;
      await week.publish();
      expect(said).toEqual([]);
      screen.editBusy = true;
      await week.publish();
      expect(said).toEqual(["One moment: an edit is still saving."]);
      expect(adapter.previewPublish).not.toHaveBeenCalled();
      expect(screen.publishing).toBe(false);
    });

    it("a week with no schedule yet publishes nothing", async () => {
      const { week, adapter, state } = fakeScreen();
      state.scheduleId = null;
      await week.publish();
      expect(adapter.previewPublish).not.toHaveBeenCalled();
    });

    it("a week's first publish with nothing to look at goes at once, is said, and is told to every screen", async () => {
      const { week, screen, adapter, said } = fakeScreen();
      screen.error = "Week 1 was not published.";
      adapter.previewPublish.mockResolvedValue(FIRST);
      adapter.publish.mockResolvedValue(DONE);
      await week.publish();
      expect(adapter.previewPublish).toHaveBeenCalledWith({
        scheduleId: "sc1"
      });
      expect(adapter.publish).toHaveBeenCalledWith({
        scheduleId: "sc1",
        seenRevisions: "r1",
        seenPublishedId: null
      });
      expect(screen.error).toBeNull();
      expect(screen.publishState).toEqual({
        id: "pub2",
        origin: "Generated",
        changedSince: false
      });
      expect(said).toEqual(["done: Published Week 1."]);
      expect(getVersions).toHaveBeenCalled();
      expect(screen.tellSchedulesChanged).toHaveBeenCalledWith(true, "p1|w1");
      expect(screen.publishing).toBe(false);
      expect(screen.focusOn).toBe("publish");
      expect(adapter.readIfAsked).toHaveBeenCalled();
    });

    it("Publish is back only once Versions lists the schedule it replaced", async () => {
      const { week, screen, adapter } = fakeScreen();
      const versions = pending();
      getVersions.mockReturnValue(versions.promise);
      adapter.previewPublish.mockResolvedValue(FIRST);
      adapter.publish.mockResolvedValue(DONE);
      const publishing = week.publish();
      await flush();
      expect(getVersions).toHaveBeenCalled();
      expect(screen.publishing).toBe(true);
      expect(screen.tellSchedulesChanged).not.toHaveBeenCalled();
      versions.resolve();
      await publishing;
      expect(screen.publishing).toBe(false);
      expect(screen.tellSchedulesChanged).toHaveBeenCalledWith(true, "p1|w1");
    });

    it("another week shown while Versions is read is told for the week published, and its Publish is left as it is (WEEK-6.7)", async () => {
      const { week, screen, adapter, state } = fakeScreen();
      const versions = pending();
      getVersions.mockReturnValue(versions.promise);
      adapter.previewPublish.mockResolvedValue(FIRST);
      adapter.publish.mockResolvedValue(DONE);
      const publishing = week.publish();
      await flush();
      state.week = "p1|w2";
      week.forgetPublish();
      versions.resolve();
      await publishing;
      expect(screen.tellSchedulesChanged).toHaveBeenCalledWith(true, "p1|w1");
      expect(screen.focusOn).toBeNull();
      expect(adapter.readIfAsked).not.toHaveBeenCalled();
    });

    it("a week already published as it is publishes nothing and says so", async () => {
      const { week, screen, adapter, said } = fakeScreen();
      adapter.previewPublish.mockResolvedValue({
        ...AGAIN,
        changes: [],
        changeCount: 0
      });
      await week.publish();
      expect(adapter.publish).not.toHaveBeenCalled();
      expect(screen.publishState).toEqual({
        ...PUBLISHED,
        changedSince: false
      });
      expect(said).toEqual(["Week 1 is already published as it is."]);
      expect(screen.focusOn).toBe("publish");
    });

    it("a publish the server finds changed nothing says so, and reads no Versions and tells no one", async () => {
      const { week, screen, adapter, said } = fakeScreen();
      adapter.previewPublish.mockResolvedValue(FIRST);
      adapter.publish.mockResolvedValue({
        ...DONE,
        published: PUBLISHED,
        unchanged: true
      });
      await week.publish();
      expect(said).toEqual(["Week 1 is already published as it is."]);
      expect(screen.publishState).toEqual({
        ...PUBLISHED,
        changedSince: false
      });
      expect(getVersions).not.toHaveBeenCalled();
      expect(screen.tellSchedulesChanged).not.toHaveBeenCalled();
    });

    it("a week someone else saved since this screen read it publishes nothing, says so in the camp's words and reads it again", async () => {
      const { week, screen, adapter, state, said } = fakeScreen();
      state.revision = "r0";
      adapter.previewPublish.mockResolvedValue(FIRST);
      await week.publish();
      expect(adapter.publish).not.toHaveBeenCalled();
      expect(said).toEqual([
        "Someone else changed this Session since, so nothing was published."
      ]);
      expect(screen.load).toHaveBeenCalledWith(true);
      expect(screen.publishing).toBe(false);
      expect(screen.focusOn).toBe("publish");
    });

    it("refused by the server: someone else saved, or published, since the preview", async () => {
      const { week, screen, adapter, said } = fakeScreen();
      adapter.previewPublish.mockResolvedValue(FIRST);
      adapter.publish.mockResolvedValue(REFUSED);
      await week.publish();
      adapter.publish.mockResolvedValue({
        ...REFUSED,
        draftChanged: false,
        publishedChanged: true
      });
      await week.publish();
      expect(said).toEqual([
        "Someone else changed this Session since, so nothing was published.",
        "Someone else published this Session since, so nothing was replaced."
      ]);
      expect(screen.load).toHaveBeenCalledTimes(2);
      expect(screen.publishState).toBeNull();
      expect(screen.tellSchedulesChanged).not.toHaveBeenCalled();
    });

    it("asks first when the week was published before, with this screen's heading; nothing is published until Publish", async () => {
      const { screen, adapter } = await asked();
      expect(screen.publishAsk).toMatchObject({
        kind: "ask",
        heading: "Publish Week 1 again?",
        confirmLabel: "Publish",
        week: "p1|w1",
        scheduleId: "sc1"
      });
      expect(screen.publishing).toBe(true);
      expect(screen.focusOn).toBeNull();
      expect(adapter.publish).not.toHaveBeenCalled();
    });

    it("the question names the other screen when its schedule is the one published", async () => {
      const { week, screen, adapter } = fakeScreen();
      adapter.previewPublish.mockResolvedValue({
        ...AGAIN,
        published: { ...PUBLISHED, origin: "Manual" }
      });
      await week.publish();
      expect(screen.publishAsk.heading).toBe(
        "Replace Week 1's published schedule (from Manual Build)?"
      );
    });

    it("Cancel publishes nothing; Publish sends the published schedule the preview showed", async () => {
      let fake = await asked();
      await fake.week.answerPublish(false);
      expect(fake.adapter.publish).not.toHaveBeenCalled();
      expect(fake.screen.publishAsk).toBeNull();
      expect(fake.screen.publishing).toBe(false);
      expect(fake.screen.focusOn).toBe("publish");
      fake = await asked();
      fake.adapter.publish.mockResolvedValue(DONE);
      await fake.week.answerPublish(true);
      expect(fake.adapter.publish).toHaveBeenCalledWith({
        scheduleId: "sc1",
        seenRevisions: "r1",
        seenPublishedId: "pub1"
      });
      expect(fake.said).toEqual(["done: Published Week 1."]);
      expect(fake.screen.focusOn).toBe("publish");
    });

    it("a preview or publish that fails says the week was not published", async () => {
      let fake = fakeScreen();
      fake.adapter.previewPublish.mockRejectedValue(new Error("offline"));
      await fake.week.publish();
      expect(fake.screen.error).toMatch(/^Week 1 was not published\./);
      expect(fake.screen.publishing).toBe(false);
      expect(fake.screen.focusOn).toBe("publish");
      fake = await asked();
      fake.adapter.publish.mockRejectedValue(new Error("offline"));
      await fake.week.answerPublish(true);
      expect(fake.screen.error).toMatch(/^Week 1 was not published\./);
      expect(fake.screen.publishing).toBe(false);
    });

    it("a preview answered once another week is shown asks nothing, says nothing and leaves that week's Publish as it is", async () => {
      const { week, screen, adapter, state, said } = fakeScreen();
      const preview = pending();
      adapter.previewPublish.mockReturnValue(preview.promise);
      const publishing = week.publish();
      state.week = "p1|w2";
      // Showing the other week let go of the publish.
      week.forgetPublish();
      preview.resolve({ ...AGAIN, revisions: "r0" });
      await publishing;
      expect(screen.publishAsk).toBeNull();
      expect(said).toEqual([]);
      expect(screen.load).not.toHaveBeenCalled();
      expect(screen.focusOn).toBeNull();
      expect(adapter.readIfAsked).not.toHaveBeenCalled();
    });

    it("a publish answered once another week is shown is still told, for the week published; a refused one is not (WEEK-6.7)", async () => {
      let fake = await asked();
      fake.adapter.publish.mockResolvedValue(DONE);
      fake.state.week = "p1|w2";
      fake.screen.publishing = true; // a publish asked from the week shown since
      await fake.week.answerPublish(true);
      expect(fake.screen.tellSchedulesChanged).toHaveBeenCalledWith(
        true,
        "p1|w1"
      );
      expect(fake.said).toEqual([]);
      expect(fake.screen.publishState).toBeNull();
      expect(getVersions).not.toHaveBeenCalled();
      expect(fake.screen.publishing).toBe(true);
      expect(fake.screen.focusOn).toBeNull();
      fake = await asked();
      fake.adapter.publish.mockResolvedValue(REFUSED);
      fake.state.week = "p1|w2";
      await fake.week.answerPublish(true);
      expect(fake.screen.tellSchedulesChanged).not.toHaveBeenCalled();
      expect(fake.screen.load).not.toHaveBeenCalled();
      expect(fake.said).toEqual([]);
    });

    it("a publish that fails once another week is shown says nothing on that week", async () => {
      const { week, screen, adapter, state } = await asked();
      adapter.publish.mockRejectedValue(new Error("offline"));
      state.week = "p1|w2";
      await week.answerPublish(true);
      expect(screen.error).toBeNull();
    });
  });

  describe("Unpublish", () => {
    it("does nothing while nothing is published, or while the screen is busy", () => {
      const { week, screen } = fakeScreen();
      week.askUnpublish();
      expect(screen.unpublishAsk).toBeNull();
      screen.publishState = { ...PUBLISHED, changedSince: false };
      screen.publishDisabled = true;
      week.askUnpublish();
      expect(screen.unpublishAsk).toBeNull();
      expect(screen.publishing).toBe(false);
    });

    it("asks first in the camp's words, and Cancel unpublishes nothing", async () => {
      const { week, screen, adapter } = askedUnpublish();
      expect(screen.unpublishAsk).toEqual({
        heading: "Unpublish Week 1?",
        lines: ["Nothing will be published for this Session."],
        publishedId: "pub1",
        week: "p1|w1",
        scheduleId: "sc1"
      });
      expect(screen.publishing).toBe(true);
      await week.answerUnpublish(false);
      expect(adapter.unpublish).not.toHaveBeenCalled();
      expect(screen.unpublishAsk).toBeNull();
      expect(screen.publishing).toBe(false);
      expect(screen.focusOn).toBe("unpublish");
    });

    it("unpublishes the published schedule shown, says so, and lists it in Versions before Unpublish is back", async () => {
      const { week, screen, adapter, said } = askedUnpublish();
      const versions = pending();
      getVersions.mockReturnValue(versions.promise);
      adapter.unpublish.mockResolvedValue({ publishedChanged: false });
      const unpublishing = week.answerUnpublish(true);
      await flush();
      expect(adapter.unpublish).toHaveBeenCalledWith({
        scheduleId: "sc1",
        seenPublishedId: "pub1"
      });
      expect(screen.publishState).toBeNull();
      expect(said).toEqual(["done: Unpublished Week 1."]);
      expect(screen.publishing).toBe(true);
      versions.resolve();
      await unpublishing;
      expect(screen.tellSchedulesChanged).toHaveBeenCalledWith(true, "p1|w1");
      expect(screen.publishing).toBe(false);
      expect(screen.focusOn).toBe("unpublish");
    });

    it("another week shown while Versions is read is told for the week unpublished (WEEK-6.7)", async () => {
      const { week, screen, adapter, state } = askedUnpublish();
      const versions = pending();
      getVersions.mockReturnValue(versions.promise);
      adapter.unpublish.mockResolvedValue({ publishedChanged: false });
      const unpublishing = week.answerUnpublish(true);
      await flush();
      state.week = "p1|w2";
      versions.resolve();
      await unpublishing;
      expect(screen.tellSchedulesChanged).toHaveBeenCalledWith(true, "p1|w1");
      expect(screen.focusOn).toBeNull();
    });

    it("refused when the week was published or unpublished since: says so and reads it again", async () => {
      const { week, screen, adapter, said } = askedUnpublish();
      adapter.unpublish.mockResolvedValue({ publishedChanged: true });
      await week.answerUnpublish(true);
      expect(said).toEqual([
        "Someone else published or unpublished this Session since, so nothing was unpublished."
      ]);
      expect(screen.load).toHaveBeenCalledWith(true);
      expect(screen.publishState).toEqual({
        ...PUBLISHED,
        changedSince: false
      });
      expect(screen.tellSchedulesChanged).not.toHaveBeenCalled();
    });

    it("a failure says the week was not unpublished and keeps it as published", async () => {
      const { week, screen, adapter } = askedUnpublish();
      adapter.unpublish.mockRejectedValue(new Error("offline"));
      await week.answerUnpublish(true);
      expect(screen.error).toMatch(/^Week 1 was not unpublished\./);
      expect(screen.publishState).not.toBeNull();
      expect(screen.publishing).toBe(false);
    });

    it("an unpublish answered once another week is shown is still told, for the week it was for, and nothing is shown (WEEK-6.7)", async () => {
      const { week, screen, adapter, state, said } = askedUnpublish();
      adapter.unpublish.mockResolvedValue({ publishedChanged: false });
      state.week = "p1|w2";
      screen.publishState = { id: "other", changedSince: false };
      await week.answerUnpublish(true);
      expect(screen.tellSchedulesChanged).toHaveBeenCalledWith(true, "p1|w1");
      expect(screen.publishState).toEqual({ id: "other", changedSince: false });
      expect(said).toEqual([]);
      expect(screen.focusOn).toBeNull();
    });

    it("a failure once another week is shown says nothing on that week", async () => {
      const { week, screen, adapter, state } = askedUnpublish();
      adapter.unpublish.mockRejectedValue(new Error("offline"));
      state.week = "p1|w2";
      await week.answerUnpublish(true);
      expect(screen.error).toBeNull();
    });
  });

  describe("a read of the week on its way", () => {
    it("is dropped when a publish or unpublish is sent, and the week is read once it is over", async () => {
      let fake = await asked();
      fake.state.reading = true;
      fake.adapter.publish.mockResolvedValue(DONE);
      await fake.week.answerPublish(true);
      expect(fake.state.ticket).toBe(1);
      expect(fake.adapter.readAfterWork).toHaveBeenCalled();
      expect(fake.adapter.readIfAsked).toHaveBeenCalled();
      fake = askedUnpublish();
      fake.state.reading = true;
      fake.adapter.unpublish.mockResolvedValue({ publishedChanged: false });
      await fake.week.answerUnpublish(true);
      expect(fake.state.ticket).toBe(1);
      expect(fake.adapter.readAfterWork).toHaveBeenCalled();
    });

    it("is left alone when there is none", async () => {
      const { week, adapter, state } = await asked();
      adapter.publish.mockResolvedValue(DONE);
      await week.answerPublish(true);
      expect(state.ticket).toBe(0);
      expect(adapter.readAfterWork).not.toHaveBeenCalled();
    });
  });

  it("another week shown: a publish question open for the last one goes", async () => {
    const { week, screen } = await asked();
    screen.unpublishAsk = { heading: "Unpublish Week 1?" };
    week.forgetPublish();
    expect(screen.publishAsk).toBeNull();
    expect(screen.unpublishAsk).toBeNull();
    expect(screen.publishing).toBe(false);
  });
});

describe("c/shoreshBuildWeek: Versions", () => {
  afterEach(() => {
    jest.clearAllMocks();
    getVersions.mockReset();
  });

  const MINE = { id: "v1", name: "Before the trip" };
  const ROWS = [MINE, { id: "v2", name: "Before Restore" }];

  /** A fake screen listing ROWS. */
  function listed() {
    const fake = fakeScreen();
    fake.screen.versions = ROWS;
    getVersions.mockResolvedValue(ROWS);
    return fake;
  }

  describe("the list", () => {
    it("reads the week's versions", async () => {
      const { week, screen } = fakeScreen();
      getVersions.mockResolvedValue(ROWS);
      await week.loadVersions();
      expect(getVersions).toHaveBeenCalledWith({
        programId: "p1",
        weekId: "w1"
      });
      expect(screen.versions).toEqual(ROWS);
    });

    it("an older read answering after a newer one is dropped", async () => {
      const { week, screen } = fakeScreen();
      const older = pending();
      getVersions.mockReturnValueOnce(older.promise);
      getVersions.mockResolvedValueOnce([MINE]);
      const first = week.loadVersions();
      await week.loadVersions();
      older.resolve(ROWS);
      await first;
      expect(screen.versions).toEqual([MINE]);
    });

    it("WEEK-6.12: a read that fails keeps the list as last read and says so", async () => {
      const { week, screen } = listed();
      getVersions.mockRejectedValueOnce(new Error("offline"));
      await week.loadVersions();
      expect(screen.versions).toEqual(ROWS);
      expect(screen.error).toMatch(
        /^Couldn't read the versions of Week 1\. Try again\. For support: [\w-]+\.$/
      );
      // The list says it too, never "None yet".
      expect(screen.versionsUnread).toBe(screen.error);
      // Read again: its line goes, from the list and the error line.
      await week.loadVersions();
      expect(screen.versionsUnread).toBeNull();
      expect(screen.error).toBeNull();
    });

    it("WEEK-6.12: a week opened whose versions can't be read says so in the list", async () => {
      const { week, screen } = listed();
      week.forgetVersions();
      getVersions.mockRejectedValueOnce(new Error("offline"));
      await week.loadVersions();
      expect(screen.versions).toEqual([]);
      expect(screen.versionsUnread).toMatch(
        /^Couldn't read the versions of Week 1\./
      );
      // Another week: what it said of this one goes.
      week.forgetVersions();
      expect(screen.versionsUnread).toBeNull();
    });

    it("WEEK-6.12: a failed read never covers a failure already shown", async () => {
      const { week, screen } = listed();
      screen.error = "Rainy plan wasn't saved. Try again.";
      getVersions.mockRejectedValueOnce(new Error("offline"));
      await week.loadVersions();
      expect(screen.error).toBe("Rainy plan wasn't saved. Try again.");
      // The list still says it; a read that works then leaves the other failure alone.
      expect(screen.versionsUnread).toMatch(
        /^Couldn't read the versions of Week 1\./
      );
      await week.loadVersions();
      expect(screen.versionsUnread).toBeNull();
      expect(screen.error).toBe("Rainy plan wasn't saved. Try again.");
    });

    it("WEEK-6.12: a failed read for a week no longer shown says nothing", async () => {
      const { week, screen } = listed();
      const late = pending();
      getVersions.mockReturnValueOnce(late.promise);
      const read = week.loadVersions();
      week.forgetVersions();
      late.reject(new Error("offline"));
      await read;
      expect(screen.error).toBeNull();
    });

    it("another week: the last one's versions go, and a list still on its way is dropped", async () => {
      const { week, screen } = fakeScreen();
      screen.versions = ROWS;
      const late = pending();
      getVersions.mockReturnValueOnce(late.promise);
      const read = week.loadVersions();
      week.forgetVersions();
      expect(screen.versions).toEqual([]);
      late.resolve(ROWS);
      await read;
      expect(screen.versions).toEqual([]);
    });
  });

  describe("Save version, rename and delete", () => {
    it("Save version keeps the week under the name, lists it before it is over, says so and tells every screen (WEEK-6.7)", async () => {
      const { week, screen, adapter, said } = listed();
      screen.error = "Old.";
      const onDone = jest.fn();
      adapter.saveVersion.mockImplementation(async () => {
        expect(screen.versionsWorking).toBe(true);
      });
      await week.saveVersion("Rainy plan", onDone);
      expect(adapter.saveVersion).toHaveBeenCalledWith({
        scheduleId: "sc1",
        name: "Rainy plan"
      });
      expect(screen.error).toBeNull();
      expect(getVersions).toHaveBeenCalled();
      expect(screen.versionsWorking).toBe(false);
      expect(said).toEqual(["Saved Rainy plan."]);
      expect(onDone).toHaveBeenCalledWith(true);
      expect(screen.tellSchedulesChanged).toHaveBeenCalledWith(false, "p1|w1");
    });

    it("WEEK-6.12: a version saved but the list not read again says both", async () => {
      const { week, screen, said } = listed();
      getVersions.mockRejectedValueOnce(new Error("offline"));
      await week.saveVersion("Rainy plan", jest.fn());
      expect(said).toEqual(["Saved Rainy plan."]);
      expect(screen.versions).toEqual(ROWS);
      expect(screen.error).toMatch(/^Couldn't read the versions of Week 1\./);
    });

    it("the Versions list is back before the hold ends, and a read asked for meanwhile is done after", async () => {
      const { week, screen, adapter } = listed();
      const list = pending();
      getVersions.mockReturnValueOnce(list.promise);
      const order = [];
      adapter.versionsOver.mockImplementation(() =>
        order.push(`over, working ${screen.versionsWorking}`)
      );
      adapter.readIfAsked.mockImplementation(() =>
        order.push(`read, working ${screen.versionsWorking}`)
      );
      const saving = week.saveVersion("Rainy plan", jest.fn());
      await flush();
      expect(order).toEqual([]);
      expect(screen.versionsWorking).toBe(true);
      list.resolve(ROWS);
      await saving;
      expect(order).toEqual(["over, working true", "read, working false"]);
    });

    it("Save version and rename wait while the screen is busy: nothing sent, the name stays typed", async () => {
      const { week, screen, adapter } = listed();
      screen.versionsBusy = true;
      const onDone = jest.fn();
      await week.saveVersion("Rainy plan", onDone);
      await week.renameVersion("v1", "Trip", onDone);
      expect(onDone.mock.calls).toEqual([[false], [false]]);
      expect(adapter.saveVersion).not.toHaveBeenCalled();
      expect(renameSchedule).not.toHaveBeenCalled();
      expect(screen.versionsWorking).toBe(false);
    });

    it("delete waits while the screen is busy too", async () => {
      const { week, screen, adapter, said } = listed();
      screen.versionsBusy = true;
      await week.deleteVersion("v1");
      expect(adapter.deleteVersion).not.toHaveBeenCalled();
      expect(said).toEqual([]);
    });

    it("a Save version that fails says what wasn't saved and why, keeps the name typed, and tells no one", async () => {
      const { week, screen, adapter, said } = listed();
      const onDone = jest.fn();
      adapter.saveVersion.mockRejectedValue({
        body: { message: "A version needs a name." }
      });
      await week.saveVersion("Rainy plan", onDone);
      expect(screen.error).toMatch(/^Rainy plan wasn't saved\./);
      expect(screen.error).toContain("A version needs a name.");
      expect(onDone).toHaveBeenCalledWith(false);
      expect(said).toEqual([]);
      expect(getVersions).toHaveBeenCalled();
      expect(screen.tellSchedulesChanged).not.toHaveBeenCalled();
    });

    it("rename renames the version and lists it again; one that fails names it", async () => {
      const { week, screen } = listed();
      const onDone = jest.fn();
      await week.renameVersion("v1", "Trip", onDone);
      expect(renameSchedule).toHaveBeenCalledWith({
        scheduleId: "v1",
        name: "Trip"
      });
      expect(onDone).toHaveBeenCalledWith(true);
      expect(getVersions).toHaveBeenCalled();
      expect(screen.tellSchedulesChanged).toHaveBeenCalledTimes(1);
      renameSchedule.mockRejectedValueOnce(new Error("offline"));
      await week.renameVersion("v1", "Trip", onDone);
      expect(screen.error).toMatch(/^Before the trip wasn't renamed\./);
      expect(onDone).toHaveBeenLastCalledWith(false);
    });

    it("delete takes the version away from the week's schedule and says so; one that fails names it", async () => {
      const { week, screen, adapter, said } = listed();
      await week.deleteVersion("v1");
      expect(adapter.deleteVersion).toHaveBeenCalledWith({
        scheduleId: "sc1",
        versionId: "v1"
      });
      expect(said).toEqual(["Deleted Before the trip."]);
      expect(screen.tellSchedulesChanged).toHaveBeenCalledWith(false, "p1|w1");
      adapter.deleteVersion.mockRejectedValueOnce(new Error("offline"));
      await week.deleteVersion("v1");
      expect(screen.error).toMatch(/^Before the trip wasn't deleted\./);
      expect(said).toEqual(["Deleted Before the trip."]);
    });

    it("an answer once another week is shown says nothing there, but is told for the week it was for (WEEK-6.7)", async () => {
      const { week, screen, adapter, state, said } = listed();
      const onDone = jest.fn();
      adapter.saveVersion.mockImplementation(async () => {
        state.week = "p1|w2";
      });
      await week.saveVersion("Rainy plan", onDone);
      expect(said).toEqual([]);
      expect(onDone).toHaveBeenCalledWith(false);
      expect(screen.tellSchedulesChanged).toHaveBeenCalledWith(false, "p1|w1");
      expect(screen.versionsWorking).toBe(false);
    });

    it("one that fails once another week is shown says nothing on that week", async () => {
      const { week, screen, adapter, state } = listed();
      adapter.deleteVersion.mockImplementation(async () => {
        state.week = "p1|w2";
        throw new Error("offline");
      });
      await week.deleteVersion("v1");
      expect(screen.error).toBeNull();
    });
  });

  describe("Restore", () => {
    it("waits while the screen is busy, saying so", async () => {
      const { week, screen, adapter, said } = listed();
      screen.versionsBusy = true;
      await week.restoreVersion("v1");
      expect(said).toEqual(["One moment: an edit is still saving."]);
      expect(adapter.restoreVersion).not.toHaveBeenCalled();
    });

    it("sends the week as this screen read it, then shows the week restored, says so and tells every screen", async () => {
      const { week, screen, adapter } = listed();
      const result = { refused: false, draft: { id: "d" } };
      adapter.restoreVersion.mockResolvedValue(result);
      await week.restoreVersion("v1");
      expect(adapter.restoreVersion).toHaveBeenCalledWith({
        scheduleId: "sc1",
        versionId: "v1",
        seenRevisions: "r1",
        undo: false
      });
      expect(adapter.showRestored).toHaveBeenCalledWith(result, 1, {
        id: "v1",
        said: "Restored Before the trip.",
        focus: null
      });
      expect(adapter.refuseRestore).not.toHaveBeenCalled();
      expect(getVersions).toHaveBeenCalled();
      expect(screen.tellSchedulesChanged).toHaveBeenCalledWith(false, "p1|w1");
      expect(screen.versionsWorking).toBe(false);
    });

    it("a read of the week on its way when it starts can't put the old week back: its answer is dropped", async () => {
      const { week, adapter, state } = listed();
      adapter.restoreVersion.mockResolvedValue({ refused: false });
      const before = state.ticket;
      await week.restoreVersion("v1");
      expect(state.ticket).toBe(before + 1);
      expect(adapter.showRestored).toHaveBeenCalledWith(
        expect.anything(),
        state.ticket,
        expect.anything()
      );
    });

    it("refused when someone else saved the week since: nothing shown, the line offers Reload, read out once in the camp's words", async () => {
      const { week, screen, adapter } = listed();
      adapter.restoreVersion.mockResolvedValue({ refused: true });
      await week.restoreVersion("v1");
      const text =
        "Someone else changed this Session since you opened it, so nothing was restored.";
      expect(adapter.refuseRestore).toHaveBeenCalledWith(text);
      expect(screen.announce.mock.calls).toEqual([[text]]);
      expect(adapter.showRestored).not.toHaveBeenCalled();
      expect(screen.error).toBeNull();
    });

    it("a week with no schedule yet: the version becomes its schedule, told as a schedule started", async () => {
      const { week, screen, adapter, state } = listed();
      state.scheduleId = null;
      adapter.restoreVersion.mockResolvedValue({ refused: false });
      await week.restoreVersion("v1");
      expect(adapter.restoreVersion).toHaveBeenCalledWith(
        expect.objectContaining({ scheduleId: null, versionId: "v1" })
      );
      expect(screen.tellSchedulesChanged).toHaveBeenCalledWith(true, "p1|w1");
    });

    it("Undo of Start over restores the version it kept, saying its own words, focus where asked", async () => {
      const { week, adapter } = listed();
      adapter.restoreVersion.mockResolvedValue({ refused: false });
      await week.restore("v2", "Undone: Start over.", {
        focus: "[data-id=build]",
        name: "Start over",
        undo: true
      });
      expect(adapter.restoreVersion).toHaveBeenCalledWith(
        expect.objectContaining({ versionId: "v2", undo: true })
      );
      expect(adapter.showRestored).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { id: "v2", said: "Undone: Start over.", focus: "[data-id=build]" }
      );
      adapter.restoreVersion.mockRejectedValueOnce(new Error("offline"));
      await week.restore("v2", "Undone: Start over.", {
        name: "Start over",
        undo: true
      });
      expect(week.adapter.screen.error).toMatch(/^Start over wasn't undone\./);
    });

    it("a Restore that fails says the version wasn't restored", async () => {
      const { week, screen, adapter } = listed();
      adapter.restoreVersion.mockRejectedValue(new Error("offline"));
      await week.restoreVersion("v1");
      expect(screen.error).toMatch(/^Before the trip wasn't restored\./);
      expect(screen.tellSchedulesChanged).not.toHaveBeenCalled();
    });

    it("restored but not shown just now (the screen says so): still told to every screen (WEEK-6.7)", async () => {
      const { week, screen, adapter } = listed();
      adapter.restoreVersion.mockResolvedValue({ refused: false });
      adapter.showRestored.mockResolvedValue(false);
      await week.restoreVersion("v1");
      expect(screen.tellSchedulesChanged).toHaveBeenCalledWith(false, "p1|w1");
      expect(screen.error).toBeNull();
    });

    it("an answer once another week is shown shows nothing and refuses nothing there, but is told for its week (WEEK-6.7)", async () => {
      const { week, screen, adapter, state } = listed();
      adapter.restoreVersion.mockImplementation(async () => {
        state.ticket += 1;
        state.week = "p1|w2";
        return { refused: false };
      });
      await week.restoreVersion("v1");
      expect(adapter.showRestored).not.toHaveBeenCalled();
      expect(adapter.refuseRestore).not.toHaveBeenCalled();
      expect(screen.tellSchedulesChanged).toHaveBeenCalledWith(false, "p1|w1");
      // A refusal answered once the week was read again (another ticket) is not shown either.
      state.week = "p1|w1";
      adapter.restoreVersion.mockImplementation(async () => {
        state.ticket += 1;
        return { refused: true };
      });
      await week.restoreVersion("v1");
      expect(adapter.refuseRestore).not.toHaveBeenCalled();
      expect(screen.announce).not.toHaveBeenCalled();
    });
  });
});
