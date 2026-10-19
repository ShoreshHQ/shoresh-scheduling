import { LightningElement, api } from "lwc";
import previewPublish from "@salesforce/apex/GeneratedScheduleController.previewPublish";
import publish from "@salesforce/apex/GeneratedScheduleController.publish";
import unpublish from "@salesforce/apex/GeneratedScheduleController.unpublish";
import { errorMessage, failed } from "c/shoreshErrors";
import { publishQuestion, publishedWord } from "c/shoreshPublish";
import { MODE, checkGeneratedWeek } from "c/shoreshEngine";
import { stillNeeded, stillNeededSentence } from "c/shoreshSetupRules";
import {
  ACTION,
  CONFLICT,
  SAVED,
  addActivity,
  inputFor,
  loadWeek,
  saveEdits,
  saveWeek,
  setLocks
} from "c/shoreshGeneratedWeek";
import { dayLabel, days as dayPillsOf, groups } from "c/shoreshScheduleViews";
import { buildInPieces } from "./pieces";
import { lockChoices, lockedKeys, lockedText, weekCells } from "./locks";
import { activityCells, clearedDays, litCells, openCells } from "./week";
import { activityOptions, awayRows, lockOf } from "./editing";

// What each action is called on its button and while it runs.
const ACTION_LABEL = {
  [ACTION.GENERATE]: "Generate a schedule",
  [ACTION.REBUILD]: "Rebuild",
  [ACTION.TRY_ANOTHER]: "Try another",
  [ACTION.FILL_OPEN]: "Fill the open cells",
  [ACTION.START_OVER]: "Start over"
};

/**
 * The server's conflict sentence without its closing instruction ("Open it again…"): the box's
 * Reload button is the one way to act on it (one word per idea; Open is a cell here).
 */
function statementOf(message) {
  return String(message || "")
    .replace(/\s*Open it again\b[^.]*\.\s*$/, "")
    .trim();
}

/**
 * Generated Schedule (desktop: the generated route of ScheduleScreen.jsx): a program's week built
 * by the engine (c/shoreshEngine) in the browser and saved whole (c/shoreshGeneratedWeek, ADR
 * 0010). A week not generated yet offers "Generate a schedule". Then:
 *   Rebuild builds the whole week again with the same option (after a confirm; a version is kept
 *     first, and locked cells will stay once locks come, G4);
 *   Try another builds the next option, and Option brings back any option tried;
 *   Fill the open cells fills only the cells left Open;
 *   Start over clears every activity (after a confirm; a version is kept first).
 * The build runs a little at a time (ADR 0010 §22) with its progress shown, so a big week never
 * freezes the tab. A save someone else's save got in the way of writes nothing: the screen says
 * so and offers to reload. Dots, counters and the "Still to place" list are worked out from the
 * week on screen with the engine's own rules, whether it was just built or saved before.
 *
 * The week is drawn and edited by hand in the shared week editor (c-shoresh-week-editor, ADR
 * 0010 §38), the same as Manual Build's, with this screen's saver: every hand edit locks what it
 * changes (Greg's decision 2), so Rebuild keeps it. Builds and Lock wait while an edit saves.
 *
 * Publish and Unpublish work as on Manual Build (ADR 0008 part 5, ADR 0010 "Publish"): what would
 * change and what is still to do are shown first (a clean first publish goes at once); Unpublish
 * asks first. They wait while a build, a read, a hand edit or a Lock is under way, and those wait
 * while a publish is (SchedulePublish).
 *
 * setup: the season (SeasonSetupController.getSeasonSetup). terms: the camp's words.
 */
export default class ShoreshGeneratedSchedule extends LightningElement {
  @api terms;

  _setup;
  programId;
  weekId;
  // c/shoreshGeneratedWeek loadWeek's answer: { scheduleId, revision, option, notPlaced, input }.
  loaded;
  loadedFor;
  loadTicket = 0;
  // Moves on when the week shown is replaced by a read or a build (not by a hand edit, which
  // moves loadTicket on): a hand edit's answer is set aside only when the week it was made on is gone.
  weekTicket = 0;
  loading = false;
  // A read of the week under way, and one asked for while a build ran (done after it).
  reading = false;
  readAfterRun = false;
  error;
  // The error is a read's (cleared by the next read that works), not a save's.
  errorFromRead = false;
  // A save someone else's got in the way of: { message }.
  conflict;
  // The week Reload is reading after a conflict ("program|week"): edits wait while any read is
  // under way after it (Reload's, or one that took its place), until the latest lands or fails.
  reloading = null;
  // The build under way: { action, progress (0-100, or null until a long build first reports) }.
  busy;
  // The confirm open: { action }.
  // A Lock or Unlock being saved; the cell keyboard focus last reached in the editor's grid (its
  // grid key, and the slot: day, group and block positions in the week shown).
  locking = false;
  focusedCellKey = null;
  focusedSlot = null;
  confirming;
  // The highest option tried this visit, so each stays in Option to bring back.
  triedUpTo = 1;
  // How the editor shows the week (it says so with statechange): what the Lock menu offers.
  view = "day";
  dayIndex = 0;
  groupKey;
  // A hand edit is saving or waiting to (the editor's editstate): builds and Lock wait.
  editBusy = false;
  // What the editor is to be told once it is drawn: "fresh", "rebuilt" or "again" (show).
  editorNews = null;
  // The week to go on with from the hand edit just saved, until the editor says it is saved.
  lastSaved = null;
  // The locks as the editor takes them (cell keys), worked out once per week loaded.
  locksMemo = { of: undefined, keys: [] };
  // The season as the editor reads it, worked out once per season and week loaded.
  setupMemo = { setup: undefined, input: undefined, value: undefined };
  announcement = "";
  checksResetKey = 0;
  // The cells the open counter lights up ("date|groupId|blockId"), generated route.
  lit = new Set();
  focusAfterRender = null;
  // The last check and what it was worked out from (changed in place: never @track it).
  checkMemo = { inputs: null, result: null };
  // The week's published schedule ({ id, publishedAt, publishedBy, changedSince }), or null.
  publishState = null;
  // A preview, publish or unpublish is on its way (or its question is open).
  publishing = false;
  // The question before publishing (c-shoresh-ask): { heading, lines, confirmLabel, preview, week }.
  publishAsk = null;
  // The question before unpublishing: { heading, lines, publishedId, week }.
  unpublishAsk = null;
  // Where focus goes back to once it is drawn enabled again ("publish" or "unpublish"), or null.
  focusOn = null;

  @api
  get setup() {
    return this._setup;
  }
  set setup(value) {
    this._setup = value;
    const programs = this.programOptions.map((o) => o.value);
    const weeks = this.weekOptions.map((o) => o.value);
    if (!programs.includes(this.programId)) {
      this.programId = programs[0];
    }
    if (!weeks.includes(this.weekId)) {
      this.weekId = weeks[0];
    }
    // The season was read again (setup changed): read the week's inputs again too. For this same
    // week, a build under way or a confirm open goes on first (it is the director's own action),
    // then the week is read again; a conflict stays until the director answers it (Reload reads
    // the week). A build for a week that is gone stops.
    const same = `${this.programId}|${this.weekId}` === this.loadedFor;
    if (
      same &&
      (this.busy ||
        this.confirming ||
        this.locking ||
        this.editBusy ||
        this.publishing)
    ) {
      this.readAfterRun = true;
      return;
    }
    if (same && this.conflict) {
      return;
    }
    this.load(true);
  }

  connectedCallback() {
    this.onWindowFocus = () => this.refresh();
    window.addEventListener("focus", this.onWindowFocus);
  }

  disconnectedCallback() {
    window.removeEventListener("focus", this.onWindowFocus);
    // A build under way stops: nobody is looking.
    this.loadTicket += 1;
    this.weekTicket += 1;
    this.busy = null;
  }

  renderedCallback() {
    if (this.editorNews && this.weekEditor) {
      const how = this.editorNews;
      this.editorNews = null;
      this.tellEditor(how);
    }
    // Publish and Unpublish are held while they work and while the week is read again, so focus
    // fell from them: it goes back once they are drawn enabled again (WCAG 2.4.3), unless the
    // director has put it somewhere else meanwhile.
    if (this.focusOn && !this.publishDisabled) {
      // Unpublish is gone once the week has nothing published: Publish then.
      const button =
        this.template.querySelector(`[data-id="${this.focusOn}"]`) ||
        this.template.querySelector('[data-id="publish"]');
      this.focusOn = null;
      if (button && this.focusIsLost()) {
        button.focus();
      }
    }
    if (!this.focusAfterRender) {
      return;
    }
    const { cellKey, selector, grid: toGrid } = this.focusAfterRender;
    this.focusAfterRender = null;
    const editor = this.weekEditor;
    if (editor && (cellKey || toGrid)) {
      editor.focusCell(cellKey);
      return;
    }
    const target = selector && this.template.querySelector(selector);
    if (target) {
      target.focus();
    } else if (selector && editor) {
      // The build actions sit in the editor's toolbar, drawn once the editor has drawn the week
      // it was just told of: its render runs first, then this.
      Promise.resolve().then(() => {
        const later = this.template.querySelector(selector);
        if (later) {
          later.focus();
        }
      });
    }
  }

  get t() {
    return this.terms;
  }

  // ---------- choosing a program and week ----------

  get programOptions() {
    return ((this._setup && this._setup.programs) || []).map((entry) => ({
      label: entry.program.Name,
      value: entry.program.Id
    }));
  }
  get weekOptions() {
    return ((this._setup && this._setup.weeks) || []).map((week) => ({
      label: week.Name,
      value: week.Id
    }));
  }
  get programLabel() {
    return this.t.s("Program");
  }
  get weekLabel() {
    return this.t.s("Week");
  }
  get hasSeveralPrograms() {
    return this.programOptions.length > 1;
  }
  get canChoose() {
    return !!this.programId && !!this.weekId;
  }
  get cannotChoose() {
    return !this.canChoose;
  }
  get chooseMessage() {
    const t = this.t;
    return this.programId
      ? `No ${t.pIn("Week")} yet. Add them on the ${t.p("Week")} screen first.`
      : `No ${t.pIn("Program")} yet. Add one on the ${t.p("Program")} screen first.`;
  }
  get weekName() {
    const week = this.weekOptions.find((o) => o.value === this.weekId);
    return week ? week.label : "";
  }
  get programName() {
    const program = this.programOptions.find((o) => o.value === this.programId);
    return program ? program.label : "";
  }

  handleProgram(event) {
    this.programId = event.detail.value;
    this.load();
  }
  handleWeek(event) {
    this.weekId = event.detail.value;
    this.load();
  }

  /**
   * Reads the chosen week: the Generated draft if there is one, else the blank week it would
   * start from. again: the same week read again (after a save or a conflict, or coming back to
   * the window), keeping the view; otherwise a week shown fresh. True once the week read is
   * shown.
   */
  async load(again = false) {
    const key = this.canChoose ? `${this.programId}|${this.weekId}` : null;
    const fresh = key !== this.loadedFor;
    if (key && !fresh && !again) {
      return false;
    }
    this.loadTicket += 1;
    this.weekTicket += 1;
    const ticket = this.loadTicket;
    // A build or a Lock under way for another week (or season) stops: its ticket is gone.
    this.busy = null;
    this.locking = false;
    this.readAfterRun = false;
    this.confirming = null;
    if (!key) {
      this.loaded = null;
      this.loadedFor = null;
      this.reading = false;
      this.loading = false;
      this.reloading = null;
      return false;
    }
    this.loadedFor = key;
    // Publish and Unpublish are disabled while the week is read: one focused gets focus back
    // (as on Manual Build).
    const focused = this.template.activeElement;
    const focusedId = focused && focused.dataset ? focused.dataset.id : null;
    if (focusedId === "publish" || focusedId === "unpublish") {
      this.focusOn = focusedId;
    }
    this.reading = true;
    if (fresh) {
      this.loaded = null;
      this.error = null;
      this.conflict = null;
      // Another week: a publish question open for the last one goes (nothing was sent).
      this.publishState = null;
      this.publishAsk = null;
      this.unpublishAsk = null;
      this.publishing = false;
    }
    this.loading = !this.loaded;
    try {
      const loaded = await loadWeek(this.programId, this.weekId);
      if (ticket !== this.loadTicket) {
        return false;
      }
      if (this.errorFromRead) {
        this.error = null;
        this.errorFromRead = false;
      }
      this.show(loaded, fresh);
      // The week Reload asked for, read again (by Reload or a read that took its place).
      if (!fresh && this.reloading === key) {
        this.reloaded();
      }
      return true;
    } catch (e) {
      if (ticket === this.loadTicket) {
        this.error = errorMessage(e);
        this.errorFromRead = true;
        if (fresh) {
          this.loadedFor = null;
        }
      }
    } finally {
      if (ticket === this.loadTicket) {
        this.loading = false;
        this.reading = false;
        if (this.reloading) {
          this.reloading = null;
          this.resetChecks();
        }
      }
    }
    return false;
  }

  show(loaded, fresh) {
    this.loaded = loaded;
    this.publishState = loaded.published || null;
    if (fresh) {
      this.triedUpTo = loaded.option || 1;
      this.view = "day";
      this.dayIndex = 0;
      const all = groups(this.schedule);
      this.groupKey = all.length ? all[0].key : null;
      this.focusedCellKey = null;
      this.focusedSlot = null;
      this.resetChecks();
    }
    this.showInEditor(fresh ? "fresh" : "again");
  }

  /** Coming back to the window shows other people's saves, unless something is under way. */
  refresh() {
    if (
      this.loaded &&
      !this.reading &&
      !this.busy &&
      !this.locking &&
      !this.confirming &&
      !this.conflict &&
      !this.publishing &&
      (!this.weekEditor || this.weekEditor.settled)
    ) {
      this.load(true);
    }
  }

  // ---------- the week shown ----------

  get isGenerated() {
    return !!(this.loaded && this.loaded.scheduleId);
  }
  get showStart() {
    return (
      this.canChoose &&
      !!this.loaded &&
      !this.isGenerated &&
      !this.hasNoDays &&
      !this.conflict &&
      this.stillNeeded.length === 0
    );
  }

  // ---------- what building still needs (as Manual Build: desktop readiness.js) ----------

  /** What building still needs: Generate waits for all of it, as Manual Build's Start does. */
  get stillNeeded() {
    return stillNeeded(this._setup, this.t, this.programId);
  }
  /** The desktop's one sentence, each missing thing a link to its screen. */
  get stillNeededParts() {
    return stillNeededSentence(this.stillNeeded);
  }
  /** The desktop's main action: "Set up <the first thing missing>". */
  get setUpFirstLabel() {
    const [first] = this.stillNeeded;
    return first ? `Set up ${first.label}` : "";
  }
  get setUpFirstScreen() {
    const [first] = this.stillNeeded;
    return first ? first.screen : null;
  }
  /**
   * Before the first Generate only (a week already generated is shown whatever setup lacks),
   * and as the one message: not beside "No weeks yet", a load error or a conflict (as Manual
   * Build's chain).
   */
  get showStillNeeded() {
    return (
      this.canChoose &&
      !!this.loaded &&
      !this.loading &&
      !this.error &&
      !this.conflict &&
      !this.isGenerated &&
      this.stillNeeded.length > 0
    );
  }
  /** "Week 1 has no days Main runs.", unless what is still needed already says it. */
  get showNoDays() {
    return this.hasNoDays && !this.showStillNeeded;
  }
  handleStillNeeded(event) {
    event.preventDefault();
    this.dispatchEvent(
      new CustomEvent("navigate", {
        detail: { screen: event.currentTarget.dataset.screen }
      })
    );
  }
  get showWeek() {
    return this.isGenerated && !this.hasNoDays;
  }
  /** The build's bar, errors, a conflict and Not placed: under the editor's toolbar once it shows. */
  get showStatusAbove() {
    return !this.showWeek;
  }
  get hasNoDays() {
    return !!this.loaded && this.loaded.input.days.length === 0;
  }
  get noDaysMessage() {
    return `${this.weekName} has no days ${this.programName} runs.`;
  }
  get notPlaced() {
    const lines =
      (!this.isGenerated && this.loaded && this.loaded.notPlaced) || [];
    return lines.length ? lines : null;
  }

  /**
   * The engine's input for this week, with the camp's words: the data module's for the action
   * (Start over builds without locks; every other build keeps them), or the week as loaded.
   */
  engineInput(days, extra = {}, action = null) {
    const base = action ? inputFor(this.loaded, action) : this.loaded.input;
    return { ...base, days, terms: this.t, ...extra };
  }

  /**
   * The week checked by the engine's rules (checkGeneratedWeek), worked out again only when the
   * week or the camp's words change: { days (date order), checked, isAway }.
   */
  get week() {
    const loaded = this.loaded;
    // Keyed on the week's input alone: the camp's words come with the season, and when they
    // change the season (and so the week) is read again.
    const inputs = [loaded && loaded.input];
    const memo = this.checkMemo;
    if (memo.inputs && memo.inputs.every((input, i) => input === inputs[i])) {
      return memo.result;
    }
    const result = loaded
      ? this.checkDays(loaded.input.days, loaded.input.locks)
      : null;
    memo.inputs = inputs;
    memo.result = result;
    return result;
  }

  /**
   * Days checked by the engine's rules with these locks ({ date, groupId, blockId }): { days,
   * checked (with openCells and openReasons), isAway, locked, shortest }.
   */
  checkDays(days, locks) {
    const week = checkGeneratedWeek(this.engineInput(days, { locks }));
    const locked = lockedKeys(locks);
    // A cell the director locked empty is kept empty: not Open, not to fill (G4 §31).
    const open = openCells(
      week.days,
      week.isAway,
      this.t,
      week.shortest,
      (dateValue, groupId, blockId) =>
        locked.has(`${dateValue}|${groupId}|${blockId}`)
    );
    // Why each Open cell is Open, when the grid can say (its dot's words).
    const openReasons = new Map(
      open
        .filter((cell) => cell.reason)
        .map((cell) => [
          `${cell.dateValue}|${cell.groupId}|${cell.blockId}`,
          cell.reason
        ])
    );
    return {
      ...week,
      locked,
      openReasons,
      checked: { ...week.checked, openCells: open, openReasons }
    };
  }

  get schedule() {
    return this.week ? { days: this.week.days } : null;
  }
  get checked() {
    return this.week ? this.week.checked : null;
  }

  resetChecks() {
    this.checksResetKey += 1;
    this.lit = new Set();
  }

  // ---------- actions ----------

  get option() {
    return (this.loaded && this.loaded.option) || 1;
  }
  get isBusy() {
    return !!this.busy;
  }
  /** The program and week pickers wait for a build, a Lock, a hand edit or a publish under way. */
  get pickerDisabled() {
    return this.isBusy || this.locking || this.editBusy || this.publishing;
  }
  get actionsDisabled() {
    // Also while the week is being read (Reload, coming back to the window): a build started
    // then would build on the week the read is about to replace. And while a hand edit saves:
    // a build then would replace the week the edit is being saved into. And while a publish
    // is on its way: its answer, published or refused, is for the week as it was.
    return (
      this.isBusy ||
      !!this.conflict ||
      this.loading ||
      this.reading ||
      this.locking ||
      this.editBusy ||
      this.publishing
    );
  }
  get cannotFill() {
    return (
      this.actionsDisabled ||
      !this.checked ||
      this.checked.openCells.length === 0
    );
  }
  get optionLabel() {
    return "Option";
  }
  get optionValue() {
    return String(this.option);
  }
  /** Every option tried this visit (and the one saved), to bring one back. */
  get optionChoices() {
    const top = Math.max(this.triedUpTo, this.option);
    return Array.from({ length: top }, (_, i) => ({
      label: String(i + 1),
      value: String(i + 1)
    }));
  }
  get generateLabel() {
    return ACTION_LABEL[ACTION.GENERATE];
  }

  handleGenerate() {
    this.run(ACTION.GENERATE, this.option);
  }
  handleRebuild() {
    this.confirming = { action: ACTION.REBUILD };
    this.focusConfirm();
  }
  handleStartOver() {
    this.confirming = { action: ACTION.START_OVER };
    this.focusConfirm();
  }
  handleTryAnother() {
    this.run(ACTION.TRY_ANOTHER, this.option + 1);
  }
  handleOption(event) {
    const chosen = Number(event.detail.value);
    if (chosen && chosen !== this.option) {
      this.run(ACTION.TRY_ANOTHER, chosen);
    }
  }
  handleFillOpen() {
    this.run(ACTION.FILL_OPEN, this.option);
  }

  /**
   * Builds the week (or clears it, for Start over) and saves it whole. Nothing is shown as saved
   * until the server has it; a conflict or a refusal leaves the week as it was.
   */
  async run(action, option) {
    if (this.busy || !this.loaded || this.editBusy) {
      return;
    }
    // The build takes the screen's turn: a read of the week sent before it (coming back to the
    // window) is set aside when it answers, so it can't put back the week this replaces.
    this.loadTicket += 1;
    this.weekTicket += 1;
    const ticket = this.loadTicket;
    this.reading = false;
    this.loading = false;
    const loaded = this.loaded;
    this.error = null;
    this.errorFromRead = false;
    // No number until a long build first says how far it has got (a short one never does).
    this.busy = { action, progress: null };
    this.announce(this.busyText);
    let days;
    try {
      if (action === ACTION.START_OVER) {
        days = clearedDays(loaded.input.days);
      } else {
        const result = await buildInPieces(
          this.engineInput(
            loaded.input.days,
            {
              option,
              mode: action === ACTION.FILL_OPEN ? MODE.FILL_OPEN : MODE.FULL
            },
            action
          ),
          (fraction) => {
            if (this.busy) {
              this.busy = { action, progress: Math.round(fraction * 100) };
            }
          },
          () => ticket === this.loadTicket
        );
        if (!result) {
          return;
        }
        if (!result.ok) {
          this.error = result.error;
          return;
        }
        days = result.days;
        if (this.busy && this.busy.progress !== null) {
          this.busy = { action, progress: 100 };
        }
      }
      const saved = await saveWeek(loaded, { action, option, days });
      if (ticket !== this.loadTicket) {
        return;
      }
      if (saved.status === SAVED) {
        // The data module's week to go on with (days, revision and the locks the server kept,
        // replaced together; never patched here), on the option just built.
        this.loaded = { ...saved.loaded, option, notPlaced: [] };
        // Beside the week as saved: a Rebuild that changed nothing is not "changed since".
        this.publishState = saved.published;
        this.triedUpTo = Math.max(this.triedUpTo, option);
        this.resetChecks();
        // A whole new week: Undo starts over (its steps were made on the week it replaced).
        this.showInEditor("rebuilt");
        const { filled, total } = this.checked.cells;
        this.announce(`Filled ${filled} of ${total}.`);
      } else if (saved.status === CONFLICT) {
        // The box is an alert: it is read out once, there.
        this.conflict = { message: statementOf(saved.message) };
      } else {
        this.error = saved.message;
      }
    } catch (e) {
      if (ticket === this.loadTicket) {
        this.error = errorMessage(e);
      }
    } finally {
      if (ticket === this.loadTicket) {
        this.busy = null;
        this.showSavedOption();
        this.focusAfterRender = { selector: this.focusAfterRun(action) };
        // A read asked for while it ran; not after a conflict, which stays until Reload.
        const readNow = this.readAfterRun && !this.conflict;
        this.readAfterRun = false;
        if (readNow) {
          this.load(true);
        }
      }
    }
  }

  /** Option shows the option saved, also after a pick that wasn't saved (refused, conflict). */
  showSavedOption() {
    const picker = this.template.querySelector('[data-id="option"]');
    if (picker) {
      picker.value = this.optionValue;
    }
  }

  /**
   * Where focus goes once a build is over: the button that started it (the confirm's is gone,
   * and the others were held while building); Reload after a conflict; Rebuild after the first
   * Generate (its button is gone too).
   */
  focusAfterRun(action) {
    if (this.conflict) {
      return '[data-id="reload"]';
    }
    if (!this.isGenerated) {
      return '[data-id="generate"]';
    }
    return `[data-action="${action === ACTION.GENERATE ? ACTION.REBUILD : action}"]`;
  }

  /** The desktop's "Generating…"; Start over builds nothing, it starts over. */
  get busyText() {
    return this.busy && this.busy.action === ACTION.START_OVER
      ? "Starting over…"
      : "Generating…";
  }
  /** Until a long build reports, the bar moves without a number (desktop IndeterminateBar). */
  get progressKnown() {
    return !!this.busy && this.busy.progress !== null;
  }
  get progressValue() {
    return this.progressKnown ? String(this.busy.progress) : null;
  }
  get progressClass() {
    return this.progressKnown ? "progress" : "progress progress_moving";
  }
  get progressStyle() {
    return this.progressKnown ? `width: ${this.busy.progress}%;` : "";
  }

  /** Reload waits while a hand edit saves: the read would draw the week without it. */
  get reloadDisabled() {
    return this.editBusy;
  }

  /**
   * Someone else saved the week first: read it again, theirs, as it is now. Edits wait until it
   * is shown, so "as saved now" is said only of the week the read brought.
   */
  handleReload() {
    if (this.reloadDisabled) {
      return;
    }
    this.conflict = null;
    this.reloading = this.loadedFor;
    this.load(true);
  }

  /** Reload's week is on screen as saved now: focus to the main action, and said so. */
  reloaded() {
    if (this.conflict) {
      return;
    }
    this.focusAfterRender = {
      selector: this.isGenerated
        ? `[data-action="${ACTION.REBUILD}"]`
        : '[data-id="generate"]'
    };
    this.announce(`${this.weekName} as saved now.`);
  }

  // ---------- the confirm (Rebuild, Start over) ----------

  get confirmTitle() {
    return this.confirming && this.confirming.action === ACTION.START_OVER
      ? "Start over?"
      : "Rebuild this schedule?";
  }
  /**
   * The desktop's ConfirmRegenModal, as Greg's decisions change it: hand edits are locks and
   * stay (decision 2), so Rebuild no longer says it replaces them; Start over clears everything,
   * locks too. Each names the week and what it changes, then that a version is kept first.
   */
  get confirmBody() {
    if (!this.confirming || !this.checked) {
      return "";
    }
    // Locked cells stay through a Rebuild and are cleared by Start over (decision 2); said only
    // when the week has some.
    const anyLocked = this.week.locked.size > 0;
    if (this.confirming.action !== ACTION.START_OVER) {
      return `Builds ${this.weekName} again from your setup.${anyLocked ? " Locked cells stay as they are." : ""}`;
    }
    // What Start over clears: each cell holding an activity where the bunk is at camp. Things
    // not set up yet (an elective, a trip) stay, so they aren't counted (Filled counts them).
    const n = activityCells(this.week.days, this.week.isAway);
    const word = this.t.sIn("Activity");
    const cells = `the ${n} ${word} ${n === 1 ? "cell" : "cells"}`;
    let clears = `Clears ${cells} in ${this.weekName}.`;
    if (n && anyLocked) {
      clears = `Clears ${cells} and every lock in ${this.weekName}.`;
    } else if (anyLocked) {
      clears = `Clears every lock in ${this.weekName}; there are no ${word} cells to clear.`;
    } else if (!n) {
      clears = `There are no ${word} cells to clear in ${this.weekName}.`;
    }
    return `${clears} ${this.t.p("FixedActivity")} and ${this.t.pIn("RecurringActivity")} stay.`;
  }
  get confirmNote() {
    return `Saved to ${this.t.p("Version")} first.`;
  }
  get confirmLabel() {
    return this.confirming && this.confirming.action === ACTION.START_OVER
      ? "Start over"
      : "Rebuild it";
  }

  focusConfirm() {
    // Cancel gets focus first, as on the desktop.
    Promise.resolve().then(() => {
      const cancel = this.template.querySelector('[data-id="confirm-cancel"]');
      if (cancel) {
        cancel.focus();
      }
    });
  }

  handleConfirm() {
    const { action } = this.confirming;
    this.confirming = null;
    this.run(action, this.option);
  }
  handleCancelConfirm() {
    const action = this.confirming && this.confirming.action;
    this.confirming = null;
    // The season was read again while the confirm was open: the week now.
    if (this.readAfterRun) {
      this.readAfterRun = false;
      this.load(true);
    }
    Promise.resolve().then(() => {
      const back = this.template.querySelector(`[data-action="${action}"]`);
      if (back) {
        back.focus();
      }
    });
  }
  handleConfirmKeyDown(event) {
    if (event.key === "Escape") {
      event.stopPropagation();
      this.handleCancelConfirm();
      return;
    }
    if (event.key === "Tab") {
      // Focus stays in the dialog.
      const buttons = [
        ...this.template.querySelectorAll('[data-id="confirm"] button')
      ];
      const at = buttons.indexOf(this.template.activeElement);
      const next = event.shiftKey
        ? (at - 1 + buttons.length) % buttons.length
        : (at + 1) % buttons.length;
      if (buttons.length) {
        event.preventDefault();
        buttons[next].focus();
      }
    }
  }

  // ---------- counters and the "Still to place" list ----------

  handleHighlight(event) {
    const { lines } = event.detail;
    this.lit = this.week
      ? litCells(lines, this.checked, this.week.days)
      : new Set();
  }

  /** A line was clicked: that group's week, at that cell when it names one (desktop; the editor's showLine). */
  handleLocate(event) {
    const line = event.detail;
    if (!line || !line.groupId || !this.weekEditor) {
      return;
    }
    this.weekEditor.showLine(line);
  }

  // ---------- Lock (decision 3) ----------

  /** The cell keyboard focus last reached in the editor's grid, so the Lock menu can offer it. */
  handleCellFocus(event) {
    this.focusedCellKey = event.detail.key;
    this.focusedSlot = event.detail.slot || null;
  }

  /** That cell, if the week shown still has it: what the Lock menu needs of it. */
  get focusedCell() {
    const slot = this.focusedSlot;
    const day = slot && this.schedule ? this.schedule.days[slot.day] : null;
    const grp = day && !day.problem ? day.groups[slot.group] : null;
    const block = grp ? day.blocks[slot.block] : null;
    if (!block) {
      return null;
    }
    return {
      dateValue: day.dateValue,
      groupId: grp.id,
      blockId: block.id,
      groupName: grp.name,
      where: [grp.name, dayLabel(day.dateValue).label, block.name].join(" · ")
    };
  }

  /** What the Lock menu offers now: the focused cell, the day or group shown, the cell's group's day. */
  get lockMenu() {
    // A day that can't be read makes the server refuse any change (it reads the whole week):
    // nothing to offer then; the day says why.
    if (
      !this.week ||
      this.isActivity ||
      this.week.days.some((day) => day.problem)
    ) {
      return [];
    }
    const cells = weekCells(this.week.days, this.week.locked, this.week.isAway);
    const pill = this.isDaily
      ? this.dayPills.find((d) => d.index === this.dayIndex)
      : null;
    const grp = this.isGroup
      ? this.groupPills.find((g) => g.key === this.groupKey)
      : null;
    return lockChoices(cells, {
      cell: this.focusedCell,
      day:
        pill && !pill.problem
          ? {
              dateValue: this.schedule.days[pill.index].dateValue,
              name: pill.label
            }
          : null,
      group: grp ? { groupId: grp.key, name: grp.name } : null
    });
  }
  /** The menu stays in the toolbar; with nothing to offer it is there, held. */
  get lockDisabled() {
    return this.actionsDisabled || this.lockMenu.length === 0;
  }

  /**
   * A locked cell was asked to change (Enter or a click in the editor): nothing unlocks without
   * the director choosing Unlock (ADR 0010 §37), so the Lock menu now offers that cell, focus
   * stays on it, and the line says it is locked (the menu offering it shows where its Unlock is).
   */
  handleUnlockRequest(event) {
    this.focusedSlot = event.detail.slot;
    const cell = this.focusedCell;
    if (cell && this.weekEditor) {
      this.weekEditor.say(`${cell.where} is locked.`);
    }
  }

  /** Lock or Unlock what the menu named, on the server, then show the week as saved. */
  async handleLockSelect(event) {
    const choice = this.lockMenu.find((c) => c.value === event.detail.value);
    if (!choice || this.lockDisabled) {
      return;
    }
    const ticket = this.loadTicket;
    const loaded = this.loaded;
    this.locking = true;
    this.error = null;
    this.errorFromRead = false;
    try {
      const result = await setLocks(loaded, [choice.change]);
      if (ticket !== this.loadTicket) {
        return;
      }
      if (result.status === SAVED) {
        // Every cell whose lock the choice set, locked already or not: Undo and Redo of earlier
        // steps leave them as the director chose.
        if (this.weekEditor) {
          this.weekEditor.lockChosen(choice.keys);
        }
        // The week to go on with, its locks as saved (never patched here).
        this.loaded = {
          ...result.loaded,
          option: loaded.option,
          notPlaced: []
        };
        this.showInEditor("again");
        // A line such as "<cell> is locked." is no longer true once the Lock or Unlock is saved.
        if (this.weekEditor) {
          this.weekEditor.clearNotice();
        }
        this.announce(lockedText(choice));
        // The menu was held while it saved, which drops focus: back to it, or to the grid when
        // the menu has nothing left to offer (it is held then).
        this.focusAfterRender = this.lockMenu.length
          ? { selector: '[data-id="lock-menu"]' }
          : { cellKey: this.focusedCellKey, grid: true };
      } else if (result.status === CONFLICT) {
        this.conflict = { message: statementOf(result.message) };
        this.focusAfterRender = { selector: '[data-id="reload"]' };
      } else {
        this.error = result.message;
        this.focusAfterRender = { selector: '[data-id="lock-menu"]' };
      }
    } finally {
      if (ticket === this.loadTicket) {
        this.locking = false;
        // A read asked for while it saved; not after a conflict, which stays until Reload.
        const readNow = this.readAfterRun && !this.conflict;
        this.readAfterRun = false;
        if (readNow) {
          this.load(true);
        }
      }
    }
  }

  // ---------- hand editing (the shared week editor) ----------

  get weekEditor() {
    return this.template.querySelector("c-shoresh-week-editor");
  }
  get isDaily() {
    return this.view === "day";
  }
  get isGroup() {
    return this.view === "group";
  }
  get isActivity() {
    return this.view === "activity";
  }
  get dayPills() {
    return dayPillsOf(this.schedule);
  }
  get groupPills() {
    return groups(this.schedule);
  }
  // The screen's own toolbar (the pickers alone) until the week is drawn; then the editor's.
  get showToolbar() {
    return !this.showWeek;
  }
  // Edits wait while a build or a Lock is saved, or Reload reads the week (it is about to be
  // replaced), and while a publish is on its way (its answer is for the week as it was).
  get editsWait() {
    return this.isBusy || this.locking || !!this.reloading || this.publishing;
  }

  /**
   * The season as the editor reads it (activity names and places), with this week's activities:
   * one added from a cell ("Add <name> to activities") joins them at once, before the season is
   * read again.
   */
  get editorSetup() {
    const input = this.loaded ? this.loaded.input : null;
    const memo = this.setupMemo;
    if (memo.setup !== this._setup || memo.input !== input) {
      memo.setup = this._setup;
      memo.input = input;
      memo.value = input
        ? {
            ...this._setup,
            activities: input.activities,
            locations: input.locations
          }
        : this._setup;
    }
    return memo.value;
  }

  /** The locks as the editor takes them ("date|groupId|blockId"), the same list while the week is the same. */
  get editorLocks() {
    const locks = this.loaded ? this.loaded.input.locks : null;
    const memo = this.locksMemo;
    if (memo.of !== locks) {
      memo.of = locks;
      memo.keys = [...lockedKeys(locks)];
    }
    return memo.keys;
  }

  /** The week as the editor shows it: the days checked, the activities to place, where groups are away. */
  get editorDraft() {
    const week = this.week;
    return {
      schedule: { schedule: { id: this.loaded.scheduleId }, days: week.days },
      activities: activityOptions(this.loaded.input, week.days),
      away: awayRows(week.days, week.isAway)
    };
  }

  /** The editor is told of a week from this screen (a read, a build, a Lock) once it is drawn. */
  showInEditor(how) {
    this.editorNews = how;
  }

  tellEditor(how) {
    const editor = this.weekEditor;
    if (!this.showWeek) {
      return;
    }
    // A week the editor hasn't shown yet starts at the first day and bunk.
    if (how === "fresh" || !editor.savedWeek) {
      // Another week: nothing of the last one is kept (Undo, the typing box, what was picked up).
      editor.clear();
      editor.show(this.editorDraft, true);
    } else if (how === "rebuilt") {
      editor.restored(this.editorDraft);
    } else {
      editor.show(this.editorDraft, false);
    }
  }

  /**
   * The editor's check of the week as it shows it (with the edits still saving): the engine's,
   * with those locks, so its dots, the Open reasons and the counts are this screen's own.
   */
  checkWith = (days, locks) =>
    this.checkDays(
      days,
      locks ? [...locks].map(lockOf) : this.loaded.input.locks
    ).checked;

  /** The editor saves each hand edit through here (GeneratedScheduleController.saveSlots). */
  saveRuns = async (edits) => {
    // Each edit moves loadTicket on (handleEdited), also one made while this one saves; the
    // answer still names the revision the next edit in the queue is sent from.
    const ticket = this.weekTicket;
    const loaded = this.loaded;
    const result = await saveEdits(loaded, edits);
    if (result.status !== SAVED) {
      return {
        status: "refused",
        conflicts: [],
        schedule: null,
        message: result.message
      };
    }
    if (ticket === this.weekTicket) {
      // Shown when the editor says it is saved (saved): the week to go on with.
      // An activity added while it saved ("Add <name> to activities") stays in the week's list.
      this.lastSaved = {
        ...result.loaded,
        input: {
          ...result.loaded.input,
          activities: this.loaded.input.activities
        },
        option: loaded.option,
        notPlaced: []
      };
    }
    return {
      status: "saved",
      conflicts: result.conflicts,
      schedule: result.schedule
    };
  };

  /** "Add <name> to activities" on this week's Generated draft; its record joins the week's. */
  addActivityWith = async (request) => {
    const added = await addActivity(request);
    const loaded = this.loaded;
    if (
      added.record &&
      loaded &&
      !loaded.input.activities.some((a) => a.Id === added.record.Id)
    ) {
      this.loaded = {
        ...loaded,
        input: {
          ...loaded.input,
          activities: [...loaded.input.activities, added.record]
        }
      };
    }
    return added;
  };

  /** A hand edit saved: the week to go on with is the one the server sent (never patched). */
  handleSaved() {
    if (this.lastSaved) {
      this.loaded = this.lastSaved;
      this.lastSaved = null;
    }
  }

  /** What the editor shows (view, day, bunk): the Lock menu offers what is on screen. */
  handleEditorState(event) {
    const { view, dayIndex, groupKey } = event.detail;
    if (
      view !== this.view ||
      dayIndex !== this.dayIndex ||
      groupKey !== this.groupKey
    ) {
      // Grid keys repeat from day to day and bunk to bunk: the cell reached is another grid's.
      this.focusedCellKey = null;
      this.focusedSlot = null;
    }
    this.view = view;
    this.dayIndex = dayIndex;
    this.groupKey = groupKey;
  }

  /** A hand edit saving or waiting holds builds and Lock; once all are saved, a read asked for meanwhile is done. */
  handleEditState(event) {
    const { busy, queueEmpty } = event.detail;
    this.editBusy = busy || !queueEmpty;
    if (
      !this.editBusy &&
      this.readAfterRun &&
      !this.busy &&
      !this.locking &&
      !this.confirming &&
      !this.conflict &&
      !this.publishing
    ) {
      this.readAfterRun = false;
      this.load(true);
    }
  }

  /**
   * A hand edit was made: a read of the week already on its way is older than it, and the week
   * is no longer what was published (the next read says exactly).
   */
  handleEdited() {
    this.loadTicket += 1;
    this.reading = false;
    this.loading = false;
    if (this.publishState && !this.publishState.changedSince) {
      this.publishState = { ...this.publishState, changedSince: true };
    }
  }

  handleEditorError(event) {
    this.error = event.detail.message;
    this.errorFromRead = false;
  }

  /** A hand edit failed: what is saved is read again. */
  handleEditorReload() {
    this.load(true);
  }

  announce(text) {
    // The same words twice in a row are still read out.
    this.announcement = this.announcement === text ? `${text} ` : text;
  }

  // ---------- Publish (as Manual Build: ADR 0008 part 5; ADR 0010 "Publish") ----------

  /**
   * Publish and Unpublish wait while a build, a read of the week (Reload, coming back to the
   * window), a hand edit, a Lock or a conflict is out (the question is worked out from the week
   * shown, so it waits for the week as it is), and while a publish is on its way.
   */
  get publishDisabled() {
    return this.actionsDisabled;
  }

  /**
   * Focus fell to the page (or stayed on Publish or Unpublish while they were held), rather than
   * being on something the director chose since.
   */
  focusIsLost() {
    const inside = this.template.activeElement;
    if (inside) {
      const id = inside.dataset ? inside.dataset.id : null;
      return id === "publish" || id === "unpublish";
    }
    const page = document.activeElement;
    return !page || page === document.body;
  }

  /** Said on the editor's quiet line and read out, as on Manual Build. */
  say(text) {
    if (this.weekEditor) {
      this.weekEditor.say(text);
    } else {
      this.announce(text);
    }
  }

  /**
   * Publish: the server's preview says what would change; with the week's checks (the Open
   * cells and their reasons, the dots, the counters) that decides whether to ask first
   * (c/shoreshPublish). A week already published as it is needs nothing.
   */
  async handlePublish() {
    if (this.publishDisabled || !this.isGenerated) {
      return;
    }
    // The answer is for this week ("program|week"); one for a week no longer shown is dropped.
    const week = this.loadedFor;
    this.publishing = true;
    this.error = null;
    this.errorFromRead = false;
    try {
      const preview = await previewPublish({
        scheduleId: this.loaded.scheduleId
      });
      if (week !== this.loadedFor) {
        return;
      }
      // Someone else saved the week since this screen read it: what would be published isn't
      // what is shown. Nothing is published; the week is read again for the director to see.
      if (preview.revisions !== this.loaded.revision) {
        this.refusePublish(this.draftChangedText);
        return;
      }
      const checks = this.template.querySelector("c-shoresh-week-checks");
      const question = publishQuestion({
        preview,
        checked: this.checked,
        // What the counters count now (lines the director accepted aside).
        counts: checks ? checks.counts : null,
        weekName: this.weekName,
        t: this.t
      });
      if (question.kind === "same") {
        this.publishState = { ...preview.published, changedSince: false };
        this.say(`${this.weekName} is already published as it is.`);
      } else if (question.kind === "now") {
        await this.publishNow(preview, week);
      } else {
        this.publishAsk = { ...question, preview, week };
      }
    } catch (e) {
      if (week === this.loadedFor) {
        this.error = failed(`${this.weekName} was not published.`, e);
      }
    } finally {
      if (!this.publishAsk) {
        this.publishDone(week, "publish");
      }
    }
  }

  async handlePublishAnswer(event) {
    const ask = this.publishAsk;
    this.publishAsk = null;
    try {
      if (event.detail.yes) {
        // The server refuses it if the week changed since the preview.
        await this.publishNow(ask.preview, ask.week);
      }
    } catch (e) {
      if (ask.week === this.loadedFor) {
        this.error = failed(`${this.weekName} was not published.`, e);
      }
    } finally {
      this.publishDone(ask.week, "publish");
    }
  }

  /**
   * Publishes the week the preview showed; a week or publish changed since is refused. The
   * answer is always shown, unless another week is shown by then.
   */
  async publishNow(preview, week) {
    const result = await publish({
      scheduleId: this.loaded.scheduleId,
      seenRevisions: preview.revisions,
      seenPublishedId: preview.published ? preview.published.id : null
    });
    if (week !== this.loadedFor) {
      return;
    }
    if (result.draftChanged || result.publishedChanged) {
      this.refusePublish(
        result.draftChanged
          ? this.draftChangedText
          : `Someone else published this ${this.t.sIn("Week")} since, so nothing was replaced.`
      );
      return;
    }
    this.publishState = { ...result.published, changedSince: false };
    this.say(
      result.unchanged
        ? `${this.weekName} is already published as it is.`
        : `Published ${this.weekName}.`
    );
  }

  /**
   * Unpublish (Greg, 2026-10-18): asks first, Cancel focused. The week then has no published
   * schedule; the one it had is kept as a version marked Published, as one replaced is.
   */
  handleUnpublish() {
    if (!this.publishState || this.publishDisabled) {
      return;
    }
    this.publishing = true;
    this.error = null;
    this.errorFromRead = false;
    this.unpublishAsk = {
      heading: `Unpublish ${this.weekName}?`,
      lines: [`Nothing will be published for this ${this.t.sIn("Week")}.`],
      publishedId: this.publishState.id,
      week: this.loadedFor
    };
  }

  async handleUnpublishAnswer(event) {
    const ask = this.unpublishAsk;
    this.unpublishAsk = null;
    try {
      if (event.detail.yes) {
        await this.unpublishNow(ask);
      }
    } catch (e) {
      if (ask.week === this.loadedFor) {
        this.error = failed(`${this.weekName} was not unpublished.`, e);
      }
    } finally {
      // Back to Unpublish, or to Publish once the week has nothing published.
      this.publishDone(ask.week, "unpublish");
    }
  }

  /** Refused when the week was published or unpublished since the screen showed it. */
  async unpublishNow(ask) {
    const result = await unpublish({
      scheduleId: this.loaded.scheduleId,
      seenPublishedId: ask.publishedId
    });
    if (ask.week !== this.loadedFor) {
      return;
    }
    if (result.publishedChanged) {
      this.refusePublish(
        `Someone else published or unpublished this ${this.t.sIn("Week")} since, so nothing was unpublished.`
      );
      return;
    }
    this.publishState = null;
    this.say(`Unpublished ${this.weekName}.`);
  }

  /**
   * A publish or unpublish is over: builds, edits and the pickers go on, focus goes back to its
   * button (WCAG 2.4.3) unless another week is shown by then, and a read asked for meanwhile (the
   * season read again) is done now.
   */
  publishDone(week, button) {
    this.publishing = false;
    if (week !== this.loadedFor) {
      return;
    }
    this.focusOn = button;
    const readNow = this.readAfterRun && !this.conflict;
    this.readAfterRun = false;
    if (readNow) {
      this.load(true);
    }
  }

  get draftChangedText() {
    return `Someone else changed this ${this.t.sIn("Week")} since, so nothing was published.`;
  }

  /** Nothing was published: the line says why, and the week is read again for the director. */
  refusePublish(text) {
    this.say(text);
    this.load(true);
  }

  /** "Published from Manual Build " before the date (c/shoreshPublish). */
  get publishedWord() {
    return publishedWord(this.publishState);
  }

  get publishedBy() {
    return this.publishState && this.publishState.publishedBy
      ? ` by ${this.publishState.publishedBy}`
      : "";
  }
}
