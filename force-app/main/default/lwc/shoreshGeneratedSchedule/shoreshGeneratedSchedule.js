import { LightningElement, api } from "lwc";
import { errorMessage } from "c/shoreshErrors";
import { FIELD } from "c/shoreshSchema";
import { MODE, checkGeneratedWeek } from "c/shoreshEngine";
import {
  ACTION,
  CONFLICT,
  SAVED,
  loadWeek,
  saveWeek
} from "c/shoreshGeneratedWeek";
import {
  activityCards,
  activityGrid,
  dailyGrid,
  days as dayPillsOf,
  groupGrid,
  groups,
  kindLabel
} from "c/shoreshScheduleViews";
import { buildInPieces } from "./pieces";
import {
  activityCells,
  clearedDays,
  coveredBlocks,
  isLit,
  litCells,
  openCells
} from "./week";

// What each action is called on its button and while it runs.
const ACTION_LABEL = {
  [ACTION.GENERATE]: "Generate a schedule",
  [ACTION.REBUILD]: "Rebuild",
  [ACTION.TRY_ANOTHER]: "Try another",
  [ACTION.FILL_OPEN]: "Fill the open cells",
  [ACTION.START_OVER]: "Start over"
};

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
 * Read-only here: changing cells by hand comes with locks (G4), since a hand edit is a lock
 * (Greg's decision 2) and Rebuild would otherwise undo it.
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
  loading = false;
  // A read of the week under way, and one asked for while a build ran (done after it).
  reading = false;
  readAfterRun = false;
  error;
  // A save someone else's got in the way of: { message }.
  conflict;
  // The build under way: { action, progress (0-100) }.
  busy;
  // The confirm open: { action }.
  confirming;
  // The highest option tried this visit, so each stays in Option to bring back.
  triedUpTo = 1;
  view = "day";
  dayIndex = 0;
  groupKey;
  activityId;
  announcement = "";
  checksResetKey = 0;
  // The cells the open counter lights up ("date|groupId|blockId"), generated route.
  lit = new Set();
  focusAfterRender = null;
  // The last check and what it was worked out from (changed in place: never @track it).
  checkMemo = { inputs: null, result: null };

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
    // The season was read again (setup changed): read the week's inputs again too. A build
    // under way for this same week finishes first (it is the director's own action), then the
    // week is read again; a build for a week that is gone stops.
    if (this.busy && `${this.programId}|${this.weekId}` === this.loadedFor) {
      this.readAfterRun = true;
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
    this.busy = null;
  }

  renderedCallback() {
    if (!this.focusAfterRender) {
      return;
    }
    const { cellKey, selector } = this.focusAfterRender;
    this.focusAfterRender = null;
    const grid = this.template.querySelector('[data-id="grid"]');
    if (grid && cellKey) {
      grid.focusCell(cellKey);
      return;
    }
    const target = selector && this.template.querySelector(selector);
    if (target) {
      target.focus();
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
   * the window), keeping the view; otherwise a week shown fresh.
   */
  async load(again = false) {
    if (!this.canChoose) {
      this.loaded = null;
      this.loadedFor = null;
      return;
    }
    const key = `${this.programId}|${this.weekId}`;
    const fresh = key !== this.loadedFor;
    if (!fresh && !again) {
      return;
    }
    this.loadedFor = key;
    this.loadTicket += 1;
    const ticket = this.loadTicket;
    // A build under way for another week stops (its ticket is gone).
    this.busy = null;
    this.readAfterRun = false;
    this.reading = true;
    this.confirming = null;
    if (fresh) {
      this.loaded = null;
      this.error = null;
      this.conflict = null;
    }
    this.loading = !this.loaded;
    try {
      const loaded = await loadWeek(this.programId, this.weekId);
      if (ticket !== this.loadTicket) {
        return;
      }
      this.show(loaded, fresh);
    } catch (e) {
      if (ticket === this.loadTicket) {
        this.error = errorMessage(e);
        if (fresh) {
          this.loadedFor = null;
        }
      }
    } finally {
      if (ticket === this.loadTicket) {
        this.loading = false;
        this.reading = false;
      }
    }
  }

  show(loaded, fresh) {
    this.loaded = loaded;
    this.conflict = null;
    if (fresh) {
      this.triedUpTo = loaded.option || 1;
      this.view = "day";
      this.dayIndex = 0;
      const all = groups(this.schedule);
      this.groupKey = all.length ? all[0].key : null;
      this.activityId = null;
      this.resetChecks();
    } else {
      this.triedUpTo = Math.max(this.triedUpTo, loaded.option || 1);
    }
  }

  /** Coming back to the window shows other people's saves, unless something is under way. */
  refresh() {
    if (
      this.loaded &&
      !this.reading &&
      !this.busy &&
      !this.confirming &&
      !this.conflict
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
      !this.conflict
    );
  }
  get showWeek() {
    return this.isGenerated && !this.hasNoDays;
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

  /** The engine's input for this week, with the camp's words. */
  engineInput(days, extra = {}) {
    return { ...this.loaded.input, days, terms: this.t, ...extra };
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
    let result = null;
    if (loaded) {
      const week = checkGeneratedWeek(this.engineInput(loaded.input.days));
      const sent = new Set((loaded.input.groups || []).map((g) => g.Id));
      result = {
        ...week,
        checked: {
          ...week.checked,
          // A bunk away this week keeps its row but isn't sent (G2 §13): nothing can go in it.
          openCells: openCells(
            week.days,
            (groupId, blockId) =>
              !sent.has(groupId) || week.isAway(groupId, blockId),
            this.t
          )
        }
      };
    }
    memo.inputs = inputs;
    memo.result = result;
    return result;
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
  get actionsDisabled() {
    return this.isBusy || !!this.conflict || this.loading;
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
    if (this.busy || !this.loaded) {
      return;
    }
    // The build takes the screen's turn: a read of the week sent before it (coming back to the
    // window) is set aside when it answers, so it can't put back the week this replaces.
    this.loadTicket += 1;
    const ticket = this.loadTicket;
    this.reading = false;
    this.loading = false;
    const loaded = this.loaded;
    this.error = null;
    this.busy = { action, progress: 0 };
    this.announce(this.busyText);
    let days;
    try {
      if (action === ACTION.START_OVER) {
        days = clearedDays(loaded.input.days);
      } else {
        const result = await buildInPieces(
          this.engineInput(loaded.input.days, {
            option,
            mode: action === ACTION.FILL_OPEN ? MODE.FILL_OPEN : MODE.FULL
          }),
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
      }
      const saved = await saveWeek(loaded, { action, option, days });
      if (ticket !== this.loadTicket) {
        return;
      }
      if (saved.status === SAVED) {
        this.loaded = {
          ...loaded,
          scheduleId: saved.scheduleId,
          revision: saved.revision,
          option,
          notPlaced: [],
          input: { ...loaded.input, days }
        };
        this.triedUpTo = Math.max(this.triedUpTo, option);
        this.resetChecks();
        const { filled, total } = this.checked.cells;
        this.announce(`Filled ${filled} of ${total}.`);
      } else if (saved.status === CONFLICT) {
        this.conflict = { message: saved.message };
        this.announce(saved.message);
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
        if (this.readAfterRun) {
          this.readAfterRun = false;
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

  get busyText() {
    return "Generating…";
  }
  get progressValue() {
    return this.busy ? String(this.busy.progress) : "0";
  }
  get progressStyle() {
    return `width: ${this.busy ? this.busy.progress : 0}%;`;
  }

  /** Someone else saved the week first: read it again, theirs, as it is now. */
  handleReload() {
    this.conflict = null;
    this.load(true).then(() => this.resetChecks());
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
    // What Start over clears: the activities (not things set up later, which it keeps).
    const filled = activityCells(this.week.days);
    const cells = `${filled} filled ${filled === 1 ? "cell" : "cells"}`;
    // Locks come in G4, which adds "Locked cells stay as they are." to Rebuild and "locked ones
    // too" to Start over (decision 2); until then there is nothing locked to speak of.
    return this.confirming.action === ACTION.START_OVER
      ? `Clears all ${cells} in ${this.weekName}. ${this.t.p("FixedActivity")} and ${this.t.pIn("RecurringActivity")} stay.`
      : `Builds ${this.weekName} again from your setup.`;
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

  /** A line was clicked: that group's week, at that cell when it names one (desktop). */
  handleLocate(event) {
    const line = event.detail;
    if (!line || !line.groupId) {
      return;
    }
    this.view = "group";
    this.groupKey = line.groupId;
    // The cell the line names; else the bunk's own pill, so focus is never left nowhere.
    this.focusAfterRender = {
      cellKey: this.cellKeyOf(line),
      selector: '[data-id="group-pills"] [aria-pressed="true"]'
    };
  }

  /** In Group View, the grid cell covering a line's day and time block, if it names one. */
  cellKeyOf(line) {
    if (!line.dateValue || !this.schedule) {
      return null;
    }
    const all = this.schedule.days;
    const d = all.findIndex((day) => day.dateValue === line.dateValue);
    const day = all[d];
    const g = day ? day.groups.findIndex((grp) => grp.id === line.groupId) : -1;
    if (g < 0) {
      return null;
    }
    const grid = groupGrid(this.schedule, line.groupId, this.t);
    const found = grid.cells.find(
      (c) =>
        c.slot &&
        c.slot.day === d &&
        coveredBlocks(day, g, c.slot.block).some((b) => b.id === line.blockId)
    );
    return found ? found.key : null;
  }

  // ---------- views ----------

  get viewButtons() {
    return [
      ["day", "Daily View"],
      ["group", "Group View"],
      ["activity", "Activity View"]
    ].map(([key, label]) => ({
      key,
      label,
      className:
        key === this.view ? "view-button view-button_on" : "view-button",
      pressed: String(key === this.view)
    }));
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
  handleView(event) {
    this.view = event.currentTarget.dataset.view;
    if (this.view !== "activity") {
      this.activityId = null;
    }
  }
  get corner() {
    return this.t.s("TimeBlock");
  }

  get dayPills() {
    return dayPillsOf(this.schedule).map((day) => ({
      ...day,
      className: day.index === this.dayIndex ? "pill pill_on" : "pill",
      pressed: String(day.index === this.dayIndex)
    }));
  }
  get dayProblem() {
    const day = this.schedule && this.schedule.days[this.dayIndex];
    return day && day.problem
      ? `This day could not be read: ${day.problem}.`
      : null;
  }
  get dailyGridLabel() {
    const day = this.dayPills.find((pill) => pill.index === this.dayIndex);
    return day ? day.label : null;
  }
  handleDay(event) {
    this.dayIndex = Number(event.currentTarget.dataset.index);
  }

  get groupPills() {
    return groups(this.schedule).map((grp) => ({
      ...grp,
      className: grp.key === this.groupKey ? "pill pill_on" : "pill",
      pressed: String(grp.key === this.groupKey)
    }));
  }
  get groupGridLabel() {
    const grp = this.groupPills.find((pill) => pill.key === this.groupKey);
    return grp ? grp.name : null;
  }
  handleGroup(event) {
    this.groupKey = event.currentTarget.dataset.key;
  }

  /** The grid on screen (Daily or Group View): dots, not-at-camp hatching, lit cells. */
  get grid() {
    if (!this.schedule) {
      return null;
    }
    const grid = this.isDaily
      ? dailyGrid(this.schedule, this.dayIndex, this.t)
      : this.groupKey && groupGrid(this.schedule, this.groupKey, this.t);
    if (!grid) {
      return null;
    }
    return { ...grid, cells: grid.cells.map((cell) => this.decorate(cell)) };
  }

  decorate(cell) {
    if (!cell.slot) {
      return cell;
    }
    const day = this.schedule.days[cell.slot.day];
    const grp = day.groups[cell.slot.group];
    const block = day.blocks[cell.slot.block];
    // Changing cells by hand comes with locks (G4): every cell is read-only for now.
    let result = {
      ...cell,
      readOnly: true,
      dot:
        this.checked.flags.get(`${day.dateValue}|${grp.id}|${block.id}`) || null
    };
    if (cell.open && this.week.isAway(grp.id, block.id)) {
      result = {
        ...result,
        text: "Not at camp",
        className: "cell cell_away",
        title: `${grp.name}: not at camp`
      };
    }
    if (isLit(this.lit, this.schedule.days, cell.slot)) {
      result = { ...result, className: `${result.className} cell_lit` };
    }
    return result;
  }

  get catalogue() {
    return (this.loaded && this.loaded.input.activities) || [];
  }
  locationName(activityId) {
    const activity = this.catalogue.find((a) => a.Id === activityId);
    const location =
      activity &&
      ((this.loaded && this.loaded.input.locations) || []).find(
        (l) => l.Id === activity[FIELD.Activity.Location]
      );
    return location ? location.Name : null;
  }
  get activityCards() {
    return activityCards(this.schedule, this.catalogue, this.t).map((card) => ({
      ...card,
      location: this.locationName(card.key)
    }));
  }
  get selectedActivity() {
    return this.activityCards.find((card) => card.key === this.activityId);
  }
  get activityGrid() {
    return activityGrid(this.schedule, this.activityId);
  }
  get allActivitiesLabel() {
    return `All ${this.t.p("Activity")}`;
  }
  handleActivity(event) {
    this.activityId = event.currentTarget.dataset.key;
  }
  handleAllActivities() {
    this.activityId = null;
  }

  get showLegend() {
    return !this.isActivity;
  }
  get legend() {
    return [
      {
        key: "activity",
        label: this.t.s("Activity"),
        className: "swatch swatch_activity"
      },
      {
        key: "set-time",
        label: `${this.t.s("FixedActivity")} or ${this.t.sIn("RecurringActivity")}`,
        className: "swatch swatch_set-time"
      },
      {
        key: "not-set-up",
        label: `Not set up yet (${["E", "D", "S", "T"].map((k) => kindLabel(k, this.t)).join(", ")})`,
        className: "swatch swatch_not-set-up"
      },
      {
        key: "open",
        label: "Open: nothing placed",
        className: "swatch swatch_open"
      },
      { key: "away", label: "Not at camp", className: "swatch swatch_away" }
    ];
  }

  announce(text) {
    // The same words twice in a row are still read out.
    this.announcement = this.announcement === text ? `${text} ` : text;
  }
}
