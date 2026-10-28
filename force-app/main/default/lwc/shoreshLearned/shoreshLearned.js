import { LightningElement, api } from "lwc";
import getLearned from "@salesforce/apex/LearnedController.getLearned";
import getLearnedHistory from "@salesforce/apex/LearnedController.getLearnedHistory";
import changeLearned from "@salesforce/apex/LearnedController.changeLearned";
import forgetLearned from "@salesforce/apex/LearnedController.forgetLearned";
import restoreLearned from "@salesforce/apex/LearnedController.restoreLearned";
import undoChangeLearned from "@salesforce/apex/LearnedController.undoChangeLearned";
import forgetLearnedPattern from "@salesforce/apex/LearnedController.forgetLearnedPattern";
import { failed } from "c/shoreshErrors";
import { buildTerms } from "c/shoreshTerms";
import { builtInRows } from "./builtIn";
import { historyLines } from "./history";
import { isAnswer, matches, speller } from "./view";

const PAGE = 25;
// LearnedEvents.forCamp reads the newest 5000: a full read means older ones were left out.
const HISTORY_LIMIT = 5000;
const SEARCH_AT = 15;
const KNEW = "Shoresh already knew this";
const UNDO_WORDS = { changed: "Undo changing", forgotten: "Undo forgetting" };
const NOT_LOADED = "Couldn't load what Shoresh has learned.";
const NOT_SAVED = "Couldn't save that.";
const STALE = "Someone else changed this just now. Showing the latest.";

/**
 * What Shoresh has learned, under Settings (repo ADR 0023, after ADR 0021; Greg 2026-10-28):
 * one running list, newest first. Each line says what was learned in camp words, when, and how
 * (from whose answer in an import, became Suggested or Steady, demoted, auto-applied, changed,
 * forgotten, undone). A change adds a line; the line before it stays, marked. The line of an
 * answer remembered now has Change and Forget; the newest line of a pattern there is now has its
 * progress (MEMO-6.7) and Forget pattern (MEMO-4.5). What Shoresh already knew comes last
 * (MEMO-6.8). Forget and Change add their line with Undo, until the screen is next opened
 * (MEMO-6.4). Past 15 lines a search shows in the rail.
 *
 * campId: the camp shown. terms: the camp's words (c/shoreshTerms). setup: the open season's
 * setup, if any (names a key keeps in lower case show as the camp writes them). active: shown;
 * it reads the history each time it is.
 * @api focusHeading(): the cursor to the screen's heading.
 */
export default class ShoreshLearned extends LightningElement {
  @api campId;
  @api terms;
  // The open season's setup (the page's own), for names as the camp writes them now.
  @api setup;

  status = "loading";
  loadError = "";
  // What is remembered now (answers, and forgotten patterns' markers).
  answers = [];
  lines = [];
  // The history read was cut at its limit (MEMO-7.7).
  capped = false;
  // Per line key: { mode: "editing", choice, pending, error, retry }.
  states = {};
  // What this visit's Forget and Change can undo, by "<kind>:<answer Id>" of the line they added.
  undos = {};
  limit = PAGE;
  query = "";
  announcement = "";
  notice = "";
  focusAfter = null;
  reads = 0;
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
      this.undos = {};
      this.notice = "";
      this.limit = PAGE;
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
    // Only the latest read shows: an earlier one answering late is dropped.
    this.reads += 1;
    const read = this.reads;
    try {
      const [answers, events] = await Promise.all([
        getLearned({ campId: this.campId }),
        getLearnedHistory({ campId: this.campId })
      ]);
      if (read !== this.reads) {
        return;
      }
      this.answers = answers || [];
      this.capped = (events || []).length >= HISTORY_LIMIT;
      this.lines = historyLines(
        events || [],
        this.answers,
        this.t,
        speller(this.setup)
      );
      this.status = "ready";
      if (after) {
        after();
      }
    } catch (error) {
      if (read !== this.reads) {
        return;
      }
      this.loadError = failed(NOT_LOADED, error);
      this.status = "error";
    }
  }

  renderedCallback() {
    if (!this.focusAfter) {
      return;
    }
    // A line paged or searched out of sight: the cursor goes to the heading, never lost.
    const target =
      this.template.querySelector(this.focusAfter) ||
      this.template.querySelector("[data-heading]");
    this.focusAfter = null;
    if (target) {
      target.focus();
    }
  }

  /** Says a result in the live region, even the same words twice in a row. */
  say(text) {
    this.announcement = "";
    Promise.resolve().then(() => {
      this.announcement = text;
    });
  }

  // ---------- what is shown ----------

  get isLoading() {
    return this.status === "loading";
  }

  get isError() {
    return this.status === "error";
  }

  get isReady() {
    return this.status === "ready";
  }

  get isEmpty() {
    return this.isReady && this.lines.length === 0;
  }

  get count() {
    return this.answers.filter(isAnswer).length;
  }

  get countWord() {
    return this.count === 1 ? "answer" : "answers";
  }

  get hasCount() {
    return this.isReady && this.lines.length > 0;
  }

  get searching() {
    return this.lines.length > SEARCH_AT;
  }

  get q() {
    return this.searching ? this.query.trim() : "";
  }

  get found() {
    return this.lines.filter((line) => matches(line, this.q));
  }

  get shown() {
    const limit = this.q ? this.found.length : this.limit;
    return this.found.slice(0, limit).map((line) => this.lineView(line));
  }

  get more() {
    return !this.q && this.found.length > this.limit;
  }

  get moreLabel() {
    return `Show ${PAGE} more`;
  }

  /** What Shoresh already knew: last (after every line shown), and not searched. */
  get knew() {
    return this.q || this.more
      ? []
      : builtInRows(this.t).map((r) => ({ ...r, how: KNEW }));
  }

  /** Said at the end of the list, never left out silently (MEMO-7.7). */
  get showsCapped() {
    return this.capped && !this.q && !this.more;
  }

  get noMatches() {
    return !!this.q && this.found.length === 0;
  }

  get noMatchesText() {
    return `Nothing matches “${this.q}”.`;
  }

  stateOf(key) {
    return this.states[key] || {};
  }

  /** What this visit can undo on a line: only the newest line its Forget or Change added. */
  undoOf(line) {
    if (!line.answerId) {
      return null;
    }
    const undo = this.undos[`${line.kind}:${line.answerId}`];
    if (!undo) {
      return null;
    }
    const newest = this.lines.find(
      (l) => l.kind === line.kind && l.answerId === line.answerId
    );
    return newest === line ? undo : null;
  }

  lineView(line) {
    const state = this.stateOf(line.key);
    const editing = state.mode === "editing";
    const undo = this.undoOf(line);
    const answer = line.current ? line.answer : null;
    const pattern = line.current ? line.patternNow : null;
    const choice = state.choice ?? (answer ? answer.answer : null);
    const busy = !!state.pending;
    return {
      ...line,
      liClass: line.flag ? "row row_past" : "row",
      hasFlag: !!line.flag,
      editing,
      // Change and Forget on the answer remembered now; Undo on what this visit just did.
      canUndo: !!undo,
      undoLabel: `${UNDO_WORDS[line.kind] || "Undo"} ${line.title}`,
      undoText: state.pending === "undo" ? "Undoing..." : "Undo",
      canChange: !!answer && !editing && answer.choices.length > 1,
      changeLabel: `Change ${line.title}`,
      canForget: !!(answer || pattern) && !editing,
      forgetLabel: pattern
        ? `Forget pattern ${line.title}`
        : `Forget ${line.title}`,
      forgetText:
        state.pending === "forget"
          ? "Forgetting..."
          : pattern
            ? "Forget pattern"
            : "Forget",
      hasActions: !!undo || !!answer || !!pattern,
      isPattern: !!pattern,
      progress: pattern ? pattern.progress : "",
      patternFlag: pattern ? pattern.flag : "",
      dots: pattern
        ? [0, 1, 2].map((i) => ({
            key: `${line.key}:${i}`,
            className: i < pattern.meter ? "dot dot_on" : "dot"
          }))
        : [],
      choiceViews: answer
        ? answer.choices.map((c) => ({
            ...c,
            pressed: c.value === choice ? "true" : "false",
            className:
              c.value === choice
                ? "shoresh-item shoresh-raised"
                : "shoresh-item"
          }))
        : [],
      canSave: !!answer && choice !== answer.answer,
      saveText: state.pending === "change" ? "Saving..." : "Save",
      busy,
      error: state.error || ""
    };
  }

  // ---------- the rail ----------

  handleSearch(event) {
    this.query = event.target.value || "";
  }

  handleClear() {
    this.query = "";
    this.focusAfter = '[data-id="search"]';
  }

  handleRetryLoad() {
    this.load();
  }

  handleMore() {
    this.limit += PAGE;
  }

  // ---------- a line ----------

  lineOf(event) {
    const key = event.currentTarget.dataset.line;
    return this.lines.find((l) => l.key === key);
  }

  setState(key, state) {
    this.states = { ...this.states, [key]: state };
  }

  handleChange(event) {
    const line = this.lineOf(event);
    if (!line) {
      return;
    }
    this.setState(line.key, { mode: "editing", choice: line.answer.answer });
    this.focusAfter = `[data-choice-of="${line.key}"][aria-pressed="true"]`;
  }

  handleChoice(event) {
    const line = this.lineOf(event);
    if (!line) {
      return;
    }
    this.setState(line.key, {
      ...this.stateOf(line.key),
      choice: event.currentTarget.dataset.value
    });
  }

  handleCancel(event) {
    this.closeEditor(this.lineOf(event));
  }

  handleEditorKey(event) {
    if (event.key === "Escape") {
      this.closeEditor(this.lineOf(event));
    }
  }

  closeEditor(line) {
    this.setState(line.key, {});
    this.focusAfter = `[data-id="change"][data-line="${line.key}"]`;
  }

  /** Change adds a line, newest, with Undo; the line it replaced stays, marked Updated. */
  handleSave(event) {
    const line = this.lineOf(event);
    if (!line) {
      return;
    }
    const answer = this.stateOf(line.key).choice;
    this.write(line, "change", () =>
      changeLearned({ campId: this.campId, answerId: line.answerId, answer })
    ).then((newId) => {
      if (newId) {
        this.setState(line.key, {});
        this.undos = {
          ...this.undos,
          [`changed:${newId}`]: { kind: "change", newId, oldId: line.answerId }
        };
        this.say("Updated.");
        this.load(() => this.focusUndo("changed", newId));
      }
    });
  }

  /** Forget adds a "Forgotten by you" line with Undo (Forget pattern too: its answers stay). */
  handleForget(event) {
    const line = this.lineOf(event);
    if (!line) {
      return;
    }
    if (line.patternNow) {
      this.forgetPattern(line);
      return;
    }
    this.write(line, "forget", () =>
      forgetLearned({ campId: this.campId, answerId: line.answerId })
    ).then((found) => {
      if (found) {
        this.undos = {
          ...this.undos,
          [`forgotten:${line.answerId}`]: {
            kind: "forget",
            answerId: line.answerId
          }
        };
        this.say(`Forgotten. ${line.answer.forgotten}`);
        this.load(() => this.focusUndo("forgotten", line.answerId));
      }
    });
  }

  forgetPattern(line) {
    const { template, antecedent } = line;
    const forgotten = line.patternNow.forgotten;
    this.write(line, "forget", () =>
      forgetLearnedPattern({ campId: this.campId, template, antecedent })
    ).then((ids) => {
      if (ids && ids.length) {
        this.undos = {
          ...this.undos,
          [`forgotten:${ids[0]}`]: { kind: "pattern", ids }
        };
        this.say(`Forgotten. ${forgotten}`);
        this.load(() => this.focusUndo("forgotten", ids[0]));
      }
    });
  }

  focusUndo(kind, answerId) {
    const line = this.lines.find(
      (l) => l.kind === kind && l.answerId === answerId
    );
    if (line) {
      this.focusAfter = `[data-id="undo"][data-line="${line.key}"]`;
    }
  }

  /**
   * Undo: the answer (or pattern) back as it was, with who answered it and when; it adds an
   * "Undone by you" line. Never over a newer answer (MEMO-4.3): the latest shows instead.
   */
  handleUndo(event) {
    const line = this.lineOf(event);
    if (!line) {
      return;
    }
    const undo = this.undoOf(line);
    if (!undo) {
      return;
    }
    const campId = this.campId;
    let call;
    if (undo.kind === "change") {
      call = () =>
        undoChangeLearned({ campId, newId: undo.newId, oldId: undo.oldId });
    } else if (undo.kind === "forget") {
      call = () => restoreLearned({ campId, answerId: undo.answerId });
    } else {
      const [newId, oldId] = undo.ids;
      call = () => {
        return oldId
          ? undoChangeLearned({ campId, newId, oldId })
          : forgetLearned({ campId, answerId: newId });
      };
    }
    this.write(line, "undo", call).then((done) => {
      if (done) {
        const undos = { ...this.undos };
        delete undos[`${line.kind}:${line.answerId}`];
        this.undos = undos;
        this.say(
          undo.kind === "change" ? "Changed back." : "Remembered again."
        );
        this.load(() => this.focusNewest(line));
      }
    });
  }

  /**
   * The cursor to the line that acts on what was undone (its Change, else its Forget), else the
   * heading: the answer's line, or the pattern's newest step.
   */
  focusNewest(undone) {
    const line = this.lines.find(
      (l) =>
        l.current &&
        (undone.pattern
          ? l.pattern === undone.pattern
          : l.question === undone.question)
    );
    this.focusAfter = line
      ? `[data-line="${line.key}"] [data-id="change"], [data-line="${line.key}"] [data-id="forget"]`
      : "[data-heading]";
  }

  handleRetry(event) {
    const line = this.lineOf(event);
    if (!line) {
      return;
    }
    const retry = this.stateOf(line.key).retry;
    if (retry) {
      retry();
    }
  }

  /**
   * One write for a line, its button saying what it is doing; a refusal stays on the line with
   * Try again. Resolves the answer when done, false when it was already gone or changed elsewhere
   * (the latest is read and shown), undefined when it failed.
   */
  async write(line, pending, call) {
    const before = this.stateOf(line.key);
    this.setState(line.key, { ...before, pending, error: "", retry: null });
    try {
      const found = await call();
      this.setState(line.key, { ...before, pending: null });
      if (!found) {
        this.notice = STALE;
        this.say(STALE);
        this.load(() => {
          this.focusAfter = "[data-heading]";
        });
      }
      return found;
    } catch (error) {
      this.setState(line.key, {
        ...before,
        pending: null,
        error: failed(NOT_SAVED, error),
        retry: () => this.retryOf(line, pending)
      });
      return undefined;
    }
  }

  retryOf(line, pending) {
    const fake = { currentTarget: { dataset: { line: line.key } } };
    if (pending === "change") {
      this.handleSave(fake);
    } else if (pending === "forget") {
      this.handleForget(fake);
    } else {
      this.handleUndo(fake);
    }
  }
}
