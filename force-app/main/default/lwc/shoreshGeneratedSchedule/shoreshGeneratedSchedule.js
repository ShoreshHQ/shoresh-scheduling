import { LightningElement, api } from "lwc";
import setUpItem from "@salesforce/apex/SpecialPlacingController.setUpItem";
import takeOffDay from "@salesforce/apex/SpecialPlacingController.takeOffDay";
import previewPublish from "@salesforce/apex/GeneratedScheduleController.previewPublish";
import publish from "@salesforce/apex/GeneratedScheduleController.publish";
import unpublish from "@salesforce/apex/GeneratedScheduleController.unpublish";
import saveVersion from "@salesforce/apex/GeneratedScheduleController.saveVersion";
import keepWeekBeforeRain from "@salesforce/apex/RainyDayController.keepGeneratedWeek";
import restoreVersion from "@salesforce/apex/GeneratedScheduleController.restoreVersion";
import restoreVersionAsNew from "@salesforce/apex/GeneratedScheduleController.restoreVersionAsNew";
import deleteVersion from "@salesforce/apex/GeneratedScheduleController.deleteVersion";
import getVersions from "@salesforce/apex/SchedulesController.getVersions";
import renameSchedule from "@salesforce/apex/SchedulesController.renameSchedule";
import { failed } from "c/shoreshErrors";
import { publishQuestion, publishedWord } from "c/shoreshPublish";
import { MODE, checkGeneratedWeek } from "c/shoreshEngine";
import { electivesOf } from "c/shoreshElectiveDetails";
import { stillNeeded, stillNeededSentence } from "c/shoreshSetupRules";
import {
  ACTION,
  CHANGED_SINCE,
  CONFLICT,
  LOCK,
  SAVED,
  SETUP_CHANGED,
  addActivity,
  inputFor,
  loadWeek,
  readSetupChanges,
  saveEdits,
  saveWeek,
  setLocks,
  updateToMatchSetup
} from "c/shoreshGeneratedWeek";
import { dayLabel, days as dayPillsOf, groups } from "c/shoreshScheduleViews";
import { buildInPieces } from "./pieces";
import { lockChoices, lockedKeys, lockedText, weekCells } from "./locks";
import { clearedDays, openCells } from "./week";
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

// The rail's Build menu (Rebuild, Try another, Fill the open cells, the options, Start over):
// focus goes back to it once one of them is done.
const BUILD_MENU = '[data-id="build-menu"]';

/**
 * Generated Schedule (desktop: the generated route of ScheduleScreen.jsx): a program's week built
 * by the engine (c/shoreshEngine) in the browser and saved whole (c/shoreshGeneratedWeek, ADR
 * 0010). A week not generated yet offers "Generate a schedule". Then:
 *   Rebuild builds the whole week again with the same option (after a confirm; a version is kept
 *     first, and locked cells will stay once locks come, G4);
 *   Try another builds the next option, and Option brings back any option tried;
 *   Fill the open cells fills only the cells left Open;
 *   Start over clears every activity at once (a version is kept first), with an Undo that brings
 *     that version back, as Manual Build's Clear week offers Undo (Greg's decision 2, 2026-10-20).
 * The screen is laid out as Manual Build is: one editor shell from the start (so the week never
 * moves when the week is drawn), its rail with the week, Edit (Undo, Redo and Lock), Build (the
 * actions above and the options), the views and days, the counter, Versions and Publish (ADR
 * 0010 §58).
 * The build runs a little at a time (ADR 0010 §22) with its progress shown, so a big week never
 * freezes the tab. A save someone else's save got in the way of writes nothing: the screen says
 * so and offers to reload. Dots and the counter are worked out from the
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
 * Versions work as on Manual Build (c-shoresh-versions; ADR 0010 "Versions"): Save version, and
 * Restore, which keeps the week first as "Before Restore" and brings back the version's cells,
 * locks and option; rename; delete, never for a copy that was ever published. They wait for
 * builds, reads, hand edits, Lock and Publish, and those wait for them.
 *
 * Setup changed since the week was built works as on Manual Build (ADR 0008 part 6, ADR 0010
 * §56; Greg's look-and-feel decision 1): each cell that no longer matches setup gets the bronze dot
 * saying why, the menu's foot says so (ADR 0015 §9), and its Update to match
 * setup shows every change first (c-shoresh-setup-match), one at a time or all; nothing changes
 * unless the director chooses it. Locks stay on every cell an update leaves as it was.
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
  // How the editor shows the week (it says so with statechange): what Lock (in Edit) offers.
  view = "day";
  dayIndex = 0;
  groupKey;
  // A hand edit is saving or waiting to (the editor's editstate): builds and Lock wait.
  editBusy = false;
  // What the editor is to be told once it is drawn: "fresh", "rebuilt" or "again" (show).
  editorNews = null;
  // Said on the editor's line once it is first drawn (a Restore on a week not generated yet).
  sayWhenShown = null;
  // The week to go on with from the hand edit just saved, until the editor says it is saved.
  lastSaved = null;
  // The locks as the editor takes them (cell keys), worked out once per week loaded.
  locksMemo = { of: undefined, keys: [] };
  // The season as the editor reads it, worked out once per season and week loaded.
  setupMemo = { setup: undefined, input: undefined, value: undefined };
  checksResetKey = 0;
  // The cells a counter lights up ("date|groupId|blockId"), generated route.
  focusAfterRender = null;
  // Where focus goes once a versions action is over (its control may be gone meanwhile).
  focusAfterVersions = null;
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
  // The week's versions (SchedulesController.getVersions rows), read with the week.
  versions = [];
  // Each read of the list moves this on; only the latest one's answer is shown.
  versionsTicket = 0;
  // A Save version, Restore, rename or delete is on its way.
  versionsWorking = false;
  // The version just restored and the revision it was restored at: "on screen now" until the
  // week is saved again (an edit, a Lock, a build), as on the desktop.
  restored = null;
  // A Restore done whose week couldn't be read just after it ({ id, said }): the next read of
  // this week shows it as the restored week (Undo started over, on screen now, said so).
  restoreUnread = null;
  // Start over just saved: { versionId (the version it kept first), revision (the week it
  // saved), label }. Its Undo is offered while the week is still as Start over left it.
  startedOver = null;
  // The editor is showing this screen's week (it is told to let it go once there is none).
  editorHasWeek = false;
  // What setup changed since the week was built (SetupMatch.Preview), for the week shown, or null.
  setupPreview = null;
  setupTicket = 0;
  // The newest read of it (a promise), or null.
  setupRead = null;
  // The "couldn't check against setup" message while it is shown, so a later read that works
  // clears it and nothing else.
  setupError = null;
  // "Update to match setup" is open, or null: { notice, announcement, said (counts each time
  // its words are to be read out, even the same words again), kept (an update in this opening
  // kept the week as it was, so the next keeps none), updated (an update in this opening was
  // made: its Cancel says Close) }. setupWorking: a read for it or an update
  // is on its way.
  setupAsk = null;
  setupWorking = false;
  setupSaid = 0;
  // The setup dots as the editor takes them, worked out once per preview.
  setupDotsMemo = { preview: null, dots: null };

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
        this.publishing ||
        this.versionsWorking ||
        this.setupWorking ||
        this.setupAsk)
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
    this.tellSetupState();
    this.tellWeekState();
    // The editor is drawn from the start (so the pickers never move); with no week to show any
    // more (another week being read, one not generated yet) it lets the last one go.
    if (this.editorHasWeek && !this.showWeek && this.weekEditor) {
      this.hideWeekInEditor();
    }
    if (this.editorNews && this.weekEditor) {
      const how = this.editorNews;
      this.editorNews = null;
      this.tellEditor(how);
    }
    if (this.sayWhenShown && this.editorHasWeek) {
      this.weekEditor.say(this.sayWhenShown);
      this.sayWhenShown = null;
    }
    // Publish and Unpublish are held while they work and while the week is read again, so focus
    // fell from them: it goes back once they are drawn enabled again (WCAG 2.4.3), unless the
    // director has put it somewhere else meanwhile.
    if (this.focusOn && !this.publishDisabled) {
      this.focusBack();
    }
    if (!this.focusAfterRender) {
      return;
    }
    const { cellKey, selector, grid: toGrid, editMenu } = this.focusAfterRender;
    this.focusAfterRender = null;
    const editor = this.weekEditor;
    if (editor && (cellKey || toGrid)) {
      editor.focusCell(cellKey);
      return;
    }
    if (editor && editMenu) {
      // Lock is in the Edit menu, held while it saved: focus goes back to Edit.
      editor.focusEditMenu();
      return;
    }
    const target = selector && this.template.querySelector(selector);
    if (target) {
      target.focus();
    } else if (selector && editor) {
      // The build actions sit on the editor's rail, drawn once the editor has drawn the week
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
   * Opens this screen on a week of the season, as choosing it in the week picker does (the
   * Schedules doorway, wiki decision 61). Not while the picker waits on work under way: the
   * week shown stays, and the picker says which it is. True when that week is the one shown.
   */
  @api
  openWeek(weekId) {
    if (!this.weekOptions.some((o) => o.value === weekId)) {
      return false;
    }
    if (weekId === this.weekId) {
      return true;
    }
    if (this.pickerDisabled) {
      return false;
    }
    this.weekId = weekId;
    this.load();
    return true;
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
    // The week shown goes from the editor along with it (never drawn over the next one's checks).
    if ((!key || fresh) && this.editorHasWeek && this.weekEditor) {
      this.hideWeekInEditor();
    }
    if (!key) {
      this.loaded = null;
      this.loadedFor = null;
      this.publishing = false;
      // No week shown: a publish question open for the last one goes (nothing was sent).
      this.publishAsk = null;
      this.unpublishAsk = null;
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
      this.startedOver = null;
      this.versions = [];
      this.sayWhenShown = null;
      // A list still on its way for the last week is not this one's.
      this.versionsTicket += 1;
      this.restored = null;
      // Another week: a publish question open for the last one goes (nothing was sent).
      this.publishState = null;
      this.publishAsk = null;
      this.unpublishAsk = null;
      this.publishing = false;
      // The last week's setup changes are not this one's; an answer still on its way is dropped.
      this.setupPreview = null;
      this.setupError = null;
      this.setupAsk = null;
      this.setupTicket += 1;
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
        this.error = failed(
          `${this.weekName} couldn't be opened. Nothing was changed.`,
          e
        );
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
    // A week not generated yet lists its versions too: any of them can be restored here
    // (Greg's decision 9).
    this.loadVersions();
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
    const unread = this.restoreUnread;
    this.restoreUnread = null;
    if (unread && !fresh) {
      this.showRestored(unread, loaded);
      return;
    }
    this.showInEditor(fresh ? "fresh" : "again");
    this.loadSetupChanges();
  }

  /** Coming back to the window shows other people's saves, unless something is under way. */
  /**
   * "Set it up" on a cell noted from a file as a special event or day (ADR 0014 slice 4): made
   * on the server from what the file had, then the week and the season are read again (the
   * Special events screen lists it). Resolves to what to say.
   */
  setUpWith = async ({ kind, name }) => {
    const scheduleId = this.loaded && this.loaded.scheduleId;
    if (!scheduleId) {
      return null;
    }
    const done = await setUpItem({ scheduleId, kind, name });
    this.dispatchEvent(new CustomEvent("seasonchanged"));
    this.load(true);
    return done && done.said;
  };

  /**
   * "Take off <day>" on a day a special day replaces (ADR 0014 slice 6): taken off on the server,
   * then the week and the season are read again, so the day's own cells are back. Resolves to
   * what to say.
   */
  takeOffWith = async ({ specialDayId, day }) => {
    const done = await takeOffDay({
      request: { specialDayId, weekId: this.weekId, day, answer: null }
    });
    this.dispatchEvent(new CustomEvent("seasonchanged"));
    this.load(true);
    return done && done.said;
  };

  /** "Open <special day>" from a day it replaces: its schedule, on the Special events screen. */
  handleOpenSpecial(event) {
    this.dispatchEvent(
      new CustomEvent("navigate", {
        detail: {
          screen: "specialEvents",
          specialItemId: event.detail.itemId
        }
      })
    );
  }

  refresh() {
    if (
      this.loaded &&
      !this.reading &&
      !this.busy &&
      !this.locking &&
      !this.confirming &&
      !this.conflict &&
      !this.publishing &&
      !this.versionsWorking &&
      !this.setupWorking &&
      !this.setupAsk &&
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
    return {
      ...base,
      days,
      terms: this.t,
      // Days a special day replaces: nothing is built, checked or counted there (ADR 0014).
      replacedDates: this.replacedDates,
      // The season's offerings: an elective set on the grid takes up their places (ADR 0018
      // slice E5).
      electiveOfferings: electivesOf(this._setup).offerings,
      ...extra
    };
  }

  /** The week's days a special day replaces ("YYYY-MM-DD"). */
  get replacedDates() {
    const specials = this.loaded && this.loaded.input.specials;
    return ((specials && specials.days) || []).map((day) => day.dateValue);
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
      week.checkedDays,
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
  }

  // ---------- actions ----------

  get option() {
    return (this.loaded && this.loaded.option) || 1;
  }
  get isBusy() {
    return !!this.busy;
  }
  /**
   * The program and week pickers wait for a build, a Lock, a hand edit, a publish or a versions
   * action under way.
   */
  get pickerDisabled() {
    return (
      this.isBusy ||
      this.locking ||
      this.editBusy ||
      this.publishing ||
      this.versionsWorking ||
      this.setupWaits
    );
  }
  /** "Update to match setup" is read, open or updating: what it shows is the week as it is. */
  get setupWaits() {
    return this.setupWorking || !!this.setupAsk;
  }
  get actionsDisabled() {
    // Also while the week is being read (Reload, coming back to the window): a build started
    // then would build on the week the read is about to replace. And while a hand edit saves:
    // a build then would replace the week the edit is being saved into. And while a publish
    // is on its way: its answer, published or refused, is for the week as it was. And while a
    // version is saved, restored, renamed or deleted: a Restore replaces the week. And while
    // "Update to match setup" is read, open or updating.
    return (
      this.isBusy ||
      !!this.conflict ||
      this.loading ||
      this.reading ||
      this.locking ||
      this.editBusy ||
      this.publishing ||
      this.versionsWorking ||
      this.setupWaits
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
  /** The options in the Build menu: "Option 2", the one shown checked. */
  get optionRows() {
    return this.optionChoices.map((choice) => ({
      ...choice,
      label: `${this.optionLabel} ${choice.label}`,
      checked: String(choice.value === this.optionValue)
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
  /** Start over goes at once, with Undo (Greg's decision 2, 2026-10-20); it keeps a version first. */
  handleStartOver() {
    this.run(ACTION.START_OVER, this.option);
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
  /** An option chosen in the Build menu: brought back (Try another to that option). */
  handleOptionRow(event) {
    this.handleOption({
      detail: { value: event.currentTarget.dataset.option }
    });
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
        days = clearedDays(loaded.input.days, new Set(this.replacedDates));
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
        // Start over offers Undo: the version it kept first, brought back.
        this.startedOver =
          action === ACTION.START_OVER && saved.versionId
            ? {
                versionId: saved.versionId,
                revision: saved.revision,
                label: `Started ${this.weekName} over`
              }
            : null;
        this.resetChecks();
        // A whole new week: Undo starts over (its steps were made on the week it replaced).
        this.showInEditor("rebuilt");
        // Rebuild, Try another and Start over kept a version first: Versions lists it.
        this.loadVersions();
        // What still doesn't match setup in the week just built (locks and leftovers stay).
        this.loadSetupChanges();
        // Said when it ends, not only when it starts (the bar's progress changes silently).
        const { filled, total } = this.checked.cells;
        this.announce(
          [this.runDoneText(action, option), `Filled ${filled} of ${total}.`]
            .filter(Boolean)
            .join(" ")
        );
      } else if (saved.status === CONFLICT) {
        // The box is an alert: it is read out once, there.
        this.conflict = { message: statementOf(saved.message) };
      } else {
        this.error = failed(this.runFailedText(action, option), saved.message);
      }
    } catch (e) {
      if (ticket === this.loadTicket) {
        this.error = failed(this.runFailedText(action, option), e);
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

  /** What a build that didn't save says first: what didn't happen (then why, failed()). */
  runFailedText(action, option) {
    const week = this.weekName;
    switch (action) {
      case ACTION.GENERATE:
        return `${week} wasn't generated. Nothing was saved.`;
      case ACTION.TRY_ANOTHER:
        return `Option ${option} wasn't saved. Nothing was changed.`;
      case ACTION.FILL_OPEN:
        return "The open cells weren't filled. Nothing was changed.";
      case ACTION.START_OVER:
        return `${week} wasn't started over. Nothing was changed.`;
      default:
        return `${week} wasn't rebuilt. Nothing was changed.`;
    }
  }

  /** What a build that saved says, before the count: "Week 1 rebuilt.", "Option 2." */
  runDoneText(action, option) {
    const week = this.weekName;
    switch (action) {
      case ACTION.GENERATE:
        return `${week} generated.`;
      case ACTION.REBUILD:
        return `${week} rebuilt.`;
      case ACTION.TRY_ANOTHER:
        return `Option ${option}.`;
      case ACTION.START_OVER:
        return `Started ${week} over.`;
      default:
        return "";
    }
  }

  /** Option shows the option saved, also after a pick that wasn't saved (refused, conflict). */
  showSavedOption() {
    const picker = this.template.querySelector('[data-id="option"]');
    if (picker) {
      picker.value = this.optionValue;
    }
  }

  /** "Started Week 1 over", while Undo would take it back: the week is still as it left it. */
  get startedOverText() {
    const started = this.startedOver;
    return started &&
      this.loaded &&
      this.loaded.revision === started.revision &&
      !this.busy &&
      !this.conflict
      ? started.label
      : null;
  }
  get startOverUndoLabel() {
    return this.startedOver ? `Undo ${this.startedOver.label}` : "Undo";
  }

  /**
   * Start over's Undo: the version it kept first is restored (its cells, locks and option), the
   * same way Restore does it, so someone else's newer save is never replaced unseen. Focus goes
   * back to Start over (the line goes with the week it was about).
   */
  handleUndoStartOver() {
    const started = this.startedOver;
    if (!started || this.versionsBusy) {
      return;
    }
    this.restore(started.versionId, `Undone: ${started.label}.`, {
      focus: BUILD_MENU,
      name: started.label,
      undo: true
    });
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
    // Start over: its Undo, the most useful next stop (as after Clear week on Manual Build).
    if (action === ACTION.START_OVER && this.startedOverText) {
      return '[data-id="start-over-undo"]';
    }
    // Every build action is in the Build menu, closed by now: back to Build.
    return BUILD_MENU;
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

  /** A refused Restore: the quiet line with Reload, not the alert box (as on Manual Build). */
  get quietConflict() {
    return !!(this.conflict && this.conflict.quiet);
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
      selector: this.isGenerated ? BUILD_MENU : '[data-id="generate"]'
    };
    this.announce(`${this.weekName} as saved now.`);
  }

  // ---------- the confirm (Rebuild) ----------

  get confirmTitle() {
    return "Rebuild this schedule?";
  }
  /**
   * The desktop's ConfirmRegenModal, as Greg's decisions change it: hand edits are locks and
   * stay (decision 2), so Rebuild no longer says it replaces them. It names the week, then that a
   * version is kept first. Start over asks nothing: it goes at once, with Undo (decision 2,
   * 2026-10-20).
   */
  get confirmBody() {
    if (!this.confirming || !this.checked) {
      return "";
    }
    // Locked cells stay through a Rebuild (decision 2); said only when the week has some.
    const anyLocked = this.week.locked.size > 0;
    return `Builds ${this.weekName} again from your setup.${anyLocked ? " Locked cells stay as they are." : ""}`;
  }
  get confirmNote() {
    return `Saved to ${this.t.p("Version")} first.`;
  }
  get confirmLabel() {
    return "Rebuild it";
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
    // Back to the Build menu, which Rebuild was chosen from.
    Promise.resolve().then(() => {
      const back = action ? this.template.querySelector(BUILD_MENU) : null;
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

  // ---------- the counter ----------

  /** The week's measure, for the rail's counter (the editor's, from this screen's own check). */
  get measure() {
    return this.week && this.weekEditor ? this.weekEditor.measure : null;
  }

  /** An under or over row: that activity, in Activity View. */
  handleShowActivity(event) {
    if (this.weekEditor) {
      this.weekEditor.showActivity(event.detail.activityId);
    }
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

  /** The cell keyboard focus last reached in the editor's grid, so Lock can offer it. */
  handleCellFocus(event) {
    this.focusedCellKey = event.detail.key;
    this.focusedSlot = event.detail.slot || null;
  }

  /** That cell, if the week shown still has it: what Lock needs of it. */
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

  /** What Lock offers now: the focused cell, the day or group shown, the cell's group's day. */
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
    // A day a special day replaces has nothing to lock: it shows the special day's schedule.
    const cells = weekCells(
      this.week.checkedDays,
      this.week.locked,
      this.week.isAway
    );
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
  /** With nothing to offer, or while the week is busy, nothing can be locked. */
  get lockDisabled() {
    return this.actionsDisabled || this.lockMenu.length === 0;
  }

  /**
   * The Lock choices in the rail's Edit menu, after Undo and Redo (ADR 0010 §58): locking is done
   * by hand, so it sits with the other hand edits. Held while the week is busy.
   */
  get editItems() {
    const disabled = this.lockDisabled;
    return this.lockMenu.map((choice) => ({
      value: `lock:${choice.value}`,
      label: choice.label,
      dataId: `lock-${choice.value}`,
      disabled
    }));
  }

  /** A Lock choice from the Edit menu. */
  handleEditSelect(event) {
    const value = String(event.detail.value);
    if (value.startsWith("lock:")) {
      this.handleLockSelect({ detail: { value: value.slice(5) } });
    }
  }

  /**
   * A locked cell was asked to change (Enter or a click in the editor): nothing unlocks without
   * the director choosing Unlock (ADR 0010 §37), so Lock in Edit now offers that cell, focus
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
          ? { editMenu: true }
          : { cellKey: this.focusedCellKey, grid: true };
      } else if (result.status === CONFLICT) {
        this.conflict = { message: statementOf(result.message) };
        this.focusAfterRender = { selector: '[data-id="reload"]' };
      } else {
        this.error = failed(this.lockFailedText(choice), result.message);
        this.focusAfterRender = { editMenu: true };
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

  /** "Bunk 1, Monday wasn't locked.": what a refused Lock or Unlock didn't do. */
  lockFailedText(choice) {
    const name = choice.label.replace(/^(Lock|Unlock) /, "");
    return `${name} wasn't ${choice.change.action === LOCK ? "locked" : "unlocked"}.`;
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
  // Edits wait while a build or a Lock is saved, or Reload reads the week (it is about to be
  // replaced), and while a publish is on its way (its answer is for the week as it was).
  get editsWait() {
    return (
      this.isBusy ||
      this.locking ||
      !!this.reloading ||
      this.publishing ||
      this.versionsWorking ||
      this.setupWaits
    );
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
    const input = this.loaded.input;
    return {
      schedule: { schedule: { id: this.loaded.scheduleId }, days: week.days },
      activities: activityOptions(input, week.days),
      away: awayRows(week.days, week.isAway),
      // The season's special events and the week's special days (ADR 0014 slice 4).
      specials: input.specials || null,
      // What a rainy day reads (outdoors, rain plans, places and other programs), under the names
      // Manual Build's draft gives them (repo docs/adr/0019).
      activityRecords: input.activities || [],
      locationRecords: input.locations || [],
      fixedActivityRecords: input.fixedActivities || [],
      recurringActivityRecords: input.recurringActivities || [],
      otherPrograms: input.otherPrograms || []
    };
  }

  /**
   * Rainy day (repo docs/adr/0019): the week editor switches the day; first the week, locks and
   * option too, is kept as an automatic version under the name it gives ("Before rainy Monday").
   */
  rainyWith = async (name) => {
    await keepWeekBeforeRain({ scheduleId: this.loaded.scheduleId, name });
    this.loadVersions();
  };

  /** The editor is told of a week from this screen (a read, a build, a Lock) once it is drawn. */
  showInEditor(how) {
    this.editorNews = how;
  }

  tellEditor(how) {
    const editor = this.weekEditor;
    if (!this.showWeek) {
      if (this.editorHasWeek) {
        this.hideWeekInEditor();
      }
      return;
    }
    this.editorHasWeek = true;
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

  /** No week to show: the editor lets the last one go (nothing of it is kept, Undo included). */
  hideWeekInEditor() {
    const editor = this.weekEditor;
    editor.clear();
    editor.show(null, false);
    this.editorHasWeek = false;
  }

  /**
   * The editor's check of the week as it shows it (with the edits still saving): the engine's,
   * with those locks, so its dots, the Open reasons and the counts are this screen's own.
   */
  checkWeekShown = (days, locks) =>
    this.checkDays(
      days,
      locks ? [...locks].map(lockOf) : this.loaded.input.locks
    ).checked;

  /**
   * Given to the editor once a week is loaded: the editor is drawn before that (so the pickers
   * never move), and with nothing loaded there is nothing for this screen's check to read.
   */
  get checkWith() {
    return this.loaded ? this.checkWeekShown : null;
  }

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

  /**
   * A hand edit saved: the week to go on with is the one the server sent (never patched). Setup
   * changes are read again when the week differed from setup (an edit may have settled a
   * difference) or an activity is closed this week (placing one makes a new difference), or when
   * no read has answered yet (the one on its way read the week before this edit).
   */
  handleSaved() {
    if (this.lastSaved) {
      this.loaded = this.lastSaved;
      this.lastSaved = null;
    }
    const preview = this.setupPreview;
    const again = preview
      ? preview.changes.length > 0 || preview.closedActivityIds.length > 0
      : this.isGenerated;
    if (again) {
      this.loadSetupChanges();
    }
  }

  /** What the editor shows (view, day, bunk): Lock offers what is on screen. */
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
      !this.publishing &&
      !this.versionsWorking &&
      !this.setupWaits
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
    // No longer the version just restored.
    this.restored = null;
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

  /** Given to Versions, so what it says is read out from this screen's one live region. */
  announceText = (text) => this.announce(text);

  /**
   * Read out through the editor's live region, the one on this screen (it is drawn from the
   * start), so two regions never talk over each other. The same words twice are still read out.
   */
  announce(text) {
    const editor = this.weekEditor;
    if (editor) {
      editor.announce(text);
    }
  }

  // ---------- setup changed since the week was built (as Manual Build: ADR 0008 part 6) ----------

  /**
   * Reads what setup changed since the week was built (its own request, so opening the week costs
   * no more). An answer older than the latest ask, or for a week no longer shown, is dropped.
   * Returns the preview, or null.
   */
  loadSetupChanges() {
    const read = this.readSetupChanges();
    // The newest read, for one that finds it was overtaken (handleSetupMatch).
    this.setupRead = read;
    return read;
  }

  async readSetupChanges() {
    this.setupTicket += 1;
    const ticket = this.setupTicket;
    const loaded = this.loaded;
    if (!loaded || !loaded.scheduleId) {
      this.setupPreview = null;
      return null;
    }
    try {
      const preview = await readSetupChanges(loaded);
      if (ticket !== this.setupTicket) {
        return null;
      }
      this.setupPreview = preview;
      // Checked now: a "couldn't check" from an earlier read goes (any other error stays).
      if (this.error && this.error === this.setupError) {
        this.error = null;
      }
      this.setupError = null;
      return preview;
    } catch (e) {
      // Said, never hidden: the dots and the box stay as last read rather than vanishing, which
      // would make the week look as if it matched setup.
      if (ticket === this.setupTicket) {
        this.error = failed(
          `Shoresh couldn't check ${this.weekName} against setup.`,
          e
        );
        this.errorFromRead = false;
        this.setupError = this.error;
      }
      return null;
    }
  }

  /** The cells setup changed, as the editor takes them: cell key to the dot's words. */
  get setupDots() {
    const preview = this.setupPreview;
    if (this.setupDotsMemo.preview !== preview) {
      this.setupDotsMemo = {
        preview,
        dots: new Map(
          ((preview && preview.dots) || []).map((dot) => [dot.key, dot.words])
        )
      };
    }
    return this.setupDotsMemo.dots;
  }

  get setupChanges() {
    return (this.setupPreview && this.setupPreview.changes) || [];
  }
  get setupProblem() {
    return this.setupPreview ? this.setupPreview.problem : null;
  }
  /** Setup changed (the menu's foot says so), or it can't be compared (said under the rail). */
  get showSetupChanged() {
    return (
      this.showWeek && (this.setupChanges.length > 0 || !!this.setupProblem)
    );
  }
  get showSetupProblem() {
    return this.showWeek && !!this.setupProblem;
  }
  /**
   * Tells the page whether this week can be updated to match setup, and whether its Update waits,
   * when either changes: the menu's foot shows it too (ADR 0015). Fires: setupstate
   * { changed, busy }.
   */
  tellSetupState() {
    const changed = this.showSetupChanged && this.canUpdateToMatch;
    const busy = !!this.versionsBusy;
    const told = this.setupStateTold;
    if (told && told.changed === changed && told.busy === busy) {
      return;
    }
    this.setupStateTold = { changed, busy };
    this.dispatchEvent(
      new CustomEvent("setupstate", { detail: { changed, busy } })
    );
  }

  /**
   * Tells the page the week shown and whether the week picker waits on work under way, when
   * either changes: the Schedules doorway holds its other weeks for this screen meanwhile, as
   * the picker does (openWeek). Fires: weekstate { weekId, locked }.
   */
  tellWeekState() {
    const weekId = this.weekId || null;
    const locked = !!this.pickerDisabled;
    const told = this.weekStateTold;
    if (told && told.weekId === weekId && told.locked === locked) {
      return;
    }
    this.weekStateTold = { weekId, locked };
    this.dispatchEvent(
      new CustomEvent("weekstate", { detail: { weekId, locked } })
    );
  }

  /** The menu's Update to match setup (ADR 0015 §9): the list of what setup changed. */
  @api
  updateToMatchSetup() {
    if (this.showSetupChanged && this.canUpdateToMatch && !this.versionsBusy) {
      this.handleSetupMatch();
    }
  }

  get canUpdateToMatch() {
    return this.setupChanges.length > 0 && !this.setupProblem;
  }
  get setupHeading() {
    return `Update ${this.weekName} to match setup?`;
  }

  /** A read asked for while the list was read, open or updating (the season read again). */
  readAfterSetup() {
    const readNow = this.readAfterRun && !this.conflict && !this.setupWaits;
    if (readNow) {
      this.readAfterRun = false;
      this.load(true);
    }
  }

  /**
   * "Update to match setup": what it would change is read fresh and shown first; nothing changes
   * until the director chooses a change, or all of them.
   */
  async handleSetupMatch() {
    if (this.actionsDisabled) {
      this.say("One moment: an edit is still saving.");
      return;
    }
    const week = this.loadedFor;
    this.setupWorking = true;
    try {
      const preview = await this.newestSetupChanges(
        this.loadSetupChanges(),
        week
      );
      if (week !== this.loadedFor || !preview) {
        return;
      }
      if (preview.problem) {
        // Can't be compared now: said, never "matches" (the box says the same).
        this.say(preview.problem);
      } else if (preview.changes.length) {
        // A new opening of the list: its first update that takes a placement keeps a version.
        this.setupAsk = { notice: null, kept: false, updated: false };
      } else {
        this.say(`${this.weekName} matches setup.`);
      }
    } finally {
      this.setupWorking = false;
      if (!this.setupAsk) {
        this.focusOn = "update-to-match";
        this.readAfterSetup();
      }
    }
  }

  /**
   * A read's answer, or, when a newer read overtook it (the week read again on coming back to the
   * window), that read's: the one shown. So a click waits for it rather than doing nothing.
   */
  async newestSetupChanges(read, week) {
    const preview = await read;
    if (!preview && week === this.loadedFor && this.setupRead !== read) {
      return this.newestSetupChanges(this.setupRead, week);
    }
    return preview;
  }

  handleSetupClose() {
    this.setupAsk = null;
    this.focusOn = "update-to-match";
    this.readAfterSetup();
  }

  /**
   * Makes the chosen changes, on the week as the list showed it, then reads the week again.
   * Refused, with nothing changed, when someone saved the week since (it is read again) or setup
   * changed again (the list shows what it would change now). After one change the list stays open
   * with what is left.
   */
  async handleSetupUpdate(event) {
    const keys = event.detail.keys;
    const preview = this.setupPreview;
    if (!preview || !keys.length || this.setupWorking || !this.setupAsk) {
      return;
    }
    let kept = this.setupAsk.kept;
    // A read already on its way read the week before this update: its answer must not replace
    // the updated week. A change of week while it runs drops this answer.
    this.loadTicket += 1;
    this.weekTicket += 1;
    const ticket = this.loadTicket;
    this.reading = false;
    this.loading = false;
    this.setupWorking = true;
    this.error = null;
    this.errorFromRead = false;
    try {
      const result = await updateToMatchSetup(this.loaded, {
        keys,
        seenRevisions: preview.revisions,
        versionKept: kept
      });
      if (ticket !== this.loadTicket) {
        return;
      }
      if (result.refused === CHANGED_SINCE) {
        this.setupAsk = null;
        this.weekEditor.setNotice(
          `Someone else changed this ${this.t.sIn("Week")} since, so nothing was updated.`
        );
        this.readAfterRun = true;
        return;
      }
      if (result.refused === SETUP_CHANGED) {
        const fresh = await this.loadSetupChanges();
        const again = "Setup changed again, so nothing was updated.";
        // The list shows what it would change now, in place.
        this.setupAsk =
          fresh && fresh.changes.length
            ? this.setupAskWith(again, null, kept, this.setupAsk.updated)
            : null;
        if (fresh && !this.setupAsk) {
          // Nothing left to change (or it can't be compared now): the list closes, and says why.
          this.say(
            `${again} ${fresh.problem || `${this.weekName} matches setup now.`}`
          );
        }
        return;
      }
      kept = kept || result.kept;
      if (result.kept) {
        // Versions lists the week as it was, kept just now.
        this.loadVersions();
      }
      const done =
        keys.length === 1
          ? "Updated to match setup."
          : `Updated ${keys.length} changes to match setup.`;
      if (!(await this.showUpdated(ticket))) {
        // Updated, but the week can't be read just now: said, and read again once this is over.
        this.setupAsk = null;
        this.say(done);
        return;
      }
      const fresh = await this.loadSetupChanges();
      const all = keys.length === preview.changes.length;
      // While the list stays open it says so itself: a screen reader in the dialog hears only
      // the dialog.
      this.setupAsk =
        !all && fresh && fresh.changes.length
          ? this.setupAskWith(null, done, kept, true)
          : null;
      if (!this.setupAsk) {
        this.say(done);
      }
    } catch (e) {
      this.setupAsk = null;
      this.error = failed(`${this.weekName} was not updated.`, e);
    } finally {
      this.setupWorking = false;
      if (ticket === this.loadTicket && !this.setupAsk) {
        this.focusOn = "update-to-match";
        this.readAfterSetup();
      }
    }
  }

  /**
   * The week as the update left it, read again: a whole new week (Undo starts over, as after
   * Restore), its locks as saved, no longer a version restored. False when it can't be read now
   * (the error says so, and it is read again once the update is over).
   */
  async showUpdated(ticket) {
    let week;
    try {
      week = await loadWeek(this.programId, this.weekId);
    } catch (e) {
      if (ticket === this.loadTicket) {
        this.error = failed(
          `${this.weekName} was updated, but couldn't be shown just now.`,
          e
        );
        this.errorFromRead = true;
        this.readAfterRun = true;
      }
      return false;
    }
    if (ticket !== this.loadTicket) {
      return false;
    }
    this.loaded = week;
    this.publishState = week.published || null;
    this.restored = null;
    this.resetChecks();
    this.showInEditor("rebuilt");
    return true;
  }

  /** The list, open again with words to read out (read out even when the same as last time). */
  setupAskWith(notice, announcement, kept, updated = false) {
    this.setupSaid += 1;
    return { notice, announcement, kept, updated, said: this.setupSaid };
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
   * Focus back to the button it was on (focusOn) once that is drawn enabled again. Unpublish is
   * gone once the week has nothing published: Publish then. Update to match setup is gone once
   * the week matches setup: the grid's cell then (Publish is no place to land after an update).
   */
  focusBack() {
    const id = this.focusOn;
    this.focusOn = null;
    if (!this.focusIsLost()) {
      return;
    }
    if (id === "update-to-match") {
      // The menu's Update to match setup opened the list (ADR 0015 §9): focus goes back to it,
      // or, once the week matches setup and it is gone, to the grid. After the page has drawn
      // the menu with what this screen just told it (tellSetupState).
      Promise.resolve().then(() => {
        if (this.focusIsLost() && !this.focusMenuUpdate() && this.weekEditor) {
          this.weekEditor.focusCell(this.focusedCellKey);
        }
      });
      return;
    }
    // Unpublish sits in Published's dropdown: back to it while that is open, else to Published,
    // or to Publish once the week has nothing published.
    const button =
      (id === "unpublish"
        ? this.unpublishTarget()
        : this.template.querySelector(`[data-id="${id}"]`)) ||
      this.template.querySelector('[data-id="publish"]');
    if (button) {
      button.focus();
    } else if (this.weekEditor) {
      this.weekEditor.focusCell(this.focusedCellKey);
    }
  }

  /** Unpublish, when Published's dropdown is open; else Published; null with neither. */
  unpublishTarget() {
    const menu = this.template.querySelector('[data-id="published-menu"]');
    if (!menu) {
      return null;
    }
    return menu.opened
      ? this.template.querySelector('[data-id="unpublish"]')
      : menu;
  }

  /**
   * Asks the page to put focus on the menu's Update to match setup (setupfocus { focused }: the
   * page says whether it could). False when nothing took it.
   */
  focusMenuUpdate() {
    const detail = { focused: false };
    this.dispatchEvent(new CustomEvent("setupfocus", { detail }));
    return detail.focused;
  }

  /**
   * Focus fell to the page (or stayed on Publish or Unpublish while they were held), rather than
   * being on something the director chose since.
   */
  focusIsLost() {
    const inside = this.template.activeElement;
    if (inside) {
      const id = inside.dataset ? inside.dataset.id : null;
      return id === "publish" || id === "unpublish" || id === "published-menu";
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
   * cells and their reasons, the dots) that decides whether to ask first
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
      const question = publishQuestion({
        preview,
        checked: this.checked,
        counts: null,
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
    // A published schedule it replaced is a version now: Versions lists it straight away.
    this.loadVersions();
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
    // The copy is a version now, marked Published: Versions lists it straight away.
    this.loadVersions();
    this.say(`Unpublished ${this.weekName}.`);
  }

  /**
   * A publish or unpublish is over: builds, edits and the pickers go on, focus goes back to its
   * button (WCAG 2.4.3) unless another week is shown by then, and a read asked for meanwhile (the
   * season read again) is done now.
   */
  publishDone(week, button) {
    // An answer for a week no longer shown leaves the week shown as it is: showing it reset
    // the flag, and a publish asked from it since is still on its way.
    if (week !== this.loadedFor) {
      return;
    }
    this.publishing = false;
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

  /** The rail's Published: and whether the week changed since (its corner says it to the eye). */
  get publishedName() {
    return this.publishState && this.publishState.changedSince
      ? "Published, changed since"
      : "Published";
  }

  get publishedBy() {
    return this.publishState && this.publishState.publishedBy
      ? ` by ${this.publishState.publishedBy}`
      : "";
  }

  // ---------- Versions (as Manual Build: desktop VersionsDropdown, useSnapshots) ----------

  /** Versions wait while anything else changes or reads the week, and while one of theirs runs. */
  get versionsBusy() {
    return this.actionsDisabled;
  }

  /** "on screen now": the version just restored, while the week is still as it was restored. */
  get restoredId() {
    const restored = this.restored;
    return restored && this.loaded && this.loaded.revision === restored.revision
      ? restored.id
      : null;
  }

  async loadVersions() {
    this.versionsTicket += 1;
    const ticket = this.versionsTicket;
    // An older read answering after a newer one (or after another week was chosen) is dropped.
    const latest = () => ticket === this.versionsTicket;
    try {
      const rows = await getVersions({
        programId: this.programId,
        weekId: this.weekId
      });
      if (latest()) {
        this.versions = rows || [];
      }
    } catch {
      // The list shows as empty; the week itself is unaffected.
      if (latest()) {
        this.versions = [];
      }
    }
  }

  /**
   * A week not generated yet shows its versions under "Let the app propose one", when it has
   * any (desktop ScheduleScreen: earlier versions stay reachable when no week is on screen).
   */
  get showStartVersions() {
    return this.showStart && this.versions.length > 0;
  }

  /**
   * Runs a versions action, then reads the list again before it is done (so the list never shows
   * a version just deleted as if it were there); refused ones say why. A read asked for meanwhile
   * (the season read again) is done after it.
   */
  async versionsAction(what, work) {
    this.versionsWorking = true;
    this.error = null;
    this.errorFromRead = false;
    this.focusAfterVersions = null;
    try {
      await work();
      return true;
    } catch (e) {
      // What didn't happen, then why (what: words, or a function for words known only later).
      this.error = failed(typeof what === "function" ? what() : what, e);
      return false;
    } finally {
      await this.loadVersions();
      if (this.focusAfterVersions) {
        // Set as the hold ends, so the render that enables its button focuses it.
        this.focusAfterRender = { selector: this.focusAfterVersions };
        this.focusAfterVersions = null;
      }
      this.versionsWorking = false;
      const readNow = this.readAfterRun && !this.conflict;
      this.readAfterRun = false;
      if (readNow) {
        this.load(true);
      }
    }
  }

  /** Save version: the week as it is now (its locks and option too), kept under a name. */
  async handleSaveVersion(event) {
    const { name, onDone } = event.detail;
    if (this.versionsBusy) {
      onDone(false);
      return;
    }
    const scheduleId = this.loaded.scheduleId;
    const saved = await this.versionsAction(`${name} wasn't saved.`, () =>
      saveVersion({ scheduleId, name })
    );
    if (saved) {
      this.say(`Saved ${name}.`);
    }
    onDone(saved);
  }

  /**
   * Restore: the version's cells, locks and option become the week's, after the week as it was
   * is kept as "Before Restore" (the way back), then the week is read again. Undo starts over, as
   * on the desktop. Someone else's save since this screen read the week: nothing is restored, and
   * the box offers Reload, as for any save.
   */
  async handleRestore(event) {
    const id = event.detail.id;
    const version = this.versions.find((v) => v.id === id);
    if (this.versionsBusy) {
      this.say("One moment: an edit is still saving.");
      return;
    }
    await this.restore(id, `Restored ${version ? version.name : ""}.`, {
      name: version ? version.name : null
    });
  }

  /**
   * Restores a version (Restore, and Start over's Undo): said is what the line says once the
   * week is on screen; focus, where focus goes after (a selector), when the control used is gone.
   */
  async restore(id, said, { focus = null, name = null, undo = false } = {}) {
    const loaded = this.loaded;
    // Reads wait while it runs; one for another week (or the screen gone) drops its answer.
    const ticket = this.loadTicket;
    let what = undo
      ? `${name} wasn't undone. Nothing was changed.`
      : `${name || "That version"} wasn't restored. Nothing was changed.`;
    await this.versionsAction(
      () => what,
      async () => {
        // A week not generated yet: the version becomes its Generated Schedule (decision 9).
        const done = loaded.scheduleId
          ? await restoreVersion({
              scheduleId: loaded.scheduleId,
              versionId: id,
              seenRevisions: loaded.revision
            })
          : await restoreVersionAsNew({
              programId: this.programId,
              weekId: this.weekId,
              versionId: id
            });
        if (ticket !== this.loadTicket) {
          return;
        }
        if (!done) {
          // Nothing was changed: someone else's newer week is never replaced unseen. The quiet
          // line Manual Build shows (not an alert), read out once.
          this.conflict = { message: this.restoreRefusedText, quiet: true };
          this.announce(this.restoreRefusedText);
          this.focusAfterRender = { selector: '[data-id="reload"]' };
          return;
        }
        const restored = { id, said };
        let week;
        try {
          week = await loadWeek(this.programId, this.weekId);
        } catch (e) {
          // Restored, but the week can't be read now: it is read again once this is over, and
          // shown then as the restored week (its error goes once that read works).
          what = `${this.weekName} was restored, but couldn't be shown just now.`;
          if (ticket === this.loadTicket) {
            this.readAfterRun = true;
            this.restoreUnread = restored;
          }
          this.errorFromRead = true;
          throw e;
        }
        if (ticket !== this.loadTicket) {
          return;
        }
        // A read asked for meanwhile (the season read again) is still done after this.
        this.loaded = week;
        this.publishState = week.published || null;
        this.showRestored(restored, week);
        if (!loaded.scheduleId) {
          // On a week not generated yet the Versions list goes with the start: focus goes to
          // Rebuild, as after a first Generate.
          this.focusAfterVersions = BUILD_MENU;
        } else if (focus) {
          this.focusAfterVersions = focus;
        }
      }
    );
  }

  /** The week a Restore made, as read: a whole new week (Undo starts over), on screen now. */
  showRestored({ id, said }, week) {
    this.resetChecks();
    // Undo starts over: its steps were made on the week it replaced.
    this.showInEditor("rebuilt");
    this.loadSetupChanges();
    this.restored = { id, revision: week.revision };
    if (this.editorHasWeek) {
      this.say(said);
    } else {
      // A week not generated yet: the editor shows it now, and says it there.
      this.sayWhenShown = said;
    }
  }

  get restoreRefusedText() {
    return `Someone else changed this ${this.t.sIn("Week")} since you opened it, so nothing was restored.`;
  }

  async handleDeleteVersion(event) {
    if (this.versionsBusy) {
      return;
    }
    const id = event.detail.id;
    const version = this.versions.find((v) => v.id === id);
    const scheduleId = this.loaded.scheduleId;
    const done = await this.versionsAction(
      `${version ? version.name : "That version"} wasn't deleted.`,
      () => deleteVersion({ scheduleId, versionId: id })
    );
    if (done) {
      this.say(`Deleted ${version ? version.name : ""}.`);
    }
  }

  async handleRenameVersion(event) {
    const { id, name, onDone } = event.detail;
    if (this.versionsBusy) {
      onDone(false);
      return;
    }
    const version = this.versions.find((v) => v.id === id);
    const renamed = await this.versionsAction(
      `${version ? version.name : "That version"} wasn't renamed.`,
      () => renameSchedule({ scheduleId: id, name })
    );
    onDone(renamed);
  }

  /** ‹ Roots on this screen's rail: said again to the page, which goes home (repo ADR 0020). */
  handleBackToRoots(event) {
    event.stopPropagation();
    this.dispatchEvent(new CustomEvent("backtoroots", { bubbles: true }));
  }
}
