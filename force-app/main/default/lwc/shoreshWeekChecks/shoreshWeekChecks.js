import { LightningElement, api } from "lwc";

/**
 * A week's counters and its "Still to place" list (desktop ScheduleScreen's StatBadge row and
 * FindingsRail on the manual route), shared by Manual Build and Generated Schedule.
 *
 * checked: c/shoreshEngine checkWeek's result for the week shown, as it comes (its
 * hasCoverageTargets and hasSpreadTargets say whether Still needed and Spread across the week
 * are shown). resetKey: change it when a different week is shown fresh; the list closes and
 * accepted lines come back. route: "manual" (the default) or "generated"; the generated route's
 * own behaviour (lighting up the cells a counter concerns) is to come, and today both behave
 * alike.
 *
 * Events: locate (detail: the line, { key, kind, text, groupId, and for an overlap dateValue and
 * blockId }) when a line is clicked; the parent takes the director there. accept (detail: the
 * line) when a still needed or spread line is accepted; it is hidden for this visit already.
 */
export default class ShoreshWeekChecks extends LightningElement {
  @api checked;
  @api route = "manual";

  // The "Still to place" list is open (any counter with something in it opens it, desktop).
  listOpen = false;
  // Lines accepted this visit (their keys carry their numbers, so a changed line comes back).
  accepted = [];
  // The counter that opened the list (Close puts focus back on it).
  opener = null;
  // Where keyboard focus goes once the list has redrawn: { counter } or { line } (an index).
  focusAfterRender = null;
  _resetKey;

  @api
  get resetKey() {
    return this._resetKey;
  }
  set resetKey(value) {
    if (value !== this._resetKey) {
      this.listOpen = false;
      this.accepted = [];
    }
    this._resetKey = value;
  }

  get filledText() {
    const { filled, total } = (this.checked && this.checked.cells) || {
      filled: 0,
      total: 0
    };
    return `${filled} of ${total}`;
  }

  /**
   * The lines of the "Still to place" list, as the desktop's findings rail on the manual route
   * lists them: each overlapping cell (one per group, day and time block), then each pair still
   * needed, then each still needed early in the week. A still needed or spread line can be
   * accepted (desktop "Accept"): hidden for this visit, and back as soon as its numbers change.
   * Overlaps have nothing to accept: they go when the clash is moved.
   */
  get lines() {
    const checked = this.checked || {};
    const lines = (checked.overlapping || []).map((cell) => ({
      key: `overlap|${cell.dateValue}|${cell.groupId}|${cell.blockId}`,
      kind: "overlapping",
      text: cell.text,
      groupId: cell.groupId,
      dateValue: cell.dateValue,
      blockId: cell.blockId
    }));
    const short = (kind, texts, entries) =>
      texts.map((text, i) => {
        const e = entries[i] || {};
        return {
          key: [kind, e.groupId, e.activityId, e.missing, e.byDay].join("|"),
          kind,
          text,
          groupId: e.groupId,
          acceptable: true
        };
      });
    if (checked.hasCoverageTargets) {
      lines.push(
        ...short(
          "stillNeeded",
          checked.stillNeeded,
          checked.stillNeededBy || []
        )
      );
    }
    if (checked.hasSpreadTargets) {
      lines.push(...short("spread", checked.spread, checked.spreadBy || []));
    }
    return lines.filter((line) => !this.accepted.includes(line.key));
  }

  /**
   * The counters, as the desktop's manual route shows them: Overlapping always, Still needed and
   * Spread across the week when some activity has that target. Each counts its lines (accepted
   * ones aside). A zero shows, grey, and opens nothing; any other opens the one list.
   */
  get counterButtons() {
    const checked = this.checked || {};
    const lines = this.lines;
    const count = (kind) => lines.filter((line) => line.kind === kind).length;
    return [
      { key: "overlapping", label: "Overlapping", count: count("overlapping") },
      checked.hasCoverageTargets && {
        key: "stillNeeded",
        label: "Still needed",
        count: count("stillNeeded")
      },
      checked.hasSpreadTargets && {
        key: "spread",
        label: "Spread across the week",
        count: count("spread")
      }
    ]
      .filter(Boolean)
      .map((c) => ({
        ...c,
        className: c.count ? "counter counter_due" : "counter",
        // A zero opens nothing, but stays in the tab order: a counter that drops to zero
        // while it has focus keeps it (desktop disables it; focus would fall to the page).
        unavailable: c.count === 0 ? "true" : null,
        expanded: c.count ? String(this.listOpen) : null,
        controls: c.count && this.listOpen ? "counter-list" : null
      }));
  }

  get openLines() {
    const lines = this.lines;
    return lines.length
      ? lines.map((line) => ({
          ...line,
          // Desktop FindingsRail's bar: bronze for overlaps and still needed, forest for spread.
          className:
            line.kind === "spread" ? "counter-line line_info" : "counter-line",
          acceptLabel: `Accept: ${line.text}`
        }))
      : null;
  }

  /** With nothing left to list (desktop railEmptyText): how many cells are still open. */
  get emptyText() {
    const cells = (this.checked && this.checked.cells) || {};
    const open = (cells.total || 0) - (cells.filled || 0);
    return open > 0 ? `${open} open` : "All placed";
  }

  handleCounter(event) {
    if (event.currentTarget.getAttribute("aria-disabled") === "true") {
      return;
    }
    this.opener = event.currentTarget.dataset.counter;
    this.listOpen = !this.listOpen;
  }

  /** Close: the list goes, and focus goes back to the counter that opened it. */
  handleCloseList() {
    this.listOpen = false;
    this.focusAfterRender = { counter: this.opener || "overlapping" };
  }

  /** Accept: the line goes for this visit, and focus moves to the line after it (or before). */
  handleAccept(event) {
    const lines = this.lines;
    const index = lines.findIndex(
      (l) => l.key === event.currentTarget.dataset.key
    );
    if (index < 0) {
      return;
    }
    const line = lines[index];
    this.accepted = [...this.accepted, line.key];
    this.focusAfterRender = { line: index };
    this.dispatchEvent(new CustomEvent("accept", { detail: line }));
  }

  /** A line was clicked: the parent takes the director there (and the list closes). */
  handleLocate(event) {
    const line = this.lines.find(
      (l) => l.key === event.currentTarget.dataset.key
    );
    if (!line) {
      return;
    }
    this.listOpen = false;
    this.dispatchEvent(new CustomEvent("locate", { detail: line }));
  }

  renderedCallback() {
    const focus = this.focusAfterRender;
    if (!focus) {
      return;
    }
    this.focusAfterRender = null;
    let target = null;
    if (focus.counter) {
      target = this.template.querySelector(`[data-counter="${focus.counter}"]`);
    } else {
      const lines = [...this.template.querySelectorAll(".line-text")];
      target =
        lines[Math.min(focus.line, lines.length - 1)] ||
        this.template.querySelector('[data-id="close-list"]');
    }
    if (target) {
      target.focus();
    }
  }
}
