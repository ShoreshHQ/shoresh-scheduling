import { LightningElement, api } from "lwc";
import previewApply from "@salesforce/apex/WeekApplyController.previewApply";
import applyToWeek from "@salesforce/apex/WeekApplyController.applyToWeek";
import { failed } from "c/shoreshErrors";

/** "1 cell changes", "12 cells change"; once done, "changed". */
function cellWords(count, done) {
  const cells = count === 1 ? "1 cell" : `${count} cells`;
  if (done) {
    return `${cells} changed`;
  }
  return `${cells} ${count === 1 ? "changes" : "change"}`;
}

/**
 * Lines for a list: each once, with how many times it came ("… ×2") when it repeats, keyed by
 * place (prefix: one list's keys apart from another's in the same row).
 */
function listed(lines, prefix) {
  const counts = new Map();
  for (const line of lines) {
    counts.set(line, (counts.get(line) || 0) + 1);
  }
  return [...counts].map(([text, count], i) => ({
    key: `${prefix}${i}`,
    text: count > 1 ? `${text} ×${count}` : text
  }));
}

/**
 * Apply to other weeks (WEEK-6.2, ADR 0025 choice 5), on Manual Build and Generated Schedule: asks
 * first, as c-shoresh-ask does, showing what would change week by week, then applies to the weeks
 * left ticked. A request holds one week (ADR 0025), so it reads, then applies, one week at a time,
 * saying which it is on; a week that fails is said on its row and the others go on, each week
 * whole. Nothing changes until Apply is pressed.
 *
 * sourceId: the draft on screen. seenRevisions: that week as the screen shows it. weeks: the
 * others ({ value, label }).
 * Fires: close { sourceChanged } (the week on screen was saved by someone since it was read).
 */
export default class ShoreshApplyWeeks extends LightningElement {
  @api sourceId;
  @api sourceName;
  @api seenRevisions;
  @api weeks = [];
  @api terms;

  states = [];
  sourceChanged = false;
  // "preview", "ready", "applying", "finished".
  phase = "preview";
  // The row a read or apply is on, by its place, for the words at the foot.
  at = 0;
  closed = false;
  focused = false;
  focusClose = false;

  connectedCallback() {
    this.states = this.weeks.map((week) => ({
      weekId: week.value,
      name: week.label,
      checked: false
    }));
    this.previewAll();
  }

  disconnectedCallback() {
    this.closed = true;
  }

  renderedCallback() {
    if (!this.focused) {
      this.focused = true;
      const no = this.template.querySelector('[data-id="no"]');
      if (no) {
        no.focus();
      }
    }
    if (this.focusClose) {
      this.focusClose = false;
      const close = this.template.querySelector('[data-id="close"]');
      if (close) {
        close.focus();
      }
    }
  }

  update(weekId, change) {
    this.states = this.states.map((state) => {
      return state.weekId === weekId ? { ...state, ...change } : state;
    });
  }

  /** One week per request, in order: the next is asked only once this one has answered. */
  async previewAll(i = 0) {
    if (this.closed) {
      return;
    }
    if (i === this.states.length) {
      this.phase = "ready";
      return;
    }
    this.at = i + 1;
    if (await this.previewWeek(this.states[i].weekId)) {
      await this.previewAll(i + 1);
    }
  }

  /** One week's preview; false when the week on screen is older than the server's. */
  async previewWeek(weekId) {
    try {
      const outcome = await previewApply({
        scheduleId: this.sourceId,
        weekId,
        seenRevisions: this.seenRevisions
      });
      if (outcome.changedSince) {
        this.sourceChanged = true;
        this.phase = "finished";
        this.focusClose = true;
        return false;
      }
      this.update(weekId, {
        outcome,
        checked: outcome.cellsChanging > 0 && !outcome.problem
      });
    } catch (e) {
      this.update(weekId, { refused: failed("", e).trim() });
    }
    return true;
  }

  async handleApply() {
    this.phase = "applying";
    await this.applyAll(
      this.states.filter((state) => state.checked),
      0
    );
    this.phase = "finished";
    this.focusClose = true;
  }

  async applyAll(chosen, i) {
    if (i < chosen.length) {
      this.at = i + 1;
      await this.applyWeek(chosen[i]);
      await this.applyAll(chosen, i + 1);
    }
  }

  async applyWeek(state) {
    try {
      const outcome = await applyToWeek({
        scheduleId: this.sourceId,
        weekId: state.weekId,
        seen: state.outcome.seen
      });
      this.update(
        state.weekId,
        outcome.changedSince
          ? { changedSince: true }
          : { outcome, applied: outcome.applied }
      );
    } catch (e) {
      this.update(state.weekId, { refused: failed("", e).trim() });
    }
  }

  handleCheck(event) {
    this.update(event.target.dataset.week, { checked: event.target.checked });
  }

  handleClose() {
    this.closed = true;
    this.dispatchEvent(
      new CustomEvent("close", {
        detail: { sourceChanged: this.sourceChanged }
      })
    );
  }

  handleKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (!this.applyingNow) {
        this.handleClose();
      }
      return;
    }
    if (event.key === "Tab") {
      const stops = [
        ...this.template.querySelectorAll(
          '[data-id="lines"], input:not([disabled]), button:not([disabled])'
        )
      ];
      const at = stops.indexOf(this.template.activeElement);
      const next = event.shiftKey
        ? (at - 1 + stops.length) % stops.length
        : (at + 1) % stops.length;
      event.preventDefault();
      stops[next].focus();
    }
  }

  get weekWord() {
    return this.terms.sIn("Week");
  }

  get heading() {
    return `Apply ${this.sourceName} to other ${this.terms.pIn("Week")}`;
  }

  get sourceChangedText() {
    return `Someone else changed this ${this.weekWord} since you opened it, so nothing was changed.`;
  }

  get publishedWords() {
    return `· ${this.terms.s("PublishedSchedule")} stays as it is`;
  }

  get rows() {
    const finished = this.phase === "finished";
    return this.states.map((state) => {
      const outcome = state.outcome || {};
      const kept = listed(outcome.keptLocked || [], "k");
      const cantGo = listed(
        [...(outcome.leftOut || []), ...(outcome.notPlaced || [])],
        "c"
      );
      return {
        weekId: state.weekId,
        name: state.name,
        checked: state.checked,
        fixed:
          this.phase !== "ready" ||
          !outcome.cellsChanging ||
          !!outcome.problem ||
          !!state.refused,
        published: !!outcome.published,
        said: this.saidOf(state, outcome, finished),
        kept,
        cantGo,
        hasLines: kept.length + cantGo.length > 0
      };
    });
  }

  /** What a row says: what would change, what did, or why it won't. */
  saidOf(state, outcome, finished) {
    if (state.refused) {
      return state.refused;
    }
    if (state.changedSince) {
      return `Someone else changed this ${this.weekWord}; nothing was changed.`;
    }
    if (outcome.problem) {
      return outcome.problem;
    }
    if (!state.outcome) {
      return "";
    }
    if (!outcome.cellsChanging) {
      return "No change";
    }
    if (state.applied) {
      return cellWords(outcome.cellsChanging, true);
    }
    return finished ? "Not changed" : cellWords(outcome.cellsChanging, false);
  }

  get applyingNow() {
    return this.phase === "applying";
  }

  get finished() {
    return this.phase === "finished";
  }

  get chosenCount() {
    return this.states.filter((state) => state.checked).length;
  }

  get applyDisabled() {
    return this.phase !== "ready" || this.chosenCount === 0;
  }

  get applyWords() {
    const count = this.chosenCount;
    return `Apply to ${count} ${count === 1 ? this.weekWord : this.terms.pIn("Week")}`;
  }

  /** Where it has got to while it works; before Apply, where what each week has now goes. */
  get footWords() {
    if (this.phase === "preview") {
      return `${this.at} of ${this.states.length}`;
    }
    if (this.phase === "applying") {
      return `${this.at} of ${this.chosenCount}`;
    }
    return this.phase === "ready"
      ? `What each has now goes to ${this.terms.p("Version")} first`
      : "";
  }
}
