/**
 * Publish's words, for any schedule that publishes (Manual Build and Generated Schedule):
 * what to ask before publishing, from the server's preview (SchedulePublish.Preview) and the
 * week's checks (c/shoreshEngine checkWeek, as the counters show them). Problems are shown, never
 * a reason to refuse: a week with Open cells or dots can still be published (Greg, Manual Build
 * round 1 #2 to #4: never blocked). It uses the counters' own words, the same on both screens
 * (Greg's decision 3, 2026-10-20): Filled, Overlapping, Still needed, Spread across the week.
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
 * slice 5), each only when above 0: "2 cells change", "1 name changes", "1 cell and 1 name
 * change", "1 special day changes". A rename is never counted as a cell.
 */
function changeWords(preview, t) {
  const renames = preview.renameCount || 0;
  const retimes = preview.retimeCount || 0;
  const specialDays = preview.specialDayCount || 0;
  const events = preview.eventCount || 0;
  const parts = [
    [
      preview.changeCount - renames - retimes - specialDays - events,
      "cell",
      "cells"
    ],
    [renames, "name", "names"],
    [retimes, t.sIn("TimeBlock"), t.pIn("TimeBlock")],
    [specialDays, t.sIn("SpecialDay"), t.pIn("SpecialDay")],
    [events, t.sIn("SpecialEvent"), t.pIn("SpecialEvent")]
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
 * What is still to do: Filled while cells are still Open, placements with a dot, then the
 * counters (each line only when it is above 0), as the screen's counters and dots show them. counts: what the counters count
 * now (c-shoresh-week-checks counts: lines the director accepted aside), when the screen has them.
 * t: the camp's words (c/shoreshTerms), so a dot names the camp's word for Activity.
 */
export function problemLines(checked, counts, t = buildTerms([])) {
  if (!checked) {
    return [];
  }
  const lines = [];
  const { filled, total } = checked.cells || { filled: 0, total: 0 };
  if (total > filled) {
    lines.push(`Filled: ${filled} of ${total}`);
  }
  // Every placement with a dot (over its weekly limit, not set up for a bunk, twice in a day,
  // overlapping...): some have no counter of their own.
  const dotted = checked.flags ? checked.flags.size : 0;
  if (dotted > 0) {
    lines.push(
      `${dotted} ${dotted === 1 ? `${t.sIn("Activity")} needs` : `${t.pIn("Activity")} need`} a look.`
    );
  }
  const { overlapping, stillNeeded, spread } = counts || {
    overlapping: (checked.overlapping || []).length,
    stillNeeded: checked.hasCoverageTargets
      ? (checked.stillNeeded || []).length
      : 0,
    spread: checked.hasSpreadTargets ? (checked.spread || []).length : 0
  };
  if (overlapping > 0) {
    lines.push(`Overlapping: ${overlapping}`);
  }
  if (stillNeeded > 0) {
    lines.push(`Still needed: ${stillNeeded}`);
  }
  if (spread > 0) {
    lines.push(`Spread across the week: ${spread}`);
  }
  return lines;
}

export function publishQuestion({ preview, checked, counts, weekName, t }) {
  const replacing = !!preview.published;
  if (replacing && preview.changeCount === 0) {
    return { kind: "same" };
  }
  const problems = problemLines(checked, counts, t);
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
