import { LightningElement, api } from "lwc";
import seatsSetup from "@salesforce/apex/ElectiveSeatsController.seatsSetup";
import openRun from "@salesforce/apex/ElectiveSeatsController.openRun";
import assignSeats from "@salesforce/apex/ElectiveSeatsController.assignSeats";
import changeSeat from "@salesforce/apex/ElectiveSeatsController.changeSeat";
import finalizeRun from "@salesforce/apex/ElectiveSeatsController.finalizeRun";
import startNewVersion from "@salesforce/apex/ElectiveSeatsController.startNewVersion";
import runDownload from "@salesforce/apex/ElectiveSeatsController.runDownload";
import clearPicture from "@salesforce/apex/ElectiveSeatsController.clearPicture";
import clearElectives from "@salesforce/apex/ElectiveSeatsController.clearElectives";
import { loadStyle } from "lightning/platformResourceLoader";
import PRINT_STYLE from "@salesforce/resourceUrl/ShoreshPrint";
import { downloadWorkbook, fileNameOf } from "c/shoreshDownload";
import { assignSeats as runEngine } from "c/shoreshElectiveEngine";
import { failed } from "c/shoreshErrors";
import { buildTerms } from "c/shoreshTerms";
import { FIELD } from "c/shoreshSchema";
import {
  assignRequest,
  buildBoard,
  engineInput,
  moveTargets,
  needsLook,
  problemSections,
  readRun
} from "./seats";
import {
  camperScheduleSheets,
  campersSheets,
  downloadTitle,
  fullReportSheets,
  readDownload,
  rosterPages,
  rosterSheets
} from "./downloads";
import { clearBoard } from "./clear";

const SCHEDULE = FIELD.Schedule;
const MEMO = new WeakMap();
const COMMITTED = "Committed";
const FINAL = "Final";
const ROSTER_HEADING = '[data-id="roster-heading"]';
const PRIMARY = '[data-id="primary"]';
const ASSIGN_AGAIN = '[data-id="assign-again"]';
// The run's menu: where the cursor goes after Finalize (the main button is then held for good)
// and after Start a new version (the menu it was chosen from).
const STATE_MENU = '[data-id="state"]';
const DOWNLOAD_MENU = '[data-id="download"]';
const CLEAR_HEADING = '[data-id="clear-heading"]';

// The menus' glyphs (the mock-ups' icons), one path each.
const ICONS = {
  rosters: "M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01",
  print: "M4.5 6V2.5h7V6M4.5 11.5h-2v-5h11v5h-2M4.5 9.5h7v4h-7Z",
  person:
    "M5.5 5.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M3 13.5c.6-2.6 2.6-4 5-4s4.4 1.4 5 4",
  sheet: "M2.5 2.5h11v11h-11ZM2.5 6.5h11M6.5 6.5v7",
  edit: "M10.5 3 13 5.5 6 12.5H3.5V10Z",
  trash: "M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5",
  download:
    "M8 2.5v8M5 7.5l3 3 3-3M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2",
  choices: "M3 4h10M3 8h7M3 12h4",
  seats: "M3 3h4v4H3ZM9 3h4v4H9ZM3 9h4v4H3ZM9 9h4v4H9Z",
  runs: "M4 2.5h5.5L12 5v8.5H4ZM6 8h4M6 10.5h4",
  sets: "M2.5 3h11v10h-11ZM2.5 6.5h11",
  linked:
    "M7 9a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5L8.5 4M9 7a2.5 2.5 0 0 0-3.5 0l-2 2A2.5 2.5 0 0 0 7 12.5l.5-.5"
};

/**
 * Elective seats (electives slice E7; repo ADR 0018 choices 28 to 37): who sits in which offering
 * at each elective time, for one elective set in one week. Greg's approved mock-ups
 * (design-research/electives-r1: seats-offering-a, seats-camper, seats-problems, seats-final,
 * seats-out-of-date) and decisions 48 and 53; behaviour and words from the desktop's
 * ScheduleElectivesScreen.jsx and elective/run (DraftRunView, FinalRunView, runStateCopy.js).
 *
 * The rail: the week and the set on the left (and "Assign against" when the week has more than
 * one schedule); By offering and By camper in the middle; on the right the counter ("212 of 214
 * placed", opening to the problems), Bring in choices, Assign again, the run's state (Committed;
 * Final · 14 Oct · Greg; Out of date), and the one main button: Assign seats, then Finalize, then
 * Download (slice E10). Seats are worked out in the browser (c/shoreshElectiveEngine) and checked
 * by the server as it saves them; locks and hand moves always beat the engine.
 */
export default class ShoreshElectiveSeats extends LightningElement {
  @api terms;
  // Where the screen starts when Roots' hand opened it ({ weekId, setId, scheduleId, runId }),
  // before the latest run.
  @api opening;

  _setup;
  @api
  get setup() {
    return this._setup;
  }
  set setup(value) {
    this._setup = value;
    if (value && value.season && value.season.Id) {
      this.loadSituation();
    }
  }

  situation = null;
  setId = null;
  weekId = null;
  scheduleId = null;
  runId = null;
  view = null;
  viewMode = "offering";
  openCell = null;
  openComment = null;
  busy = false;
  error = null;
  // The refusal's action in place ("Schedule changed. Assign again first." offers Assign again).
  errorAction = null;
  status = "";
  focusAfter = null;
  loadTicket = 0;
  // The name being dragged to another offering: { camperId, cell }.
  dragging = null;
  // Downloads: the final run as they read it (one read per run and revision), and the rosters
  // on paper while they print.
  downloadHeld = null;
  printout = null;
  printPending = false;
  printStyleLoaded = false;
  // End-of-season Clear: open, its picture, which week (null: the whole season), why refused,
  // and where the cursor goes back to.
  clearing = false;
  clearData = null;
  clearWeekId = null;
  clearError = null;
  clearFrom = null;

  /** The screen's heading takes the cursor when it opens (the page asks). */
  @api
  focusHeading() {
    const heading = this.template.querySelector("[data-heading]");
    if (heading) heading.focus();
  }

  /**
   * After a change, the cursor goes where focusAfter says (WCAG 2.4.3): one selector, or several
   * in order of preference, the first that is on the screen and can take it.
   */
  renderedCallback() {
    if (
      this.printPending &&
      this.template.querySelector("c-shoresh-roster-print")
    ) {
      this.startPrint();
    }
    if (!this.focusAfter) return;
    const selectors = [].concat(this.focusAfter);
    this.focusAfter = null;
    const target = selectors
      .map((selector) => this.template.querySelector(selector))
      .find((el) => el && !el.disabled && typeof el.focus === "function");
    if (target) target.focus();
  }

  get t() {
    return this.terms || buildTerms([]);
  }

  // ---------- the start: the season's runs, and which one is shown ----------

  async loadSituation() {
    const seasonId = this._setup.season.Id;
    const ticket = ++this.loadTicket;
    try {
      const situation = await seatsSetup({ seasonId });
      if (ticket !== this.loadTicket) return;
      this.situation = situation;
      this.pickStart();
      await this.loadRun();
    } catch (e) {
      this.error = failed(`Couldn't open ${this.screenTitle}.`, e);
    }
  }

  /**
   * Opens on a run (Roots' hand, repo ADR 0020 choice 10: the offerings kept below their minimum
   * are that run's): its set, week, schedule and the run itself; when that run is gone, its set
   * and week as before. Always true: nothing here waits to change week.
   */
  @api
  openWeek(weekId, setId, scheduleId, runId) {
    const set = this.sets.some((s) => s.Id === setId) ? setId : this.setId;
    const week = this.weeks.some((w) => w.Id === weekId) ? weekId : this.weekId;
    const run = this.runAsked(set, week, scheduleId, runId);
    if (
      set !== this.setId ||
      week !== this.weekId ||
      (run && run.id !== this.runId)
    ) {
      this.setId = set;
      this.weekId = week;
      this.scheduleId = run ? run.scheduleId : null;
      this.error = null;
      this.runId = run ? run.id : null;
      this.pickSchedule();
      this.loadRun().catch(() => {});
    }
    return true;
  }

  /** The run asked for, while it is still the season's and on that set and week; else null. */
  runAsked(setId, weekId, scheduleId, runId) {
    return (
      this.runs.find(
        (r) =>
          r.id === runId &&
          r.setId === setId &&
          r.weekId === weekId &&
          r.scheduleId === scheduleId
      ) || null
    );
  }

  /**
   * Where the screen starts: as it was, else where it was opened on (opening), else the latest
   * run's set and week, else the first.
   */
  pickStart() {
    const runs = this.runs;
    const latest = runs.length ? runs[runs.length - 1] : null;
    const asked = this.opening || {};
    if (!this.sets.some((s) => s.Id === this.setId)) {
      this.setId = this.sets.some((s) => s.Id === asked.setId)
        ? asked.setId
        : latest
          ? latest.setId
          : this.sets.length
            ? this.sets[0].Id
            : null;
    }
    if (!this.weeks.some((w) => w.Id === this.weekId)) {
      this.weekId = this.weeks.some((w) => w.Id === asked.weekId)
        ? asked.weekId
        : latest
          ? latest.weekId
          : this.weeks.length
            ? this.weeks[0].Id
            : null;
    }
    const run = this.runAsked(
      this.setId,
      this.weekId,
      asked.scheduleId,
      asked.runId
    );
    if (run && !this.runId) {
      this.scheduleId = run.scheduleId;
      this.runId = run.id;
    }
    this.pickSchedule();
  }

  pickSchedule() {
    const options = this.scheduleOptions;
    if (!options.some((o) => o.value === this.scheduleId)) {
      // The schedule of this set's latest run on the week (as Roots' hand counts it: RootsSeats).
      const latest = this.runs
        .filter(
          (r) =>
            r.setId === this.setId &&
            r.weekId === this.weekId &&
            options.some((o) => o.value === r.scheduleId)
        )
        .pop();
      this.scheduleId = latest
        ? latest.scheduleId
        : options.length
          ? options[0].value
          : null;
    }
    const mine = this.runsHere;
    if (!mine.some((r) => r.id === this.runId)) {
      const committed = mine.find((r) => r.status === COMMITTED);
      this.runId = committed ? committed.id : mine.length ? mine[0].id : null;
    }
  }

  async loadRun() {
    const runId = this.runId;
    this.openCell = null;
    if (!runId) {
      this.view = null;
      return;
    }
    const ticket = ++this.loadTicket;
    try {
      const view = await openRun({ runId });
      if (ticket !== this.loadTicket) return;
      this.view = view;
    } catch (e) {
      this.error = failed(
        `Couldn't open these ${this.t.sIn("Elective")} seats.`,
        e
      );
    }
  }

  get runs() {
    return (this.situation && this.situation.runs) || [];
  }
  get sets() {
    return (
      (this._setup && this._setup.electives && this._setup.electives.sets) || []
    );
  }
  get weeks() {
    return (this._setup && this._setup.weeks) || [];
  }
  get setOptions() {
    return this.sets.map((s) => ({ label: s.Name, value: s.Id }));
  }
  get weekOptions() {
    return this.weeks.map((w) => ({ label: w.Name, value: w.Id }));
  }
  /** The week's working schedules (Bring in choices' list): a run names the one it assigns against. */
  get scheduleOptions() {
    if (!this._setup || !this.weekId) return [];
    const programs = new Map(
      (this._setup.programs || []).map((p) => [p.program.Id, p.program.Name])
    );
    const many = programs.size > 1;
    return (this._setup.schedules || [])
      .filter(
        (s) =>
          s[SCHEDULE.Week] === this.weekId && s[SCHEDULE.Status] !== "Version"
      )
      .map((s) => {
        const kind =
          s[SCHEDULE.Origin] === "Generated"
            ? "Generated Schedule"
            : "Manual Build";
        const published =
          s[SCHEDULE.Status] === "Published" ? " · Published" : "";
        return {
          label: `${many ? `${programs.get(s[SCHEDULE.Program])} · ` : ""}${kind}${published}`,
          value: s.Id
        };
      });
  }
  /** "Assign against:" only when the week has more than one schedule (desktop D2.7). */
  get asksSchedule() {
    return this.scheduleOptions.length > 1;
  }
  /** This set's runs on this week's schedule, newest first. */
  get runsHere() {
    return this.runs
      .filter(
        (r) =>
          r.setId === this.setId &&
          r.weekId === this.weekId &&
          r.scheduleId === this.scheduleId
      )
      .reverse();
  }
  /** "Elective seats", or the camp's "Chug seats" (wiki decision 66). */
  get screenTitle() {
    return `${this.t.s("Elective")} seats`;
  }
  get setWord() {
    return this.t.s("ElectiveSet");
  }
  get weekWord() {
    return this.t.s("Week");
  }
  get isLoaded() {
    return !!this.situation;
  }
  get hasNoSets() {
    return this.isLoaded && this.sets.length === 0;
  }
  // No picker beside ‹ Roots: its own divider would stand doubled or alone.
  get backStandsAlone() {
    return !this.showsPickers;
  }

  get showsPickers() {
    return this.isLoaded && this.sets.length > 0;
  }
  get hasNoRun() {
    return this.showsPickers && !this.runId;
  }
  get noSetsText() {
    return `No ${this.t.pIn("ElectiveSet")} yet. Make one on ${this.t.p("Elective")} first.`;
  }
  get noRunText() {
    const set = this.sets.find((s) => s.Id === this.setId);
    const week = this.weeks.find((w) => w.Id === this.weekId);
    return `No choices brought in for ${set ? set.Name : ""} in ${week ? week.Name : ""} yet.`;
  }

  async handleSet(event) {
    this.setId = event.detail.value;
    await this.afterPick();
  }
  async handleWeek(event) {
    this.weekId = event.detail.value;
    this.scheduleId = null;
    await this.afterPick();
  }
  async handleSchedule(event) {
    this.scheduleId = event.detail.value;
    await this.afterPick();
  }
  async afterPick() {
    this.runId = null;
    this.error = null;
    this.pickSchedule();
    await this.loadRun();
  }

  /** Another of this set's runs, from the run's menu. */
  async handleRunMenu(event) {
    const value = event.detail.value;
    if (value === "new") {
      await this.newVersion();
      return;
    }
    if (value === "clear") {
      await this.openClear(STATE_MENU);
      return;
    }
    if (value && value !== this.runId) {
      this.runId = value;
      this.error = null;
      await this.loadRun();
    }
  }

  // ---------- what is shown ----------

  /** The run and its board, worked out once per run read (the views read them many times). */
  get run() {
    return this.remembered().run;
  }
  get board() {
    return this.remembered().board;
  }
  // Kept outside the component's fields, so working it out during a render changes nothing
  // the render reads.
  remembered() {
    const held = MEMO.get(this);
    if (held && held.view === this.view && held.terms === this.terms) {
      return held;
    }
    const run = this.view ? readRun(this.view) : null;
    const made = {
      view: this.view,
      terms: this.terms,
      run,
      board: run ? buildBoard(run, this.t) : null
    };
    MEMO.set(this, made);
    return made;
  }
  get isFinal() {
    return !!this.view && this.view.run.status === FINAL;
  }
  get isCommitted() {
    return !!this.view && this.view.run.status === COMMITTED;
  }
  get isAssigned() {
    return !!this.view && this.view.assigned;
  }
  get showsBoard() {
    return !!this.view;
  }
  get showsCounter() {
    return this.isAssigned || this.isFinal;
  }
  get counter() {
    const board = this.board;
    return board
      ? {
          count: String(board.counter.placed),
          label: `of ${board.counter.total} placed`,
          name: `${board.counter.placed} of ${board.counter.total} placed`,
          mark: needsLook(board)
        }
      : null;
  }
  get problemList() {
    const board = this.board;
    return board ? problemSections(board, this.t) : [];
  }
  get hasProblems() {
    return this.problemList.length > 0;
  }

  get viewButtons() {
    return [
      ["offering", "By offering"],
      ["camper", "By camper"]
    ].map(([key, label]) => ({
      key,
      label,
      className:
        key === this.viewMode
          ? "shoresh-item view-button shoresh-raised"
          : "shoresh-item view-button",
      pressed: String(key === this.viewMode)
    }));
  }
  get isByOffering() {
    return this.viewMode === "offering";
  }
  get isByCamper() {
    return this.viewMode === "camper";
  }
  handleView(event) {
    this.viewMode = event.currentTarget.dataset.view;
  }

  // ---------- the run's state ----------

  /** "Committed", "Final · 14 Oct · Greg", or "Out of date" (said on the run's own screen). */
  get stateLabel() {
    if (!this.view) return "";
    if (this.isFinal && this.view.scheduleChanged) return "Out of date";
    if (this.isFinal) return `Final · ${this.finalWhen}`;
    return COMMITTED;
  }
  get stateMark() {
    return !!this.view && this.view.scheduleChanged;
  }
  get finalWhen() {
    const run = this.view.run;
    const when = run.finalizedAt ? shortDate(run.finalizedAt) : "";
    return run.finalizedBy ? `${when} · ${firstName(run.finalizedBy)}` : when;
  }
  get stateName() {
    return `${this.stateLabel}, the run`;
  }
  /** Why the state needs a look, at the top of its menu. */
  get stateNote() {
    if (!this.view || !this.view.scheduleChanged) return null;
    return this.isFinal
      ? "Schedule changed since it was finalized"
      : "Schedule changed since seats were assigned";
  }
  get runRows() {
    return this.runsHere.map((r) => ({
      key: r.id,
      value: r.id,
      checked: String(r.id === this.runId),
      locked: r.status === FINAL,
      label: r.status === FINAL ? "Final" : COMMITTED,
      aside:
        r.status === FINAL
          ? `${r.finalizedAt ? shortDate(r.finalizedAt) : ""}${r.finalizedBy ? ` · ${firstName(r.finalizedBy)}` : ""}`
          : shortDate(r.createdAt)
    }));
  }
  /** Start a new version: from a final run, while no version is being worked on. */
  get offersNewVersion() {
    return this.isFinal && !this.runsHere.some((r) => r.status === COMMITTED);
  }

  // ---------- the main button and Assign again ----------

  /** Before Finalize: Assign seats, then Finalize. A final run's main button is Download. */
  get primaryLabel() {
    return this.isAssigned ? "Finalize" : "Assign seats";
  }
  get primaryDisabled() {
    return this.busy;
  }
  get showsAssignAgain() {
    return this.isCommitted && this.isAssigned;
  }
  get showsBringIn() {
    return !this.isFinal;
  }

  async handlePrimary() {
    if (this.isFinal) return;
    if (this.isAssigned) {
      await this.finalize();
    } else {
      await this.assign();
    }
  }
  async handleAssignAgain() {
    await this.assign([ASSIGN_AGAIN, PRIMARY]);
  }
  async handleErrorAction() {
    if (this.errorAction === "assign") {
      // The button goes with the message: the cursor goes to the main button.
      await this.assign(PRIMARY);
    }
  }

  /**
   * Assign seats: the engine places everyone it can around the locks, in the browser, and the
   * server checks and saves the seats. Nothing in a setup stops it (engine care PR 8): what the
   * engine couldn't honour is in the problems.
   * The button that started it is held while saving, so the cursor goes back to it once done
   * (WCAG 2.4.3): focusAfter, the main button unless said otherwise.
   */
  async assign(focusAfter = PRIMARY) {
    if (this.busy || !this.view) return;
    this.busy = true;
    this.error = null;
    this.errorAction = null;
    this.status = "Assigning seats…";
    try {
      const run = readRun(this.view);
      const { input } = engineInput(run, this.t);
      const result = runEngine(input);
      const view = await assignSeats({
        request: JSON.stringify(assignRequest(run, result))
      });
      this.view = view;
      const board = buildBoard(readRun(view), this.t);
      this.status = `Seats assigned: ${board.counter.placed} of ${board.counter.total} placed.`;
      await this.refreshRuns();
    } catch (e) {
      this.error = failed("Seats weren't assigned.", e);
      this.status = "";
    } finally {
      this.focusAfter = focusAfter;
      this.busy = false;
    }
  }

  async finalize() {
    if (this.busy) return;
    this.busy = true;
    this.error = null;
    this.errorAction = null;
    try {
      this.view = await finalizeRun({
        runId: this.view.run.id,
        revision: this.view.revision
      });
      this.status = `Finalized: ${this.stateLabel}.`;
      await this.refreshRuns();
    } catch (e) {
      this.error = failed("Not finalized.", e);
      if (/Assign again first/.test(this.error)) this.errorAction = "assign";
    } finally {
      // Final: the main button becomes Download, and the cursor goes to it; refused, back to
      // Finalize.
      this.focusAfter = [PRIMARY, DOWNLOAD_MENU, STATE_MENU];
      this.busy = false;
    }
  }

  async newVersion() {
    if (this.busy) return;
    this.busy = true;
    this.error = null;
    try {
      this.view = await startNewVersion({ runId: this.view.run.id });
      this.runId = this.view.run.id;
      this.status =
        "A new version started, with the choices, locks and moves made by hand.";
      await this.refreshRuns();
    } catch (e) {
      this.error = failed("No new version was started.", e);
    } finally {
      this.focusAfter = STATE_MENU;
      this.busy = false;
    }
  }

  /** The season's runs read again after a save (a run's state changed, or one was added). */
  async refreshRuns() {
    try {
      this.situation = await seatsSetup({ seasonId: this._setup.season.Id });
    } catch {
      // The run on screen is already right; the menu catches up on the next read.
    }
  }

  /** Bring in choices, for this set and week (its own screen). */
  /** Bring in choices, for the set, week and schedule on screen (not the season's first). */
  handleBringIn() {
    this.dispatchEvent(
      new CustomEvent("navigate", {
        detail: {
          screen: "bringInChoices",
          choices: {
            setId: this.setId,
            weekId: this.weekId,
            scheduleId: this.scheduleId
          }
        }
      })
    );
  }

  // ---------- By offering: the counts, and the roster beside ----------

  get offeringRows() {
    const board = this.board;
    if (!board) return [];
    return board.offeringRows.map((row) => ({
      ...row,
      cells: row.cells.map((cell) => ({
        ...cell,
        className: cellClass(cell, cell.key === this.openCell),
        name: cellName(row, cell),
        countText: cell.dropped ? "Dropped" : String(cell.count),
        droppedText: cell.dropped
          ? `had ${cell.dropped.had} of ${cell.dropped.needed}`
          : "",
        pressed: String(cell.key === this.openCell),
        offeredNot: !cell.offered
      }))
    }));
  }
  get columns() {
    const board = this.board;
    return board ? board.columns : [];
  }
  /** A bunk's heading row spans the whole table. */
  get columnSpan() {
    return String(this.columns.length + 1);
  }
  get roster() {
    const board = this.board;
    if (!board || !this.openCell) return null;
    const row = board.offeringRows.find((r) =>
      r.cells.some((c) => c.key === this.openCell)
    );
    const cell = row && row.cells.find((c) => c.key === this.openCell);
    if (!cell) return null;
    const run = this.run;
    const targets = moveTargets(run, cell.column.time, cell.offering.id);
    const people = cell.roster
      .map((placed) => ({
        key: placed.seat.id,
        camperId: placed.camper.id,
        name: placed.camper.name,
        group: placed.camper.group
          ? placed.camper.group.name
          : `No ${this.t.sIn("Group")}`,
        locked: !!placed.seat.locked,
        lockedText: String(!!placed.seat.locked),
        lockName: `${placed.seat.locked ? "Unlock" : "Lock"} ${placed.camper.name}`,
        moveName: `Move ${placed.camper.name} to…`,
        targets,
        canMove: this.isCommitted && targets.length > 0,
        draggable: String(this.isCommitted && targets.length > 0)
      }))
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "en"));
    return {
      heading: `${cell.offering.name} · ${cell.column.label}`,
      people,
      empty: people.length === 0,
      free:
        cell.free == null
          ? ""
          : `${cell.free} ${cell.free === 1 ? "seat" : "seats"} free`,
      day: cell.column.time.day,
      blockId: cell.column.time.blockId
    };
  }
  get canChange() {
    return this.isCommitted && !this.busy;
  }
  get cannotChange() {
    return !this.canChange;
  }

  handleCell(event) {
    const key = event.currentTarget.dataset.cell;
    this.openCell = this.openCell === key ? null : key;
    if (this.openCell) this.focusAfter = '[data-id="roster-heading"]';
  }
  handleCloseRoster() {
    const key = this.openCell;
    this.openCell = null;
    this.focusAfter = `button[data-cell="${cssEscape(key)}"]`;
  }

  async handleLock(event) {
    const camperId = event.currentTarget.dataset.camper;
    const roster = this.roster;
    const person = roster && roster.people.find((p) => p.camperId === camperId);
    if (!person) return;
    await this.change(
      {
        camperId,
        day: roster.day,
        blockId: roster.blockId,
        locked: !person.locked
      },
      `${person.locked ? "Unlocked" : "Locked"} ${person.name}.`,
      ROSTER_HEADING,
      `.lock-button[data-camper="${cssEscape(camperId)}"]`
    );
  }

  async handleMove(event) {
    const camperId = event.currentTarget.dataset.camper;
    const offeringId = event.detail.value;
    const roster = this.roster;
    const person = roster && roster.people.find((p) => p.camperId === camperId);
    const target = person && person.targets.find((x) => x.value === offeringId);
    if (!target) return;
    await this.change(
      { camperId, day: roster.day, blockId: roster.blockId, offeringId },
      `Moved ${person.name} to ${target.label}, locked.`,
      ROSTER_HEADING,
      `c-shoresh-rail-pop.move[data-camper="${cssEscape(camperId)}"]`
    );
  }

  // A name dragged onto another offering at the same time: the grid's grammar.
  handleDragStart(event) {
    const camperId = event.currentTarget.dataset.camper;
    event.dataTransfer.setData("text/plain", camperId);
    event.dataTransfer.effectAllowed = "move";
    this.dragging = { camperId, cell: this.openCell };
  }
  handleDragOver(event) {
    const cell = event.currentTarget.dataset.cell;
    if (this.canDropOn(cell)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    }
  }
  async handleDrop(event) {
    const cellKey = event.currentTarget.dataset.cell;
    const dragging = this.dragging;
    const allowed = this.canDropOn(cellKey);
    this.dragging = null;
    if (!dragging || !allowed) return;
    event.preventDefault();
    const board = this.board;
    const cell = board.offeringRows
      .flatMap((r) => r.cells)
      .find((c) => c.key === cellKey);
    const person = this.roster.people.find(
      (p) => p.camperId === dragging.camperId
    );
    await this.change(
      {
        camperId: dragging.camperId,
        day: cell.column.time.day,
        blockId: cell.column.time.blockId,
        offeringId: cell.offering.id
      },
      `Moved ${person ? person.name : ""} to ${cell.offering.name}, locked.`
    );
  }
  canDropOn(cellKey) {
    const dragging = this.dragging;
    if (!dragging || !this.canChange || cellKey === dragging.cell) return false;
    const [fromTime] = splitCell(dragging.cell);
    const [toTime] = splitCell(cellKey);
    const board = this.board;
    const target =
      board &&
      board.offeringRows.flatMap((r) => r.cells).find((c) => c.key === cellKey);
    return fromTime === toTime && !!target && target.offered;
  }

  /**
   * One seat by hand; the run comes back as it now is, and what changed is said. The cursor then
   * goes to the roster, or to focusAfter when the change came from elsewhere. Refused, it goes
   * back to the control that asked (from), or the roster heading when that is gone, never to the
   * page (the controls were off while it was sent; WCAG 2.4.3).
   */
  async change(fields, said, focusAfter = ROSTER_HEADING, from = null) {
    if (!this.canChange) return;
    this.busy = true;
    this.error = null;
    let done = false;
    try {
      this.view = await changeSeat({
        request: JSON.stringify({
          runId: this.view.run.id,
          revision: this.view.revision,
          ...fields
        })
      });
      this.status = said;
      done = true;
    } catch (e) {
      this.error = failed("That seat wasn't changed.", e);
    } finally {
      this.focusAfter = done
        ? focusAfter
        : [from, ROSTER_HEADING, PRIMARY].filter(Boolean);
      this.busy = false;
    }
  }

  // ---------- the counter's problems ----------

  handleProblem(event) {
    const key = event.currentTarget.dataset.key;
    const row = this.problemList
      .flatMap((s) => s.rows)
      .find((r) => r.key === key);
    if (!row || !row.target) return;
    if (row.target.view === "offering") {
      this.viewMode = "offering";
      this.openCell = row.target.cell;
      this.focusAfter = '[data-id="roster-heading"]';
    } else {
      this.viewMode = "camper";
      this.focusAfter = row.target.camperId
        ? `[data-camper-row="${cssEscape(row.target.camperId)}"]`
        : '[data-id="no-bunk"]';
    }
  }

  async handleUnlockStray(event) {
    const seatId = event.currentTarget.dataset.seat;
    const seat = (this.view.seats || []).find((s) => s.id === seatId);
    const camper = seat && this.run.camperById.get(seat.camperId);
    if (!seat) return;
    await this.change(
      {
        camperId: seat.camperId,
        day: seat.day,
        blockId: seat.blockId,
        locked: false
      },
      `Unlocked ${camper ? camper.name : ""}.`,
      // The notice goes once unlocked: the next one's Unlock, or the main button.
      ['[data-id="stray"] button', PRIMARY],
      `[data-id="stray"] button[data-seat="${cssEscape(seatId)}"]`
    );
  }
  get strayRows() {
    const board = this.board;
    if (!board || !this.isCommitted) return [];
    return board.problems.stray.map((s) => ({
      key: s.seat.id,
      seatId: s.seat.id,
      text: `${s.camper.name}'s lock no longer applies.`,
      label: `Unlock ${s.camper.name}`
    }));
  }

  // ---------- By camper ----------

  get camperSections() {
    const board = this.board;
    if (!board) return [];
    return board.camperSections.map((section) => ({
      ...section,
      dataId: section.noBunk ? "no-bunk" : `group-${section.key}`,
      rows: section.rows.map((row) => ({
        key: row.key,
        camperId: row.camper.id,
        name: row.camper.name,
        comment: row.camper.comment,
        hasComment: !!row.camper.comment,
        commentOpen: this.openComment === row.camper.id,
        commentExpanded: String(this.openComment === row.camper.id),
        commentName: `From the sheet, for ${row.camper.name}`,
        cells: row.cells.map((cell) => ({
          ...cell,
          className: cell.unplaced
            ? "camper-cell camper-cell_empty"
            : "camper-cell",
          text: cell.attends && !cell.unplaced ? cell.name : "",
          words: cell.words ? ` · ${cell.words}` : "",
          unplacedName: `${row.camper.name}: no seat`
        }))
      }))
    }));
  }

  handleComment(event) {
    const id = event.currentTarget.dataset.camper;
    this.openComment = this.openComment === id ? null : id;
  }
  handleCommentEnter(event) {
    this.openComment = event.currentTarget.dataset.camper;
  }
  handleCommentLeave() {
    this.openComment = null;
  }
  handleCommentKey(event) {
    if (event.key === "Escape") {
      this.openComment = null;
    }
  }

  get statusText() {
    return this.status;
  }

  // ---------- Download (a final run's main button) ----------

  get downloadIcon() {
    return ICONS.download;
  }
  get trashIcon() {
    return ICONS.trash;
  }
  /** The mock-up's menu (downloads.png), and the rosters on paper (decision 53.4). */
  get downloadRows() {
    return [
      ["rosters", "Rosters", ICONS.rosters, ""],
      ["print", "Print rosters", ICONS.print, ""],
      ["schedules", "Camper schedules", ICONS.person, ""],
      ["report", "Full report", ICONS.sheet, ""],
      ["campers", this.t.p("Camper"), ICONS.edit, "to edit and bring back"]
    ].map(([value, label, icon, aside]) => ({
      value,
      label,
      icon,
      aside,
      dataId: `download-${value}`,
      name: aside ? `${label}, ${aside}` : label
    }));
  }

  async handleDownloadMenu(event) {
    const value = event.detail.value;
    if (value === "clear") {
      await this.openClear(DOWNLOAD_MENU);
    } else if (value === "print") {
      await this.printRosters();
    } else if (value) {
      await this.download(value);
    }
  }

  /** The final run as the downloads read it: read once per run and revision. */
  async downloadData() {
    const view = this.view;
    const held = this.downloadHeld;
    if (
      held &&
      held.runId === view.run.id &&
      held.revision === view.revision &&
      held.terms === this.terms
    ) {
      return held.reading;
    }
    const data = await runDownload({ runId: view.run.id });
    const reading = readDownload(data, this.t);
    this.downloadHeld = {
      runId: view.run.id,
      revision: view.revision,
      terms: this.terms,
      reading
    };
    return reading;
  }

  /** The season's activities by Id: names for choices of activities the set doesn't offer. */
  get activityNames() {
    const list = (this._setup && this._setup.activities) || [];
    return new Map(list.map((a) => [a.Id, a.Name]));
  }

  async download(kind) {
    if (this.busy || !this.isFinal) return;
    this.busy = true;
    this.error = null;
    try {
      const d = await this.downloadData();
      const made = {
        rosters: () => [rosterSheets(d), "rosters"],
        schedules: () => [camperScheduleSheets(d), "camper schedules"],
        report: () => [fullReportSheets(d), "full report"],
        campers: () => [
          campersSheets(d, this.activityNames),
          this.t.pIn("Camper")
        ]
      }[kind];
      if (!made) return;
      const [sheets, what] = made();
      const file = fileNameOf(downloadTitle(d, what));
      await downloadWorkbook(this, sheets, file);
      this.status = `Downloaded ${file}.`;
    } catch (e) {
      this.error = failed("Nothing was downloaded.", e);
    } finally {
      this.focusAfter = DOWNLOAD_MENU;
      this.busy = false;
    }
  }

  /** The rosters on paper: a page per offering, put on the page, printed, then taken off. */
  async printRosters() {
    if (this.busy || !this.isFinal) return;
    this.busy = true;
    this.error = null;
    try {
      const d = await this.downloadData();
      if (!this.printStyleLoaded) {
        try {
          await loadStyle(this, PRINT_STYLE);
          this.printStyleLoaded = true;
        } catch {
          // Without it the paper also shows the page around the rosters; they still print.
        }
      }
      this.printout = {
        pages: rosterPages(d),
        header: d.header,
        file: downloadTitle(d, "rosters")
      };
      this.printPending = true;
    } catch (e) {
      this.error = failed("The rosters weren't printed.", e);
    } finally {
      this.focusAfter = DOWNLOAD_MENU;
      this.busy = false;
    }
  }

  startPrint() {
    this.printPending = false;
    this.afterPrint = () => this.endPrint();
    window.addEventListener("afterprint", this.afterPrint);
    window.print();
  }
  endPrint() {
    if (this.afterPrint) {
      window.removeEventListener("afterprint", this.afterPrint);
      this.afterPrint = null;
    }
    this.printout = null;
  }
  disconnectedCallback() {
    this.endPrint();
  }

  // ---------- End-of-season Clear (decision 59, clear-b) ----------

  /** Clear takes over the screen: the summer is read and drawn, the whole season picked. */
  async openClear(from) {
    if (this.busy) return;
    this.clearFrom = from;
    this.clearWeekId = null;
    this.clearError = null;
    this.clearData = null;
    this.clearing = true;
    this.focusAfter = CLEAR_HEADING;
    await this.readClear();
  }

  async readClear() {
    try {
      this.clearData = await clearPicture({ seasonId: this._setup.season.Id });
    } catch (e) {
      this.clearError = failed("Couldn't draw the season.", e);
    }
  }

  get clearTitle() {
    const season = this._setup && this._setup.season;
    return `Clear ${season ? season.Name : ""}`.trim();
  }
  /** Whole season · 7 weeks, or the week on screen. */
  get clearScopes() {
    const weeks = this.clearData ? this.clearData.weeks.length : 0;
    const week = this.weeks.find((w) => w.Id === this.weekId);
    const scopes = [
      [
        "season",
        `Whole season · ${weeks} ${weeks === 1 ? this.t.sIn("Week") : this.t.pIn("Week")}`
      ]
    ];
    if (week) scopes.push([week.Id, week.Name]);
    return scopes.map(([key, label]) => {
      const on = key === (this.clearWeekId || "season");
      return {
        key,
        label,
        pressed: String(on),
        className: on
          ? "shoresh-item view-button shoresh-raised"
          : "shoresh-item view-button"
      };
    });
  }
  get clearView() {
    return this.clearData
      ? clearBoard(this.clearData, this.clearWeekId, this.t)
      : null;
  }
  /** The four rows that go, a cell per week. */
  get clearRows() {
    const view = this.clearView;
    if (!view) return [];
    const rows = [
      ["campers", this.t.p("Camper"), ICONS.person, view.totals.campers],
      ["choices", "Choices", ICONS.choices, view.totals.choices],
      ["seats", this.t.s("Seats"), ICONS.seats, view.totals.seats],
      ["runs", "Runs", ICONS.runs, view.totals.runs]
    ];
    return rows.map(([key, label, icon, total]) => ({
      key,
      label,
      icon,
      total: total ? total.toLocaleString("en-US") : "",
      cells: view.columns.map((column) => {
        const part = column[key];
        return {
          key: `${key}|${column.key}`,
          week: column.key,
          has: column.has,
          going: String(column.going),
          className: column.going
            ? "clear-cell clear-cell_going"
            : "clear-cell",
          count: Number(part.count || 0).toLocaleString("en-US"),
          stay: part.stay == null ? null : part.stay.toLocaleString("en-US"),
          words: part.words,
          name: part.name,
          final: part.final,
          state: part.state,
          look: key === "runs" && !part.final,
          isCampers: key === "campers",
          isChoices: key === "choices",
          isSeats: key === "seats",
          isRuns: key === "runs"
        };
      })
    }));
  }
  get clearStays() {
    const view = this.clearView;
    if (!view) return [];
    const icons = {
      sets: ICONS.sets,
      offerings: ICONS.rosters,
      linked: ICONS.linked
    };
    return view.stays.map((stay) => ({ ...stay, icon: icons[stay.key] }));
  }
  get clearDisabled() {
    return this.busy || !this.clearView || this.clearView.nothing;
  }

  handleClearScope(event) {
    const key = event.currentTarget.dataset.scope;
    this.clearWeekId = key === "season" ? null : key;
    this.clearError = null;
  }

  handleClearKey(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      this.handleClearCancel();
    }
  }

  handleClearCancel() {
    this.clearing = false;
    this.clearData = null;
    this.clearError = null;
    this.focusAfter = [this.clearFrom, PRIMARY, STATE_MENU].filter(Boolean);
  }

  /**
   * Clear: exactly what the picture shows (its stamp goes with it). Refused, the reason is said
   * and the season drawn again as it now is; done, the screen is read again and says what went.
   */
  async handleClearGo() {
    if (this.clearDisabled) return;
    this.busy = true;
    this.clearError = null;
    let focusAfter;
    try {
      const result = await clearElectives({
        request: JSON.stringify({
          seasonId: this._setup.season.Id,
          weekId: this.clearWeekId,
          stamp: this.clearData.stamp
        })
      });
      this.clearing = false;
      this.clearData = null;
      this.status = `Cleared: ${result.runs} ${result.runs === 1 ? "run" : "runs"}, ${result.campers} ${
        result.campers === 1 ? this.t.sIn("Camper") : this.t.pIn("Camper")
      }.`;
      this.runId = null;
      this.view = null;
      this.downloadHeld = null;
      focusAfter = "[data-heading]";
      await this.loadSituation();
    } catch (e) {
      this.clearError = failed("Nothing was cleared.", e);
      focusAfter = ['[data-id="clear-go"]', '[data-id="clear-cancel"]'];
      await this.readClear();
    } finally {
      // Set once the buttons are free again, so the cursor can land on them.
      this.busy = false;
      this.focusAfter = focusAfter;
    }
  }

  /** ‹ Roots on this screen's rail: said again to the page, which goes home (repo ADR 0020). */
  handleBackToRoots(event) {
    event.stopPropagation();
    this.dispatchEvent(new CustomEvent("backtoroots", { bubbles: true }));
  }
}

function cellClass(cell, open) {
  const classes = ["seat-cell"];
  if (!cell.offered) classes.push("seat-cell_off");
  if (cell.dropped) classes.push("seat-cell_dropped");
  if (open) classes.push("shoresh-raised", "seat-cell_open");
  return classes.join(" ");
}

function cellName(row, cell) {
  if (!cell.offered) return `${row.name}, ${cell.column.words}: not offered`;
  if (cell.dropped) {
    return `${row.name}, ${cell.column.words}: dropped, had ${cell.dropped.had} of ${cell.dropped.needed}`;
  }
  const of = cell.seats == null ? "" : ` of ${cell.seats}`;
  return `${row.name}, ${cell.column.words}: ${cell.count}${of}`;
}

function splitCell(key) {
  const at = String(key || "").lastIndexOf("|");
  return [key.slice(0, at), key.slice(at + 1)];
}

/** "14 Oct", whatever the browser's language. */
function shortDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return `${date.getDate()} ${date.toLocaleDateString("en-GB", { month: "short" })}`;
}

function firstName(name) {
  return String(name || "").split(" ")[0];
}

function cssEscape(text) {
  return String(text).replace(/["\\]/g, "\\$&");
}
