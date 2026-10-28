/**
 * Protocol statements in steps 1, 4 and 10 (docs/engine/protocol.md) that had no test of their
 * own, each pinned on a small camp built for it: the camp is shaped so that breaking the rule
 * changes what it gets.
 */
import { NOW, generateWeek, generateWeekSteps, MODE } from "c/shoreshEngine";
import { activity, at, block, camp, cellsOf, group } from "./data/camp";

const run = (spec) => generateWeek(camp(spec));

// What the week holds when the rounds (steps 4-6) end: the first repair (weekRepair.js) is
// wrapped to call `afterRounds(st)` before it runs, changing nothing.
const hook = { afterRounds: null };
jest.mock("../weekRepair", () => {
  const actual = jest.requireActual("../weekRepair");
  return {
    ...actual,
    *repair(st, ...rest) {
      if (hook.afterRounds) {
        hook.afterRounds(st);
      }
      return yield* actual.repair(st, ...rest);
    }
  };
});

/** Which activity each of a group's cells holds, day by day: [[id or null per block]]. */
const rowOf = (result, groupId) =>
  cellsOf(result.days).map((day) =>
    (day[groupId] || []).map((c) => (c ? c.id : null))
  );

/** Every session of an activity: [{ day, groupId }], one per head cell. */
function sessionsOf(result, actId) {
  const out = [];
  cellsOf(result.days).forEach((day, d) => {
    for (const [groupId, row] of Object.entries(day)) {
      row.forEach((c) => {
        if (c && c.id === actId && c.head) {
          out.push({ day: d, groupId });
        }
      });
    }
  });
  return out;
}

describe("step 1: reading setup", () => {
  // GEN-1.7
  it('"No group limit" means no limit: every group takes it in the same period', () => {
    const groups = ["g1", "g2", "g3", "g4"].map((id) => group(id));
    const result = run({
      groups,
      activities: [activity("gaga", { atOnce: null })]
    });
    for (const g of groups) {
      expect(at(result, 0, g.id, 0)).toBe("gaga");
    }
    expect(result.flags).toEqual([]);
  });

  // GEN-1.10: the validation rule EarlyWeekComplete refuses a half-filled goal on save
  // (ActivitiesAndLocationsTest.entriesThatMakeNoSenseAreRefused); if one reaches the engine
  // anyway, it is no goal at all, never a guessed day or count.
  describe("an early-week goal needs both a count and a weekday", () => {
    const spec = (early) => ({
      days: 3,
      option: 2,
      activities: [
        activity("swim", { min: 1, max: 1, early }),
        activity("arts", { max: 3 })
      ]
    });
    const none = run(spec(null));

    it("the camp is one where a by-Monday goal moves Swim to Monday", () => {
      expect(rowOf(none, "g1")[0][0]).not.toBe("swim");
      expect(rowOf(run(spec({ count: 1, day: "Monday" })), "g1")[0][0]).toBe(
        "swim"
      );
    });

    it("a count with no weekday is no goal", () => {
      expect(run(spec({ count: 1, day: null })).days).toEqual(none.days);
    });

    it("a weekday with no count is no goal", () => {
      expect(run(spec({ count: null, day: "Monday" })).days).toEqual(none.days);
    });
  });
});

describe("step 4: placing by priority", () => {
  // GEN-4.2
  it("multi-block activities go longest first: the three-block one gets the morning's run", () => {
    // Four blocks hold a three-block session or a two-block one, not both. Two blocks is
    // listed first, so only longest-first gives the run to three blocks when the rounds end.
    const counts = [];
    hook.afterRounds = (st) =>
      counts.push([st.getCount("g1", "trip"), st.getCount("g1", "hike")]);
    try {
      run({
        blocks: [0, 1, 2, 3].map((i) => block(i)),
        activities: [
          activity("hike", { min: 1, max: 1, span: 2 }),
          activity("trip", { min: 1, max: 1, span: 3 })
        ]
      });
    } finally {
      hook.afterRounds = null;
    }
    expect(counts[0]).toEqual([1, 0]);
  });

  // GEN-4.2
  it("groups take turns: with room for two sessions, each of two groups gets one", () => {
    // One two-block activity, one group at a time, two days of two blocks: two sessions fit
    // in the week. Each group's minimum is 2, so group by group would give g1 both. (Later
    // repairs may then hand both to one group, leaving fewer groups short: 8.3.)
    const counts = [];
    hook.afterRounds = (st) =>
      counts.push(["g1", "g2"].map((g) => st.getCount(g, "canoe")));
    try {
      run({
        groups: [group("g1"), group("g2")],
        days: 2,
        blocks: [block(0), block(1)],
        activities: [activity("canoe", { min: 2, max: 2, span: 2, atOnce: 1 })]
      });
    } finally {
      hook.afterRounds = null;
    }
    expect(counts[0]).toEqual([1, 1]);
  });

  // GEN-4.3
  it("a multi-block session goes on the day holding fewest of it so far", () => {
    const groups = ["g1", "g2", "g3"].map((id) => group(id));
    for (const option of [1, 2, 3, 4, 5]) {
      const result = run({
        groups,
        days: 3,
        option,
        blocks: [block(0), block(1)],
        activities: [
          activity("lake", { min: 1, max: 1, span: 2, atOnce: null }),
          activity("arts", { priority: "Low", atOnce: null }),
          activity("golf", { priority: "Low", atOnce: null })
        ]
      });
      const days = sessionsOf(result, "lake").map((x) => x.day);
      expect(days.sort()).toEqual([0, 1, 2]);
    }
  });

  // GEN-4.5
  it("the cell with fewest choices is placed first", () => {
    // g2 can only do Swim; g1 can do Swim or Arts. One group at a time each.
    const watch = {};
    const steps = generateWeekSteps(
      camp({
        groups: [group("g1"), group("g2")],
        activities: [
          activity("swim", { atOnce: 1 }),
          activity("arts", { atOnce: 1, eligible: ["g1"] })
        ]
      }),
      watch
    );
    const placed = [];
    for (let s = steps.next(); !s.done; s = steps.next()) {
      const now = watch.now;
      if (now && now.code === NOW.PLACE) {
        const last = placed[placed.length - 1];
        if (!last || last.groupId !== now.groupId) {
          placed.push({ groupId: now.groupId, activityId: now.activityId });
        }
      }
    }
    expect(placed[0]).toEqual({ groupId: "g2", activityId: "swim" });
  });

  // GEN-4.5
  it("a cell takes the activity that keeps the early goal before any other", () => {
    for (const option of [1, 2, 3, 4, 5, 6]) {
      const result = run({
        days: 2,
        option,
        activities: [
          activity("arts", { max: 1 }),
          activity("swim", { max: 1, early: { count: 1, day: "Monday" } })
        ]
      });
      expect(rowOf(result, "g1")).toEqual([["swim"], ["arts"]]);
    }
  });

  // GEN-4.5
  it("then the activity the group has had least: three days, three activities, each once", () => {
    for (const option of [1, 2, 3, 4, 5, 6]) {
      const result = run({
        days: 3,
        option,
        activities: ["arts", "swim", "golf"].map((id) =>
          activity(id, { max: 3 })
        )
      });
      const got = rowOf(result, "g1").map((row) => row[0]);
      expect(got.sort()).toEqual(["arts", "golf", "swim"]);
    }
  });
});

describe("step 10: Rebuild keeps the week", () => {
  // GEN-10.4: Swim is in the week on each of three days; setup now says once a week.
  const rebuild = (activities) => {
    const input = camp({
      days: 3,
      activities,
      cells: [0, 1, 2].map((day) => ({
        day,
        group: "g1",
        block: "b0",
        act: "swim"
      }))
    });
    return generateWeek({ ...input, mode: MODE.KEEP });
  };

  it("a session over the weekly max is emptied, latest first, when another activity fits bending nothing", () => {
    const result = rebuild([activity("swim", { max: 1 }), activity("arts")]);
    expect(
      result.keep.emptied.map((e) => [e.date, e.activityId, e.why])
    ).toEqual([
      ["2026-07-08", "swim", "weeklyMax"],
      ["2026-07-07", "swim", "weeklyMax"]
    ]);
    expect(rowOf(result, "g1")[0]).toEqual(["swim"]);
    expect(sessionsOf(result, "swim")).toHaveLength(1);
  });

  it("stays, dotted, when nothing else fits its cell without a bend", () => {
    const alone = rebuild([activity("swim", { max: 1 })]);
    expect(alone.keep.emptied).toEqual([]);
    expect(rowOf(alone, "g1")).toEqual([["swim"], ["swim"], ["swim"]]);
    expect(alone.flags.length).toBeGreaterThan(0);
  });
});
