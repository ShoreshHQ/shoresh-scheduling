import { readFileSync } from "fs";
import { join } from "path";
import getSetupChanges from "@salesforce/apex/SetupMatchController.getSetupChanges";
import updateToMatchSetup from "@salesforce/apex/SetupMatchController.updateToMatchSetup";
import { BuildWeek, CHANGED_SINCE, SETUP_CHANGED } from "c/shoreshBuildWeek";
import { buildTerms } from "c/shoreshTerms";

// The week on a build screen, through its interface with a fake screen: what setup changed and
// "Update to match setup", the same on Generated Schedule and Manual Build.

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

const flush = () =>
  [...Array(8)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
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
    loadVersions: jest.fn(),
    tellSchedulesChanged: jest.fn()
  };
  const state = { ticket: 0, week: "p1|w1", scheduleId: "sc1", busy: false };
  const adapter = {
    screen,
    scheduleId: () => state.scheduleId,
    weekKey: () => state.week,
    busy: () => state.busy,
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
      expect(screen.loadVersions).toHaveBeenCalled();
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
      expect(screen.loadVersions).not.toHaveBeenCalled();
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
      expect(screen.loadVersions).not.toHaveBeenCalled();
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
