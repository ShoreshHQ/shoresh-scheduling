/**
 * Publish's words, for any schedule that publishes (Manual Build now; Generated Schedule next):
 * what to ask before publishing, from the server's preview (SchedulePublish.Preview) and the
 * week's checks (c/shoreshEngine checkWeek, as the counters show them). Problems are shown, never
 * a reason to refuse: a week with Open cells or dots can still be published (Greg, Manual Build
 * round 1 #2 to #4: never blocked).
 *
 * publishQuestion returns one of:
 *   { kind: "same" }: the published schedule already is the week; nothing to do.
 *   { kind: "now" }: the week's first publish, with nothing to show; publish at once.
 *   { kind: "ask", heading, lines, confirmLabel }: for c-shoresh-ask.
 */
import { buildTerms } from "c/shoreshTerms";

/** "1 cell", "3 cells". */
function cells(count) {
  return `${count} ${count === 1 ? "cell" : "cells"}`;
}

/**
 * What is still to do: Open cells, placements with a dot, then the counters (each line only when
 * it is above 0), as the screen's counters and dots show them. counts: what the counters count
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
    lines.push(`${total - filled} of ${cells(total)} still Open.`);
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
      `This replaces the ${t.sIn("PublishedSchedule")}. ${cells(preview.changeCount)} ${preview.changeCount === 1 ? "changes" : "change"}:`
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
