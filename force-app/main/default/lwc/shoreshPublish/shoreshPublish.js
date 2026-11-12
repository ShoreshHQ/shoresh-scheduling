/**
 * Publish's words, for any schedule that publishes (Manual Build and Generated Schedule):
 * what to ask before publishing, from the server's preview (SchedulePublish.Preview) and the
 * week's checks (c/shoreshEngine checkWeek, as the counters show them). Problems are shown, never
 * a reason to refuse: a week with Open cells or dots can still be published (Greg, Manual Build
 * round 1 #2 to #4: never blocked). It uses the counters' own words, the same on both screens
 * (PUB-6.2, CORE-6.5): "7 of 10 placed", Conflicts (CORE-1.29), Still needed, Spread across the week.
 *
 * publishQuestion returns one of:
 *   { kind: "same" }: the published schedule already is the week; nothing to do.
 *   { kind: "now" }: the week's first publish, with nothing to show; publish at once.
 *   { kind: "ask", heading, lines, confirmLabel }: for c-shoresh-ask.
 */
import { buildTerms } from "c/shoreshTerms";

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
  const said =
    parts.length > 1
      ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
      : parts[0];
  return `${said} ${single ? "changes" : "change"}`;
}

/**
 * What is still to do: "N of M placed" while cells are still Open, then what the Why list shows; without
 * the list, the counters instead (each line only when it is above 0). counts: what the counters count now
 * (c-shoresh-week-checks counts: lines the director accepted aside), when the screen has them.
 * measure: the week's measure as the Why list (c-shoresh-week-checks) shows it, counted as its
 * headings count, accepted or not ("5 under", "2 over", "4 to look at", "1 note"). Without it, the placements the check flags are
 * ("2 activities need a look."). t: the camp's words (c/shoreshTerms).
 */
export function problemLines(checked, counts, t = buildTerms([]), measure) {
  if (!checked) {
    return [];
  }
  const lines = [];
  const { filled, total } = checked.cells || { filled: 0, total: 0 };
  if (total > filled) {
    lines.push(`${filled} of ${total} placed`);
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
    lines.push(`${under} short`);
  }
  if (over > 0) {
    lines.push(`${over} over`);
  }
  if (look > 0) {
    lines.push(`${look} to look at`);
  }
  if (notes > 0) {
    lines.push(`${notes} ${notes === 1 ? "note" : "notes"}`);
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
  weekName,
  t,
  origin = null
}) {
  const replacing = !!preview.published;
  if (replacing && preview.changeCount === 0) {
    return { kind: "same" };
  }
  const problems = problemLines(checked, counts, t, measure);
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
