import { LightningElement, api } from "lwc";
import getLearned from "@salesforce/apex/LearnedController.getLearned";
import changeLearned from "@salesforce/apex/LearnedController.changeLearned";
import forgetLearned from "@salesforce/apex/LearnedController.forgetLearned";
import restoreLearned from "@salesforce/apex/LearnedController.restoreLearned";
import { failed } from "c/shoreshErrors";
import { buildTerms } from "c/shoreshTerms";
import { GROUPS } from "./kinds";
import { learnedGroups, learnedRow, matches, speller } from "./view";

const PAGE = 25;
const SEARCH_AT = 15;
const NOT_LOADED = "Couldn't load what Shoresh has learned.";
const NOT_SAVED = "Couldn't save that.";
const STALE = "Someone else changed this just now. Showing the latest.";

/**
 * What Shoresh has learned (repo ADR 0021; desktop LearnedScreen.jsx and LearnedRow.jsx): every
 * answer the camp's imports and setup screens remember, in groups, newest first, each with who
 * last answered it and when. Change picks another of its choices; Forget makes the next import
 * ask again (a deleted item can come back), with Undo on the row until the screen is next opened.
 * Past 15 answers a search and a kind filter show in the rail.
 *
 * campId: the camp shown. terms: the camp's words (c/shoreshTerms). setup: the open season's
 * setup, if any (names a key keeps in lower case show as the camp writes them). active: shown;
 * it reads the answers each time it is.
 * @api focusHeading(): the cursor to the screen's heading.
 */
export default class ShoreshLearned extends LightningElement {
  @api campId;
  @api terms;
  // The open season's setup (the page's own), for names as the camp writes them now.
  @api setup;

  status = "loading";
  loadError = "";
  answers = [];
  // Per row: { mode: "editing" | "forgotten", choice, pending, error, retry }.
  states = {};
  // Rows changed or remembered again, until the next read: their result word.
  flashes = {};
  closed = {};
  limits = {};
  query = "";
  kind = "all";
  announcement = "";
  notice = "";
  focusAfter = null;
  _active = false;

  @api
  get active() {
    return this._active;
  }
  set active(value) {
    const showing = !!value && !this._active;
    this._active = !!value;
    if (showing) {
      this.states = {};
      this.flashes = {};
      this.notice = "";
      this.load();
    }
  }

  @api
  focusHeading() {
    const heading = this.template.querySelector("[data-heading]");
    if (heading) {
      heading.focus();
    }
  }

  get t() {
    return this.terms && typeof this.terms.s === "function"
      ? this.terms
      : buildTerms([]);
  }

  async load(after) {
    if (!this.campId) {
      return;
    }
    if (!after) {
      this.status = "loading";
    }
    try {
      const answers = await getLearned({ campId: this.campId });
      const spell = speller(this.setup);
      this.answers = (answers || []).map((a) => learnedRow(a, this.t, spell));
      this.status = "ready";
      if (after) {
        after();
      }
    } catch (error) {
      this.loadError = failed(NOT_LOADED, error);
      this.status = "error";
    }
  }

  renderedCallback() {
    if (!this.focusAfter) {
      return;
    }
    const target = this.template.querySelector(this.focusAfter);
    this.focusAfter = null;
    if (target) {
      target.focus();
    }
  }

  // ---------- what is shown ----------

  get isLoading() {
    return this.status === "loading";
  }

  get isError() {
    return this.status === "error";
  }

  get isEmpty() {
    return this.status === "ready" && this.answers.length === 0;
  }

  get isReady() {
    return this.status === "ready" && this.answers.length > 0;
  }

  /** Answers still remembered (a forgotten one waiting on Undo no longer counts). */
  get remembered() {
    return this.answers.filter((r) => this.stateOf(r.id).mode !== "forgotten");
  }

  get count() {
    return this.remembered.length;
  }

  get countWord() {
    return this.count === 1 ? "answer" : "answers";
  }

  get searching() {
    return this.answers.length > SEARCH_AT;
  }

  get kindOptions() {
    const present = new Set(this.answers.map((r) => r.group));
    return [
      { value: "all", label: "All kinds", selected: this.kind === "all" },
      ...GROUPS.filter((g) => present.has(g.key)).map((g) => ({
        value: g.key,
        label: g.label,
        selected: this.kind === g.key
      }))
    ];
  }

  get filtering() {
    return this.searching && (this.query.trim() !== "" || this.kind !== "all");
  }

  get groups() {
    const q = this.searching ? this.query : "";
    const kind = this.searching ? this.kind : "all";
    return learnedGroups(this.answers)
      .filter((g) => kind === "all" || g.key === kind)
      .map((g) => ({ ...g, rows: g.rows.filter((r) => matches(r, q)) }))
      .filter((g) => g.rows.length > 0)
      .map((g) => this.groupView(g, q.trim() !== ""));
  }

  get noMatches() {
    return this.filtering && this.groups.length === 0;
  }

  get noMatchesText() {
    const q = this.query.trim();
    return q ? `Nothing matches “${q}”.` : "Nothing of this kind.";
  }

  groupView(g, searched) {
    const open = searched || !this.closed[g.key];
    const limit = searched ? g.rows.length : this.limits[g.key] || PAGE;
    const left = g.rows.filter(
      (r) => this.stateOf(r.id).mode !== "forgotten"
    ).length;
    return {
      key: g.key,
      label: g.label,
      count: left,
      open,
      expanded: open ? "true" : "false",
      panelId: `learned-${g.key}`,
      chevronClass: open ? "chevron chevron_open" : "chevron",
      rows: g.rows.slice(0, limit).map((r) => this.rowView(r)),
      more: g.rows.length > limit,
      moreLabel: `Show ${PAGE} more`
    };
  }

  stateOf(id) {
    return this.states[id] || {};
  }

  rowView(r) {
    const state = this.stateOf(r.id);
    const forgotten = state.mode === "forgotten";
    const editing = state.mode === "editing";
    const choice = state.choice ?? r.answer;
    return {
      ...r,
      forgottenNow: forgotten,
      editing,
      idle: !forgotten && !editing,
      flag: forgotten ? "Forgotten" : this.flashes[r.id] || "",
      canChange: r.choices.length > 1,
      changeLabel: `Change ${r.title}`,
      forgetLabel: `Forget ${r.title}`,
      undoLabel: `Undo forgetting ${r.title}`,
      choiceViews: r.choices.map((c) => ({
        ...c,
        pressed: c.value === choice ? "true" : "false",
        className:
          c.value === choice ? "shoresh-item shoresh-raised" : "shoresh-item"
      })),
      canSave: choice !== r.answer,
      busy: !!state.pending,
      forgetText: state.pending === "forget" ? "Forgetting..." : "Forget",
      saveText: state.pending === "change" ? "Saving..." : "Save",
      undoText: state.pending === "undo" ? "Undoing..." : "Undo",
      error: state.error || "",
      liClass: forgotten ? "row row_forgotten" : "row"
    };
  }

  // ---------- the rail ----------

  handleSearch(event) {
    this.query = event.target.value || "";
  }

  handleKind(event) {
    this.kind = event.target.value || "all";
  }

  handleClear() {
    this.query = "";
    this.kind = "all";
    this.focusAfter = '[data-id="search"]';
  }

  handleRetryLoad() {
    this.load();
  }

  // ---------- groups ----------

  handleToggle(event) {
    const key = event.currentTarget.dataset.group;
    this.closed = { ...this.closed, [key]: !this.closed[key] };
  }

  handleMore(event) {
    const key = event.currentTarget.dataset.group;
    this.limits = { ...this.limits, [key]: (this.limits[key] || PAGE) + PAGE };
  }

  // ---------- a row ----------

  rowOf(event) {
    const id = event.currentTarget.dataset.row;
    return this.answers.find((r) => r.id === id);
  }

  setState(id, state) {
    this.states = { ...this.states, [id]: state };
  }

  handleChange(event) {
    const row = this.rowOf(event);
    this.setState(row.id, { mode: "editing", choice: row.answer });
    this.focusAfter = `[data-choice-of="${row.id}"][aria-pressed="true"]`;
  }

  handleChoice(event) {
    const row = this.rowOf(event);
    this.setState(row.id, {
      ...this.stateOf(row.id),
      choice: event.currentTarget.dataset.value
    });
  }

  handleCancel(event) {
    this.closeEditor(this.rowOf(event));
  }

  handleEditorKey(event) {
    if (event.key === "Escape") {
      this.closeEditor(this.rowOf(event));
    }
  }

  closeEditor(row) {
    this.setState(row.id, {});
    this.focusAfter = `[data-id="change"][data-row="${row.id}"]`;
  }

  handleSave(event) {
    const row = this.rowOf(event);
    const answer = this.stateOf(row.id).choice;
    this.write(row, "change", () =>
      changeLearned({ campId: this.campId, answerId: row.id, answer })
    ).then((found) => {
      if (found) {
        this.flashes = { ...this.flashes, [row.id]: "Updated" };
        this.announcement = "Updated.";
        this.load(() => {
          this.setState(row.id, {});
          this.focusAfter = `[data-id="change"][data-row="${row.id}"]`;
        });
      }
    });
  }

  handleForget(event) {
    const row = this.rowOf(event);
    this.write(row, "forget", () =>
      forgetLearned({ campId: this.campId, answerId: row.id })
    ).then((found) => {
      if (found) {
        this.setState(row.id, { mode: "forgotten" });
        this.announcement = `Forgotten. ${row.forgotten}`;
        this.focusAfter = `[data-id="undo"][data-row="${row.id}"]`;
      }
    });
  }

  handleUndo(event) {
    const row = this.rowOf(event);
    this.write(row, "undo", () =>
      restoreLearned({ campId: this.campId, answerId: row.id })
    ).then((found) => {
      if (found) {
        this.announcement = "Remembered again.";
        this.load(() => this.rememberedAgain(row));
      }
    });
  }

  /** Undo brings the answer back (usually the same record): flagged and given the cursor. */
  rememberedAgain(row) {
    const back = this.answers.find((r) => r.question === row.question);
    if (back) {
      this.setState(back.id, {});
      this.flashes = { ...this.flashes, [back.id]: "Remembered again" };
      this.focusAfter = `[data-id="forget"][data-row="${back.id}"]`;
    }
  }

  handleRetry(event) {
    const row = this.rowOf(event);
    const retry = this.stateOf(row.id).retry;
    if (retry) {
      retry();
    }
  }

  /**
   * One write for a row, its button saying what it is doing; a refusal stays on the row with
   * Try again. Resolves true when done, false when the answer was already gone or changed
   * elsewhere (the latest is read and shown), undefined when it failed.
   */
  async write(row, pending, call) {
    const before = this.stateOf(row.id);
    this.setState(row.id, { ...before, pending, error: "", retry: null });
    try {
      const found = await call();
      this.setState(row.id, { ...before, pending: null });
      if (!found) {
        this.notice = STALE;
        this.announcement = STALE;
        this.load(() => {});
      }
      return found;
    } catch (error) {
      this.setState(row.id, {
        ...before,
        pending: null,
        error: failed(NOT_SAVED, error),
        retry: () => this.retryOf(row, pending)
      });
      return undefined;
    }
  }

  retryOf(row, pending) {
    const fake = { currentTarget: { dataset: { row: row.id } } };
    if (pending === "change") {
      this.handleSave(fake);
    } else if (pending === "forget") {
      this.handleForget(fake);
    } else {
      this.handleUndo(fake);
    }
  }
}
