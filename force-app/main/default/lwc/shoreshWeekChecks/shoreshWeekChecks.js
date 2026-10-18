import { LightningElement, api } from "lwc";

/**
 * A week's counters and its "Still to place" list (desktop ScheduleScreen's StatBadge row and
 * FindingsRail on the manual route), shared by Manual Build and Generated Schedule.
 *
 * checked: c/shoreshEngine checkWeek's result for the week shown, plus hasCoverageTargets and
 * hasSpreadTargets (some activity has a weekly minimum / an early-week goal; without one, that
 * counter isn't shown). resetKey: change it when a different week is shown fresh; the list closes
 * and accepted lines come back. route: "manual" (the default) or "generated".
 *
 * The generated route, as the desktop's: Open (the cells nothing could go in; checked.openCells,
 * [{ dateValue, groupId, blockId, text }], first in the list) instead of the Overlapping counter,
 * though overlaps are still listed; each counter shows only its own lines and lights up the cells
 * they are about (the "highlight" event); "Review all" shows every line.
 *
 * Events: locate (detail: the line, { key, kind, text, groupId, activityId, and for a cell
 * dateValue and blockId }) when a line is clicked; the parent takes the director there. accept
 * (detail: the line) when a still needed or spread line is accepted; it is hidden for this visit
 * already. highlight (generated route; detail: { kind, lines }, kind null for none) when the
 * counter whose cells are lit up changes, or its lines do.
 */
export default class ShoreshWeekChecks extends LightningElement {
  @api route = "manual";
  _checked;

  @api
  get checked() {
    return this._checked;
  }
  set checked(value) {
    this._checked = value;
    // Generated: a week read again (someone else's save) changes the lines, so the lit cells
    // follow them. Told after this render, not during it.
    if (this.isGenerated && this.filterKind) {
      Promise.resolve().then(() => this.tellHighlight());
    }
  }

  // The "Still to place" list is open (any counter with something in it opens it, desktop).
  listOpen = false;
  // Lines accepted this visit (their keys carry their numbers, so a changed line comes back).
  accepted = [];
  // Generated route: the counter whose lines are shown and whose cells are lit, or null (all).
  filterKind = null;
  _resetKey;

  @api
  get resetKey() {
    return this._resetKey;
  }
  set resetKey(value) {
    if (value !== this._resetKey) {
      this.listOpen = false;
      this.accepted = [];
      this.setFilter(null);
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
  get isGenerated() {
    return this.route === "generated";
  }

  get lines() {
    const checked = this.checked || {};
    // Generated: the cells nothing could go in come first, as the desktop's Unfillable rows do.
    const lines = (this.isGenerated ? checked.openCells || [] : []).map(
      (cell) => ({
        key: `open|${cell.dateValue}|${cell.groupId}|${cell.blockId}`,
        kind: "open",
        text: cell.text,
        groupId: cell.groupId,
        dateValue: cell.dateValue,
        blockId: cell.blockId
      })
    );
    const overlaps = (checked.overlapping || []).map((cell) => ({
      key: `overlap|${cell.dateValue}|${cell.groupId}|${cell.blockId}`,
      kind: "overlapping",
      text: cell.text,
      groupId: cell.groupId,
      dateValue: cell.dateValue,
      blockId: cell.blockId
    }));
    lines.push(...overlaps);
    const short = (kind, texts, entries) =>
      texts.map((text, i) => {
        const e = entries[i] || {};
        return {
          key: [kind, e.groupId, e.activityId, e.missing, e.byDay].join("|"),
          kind,
          text,
          groupId: e.groupId,
          activityId: e.activityId,
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
    const first = this.isGenerated
      ? { key: "open", label: "Open", count: count("open") }
      : {
          key: "overlapping",
          label: "Overlapping",
          count: count("overlapping")
        };
    return [
      first,
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
      .map((c) => {
        // Generated: only the counter showing its own lines is open.
        const open =
          this.listOpen &&
          (!this.isGenerated || !this.filterKind || this.filterKind === c.key);
        let className = c.count ? "counter counter_due" : "counter";
        if (c.count && open) {
          className = `${className} counter_open`;
        }
        return {
          ...c,
          // A zero opens nothing, but stays in the tab order: a counter that drops to zero
          // while it has focus keeps it (desktop disables it; focus would fall to the page).
          unavailable: c.count === 0 ? "true" : null,
          expanded: c.count ? String(open) : null,
          className
        };
      });
  }

  /** The lines the list shows: on the generated route, only the chosen counter's. */
  get shownLines() {
    const lines = this.lines;
    return this.isGenerated && this.filterKind
      ? lines.filter((line) => line.kind === this.filterKind)
      : lines;
  }

  get openLines() {
    const lines = this.listOpen ? this.shownLines : [];
    return lines.length
      ? lines.map((line) => ({
          ...line,
          acceptLabel: `Accept: ${line.text}`
        }))
      : null;
  }

  handleCounter(event) {
    if (event.currentTarget.getAttribute("aria-disabled") === "true") {
      return;
    }
    if (!this.isGenerated) {
      this.listOpen = !this.listOpen;
      return;
    }
    // Generated (desktop): a counter shows its own lines and lights up their cells; clicking it
    // again closes them.
    const kind = event.currentTarget.dataset.counter;
    const again = this.listOpen && this.filterKind === kind;
    this.listOpen = !again;
    this.setFilter(again ? null : kind);
  }

  /** Generated: "Review all" shows every line (no cells lit); again, it hides the list. */
  get showReviewAll() {
    return this.isGenerated && this.lines.length > 0;
  }
  get reviewAllLabel() {
    return this.listOpen && !this.filterKind ? "Hide list" : "Review all";
  }
  get reviewAllExpanded() {
    return String(this.listOpen && !this.filterKind);
  }
  handleReviewAll() {
    const hide = this.listOpen && !this.filterKind;
    this.listOpen = !hide;
    this.setFilter(null);
  }

  handleCloseList() {
    this.listOpen = false;
    this.setFilter(null);
  }

  /** The counter whose cells are lit (generated route), told to the page. */
  setFilter(kind) {
    this.filterKind = kind;
    this.tellHighlight();
  }

  tellHighlight() {
    if (!this.isGenerated) {
      return;
    }
    const kind = this.filterKind;
    this.dispatchEvent(
      new CustomEvent("highlight", {
        detail: { kind, lines: kind ? this.shownLines : [] }
      })
    );
  }

  handleAccept(event) {
    const line = this.lines.find(
      (l) => l.key === event.currentTarget.dataset.key
    );
    if (!line) {
      return;
    }
    this.accepted = [...this.accepted, line.key];
    this.dispatchEvent(new CustomEvent("accept", { detail: line }));
    if (this.filterKind) {
      this.tellHighlight();
    }
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
    if (this.filterKind) {
      this.setFilter(null);
    }
    this.dispatchEvent(new CustomEvent("locate", { detail: line }));
  }

  renderedCallback() {
    // A list with nothing left in it closes, so it doesn't open again by itself later.
    if (this.listOpen && !this.shownLines.length) {
      this.listOpen = false;
      if (this.filterKind) {
        this.setFilter(null);
      }
    }
  }
}
