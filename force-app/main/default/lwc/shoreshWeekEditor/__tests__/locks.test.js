// How the editor works out Generated Schedule's locks beforehand (locks.js): the same rule as the
// server (GeneratedEdits.lock): a lock covers a whole placement.
import { diffRuns, slots } from "../slotEdits";
import {
  alreadySkipped,
  foldRun,
  lockKey,
  lockedSince,
  locksAfterSave,
  locksOfWeek,
  marks,
  newlyLocked,
  noteRows,
  unlockedSince,
  withLocks
} from "../locks";
import { day } from "./data/draftFixture";

const ITEMS = [
  { kind: "F", id: "f1", name: "Flagpole", gone: false },
  { kind: "A", id: "a1", name: "Swim", gone: false },
  { kind: "F", id: "f2", name: "Chapel", gone: false }
];
const DAY = "2026-06-29";
const key = (b) => lockKey(DAY, "g1", `t${b}`);
const locked = (...blocks) => new Set(blocks.map(key));

/** The server run for Bunk 1 as an edit of the week's row to `after` makes it (one changed span). */
function runTo(before, after) {
  const week = [day(DAY, ITEMS, [before, ",,"])];
  const row = slots(week[0], 0);
  const [run] = diffRuns(row, after);
  const served = {
    day: DAY,
    groupId: "g1",
    firstBlockId: week[0].blocks[run.first].id,
    before: run.before,
    after: run.after,
    blockIds: week[0].blocks
      .slice(run.first, run.first + run.after.length)
      .map((b) => b.id)
  };
  noteRows(week, [served]);
  return served;
}

describe("foldRun: a hand edit", () => {
  // LOCK-1.1
  it("locks a placed activity, and unlocks a cell left Open", () => {
    const placed = runTo(",,", ["", "A:a1", ""]);
    expect(foldRun(new Set(), placed)).toEqual(locked(2));
    const cleared = runTo(",2,", ["", "", ""]);
    expect(foldRun(locked(2), cleared)).toEqual(new Set());
  });

  // LOCK-4.1
  it("lengthening an unlocked activity locks the whole of it, not only the added block", () => {
    const run = runTo(",2,", ["", "A:a1", "^A:a1"]);
    expect(foldRun(new Set(), run)).toEqual(locked(2, 3));
    // Even a run holding only the block that changed (the placement starts before it).
    const week = [day(DAY, ITEMS, [",2,", ",,"])];
    const added = {
      day: DAY,
      groupId: "g1",
      firstBlockId: "t3",
      before: [""],
      after: ["^A:a1"],
      blockIds: ["t3"]
    };
    noteRows(week, [added]);
    expect(foldRun(new Set(), added)).toEqual(locked(2, 3));
  });

  // LOCK-4.1
  it("shortening locks what is left, and leaves the freed block unlocked", () => {
    const run = runTo(",2,^", ["", "A:a1", ""]);
    expect(foldRun(new Set(), run)).toEqual(locked(2));
  });

  it("shortening a placement of three locks the two blocks left", () => {
    const row = ["A:a1", "^A:a1", "^A:a1"];
    const week = [day(DAY, ITEMS, ["2,^,^", ",,"])];
    const run = {
      day: DAY,
      groupId: "g1",
      firstBlockId: "t3",
      before: ["^A:a1"],
      after: [""],
      blockIds: ["t3"]
    };
    noteRows(week, [run]);
    expect(slots(week[0], 0)).toEqual(row);
    expect(foldRun(new Set(), run)).toEqual(locked(1, 2));
  });

  it("clearing the end of a placement that was locked unlocks only that block's placement, as the server does", () => {
    // After the edit the freed block is Open, so only it is unlocked; the rest is locked again.
    const run = runTo(",2,^", ["", "A:a1", ""]);
    expect(foldRun(locked(2, 3), run)).toEqual(locked(2));
  });

  it("clearing a whole two-block placement unlocks both blocks", () => {
    const run = runTo(",2,^", ["", "", ""]);
    expect(run.blockIds).toEqual(["t2", "t3"]);
    expect(foldRun(locked(2, 3), run)).toEqual(new Set());
  });

  // LOCK-1.3
  it("a fixed or recurring activity is never locked", () => {
    const run = runTo(",,", ["F:f2", "", ""]);
    expect(foldRun(new Set(), run)).toEqual(new Set());
  });

  it("leaves other bunks, days, and cells alone", () => {
    const other = new Set([lockKey(DAY, "g2", "t2"), lockKey("x", "g1", "t2")]);
    const run = runTo(",,", ["", "A:a1", ""]);
    expect(foldRun(other, run)).toEqual(new Set([...other, key(2)]));
  });

  it("two runs in a row see each other's row", () => {
    const week = [day(DAY, ITEMS, [",,", ",,"])];
    const first = {
      day: DAY,
      groupId: "g1",
      firstBlockId: "t2",
      before: [""],
      after: ["A:a1"],
      blockIds: ["t2"]
    };
    const second = {
      day: DAY,
      groupId: "g1",
      firstBlockId: "t3",
      before: [""],
      after: ["^A:a1"],
      blockIds: ["t3"]
    };
    noteRows(week, [first, second]);
    expect(foldRun(foldRun(new Set(), first), second)).toEqual(locked(2, 3));
  });

  it("the second run's row carries what the first run made, even past its own blocks", () => {
    // Swim at Period 1 is lengthened over Period 2 (first), then Period 1 is given to someone
    // else's activity (second): the second run's placement still reaches Period 2.
    const week = [day(DAY, ITEMS, ["2,,", ",,"])];
    const first = {
      day: DAY,
      groupId: "g1",
      firstBlockId: "t2",
      before: [""],
      after: ["^A:a1"],
      blockIds: ["t2"]
    };
    const second = {
      day: DAY,
      groupId: "g1",
      firstBlockId: "t1",
      before: ["A:a1"],
      after: ["A:a2"],
      blockIds: ["t1"]
    };
    noteRows(week, [first, second]);
    expect(foldRun(new Set(), second)).toEqual(locked(1, 2));
  });

  it("a run with no row noted is read on its own blocks", () => {
    const run = {
      day: DAY,
      groupId: "g1",
      before: ["", ""],
      after: ["A:a1", "^A:a1"],
      blockIds: ["t2", "t3"]
    };
    expect(foldRun(new Set(), run)).toEqual(locked(2, 3));
  });
});

describe("foldRun: an Undo or Redo", () => {
  it("takes exactly the locks the target holds for the run's cells, and no others", () => {
    const run = runTo(",2,^", ["", "", ""]);
    // Block 1 is not in the run, so the target says nothing of it.
    const target = locked(3, 1);
    expect(foldRun(locked(2), run, target)).toEqual(locked(3));
    expect(foldRun(locked(1, 2), run, target)).toEqual(locked(1, 3));
    expect(foldRun(locked(2, 3), run, new Set())).toEqual(new Set());
  });
});

describe("marks and locksOfWeek", () => {
  it("marks one entry per block of the run", () => {
    const run = runTo(",2,^", ["", "", ""]);
    expect(marks(locked(3), run)).toEqual(["", "1"]);
  });

  it("reads the locked cells of a saved week, and null when it doesn't say", () => {
    const monday = { ...day(DAY, ITEMS, [",,", ",,"]), locks: [",1,", "1,,1"] };
    const tuesday = { ...day("2026-06-30", ITEMS, [",,", ",,"]), locks: [] };
    expect(locksOfWeek([monday, tuesday])).toEqual(
      new Set([
        lockKey(DAY, "g1", "t2"),
        lockKey(DAY, "g2", "t1"),
        lockKey(DAY, "g2", "t3")
      ])
    );
    expect(locksOfWeek([monday, day("x", ITEMS, [",,", ",,"])])).toBeNull();
    // A day the server could not read says nothing of locks, and does not stop the others being read.
    const broken = { ...day("2026-07-01", ITEMS, [",,", ",,"]), problem: "x" };
    expect(locksOfWeek([monday, broken])).toEqual(
      new Set([
        lockKey(DAY, "g1", "t2"),
        lockKey(DAY, "g2", "t1"),
        lockKey(DAY, "g2", "t3")
      ])
    );
    expect(locksOfWeek(undefined)).toBeNull();
  });
});

describe("around a save", () => {
  const run = () => runTo(",,", ["", "A:a1", ""]);
  // Two blocks of one group, and a run of the next group: a rule must look at every one.
  const twoBlocks = () => ({
    day: DAY,
    groupId: "g1",
    firstBlockId: "t1",
    before: ["", ""],
    after: ["A:a1", "^A:a1"],
    blockIds: ["t1", "t2"]
  });
  const otherGroup = () => ({
    day: DAY,
    groupId: "g2",
    firstBlockId: "t1",
    before: [""],
    after: ["A:a1"],
    blockIds: ["t1"]
  });
  const g2 = lockKey(DAY, "g2", "t1");

  // LOCK-5.2
  it("withLocks: sends the locks the director saw, and for Undo or Redo the locks to leave", () => {
    const edit = { runs: [run()], rain: "marks" };
    expect(withLocks({ edit })).toBe(edit);
    const plain = withLocks({ edit, seen: locked(2) });
    expect(plain.rain).toBe("marks");
    expect(plain.runs[0].locksBefore).toEqual(["1"]);
    expect(plain.runs[0].locksAfter).toBeUndefined();
    const [undo] = withLocks({
      edit,
      seen: locked(2),
      locksTarget: new Set()
    }).runs;
    expect(undo.locksBefore).toEqual(["1"]);
    expect(undo.locksAfter).toEqual([""]);
  });

  // LOCK-4.4: never overwritten silently.
  it("newlyLocked: finds a cell locked after the edit was made, in any block of any run", () => {
    const sent = withLocks({
      edit: { runs: [twoBlocks(), otherGroup()] },
      seen: locked(1)
    }).runs;
    // Block 1 was seen locked; block 2 is the one locked since.
    expect(sent[0].locksBefore).toEqual(["1", ""]);
    expect(newlyLocked(locked(1), sent)).toBeNull();
    expect(newlyLocked(locked(1, 2), sent)).toEqual({
      run: sent[0],
      block: 1
    });
    expect(newlyLocked(new Set([g2]), sent)).toEqual({
      run: sent[1],
      block: 0
    });
    // A run sent without the locks it saw has nothing to compare; the next one still counts.
    expect(newlyLocked(new Set([g2]), [otherGroup(), sent[1]])).toEqual({
      run: sent[1],
      block: 0
    });
    expect(newlyLocked(locked(1, 2), [twoBlocks()])).toBeNull();
  });

  // LOCK-4.5
  it("alreadySkipped: a cell the tool left out once isn't worth working out again", () => {
    const sent = twoBlocks();
    const second = { run: sent, block: 1 };
    expect(alreadySkipped({ tool: {} }, second)).toBe(false);
    expect(alreadySkipped({ tool: { locked: locked(1) } }, second)).toBe(false);
    expect(alreadySkipped({ tool: { locked: locked(2) } }, second)).toBe(true);
  });

  // LOCK-4.5
  it("lockedSince: the cells locked that the director hadn't seen locked", () => {
    const entry = { seen: locked(1, 2) };
    expect(lockedSince(locked(1, 2, 3), entry)).toEqual(locked(3));
    expect(lockedSince(null, entry)).toEqual(new Set());
  });

  it("unlockedSince: cells this edit touches that were seen locked and no longer are", () => {
    const edit = { runs: [twoBlocks(), otherGroup()] };
    const seen = new Set([key(2), key(3), g2]);
    // Block 3 isn't touched; block 1 is touched but was never seen locked.
    expect(unlockedSince(new Set(), { edit, seen })).toEqual(
      new Set([key(2), g2])
    );
    expect(unlockedSince(new Set([g2]), { edit, seen })).toEqual(locked(2));
    expect(unlockedSince(new Set([key(2), g2]), { edit, seen })).toEqual(
      new Set()
    );
    expect(unlockedSince(null, { edit, seen })).toEqual(new Set());
    expect(unlockedSince(new Set(), { edit })).toEqual(new Set());
  });

  it("locksAfterSave: the saver's own, else the week it sent", () => {
    const entry = { edit: { runs: [run()] } };
    const week = [{ ...day(DAY, ITEMS, [",,"]), locks: ["1,,"] }];
    const schedule = { days: week };
    expect(locksAfterSave(null, entry, { conflicts: [] })).toBeNull();
    expect(
      locksAfterSave(new Set(), entry, {
        conflicts: [],
        locks: [key(3)],
        schedule
      })
    ).toEqual(locked(3));
    expect(
      locksAfterSave(new Set(), entry, { conflicts: [], schedule })
    ).toEqual(locksOfWeek(week));
  });

  // LOCK-1.1
  it("locksAfterSave: else what the edit left, every run of it, and nothing if it wasn't made", () => {
    const placed = run();
    const edit = { runs: [placed, otherGroup()] };
    expect(locksAfterSave(locked(1), { edit }, { conflicts: [] })).toEqual(
      new Set([key(1), key(2), g2])
    );
    expect(locksAfterSave(locked(1), { edit }, { conflicts: [{}] })).toEqual(
      locked(1)
    );
    const cleared = runTo(",2,", ["", "", ""]);
    expect(
      locksAfterSave(
        locked(2),
        { edit: { runs: [cleared] } },
        { conflicts: [] }
      )
    ).toEqual(new Set());
  });

  // LOCK-5.2
  it("locksAfterSave: an Undo or Redo leaves the locks of its target", () => {
    const entry = { edit: { runs: [run()] }, locksTarget: new Set() };
    expect(locksAfterSave(locked(2), entry, { conflicts: [] })).toEqual(
      new Set()
    );
  });
});
