/**
 * Desktop differential: the same synthetic camps built by this engine and by the desktop's
 * (a vendored copy, jest/desktop-engine/README.md), compared by OUTCOME, never cell by cell:
 * sessions placed per group and activity, weekly minimums met, early-week goals met, cells left
 * empty, and cells this engine filled by bending a rule. The two engines draw ties differently,
 * so cells differ; outcomes are what a director would notice.
 *
 * Differences are reported as data, not failures (docs/engine/protocol.md, "Desktop
 * differential"). The expected one: where the desktop leaves a cell empty (UNFILLABLE), this
 * engine fills it by bending a rule (never-blank, step 7). The test fails only if a camp can't be
 * built by either engine, or if the comparison itself is broken (counts that don't add up).
 * Set DESKTOP_DIFF_REPORT=<file> to write the full table as JSON (jest/desktop-report.js).
 *
 * Only what both engines share is drawn: no overlapping blocks, other programs, same-division
 * activities, locks, electives or special days (each engine's own tests cover those).
 */
import { generateWeek } from "c/shoreshEngine";
import buildSchedule from "shoresh-jest/desktop-engine/engine/buildSchedule";
import { writeDesktopReport } from "shoresh-jest/desktop-report";
import { camp, cellsOf } from "./data/camp";
import { sharedCamp } from "./data/sharedCamp";
import { sampled } from "shoresh-jest/sample";

// CI builds the first 100; the full run all 400 (jest/sample.js).
const SEEDS = sampled(400, 100);
const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

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
    earlyShort: result.spreadBy.length
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
      if (!eligible(a, g) && d > 0) {
        row.desktopIneligible = (row.desktopIneligible || 0) + 1;
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
      earlyShort: sf.earlyShort
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

describe("desktop differential (outcomes on shared synthetic camps)", () => {
  const rows = [];
  // The camps both engines built (an error is reported by the first test, with its seed).
  const built = [];
  // Built inside the suite's hooks, so Jest's timeout applies and a crash names its test.
  beforeAll(() => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      rows.push(compare(seed));
    }
    built.push(...rows.filter((r) => r.sf));
  });

  it(`builds every camp in both engines (${SEEDS} seeds)`, () => {
    expect(rows.filter((r) => r.sfError || r.desktopError)).toEqual([]);
  });

  it("adds up: each engine's filled plus empty cells never exceed the cells to fill", () => {
    const bad = built.filter(
      (r) =>
        r.sf.filled + r.sf.empty > r.cells ||
        r.desktop.filled + r.desktop.empty > r.cells
    );
    expect(bad.map((r) => r.seed)).toEqual([]);
  });

  it("reports how the outcomes differ (data, not a pass or fail)", () => {
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
        desktopEarlyShort: total("desktop", "earlyShort"),
        campsWithDifferentCounts: built.filter((r) => r.pairsDiffer > 0).length
      },
      // The camps worth a look: this engine met fewer goals or left more empty than the desktop.
      worthALook: rows
        .filter(
          (r) =>
            ["sfMeetsFewerMinimums", "sfLeavesMoreEmpty"].includes(kindOf(r)) ||
            earlyKindOf(r) === "sfShortMore"
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
    expect(report.camps).toBe(rows.length);
  });
});
