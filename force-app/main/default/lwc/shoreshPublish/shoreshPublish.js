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
 * measure: the week's measure as the Why list (c-shoresh-week-checks) shows it: every row in it
 * is counted ("To look at: 5"), accepted or not. Without it, the placements the check flags are
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
  const rows = measure
    ? (measure.open || []).length +
      measure.under.rows.length +
      measure.over.rows.length +
      measure.look.length +
      (measure.notes || []).length
    : 0;
  // Without the list: every placement the check flags (over its weekly limit, not set up for a
  // bunk, twice in a day, overlapping...): some have no counter of their own.
  const dotted = !measure && checked.flags ? checked.flags.size : 0;
  if (rows > 0) {
    lines.push(`To look at: ${rows}`);
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

export function publishQuestion({
  preview,
  checked,
  counts,
  measure,
  weekName,
  t
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
    // Lines not listed (a line can cover several cells, so not changeCount less those shown).
    const more = preview.moreLines || 0;
    if (more > 0) {
      lines.push(`…and ${more} more.`);
    }
  }
  lines.push(...problems);
  return {
    kind: "ask",
    heading: replacing ? `Publish ${weekName} again?` : `Publish ${weekName}?`,
    lines,
    confirmLabel: "Publish"
  };
}
