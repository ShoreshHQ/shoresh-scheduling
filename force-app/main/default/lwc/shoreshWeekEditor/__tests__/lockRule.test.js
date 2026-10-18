// The editor's lock rule (locks.js foldRun) against the server's (GeneratedEdits.lock): the
// cases are read from the Apex test that runs them on the server (GeneratedEditLocksTest
// LOCK_CASES), and each must give the same cells locked here. A change to either rule, or to the
// cases, fails one side or the other.
import { readFileSync } from "fs";
import { join } from "path";
import { slots } from "../slotEdits";
import { foldRun, lockKey, noteRows } from "../locks";
import { day } from "./data/draftFixture";

const APEX = readFileSync(
  join(__dirname, "..", "..", "..", "classes", "GeneratedEditLocksTest.cls"),
  "utf8"
);
const DAY = "2026-06-29";
// The same items, in the same order, as the Apex test's grid.
const ITEMS = [
  { kind: "F", id: "f1", name: "Flagpole", gone: false },
  { kind: "A", id: "a1", name: "Swim", gone: false },
  { kind: "F", id: "f2", name: "Chapel", gone: false },
  { kind: "A", id: "a2", name: "Boating", gone: false }
];

/** The case lines of LOCK_CASES, as the Apex test has them. */
function cases() {
  const list = APEX.match(/LOCK_CASES = new List<String>\{([\s\S]*?)\};/);
  return [...list[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
}

function words(text) {
  return text ? text.split(" ") : [];
}
function keyOf(cell) {
  return cell.startsWith("g2:")
    ? lockKey(DAY, "g2", `t${cell.slice(3)}`)
    : lockKey(DAY, "g1", `t${cell}`);
}

/** The cells locked after the runs, by the editor's rule, written as the Apex test writes them. */
function editorAnswer(row, locked, runTexts, target) {
  const week = [day(DAY, ITEMS, [row, ",,"])];
  const now = slots(week[0], 0);
  const runs = runTexts.map((text) => {
    const [at, rest] = text.split("|");
    const first = Number(at) - 1;
    const after = rest.split("+");
    const run = {
      day: DAY,
      groupId: "g1",
      firstBlockId: `t${first + 1}`,
      before: now.slice(first, first + after.length),
      after,
      blockIds: after.map((_, i) => `t${first + i + 1}`)
    };
    after.forEach((slot, i) => {
      now[first + i] = slot;
    });
    return run;
  });
  noteRows(week, runs);
  const restore =
    target === "-" ? undefined : new Set(words(target).map(keyOf));
  const after = runs.reduce(
    (state, run) => foldRun(state, run, restore),
    new Set(words(locked).map(keyOf))
  );
  return ["g1", "g2"]
    .flatMap((g) =>
      [1, 2, 3]
        .filter((b) => after.has(lockKey(DAY, g, `t${b}`)))
        .map((b) => (g === "g1" ? String(b) : `g2:${b}`))
    )
    .join(" ");
}

describe("the editor's lock rule is the server's (GeneratedEditLocksTest)", () => {
  it("reads the server's cases", () => {
    expect(cases().length).toBeGreaterThanOrEqual(14);
  });

  it.each(cases().map((line) => [line.split(";")[0], line]))(
    "%s",
    (name, line) => {
      const [, row, locked, runs, target, expected] = line
        .split(";")
        .map((part) => part.trim());
      expect(editorAnswer(row, locked, runs.split(" / "), target)).toBe(
        expected
      );
    }
  );
});
