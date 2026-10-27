/**
 * What the build says it is doing (progress.js, engine care PR 6): a code and ids per protocol
 * step, for the progress screen to put in camp words. Watching never changes the week, the same
 * camp says the same things in the same order, and the ids name the camp's own records. And the
 * run's work ceiling (RUN_WORK): past it the week is finished as it stands, the same way every time.
 */
import { BUDGET, NOW, generateWeek, generateWeekSteps } from "c/shoreshEngine";
import { activity, block, camp, group } from "./data/camp";
import { problems } from "./data/check";
import { randomCamp, withHistory } from "./data/randomCamp";

/** Every step's watch.now, as it was at that step (a copy), and the result. */
function watched(input, runWork) {
  const watch = {};
  const steps =
    runWork === undefined
      ? generateWeekSteps(input, watch)
      : generateWeekSteps(input, watch, runWork);
  const told = [];
  let step = steps.next();
  while (!step.done) {
    told.push(watch.now ? { ...watch.now } : null);
    step = steps.next();
  }
  return { told, result: step.value };
}

const groups = Array.from({ length: 12 }, (_, i) =>
  group(`g${String(i).padStart(2, "0")}`, { division: `div${i % 3}` })
);
const blocks = Array.from({ length: 8 }, (_, i) => block(i));

// Ten activities owed four times a week each (40 sessions in 35 cells): built twice.
const overfullSpec = {
  groups,
  days: 5,
  blocks,
  activities: Array.from({ length: 10 }, (_, i) =>
    activity(`a${i}`, {
      min: 4,
      max: 4,
      atOnce: 1,
      priority: i % 2 ? "Low" : "High"
    })
  ),
  fixed: [{ id: "lunch", name: "Lunch", block: "b4" }]
};
const overfull = camp(overfullSpec);

const STEP_OF = {
  [NOW.READ]: 1,
  [NOW.FIXED]: 2,
  [NOW.OPTIONS]: 3,
  [NOW.PLACE]: [4, 8],
  [NOW.FILL]: 8,
  [NOW.SHORT]: 8,
  [NOW.FULL]: 8,
  [NOW.MOVE]: 8,
  [NOW.SHIFT]: 8,
  [NOW.BLANK]: 7,
  [NOW.SEARCH]: 8,
  [NOW.SEARCH_DAY]: 8,
  [NOW.NEEDED]: 8,
  [NOW.ACROSS]: 8,
  [NOW.AGAIN]: 8,
  [NOW.IMPORTED]: 8
};

// What each code names (the rest are null).
const NAMES = {
  [NOW.READ]: [],
  [NOW.FIXED]: [],
  [NOW.OPTIONS]: ["date", "groupId", "blockId"],
  [NOW.PLACE]: ["date", "groupId", "blockId", "activityId"],
  [NOW.FILL]: ["date", "groupId", "blockId"],
  [NOW.SHORT]: ["groupId", "activityId"],
  [NOW.FULL]: ["date", "groupId", "blockId", "activityId", "toActivityId"],
  [NOW.MOVE]: ["date", "groupId", "blockId", "activityId", "toActivityId"],
  [NOW.SHIFT]: ["date", "groupId", "blockId", "activityId"],
  [NOW.BLANK]: ["date", "groupId", "blockId"],
  [NOW.SEARCH]: ["date", "groupId", "blockId"],
  [NOW.SEARCH_DAY]: ["date"],
  [NOW.NEEDED]: ["date"],
  [NOW.ACROSS]: ["date", "groupId", "blockId", "activityId", "toActivityId"],
  [NOW.AGAIN]: [],
  [NOW.IMPORTED]: []
};
const FIELDS = ["date", "groupId", "blockId", "activityId", "toActivityId"];

/** Problems with one told record against the camp it was built from. */
function badNow(now, input) {
  const ids = {
    date: new Set(input.days.map((d) => d.dateValue)),
    groupId: new Set(input.groups.map((g) => g.Id)),
    blockId: new Set(input.days.flatMap((d) => d.blocks.map((b) => b.id))),
    activityId: new Set(input.activities.map((a) => a.Id)),
    toActivityId: new Set(input.activities.map((a) => a.Id))
  };
  if (!(now.code in NAMES)) {
    return `unknown code ${now.code}`;
  }
  const steps = [].concat(STEP_OF[now.code]);
  if (!steps.includes(now.step)) {
    return `${now.code} at step ${now.step}`;
  }
  for (const field of FIELDS) {
    const named = NAMES[now.code].includes(field);
    if (named && !ids[field].has(now[field])) {
      return `${now.code}: ${field} ${now[field]} is not in the camp`;
    }
    if (!named && now[field] != null) {
      return `${now.code}: ${field} should be empty`;
    }
  }
  return null;
}

describe("what the build says it is doing", () => {
  it("says each protocol step in order, with ids from the camp, and never changes the week", () => {
    const { told, result } = watched(overfull);
    expect(result).toEqual(generateWeek(overfull));
    const codes = told.map((now) => now && now.code);
    // Every step is told something.
    expect(codes.every(Boolean)).toBe(true);
    for (const now of told) {
      expect(badNow(now, overfull)).toBeNull();
    }
    // The first build, step by step: setup, what's fixed, each cell's options and placements,
    // the repairs, then the search; then the second, stricter build.
    const first = (code) => codes.indexOf(code);
    expect(first(NOW.READ)).toBe(0);
    // (This week's rounds place everything in one go, the scarce activities' matching, so
    // there is no cell-by-cell step to tell; the next test has those.)
    const order = [
      NOW.READ,
      NOW.FIXED,
      NOW.FILL,
      NOW.SHORT,
      NOW.SEARCH_DAY,
      NOW.AGAIN
    ];
    order.forEach((code) => expect(first(code)).toBeGreaterThanOrEqual(0));
    for (let i = 1; i < order.length; i++) {
      expect(first(order[i])).toBeGreaterThan(first(order[i - 1]));
    }
    // The second build starts again from what's fixed.
    expect(codes.indexOf(NOW.FIXED, first(NOW.AGAIN))).toBeGreaterThan(
      first(NOW.AGAIN)
    );
  });

  it("says each cell's options, then what it placed there, cell by cell", () => {
    const input = camp(randomCamp(7));
    const { told } = watched(input);
    const codes = told.map((now) => now.code);
    expect(codes.slice(0, 3)).toEqual([NOW.READ, NOW.FIXED, NOW.FIXED]);
    const options = codes.indexOf(NOW.OPTIONS);
    expect(options).toBeGreaterThan(0);
    // A placement follows the options for the same cell.
    const place = codes.indexOf(NOW.PLACE, options);
    const cell = (now) => [now.date, now.groupId, now.blockId];
    expect(cell(told[place])).toEqual(cell(told[place - 1]));
    expect(told[place - 1].code).toBe(NOW.OPTIONS);
    for (const now of told) {
      expect(badNow(now, input)).toBeNull();
    }
  });

  it("says the same things in the same order every time", () => {
    const a = watched(overfull).told;
    const b = watched(camp(overfullSpec)).told;
    expect(a).toEqual(b);
  });

  it("says every kind of step somewhere across many camps, each naming the camp's own records", () => {
    const seen = new Set();
    // Moves by the repairs are rare: camps where they happen (seeds 86 and 266; 163, with its
    // history, says a place is full, since rule 9.10's settings order, 2026-10-27).
    const inputs = [
      ...Array.from({ length: 60 }, (_, i) =>
        camp(withHistory(randomCamp(i + 1), i + 1))
      ),
      ...[86, 163, 266].flatMap((seed) => [
        camp(randomCamp(seed)),
        camp(withHistory(randomCamp(seed), seed))
      ])
    ];
    for (const input of inputs) {
      const { told, result } = watched(input);
      // Watching changes nothing.
      expect(JSON.stringify(result)).toBe(JSON.stringify(generateWeek(input)));
      const said = told.filter(Boolean);
      expect(said.map((now) => badNow(now, input)).filter(Boolean)).toEqual([]);
      said.forEach((now) => seen.add(now.code));
    }
    for (const code of [
      NOW.READ,
      NOW.FIXED,
      NOW.OPTIONS,
      NOW.PLACE,
      NOW.FILL,
      NOW.SHORT,
      NOW.FULL,
      NOW.MOVE,
      NOW.SHIFT,
      NOW.BLANK,
      NOW.SEARCH,
      NOW.SEARCH_DAY,
      NOW.NEEDED,
      NOW.AGAIN
    ]) {
      expect([code, seen.has(code)]).toEqual([code, true]);
    }
  });

  it("says a move only as the search made it: each one is in the week's moved list", () => {
    let moves = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const input = camp(withHistory(randomCamp(seed), seed));
      const { told, result } = watched(input);
      // Built once: the moved list is that build's.
      if (!result.ok || told.some((now) => now && now.code === NOW.AGAIN)) {
        continue;
      }
      const said = told.filter((now) => now && now.code === NOW.MOVE);
      moves += said.length;
      const unknown = said.filter(
        (now) =>
          !result.moved.some(
            (m) =>
              m.date === now.date &&
              m.groupId === now.groupId &&
              m.blockId === now.blockId &&
              m.from === now.activityId &&
              m.to === now.toActivityId
          )
      );
      expect(unknown).toEqual([]);
    }
    expect(moves).toBeGreaterThan(0);
  });

  it("says nothing for a setup that can't be built", () => {
    const none = camp({ ...overfullSpec, activities: [] });
    const { told, result } = watched(none);
    expect(result.ok).toBe(false);
    expect(told).toEqual([]);
  });
});

describe("the run's work ceiling", () => {
  it("finishes the week as it stands once the work is spent: nothing blank, the same every time", () => {
    const full = generateWeek(overfull);
    const runWork = Math.floor(full.ruleChecks / 4);
    const { result } = watched(overfull, runWork);
    const again = watched(camp(overfullSpec), runWork).result;
    expect(result).toEqual(again);
    expect(result.ok).toBe(true);
    // Stopped early: far less work than the whole build.
    expect(result.ruleChecks).toBeLessThan(full.ruleChecks / 2);
    // Every rule still kept, nothing left blank that a group could have.
    expect(problems(overfullSpec, overfull, result)).toEqual([]);
  });

  it("says a cell it stopped on couldn't be finished, never that it was proven", () => {
    // A camp whose search leaves cells Open when stopped early.
    const spec = randomCamp(5);
    const input = camp(spec);
    const runWork = Math.floor(generateWeek(input).ruleChecks / 4);
    const { result } = watched(input, runWork);
    expect(problems(spec, input, result)).toEqual([]);
    const budget = result.openCells.filter((c) => c.why === BUDGET);
    expect(budget.length).toBeGreaterThan(0);
    budget.forEach((c) =>
      expect(c.reason).toBe(
        "Shoresh couldn't finish checking every way to fill this"
      )
    );
  });

  it("gives a second build only the work the first left over", () => {
    // Built twice (the stricter second build). With no work at all, each build does only what
    // is never stopped (placing by priority, never-blank): that much is the floor.
    const floor = watched(overfull, 1).result.ruleChecks;
    const runWork = Math.floor(generateWeek(overfull).ruleChecks / 4);
    const { told, result } = watched(overfull, runWork);
    expect(told.some((now) => now && now.code === NOW.AGAIN)).toBe(true);
    // Both builds together stay within the one allowance (plus the floor, and at most one
    // step past it); had the second its own, it would be about twice that.
    expect(result.ruleChecks).toBeLessThanOrEqual(runWork + floor + 5000);
    expect(runWork).toBeGreaterThan(2 * (floor + 5000));
  });

  it("changes nothing for a camp well under it", () => {
    const input = camp(withHistory(randomCamp(3), 3));
    expect(watched(input, 1e12).result).toEqual(generateWeek(input));
  });
});
