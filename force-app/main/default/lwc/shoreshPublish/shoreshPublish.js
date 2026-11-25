/**
 * Publish's words, for any schedule that publishes (Manual Build and Generated Schedule):
 * what to ask before publishing, from the server's preview (SchedulePublish.Preview) and the
 * week's checks (c/shoreshEngine checkWeek, as the counters show them). Problems are shown, never
 * a reason to refuse: a week with Open cells or dots can still be published (Greg, Manual Build
 * round 1 #2 to #4: never blocked). It uses the counters' own words, the same on both screens
 * (PUB-6.2, CORE-6.5): "7 of 10 placed", Conflicts (CORE-1.29), Still needed, Spread across the week.
 *
 * Each count is followed by what it counts, named as the Why list names it (PUB-6.4), and a special
 * day on the week with bunks it plans nothing for is named too (PUB-6.5); a line naming a cell, an
 * activity or a special day takes the director there ({ text, go }, c-shoresh-ask).
 *
 * publishQuestion returns one of:
 *   { kind: "same" }: the published schedule already is the week; nothing to do.
 *   { kind: "now" }: the week's first publish, with nothing to show; publish at once.
 *   { kind: "ask", heading, lines, confirmLabel }: for c-shoresh-ask. A line is its words, or
 *   { text, go, sub } for one under a count (sub) or one that goes somewhere (go: { line } for a
 *   cell, as the Why list's locate; { activityId }; { specialItemId }).
 */
import { readRow } from "c/shoreshSavedRow";
import { buildTerms, listed } from "c/shoreshTerms";
import { checkLines } from "c/shoreshWeekChecks";

// Under each count, at most this many of its lines; then "…and N more."
const NAMED = 5;

// The screen a published schedule was published from, by the Origin__c its copy records.
const SCREENS = { Manual: "Manual Build", Generated: "Generated Schedule" };

/**
 * The Published line's words before the date, on both screens (Greg, 2026-10-19): "Published from
 * Manual Build " (a template drops the space after a word on its own). published: the server's
 * PublishState. One whose screen isn't known (published before Origin was kept) says "Published ".
 */
export function publishedWord(published) {
  const screen = published && SCREENS[published.origin];
  return screen ? `Published from ${screen} ` : "Published ";
}

/**
 * How much changes, in plain words: cells, then names (bunks and time blocks renamed), then time
 * blocks at new times, then special days and special events whose own schedules change (ADR 0014
 * slice 5), then days whose rain marks change with their cells the same (ADR 0019 choice 9), each
 * only when above 0: "2 cells change", "1 name changes", "1 cell and 1 name change", "1 special
 * day changes", "1 rainy day changes". A rename is never counted as a cell.
 */
function changeWords(preview, t) {
  const renames = preview.renameCount || 0;
  const retimes = preview.retimeCount || 0;
  const specialDays = preview.specialDayCount || 0;
  const events = preview.eventCount || 0;
  const rainDays = preview.rainDayCount || 0;
  const parts = [
    [
      preview.changeCount - renames - retimes - specialDays - events - rainDays,
      "cell",
      "cells"
    ],
    [renames, "name", "names"],
    [retimes, t.sIn("TimeBlock"), t.pIn("TimeBlock")],
    [specialDays, t.sIn("SpecialDay"), t.pIn("SpecialDay")],
    [events, t.sIn("SpecialEvent"), t.pIn("SpecialEvent")],
    [rainDays, "rainy day", "rainy days"]
  ]
    .filter(([count]) => count > 0)
    .map(([count, one, many]) => `${count} ${count === 1 ? one : many}`);
  const single = parts.length === 1 && parts[0].startsWith("1 ");
  return `${listed(parts)} ${single ? "changes" : "change"}`;
}

/**
 * What is still to do: "N of M placed" while cells are still Open, then what the Why list shows; without
 * the list, the counters instead (each line only when it is above 0). counts: what the counters count now
 * (c-shoresh-week-checks counts: lines the director accepted aside), when the screen has them.
 * measure: the week's measure as the Why list (c-shoresh-week-checks) shows it, counted as its
 * headings count, accepted or not ("5 under", "2 over", "4 to look at", "1 note"). Without it, the placements the check flags are
 * ("2 activities need a look."). t: the camp's words (c/shoreshTerms). named: the lines to list
 * under each count, by kind (open, short, over, look, note), when the question names them.
 */
export function problemLines(
  checked,
  counts,
  t = buildTerms([]),
  measure,
  named = {}
) {
  if (!checked) {
    return [];
  }
  const lines = [];
  // Each count, then the lines it counts when given (PUB-6.4: named by kind).
  const add = (count, kind) => lines.push(count, ...(named[kind] || []));
  const { filled, total } = checked.cells || { filled: 0, total: 0 };
  if (total > filled) {
    add(`${filled} of ${total} placed`, "open");
  }
  // As the counter says them beside the button ("5 under", "2 over", "4 to look at", "1 note"),
  // with its own numbers: under and over count sessions, as its headings do (UX pass finding
  // 15). Open cells are the "N of M placed" line above.
  const under = measure ? measure.under.count : 0;
  const over = measure ? measure.over.count : 0;
  const look = measure ? measure.look.length : 0;
  const notes = measure ? (measure.notes || []).length : 0;
  // Without the list: every placement the check flags (over its weekly limit, not set up for a
  // bunk, twice in a day, overlapping...): some have no counter of their own.
  const dotted = !measure && checked.flags ? checked.flags.size : 0;
  if (under > 0) {
    // One word with the counter's lines ("3 short · 2 Bunks"; Greg's pick, 2026-11-12).
    add(`${under} short`, "short");
  }
  if (over > 0) {
    add(`${over} over`, "over");
  }
  if (look > 0) {
    add(`${look} to look at`, "look");
  }
  if (notes > 0) {
    add(`${notes} ${notes === 1 ? "note" : "notes"}`, "note");
  }
  if (dotted > 0) {
    lines.push(
      `${dotted} ${dotted === 1 ? `${t.sIn("Activity")} needs` : `${t.pIn("Activity")} need`} a look.`
    );
  }
  if (measure) {
    // The Why list covers overlapping, still needed and spread: never counted twice.
    return lines;
  }
  const { overlapping, stillNeeded, spread } = counts || {
    overlapping: (checked.overlapping || []).length,
    stillNeeded: checked.hasCoverageTargets
      ? (checked.stillNeeded || []).length
      : 0,
    spread: checked.hasSpreadTargets ? (checked.spread || []).length : 0
  };
  if (overlapping > 0) {
    lines.push(`Conflicts: ${overlapping}`);
  }
  if (stillNeeded > 0) {
    lines.push(`Still needed: ${stillNeeded}`);
  }
  if (spread > 0) {
    lines.push(`Spread across the week: ${spread}`);
  }
  return lines;
}

/** The lines under a count: each, at most NAMED, then how many more. */
function underCount(rows, lineOf) {
  const shown = rows
    .slice(0, NAMED)
    .map((row) => ({ ...lineOf(row), sub: true }));
  const more = rows.length - shown.length;
  return more > 0
    ? [...shown, { text: `…and ${more} more.`, sub: true }]
    : shown;
}

/** A Why list line ({ text, groupId, dateValue, blockId }): one naming a bunk goes there. */
function located(line) {
  return line.groupId ? { text: line.text, go: { line } } : { text: line.text };
}

/**
 * PUB-6.4: problemLines' counts with the Why list's own lines under each, in its words: the Open
 * cells, each activity short or over with its bunks, each line to look at and each note. measure:
 * the week's measure as the Why list shows it; accepted lines are named too, as they are counted.
 */
function namedProblems(checked, measure, t) {
  const lines = checkLines(measure, [], {
    one: t.sIn("Group"),
    many: t.pIn("Group")
  });
  const activity = (row) => ({ text: row.said, go: { activityId: row.id } });
  return problemLines(checked, null, t, measure, {
    open: underCount(lines.open, located),
    short: underCount(lines.under, activity),
    over: underCount(lines.over, activity),
    look: underCount(lines.look, located),
    note: underCount(lines.notes, (line) => ({ text: line.text }))
  });
}

/** A row of a special day's own schedule: each cell's token ("" Open, "^" carries on, else 1-based item). */
function plannedIn(plan, row) {
  return readRow(row, plan.items).some(
    // A fixed or recurring activity is the regular day's (SPECIAL-2.1), not the special day's plan.
    (cell) => cell && cell.item.kind !== "F" && cell.item.kind !== "R"
  );
}

/**
 * PUB-6.5: each special day on the week whose own schedule plans nothing for some of the week's
 * bunks (every cell Open, or only the regular day's fixed and recurring activities), named with
 * them: "Color war (Thursday): nothing planned for Bunk 2, Bunk 3, Bunk 4 and 6 more (9 of 10
 * Bunks)"; one with no schedule saved yet, "nothing planned yet". It opens that special day. specials: the week's (WeekSpecials: { days }), as the week
 * editor has them.
 */
export function specialDayLines(specials, t = buildTerms([])) {
  return ((specials && specials.days) || []).flatMap((day) => {
    const plan = day.plan;
    if (!plan || plan.problem) {
      return [];
    }
    const where = `${day.name} (${day.day})`;
    const go = { specialItemId: day.specialDayId };
    const groups = plan.groups || [];
    // No time blocks: no schedule saved yet (SpecialPlanDay sends it with no bunks either).
    if (!(plan.blocks || []).length) {
      return [{ text: `${where}: nothing planned yet`, go }];
    }
    const empty = groups.filter(
      (grp, g) => !plannedIn(plan, (plan.rows || [])[g])
    );
    if (!empty.length) {
      return [];
    }
    if (empty.length === groups.length) {
      return [{ text: `${where}: nothing planned yet`, go }];
    }
    // Three names, then how many more: "Bunk 2, Bunk 3, Bunk 4 and 6 more", "Bunk 2 and Bunk 3".
    const names = empty.slice(0, 3).map((grp) => grp.name);
    const more = empty.length - names.length;
    const words = more > 0 ? [...names, `${more} more`] : names;
    const unit = groups.length === 1 ? t.sIn("Group") : t.pIn("Group");
    return [
      {
        text: `${where}: nothing planned for ${listed(words)} (${empty.length} of ${groups.length} ${unit})`,
        go
      }
    ];
  });
}

// The screen a published schedule came from, by its Origin.
const FROM_SCREEN = { Manual: "Manual Build", Generated: "Generated Schedule" };

/**
 * The question's heading: "Publish Week 1?"; "Publish Week 1 again?" when this screen's schedule
 * is the one published; "Replace Week 1's published schedule (from Manual Build)?" when another
 * screen's is (word walk W6). origin: this screen's ("Generated" or "Manual").
 */
function headingOf(preview, origin, weekName, t) {
  const from = preview.published ? preview.published.origin : null;
  if (!preview.published) {
    return `Publish ${weekName}?`;
  }
  if (!origin || !from || from === origin) {
    return `Publish ${weekName} again?`;
  }
  const screen = FROM_SCREEN[from];
  return `Replace ${weekName}'s ${t.sIn("PublishedSchedule")}${screen ? ` (from ${screen})` : ""}?`;
}

export function publishQuestion({
  preview,
  checked,
  counts,
  measure,
  specials = null,
  weekName,
  t,
  origin = null
}) {
  const replacing = !!preview.published;
  if (replacing && preview.changeCount === 0) {
    return { kind: "same" };
  }
  const problems = [
    ...(measure && checked
      ? namedProblems(checked, measure, t)
      : problemLines(checked, counts, t, measure)),
    ...specialDayLines(specials, t)
  ];
  if (!replacing && problems.length === 0) {
    return { kind: "now" };
  }
  const lines = [];
  if (replacing) {
    lines.push(
      `This replaces the ${t.sIn("PublishedSchedule")}. ${changeWords(preview, t)}:`
    );
    lines.push(...preview.changes);
    // What the lines not listed cover, so the lines shown and this add up to the count said
    // (word walk W6: 30 lines and "135 more" read as 165, not 172). Older answers: the lines.
    const more =
      preview.moreCount === undefined || preview.moreCount === null
        ? preview.moreLines || 0
        : preview.moreCount;
    if (more > 0) {
      lines.push(`…and ${more} more.`);
    }
  }
  lines.push(...problems);
  return {
    kind: "ask",
    heading: headingOf(preview, origin, weekName, t),
    lines,
    confirmLabel: "Publish"
  };
}
