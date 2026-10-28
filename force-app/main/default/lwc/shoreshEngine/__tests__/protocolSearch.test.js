/**
 * Step 8 rules that had no test of their own (docs/engine/protocol.md): the third repair
 * (fillCell), the search's guard on weekly minimums, and its second pass. Small camps built for
 * each rule, so the rule alone decides what the week holds.
 */
import { generateWeekSteps } from "c/shoreshEngine";
import { activity, block, camp, group } from "./data/camp";

/** A build, with every progress code it told on the way. */
function build(spec) {
  const watch = {};
  const told = [];
  const steps = generateWeekSteps(camp(spec), watch);
  let step = steps.next();
  while (!step.done) {
    if (watch.now) {
      told.push(watch.now);
    }
    step = steps.next();
  }
  return { result: step.value, told };
}

const ids = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

// GEN-8.6
describe("repair 3 (fillCell) moves a group's own session in to fill a cell", () => {
  // Two bunks, three days of three periods; a3 is once a week, and Bunk g0 owes a4 twice
  // though it may have it once (min over max). The greedy rounds leave a cell only a session moved from
  // elsewhere can fill without bending a weekly max.
  const spec = {
    groups: ids("g", 2).map((id) => group(id)),
    days: 3,
    blocks: [0, 1, 2].map((i) => block(i)),
    activities: [
      activity("a0", { max: 3 }),
      activity("a1", { max: 3 }),
      activity("a2", { max: 1, priority: "Low" }),
      activity("a3", { min: 1, max: 1 }),
      activity("a4", { min: 2, max: 1, atOnce: 2, eligible: ["g0"] })
    ]
  };

  it("says it moved a session in, and the week bends no more weekly maximums than that leaves", () => {
    const { result, told } = build(spec);
    expect(result.ok).toBe(true);
    expect(told.some((n) => n.code === "shift" || n.code === "full")).toBe(
      true
    );
    expect(result.openCells).toEqual([]);
    // Without the move, never-blank has to bend a third weekly max here.
    expect(result.flags.length).toBe(2);
  });
});

// GEN-8.12
describe("the search never fills a cell by leaving a group short of a weekly minimum", () => {
  // One period on two days. Swim fits one bunk at a time; both bunks need it once, and only g1
  // may do Tennis (also needed once). Bunk g0's other day could take Swim only if g1 gave up
  // its one Swim, so it stays Open and nobody is short.
  const spec = {
    groups: ids("g", 2).map((id) => group(id)),
    days: 2,
    blocks: [block(0)],
    activities: [
      activity("swim", { min: 1, max: 3, priority: "Low" }),
      activity("tennis", {
        min: 1,
        max: 3,
        priority: "Low",
        eligible: ["g1"]
      })
    ]
  };

  it("keeps the cell Open, says filling it costs a minimum, and leaves no one short", () => {
    const { result } = build(spec);
    expect(result.ok).toBe(true);
    expect(result.stillNeeded).toEqual([]);
    expect(result.openCells.map((c) => [c.groupId, c.why])).toEqual([
      ["g0", "minCost"]
    ]);
  });
});

// GEN-8.18
describe("the search's second pass rearranges a day so fewer groups are short", () => {
  // Three bunks, one period on two days; Swim takes two bunks at once and each needs it twice.
  // Four seats for six sessions: one bunk must go without, and only one.
  const spec = {
    groups: ids("g", 3).map((id) => group(id)),
    days: 2,
    blocks: [block(0)],
    activities: [
      activity("swim", { min: 2, max: 3, atOnce: 2, priority: "Low" })
    ]
  };

  it("moves cells for a minimum, fills as many, and leaves one bunk short, not two", () => {
    const { result } = build(spec);
    expect(result.ok).toBe(true);
    expect(result.moved.some((m) => m.why === "minimum")).toBe(true);
    expect(result.openCells.length).toBe(2);
    expect(result.stillNeeded.length).toBe(1);
  });
});
