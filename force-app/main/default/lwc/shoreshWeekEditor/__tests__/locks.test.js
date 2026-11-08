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

  // LOCK-5.2
  it("withLocks: sends the locks the director saw, and for Undo or Redo the locks to leave", () => {
    const edit = { runs: [run()] };
    expect(withLocks({ edit })).toBe(edit);
    const [plain] = withLocks({ edit, seen: locked(2) }).runs;
    expect(plain.locksBefore).toEqual(marks(locked(2), edit.runs[0]));
    expect(plain.locksAfter).toBeUndefined();
    const [undo] = withLocks({
      edit,
      seen: locked(2),
      locksTarget: new Set()
    }).runs;
    expect(undo.locksBefore).toEqual(marks(locked(2), edit.runs[0]));
    expect(undo.locksAfter).toEqual(marks(new Set(), edit.runs[0]));
  });

  // LOCK-4.4
  it("newlyLocked: finds a cell someone locked after the edit was made, and nothing else", () => {
    const [sent] = withLocks({ edit: { runs: [run()] }, seen: new Set() }).runs;
    const block = sent.blockIds.indexOf("t2");
    expect(newlyLocked(locked(2), [sent])).toEqual({ run: sent, block });
    expect(newlyLocked(new Set(), [sent])).toBeNull();
    const [sawIt] = withLocks({
      edit: { runs: [run()] },
      seen: locked(2)
    }).runs;
    expect(newlyLocked(locked(2), [sawIt])).toBeNull();
    // An edit sent without the locks it saw (no locks on this screen) has nothing to compare.
    expect(newlyLocked(locked(2), [run()])).toBeNull();
  });

  it("alreadySkipped: a cell the tool left out once isn't worth working out again", () => {
    const sent = run();
    const at = { run: sent, block: sent.blockIds.indexOf("t2") };
    expect(alreadySkipped({ tool: {} }, at)).toBe(false);
    expect(alreadySkipped({ tool: { locked: locked(1) } }, at)).toBe(false);
    expect(alreadySkipped({ tool: { locked: locked(2) } }, at)).toBe(true);
  });

  // LOCK-4.4
  it("lockedSince and unlockedSince: what changed since the director looked", () => {
    const entry = { edit: { runs: [run()] }, seen: locked(1, 2) };
    expect(lockedSince(locked(1, 2, 3), entry)).toEqual(locked(3));
    expect(lockedSince(null, entry)).toEqual(new Set());
    // Only cells this edit touches count as unlocked since: it touches block 2, not block 1.
    expect(unlockedSince(new Set(), entry)).toEqual(locked(2));
    expect(unlockedSince(locked(1, 2), entry)).toEqual(new Set());
    expect(unlockedSince(null, entry)).toEqual(new Set());
    expect(unlockedSince(new Set(), { edit: entry.edit })).toEqual(new Set());
  });

  // LOCK-1.1
  it("locksAfterSave: the saver's own, else the week it sent, else what the edit left", () => {
    const entry = { edit: { runs: [run()] } };
    const none = { conflicts: [] };
    expect(locksAfterSave(null, entry, none)).toBeNull();
    expect(
      locksAfterSave(new Set(), entry, { ...none, locks: [key(3)] })
    ).toEqual(locked(3));
    const week = [{ ...day(DAY, ITEMS, [",,"]), locks: ["1,,"] }];
    expect(
      locksAfterSave(new Set(), entry, {
        ...none,
        schedule: { days: week }
      })
    ).toEqual(locksOfWeek(week));
    expect(locksAfterSave(locked(1), entry, none)).toEqual(locked(1, 2));
    // A conflict: the edit wasn't made, so the locks stay as they were.
    expect(locksAfterSave(locked(1), entry, { conflicts: [{}] })).toEqual(
      locked(1)
    );
  });

  // LOCK-5.2
  it("locksAfterSave: an Undo or Redo leaves the locks of its target", () => {
    const entry = { edit: { runs: [run()] }, locksTarget: new Set() };
    expect(locksAfterSave(locked(2), entry, { conflicts: [] })).toEqual(
      new Set()
    );
  });
});
