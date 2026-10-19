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

/** "1 cell", "3 cells". */
function cells(count) {
  return `${count} ${count === 1 ? "cell" : "cells"}`;
}

/**
 * What is still to do: Open cells, placements with a dot, then the counters (each line only when
 * it is above 0), as the screen's counters and dots show them.
 */
export function problemLines(checked) {
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
      `${dotted} ${dotted === 1 ? "activity needs" : "activities need"} a look.`
    );
  }
  const overlapping = (checked.overlapping || []).length;
  if (overlapping > 0) {
    lines.push(`Overlapping: ${overlapping}`);
  }
  const stillNeeded = checked.hasCoverageTargets
    ? (checked.stillNeeded || []).length
    : 0;
  if (stillNeeded > 0) {
    lines.push(`Still needed: ${stillNeeded}`);
  }
  const spread = checked.hasSpreadTargets ? (checked.spread || []).length : 0;
  if (spread > 0) {
    lines.push(`Spread across the week: ${spread}`);
  }
  return lines;
}

export function publishQuestion({ preview, checked, weekName, t }) {
  const replacing = !!preview.published;
  if (replacing && preview.changeCount === 0) {
    return { kind: "same" };
  }
  const problems = problemLines(checked);
  if (!replacing && problems.length === 0) {
    return { kind: "now" };
  }
  const lines = [];
  if (replacing) {
    lines.push(
      `This replaces the ${t.sIn("PublishedSchedule")}. ${cells(preview.changeCount)} ${preview.changeCount === 1 ? "changes" : "change"}:`
    );
    lines.push(...preview.changes);
    const more = preview.changeCount - preview.changes.length;
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
