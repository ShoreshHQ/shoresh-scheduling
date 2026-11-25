/**
 * Desktop differential: the same synthetic camps built by this engine and by the desktop's
 * (a vendored copy, jest/desktop-engine/README.md), compared by OUTCOME, never cell by cell:
 * sessions placed per group and activity, weekly minimums met, early-week goals met, cells left
 * empty, and cells this engine filled by bending a rule. The two engines draw ties differently,
 * so cells differ; outcomes are what a director would notice.
 *
 * It fails where Shoresh does worse than the desktop on the same camp (docs/engine/protocol.md,
 * "Desktop differential", D.1-D.5): a cell neither filled nor reported Open, more groups short of
 * a weekly minimum, more cells left Open, or more early-week goals short in all. A camp known to
 * fall short, and why, is listed below. Expected and allowed: where the desktop leaves a cell
 * empty (UNFILLABLE), this engine fills it by going over a weekly max (never-blank, step 7).
 * Set DESKTOP_DIFF_REPORT=<file> to write the full table as JSON (jest/desktop-report.js).
 *
 * Only what both engines share is drawn: no overlapping blocks, other programs, same-division
 * activities, locks, electives or special days (each engine's own tests cover those).
 */
import { generateWeek } from "c/shoreshEngine";
import buildSchedule from "shoresh-jest/desktop-engine/engine/buildSchedule";
import { isActivityEligibleForGroup } from "shoresh-jest/desktop-engine/engine/eligibility";
import { writeDesktopReport } from "shoresh-jest/desktop-report";
import { camp, cellsOf } from "./data/camp";
import { sharedCamp } from "./data/sharedCamp";
import { sampled } from "shoresh-jest/sample";

// CI builds the first 100; the full run all 400 (jest/sample.js).
const SEEDS = sampled(400, 100);
const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

// Camps where this engine meets fewer weekly minimums than the desktop (D.3), and why
// (docs/engine/protocol.md, "Desktop differential"). Both are past CI's first 100.
const KNOWN_FEWER_MINIMUMS = {
  234: "short by 28 against 27 in a full week, different pairs short; no chain of 4 moves finds one",
  343: "one minimum short more at the same Open cells: its 2-at-a-time place is used in all 20 of its times"
};
// Camps where this engine leaves more cells Open than the desktop leaves empty (D.4): none.
const KNOWN_MORE_OPEN = {};
// Early-week goals short in all, this engine's over the desktop's, on camps both read the same
// (D.5). The two draw ties differently, so single camps differ either way: on CI's first 100 this
// engine is 3 over (128 against 125), on all 400 it is 32 under (475 against 507), each pinned. Lower
// it, never raise it, unless the protocol says why.
const EARLY_MARGIN = sampled(-32, 3);

/** The same camp in the desktop's shapes (buildSchedule's legacy single-cohort input). */
function desktopInput(spec) {
  const pod = (b) => (b.partOfDay === "Afternoon" ? "afternoon" : "morning");
  const availability = {
    AllDay: "all",
    MorningOnly: "morning",
    AfternoonOnly: "afternoon"
  };
  const divisionOf = new Set(spec.groups.map((g) => g.division));
  return {
    groups: spec.groups.map((g) => ({
      id: g.id,
      name: g.name,
      tier_id: g.division,
      availability: availability[g.availability]
    })),
    tiers: [...divisionOf].map((id) => ({ id, name: id })),
    days: Array.from({ length: spec.days }, (_, i) => ({
      id: `d${i}`,
      label: WEEKDAY_NAMES[i],
      day_of_week: i + 1,
      sort_order: i
    })),
    timeBlocks: spec.blocks.map((b, i) => ({
      id: b.id,
      name: b.name,
      start_time: b.startTime,
      end_time: b.endTime,
      sort_order: i,
      part_of_day: pod(b)
    })),
    activities: spec.activities.map((a) => ({
      id: a.id,
      name: a.name,
      priority: a.priority === "High" ? "high" : "low",
      min_per_week: a.min,
      max_per_week: a.max,
      span_blocks: a.span,
      max_groups_per_slot: a.atOnce == null ? null : a.atOnce,
      location_id: a.location,
      same_tier_only: false,
      eligible_group_ids: a.eligible.filter((t) => !divisionOf.has(t)),
      eligible_tier_ids: a.eligible.filter((t) => divisionOf.has(t)),
      // This engine's "by Tuesday" counts Tuesday; the desktop's "before Wednesday" means the same.
      prefer_before_day: a.early
        ? WEEKDAY_NAMES.indexOf(a.early.day) + 2
        : null,
      prefer_before_day_min: a.early ? a.early.count : null
    })),
    locations: spec.locations.map((l) => ({
      id: l.id,
      name: l.id,
      capacity: l.fit
    })),
    fixedEvents: spec.fixed.map((f) => ({
      id: f.id,
      name: f.name,
      unit_id: null,
      is_all_groups: true,
      group_ids: [],
      day_id: null,
      time_block_id: f.block,
      span_blocks: 1
    })),
    campId: spec.programId,
    replacedDayIds: []
  };
}

/** Whether a group is at camp for a block (both engines read availability the same way). */
const atCamp = (g, b) =>
  g.availability === "AllDay" ||
  (g.availability === "MorningOnly") === (b.partOfDay === "Morning");

/** Cells either engine may fill: at camp and not the fixed activity's block. */
function cellsToFill(spec) {
  let n = 0;
  for (const g of spec.groups) {
    for (const b of spec.blocks) {
      if (atCamp(g, b) && !spec.fixed.some((f) => f.block === b.id)) {
        n += spec.days;
      }
    }
  }
  return n;
}

const eligible = (a, g) =>
  !a.eligible.length ||
  a.eligible.includes(g.id) ||
  a.eligible.includes(g.division);

function salesforceOutcome(spec) {
  const result = generateWeek(camp(spec));
  if (!result.ok) {
    return { error: result.error };
  }
  const counts = new Map();
  let filled = 0;
  cellsOf(result.days).forEach((byGroup) => {
    for (const [groupId, row] of Object.entries(byGroup)) {
      for (const cell of row) {
        if (cell && cell.kind === "A") {
          filled++;
          if (cell.head) {
            const k = `${groupId}|${cell.id}`;
            counts.set(k, (counts.get(k) || 0) + 1);
          }
        }
      }
    }
  });
  const bends = {};
  for (const f of result.flags) {
    for (const rule of f.bends) {
      bends[rule] = (bends[rule] || 0) + 1;
    }
  }
  return {
    counts,
    filled,
    empty: result.openCells.length,
    bentCells: result.flags.length,
    bends,
    minimumsShort: result.stillNeededBy.length,
    earlyShort: result.spreadBy.length,
    // Open cells left on purpose so another group gets a minimum (the last resort), and where
    // the search ran out of work.
    traded: result.openCells.filter((c) => c.why === "trade").length,
    // Of those, the ones the minimum repair (step 8, part 1) left, not a move of the search.
    tradedByRepair: result.openCells.filter(
      (c) =>
        c.why === "trade" &&
        !result.moved.some(
          (m) =>
            m.to == null &&
            m.date === c.date &&
            m.groupId === c.groupId &&
            m.blockId === c.blockId
        )
    ).length,
    outOfWork: result.openCells.filter((c) => c.why === "budget").length
  };
}

function desktopOutcome(spec) {
  const { slots, findings } = buildSchedule(desktopInput(spec));
  const counts = new Map();
  let filled = 0;
  let empty = 0;
  for (const s of slots) {
    if (s.type === "activity" && s.activityId) {
      filled++;
      if (s.is_span_head) {
        const k = `${s.groupId}|${s.activityId}`;
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    } else if (s.flags && s.flags.UNFILLABLE) {
      empty++;
    }
  }
  return {
    counts,
    filled,
    empty,
    minimumsShort: findings.filter((f) => f.kind === "UNDERSERVED").length,
    earlyShort: findings.filter((f) => f.kind === "DISTRIBUTION").length
  };
}

/** One camp's comparison, as a row of data. */
function compare(seed) {
  const spec = sharedCamp(seed);
  const sf = salesforceOutcome(spec);
  const row = { seed, cells: cellsToFill(spec) };
  let desk;
  try {
    desk = desktopOutcome(spec);
  } catch (e) {
    return { ...row, desktopError: String(e) };
  }
  if (sf.error) {
    return { ...row, sfError: sf.error };
  }
  // Who each activity is for, as the desktop reads the translated camp: the same as here, or the
  // comparison is of two different camps.
  const input = desktopInput(spec);
  for (const g of input.groups) {
    for (const a of input.activities) {
      const here = eligible(
        spec.activities.find((x) => x.id === a.id),
        spec.groups.find((x) => x.id === g.id)
      );
      if (isActivityEligibleForGroup(a, g) !== here) {
        row.readDifferently = (row.readDifferently || 0) + 1;
      }
    }
  }
  // Groups and activities whose session counts differ, beyond what a bend explains.
  let pairsDiffer = 0;
  let pairsOverMaxSf = 0;
  for (const g of spec.groups) {
    for (const a of spec.activities) {
      const k = `${g.id}|${a.id}`;
      const s = sf.counts.get(k) || 0;
      const d = desk.counts.get(k) || 0;
      if (s !== d) {
        pairsDiffer++;
      }
      if (a.max != null && s > a.max) {
        pairsOverMaxSf++;
      }
    }
  }
  return {
    ...row,
    sf: {
      filled: sf.filled,
      empty: sf.empty,
      bentCells: sf.bentCells,
      bends: sf.bends,
      minimumsShort: sf.minimumsShort,
      earlyShort: sf.earlyShort,
      traded: sf.traded,
      tradedByRepair: sf.tradedByRepair,
      outOfWork: sf.outOfWork
    },
    desktop: {
      filled: desk.filled,
      empty: desk.empty,
      minimumsShort: desk.minimumsShort,
      earlyShort: desk.earlyShort
    },
    pairsDiffer,
    pairsOverMaxSf,
    // An early-week goal whose desktop target day ("before Thursday" for "by Wednesday") isn't in
    // the week: the desktop drops that goal; this engine still counts it if any day by then is.
    earlyTargetMissing: spec.activities.some(
      (a) => a.early && WEEKDAY_NAMES.indexOf(a.early.day) + 1 >= spec.days
    )
  };
}

/** Each camp's kind of difference, from the outcomes alone. */
function kindOf(row) {
  if (row.sfError || row.desktopError) {
    return "error";
  }
  const { sf, desktop } = row;
  const same =
    sf.empty === desktop.empty &&
    sf.minimumsShort === desktop.minimumsShort &&
    sf.bentCells === 0;
  if (same) {
    return "sameOutcome";
  }
  if (sf.minimumsShort > desktop.minimumsShort) {
    return "sfMeetsFewerMinimums";
  }
  if (sf.minimumsShort < desktop.minimumsShort) {
    return "sfMeetsMoreMinimums";
  }
  if (sf.empty > desktop.empty) {
    return "sfLeavesMoreEmpty";
  }
  // Expected: same minimums met; the desktop left cells empty, this engine filled them by
  // bending (never-blank).
  return "sameMinimumsSfFillsByBending";
}

/** How the early-week goals compare, kept apart: the two engines read a goal's day differently. */
function earlyKindOf(row) {
  const { sf, desktop } = row;
  if (sf.earlyShort === desktop.earlyShort) {
    return "same";
  }
  if (row.earlyTargetMissing) {
    // Likely the target-day reading above (the cause is assumed, not shown).
    return "differsTargetDayNotInWeek";
  }
  return sf.earlyShort > desktop.earlyShort
    ? "sfShortMore"
    : "desktopShortMore";
}

/** Camps that break a promise and aren't listed, and listed camps that no longer break it. */
const breaking = (rows, worse, known) => [
  ...rows
    .filter((r) => worse(r) && !(r.seed in known))
    .map((r) => `seed ${r.seed}: worse than the desktop`),
  ...rows
    .filter((r) => !worse(r) && r.seed in known)
    .map((r) => `seed ${r.seed}: listed, no longer worse: take it off`)
];

describe("desktop differential (outcomes on shared synthetic camps)", () => {
  const rows = [];
  // The camps both engines built (an error is reported by the first test, with its seed).
  const built = [];
  // Built inside the suite's hooks, so a crash names its test.
  beforeAll(() => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      rows.push(compare(seed));
    }
    built.push(...rows.filter((r) => r.sf));
  });

  it(`builds every camp in both engines (${SEEDS} seeds)`, () => {
    expect(rows.filter((r) => r.sfError || r.desktopError)).toEqual([]);
  });

  it("adds up: every cell to fill is filled or reported Open, in each engine (D.1)", () => {
    const bad = built.filter(
      (r) =>
        r.sf.filled + r.sf.empty !== r.cells ||
        r.desktop.filled + r.desktop.empty !== r.cells
    );
    expect(bad.map((r) => r.seed)).toEqual([]);
  });

  it("reads the camp the same way: each activity is for the same groups in both engines (D.2)", () => {
    expect(built.filter((r) => r.readDifferently).map((r) => r.seed)).toEqual(
      []
    );
  });

  it("never leaves more groups short of a weekly minimum than the desktop (D.3)", () => {
    const worse = (r) => r.sf.minimumsShort > r.desktop.minimumsShort;
    expect(breaking(built, worse, KNOWN_FEWER_MINIMUMS)).toEqual([]);
  });

  it("never leaves more cells Open than the desktop leaves empty (D.4)", () => {
    const worse = (r) => r.sf.empty > r.desktop.empty;
    expect(breaking(built, worse, KNOWN_MORE_OPEN)).toEqual([]);
  });

  it("leaves no more early-week goals short in all than the desktop, past a pinned margin (D.5)", () => {
    // Only camps whose every goal day is in the week: elsewhere the desktop drops the goal.
    const same = built.filter((r) => !r.earlyTargetMissing);
    const total = (side) => same.reduce((n, r) => n + r[side].earlyShort, 0);
    expect(total("sf") - total("desktop")).toBeLessThanOrEqual(EARLY_MARGIN);
  });

  afterAll(() => {
    const summary = {};
    for (const r of built) {
      const k = kindOf(r);
      summary[k] = (summary[k] || 0) + 1;
    }
    const early = {};
    for (const r of built) {
      const k = earlyKindOf(r);
      early[k] = (early[k] || 0) + 1;
    }
    const bends = {};
    for (const r of built) {
      for (const [rule, n] of Object.entries(r.sf.bends)) {
        bends[rule] = (bends[rule] || 0) + n;
      }
    }
    const total = (side, field) =>
      built.reduce((n, r) => n + r[side][field], 0);
    const report = {
      camps: built.length,
      kinds: summary,
      earlyWeek: early,
      totals: {
        cells: built.reduce((n, r) => n + r.cells, 0),
        sfEmpty: total("sf", "empty"),
        desktopEmpty: total("desktop", "empty"),
        sfBentCells: total("sf", "bentCells"),
        sfBendsByRule: bends,
        sfMinimumsShort: total("sf", "minimumsShort"),
        desktopMinimumsShort: total("desktop", "minimumsShort"),
        sfEarlyShort: total("sf", "earlyShort"),
        sfTraded: total("sf", "traded"),
        sfTradedByRepair: total("sf", "tradedByRepair"),
        sfOutOfWork: total("sf", "outOfWork"),
        desktopEarlyShort: total("desktop", "earlyShort"),
        campsWithDifferentCounts: built.filter((r) => r.pairsDiffer > 0).length
      },
      // The camps worth a look: this engine met fewer goals or left more empty than the desktop.
      worthALook: rows
        .filter(
          (r) =>
            r.sf &&
            (["sfMeetsFewerMinimums", "sfLeavesMoreEmpty"].includes(
              kindOf(r)
            ) ||
              earlyKindOf(r) === "sfShortMore")
        )
        .map((r) => ({
          seed: r.seed,
          kind: kindOf(r),
          early: earlyKindOf(r),
          sf: r.sf,
          desktop: r.desktop
        }))
    };
    writeDesktopReport(
      `Desktop differential: ${JSON.stringify(report.kinds)}, early week ${JSON.stringify(report.earlyWeek)}`,
      { ...report, rows }
    );
  });
});

it("the desktop engine's own input checks are on: a wrong translation fails, not compares (D.2)", () => {
  const input = desktopInput(sharedCamp(1));
  const [first, ...rest] = input.activities;
  // An id list sent as text, the mistake the desktop's check exists for.
  const broken = {
    ...input,
    activities: [
      { ...first, eligible_group_ids: JSON.stringify(["g0"]) },
      ...rest
    ]
  };
  expect(() => buildSchedule(broken)).toThrow(/non-array eligible_group_ids/);
});
