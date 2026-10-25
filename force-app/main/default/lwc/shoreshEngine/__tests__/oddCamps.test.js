/**
 * The odd-camp library (engine care plan, PR 2) held to the settled rules: every camp in
 * data/oddCamps.js is built and checked by data/settledRules.js for hard limits, visible
 * problems and gaps, and built again (and from its records in reverse order) for the same week.
 *
 * Where today's engine breaks a settled rule, the break is a known failure: listed in
 * KNOWN_FAILURES with the later PR of the care plan that fixes it, run as test.failing (so CI
 * stays green, and goes red the day a fix lands without this list being updated), and every line
 * pinned exactly below, so a new break, or a changed one, fails.
 */
import { generateWeek } from "c/shoreshEngine";
import { cellsOf } from "./data/camp";
import { inputOf, ODD_CAMPS } from "./data/oddCamps";
import { settledRules } from "./data/settledRules";

const PR3 =
  "PR 3 (never-blank eligible-only, blank-as-1 flag, early-week calendar)";
const PR4 = "PR 4 (search before giving up, import as floor)";

/** camp name -> rule -> [the PR that fixes it, the exact lines today's engine gives]. */
const KNOWN_FAILURES = {
  "weekend-only week": {
    visible: [
      PR3,
      [
        "climb for g01: the week has no day by Tuesday, unsaid",
        "climb for g02: the week has no day by Tuesday, unsaid"
      ]
    ]
  },
  "Sunday-start week": {
    visible: [PR3, ["climb for g01: 0 short by Monday, listed 1"]]
  },
  "goal by Sunday": {
    visible: [PR3, ["climb for g01: 1 short by Sunday, listed 0"]]
  },
  "scarce places": {
    hardLimits: [
      PR3,
      [
        "2026-07-06 g01 b0: placeCapacity",
        "2026-07-06 g01 b1: placeCapacity",
        "2026-07-06 g04 b0: placeCapacity",
        "2026-07-06 g04 b1: placeCapacity"
      ]
    ],
    gapIsABug: [
      PR4,
      ["filled 4 cells within the hard limits; a week exists that fills 6"]
    ]
  },
  "eligible activities all full": {
    hardLimits: [
      PR3,
      ["2026-07-06 young b0: eligibility", "2026-07-06 young b1: eligibility"]
    ]
  },
  "blank groups at once": {
    hardLimits: [
      PR3,
      ["2026-07-06 g01 b0: groupsAtOnce", "2026-07-06 g02 b0: groupsAtOnce"]
    ],
    visible: [PR3, ["arts: a blank setup field, unsaid"]],
    gapIsABug: [
      PR3,
      ["filled 0 cells within the hard limits; a week exists that fills 1"]
    ]
  },
  "blank groups that fit": {
    hardLimits: [
      PR3,
      ["2026-07-06 g01 b0: placeCapacity", "2026-07-06 g02 b0: placeCapacity"]
    ],
    visible: [PR3, ["Field: a blank setup field, unsaid"]],
    gapIsABug: [
      PR3,
      ["filled 0 cells within the hard limits; a week exists that fills 1"]
    ]
  }
};

const RULES = {
  hardLimits:
    "never breaks a hard limit (who it's for, groups at once, groups that fit, divisions)",
  visible:
    "shows every problem: every bend flagged, every shortfall and blank setup listed",
  gapIsABug: "leaves no cell Open that something allowed could fill"
};

/**
 * The same camp with every list in reverse: records, locks, other programs, and within each day
 * its groups (with their rows) and its items (rows renumbered to match). Days and blocks keep
 * their order: that order is the week itself.
 */
function reversed(input) {
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    out[k] = Array.isArray(v) && k !== "days" ? [...v].reverse() : v;
  }
  out.days = input.days.map((day) => {
    const n = day.items.length;
    const renumber = (token) => {
      if (!token || token === "^") {
        return token;
      }
      return String(n + 1 - Number(token));
    };
    return {
      ...day,
      groups: [...day.groups].reverse(),
      items: [...day.items].reverse(),
      rows: [...day.rows]
        .reverse()
        .map((row) => String(row).split(",").map(renumber).join(","))
    };
  });
  return out;
}

/**
 * A week as what it says, whatever order the grid lists groups and items in: each day's cells
 * by group, and every list in the result (flags, lines, open cells) as a set.
 */
const asCells = (result) => {
  const out = {};
  for (const [k, v] of Object.entries(result)) {
    out[k] = Array.isArray(v)
      ? v.map((x) => JSON.stringify(x)).sort()
      : JSON.stringify(v);
  }
  out.days = cellsOf(result.days).map((day) =>
    Object.keys(day)
      .sort()
      .map((g) => [g, day[g]])
  );
  return JSON.stringify(out);
};

const built = new Map();
function check(c) {
  if (!built.has(c.name)) {
    const input = inputOf(c);
    const result = generateWeek(input);
    built.set(c.name, {
      input,
      result,
      found: settledRules(c, input, result, { exhaustive: c.small })
    });
  }
  return built.get(c.name);
}

describe.each(ODD_CAMPS.map((c) => [c.name, c]))("odd camp: %s", (name, c) => {
  it(`is a camp worth having: ${c.odd}`, () => {
    expect(check(c).result.ok).toBe(true);
  });

  it("builds the same week every time, whatever order its records arrive in", () => {
    const { result } = check(c);
    const again = JSON.stringify(generateWeek(inputOf(c)));
    expect(again).toBe(JSON.stringify(result));
    expect(asCells(generateWeek(reversed(inputOf(c))))).toBe(asCells(result));
  });

  for (const [rule, words] of Object.entries(RULES)) {
    const known = (KNOWN_FAILURES[name] || {})[rule];
    if (known) {
      it.failing(`${words} (known failure, fixed in ${known[0]})`, () => {
        expect(check(c).found[rule]).toEqual([]);
      });
      it(`breaks "${rule}" exactly as recorded until ${known[0].split(" (")[0]}`, () => {
        expect(check(c).found[rule]).toEqual(known[1]);
      });
    } else {
      it(`${words}`, () => {
        expect(check(c).found[rule]).toEqual([]);
      });
    }
  }
});

it("every known failure names a camp in the library and a rule checked", () => {
  for (const [name, rules] of Object.entries(KNOWN_FAILURES)) {
    expect(ODD_CAMPS.map((c) => c.name)).toContain(name);
    for (const rule of Object.keys(rules)) {
      expect(Object.keys(RULES)).toContain(rule);
    }
  }
});

describe("the settled-rules checker itself", () => {
  const c = ODD_CAMPS.find((x) => x.name === "one group");

  it("calls a cell the engine left blank a gap, when something could go there", () => {
    const input = inputOf(c);
    const result = generateWeek(input);
    // Empty the first cell of the week, as if the engine had left it Open.
    const day = result.days[0];
    const cells = day.rows[0].split(",");
    cells[0] = "";
    const planted = {
      ...result,
      days: [{ ...day, rows: [cells.join(",")] }, ...result.days.slice(1)],
      openCells: [
        { date: day.dateValue, groupId: "g01", blockId: "b0", reason: "x" }
      ]
    };
    const found = settledRules(c, input, planted, { exhaustive: true });
    expect(found.gapIsABug).toEqual([
      "2026-07-06 g01 b0 Open, but swim, arts, sports could go there",
      "filled 8 cells within the hard limits; a week exists that fills 9"
    ]);
  });
});
