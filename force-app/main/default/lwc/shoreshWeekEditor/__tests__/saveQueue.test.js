// The week editor's save queue on its own (saveQueue.js): what the editor's screen tests reach
// only through dragging and typing. A small host stands in for the editor's words and grid.
import {
  MAX_RESENDS,
  SaveQueue,
  lockTargetOf,
  locksWithWaiting
} from "../saveQueue";
import { History } from "../history";
import { serverRunsOf } from "../handEdits";
import { slots } from "../slotEdits";
import { WITH_SOCCER, WITH_SWIM, draft, schedule } from "./data/draftFixture";

const flush = () =>
  [...Array(10)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

// Bunk 1 on Monday: Period 2 is "date|groupId|blockId" P2, Lunch LUNCH.
const P2 = "2026-06-29|g1|t2";
const LUNCH = "2026-06-29|g1|t3";
// Bunk 1, Monday: Soccer (or Swim) in Period 2, made from an Open cell.
const SOCCER_AT_P2 = {
  day: 0,
  group: 0,
  first: 1,
  before: [""],
  after: ["A:a3"]
};
const SWIM_AT_LUNCH = {
  day: 0,
  group: 0,
  first: 2,
  before: [""],
  after: ["A:a1"]
};

const saved = (items, rows, conflicts = []) => ({
  status: "saved",
  conflicts,
  schedule: schedule(items, rows)
});

/** The editor, as far as the queue asks it: its week, its words, and its grid's answers. */
class Editor {
  constructor() {
    this.draft = draft();
    this.server = this.draft.schedule;
    this.queue = [];
    this.saving = false;
    this.conflict = null;
    this.lockBase = null;
    this.stepLocks = new Map();
    this.stepRain = new Map();
    this.lockChosenAt = new Map();
    this.history = new History();
    this.historyVersion = 0;
    this.stepSeq = 0;
    this.weekName = "Week 1";
    this.t = { sIn: (term) => term.toLowerCase() };
    this.checked = { placements: [] };
    this.events = [];
    this.said = [];
    this.errors = [];
    this.saveRuns = jest.fn();
    this.replanTool = jest.fn();
    this.refuseLocked = jest.fn();
    this.undoAdded = jest.fn();
  }
  get schedule() {
    return this.draft.schedule;
  }
  refuseWhileRestoring() {
    return false;
  }
  toServerRuns(runs, week = this.schedule.days) {
    return serverRunsOf(runs, week);
  }
  edited() {}
  whyRowsNow() {
    return [];
  }
  whyNews() {
    return null;
  }
  slotName(at, block) {
    return `${at.day}|${at.group}|${block}`;
  }
  dayGroupName(at) {
    return `${at.day}|${at.group}`;
  }
  nameOf(slot) {
    return slot || "Open";
  }
  itemFor(item) {
    return { kind: item[0], id: item.slice(2), name: item };
  }
  focusAfterQuestion() {}
  startHistoryOver() {
    this.history.clear();
  }
  say(text) {
    this.said.push(text);
  }
  sayOnce(text) {
    this.said.push(text);
  }
  announce(text) {
    this.said.push(text);
  }
  reportError(message) {
    this.errors.push(message);
  }
  dispatchEvent(event) {
    this.events.push(event.type);
  }
}

class Queue extends SaveQueue(Editor) {}

/** Bunk 1's Monday on the grid, slot by slot. */
const mondayOf = (editor) => slots(editor.schedule.days[0], 0);

/** An answer the test lets go of when it chooses. */
function held() {
  let answer;
  const promise = new Promise((resolve) => {
    answer = resolve;
  });
  return { promise, answer };
}

describe("locks with the edits still waiting", () => {
  it("is null when the host passed no locks", () => {
    expect(locksWithWaiting(null, [])).toBeNull();
  });

  it("makes each waiting Undo's lock target on top of the saved locks", () => {
    const waiting = {
      edit: {
        runs: [{ day: "2026-06-29", groupId: "g1", blockIds: ["t2", "t3"] }]
      },
      locksTarget: new Set([LUNCH])
    };
    const now = locksWithWaiting(new Set([P2]), [waiting]);
    expect([...now]).toEqual([LUNCH]);
  });
});

describe("the locks an Undo or Redo leaves", () => {
  // The step locked Period 2 (a hand edit locks what it places); Lunch stayed unlocked.
  const record = { before: new Set(), after: new Set([P2]) };

  it("takes off the lock the step brought, on Undo", () => {
    const target = lockTargetOf(record, 3, "undo", new Set([P2]), new Map());
    expect(target.has(P2)).toBe(false);
  });

  it("puts back the step's lock, on Redo", () => {
    const target = lockTargetOf(record, 3, "redo", new Set(), new Map());
    expect(target.has(P2)).toBe(true);
  });

  it("keeps a lock the director chose from the Lock menu since the step", () => {
    const chosen = new Map([[P2, 3]]);
    const target = lockTargetOf(record, 3, "undo", new Set([P2]), chosen);
    expect(target.has(P2)).toBe(true);
  });

  it("leaves every cell the step didn't change as it is now", () => {
    const target = lockTargetOf(
      record,
      3,
      "undo",
      new Set([P2, LUNCH]),
      new Map()
    );
    expect([...target]).toEqual([LUNCH]);
  });

  it("is null for an edit, and for a step with no locks kept", () => {
    expect(lockTargetOf(record, 3, "edit", new Set(), new Map())).toBeNull();
    expect(lockTargetOf(undefined, 3, "undo", new Set(), new Map())).toBeNull();
  });
});

describe("the save queue", () => {
  it("shows every edit at once and sends them one at a time, in order", async () => {
    const editor = new Queue();
    const first = held();
    editor.saveRuns
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(saved(WITH_SWIM, ["1,2,1", "1,,"]));
    editor.commit([SOCCER_AT_P2], "Soccer", null);
    editor.commit([SWIM_AT_LUNCH], "Swim", null);

    expect(mondayOf(editor)).toEqual(["F:f1", "A:a3", "A:a1"]);
    expect(editor.saveRuns).toHaveBeenCalledTimes(1);
    expect(editor.queue).toHaveLength(2);

    first.answer(saved(WITH_SOCCER, ["1,2,", "1,,"]));
    await flush();

    expect(editor.saveRuns).toHaveBeenCalledTimes(2);
    const [[[sentFirst]], [[sentSecond]]] = editor.saveRuns.mock.calls;
    expect(sentFirst.runs[0]).toMatchObject({
      firstBlockId: "t2",
      after: ["A:a3"]
    });
    expect(sentSecond.runs[0]).toMatchObject({
      firstBlockId: "t3",
      after: ["A:a1"]
    });
    expect(editor.queue).toEqual([]);
    expect(editor.said).toEqual(["Soccer", "Swim"]);
    expect(editor.history.canUndo).toBe(true);
  });

  it("on a failed save, says the change and how many after it were lost, and reads the week again", async () => {
    const editor = new Queue();
    editor.saveRuns.mockRejectedValueOnce(new Error("offline"));
    editor.commit([SOCCER_AT_P2], "Soccer", null);
    editor.commit([SWIM_AT_LUNCH], "Swim", null);
    await flush();

    expect(editor.errors[0]).toMatch(/^Your change wasn't saved: Soccer\./);
    expect(editor.errors[0]).toMatch(
      /1 more change after it wasn't saved either\.$/
    );
    expect(editor.queue).toEqual([]);
    expect(editor.saveRuns).toHaveBeenCalledTimes(1);
    // What is saved is no longer known: Undo starts over.
    expect(editor.history.canUndo).toBe(false);
    expect(editor.events).toContain("reload");
  });

  it("treats the host's refusal as a failed save, in the host's words", async () => {
    const editor = new Queue();
    editor.saveRuns.mockResolvedValueOnce({
      status: "refused",
      message: "This week is being published."
    });
    editor.commit([SOCCER_AT_P2], "Soccer", null);
    await flush();

    expect(editor.errors[0]).toContain("Your change wasn't saved: Soccer.");
    expect(editor.errors[0]).toContain("This week is being published.");
    expect(editor.events).toContain("reload");
  });
});

describe("someone else changed it", () => {
  it("asks keep theirs or use yours, and holds the edits after it until the answer", async () => {
    const editor = new Queue();
    // Someone put Swim in Period 2 first: the server kept theirs.
    editor.saveRuns.mockResolvedValueOnce(
      saved(WITH_SWIM, ["1,2,", "1,,"], [{ day: "2026-06-29" }])
    );
    editor.commit([SOCCER_AT_P2], "Soccer", null);
    editor.commit([SWIM_AT_LUNCH], "Swim", null);
    await flush();

    expect(editor.conflict.rows).toEqual([
      { key: "0|0|1", where: "0|0|1", theirs: "A:a1", yours: "A:a3" }
    ]);
    expect(editor.saveRuns).toHaveBeenCalledTimes(1);
    // Theirs shows, with the waiting edit on top.
    expect(mondayOf(editor)).toEqual(["F:f1", "A:a1", "A:a1"]);

    editor.saveRuns.mockResolvedValueOnce(saved(WITH_SWIM, ["1,2,2", "1,,"]));
    editor.handleKeepTheirs();
    await flush();

    expect(editor.conflict).toBeNull();
    expect(editor.saveRuns).toHaveBeenCalledTimes(2);
    expect(editor.saveRuns.mock.calls[1][0][0].runs[0].firstBlockId).toBe("t3");
    // Their change stands: Undo holds only the edit that was made.
    expect(editor.history.undos.map((step) => step.label)).toEqual(["Swim"]);
  });

  it("Use yours sends exactly what the question showed, before the edits that waited", async () => {
    const editor = new Queue();
    editor.saveRuns.mockResolvedValueOnce(
      saved(WITH_SWIM, ["1,2,", "1,,"], [{ day: "2026-06-29" }])
    );
    editor.commit([SOCCER_AT_P2], "Soccer", null);
    editor.commit([SWIM_AT_LUNCH], "Swim", null);
    await flush();

    editor.saveRuns.mockResolvedValue(saved(WITH_SOCCER, ["1,2,", "1,,"]));
    editor.handleUseYours();

    expect(editor.queue.map((entry) => entry.label)).toEqual([
      "Soccer",
      "Swim"
    ]);
    expect(editor.queue[0].resent).toBe(1);
    const resent = editor.saveRuns.mock.calls[1][0][0].runs[0];
    expect(resent).toMatchObject({
      firstBlockId: "t2",
      before: ["A:a1"],
      after: ["A:a3"]
    });
  });

  it(`gives up after ${MAX_RESENDS} resends that come back with nothing new to ask`, async () => {
    const editor = new Queue();
    // The server keeps answering "conflict" over a week that still holds what the director saw.
    editor.saveRuns.mockImplementation(() =>
      Promise.resolve(saved(undefined, ["1,,", "1,,"], [{ day: "2026-06-29" }]))
    );
    editor.commit([SOCCER_AT_P2], "Soccer", null);
    await flush();

    expect(editor.saveRuns).toHaveBeenCalledTimes(MAX_RESENDS + 1);
    expect(editor.conflict).toBeNull();
    expect(editor.queue).toEqual([]);
    expect(editor.said).toContain(
      "Your change wasn't saved: Soccer. The week kept changing while it was saved. Try again."
    );
    expect(editor.history.canUndo).toBe(false);
  });

  it("drops an edit over a cell someone locked meanwhile, and names the lock", async () => {
    const editor = new Queue();
    editor.lockBase = new Set();
    editor.saveRuns.mockResolvedValueOnce({
      ...saved(WITH_SWIM, ["1,2,", "1,,"], [{ day: "2026-06-29" }]),
      locks: [P2]
    });
    editor.commit([SOCCER_AT_P2], "Soccer", null);
    await flush();

    expect(editor.saveRuns.mock.calls[0][0][0].runs[0].locksBefore).toEqual([
      ""
    ]);
    expect(editor.refuseLocked).toHaveBeenCalledWith({
      day: 0,
      group: 0,
      block: 1
    });
    expect(editor.conflict).toBeNull();
    expect(editor.history.canUndo).toBe(false);
    expect(mondayOf(editor)).toEqual(["F:f1", "A:a1", ""]);
  });
});
