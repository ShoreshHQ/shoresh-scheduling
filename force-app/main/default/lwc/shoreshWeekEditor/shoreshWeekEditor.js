import { LightningElement, api } from "lwc";
import addToManualBuild from "@salesforce/apex/ManualBuildController.addActivity";
import { failed, refusal } from "c/shoreshErrors";
import { FIELD } from "c/shoreshSchema";
import { electivesOf, openCount } from "c/shoreshElectiveDetails";
import {
  activityCards,
  activityGrid,
  dailyGrid,
  dayLabel,
  days,
  groupGrid,
  gridMinWidth,
  groups
} from "c/shoreshScheduleViews";
import {
  OPEN,
  applyRun,
  editRun,
  identity,
  isMovable,
  owner,
  placement,
  staysPut
} from "./slotEdits";
import {
  eventRuns,
  mergedWith,
  planGrid,
  replacedDays,
  rowsCovered,
  specialsOf
} from "./specials";
import { REFUSED, moveEdit, removeEdit, resizeEdit } from "./moves";
import { LEFT_OUT, cellKey as toolCellKey, replan, toolRuns } from "./tools";
import {
  RAIN_PLAN_FULL,
  isMarked,
  marksAfter,
  rainCounts,
  rainModel,
  rainReceipt
} from "./rain";
import { History } from "./history";
import { intentOf, plan, withSeen } from "./conflicts";
import { drawerTiles } from "./counts";
import {
  LOCKED,
  foldRun,
  lockKey,
  locksOfWeek,
  marks,
  noteRows
} from "./locks";
import {
  RULE,
  checkWeek,
  measureWeek,
  otherProgramsAt,
  reasonFor,
  readActivities,
  readElectivePlaces,
  readLocations,
  readOtherPrograms,
  readProgram
} from "c/shoreshEngine";

/** Names compared the way people mean them: spaces and capitals aside. */
function loose(text) {
  return String(text || "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

// Inputs that take no typing: Ctrl+Z on them is the schedule's Undo.
const NOT_TYPED = new Set([
  "button",
  "checkbox",
  "radio",
  "submit",
  "reset",
  "range",
  "color",
  "file",
  "image"
]);

/**
 * A box the director types in, whose own Undo Ctrl+Z belongs to: a text box (Salesforce's own
 * lightning-input and lightning-textarea included, as seen from outside them) or editable text.
 */
function takesTyping(node) {
  const tag = node && node.tagName;
  if (!tag) {
    return false;
  }
  if (tag === "INPUT") {
    return !NOT_TYPED.has(String(node.type || "text").toLowerCase());
  }
  return (
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    tag === "LIGHTNING-INPUT" ||
    tag === "LIGHTNING-TEXTAREA" ||
    tag === "LIGHTNING-INPUT-RICH-TEXT" ||
    node.isContentEditable === true
  );
}

// What "Set it up" makes from a cell a file noted: a special event or day (ADR 0014 slice 4), or
// an elective set, which binds the cells by name (ADR 0018 slice E5).
const SET_UP_HERE = new Set(["S", "D", "E"]);

/** One slot, the same in Daily and Group View. */
function slotKey(slot) {
  return `${slot.day}|${slot.group}|${slot.block}`;
}

/**
 * The week editor (desktop: the schedule screen's editing): draws one week of one program in
 * Daily, Group and Activity View and edits it by hand. In Daily and Group View an activity is
 * dragged from the list onto a slot, a placement dragged to another slot (moved, or swapped with
 * what is there) or back to the list (taken out), its bottom handle dragged to make it longer or
 * shorter; or a name is typed (double-click, Enter, or F2) and Delete clears. From the keyboard,
 * Space picks up a placement or a list activity and Space puts it down; Shift with Up or Down
 * changes the length. Each edit saves at once and can be undone (50 steps). An edit to a slot
 * someone else changed since asks "keep theirs or use yours" (Greg, 2026-10-17); nothing is
 * overwritten unseen. Activity View is read-only.
 *
 * The host (Manual Build) chooses the week, loads and starts it, and keeps its versions: it hands
 * the week over with show(), and the editor tells it what changed (statechange, edited,
 * errorchange, reload). Saving goes through the host's saveRuns(edits), which answers
 * { status: "saved" | "refused", conflicts, schedule, message }. The host's own controls go in
 * the slots: pickers, tools, checks, end, status and outcome (the rail's, below).
 *
 * terms: the camp's words. setup: the season (SeasonSetupController.getSeasonSetup).
 *
 * What Generated Schedule adds, all off until the host passes it (Manual Build passes none):
 * - locks: the locked cells ("date|groupId|blockId"). A locked cell shows its lock, can't be
 *   dragged, dropped on, picked up or typed into; Enter or a click asks the host to unlock it
 *   ("unlockrequest", with the slot) and keeps focus on the cell. Every run saved names the locks
 *   the screen saw (locksBefore), and an Undo or Redo the locks to leave (locksAfter).
 * - tools=false: the host's tools slot is left out ("Add <name> to activities" stays, as on the desktop).
 * - "cellfocus" says which cell keyboard focus reached; "saved" says each save's answer (the
 *   host shows the schedule it carries, never a patched copy); "editstate" says whether edits are
 *   saving (busy) or waiting (queueEmpty), so a host can hold a Rebuild.
 * - checkWith(days, locks): the host's own check of the week (Generated's engine check, with its
 *   locks), used instead of the editor's: its flags, openCells (each with its words) and notes
 *   (lines with no cell) are rows in the Why list (the counter's dropdown). The editor only
 *   lists what it is given; nothing from a check is drawn on the grid (wiki engine care plan Q18).
 * - addActivityWith({ scheduleId, name }): how "Add <name> to activities" adds on the host's draft
 *   (Manual Build's draft when left out).
 * - say(text) and clearNotice(): the host's own line on the quiet line, and taking it away once
 *   it is no longer true (a Lock or Unlock saved).
 *
 * What Manual Build adds: setupDots, a Map of cell ("date|groupId|blockId") to the words of its
 * "setup changed since the week started" note (ADR 0008 part 6): a row each in the Why list.
 *
 * Special days and events on a week (ADR 0014 slice 4): the draft's `specials` ({ days },
 * WeekSpecials) and the season setup's special events. A day a special day replaces shows its own schedule, read-only, in Daily View
 * (its name on the day's pill, "Fri · Visiting Day"), one named cell in Group View, and nothing in
 * Activity View; it is left out of the checks and counts, the counter (the host's checks slot) is
 * not shown on it, and the drawer's place has the special day's line: its name, notes, "Take off
 * <day>" when the host gives takeOffWith (slice 6) and "Open <name>" ("openspecial" { itemId }). The season's special events are placed from the drawer's
 * Events section or by typing a name, over one cell or the cells chosen together; bunks side by
 * side holding one over the same blocks are one cell. A cell noted from a file as a special event
 * or day "not set up yet" offers "Set it up" while it has focus: the host's setUpWith({ kind, name
 * }) makes it (and answers with what to say).
 *
 * What a special day's or event's own schedule adds (c/shoreshSpecialSchedule, ADR 0014 choice
 * 15): planName. Its one day is drawn as Daily View with no view buttons, day pills or drawer,
 * and called by that name wherever a week's lines would name a weekday.
 *
 * The rail (ADR 0008 part 7): the host's slots are pickers (the week and program, at the left),
 * tools (the host's own rail menus, after Edit), checks (the counter, at the right) and end
 * (Versions and Publish, last). Edit is the editor's: Undo and Redo, then the host's editItems
 * ([{ value, label, dataId, disabled }, { divider: true }, { value, label, dataId, children:
 * [...] }]: a row with children opens them under it); choosing one fires editselect { value }.
 */
// How often an edit is sent again, with nothing new to ask, before it is given up.
const MAX_RESENDS = 2;
// Asks to unlock the same cell closer together than this are one gesture (a double-click).
const UNLOCK_ASK_MS = 600;

export default class ShoreshWeekEditor extends LightningElement {
  @api terms;
  @api setup;
  // The names the host's pickers show, for the lines that name the week and the program.
  @api weekName;
  @api programName;
  // Saves edits for the host: (edits) => Promise<{ status, conflicts, schedule, message }>.
  @api saveRuns;
  // True while the host is restoring or saving a version: edits wait (Restore would paint over them).
  @api restoring = false;
  // Pass false for no tools slot.
  @api tools;
  // The host's check of the week: (days, locks) => checkWeek's answer, plus openCells and notes. Left out,
  // the editor checks the week itself (Manual Build).
  @api checkWith;
  // The host's rows in the Edit menu, after Undo and Redo (see above).
  @api editItems;
  // Adds an activity on the host's draft: ({ scheduleId, name }) => the activity as offered.
  @api addActivityWith;
  // Setup changed since the week started (Manual Build): cell key to its words, or nothing.
  @api setupDots;
  // A special day's or event's own schedule (ADR 0014 choice 15): its one day, called this, with
  // no views, day pills or drawer. Left out for a week.
  @api planName;
  // Sets up what a cell noted from a file names (ADR 0014 slice 4): ({ kind, name }) => Promise
  // of the words to say. Left out, no "Set it up" is offered.
  @api setUpWith;
  // Rainy day (repo docs/adr/0019): keeps the week as a version under the name given ("Before
  // rainy Monday") before a day is switched: (name) => Promise. Left out, no "Rainy day…" in Edit.
  @api rainyWith;
  // The version before a rainy day is being kept.
  rainyWorking = false;
  // For each rainy-day Undo step: { date, before, after }, the day's "Rain plan full" marks
  // before and after it (what its Undo and Redo leave).
  stepRain = new Map();
  // "Set it up" is under way.
  settingUp = false;
  // Takes a special day off the day it replaces (ADR 0014 slice 6): ({ specialDayId, day }) =>
  // Promise of the words to say. Left out, no "Take off <day>" is offered.
  @api takeOffWith;
  // "Take off <day>" is under way.
  takingOff = false;
  // The Edit menu's row that has its rows open under it (Copy day to…), or null.
  openEditGroup = null;
  // Cells chosen together (Shift or Cmd/Ctrl with a click, a Shift-drag, Shift with Left or
  // Right, Cmd/Ctrl+Shift with an arrow): { anchor, keys } by grid key, or null (then the cell
  // with keyboard focus is the one Copy takes).
  chosen = null;
  // The grid cell keyboard focus last reached (Copy's and Paste's cell), or null.
  focusKey = null;
  // What Copy took, by where it sat on the grid: { items: [{ dr, dc, slot, length, name, gone
  // }], opens: [{ dr, dc }] }, offsets from its top left cell; kept for this visit to the week.
  clipboard = null;

  // ManualBuildController's DraftView: { schedule, activities, away }, or null (not started).
  _draft = null;
  _view = "day";
  _dayIndex = 0;
  _groupKey;
  // Edits waiting for the server, oldest first; each { edit, key, label }.
  _queue = [];
  _saving = false;
  // The week as the server last sent it, without edits still waiting to save.
  server;
  activityId;
  // The slot being typed into: { key, slot, top, left, text, highlight }.
  editor;
  // An edit someone else's change got in the way of: { edit, where, theirs, yours }.
  conflict;
  announcement = "";
  // A short line under the rail when something the director chose couldn't be made.
  notice;
  // A line said that the next save's announcement would talk over: said again with it, once.
  unrepeated = null;
  // The activity list's Filter box.
  filter = "";
  // "Cleared Monday" after a day or week tool: { text, stepId }, shown with Undo while Undo
  // would take back that step.
  toolNotice = null;
  // After the line's Undo, focus goes to the Edit menu (the line itself goes away).
  focusUndoAfterRender = false;
  // After a day or week tool, focus goes to its line's Undo.
  focusToolUndoAfterRender = false;
  // Where keyboard focus goes once the page has drawn (after a list line was clicked).
  focusAfterRender = null;
  // "Set it up" done: { key } of its cell, focused once drawn ("Open <name>" if the day is replaced).
  focusAfterSetUp = null;
  // "Take off <day>" done: { index } of that day's pill, focused once drawn.
  focusPillAfterRender = null;
  // focusCell asked before the grid was drawn (a week just started): { key }, kept until it is.
  focusCellWhenDrawn = null;
  // Cells a rainy day just switched to their rain plan: a quiet pulse shows what changed.
  pulseKeys = [];
  pulseFlip = false;
  // The last check and what it was worked out from. Changed in place, so updating it while the
  // page renders doesn't ask for another render (so never @track it).
  checkMemo = { inputs: null, result: null };
  measureMemo = { checked: null, activities: null, result: null };
  // The drawer's measure in Group View (one bunk's), and the Open cells a held activity fits.
  bunkMeasureMemo = { key: null, checked: null, result: null };
  fitsMemo = { key: null, checked: null, result: [] };
  // The week's replaced days, worked out once per draft's specials.
  replacedMemo = { of: null, days: new Map() };
  // The season's special events, worked out once per setup.
  eventsMemo = { of: null, list: [] };
  // The season's elective sets, with their counts and places, worked out once per setup.
  electivesMemo = { of: null, list: [], places: new Map() };
  // The drawer tile under the pointer or with keyboard focus (its activity is outlined).
  hoverActivityId = null;
  // Picked up from the keyboard, or being dragged: { kind: "activity", id } or
  // { kind: "cell" | "resize", slot, key }.
  picked;
  dragging;
  history = new History();
  // Bumped whenever history changes, so Undo and Redo show what they would do.
  historyVersion = 0;
  stepSeq = 0;
  // What the host was last told by statechange, and by editstate.
  told = null;
  toldEditState = null;
  // The locks the host passed, as a set (null: none passed, so runs carry none), as of the last
  // save the editor knows of; and, for each Undo step, the locks before and after it.
  lockBase = null;
  _locks;
  stepLocks = new Map();
  // Each cell a Lock-menu choice last covered, with the newest step made by then (stepSeq): an
  // Undo or Redo of that step or an earlier one leaves its lock as it is now.
  lockChosenAt = new Map();

  connectedCallback() {
    // The slot box sits where the slot was on screen; scrolling would leave it behind.
    this.onScroll = () => this.followEditor();
    window.addEventListener("scroll", this.onScroll, true);
    // Ctrl+Z with nothing focused (after a click on the page or a drag): still this week's Undo.
    this.onPageKeyDown = (event) => this.handlePageKeyDown(event);
    window.addEventListener("keydown", this.onPageKeyDown);
  }

  disconnectedCallback() {
    window.removeEventListener("scroll", this.onScroll, true);
    window.removeEventListener("keydown", this.onPageKeyDown);
  }

  get t() {
    return this.terms;
  }

  /** The locked cells ("date|groupId|blockId"): an array or a set. Leave unset for none. */
  @api
  get locks() {
    return this._locks;
  }
  set locks(value) {
    this._locks = value;
    this.lockBase = value ? new Set(value) : null;
  }

  /**
   * A Lock-menu choice covered these cells ("date|groupId|blockId"), locked already or not: an
   * Undo or Redo of any step made before leaves their locks as they are (Greg, 2026-10-18).
   */
  @api
  lockChosen(keys) {
    [...(keys || [])].forEach((key) =>
      this.lockChosenAt.set(key, this.stepSeq)
    );
  }

  /**
   * Undo and Redo start over. The Lock choices are kept: steps made from now on come after them,
   * so they hold none of those (the map has at most one entry per cell).
   */
  startHistoryOver() {
    this.history.clear();
    this.historyVersion += 1;
  }

  /** The locks with the edits still waiting made on top, or null when no locks were passed. */
  get liveLocks() {
    if (!this.lockBase) {
      return null;
    }
    return this.queue.reduce(
      (state, waiting) =>
        waiting.edit.runs.reduce(
          (now, run) => foldRun(now, run, waiting.locksTarget),
          state
        ),
      this.lockBase
    );
  }

  get showTools() {
    return this.tools !== false;
  }

  // ---------- what the host is told ----------

  // The week and what the host's own controls depend on are kept behind setters, so the host
  // hears of every change as it happens (and only when something it shows really changed).
  get draft() {
    return this._draft;
  }
  set draft(value) {
    this._draft = value;
    this.tell();
  }
  get view() {
    return this._view;
  }
  set view(value) {
    this._view = value;
    this.tell();
  }
  get dayIndex() {
    return this._dayIndex;
  }
  set dayIndex(value) {
    this._dayIndex = value;
    this.tell();
  }
  get groupKey() {
    return this._groupKey;
  }
  set groupKey(value) {
    this._groupKey = value;
    this.tell();
  }
  get queue() {
    return this._queue;
  }
  set queue(value) {
    this._queue = value;
    this.tell();
  }
  get saving() {
    return this._saving;
  }
  set saving(value) {
    this._saving = value;
    this.tell();
  }

  /** An edit is saving or waiting to. */
  @api
  get busy() {
    return this._saving || this._queue.length > 0;
  }

  /** Nothing is under way, so the week may be read again: no edit saving, no box or question open. */
  @api
  get settled() {
    return !this.busy && !this.editor && !this.conflict;
  }

  tell() {
    const next = {
      draft: this._draft,
      view: this._view,
      dayIndex: this._dayIndex,
      groupKey: this._groupKey,
      busy: this.busy
    };
    const queueEmpty = this._queue.length === 0;
    const state = this.toldEditState;
    if (!state || state.busy !== next.busy || state.queueEmpty !== queueEmpty) {
      this.toldEditState = { busy: next.busy, queueEmpty };
      this.dispatchEvent(
        new CustomEvent("editstate", { detail: this.toldEditState })
      );
    }
    const told = this.told;
    if (told && Object.keys(next).every((name) => next[name] === told[name])) {
      return;
    }
    this.told = next;
    this.dispatchEvent(new CustomEvent("statechange", { detail: next }));
  }

  /** Said to the host: an edit changed the week (a reload on its way is now older than it). */
  edited() {
    this.dispatchEvent(new CustomEvent("edited"));
  }

  /** Said to the host: the line for an error to show (null clears it). */
  reportError(message) {
    this.dispatchEvent(new CustomEvent("errorchange", { detail: { message } }));
  }

  // ---------- what the host does with the week ----------

  /**
   * Shows a week the server sent (null for none). A fresh one (another week, or one just started)
   * starts at the first day and bunk; a refreshed one stays where it was.
   */
  @api
  show(draft, fresh) {
    this.draft = draft;
    // What was picked up was a position in the old copy of the week: let it go.
    this.picked = null;
    // The week as the server last sent it, without edits still waiting to save.
    this.server = draft ? draft.schedule : null;
    if (fresh && draft) {
      this.toolNotice = null;
      this.pulseKeys = [];
      this.chosen = null;
      this.focusKey = null;
      this.dayIndex = 0;
      const all = groups(draft.schedule);
      this.groupKey = all.length ? all[0].key : null;
      this.activityId = null;
    }
  }

  /** Another week is about to be shown: nothing of this visit to the last one is kept. */
  @api
  clear() {
    this.focusCellWhenDrawn = null;
    this.draft = null;
    this.notice = null;
    this.unrepeated = null;
    this.closeEditor();
    // Undo is for this visit to this week (Greg #10).
    this.startHistoryOver();
    this.picked = null;
    // So is what was copied (Copy day to… works within the week too).
    this.chosen = null;
    this.focusKey = null;
    this.clipboard = null;
  }

  /** The week after a Restore: Undo starts over, as on the desktop. */
  @api
  restored(draft) {
    this.startHistoryOver();
    this.toolNotice = null;
    this.show(draft, false);
  }

  /** The week as the server last sent it (the host compares its revisions), or null. */
  @api
  get savedWeek() {
    return this.server || null;
  }

  /** While a version is being restored or saved, edits wait (Restore would paint over them). */
  refuseWhileRestoring() {
    if (!this.restoring) {
      return false;
    }
    this.say(
      `One moment: the ${this.t.sIn("Week")} is being saved or restored.`
    );
    return true;
  }

  /**
   * Puts keyboard focus on a cell of the grid on screen (its grid key; the first cell without one).
   * Asked before the grid is drawn (a week just shown), it waits until the grid is, unless focus
   * has gone somewhere by then.
   */
  @api
  focusCell(key) {
    const grid = this.template.querySelector('[data-id="edit-grid"]');
    if (grid) {
      this.focusCellWhenDrawn = null;
      grid.focusCell(key);
    } else {
      this.focusCellWhenDrawn = { key };
    }
  }

  /** A line on the quiet line, said by screen readers once (the host's own news). */
  @api
  setNotice(text) {
    this.notice = text;
    this.announce(text);
  }

  /** The quiet line is no longer true (the host's Lock or Unlock saved): it goes, and isn't said again. */
  @api
  clearNotice() {
    this.notice = null;
    this.unrepeated = null;
  }

  // ---------- the week ----------

  get schedule() {
    return this.draft ? this.draft.schedule : null;
  }
  get hasNoDays() {
    return !!this.schedule && this.schedule.days.length === 0;
  }

  // ---------- checks ----------

  /** The week checked (c/shoreshEngine checkWeek), worked out again only when the week or setup changes. */
  @api
  get checked() {
    const schedule = this.schedule;
    // Everything the checks read comes with the draft and is read again with the week (one
    // source): activities, places, the program's groups and divisions, where its fixed and
    // recurring activities are, the away blocks, and other programs at places and activities.
    // A host's own check also reads the locks (the server's, with the edits waiting made).
    const inputs = [
      schedule,
      this.draft,
      this.t,
      this.checkWith,
      this.lockBase,
      this._queue,
      this.electivePlaces
    ];
    const memo = this.checkMemo;
    if (memo.inputs && memo.inputs.every((input, i) => input === inputs[i])) {
      return memo.result;
    }
    memo.inputs = inputs;
    memo.result = this.checkDays((schedule && schedule.days) || []);
    return memo.result;
  }

  /**
   * A week's days checked: the host's own check when it gives one (Generated, with its locks),
   * else checkWeek on the draft's setup. Used for the week shown, and for the week as it would be
   * with an activity put down somewhere (the drawer's "fits here").
   */
  checkDays(weekDays) {
    if (this.checkWith) {
      // The host's engine leaves out the days a special day replaces itself.
      return this.checkWith(weekDays, this.liveLocks);
    }
    // A day a special day replaces is not checked or counted (ADR 0014 slice 4).
    const replaced = this.replaced;
    weekDays = weekDays.filter((day) => !replaced.has(day.dateValue));
    const draft = this.draft || {};
    const entry = {
      divisions: [{ groups: draft.groupRecords || [] }],
      fixedActivities: draft.fixedActivityRecords || [],
      recurringActivities: draft.recurringActivityRecords || []
    };
    const away = new Set();
    ((this.draft && this.draft.away) || []).forEach((row) =>
      row.blockIds.forEach((blockId) => away.add(`${row.groupId}|${blockId}`))
    );
    return checkWeek(
      weekDays,
      {
        activities: readActivities(draft.activityRecords),
        locations: readLocations(draft.locationRecords),
        ...readProgram(entry),
        // An elective set takes up its offerings' places (ADR 0018 slice E5).
        electivePlaces: this.electivePlaces,
        notFor: new Map(
          ((this.draft && this.draft.activities) || []).map((a) => [
            a.id,
            a.notFor || []
          ])
        ),
        isAway: (groupId, blockId) => away.has(`${groupId}|${blockId}`),
        ...otherProgramsAt(readOtherPrograms(draft.otherPrograms), weekDays)
      },
      { t: this.t, dayName: (dateValue) => this.dayNameOf(dateValue) }
    );
  }

  /**
   * The week's measure (c/shoreshEngine measureWeek): what the rail's counter and the drawer
   * show, from the same check, so they never disagree. Worked out again only with the check.
   */
  @api
  get measure() {
    const checked = this.checked;
    const activities = (this.draft && this.draft.activities) || null;
    const weekDays = (this.schedule && this.schedule.days) || [];
    const memo = this.measureMemo;
    if (
      memo.checked !== checked ||
      memo.activities !== activities ||
      memo.setupDots !== this.setupDots ||
      memo.days !== weekDays
    ) {
      memo.checked = checked;
      memo.activities = activities;
      memo.setupDots = this.setupDots;
      memo.days = weekDays;
      const measured = measureWeek(checked, activities || [], weekDays);
      const why = this.whyRows(checked, weekDays);
      memo.result = {
        ...measured,
        look: [...measured.look, ...why.look],
        open: why.open,
        notes: why.notes,
        offTarget:
          measured.offTarget ||
          why.look.length > 0 ||
          why.open.length > 0 ||
          why.notes.length > 0
      };
    }
    return memo.result;
  }

  /**
   * The Why list's rows that measureWeek doesn't make (wiki engine care plan Q18: nothing from
   * the engine or the rule checks sits on the grid; it is all said here, each row naming its
   * cell, place first): look, one row per placement with everything said about it joined (what
   * the check says about the placement as a whole (a time block it shares with other
   * cells is the overlapping cell's own row), setup changed since the week started,
   * rain plan full), "Bunk 1 · Monday · Period 2 · Soccer: …"; open, the host's Open cells with
   * why (Generated), "Bunk 1 · Monday · Period 3: …"; notes, the
   * host's lines with no cell (setup taken as 1, the imported week).
   */
  whyRows(checked, weekDays) {
    const look = [];
    if (!checked) {
      return { look, open: [], notes: [] };
    }
    const dayOf = (dateValue) =>
      weekDays.find((d) => d.dateValue === dateValue);
    const where = (dateValue, groupId, blockId) => {
      const day = dayOf(dateValue);
      const grp = day && day.groups.find((x) => x.id === groupId);
      const block = day && day.blocks.find((x) => x.id === blockId);
      return [
        grp ? grp.name : "",
        this.dayNameOf(dateValue),
        block ? block.name : ""
      ].join(" · ");
    };
    // One row per placement (keyed where it starts), its reasons joined as the checks join
    // them (" · "): what the check flags, then setup changed, then rain plan full.
    const said = new Map();
    const say = (key, words) => {
      const list = said.get(key) || [];
      if (words && !list.includes(words)) {
        list.push(words);
      }
      said.set(key, list);
    };
    // Only the reasons about the placement as a whole: a reason about a time block it shares
    // with other cells is that overlapping cell's own row (no Accept), from measureWeek.
    (checked.wholeFlags || new Map()).forEach((words, key) => say(key, words));
    // Setup changed: on the placement it is part of (any of its time blocks).
    (this.setupDots || new Map()).forEach((words, key) => {
      const [dateValue, groupId, blockId] = key.split("|");
      const day = dayOf(dateValue);
      const g = day ? day.groups.findIndex((x) => x.id === groupId) : -1;
      const b = day ? day.blocks.findIndex((x) => x.id === blockId) : -1;
      say(
        g >= 0 && b >= 0
          ? `${dateValue}|${groupId}|${day.blocks[placement(day, g, b).first].id}`
          : key,
        words
      );
    });
    weekDays.forEach((day, d) => {
      if (!day.rain || !day.rain.length || day.problem) {
        return;
      }
      day.groups.forEach((grp, g) =>
        day.blocks.forEach((block, b) => {
          if (
            placement(day, g, b).first === b &&
            this.rainFullFor({ day: d, group: g, block: b })
          ) {
            say(`${day.dateValue}|${grp.id}|${block.id}`, RAIN_PLAN_FULL);
          }
        })
      );
    });
    // In the week's order: by day, then group, then time block.
    const at = (key) => {
      const [dateValue, groupId, blockId] = key.split("|");
      const d = weekDays.findIndex((x) => x.dateValue === dateValue);
      const day = weekDays[d];
      return [
        d,
        day ? day.groups.findIndex((x) => x.id === groupId) : -1,
        day ? day.blocks.findIndex((x) => x.id === blockId) : -1
      ];
    };
    [...said]
      .sort((x, y) => {
        const px = at(x[0]);
        const py = at(y[0]);
        return px[0] - py[0] || px[1] - py[1] || px[2] - py[2];
      })
      .forEach(([key, list]) => {
        const [dateValue, groupId, blockId] = key.split("|");
        const p = (checked.placements || []).find((x) => x.key === key);
        const name = p ? this.activityName(p.id) : "";
        const words = list.join(" · ");
        // Place first, then what is there: "Bunk 1 · Monday · Period 2 · Soccer: …".
        const place = [where(dateValue, groupId, blockId), name]
          .filter(Boolean)
          .join(" · ");
        look.push({
          key: `why|${key}|${words}`,
          kind: "placement",
          text: `${place}: ${words}`,
          groupId,
          dateValue,
          blockId
        });
      });
    // Only an Open cell with a reason: the rest are counted in "still needed", as on Manual Build.
    const open = (checked.openCells || [])
      .filter((c) => c.reason)
      .map((c) => ({
        key: `open|${c.dateValue}|${c.groupId}|${c.blockId}|${c.reason || ""}`,
        kind: "open",
        text: c.text,
        groupId: c.groupId,
        dateValue: c.dateValue,
        blockId: c.blockId
      }));
    const notes = (checked.notes || []).map((text) => ({
      key: `note|${text}`,
      kind: "note",
      text
    }));
    return { look, open, notes };
  }

  /** The counter's row: that activity, in Activity View (the editor's own drill-down). */
  @api
  showActivity(activityId) {
    if (!activityId || !this.draft) {
      return;
    }
    this.closeEditor();
    this.picked = null;
    this.pulseKeys = [];
    this.view = "activity";
    this.activityId = activityId;
  }

  /**
   * A line takes the director to its bunk's week (desktop: Group View of that group, the list
   * closed); an overlapping cell's line also puts keyboard focus on that cell.
   */
  @api
  showLine(line) {
    if (!line || !line.groupId) {
      return;
    }
    this.closeEditor();
    this.picked = null;
    this.pulseKeys = [];
    this.view = "group";
    this.activityId = null;
    this.groupKey = line.groupId;
    this.focusAfterRender = { cellKey: this.cellKeyOf(line) };
  }

  /** In Group View, the grid cell holding a line's day and time block, if it names one. */
  cellKeyOf(line) {
    if (!line.dateValue || !this.schedule) {
      return null;
    }
    const d = this.schedule.days.findIndex(
      (day) => day.dateValue === line.dateValue
    );
    const day = this.schedule.days[d];
    const g = day ? day.groups.findIndex((grp) => grp.id === line.groupId) : -1;
    const b = day ? day.blocks.findIndex((blk) => blk.id === line.blockId) : -1;
    if (g < 0 || b < 0) {
      return null;
    }
    const first = placement(day, g, b).first;
    const grid = groupGrid(this.schedule, line.groupId, this.t);
    const found = grid.cells.find(
      (c) => c.slot && c.slot.day === d && c.slot.block === first
    );
    return found ? found.key : null;
  }
  get noDaysMessage() {
    return `${this.weekName} has no days ${this.programName} runs.`;
  }

  /** Daily, Group and Activity: rail items, the one shown raised (the rail's one selected look). */
  get viewButtons() {
    return [
      ["day", "Daily"],
      ["group", "Group"],
      ["activity", "Activity"]
    ].map(([key, label]) => ({
      key,
      label,
      className:
        key === this.view
          ? "shoresh-item view-button view-button_on shoresh-raised"
          : "shoresh-item view-button",
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
    this.closeEditor();
    this.pulseKeys = [];
    this.picked = null;
    this.letGoOfCells();
    if (this.view !== "activity") {
      this.activityId = null;
    }
  }
  get corner() {
    return this.t.s("TimeBlock");
  }

  /** The week's days on the rail: "Mon" to "Fri", no dates (decision 33); read out in full. */
  get dayPills() {
    const replaced = this.replaced;
    return days(this.schedule).map((day) => ({
      ...day,
      // A day a special day replaces carries its name: "Fri · Visiting Day".
      special: this.specialOn(day.index),
      name: [`${day.label}, ${day.sub}`, this.specialOn(day.index, replaced)]
        .filter(Boolean)
        .join(", "),
      pressed: String(day.index === this.dayIndex),
      className:
        day.index === this.dayIndex
          ? "shoresh-item pill pill_on shoresh-raised"
          : "shoresh-item pill"
    }));
  }
  get showDayPills() {
    return !!this.draft && !this.hasNoDays && this.isDaily && !this.planName;
  }
  /** Daily, Group and Activity: a week's, not a special day's or event's own schedule. */
  get showViews() {
    return !this.planName;
  }
  /** What a day is called in lines and questions: its weekday, or the plan's name. */
  dayNameOf(dateValue) {
    return this.planName || dayLabel(dateValue).label;
  }
  get showGroupPills() {
    return !!this.draft && !this.hasNoDays && this.isGroup;
  }
  get dayWord() {
    return "Day";
  }
  get groupWord() {
    return this.t.s("Group");
  }
  /**
   * A day that can't be read, in camp words. Why (the server's reason, about how the day is
   * stored) is no help to a director and isn't shown; nothing on the day is changed.
   */
  get dayProblem() {
    const day = this.schedule && this.schedule.days[this.dayIndex];
    return day && day.problem
      ? `${this.dayNameOf(day.dateValue)} can't be shown. Nothing on it was changed.`
      : null;
  }
  get dailyGridLabel() {
    if (this.planName) {
      return this.planName;
    }
    const day = this.dayPills.find((pill) => pill.index === this.dayIndex);
    return day ? day.label : null;
  }
  handleDay(event) {
    this.dayIndex = Number(event.currentTarget.dataset.index);
    this.closeEditor();
    this.pulseKeys = [];
    this.picked = null;
    this.letGoOfCells();
  }

  get groupPills() {
    return groups(this.schedule).map((grp) => ({
      ...grp,
      pressed: String(grp.key === this.groupKey),
      className:
        grp.key === this.groupKey
          ? "shoresh-item pill pill_on shoresh-raised"
          : "shoresh-item pill"
    }));
  }
  get groupGridLabel() {
    const grp = this.groupPills.find((pill) => pill.key === this.groupKey);
    return grp ? grp.name : null;
  }
  handleGroup(event) {
    this.groupKey = event.currentTarget.dataset.key;
    this.closeEditor();
    this.pulseKeys = [];
    this.picked = null;
    this.letGoOfCells();
  }

  /** The grid on screen (Daily or Group View), with away and saving slots marked. */
  get editGrid() {
    if (!this.schedule) {
      return null;
    }
    const grid = this.isDaily
      ? dailyGrid(this.schedule, this.dayIndex, this.t)
      : this.groupKey && groupGrid(this.schedule, this.groupKey, this.t);
    if (!grid) {
      return null;
    }
    const saving = new Set(this.queue.map((entry) => entry.slotKey));
    const locks = this.liveLocks;
    const cells = grid.cells.map((cell) => this.decorate(cell, saving, locks));
    return {
      ...grid,
      cells: this.isGroup ? this.withReplacedColumns(cells, grid) : cells
    };
  }

  // ---------- special days and events (ADR 0014 slice 4) ----------

  get specials() {
    return specialsOf(this.draft);
  }

  /** The week's days a special day replaces, by date (worked out once per draft). */
  get replaced() {
    const specials = this.specials;
    if (this.replacedMemo.of !== specials) {
      this.replacedMemo = { of: specials, days: replacedDays(this.draft) };
    }
    return this.replacedMemo.days;
  }

  /** The special day's name on a day of the week (by index), or null. */
  specialOn(dayIndex, replaced = this.replaced) {
    const day = this.schedule && this.schedule.days[dayIndex];
    const special = day && replaced.get(day.dateValue);
    return special ? special.name : null;
  }

  /** The day a special day replaces, shown in Daily View (a week's, not a plan's), or null. */
  get replacedShown() {
    if (!this.isDaily || this.planName || !this.schedule) {
      return null;
    }
    const day = this.schedule.days[this.dayIndex];
    return (day && this.replaced.get(day.dateValue)) || null;
  }

  /** Its own schedule, as that day's grid (read-only). */
  get planShown() {
    return planGrid(this.replacedShown, this.t);
  }

  /** Why its schedule isn't drawn: it can't be read, or it has no time blocks yet. */
  get planMissing() {
    const shown = this.replacedShown;
    if (!shown || this.planShown) {
      return null;
    }
    return shown.plan && shown.plan.problem
      ? `${shown.name}'s schedule can't be shown.`
      : `${shown.name} has no schedule yet.`;
  }

  /** The drawer's place on a replaced day: the special day, its notes, and the way to open it. */
  get specialLine() {
    const shown = this.replacedShown;
    if (!shown) {
      return null;
    }
    return {
      name: shown.name,
      kind: this.t.s("SpecialDay"),
      notes: shown.notes || "",
      open: `Open ${shown.name}`,
      // The mock-up's "Take off Friday" (placed-day.png), when the host can.
      takeOff: this.takeOffWith ? `Take off ${shown.day}` : null
    };
  }

  /**
   * "Take off <day>" (ADR 0014 slice 6; desktop "Remove from this day"): the host takes the
   * special day off and reads the week again, so the day's own cells, kept all along, are back.
   * What it says is said here; the cursor goes to that day's pill, which stays chosen.
   */
  async handleTakeOffSpecial() {
    const shown = this.replacedShown;
    if (!shown || !this.takeOffWith || this.takingOff) {
      return;
    }
    const index = this.dayIndex;
    this.takingOff = true;
    try {
      const said = await this.takeOffWith({
        specialDayId: shown.specialDayId,
        day: shown.day
      });
      this.sayOnce(said || `${shown.name} is off ${shown.day}.`);
      this.focusPillAfterRender = { index };
    } catch (e) {
      this.reportError(
        failed(
          `${shown.name} wasn't taken off ${shown.day}. Nothing was changed.`,
          e
        )
      );
    } finally {
      this.takingOff = false;
    }
  }

  /** The counter is the week's: not shown on a day a special day replaces (decision 47.4). */
  get showChecks() {
    return !this.replacedShown;
  }

  handleOpenSpecial() {
    const shown = this.replacedShown;
    if (shown) {
      this.dispatchEvent(
        new CustomEvent("openspecial", {
          detail: { itemId: shown.specialDayId }
        })
      );
    }
  }

  /**
   * Group View: a day a special day replaces is one cell down its column, named for it (its
   * schedule is the special day's, shown in Daily View).
   */
  withReplacedColumns(cells, grid) {
    const replaced = this.replaced;
    if (!replaced.size) {
      return cells;
    }
    const rows = Math.max(1, grid.rows.length);
    const out = cells.filter(
      (cell) =>
        !cell.slot || !replaced.has(this.schedule.days[cell.slot.day].dateValue)
    );
    this.schedule.days.forEach((day, d) => {
      const special = replaced.get(day.dateValue);
      if (special) {
        out.push({
          key: `${d}-special`,
          row: 0,
          column: d,
          length: rows,
          style: `grid-row: 1 / span ${rows}; grid-column: ${d + 2} / span 1;`,
          text: special.name,
          className: "cell cell_plan",
          title: `${special.name}: ${this.t.s("SpecialDay")}`
        });
      }
    });
    return out;
  }

  /** The week for Activity View: a day a special day replaces counts nothing. */
  get activitySchedule() {
    const replaced = this.replaced;
    if (!replaced.size || !this.schedule) {
      return this.schedule;
    }
    return {
      ...this.schedule,
      days: this.schedule.days.map((day) => {
        if (!replaced.has(day.dateValue)) {
          return day;
        }
        return {
          ...day,
          rows: day.rows.map((row) => row.replace(/[^,]/g, ""))
        };
      })
    };
  }

  /**
   * The season's special events, to place ({ id, name, location }), from the season setup
   * (SeasonSetupController: special.specialEvents, in the Special events screen's order).
   */
  get events() {
    const setup = this.setup || {};
    const memo = this.eventsMemo;
    if (memo.of !== setup) {
      const places = new Map(
        (setup.locations || []).map((place) => [place.Id, place.Name])
      );
      memo.of = setup;
      memo.list = ((setup.special && setup.special.specialEvents) || []).map(
        (event) => ({
          id: event.Id,
          name: event.Name,
          location: places.get(event[FIELD.SpecialEvent.Location]) || null
        })
      );
    }
    return memo.list;
  }

  eventFor(item) {
    return this.events.find((e) => `S:${e.id}` === item) || null;
  }

  /** The drawer's Events section: the events, filtered as the activities are. */
  get eventTiles() {
    const typed = loose(this.filter);
    return this.events
      .filter((e) => !typed || loose(e.name).includes(typed))
      .map((e) => ({
        id: e.id,
        name: e.name,
        said: [e.name, this.t.s("SpecialEvent"), e.location]
          .filter(Boolean)
          .join(", ")
      }));
  }

  get eventsHeading() {
    return this.t.s("SpecialEvent") === "Special event"
      ? "Events"
      : this.t.p("SpecialEvent");
  }

  /** The event held: picked up from its tile, or being dragged. */
  get heldEventId() {
    if (this.picked && this.picked.kind === "event") {
      return this.picked.id;
    }
    return this.dragging && this.dragging.kind === "event"
      ? this.dragging.id
      : null;
  }

  handlePickEvent(event) {
    const { id } = event.detail;
    if (this.heldEventId === id) {
      this.letGo();
      return;
    }
    const found = this.events.find((e) => e.id === id);
    // Cells already chosen together: the event goes over them at once (decision 47.2).
    const chosen =
      this.chosen && this.editGrid
        ? this.editGrid.cells.find((c) => c.slot && this.chosen.keys.has(c.key))
        : null;
    if (chosen) {
      this.placeEvent(id, chosen);
      return;
    }
    this.picked = { kind: "event", id };
    this.announce(`${found ? found.name : ""} picked up.`);
    const grid = this.template.querySelector('[data-id="edit-grid"]');
    if (grid) {
      grid.focusCell();
    }
  }

  handleEventDragStart(event) {
    const { id } = event.detail;
    const found = this.events.find((e) => e.id === id);
    this.dragging = { kind: "event", id, name: found ? found.name : "" };
  }

  // ---------- elective sets on the week (ADR 0018 slice E5) ----------

  /**
   * The season's elective sets, to place ({ id, name, count }), from the season setup
   * (SeasonSetupController: electives, ElectiveMenus): count is its confirmed, open offerings
   * (decision 53), what its cell shows ("Chugim (4)").
   */
  get electives() {
    const setup = this.setup || {};
    const memo = this.electivesMemo;
    if (memo.of !== setup) {
      const { sets, offerings } = electivesOf(setup);
      memo.of = setup;
      memo.list = sets.map((set) => ({
        id: set.Id,
        name: set.Name,
        count: openCount(
          offerings.filter((o) => o[FIELD.Offering.ElectiveSet] === set.Id)
        )
      }));
      // Where each set takes place (its offerings' places), for "more groups than fit".
      memo.places = readElectivePlaces(offerings, setup.activities);
    }
    return memo.list;
  }

  /** Each elective set's places (readElectivePlaces), for the checks. */
  get electivePlaces() {
    return this.electives && this.electivesMemo.places;
  }

  electiveFor(item) {
    return this.electives.find((e) => `E:${e.id}` === item) || null;
  }

  /** "Chugim (4)": the set and how many of its offerings are confirmed and open. */
  electiveLabel(set) {
    return `${set.name} (${set.count})`;
  }

  /**
   * The drawer's elective sets, first, before the activities (mock-up electives-r1 grid-a), and
   * only when the camp has any: filtered as the activities are.
   */
  get electiveTiles() {
    const typed = loose(this.filter);
    const word = this.t.s("ElectiveSet");
    return this.electives
      .filter((e) => !typed || loose(e.name).includes(typed))
      .map((e) => ({
        id: e.id,
        name: e.name,
        words: `${e.count} ${e.count === 1 ? "offering" : "offerings"}`,
        said: `${e.name}, ${word}, ${e.count} ${e.count === 1 ? "offering" : "offerings"}`
      }));
  }

  /** The elective set held: picked up from its tile, or being dragged. */
  get heldElectiveId() {
    if (this.picked && this.picked.kind === "elective") {
      return this.picked.id;
    }
    return this.dragging && this.dragging.kind === "elective"
      ? this.dragging.id
      : null;
  }

  handlePickElective(event) {
    const { id } = event.detail;
    if (this.heldElectiveId === id) {
      this.letGo();
      return;
    }
    const found = this.electives.find((e) => e.id === id);
    // Cells already chosen together: the set goes over them at once, as an event does.
    const chosen =
      this.chosen && this.editGrid
        ? this.editGrid.cells.find((c) => c.slot && this.chosen.keys.has(c.key))
        : null;
    if (chosen) {
      this.placeElective(id, chosen);
      return;
    }
    this.picked = { kind: "elective", id };
    this.announce(`${found ? found.name : ""} picked up.`);
    const grid = this.template.querySelector('[data-id="edit-grid"]');
    if (grid) {
      grid.focusCell();
    }
  }

  handleElectiveDragStart(event) {
    const { id } = event.detail;
    const found = this.electives.find((e) => e.id === id);
    this.dragging = { kind: "elective", id, name: found ? found.name : "" };
  }

  /**
   * Puts an elective set over a cell, or the cells it covers (rangeFor), as one Undo step. Each
   * time block is its own elective time (desktop: a placed elective never spans; plan §2: one per
   * day, time block and division), so each block holds the set on its own, and bunks side by
   * side are one cell per block (decision 53.2). Refused as an event is: a fixed or recurring
   * activity, a bunk not at camp or a locked cell.
   */
  placeElective(setId, cell) {
    const found = this.electives.find((e) => e.id === setId);
    if (!found || !cell || !cell.slot) {
      return;
    }
    const weekDays = this.schedule.days;
    const rows = rowsCovered(weekDays, this.rangeFor(cell)).sort(
      (a, b) => a.day - b.day || a.group - b.group
    );
    const result = eventRuns(
      weekDays,
      rows,
      `E:${setId}`,
      {
        isAway: (slot) => this.isAwaySlot(slot),
        isLocked: (slot) => this.isLockedSlot(slot)
      },
      true
    );
    this.commitPlaced(result, rows, found.name, cell);
  }

  /**
   * The cells an event put down on a cell (or typed into it) covers: the cells chosen together
   * when the cell is one of them, else the cells drawn as one with it (an event side by side),
   * else the cell itself.
   */
  rangeFor(cell) {
    const grid = this.editGrid;
    const cells = ((grid && grid.cells) || []).filter((c) => c.slot);
    if (this.chosen && this.chosen.keys.has(cell.key)) {
      return cells.filter((c) => this.chosen.keys.has(c.key));
    }
    return mergedWith(cells, cell);
  }

  /** "Aspen to Oak · Wednesday · 9:00 to 10:35": where a range is, for Undo and the line. */
  rangeName(rows) {
    const weekDays = this.schedule.days;
    const first = rows[0];
    const last = rows[rows.length - 1];
    const day = weekDays[first.day];
    const groupsSaid =
      rows.length === 1 || first.group === last.group
        ? day.groups[first.group].name
        : `${day.groups[first.group].name} to ${day.groups[last.group].name}`;
    const dayNames = [...new Set(rows.map((r) => r.day))]
      .map((d) => this.dayNameOf(weekDays[d].dateValue))
      .join(", ");
    const top = Math.min(...rows.map((r) => r.first));
    const bottom = Math.max(...rows.map((r) => r.last));
    const blocks =
      top === bottom
        ? day.blocks[top].name
        : `${day.blocks[top].name} to ${day.blocks[bottom].name}`;
    return [groupsSaid, dayNames, blocks].join(" · ");
  }

  /** Puts a special event over a cell, or the cells it covers (rangeFor), as one Undo step. */
  placeEvent(eventId, cell) {
    const found = this.events.find((e) => e.id === eventId);
    if (!found || !cell || !cell.slot) {
      return;
    }
    const weekDays = this.schedule.days;
    const rows = rowsCovered(weekDays, this.rangeFor(cell)).sort(
      (a, b) => a.day - b.day || a.group - b.group
    );
    const result = eventRuns(weekDays, rows, `S:${eventId}`, {
      isAway: (slot) => this.isAwaySlot(slot),
      isLocked: (slot) => this.isLockedSlot(slot)
    });
    this.commitPlaced(result, rows, found.name, cell);
  }

  /**
   * An event's or elective set's runs (eventRuns) made as one Undo step, or why not, said. The
   * cell keeps focus, or the cell it is now drawn as one with.
   */
  commitPlaced(result, rows, name, cell) {
    const weekDays = this.schedule.days;
    if (result.refused) {
      const at = result.at;
      if (result.refused === "locked") {
        this.refuseLocked(at);
      } else if (result.refused === "away") {
        this.refuse(
          `${weekDays[at.day].groups[at.group].name} isn't at camp then.`
        );
      } else {
        this.refuse(this.lockedReason(at));
      }
      return;
    }
    if (!result.runs.length) {
      this.announce("Put back.");
      return;
    }
    if (
      this.commit(
        result.runs,
        `Placed ${name} · ${this.rangeName(rows)}`,
        cell.key
      )
    ) {
      // The cell keeps focus, or the cell it is now drawn as one with (its own may be gone).
      const grid = this.template.querySelector('[data-id="edit-grid"]');
      if (grid) {
        grid.focusCell(cell.key);
      }
    }
  }

  /**
   * Clears a cell; an event drawn as one across bunks is cleared from all of them, as one Undo
   * step (it was placed as one).
   */
  clearRange(cell) {
    const merged = mergedWith(
      ((this.editGrid && this.editGrid.cells) || []).filter((c) => c.slot),
      cell
    );
    if (merged.length < 2) {
      this.change(cell.slot, cell.key, OPEN, 1);
      return;
    }
    const weekDays = this.schedule.days;
    const runs = [];
    merged.forEach((c) => {
      const run = editRun(
        weekDays[c.slot.day],
        c.slot.group,
        c.slot.block,
        OPEN,
        1,
        this.awayIn(c.slot)
      );
      if (run) {
        runs.push({ day: c.slot.day, group: c.slot.group, ...run });
      }
    });
    if (!runs.length || this.runsLocked(runs)) {
      return;
    }
    const rows = rowsCovered(weekDays, merged);
    this.commit(
      runs,
      `Cleared ${cell.text} · ${this.rangeName(rows)}`,
      cell.key
    );
  }

  /**
   * "Set it up" on the cell with focus: offered while it holds a special event or day noted from
   * a file ("not set up yet"), when the host can make it.
   */
  get setUpOffer() {
    // A day a special day replaces shows its own schedule: the week's hidden cells under it,
    // noted ones too, have nothing to offer (once set up, the day is replaced at once).
    if (
      !this.setUpWith ||
      !this.focusKey ||
      this.isActivity ||
      this.replacedShown
    ) {
      return null;
    }
    const cell = this.cellByKey(this.focusKey);
    if (!cell || !cell.slot || !cell.notSetUp) {
      return null;
    }
    const day = this.dayOf(cell.slot);
    const item = this.savedItem(
      placement(day, cell.slot.group, cell.slot.block).slot,
      day
    );
    if (!item || !SET_UP_HERE.has(item.kind)) {
      return null;
    }
    return {
      kind: item.kind,
      name: item.name,
      text: `${item.name} isn't set up yet`,
      label: `Set up ${item.name} as ${this.setUpAs(item.kind)}`
    };
  }

  /** "an event", "a special day", "an elective set": what Set it up makes, in the camp's words. */
  setUpAs(kind) {
    if (kind === "S") {
      return "an event";
    }
    const word = this.t.sIn(kind === "E" ? "ElectiveSet" : "SpecialDay");
    return `${/^[aeiou]/i.test(word) ? "an" : "a"} ${word}`;
  }

  /** A press on "Set it up" keeps focus on the cell, so the offer stays while it works. */
  handleKeepFocus(event) {
    event.preventDefault();
  }

  async handleSetUp() {
    const offer = this.setUpOffer;
    if (!offer || this.settingUp) {
      return;
    }
    const key = this.focusKey;
    this.settingUp = true;
    try {
      const said = await this.setUpWith({ kind: offer.kind, name: offer.name });
      this.sayOnce(said || `${offer.name} is set up.`);
      // The button goes with the offer: keyboard focus goes back where the director was.
      this.focusAfterSetUp = { key };
    } catch (e) {
      this.reportError(
        failed(`${offer.name} wasn't set up. Nothing was changed.`, e)
      );
    } finally {
      this.settingUp = false;
    }
  }

  /** Whether any time block of the placement a slot is part of is locked. */
  isLockedSlot(slot, locks = this.liveLocks) {
    if (!locks || !locks.size) {
      return false;
    }
    const day = this.dayOf(slot);
    const groupId = day.groups[slot.group].id;
    const at = placement(day, slot.group, slot.block);
    return day.blocks
      .slice(at.first, at.first + at.length)
      .some((block) => locks.has(lockKey(day.dateValue, groupId, block.id)));
  }

  decorate(cell, saving, locks) {
    let result = cell;
    if (cell.slot) {
      const here = placement(
        this.dayOf(cell.slot),
        cell.slot.group,
        cell.slot.block
      ).slot;
      result = {
        ...cell,
        ...(this.ownPlan && cell.setTime
          ? {
              setTime: false,
              className: "cell cell_activity",
              title: cell.text
            }
          : {}),
        readOnly: this.lockedReason(cell.slot) !== null,
        // Nothing from the checks on the grid (wiki engine care plan Q18): the Why list says it.
        movable: isMovable(here, this.ownPlan)
      };
      if (cell.elective) {
        // "Chugim (4)": the set as setup has it now, and its confirmed, open offerings
        // (decision 53; mock-up electives-r1 grid-a).
        const set = this.electiveFor(cell.electiveKey);
        if (set) {
          result.text = this.electiveLabel(set);
          result.title = `${result.text}: ${this.t.s("ElectiveSet")}`;
        }
      }
      if (cell.event) {
        // An event's place, under its name (mockup placed.html: "Carnival / Main field").
        const event = this.eventFor(cell.eventKey);
        result.where = event ? event.location : null;
        if (event) {
          result.title = [cell.title, event.location]
            .filter(Boolean)
            .join(", ");
        }
      }
      if (this.isLockedSlot(cell.slot, locks)) {
        result.locked = true;
        result.movable = false;
        if (cell.open && !this.isAwaySlot(cell.slot)) {
          // Kept empty on purpose (a Lock on an Open cell): not "Open", which is a cell to fill.
          result.text = "";
          result.className = "cell cell_locked-empty";
          result.title = "Locked empty";
          result.lockLabel = "Locked empty";
        }
      }
      if (this.picked && this.picked.key === cell.key) {
        result.className = `${result.className} cell_picked`;
        result.selected = true;
      } else if (this.chosen && this.chosen.keys.has(cell.key)) {
        result.className = `${result.className} cell_chosen`;
        result.selected = true;
      }
      if (this.pulseKeys.includes(this.placementKeyOf(cell.slot))) {
        // Two names in turn, so a second change to the same cell pulses again.
        result.className = `${result.className} ${this.pulseFlip ? "cell_pulse2" : "cell_pulse"}`;
      }
    }
    if (cell.slot && cell.open && this.isAwaySlot(cell.slot)) {
      const grp = this.dayOf(cell.slot).groups[cell.slot.group];
      result = {
        ...result,
        text: "Not at camp",
        away: true,
        className: "cell cell_away",
        title: `${grp.name}: not at camp`
      };
    }
    if (cell.slot && saving.has(slotKey(cell.slot))) {
      result = { ...result, className: `${result.className} cell_saving` };
    }
    return result;
  }

  /**
   * "Rain plan full: choose another" for a cell a rainy day left outdoors (repo docs/adr/0019),
   * while it still holds that activity, as on the desktop: a row in the Why list.
   */
  rainFullFor(slot) {
    const day = this.dayOf(slot);
    if (!day || !day.rain || !day.rain.length) {
      return null;
    }
    const at = placement(day, slot.group, slot.block);
    if (!at.slot.startsWith("A:") || at.length !== 1) {
      return null;
    }
    return isMarked(
      day,
      day.groups[slot.group].id,
      day.blocks[at.first].id,
      at.slot.slice(2)
    )
      ? RAIN_PLAN_FULL
      : null;
  }

  /** The check's key for the placement a slot is in: "date|groupId|firstBlockId". */
  placementKeyOf(slot) {
    const day = this.dayOf(slot);
    const first = placement(day, slot.group, slot.block).first;
    return `${day.dateValue}|${day.groups[slot.group].id}|${day.blocks[first].id}`;
  }

  get catalogue() {
    return (this.setup && this.setup.activities) || [];
  }
  locationName(activityId) {
    const activity = this.catalogue.find((a) => a.Id === activityId);
    const location =
      activity &&
      ((this.setup && this.setup.locations) || []).find(
        (l) => l.Id === activity[FIELD.Activity.Location]
      );
    return location ? location.Name : null;
  }
  get activityCards() {
    return activityCards(this.activitySchedule, this.catalogue, this.t).map(
      (card) => ({
        ...card,
        nameClass: card.gone ? "card-name card-name_gone" : "card-name",
        location: this.locationName(card.key)
      })
    );
  }
  get selectedActivity() {
    return this.activityCards.find((card) => card.key === this.activityId);
  }
  get activityGrid() {
    return activityGrid(this.activitySchedule, this.activityId);
  }
  get allActivitiesLabel() {
    return `← All ${this.t.p("Activity")}`;
  }
  handleActivity(event) {
    this.activityId = event.currentTarget.dataset.key;
  }
  handleAllActivities() {
    this.activityId = null;
  }

  // ---------- slots ----------

  dayOf(slot) {
    return this.schedule.days[slot.day];
  }

  isAwaySlot(slot) {
    const day = this.dayOf(slot);
    const groupId = day.groups[slot.group].id;
    const blockId = day.blocks[slot.block].id;
    return ((this.draft && this.draft.away) || []).some(
      (entry) => entry.groupId === groupId && entry.blockIds.includes(blockId)
    );
  }

  awayIn(slot) {
    return (block) => this.isAwaySlot({ ...slot, block });
  }

  /** "Bunk 3 · Monday · Period 2" */
  slotName(slot, block = slot.block) {
    const day = this.dayOf(slot);
    return [
      day.groups[slot.group].name,
      this.dayNameOf(day.dateValue),
      day.blocks[block].name
    ].join(" · ");
  }

  /**
   * A special day's or event's own schedule: what it started with (a fixed or recurring activity
   * brought in) is an ordinary cell of it, as on the desktop (ADR 0014 choice 15).
   */
  get ownPlan() {
    return Boolean(this.planName);
  }

  cellByKey(key) {
    const grid = this.editGrid;
    return grid ? grid.cells.find((cell) => cell.key === key) : null;
  }

  /** Why a slot can't be changed here, or null. */
  lockedReason(slot) {
    const day = this.dayOf(slot);
    const at = placement(day, slot.group, slot.block);
    if (staysPut(at.slot, this.ownPlan)) {
      return `${this.nameOf(at.slot, day)} stays where it is set up.`;
    }
    // A placement left there from an earlier setup can still be cleared.
    if (at.slot === OPEN && this.isAwaySlot(slot)) {
      return `${day.groups[slot.group].name} isn't at camp then.`;
    }
    return null;
  }

  /** The day's saved item a slot's identity is, if the day has it. */
  savedItem(slot, day) {
    const item = owner(slot);
    return day.items.find((i) => identity(i) === item);
  }

  /** What a slot's identity is called: the day's saved name, else the activity's. */
  nameOf(slot, day) {
    if (slot === OPEN) {
      return "Open";
    }
    const saved = this.savedItem(slot, day);
    if (saved) {
      return saved.name;
    }
    const activity = this.activityFor(owner(slot));
    if (activity) {
      return activity.name;
    }
    const event = this.eventFor(owner(slot));
    if (event) {
      return event.name;
    }
    const set = this.electiveFor(owner(slot));
    if (set) {
      return set.name;
    }
    if (owner(slot).startsWith("E:")) {
      return `${this.t.s("ElectiveSet")} (removed)`;
    }
    return owner(slot).startsWith("S:")
      ? `${this.t.s("SpecialEvent")} (removed)`
      : `${this.t.s("Activity")} (removed)`;
  }

  activityFor(item) {
    return ((this.draft && this.draft.activities) || []).find(
      (a) => `A:${a.id}` === item
    );
  }

  handleEditCell(event) {
    const cell = this.cellByKey(event.detail.key);
    if (!cell || !cell.slot) {
      return;
    }
    if (this.picked) {
      this.handleCellSpace(event);
      return;
    }
    const reason = this.lockedReason(cell.slot);
    if (reason) {
      this.announce(reason);
      return;
    }
    if (cell.locked) {
      this.requestUnlock(cell);
      return;
    }
    const { rect } = event.detail;
    this.editor = {
      key: cell.key,
      slot: cell.slot,
      top: rect.bottom + 4,
      left: rect.left,
      text: "",
      highlight: 0
    };

    Promise.resolve().then(() => {
      const input = this.template.querySelector('[data-id="slot-input"]');
      if (input) {
        input.focus();
      }
    });
  }

  handleClearCell(event) {
    const cell = this.cellByKey(event.detail.key);
    if (!cell || !cell.slot) {
      return;
    }
    const reason = this.lockedReason(cell.slot);
    if (reason) {
      this.announce(reason);
      return;
    }
    if (cell.locked) {
      this.refuseLocked(cell.slot);
      return;
    }
    this.clearRange(cell);
  }

  /** A locked cell was asked to change: the host is asked to unlock it, and focus stays on it. */
  requestUnlock(cell) {
    const grid = this.template.querySelector('[data-id="edit-grid"]');
    const now = Date.now();
    const last = this.lastUnlockAsk;
    this.lastUnlockAsk = { key: cell.key, at: now };
    if (last && last.key === cell.key && now - last.at < UNLOCK_ASK_MS) {
      // A double-click (click, click, double-click) or Enter after a click is one request.
      if (grid) {
        grid.focusCell(cell.key);
      }
      return;
    }
    this.dispatchEvent(
      new CustomEvent("unlockrequest", {
        detail: { slot: cell.slot, key: this.placementKeyOf(cell.slot) }
      })
    );
    if (grid) {
      grid.focusCell(cell.key);
    }
  }

  refuseLocked(slot) {
    this.refuse(`${this.slotName(slot)} is locked.`);
  }

  /** Whether runs (as edits make them: day, group, first, after) would change a locked cell. */
  runsLocked(runs) {
    for (const run of runs) {
      for (let i = 0; i < run.after.length; i++) {
        const slot = { day: run.day, group: run.group, block: run.first + i };
        if (this.isLockedSlot(slot)) {
          // The locked cell itself, not where the edit starts.
          this.refuseLocked(slot);
          return true;
        }
      }
    }
    return false;
  }

  /** Said to the host: the cell keyboard focus reached (the grid's key, and where it is). */
  handleCellFocus(event) {
    // Focus moved on by itself (an arrow, a click): the cells chosen together are let go.
    if (!event.detail.extend) {
      this.chosen = null;
    }
    this.focusKey = event.detail.key;
    const cell = this.cellByKey(event.detail.key);
    this.dispatchEvent(
      new CustomEvent("cellfocus", {
        detail: {
          key: event.detail.key,
          slot: cell ? cell.slot : null,
          cell: cell && cell.slot ? this.placementKeyOf(cell.slot) : null
        }
      })
    );
  }

  // ---------- the slot editor (type a name) ----------

  get editorStyle() {
    return this.editor
      ? `top: ${this.editor.top}px; left: ${this.editor.left}px;`
      : "";
  }
  get editorLabel() {
    return this.editor ? this.slotName(this.editor.slot) : "";
  }

  /** What can go in the slot: Open (when filled), the activities, and adding a new one. */
  get editorOptions() {
    if (!this.editor) {
      return [];
    }
    const { slot, text } = this.editor;
    const day = this.dayOf(slot);
    const grp = day.groups[slot.group];
    const typed = loose(text);
    const matches = ((this.draft && this.draft.activities) || []).filter(
      (a) => !typed || loose(a.name).includes(typed)
    );
    const forGroup = matches.filter((a) => !a.notFor.includes(grp.id));
    const notForGroup = matches.filter((a) => a.notFor.includes(grp.id));
    const options = [];
    const here = placement(day, slot.group, slot.block);
    const filled = here.slot !== OPEN;
    // Left there from an earlier setup where the group isn't at camp (where the placement
    // starts): it can only be cleared.
    const awayHere = this.isAwaySlot({ ...slot, block: here.first });
    if (filled && (!typed || awayHere)) {
      options.push({ key: "open", kind: "open", label: "Open" });
    }
    if (awayHere) {
      return this.marked(options);
    }
    // The season's elective sets first, as in the drawer (mock-up electives-r1 grid-a; desktop
    // CellInlineEditor offers them), each with its mark; a week's, not a special day's or
    // event's own schedule.
    (this.ownPlan ? [] : this.electives)
      .filter((e) => !typed || loose(e.name).includes(typed))
      .forEach((e) =>
        options.push({
          key: `elective-${e.id}`,
          kind: "elective",
          label: this.electiveLabel(e),
          elective: e,
          setMark: true
        })
      );
    forGroup.forEach((a) =>
      options.push({ key: a.id, kind: "activity", label: a.name, activity: a })
    );
    notForGroup.forEach((a) =>
      options.push({
        key: a.id,
        kind: "activity",
        label: a.name,
        activity: a,
        tag: reasonFor(RULE.ELIGIBILITY, { groupName: grp.name })
      })
    );
    // The season's special events, after the activities (desktop: the typeahead lists them).
    this.events
      .filter((e) => !typed || loose(e.name).includes(typed))
      .forEach((e) =>
        options.push({
          key: `event-${e.id}`,
          kind: "event",
          label: e.name,
          event: e,
          flag: true
        })
      );
    const name = text.trim().replace(/\s+/g, " ");
    if (
      name &&
      !this.events.some((e) => loose(e.name) === typed) &&
      (this.ownPlan || !this.electives.some((e) => loose(e.name) === typed)) &&
      !((this.draft && this.draft.activities) || []).some(
        (a) => loose(a.name) === typed
      )
    ) {
      options.push({
        key: "add",
        kind: "add",
        // No article built from a camp word (design guide): "to activities", not "as an activity".
        label: `Add "${name}" to ${this.t.pIn("Activity")}`,
        name
      });
    }
    return this.marked(options);
  }

  /** The options with ids for the listbox and the one highlighted. */
  marked(options) {
    const highlight = Math.min(this.editor.highlight, options.length - 1);
    return options.map((option, i) => ({
      ...option,
      id: `slot-option-${i}`,
      selected: String(i === highlight),
      highlighted: i === highlight,
      className: i === highlight ? "option option_on" : "option"
    }));
  }
  get activeOptionId() {
    const option = this.editorOptions.find((o) => o.selected === "true");
    return option ? option.id : null;
  }
  get editorExpanded() {
    return String(this.editorOptions.length > 0);
  }

  handleEditorInput(event) {
    this.editor = { ...this.editor, text: event.target.value, highlight: 0 };
  }

  handleEditorKeyDown(event) {
    const count = this.editorOptions.length;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      this.editor = {
        ...this.editor,
        highlight: Math.max(
          0,
          Math.min(count - 1, this.editor.highlight + step)
        )
      };
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = this.editorOptions.find((o) => o.selected === "true");
      if (option) {
        this.pick(option);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      this.closeEditor(true);
    }
  }

  handleOptionMouseDown(event) {
    // Keeps focus in the input until the click picks.
    event.preventDefault();
  }

  handleOptionClick(event) {
    const option = this.editorOptions.find(
      (o) => o.id === event.currentTarget.dataset.option
    );
    if (option) {
      this.pick(option);
    }
  }

  handleEditorFocusOut(event) {
    const editor = this.template.querySelector('[data-id="slot-editor"]');
    if (editor && event.relatedTarget && editor.contains(event.relatedTarget)) {
      return;
    }
    this.closeEditor();
  }

  /** Scrolling moves the slot box with its slot, or closes it when the slot is out of sight. */
  followEditor() {
    if (!this.editor) {
      return;
    }
    const grid = this.template.querySelector('[data-id="edit-grid"]');
    const rect = grid ? grid.cellRect(this.editor.key) : null;
    if (!rect) {
      this.closeEditor();
      return;
    }
    this.editor = { ...this.editor, top: rect.bottom + 4, left: rect.left };
  }

  closeEditor(refocus = false) {
    const key = this.editor && this.editor.key;
    this.editor = null;
    if (refocus && key) {
      const grid = this.template.querySelector('[data-id="edit-grid"]');
      if (grid) {
        grid.focusCell(key);
      }
    }
  }

  async pick(option) {
    const cell = this.cellByKey(this.editor.key);
    this.closeEditor(true);
    if (!cell) {
      return;
    }
    if (option.kind === "open") {
      this.clearRange(cell);
      return;
    }
    if (option.kind === "event") {
      this.placeEvent(option.event.id, cell);
      return;
    }
    if (option.kind === "elective") {
      this.placeElective(option.elective.id, cell);
      return;
    }
    let activity = option.activity;
    if (option.kind === "add") {
      try {
        const add = this.addActivityWith || addToManualBuild;
        activity = await add({
          scheduleId: this.schedule.schedule.id,
          name: option.name
        });
      } catch (e) {
        this.reportError(
          failed(`"${option.name}" not added. Nothing was saved.`, e)
        );
        return;
      }
      // Its record joins the draft's, so the checks know it before the week is read again.
      const records = this.draft.activityRecords || [];
      if (!this.draft.activities.some((a) => a.id === activity.id)) {
        this.draft = {
          ...this.draft,
          activities: [...this.draft.activities, activity],
          activityRecords:
            activity.record && !records.some((r) => r.Id === activity.id)
              ? [...records, activity.record]
              : records
        };
      }
    }
    this.change(cell.slot, cell.key, `A:${activity.id}`, activity.length);
  }

  // ---------- saving ----------

  /**
   * Makes an edit on screen at once and queues it for the server. slot: the day, group, and time
   * block; key: the grid cell to put focus back on; next: what the slot should hold.
   */
  change(slot, key, next, length) {
    const day = this.dayOf(slot);
    const run = editRun(
      day,
      slot.group,
      slot.block,
      next,
      length,
      this.awayIn(slot),
      // A longer activity stops at a locked cell, as it stops at a filled one.
      (block) => this.isLockedSlot({ ...slot, block }),
      this.ownPlan
    );
    if (!run) {
      const head = placement(day, slot.group, slot.block).first;
      if (next !== OPEN && this.isAwaySlot({ ...slot, block: head })) {
        this.say(`${day.groups[slot.group].name} isn't at camp then.`);
      }
      return;
    }
    if (this.runsLocked([{ day: slot.day, group: slot.group, ...run }])) {
      return;
    }
    let label =
      next === OPEN
        ? `Cleared ${this.slotName(slot, run.first)}`
        : `Placed ${this.nameOf(next, day)} · ${this.slotName(slot, run.first)}`;
    const placed = run.after.filter((s) => s !== OPEN).length;
    if (next !== OPEN && placed < (length || 1)) {
      // Not enough room for its whole length: placed as far as it goes, and said so.
      label += ` (${placed} of ${length})`;
    }
    this.commit([{ day: slot.day, group: slot.group, ...run }], label, key);
  }

  /**
   * A run as the server takes it: the day's date, the group's and first block's Ids, and every
   * cell's block (blockIds), so it lands on those blocks or comes back as a conflict, now and
   * when it is undone or redone.
   */
  toServerRun(run, week = this.schedule.days) {
    const day = week[run.day];
    return {
      day: day.dateValue,
      groupId: day.groups[run.group].id,
      firstBlockId: day.blocks[run.first].id,
      before: run.before,
      after: run.after,
      blockIds: day.blocks
        .slice(run.first, run.first + run.after.length)
        .map((b) => b.id)
    };
  }

  /** Runs as the server takes them, each noted with its whole row after it (for the locks it brings). */
  toServerRuns(runs, week = this.schedule.days) {
    const serverRuns = runs.map((run) => this.toServerRun(run, week));
    noteRows(week, serverRuns);
    return serverRuns;
  }

  /**
   * A new change ({ day, group, first, before, after } runs): saved, and one Undo step. False
   * when it was refused (edits wait while the host restores or publishes): nothing was made.
   */
  commit(runs, label, key, rain = null) {
    if (this.refuseWhileRestoring()) {
      return false;
    }
    const serverRuns = this.toServerRuns(runs);
    this.stepSeq += 1;
    const step = { id: this.stepSeq, runs: serverRuns, label };
    this.history.record(step);
    this.historyVersion += 1;
    this.recordLocks(step.id, serverRuns);
    if (rain) {
      // A rainy day's marks go with its step: its Undo puts back the ones from before.
      this.stepRain.set(step.id, rain);
    }
    this.send(serverRuns, label, key, step.id, runs[0]);
    return true;
  }

  /**
   * The locks before and after a step, kept with it (when locks were passed): what an Undo or a
   * Redo of it leaves (lockTarget).
   */
  recordLocks(stepId, serverRuns) {
    const before = this.liveLocks;
    if (!before) {
      return;
    }
    this.stepLocks.set(stepId, {
      before,
      after: serverRuns.reduce((now, run) => foldRun(now, run), before)
    });
    const kept = new Set(
      [...this.history.undos, ...this.history.redos].map((step) => step.id)
    );
    [...this.stepLocks.keys()]
      .filter((id) => !kept.has(id))
      .forEach((id) => this.stepLocks.delete(id));
  }

  /** A step made differently (Use yours, a tool worked out again): its locks after follow. */
  refreshLocks(stepId, serverRuns) {
    const record = this.stepLocks.get(stepId);
    if (record) {
      this.stepLocks.set(stepId, {
        before: record.before,
        after: serverRuns.reduce((now, run) => foldRun(now, run), record.before)
      });
    }
  }

  /**
   * The locks an Undo or Redo of a step leaves (Greg, 2026-10-18: Undo keeps a Lock the director
   * chose). A cell's lock changes only if the step itself changed it and no Lock-menu choice
   * covered the cell since the step: then it is the step's, from before it (Undo) or after it
   * (Redo). Every other cell keeps the lock it has now (`seen`), whoever set it. Used on every
   * send of an Undo or Redo; null for an edit, or a step with no locks kept with it.
   */
  lockTarget(stepId, kind, seen) {
    const record = this.stepLocks.get(stepId);
    if (!record || kind === "edit") {
      return null;
    }
    const target = new Set(seen);
    const stepLeft = kind === "undo" ? record.before : record.after;
    const chosenSince = (key) => this.lockChosenAt.get(key) >= stepId;
    [...record.before, ...record.after]
      .filter((key) => record.before.has(key) !== record.after.has(key))
      .filter((key) => !chosenSince(key))
      .forEach((key) => {
        if (stepLeft.has(key)) {
          target.add(key);
        } else {
          target.delete(key);
        }
      });
    return target;
  }

  /**
   * The "Rain plan full" marks an edit, Undo or Redo of a rainy day leaves on its day (the marks
   * after it, or for its Undo the ones before), as the server takes them; null for any other step.
   */
  rainFor(stepId, kind) {
    const record = this.stepRain.get(stepId);
    if (!record) {
      return null;
    }
    return [
      {
        day: record.date,
        cells: kind === "undo" ? record.before : record.after
      }
    ];
  }

  /** Where an edit starts, for the "saving" shade: from its own run, or found from the server's. */
  slotKeyOf(firstRun, serverRun) {
    if (!firstRun && !serverRun) {
      // A rainy day with only "Rain plan full" marks changes no cell.
      return null;
    }
    if (firstRun) {
      return slotKey({
        day: firstRun.day,
        group: firstRun.group,
        block: firstRun.first
      });
    }
    const weekDays = this.schedule ? this.schedule.days : [];
    const dayIndex = weekDays.findIndex((d) => d.dateValue === serverRun.day);
    const day = weekDays[dayIndex];
    if (!day) {
      return null;
    }
    return slotKey({
      day: dayIndex,
      group: day.groups.findIndex((grp) => grp.id === serverRun.groupId),
      block: day.blocks.findIndex((b) => b.id === serverRun.firstBlockId)
    });
  }

  /** Shows runs on the grid at once and queues them for the server. */
  send(serverRuns, label, key, stepId, firstRun, kind = "edit", baseLabel) {
    // What the director chose and saw, by time block (conflicts.js): what a question compares.
    const intent = intentOf(
      this.schedule.days,
      serverRuns,
      (at) => this.slotName({ day: at.dayIndex, group: at.g }, at.block),
      (at) => this.dayGroupName({ day: at.dayIndex, group: at.g })
    );
    if (intent.missing) {
      // An Undo or Redo of a change whose day, bunk, or time block has since gone: it can't be
      // made, so it is said, and the step leaves Undo and Redo.
      this.history.forget(stepId);
      this.historyVersion += 1;
      this.say(
        `Can't ${kind === "redo" ? "redo" : "undo"} ${baseLabel || label}: the ${this.t.sIn("Week")} has changed.`
      );
      return;
    }
    this.notice = null;
    this.toolNotice = null;
    this.unrepeated = null;
    // A reload already on its way is older than this edit: its answer must not replace it. The
    // week is no longer the version just restored, and a refused Restore is behind it.
    this.edited();
    const rain = this.rainFor(stepId, kind);
    const edit = rain ? { runs: serverRuns, rain } : { runs: serverRuns };
    // The Why list's rows before the edit, to say what it changed there.
    const before = this.whyRowsNow();
    const entry = {
      edit,
      key,
      label,
      stepId,
      kind,
      baseLabel: baseLabel || label,
      // The locks the director saw when they made this (the screen's, with the edits waiting
      // before it made): what the run names as locksBefore whenever it is sent, so a lock that
      // arrives while it waits is never covered unseen.
      seen: this.liveLocks,
      // What the director chose and saw, by time block (conflicts.js): what a question compares.
      intent,
      slotKey: this.slotKeyOf(firstRun, serverRuns[0])
    };
    const locksTarget = this.lockTarget(stepId, kind, entry.seen);
    if (locksTarget) {
      entry.locksTarget = locksTarget;
    }
    this.queue = [...this.queue, entry];
    this.applyLocally(edit);
    // A Why list row the edit brought or took away, said with its save (a sighted director
    // sees the list change).
    entry.news = this.whyNews(before, this.whyRowsNow(), this.checked);
    this.pulseKeys = [];
    this.saveNext();
  }

  /** The Why list's rows about a cell (Open, clashes, placements), from the measure now. */
  whyRowsNow() {
    const m = this.measure;
    return [...(m.open || []), ...m.look].filter((row) => row.dateValue);
  }

  /**
   * One short line on what an edit did to the Why list, for screen readers: the first row it
   * brought or changed, in the list's words ("Bunk 1 · Monday · Period 2: Over its limit of 1
   * Bunk at once"), or else the first it took away whose placement is still there ("Bunk 1 ·
   * Monday · Period 2: fine now"), with how many more. Null when no row changed. An Open row gone
   * because its cell was filled, or a row gone with its placement, isn't news: the edit's own
   * line says that.
   */
  whyNews(before, after, checked) {
    const keyOf = (row) =>
      `${row.kind}|${row.dateValue}|${row.groupId}|${row.blockId}`;
    const was = new Map(before.map((row) => [keyOf(row), row]));
    const now = new Map(after.map((row) => [keyOf(row), row]));
    const brought = after.filter((row) => {
      const old = was.get(keyOf(row));
      return !old || old.text !== row.text;
    });
    const still = new Set(checked.placements.map((p) => p.key));
    const gone = before.filter(
      (row) =>
        !now.has(keyOf(row)) &&
        row.kind !== "open" &&
        still.has(`${row.dateValue}|${row.groupId}|${row.blockId}`)
    );
    let line = null;
    let more = 0;
    if (brought.length) {
      line = brought[0].text;
      more = brought.length - 1;
    } else if (gone.length) {
      const text = gone[0].text;
      line = `${text.slice(0, text.indexOf(": "))}: fine now`;
      more = gone.length - 1;
    }
    return line && more ? `${line}, and ${more} more` : line;
  }

  /** The draft with an edit made, as the grid shows it until the server answers. */
  applyLocally(edit) {
    const schedule = this.schedule;
    const rainMarks = new Map((edit.rain || []).map((r) => [r.day, r.cells]));
    const daysNow = schedule.days.map((day) => {
      let result = rainMarks.has(day.dateValue)
        ? { ...day, rain: rainMarks.get(day.dateValue) }
        : day;
      edit.runs
        .filter((run) => run.day === day.dateValue)
        .forEach((run) => {
          const g = result.groups.findIndex((grp) => grp.id === run.groupId);
          const first = result.blocks.findIndex(
            (block) => block.id === run.firstBlockId
          );
          if (g >= 0 && first >= 0) {
            result = applyRun(result, g, { first, after: run.after }, (item) =>
              this.itemFor(item)
            );
          }
        });
      return result;
    });
    this.draft = { ...this.draft, schedule: { ...schedule, days: daysNow } };
  }

  itemFor(item) {
    if (item.startsWith("S:")) {
      const event = this.eventFor(item);
      return { kind: "S", id: item.slice(2), name: event ? event.name : "" };
    }
    if (item.startsWith("E:")) {
      const set = this.electiveFor(item);
      return { kind: "E", id: item.slice(2), name: set ? set.name : "" };
    }
    const activity = this.activityFor(item);
    return {
      kind: "A",
      id: item.slice(2),
      name: activity ? activity.name : ""
    };
  }

  /** Sends queued edits one at a time, so each names what the one before it left. */
  async saveNext() {
    // While "keep theirs or use yours" is open, the rest wait for the answer.
    if (this.saving || this.conflict || !this.queue.length) {
      return;
    }
    this.saving = true;
    const [entry] = this.queue;
    try {
      const sent = this.withLocks(entry);
      const result = await this.saveRuns([sent]);
      if (result.status === "refused") {
        // The host's reason, as it would read from a server refusal.
        throw refusal(result.message);
      }
      this.queue = this.queue.slice(1);
      this.server = result.schedule;
      this.lockBase = this.locksAfterSave(entry, result);
      this.showServerAndWaiting();
      // The host shows the week the server sent (never a patched copy).
      this.dispatchEvent(
        new CustomEvent("saved", {
          detail: {
            schedule: result.schedule,
            conflicts: result.conflicts,
            label: entry.label,
            kind: entry.kind
          }
        })
      );
      if (result.conflicts.length) {
        // A cell this edit touches that someone locked meanwhile is never sent again over their
        // lock: it is said, and the edit is dropped.
        const locked = this.newlyLocked(sent.runs);
        if (locked && entry.tool && !this.alreadySkipped(entry, locked)) {
          // A tool does what it can: the locked cells are left out and the rest is made.
          this.replanTool(entry);
        } else if (locked) {
          this.refuseNewlyLocked(entry, locked);
        } else {
          this.askAboutConflict(entry);
        }
      } else {
        this.reportError(null);
        // A note that came with this change (Redo wasn't made.) is added to the line. Anything
        // already there (an earlier change that couldn't be made) stays until the director's
        // next change, and is said again with the first save after it, which would otherwise
        // talk over it.
        const fresh =
          entry.note && !(this.notice || "").includes(entry.note)
            ? entry.note
            : null;
        if (fresh) {
          this.notice = this.notice ? `${this.notice} ${fresh}` : fresh;
        }
        const said = [this.unrepeated, fresh].filter(Boolean).join(" ");
        this.unrepeated = null;
        this.announce(
          [entry.label, entry.extra, entry.news, said]
            .filter(Boolean)
            .join(". ")
        );
      }
    } catch (e) {
      const dropped = this.queue.length - 1;
      this.reportError(
        failed(`Your change wasn't saved: ${entry.label}.`, e) +
          (dropped > 0
            ? ` ${dropped} more ${dropped === 1 ? "change" : "changes"} after it ${dropped === 1 ? "wasn't" : "weren't"} saved either.`
            : "")
      );
      this.queue = [];
      // What is saved is no longer known here: undoing could only guess.
      this.startHistoryOver();
      // The host reads the week again.
      this.dispatchEvent(new CustomEvent("reload"));
    } finally {
      this.saving = false;
    }
    this.saveNext();
  }

  /**
   * The edit as the server takes it: with the locks the director saw when they made it (and, for
   * Undo or Redo, to leave). Never the newest locks: a lock that arrived while the edit waited
   * must come back as a refusal, not be covered.
   */
  withLocks(entry) {
    if (!entry.seen) {
      return entry.edit;
    }
    let state = entry.seen;
    const runs = entry.edit.runs.map((run) => {
      const stamped = { ...run, locksBefore: marks(state, run) };
      if (entry.locksTarget) {
        stamped.locksAfter = marks(entry.locksTarget, run);
      }
      state = foldRun(state, run, entry.locksTarget);
      return stamped;
    });
    return { ...entry.edit, runs };
  }

  /**
   * The first cell a sent edit touches that the server now holds locked and the edit did not see
   * locked (locksBefore): { run, block } (the block's index in the run), or null.
   */
  newlyLocked(runs) {
    for (const run of runs) {
      if (!run.locksBefore) {
        continue;
      }
      for (let block = 0; block < run.blockIds.length; block++) {
        if (
          this.lockBase.has(
            lockKey(run.day, run.groupId, run.blockIds[block])
          ) &&
          run.locksBefore[block] !== LOCKED
        ) {
          return { run, block };
        }
      }
    }
    return null;
  }

  /** Whether a tool already left this locked cell out (so working it out again would change nothing). */
  alreadySkipped(entry, { run, block }) {
    return (
      !!entry.tool.locked &&
      entry.tool.locked.has(lockKey(run.day, run.groupId, run.blockIds[block]))
    );
  }

  /** The cells locked on the server that the director had not seen locked when they made the edit. */
  lockedSince(entry) {
    const lockedNow = this.lockBase || new Set();
    return new Set([...lockedNow].filter((key) => !entry.seen.has(key)));
  }

  /** The cells this edit touches that the director saw locked and the server no longer holds locked. */
  unlockedSince(entry) {
    if (!entry.seen || !this.lockBase) {
      return new Set();
    }
    const touched = entry.edit.runs.flatMap((run) =>
      run.blockIds.map((blockId) => lockKey(run.day, run.groupId, blockId))
    );
    return new Set(
      touched.filter((key) => entry.seen.has(key) && !this.lockBase.has(key))
    );
  }

  /** Someone locked a cell this edit touches: the edit is dropped and the lock is named. */
  refuseNewlyLocked(entry, { run, block }) {
    this.abandon(entry);
    const at = this.locate(run);
    const index = at
      ? at.day.blocks.findIndex((b) => b.id === run.blockIds[block])
      : -1;
    if (index < 0) {
      this.askAboutConflict(entry);
      return;
    }
    this.refuseLocked({ day: at.dayIndex, group: at.g, block: index });
  }

  /** The locks once a save is answered: the saver's own, else the week it sent, else what the edit left (nothing if it wasn't made). */
  locksAfterSave(entry, result) {
    if (!this.lockBase) {
      return null;
    }
    if (result.locks) {
      return new Set(result.locks);
    }
    // The week the server sent says which cells it holds locked, whether or not the edit was made.
    const served = locksOfWeek(result.schedule && result.schedule.days);
    if (served) {
      return served;
    }
    return result.conflicts.length
      ? this.lockBase
      : entry.edit.runs.reduce(
          (now, run) => foldRun(now, run, entry.locksTarget),
          this.lockBase
        );
  }

  // ---------- undo and redo ----------

  get canUndo() {
    return this.historyVersion >= 0 && this.history.canUndo;
  }
  get cannotUndo() {
    return !this.canUndo;
  }
  get cannotRedo() {
    return !(this.historyVersion >= 0 && this.history.canRedo);
  }
  get undoTitle() {
    return this.canUndo ? `Undo: ${this.history.undoLabel}` : "Undo";
  }
  get redoTitle() {
    return this.cannotRedo ? "Redo" : `Redo: ${this.history.redoLabel}`;
  }

  // ---------- the Edit menu ----------

  /** The keys Undo and Redo answer to (undoShortcut), shown as on this computer. */
  get onMac() {
    const nav = typeof navigator === "undefined" ? null : navigator;
    return !!nav && /Mac|iPhone|iPad/.test(nav.platform || nav.userAgent || "");
  }
  get undoHint() {
    return this.onMac ? "⌘Z" : "Ctrl+Z";
  }
  get redoHint() {
    return this.onMac ? "⇧⌘Z" : "Ctrl+Shift+Z";
  }
  get undoKeys() {
    return "Control+Z Meta+Z";
  }
  get redoKeys() {
    return "Control+Shift+Z Meta+Shift+Z Control+Y";
  }
  get copyHint() {
    return this.onMac ? "⌘C" : "Ctrl+C";
  }
  get pasteHint() {
    return this.onMac ? "⌘V" : "Ctrl+V";
  }
  get copyKeys() {
    return "Control+C Meta+C";
  }
  get pasteKeys() {
    return "Control+V Meta+V";
  }

  /**
   * The host's rows after Undo and Redo, set off by a line: a row with children opens them under
   * it, one step in.
   */
  get editRows() {
    const items = [...(this.editItems || [])];
    const rainy = this.rainyItem;
    if (rainy) {
      if (items.length) {
        items.push({ divider: true });
      }
      items.push(rainy);
    }
    if (!items.length) {
      return [];
    }
    const rows = [{ key: "divider-top", divider: true }];
    items.forEach((item, i) => {
      if (item.divider) {
        rows.push({ key: `divider-${i}`, divider: true });
        return;
      }
      const children = item.children || null;
      if (children) {
        const open = this.openEditGroup === item.value && !item.disabled;
        rows.push({
          key: item.value,
          group: true,
          value: item.value,
          label: item.label,
          dataId: item.dataId,
          disabled: !!item.disabled || children.length === 0,
          expanded: String(open),
          chevronClass: open
            ? "shoresh-chevron chevron_open"
            : "shoresh-chevron"
        });
        if (open) {
          children.forEach((child) =>
            rows.push({
              key: `${item.value}|${child.value}`,
              value: child.value,
              label: child.label,
              dataId: child.dataId,
              disabled: !!child.disabled,
              className: "shoresh-pop-row shoresh-pop-row_inner"
            })
          );
        }
        return;
      }
      rows.push({
        key: item.value,
        value: item.value,
        label: item.label,
        dataId: item.dataId,
        disabled: !!item.disabled,
        className: "shoresh-pop-row"
      });
    });
    return rows;
  }

  /** A row with rows under it (Copy day to…): they open, or close again. */
  handleEditGroup(event) {
    const value = event.currentTarget.dataset.group;
    this.openEditGroup = this.openEditGroup === value ? null : value;
  }

  /** The Edit menu closed: a row's open rows close with it. */
  handleEditToggle(event) {
    if (!event.detail.open) {
      this.openEditGroup = null;
    }
  }

  /** One of the host's rows was chosen: the host does it (a rainy day the editor does). */
  handleEditSelect(event) {
    this.openEditGroup = null;
    const value = String(event.detail.value);
    if (value.startsWith("rainy:")) {
      this.runRainyDay(value.slice("rainy:".length));
      return;
    }
    this.dispatchEvent(
      new CustomEvent("editselect", { detail: { value: event.detail.value } })
    );
  }

  /** Focus on the Edit menu's word (after a host's Edit row, when focus has nowhere better). */
  @api
  focusEditMenu() {
    const menu = this.template.querySelector('[data-id="edit-menu"]');
    if (menu) {
      menu.focus();
    }
  }

  handleUndo() {
    if (!this.canUndo || this.refuseWhileRestoring()) {
      return;
    }
    const { step, runs } = this.history.undo();
    this.historyVersion += 1;
    this.send(
      runs,
      `Undone: ${step.label}`,
      null,
      step.id,
      null,
      "undo",
      step.label
    );
  }

  handleRedo() {
    if (this.cannotRedo || this.refuseWhileRestoring()) {
      return;
    }
    const { step, runs } = this.history.redo();
    this.historyVersion += 1;
    this.send(
      runs,
      `Redone: ${step.label}`,
      null,
      step.id,
      null,
      "redo",
      step.label
    );
  }

  /**
   * Ctrl or Cmd with Z undoes, with Shift (or Ctrl+Y) redoes (desktop useUndoRedo.js); typing
   * boxes keep their own, so it never acts while the key comes from one.
   */
  handleKeyDown(event) {
    // Every element the key passed through that this editor can see; never while the typing box
    // or the "keep theirs or use yours" question is open. In Salesforce the path stops at another
    // component's edge, so the activity list's Filter and the Versions name boxes keep their
    // Ctrl+Z themselves (they don't pass it on).
    const path = event.composedPath ? event.composedPath() : [event.target];
    if (path.some(takesTyping)) {
      return;
    }
    const inGrid = path.some(
      (node) => node && node.dataset && node.dataset.id === "edit-grid"
    );
    if (inGrid && this.clipboardShortcut(event)) {
      return;
    }
    this.undoShortcut(event);
  }

  /**
   * The same keys pressed with nothing focused (a click on the page's background or a drag
   * leaves focus there), while this editor is on screen: a screen visited earlier stays in the
   * page, hidden. Anything focused elsewhere on the page keeps its own keys.
   */
  handlePageKeyDown(event) {
    const target = event.target;
    const nothingFocused =
      !target ||
      target === window ||
      target === document ||
      target.tagName === "BODY" ||
      target.tagName === "HTML";
    const root = this.template.querySelector('[data-id="manual-build"]');
    if (
      event.defaultPrevented ||
      !nothingFocused ||
      !root ||
      root.getClientRects().length === 0
    ) {
      return;
    }
    // Copy only takes cells chosen together here: with nothing chosen, Ctrl+C is the page's.
    const key = String(event.key).toLowerCase();
    if ((key === "c" && !this.chosen) || this.clipboardShortcut(event)) {
      return;
    }
    this.undoShortcut(event);
  }

  undoShortcut(event) {
    if (
      !(event.ctrlKey || event.metaKey) ||
      event.altKey ||
      this.editor ||
      this.conflict
    ) {
      return;
    }
    const key = String(event.key).toLowerCase();
    if (key === "z" && !event.shiftKey) {
      event.preventDefault();
      this.handleUndo();
    } else if ((key === "z" && event.shiftKey) || key === "y") {
      event.preventDefault();
      this.handleRedo();
    }
  }

  /**
   * The line after a tool, while Undo would still take that step back, and not while a
   * "keep theirs or use yours" question about it is open (it may not happen as it says).
   */
  get toolNoticeText() {
    // Read so the line follows Undo and Redo (History itself isn't watched).
    const version = this.historyVersion;
    const notice = this.toolNotice;
    return version >= 0 &&
      notice &&
      !this.conflict &&
      this.history.lastId === notice.stepId
      ? notice.text
      : null;
  }

  get toolUndoLabel() {
    return this.toolNotice ? `Undo ${this.toolNotice.label}` : "Undo";
  }

  handleToolUndo() {
    this.handleUndo();
    this.focusUndoAfterRender = true;
  }

  isAwayAt(day, group, block) {
    return this.isAwaySlot({ day, group, block });
  }

  /** A tool's words for what stayed or was left out, from its result (tools.js toolRuns). */
  toolWords(tool, result) {
    if (tool.kind === "rain") {
      return rainCounts(result.rain);
    }
    if (tool.kind === "clear") {
      return this.stayedText(result.week, result.stayed);
    }
    if (tool.kind === "paste") {
      return this.pasteLeftOutText(result.week, result.leftOut);
    }
    const from = result.week.findIndex((d) => d.dateValue === tool.from);
    return from < 0
      ? null
      : this.leftOutText(result.week, from, result.leftOut);
  }

  /** Whether a group isn't at camp in a block of a day (indexes) of some week. */
  isAwayOn(week, d, g, b) {
    const day = week[d];
    const groupId = day.groups[g].id;
    const blockId = day.blocks[b].id;
    return ((this.draft && this.draft.away) || []).some(
      (entry) => entry.groupId === groupId && entry.blockIds.includes(blockId)
    );
  }

  /** "Cleared Monday", "Copied Monday to Tuesday": a tool's words for Undo and the line. */
  toolLabel(tool) {
    if (tool.kind === "rain") {
      return tool.label;
    }
    if (tool.kind === "paste") {
      return `Pasted ${tool.what} · ${tool.where}`;
    }
    return tool.kind === "clear"
      ? `Cleared ${tool.name}`
      : `Copied ${tool.fromName} to ${tool.toName}`;
  }

  /** What a tool says when it changes nothing. */
  toolNothing(tool, said) {
    if (tool.kind === "rain") {
      return `${tool.label}: ${said || rainCounts({ switches: [], full: [], noPlan: [], spans: [], locked: [] })}`;
    }
    if (tool.kind === "paste") {
      return said
        ? `Nothing pasted. ${said}`
        : `Nothing to paste: ${tool.where} already matches.`;
    }
    if (tool.kind === "clear") {
      const where = `${tool.inWeek ? "in" : "on"} ${tool.name}`;
      return said
        ? `Nothing cleared ${where}. ${said}`
        : `Nothing to clear ${where}.`;
    }
    if (said) {
      return `Nothing copied. ${said}`;
    }
    const to =
      tool.toName === "all other days" ? "All other days" : tool.toName;
    return `${to} ${tool.toName === "all other days" ? "already match" : "already matches"} ${tool.fromName}.`;
  }

  /** The things a placement is named by in a line: "Swim · Bunk 3 · Tuesday". */
  placementName(week, dayIndex, group, slot) {
    const day = week[dayIndex];
    return `${this.nameOf(slot, day)} · ${day.groups[group].name} · ${this.dayNameOf(day.dateValue)}`;
  }

  /** "2 stayed: Archery · Bunk 1 · Monday (removed); …" (at most five named). */
  stayedText(week, stayed) {
    const why = {
      [LEFT_OUT.GONE]: "removed",
      [LEFT_OUT.NOT_SET_UP]: "not set up yet",
      [LEFT_OUT.AWAY]: "not at camp then"
    };
    return this.listText(
      stayed,
      "stayed",
      (o) =>
        `${this.placementName(week, o.day, o.group, o.slot)} (${why[o.why]})`
    );
  }

  /** "2 left out: Swim · Bunk 3 · Tuesday: not at camp then; …" (at most five named). */
  leftOutText(week, from, leftOut) {
    const source = week[from];
    const why = (o) => {
      const target = this.dayNameOf(week[o.day].dateValue);
      switch (o.why) {
        case LEFT_OUT.AWAY:
          return "not at camp then";
        case LEFT_OUT.NO_BLOCK:
          return `${target} has no ${source.blocks[o.missing].name}`;
        case LEFT_OUT.NO_GROUP:
          return `not on ${target}`;
        case LEFT_OUT.GONE:
          return "removed";
        case LEFT_OUT.NOT_SET_UP:
          return "not set up yet";
        default:
          return `${this.nameOf(o.blocking, week[o.day])} is set up there`;
      }
    };
    return this.listText(
      leftOut,
      "left out",
      (o) =>
        `${this.nameOf(o.slot, source)} · ${source.groups[o.group].name} · ${this.dayNameOf(week[o.day].dateValue)}: ${why(o)}`
    );
  }

  /** "2 left out: Swim · Bunk 2 · Tuesday: not at camp then; Boating: no room there." */
  pasteLeftOutText(week, leftOut) {
    const why = (o) => {
      switch (o.why) {
        case LEFT_OUT.AWAY:
          return "not at camp then";
        case LEFT_OUT.GONE:
          return "removed";
        case LEFT_OUT.NOT_SET_UP:
          return "not set up yet";
        case LEFT_OUT.NO_ROOM:
          return "no room there";
        default:
          return `${this.nameOf(o.blocking, week[o.day])} is set up there`;
      }
    };
    return this.listText(leftOut, "left out", (o) => {
      const where =
        o.day === null
          ? ""
          : ` · ${week[o.day].groups[o.group].name} · ${this.dayNameOf(week[o.day].dateValue)}`;
      return `${o.name}${where}: ${why(o)}`;
    });
  }

  /**
   * The placements a tool left out because they are locked, in the words of the other lists:
   * "1 stayed: Swim · Bunk 1 · Monday (locked)." for a clear (what stays in the cell), "1 left
   * out: Swim · Bunk 1 · Tuesday: locked." for a copy (what was being copied there). Null when
   * none.
   */
  lockedText(tool, week, cells) {
    const named = cells
      .map(({ key, slot }) => {
        const [date, groupId, blockId] = key.split("|");
        const d = week.findIndex((x) => x.dateValue === date);
        const g =
          d < 0 ? -1 : week[d].groups.findIndex((x) => x.id === groupId);
        const b =
          d < 0 ? -1 : week[d].blocks.findIndex((x) => x.id === blockId);
        return d < 0 || g < 0 || b < 0 ? null : { d, g, b, slot };
      })
      .filter(Boolean);
    return tool.kind === "clear"
      ? this.listText(
          named,
          "stayed",
          (o) => `${this.placementName(week, o.d, o.g, o.slot)} (locked)`
        )
      : this.listText(
          named,
          "left out",
          (o) => `${this.placementName(week, o.d, o.g, o.slot)}: locked`
        );
  }

  /** "N <what>: a; b; …; and M more." with at most five named, or null. */
  listText(list, what, name) {
    if (!list.length) {
      return null;
    }
    const named = list.slice(0, 5).map(name);
    const more = list.length - named.length;
    return `${list.length} ${what}: ${named.join("; ")}${more > 0 ? `; and ${more} more` : ""}.`;
  }

  /**
   * Makes a tool's change as one Undo step and shows "Cleared Monday · Undo" (with what stayed
   * or was left out); with nothing to change, says so instead. The week as the director saw it
   * goes with the change: after a question, the tool is worked out again around anyone else's.
   */
  @api
  runTool(asked, { keepFocus = false } = {}) {
    // A day a special day replaces is left as it is: its cells are out of sight (ADR 0014).
    const { tool, replacedNote } = this.withoutReplaced(asked);
    if (!tool) {
      this.say(replacedNote || this.toolNothing(asked, null));
      return;
    }
    const seen = this.schedule.days;
    const isAway = (week, d, g, b) => this.isAwayOn(week, d, g, b);
    // A paste leaves locked cells (Generated) as they are, and lists them, as a tool does a cell
    // locked meanwhile: a Lock beats what is pasted.
    const locks = tool.kind === "paste" ? this.liveLocks : null;
    const locked = locks && locks.size ? new Set(locks) : null;
    const result = locked
      ? replan(tool, seen, seen, new Set(), isAway, locked)
      : toolRuns(tool, seen, { isAway });
    const said =
      [
        this.toolWords(tool, result),
        locked ? this.lockedText(tool, seen, result.lockedCells) : null,
        replacedNote
      ]
        .filter(Boolean)
        .join(" ") || null;
    const label = this.toolLabel(tool);
    const rain = tool.kind === "rain";
    // A rainy day whose cells are all full still leaves its marks (one Undo step).
    if (!result.runs.length && !(rain && result.marks.length)) {
      this.say(this.toolNothing(tool, said));
      return;
    }
    const rainMarks = rain ? this.rainStep(tool, seen, result) : null;
    if (!this.commit(result.runs, label, null, rainMarks)) {
      // Refused: nothing is said as done, and no Undo is offered for it.
      return;
    }
    const entry = this.queue[this.queue.length - 1];
    if (entry && entry.stepId === this.stepSeq) {
      // The week as the director saw it goes with the change, for working it out again.
      entry.tool = locked
        ? { ...tool, seen, kept: new Set(), locked }
        : { ...tool, seen, kept: new Set() };
      // What stayed or was left out is said with the save too.
      entry.extra = said;
    }
    if (rain) {
      // What changed shows on the grid: each cell switched to its rain plan pulses once.
      const day = result.week.find((d) => d.dateValue === tool.dates[0]);
      this.pulseKeys = result.rain.switches.map((x) =>
        toolCellKey(day, x.g, x.b)
      );
    }
    this.showToolNotice(label, said, this.stepSeq, rain ? ": " : ". ");
    // Its Undo is the most useful next stop, and the menu or button that ran it may be held
    // while it saves (which drops focus). A shortcut on the grid keeps focus where it is.
    this.focusToolUndoAfterRender = !keepFocus;
  }

  /**
   * A tool without the days a special day replaces: { tool, replacedNote }, the note naming
   * them ("Friday is Visiting Day: left as it is."); no tool when nothing is left to do.
   */
  withoutReplaced(tool) {
    const replaced = this.replaced;
    const hit = new Set();
    const keep = (date) => {
      if (replaced.has(date)) {
        hit.add(date);
        return false;
      }
      return true;
    };
    if (tool.kind === "copy" && replaced.has(tool.from)) {
      const special = replaced.get(tool.from);
      return {
        tool: null,
        replacedNote: `${dayLabel(tool.from).label} is ${special.name}: open it to change that day.`
      };
    }
    const next = { ...tool, dates: (tool.dates || []).filter(keep) };
    if (tool.kind === "paste") {
      next.items = (tool.items || []).filter((item) => keep(item.date));
      next.opens = (tool.opens || []).filter((key) =>
        keep(String(key).split("|")[0])
      );
    }
    const note = hit.size
      ? [...hit]
          .sort()
          .map(
            (date) => `${dayLabel(date).label} is ${replaced.get(date).name}`
          )
          .join(", ") + ": left as it is."
      : null;
    const empty =
      !next.dates.length ||
      (tool.kind === "paste" && !next.items.length && !next.opens.length);
    return { tool: empty ? null : next, replacedNote: note };
  }

  showToolNotice(label, said, stepId, joiner = ". ") {
    this.toolNotice = {
      label,
      text: said ? `${label}${joiner}${said}` : label,
      stepId
    };
  }

  /**
   * A rainy day's marks before and after its step ({ date, before, after }): the day's "Rain plan
   * full" cells as the director saw it, and the ones this switch leaves.
   */
  rainStep(tool, seen, result) {
    const date = tool.dates[0];
    const day = seen.find((d) => d.dateValue === date);
    return {
      date,
      before: (day && day.rain) || [],
      after: marksAfter((day && day.rain) || [], result.marks)
    };
  }

  // ---------- rainy day (repo docs/adr/0019; desktop ScheduleScreen.jsx Rainy day…) ----------

  /**
   * "Rainy day…" in Edit, with the week's days under it (a day that can't be read, or that a
   * special day replaces, left out, as on the desktop). Not in Activity View, which is read-only,
   * nor on a special day's own schedule. Held while the version is kept, an edit saves, or the
   * host restores.
   */
  get rainyItem() {
    if (
      !this.rainyWith ||
      !this.schedule ||
      this.hasNoDays ||
      this.isActivity ||
      this.planName
    ) {
      return null;
    }
    const replaced = this.replaced;
    const children = this.schedule.days
      .filter((day) => !day.problem && !replaced.has(day.dateValue))
      .map((day) => ({
        value: `rainy:${day.dateValue}`,
        label: dayLabel(day.dateValue).label,
        dataId: `rainy-day-${day.dateValue}`
      }));
    return {
      value: "rainy",
      label: "Rainy day…",
      dataId: "rainy-day",
      disabled: !!this.restoring || this.rainyWorking || this.busy,
      children
    };
  }

  /** The rainy day for a date, on the week as it is now. */
  rainyTool(date) {
    const name = this.dayNameOf(date);
    return {
      kind: "rain",
      dates: [date],
      name,
      label: `Rainy ${name}`,
      model: rainModel(this.draft, this.schedule.days),
      // A Lock beats a switch (Generated): the cells locked now are left as they are.
      locks: this.liveLocks ? new Set(this.liveLocks) : null
    };
  }

  /**
   * Rainy day (desktop applyRainyDay): with nothing to switch or mark, only the receipt is said.
   * Otherwise the week is first kept as a version, "Before rainy Monday" (so the dry day is there
   * after Undo has gone), then the day is worked out again on the week as it is now and switched
   * as one Undo step, with the receipt and its Undo on the line.
   */
  async runRainyDay(date) {
    if (this.rainyWorking || this.refuseWhileRestoring() || !this.schedule) {
      return;
    }
    const isAway = (week, d, g, b) => this.isAwayOn(week, d, g, b);
    const first = this.rainyTool(date);
    const planned = toolRuns(first, this.schedule.days, { isAway });
    if (!planned.rain.switches.length && !planned.rain.full.length) {
      this.say(rainReceipt(first.label, planned.rain));
      return;
    }
    this.rainyWorking = true;
    try {
      await this.rainyWith(`Before rainy ${first.name}`);
    } catch (e) {
      this.reportError(
        `${failed("The rainy day could not be applied.", e)} Nothing was changed.`
      );
      return;
    } finally {
      this.rainyWorking = false;
    }
    if (!this.schedule) {
      return;
    }
    this.runTool(this.rainyTool(date));
  }

  /**
   * After Keep theirs, or when the saved week has changed under a tool (a fixed activity now in
   * a cell it clears, say): the tool is worked out again on the server's week (tools.js replan),
   * never touching a cell someone else changed since the director looked or one kept in an
   * earlier round, and the rest is made as the same Undo step, before the edits that waited
   * (coordinator, 2026-10-17). The line says what wasn't made, counting activities (the camp's
   * word) for both reasons: "Cleared Monday, except 1 activity that changed and 1 activity that
   * is locked".
   */
  replanTool(entry) {
    const { tool, stepId } = entry;
    this.conflict = null;
    this.queue = this.queue.filter((w) => w.stepId !== stepId);
    const saved = this.server.days;
    // Cells someone locked since the director looked are never covered: left out, and said.
    const locked = new Set([
      ...(tool.locked || []),
      ...(entry.seen ? this.lockedSince(entry) : [])
    ]);
    const result = replan(
      tool,
      tool.seen,
      saved,
      tool.kept,
      (week, d, g, b) => this.isAwayOn(week, d, g, b),
      locked
    );
    const label = this.toolLabel(tool);
    const rain = tool.kind === "rain";
    if (!result.runs.length && !(rain && result.marks.length)) {
      this.history.forget(stepId);
      this.historyVersion += 1;
      this.showServerAndWaiting();
      const those = `those ${this.t.pIn("Activity")}`;
      this.say(
        result.lockedCells.length && !result.missed
          ? `${label}: nothing done, ${those} are locked.`
          : `${label}: nothing done, someone else changed ${those} first.`
      );
      this.saveNext();
      return;
    }
    const serverRuns = this.toServerRuns(result.runs, saved);
    const step = { id: stepId, runs: serverRuns, label };
    if (rain) {
      // The marks this switch now leaves; its Undo still puts back the ones from before.
      const record = this.stepRain.get(stepId);
      this.stepRain.set(stepId, {
        date: tool.dates[0],
        before: record ? record.before : [],
        after: marksAfter(record ? record.before : [], result.marks)
      });
    }
    if (!this.history.replace(stepId, step)) {
      this.history.ensure(step);
    }
    this.refreshLocks(stepId, serverRuns);
    this.historyVersion += 1;
    // Both counts in one word, the camp's for activities (one word per idea).
    const activities = (n, one, many) =>
      `${n} ${n === 1 ? `${this.t.sIn("Activity")} that ${one}` : `${this.t.pIn("Activity")} that ${many}`}`;
    const lockedCount = result.lockedCells.length;
    const exceptions = [
      result.missed
        ? activities(result.missedPlacements, "changed", "changed")
        : null,
      lockedCount ? activities(lockedCount, "is locked", "are locked") : null
    ].filter(Boolean);
    const except = exceptions.length
      ? `${label}, except ${exceptions.join(" and ")}`
      : label;
    const said = [
      this.toolWords(tool, result),
      this.lockedText(tool, saved, result.lockedCells)
    ]
      .filter(Boolean)
      .join(" ");
    const rainMarks = this.rainFor(stepId, "edit");
    this.queue = [
      {
        edit: rainMarks
          ? { runs: serverRuns, rain: rainMarks }
          : { runs: serverRuns },
        key: null,
        label: except,
        stepId,
        kind: "edit",
        baseLabel: label,
        // Still what the director saw when they made it: the locks that came since stay unseen.
        seen: entry.seen,
        intent: intentOf(
          saved,
          serverRuns,
          (at) => this.slotName({ day: at.dayIndex, group: at.g }, at.block),
          (at) => this.dayGroupName({ day: at.dayIndex, group: at.g })
        ),
        slotKey: this.slotKeyOf(result.runs[0], serverRuns[0]),
        tool: { ...tool, kept: result.kept, locked },
        extra: said
      },
      ...this.queue
    ];
    this.showServerAndWaiting();
    this.showToolNotice(except, said, stepId, rain ? ": " : ". ");
    this.saveNext();
  }

  // ---------- copy and paste (Greg decision 45) ----------

  /** The cells chosen together and the cell with focus are let go (another day, bunk or view). */
  letGoOfCells() {
    this.chosen = null;
    this.focusKey = null;
  }

  /**
   * The grid's cells inside the block of rows and columns two cells reach, the block grown down
   * or up until no cell in it runs out of it (a placement is chosen whole).
   */
  cellsInBlock(a, b) {
    const cells = this.editGrid.cells.filter((c) => c.slot);
    const end = (c) => c.row + (c.length || 1) - 1;
    const left = Math.min(a.column, b.column);
    const right = Math.max(a.column, b.column);
    const reach = {
      top: Math.min(a.row, b.row),
      bottom: Math.max(end(a), end(b))
    };
    const inside = (c) =>
      c.column >= left &&
      c.column <= right &&
      c.row <= reach.bottom &&
      end(c) >= reach.top;
    // A cell running out of the block, while there is one.
    const out = (c) =>
      inside(c) && (c.row < reach.top || end(c) > reach.bottom);
    for (let found = cells.find(out); found; found = cells.find(out)) {
      reach.top = Math.min(reach.top, found.row);
      reach.bottom = Math.max(reach.bottom, end(found));
    }
    return cells.filter(inside);
  }

  /**
   * Cells chosen together (desktop useClipboardSelection: Cmd/Ctrl with a click adds or takes
   * off a cell; here Shift with a click, a Shift-drag, Shift with Left or Right, and Cmd/Ctrl+
   * Shift with an arrow also choose the block from where it started).
   */
  handleCellSelect(event) {
    if (this.picked) {
      this.handleCellSpace(event);
      return;
    }
    const { key, extend } = event.detail;
    const cell = this.cellByKey(key);
    if (!cell || !cell.slot) {
      return;
    }
    let anchor = key;
    let keys;
    if (extend) {
      anchor = (this.chosen && this.chosen.anchor) || this.focusKey || key;
      const from = this.cellByKey(anchor) || cell;
      keys = new Set(this.cellsInBlock(from, cell).map((c) => c.key));
    } else {
      const focused = this.focusKey && this.cellByKey(this.focusKey);
      keys = new Set(
        this.chosen ? this.chosen.keys : focused ? [this.focusKey] : []
      );
      if (keys.has(key)) {
        keys.delete(key);
      } else {
        keys.add(key);
      }
    }
    this.focusKey = key;
    this.chosen = keys.size ? { anchor, keys } : null;
    this.announce(`${keys.size} selected`);
  }

  /** The cells Copy takes: those chosen together, else the one with keyboard focus. */
  get copyCells() {
    const grid = this.editGrid;
    if (!grid) {
      return [];
    }
    const keys = this.chosen
      ? this.chosen.keys
      : new Set(this.focusKey ? [this.focusKey] : []);
    return grid.cells.filter((c) => c.slot && keys.has(c.key));
  }

  /**
   * Where Paste puts the top left of what was copied: the top left of the cells chosen, else the
   * cell with keyboard focus ({ row, column } on the grid), or null.
   */
  get pasteOrigin() {
    const grid = this.editGrid;
    if (!grid) {
      return null;
    }
    const cells = this.chosen
      ? grid.cells.filter((c) => c.slot && this.chosen.keys.has(c.key))
      : grid.cells.filter((c) => c.slot && c.key === this.focusKey);
    if (!cells.length) {
      return null;
    }
    return {
      row: Math.min(...cells.map((c) => c.row)),
      column: Math.min(...cells.map((c) => c.column))
    };
  }

  /**
   * Whether there is a cell for Copy or Paste to start from, without working out the grid again
   * (the Edit menu asks on every render).
   */
  get hasCellToUse() {
    return (
      !!this.schedule &&
      !this.isActivity &&
      !!((this.chosen && this.chosen.keys.size) || this.focusKey)
    );
  }
  get cannotCopy() {
    return !this.hasCellToUse;
  }
  get cannotPaste() {
    return !this.clipboard || !this.hasCellToUse;
  }

  /** The day, bunk and time block (indexes) at a row and column of the grid on screen, or null. */
  slotAtGrid(grid, row, column) {
    if (
      row < 0 ||
      column < 0 ||
      row >= grid.rows.length ||
      column >= grid.columns.length
    ) {
      return null;
    }
    const week = this.schedule.days;
    if (this.isDaily) {
      const day = week[this.dayIndex];
      return day && day.groups[column] && day.blocks[row]
        ? { day: this.dayIndex, group: column, block: row }
        : null;
    }
    const day = week[column];
    if (!day || day.problem) {
      return null;
    }
    const refKey = (ref) => ref.id || ref.name;
    const group = day.groups.findIndex((grp) => refKey(grp) === this.groupKey);
    const block = day.blocks.findIndex(
      (blk) => refKey(blk) === grid.rows[row].key
    );
    return group < 0 || block < 0 ? null : { day: column, group, block };
  }

  /** "Swim", "3 activities and 2 Open": what was copied, in a line. */
  copiedWords(items, opens) {
    if (items.length === 1 && !opens.length) {
      return items[0].name;
    }
    const open = opens.length ? `${opens.length} Open` : "";
    if (!items.length) {
      return opens.length === 1 ? "Open" : open;
    }
    const placed = `${items.length} ${items.length === 1 ? this.t.sIn("Activity") : this.t.pIn("Activity")}`;
    return open ? `${placed} and ${open}` : placed;
  }

  /**
   * Copy (Edit, or Cmd/Ctrl+C on the grid): what the cells hold, by where they sit, for Paste.
   * Fixed and recurring activities stay where setup put them, so they aren't taken; nor is a
   * time a bunk isn't at camp.
   */
  handleCopy() {
    const cells = this.copyCells;
    if (!cells.length) {
      return;
    }
    const items = [];
    const opens = [];
    cells.forEach((cell) => {
      const day = this.dayOf(cell.slot);
      const at = placement(day, cell.slot.group, cell.slot.block);
      if (staysPut(at.slot, this.ownPlan)) {
        return;
      }
      if (at.slot === OPEN) {
        if (!this.isAwaySlot(cell.slot)) {
          opens.push({ row: cell.row, column: cell.column });
        }
        return;
      }
      const saved = this.savedItem(at.slot, day);
      items.push({
        row: cell.row,
        column: cell.column,
        slot: at.slot,
        length: at.length,
        name: this.nameOf(at.slot, day),
        gone: !!(saved && saved.gone)
      });
    });
    if (!items.length && !opens.length) {
      this.refuse(this.lockedReason(cells[0].slot) || "Nothing to copy there.");
      return;
    }
    const all = [...items, ...opens];
    const top = Math.min(...all.map((c) => c.row));
    const left = Math.min(...all.map((c) => c.column));
    const offset = ({ row, column, ...rest }) => ({
      ...rest,
      dr: row - top,
      dc: column - left
    });
    this.clipboard = { items: items.map(offset), opens: opens.map(offset) };
    this.say(`Copied ${this.copiedWords(items, opens)}.`);
  }

  /**
   * Paste (Edit, or Cmd/Ctrl+V on the grid): what was copied goes in with its top left at the
   * cell with focus (or the top left of the cells chosen), on this bunk or day or another, as one
   * Undo step and by Copy day to…'s rules (tools.js pasteEdit). What has no room on the grid is
   * left out and said.
   */
  handlePaste({ keepFocus = false } = {}) {
    const clip = this.clipboard;
    const origin = this.pasteOrigin;
    const grid = this.editGrid;
    if (!clip || !origin || !grid) {
      return;
    }
    const items = [];
    const outside = [];
    const opens = [];
    const dates = new Set();
    clip.items.forEach((c) => {
      const at = this.slotAtGrid(grid, origin.row + c.dr, origin.column + c.dc);
      const day = at && this.dayOf(at);
      if (!at || at.block + c.length > day.blocks.length) {
        outside.push({ slot: c.slot, name: c.name });
        return;
      }
      dates.add(day.dateValue);
      items.push({
        date: day.dateValue,
        groupId: day.groups[at.group].id,
        blockIds: day.blocks
          .slice(at.block, at.block + c.length)
          .map((b) => b.id),
        slot: c.slot,
        gone: c.gone,
        name: c.name
      });
    });
    clip.opens.forEach((c) => {
      const at = this.slotAtGrid(grid, origin.row + c.dr, origin.column + c.dc);
      if (at) {
        const day = this.dayOf(at);
        dates.add(day.dateValue);
        opens.push(
          lockKey(
            day.dateValue,
            day.groups[at.group].id,
            day.blocks[at.block].id
          )
        );
      }
    });
    const first = this.slotAtGrid(grid, origin.row, origin.column);
    this.chosen = null;
    this.runTool(
      {
        kind: "paste",
        dates: [...dates],
        items,
        opens,
        outside,
        what: this.copiedWords(clip.items, clip.opens),
        where: first
          ? this.slotName(first)
          : this.isDaily
            ? this.dailyGridLabel
            : this.groupGridLabel
      },
      { keepFocus }
    );
  }

  handleCopyClick() {
    this.handleCopy();
  }

  handlePasteClick() {
    this.handlePaste();
  }

  /** Cmd/Ctrl+C and Cmd/Ctrl+V on the grid: Copy and Paste. True when it was one of them. */
  clipboardShortcut(event) {
    if (
      !(event.ctrlKey || event.metaKey) ||
      event.altKey ||
      event.shiftKey ||
      this.editor ||
      this.conflict
    ) {
      return false;
    }
    const key = String(event.key).toLowerCase();
    if (key === "c") {
      event.preventDefault();
      this.handleCopy();
      return true;
    }
    if (key === "v") {
      event.preventDefault();
      this.handlePaste({ keepFocus: true });
      return true;
    }
    return false;
  }

  // ---------- the drawer ----------

  /** The drawer under the grid, in Daily and Group View with a grid to place on. */
  get showPalette() {
    return (
      !this.isActivity &&
      !!this.editGrid &&
      !this.planName &&
      !this.replacedShown
    );
  }

  /**
   * What the drawer counts: the week's measure (the counter's) in Daily View; in Group View the
   * bunk shown, measured the same way on its own (measureWeek counts the bunks the days name).
   */
  get drawerMeasure() {
    if (!this.isGroup) {
      return this.measure;
    }
    const checked = this.checked;
    const memo = this.bunkMeasureMemo;
    if (memo.checked !== checked || memo.key !== this.groupKey) {
      memo.checked = checked;
      memo.key = this.groupKey;
      const bunkDays = ((this.schedule && this.schedule.days) || []).map(
        (day) => ({
          ...day,
          groups: (day.groups || []).filter((grp) => grp.id === this.groupKey)
        })
      );
      memo.result = measureWeek(
        checked,
        (this.draft && this.draft.activities) || [],
        bunkDays
      );
    }
    return memo.result;
  }
  get tiles() {
    return drawerTiles(
      this.drawerMeasure,
      (this.draft && this.draft.activities) || [],
      this.filter
    );
  }
  get underCount() {
    const m = this.drawerMeasure;
    return m ? m.under.count : 0;
  }
  get drawerColumns() {
    const grid = this.editGrid;
    return grid ? grid.columns.length : 0;
  }
  /** Grid and drawer are as wide as each other, so each tile stays under its column. */
  get sheetStyle() {
    return this.showPalette
      ? `min-width: calc(${gridMinWidth(this.drawerColumns)} + 2 * var(--shoresh-space-pad) + 6px);`
      : null;
  }
  get paletteHeading() {
    return this.t.p("Activity");
  }
  get pickedActivityId() {
    return this.picked && this.picked.kind === "activity"
      ? this.picked.id
      : null;
  }

  /** The activity held: picked up (a click, Enter or Space on its tile) or being dragged. */
  get heldActivityId() {
    if (this.pickedActivityId) {
      return this.pickedActivityId;
    }
    return this.dragging && this.dragging.kind === "activity"
      ? this.dragging.id
      : null;
  }

  /**
   * What the grid outlines for the drawer (wiki decision 38): a held activity's cells and the
   * Open cells it fits; a tile under the pointer, only its cells.
   */
  get gridHeld() {
    const held = this.heldActivityId;
    if (held) {
      return { activityKey: `A:${held}`, fits: this.fitsFor(held) };
    }
    return this.hoverActivityId
      ? { activityKey: `A:${this.hoverActivityId}`, fits: [] }
      : null;
  }

  /**
   * The Open cells on screen where an activity fits: it can go there for its whole length (no
   * group away, nothing locked or filled in the way), and putting it there gives the week no new
   * needs-a-look mark, by the same check that draws them. Worked out once per held activity and
   * week shown.
   */
  fitsFor(id) {
    const checked = this.checked;
    const grid = this.editGrid;
    const key = `${id}|${this.view}|${this.dayIndex}|${this.groupKey}`;
    const memo = this.fitsMemo;
    if (memo.key === key && memo.checked === checked) {
      return memo.result;
    }
    const fits = [];
    const week = this.schedule.days;
    const before = new Set(checked.flags.keys());
    const length = this.activityLength(id);
    ((grid && grid.cells) || []).forEach((cell) => {
      if (
        !cell.slot ||
        !cell.open ||
        cell.away ||
        cell.locked ||
        cell.readOnly
      ) {
        return;
      }
      const slot = cell.slot;
      const day = this.dayOf(slot);
      const run = editRun(
        day,
        slot.group,
        slot.block,
        `A:${id}`,
        length,
        this.awayIn(slot),
        (block) => this.isLockedSlot({ ...slot, block }),
        this.ownPlan
      );
      if (!run || run.after.filter((x) => x !== OPEN).length < length) {
        return;
      }
      const changed = applyRun(day, slot.group, run, (item) =>
        this.itemFor(item)
      );
      const after = this.checkDays(
        week.map((d, i) => (i === slot.day ? changed : d))
      );
      if ([...after.flags.keys()].every((k) => before.has(k))) {
        fits.push(cell.key);
      }
    });
    memo.key = key;
    memo.checked = checked;
    memo.result = fits;
    return fits;
  }

  /** A tile under the pointer or with keyboard focus: its activity's cells are outlined. */
  handleTileHover(event) {
    this.hoverActivityId = (event.detail && event.detail.id) || null;
  }

  handleFilter(event) {
    this.filter = event.detail.value;
  }

  /** Enter, Space, or a click on a list activity picks it up; then a slot puts it down. */
  handlePickActivity(event) {
    const { id } = event.detail;
    if (this.pickedActivityId === id) {
      this.letGo();
      return;
    }
    this.picked = { kind: "activity", id };
    this.announce(`${this.activityName(id)} picked up.`);
    const grid = this.template.querySelector('[data-id="edit-grid"]');
    if (grid) {
      grid.focusCell();
    }
  }

  handleActivityDragStart(event) {
    const { id } = event.detail;
    this.dragging = { kind: "activity", id, name: this.activityName(id) };
  }

  /** A drag that ended anywhere (dropped, or cancelled with Escape) is over. */
  handleDragEnd() {
    this.dragging = null;
  }

  /**
   * What is being dragged, if the drop carries it: something else dropped here (text from
   * another window, say) is not taken for an earlier, cancelled drag. The drag carries the
   * name shown, never a record Id.
   */
  draggedFor(data) {
    const dragged = this.dragging;
    this.dragging = null;
    if (!dragged || (data && data !== dragged.name)) {
      return null;
    }
    return dragged;
  }

  /** A placement dragged back onto the list is taken out of the week. */
  handleRemoveDrop(event) {
    const dragged = this.draggedFor(event.detail && event.detail.data);
    if (dragged && dragged.kind === "cell") {
      this.removeAt(dragged.slot);
    }
  }

  activityName(id) {
    const activity = this.activityFor(`A:${id}`);
    return activity ? activity.name : "";
  }

  activityLength(id) {
    const activity = this.activityFor(`A:${id}`);
    return activity ? activity.length : 1;
  }

  // ---------- dragging, picking up, putting down ----------

  handleCellDragStart(event) {
    const cell = this.cellByKey(event.detail.key);
    if (cell && cell.movable) {
      this.dragging = {
        kind: "cell",
        slot: cell.slot,
        key: cell.key,
        name: cell.text
      };
      return;
    }
    this.dragging = null;
  }

  handleCellDrop(event) {
    const dragged = this.draggedFor(event.detail.data);
    this.putDown(dragged, this.cellByKey(event.detail.key), event.detail.at);
  }

  /** Space: puts down what is picked up, or picks up the placement in the slot. */
  handleCellSpace(event) {
    const cell = this.cellByKey(event.detail.key);
    if (!cell) {
      return;
    }
    if (this.picked) {
      const picked = this.picked;
      this.picked = null;
      this.putDown(picked, cell);
      return;
    }
    if (!cell.movable) {
      const reason = this.lockedReason(cell.slot);
      if (reason) {
        this.refuse(reason);
      } else if (cell.locked) {
        this.refuseLocked(cell.slot);
      }
      return;
    }
    this.picked = { kind: "cell", slot: cell.slot, key: cell.key };
    this.announce(
      `${this.placedName(cell.slot)} picked up from ${this.slotName(cell.slot)}.`
    );
  }

  handleCellClick(event) {
    if (this.picked) {
      this.handleCellSpace(event);
      return;
    }
    this.chosen = null;
    const cell = this.cellByKey(event.detail.key);
    if (cell && cell.locked) {
      this.requestUnlock(cell);
    }
  }

  /**
   * A click on a placement's bottom handle picks up its end (a way that needs no dragging,
   * WCAG 2.5.7); a click on another cell of the same bunk and day then makes it end there.
   */
  handleHandleClick(event) {
    // With something picked up, a click anywhere on a cell puts it down there.
    if (this.picked) {
      this.handleCellSpace(event);
      return;
    }
    const cell = this.cellByKey(event.detail.key);
    if (!cell || !cell.movable) {
      if (cell && cell.locked) {
        this.refuseLocked(cell.slot);
      }
      return;
    }
    this.picked = { kind: "resize", slot: cell.slot, key: cell.key };
    this.announce(`${cell.text}: choose where it ends.`);
  }

  handleCellEscape() {
    if (this.picked) {
      this.letGo();
    } else if (this.chosen) {
      this.chosen = null;
    }
  }

  letGo() {
    this.picked = null;
    this.announce("Put back.");
  }

  /** Shift with Up or Down: one block shorter or longer. */
  handleCellResize(event) {
    const cell = this.cellByKey(event.detail.key);
    if (!cell || !cell.movable) {
      if (cell && cell.locked) {
        this.refuseLocked(cell.slot);
      }
      return;
    }
    const at = placement(
      this.dayOf(cell.slot),
      cell.slot.group,
      cell.slot.block
    );
    this.resizeTo(
      cell.slot,
      cell.key,
      at.first + at.length - 1 + event.detail.delta
    );
  }

  /**
   * The bottom handle stretched with the pointer and let go (the grid showed the length live):
   * it now runs that many blocks. One that went above its start, or was stopped by a slot before
   * it grew at all, says why on the quiet line instead of changing nothing in silence.
   */
  handleCellStretch(event) {
    const { key, length, stopped } = event.detail;
    const cell = this.cellByKey(key);
    if (!cell || !cell.movable || !cell.slot) {
      return;
    }
    const at = placement(
      this.dayOf(cell.slot),
      cell.slot.group,
      cell.slot.block
    );
    if (length < 1) {
      // "Swim can't end before it starts."
      this.resizeTo(cell.slot, key, at.first - 1);
    } else if (length !== at.length) {
      this.resizeTo(cell.slot, key, at.first + length - 1);
    } else if (stopped) {
      // The next block can't take it: the refusal says why ("Swim doesn't fit there.").
      this.resizeTo(cell.slot, key, at.first + at.length);
    }
  }

  /** What was dragged or picked up, put down on a cell. */
  putDown(what, cell, at = 0) {
    if (!what || !cell || !cell.slot) {
      return;
    }
    if (what.kind === "event") {
      this.placeEvent(what.id, cell);
      return;
    }
    if (what.kind === "elective") {
      this.placeElective(what.id, cell);
      return;
    }
    if (what.kind === "activity") {
      const reason = this.lockedReason(cell.slot);
      if (reason) {
        this.refuse(reason);
        return;
      }
      this.change(
        cell.slot,
        cell.key,
        `A:${what.id}`,
        this.activityLength(what.id)
      );
    } else if (what.kind === "cell") {
      this.moveTo(what.slot, cell);
    } else if (
      what.kind === "resize" &&
      (what.slot.day !== cell.slot.day || what.slot.group !== cell.slot.group)
    ) {
      // A length ends in the placement's own bunk and day.
      this.say(
        `${this.placedName(what.slot)} can only change length within ${this.dayGroupName(what.slot)}.`
      );
    } else if (what.kind === "resize") {
      // How far down a multi-block cell the handle landed picks the block within it.
      const length = cell.length || 1;
      const block =
        cell.slot.block + Math.min(length - 1, Math.floor(at * length));
      this.resizeTo(what.slot, what.key, block);
    }
  }

  moveTo(from, cell) {
    const fromDay = this.dayOf(from);
    const name = this.nameOf(
      placement(fromDay, from.group, from.block).slot,
      fromDay
    );
    const result = moveEdit(
      this.schedule.days,
      from,
      cell.slot,
      (p) => this.isAwaySlot(p),
      this.ownPlan
    );
    if (!result) {
      // Put down where it already is.
      this.announce("Put back.");
      return;
    }
    if (result.refused) {
      this.refuse(this.refusal(result.refused, name, result.at || cell.slot));
      return;
    }
    if (this.runsLocked(result.runs)) {
      return;
    }
    const day = this.dayOf(cell.slot);
    const there = placement(day, cell.slot.group, cell.slot.block).slot;
    const label =
      there === OPEN
        ? `Moved ${name} to ${this.slotName(cell.slot)}`
        : `Swapped ${name} and ${this.nameOf(there, day)}`;
    this.commit(result.runs, label, cell.key);
  }

  removeAt(slot) {
    const day = this.dayOf(slot);
    const name = this.nameOf(placement(day, slot.group, slot.block).slot, day);
    const result = removeEdit(this.schedule.days, slot, this.ownPlan);
    if (result && !this.runsLocked(result.runs)) {
      this.commit(
        result.runs,
        `Cleared ${name} · ${this.slotName(slot)}`,
        null
      );
    }
  }

  /** The name of what is placed in a slot. */
  placedName(slot) {
    const day = this.dayOf(slot);
    return this.nameOf(placement(day, slot.group, slot.block).slot, day);
  }

  /** "Bunk 1 · Monday" */
  dayGroupName(slot) {
    const day = this.dayOf(slot);
    return `${day.groups[slot.group].name} · ${this.dayNameOf(day.dateValue)}`;
  }

  resizeTo(slot, key, lastBlock) {
    const day = this.dayOf(slot);
    const at = placement(day, slot.group, slot.block);
    const name = this.nameOf(at.slot, day);
    if (lastBlock < at.first) {
      this.say(`${name} can't end before it starts.`);
      return;
    }
    const result = resizeEdit(
      this.schedule.days,
      slot,
      lastBlock,
      (p) => this.isAwaySlot(p),
      this.ownPlan
    );
    if (!result) {
      return;
    }
    if (result.refused) {
      this.refuse(this.refusal(result.refused, name, slot));
      return;
    }
    if (this.runsLocked(result.runs)) {
      return;
    }
    const length = lastBlock - at.first + 1;
    const word =
      length === 1 ? this.t.sIn("TimeBlock") : this.t.pIn("TimeBlock");
    this.commit(
      result.runs,
      `${name} runs ${length} ${word} · ${this.slotName({ ...slot, block: at.first })}`,
      key
    );
  }

  /** A refused move, in a few words. */
  refusal(reason, name, slot) {
    const day = this.dayOf(slot);
    switch (reason) {
      case REFUSED.SET_TIME:
        return `${this.nameOf(placement(day, slot.group, slot.block).slot, day)} stays where it is set up.`;
      case REFUSED.AWAY:
        return `${day.groups[slot.group].name} isn't at camp then.`;
      case REFUSED.SWAP_LONG:
        return `Longer ${this.t.pIn("Activity")} don't swap.`;
      case REFUSED.FIXED_HERE:
        return `${this.nameOf(placement(day, slot.group, slot.block).slot, day)} stays where it is.`;
      case REFUSED.NO_SWAP:
        // The desktop's words (useSlotMutations.js): elective and event cells never swap. A camp
        // with its own word for electives (wiki decision 66) sees it, plural so no article is
        // built from it; the standard word keeps the desktop's sentence.
        return this.t.s("Elective") === "Elective"
          ? "Can’t swap with an elective or an event. Move it to an empty cell instead."
          : `Can’t swap with ${this.t.pIn("Elective")} or events. Move it to an empty cell instead.`;
      default:
        return `${name} doesn't fit there.`;
    }
  }

  refuse(text) {
    this.say(text);
  }

  // ---------- someone else changed it ----------

  /** The draft on screen: the server's week with the edits still waiting made on top. */
  showServerAndWaiting() {
    this.draft = { ...this.draft, schedule: this.server };
    this.queue.forEach((waiting) => this.applyLocally(waiting.edit));
  }

  /** Where a run is in the server's week: { dayIndex, day, g, first }, or null. */
  locate(run) {
    const dayIndex = this.server.days.findIndex((d) => d.dateValue === run.day);
    const day = this.server.days[dayIndex];
    const g = day ? day.groups.findIndex((grp) => grp.id === run.groupId) : -1;
    const first = day
      ? day.blocks.findIndex((block) => block.id === run.firstBlockId)
      : -1;
    return g < 0 || first < 0 ? null : { dayIndex, day, g, first };
  }

  askAboutConflict(entry) {
    const made = plan(this.server.days, entry.intent);
    if (entry.tool && (made.gone || made.changed || made.fixed)) {
      // A day or week tool isn't dropped for one cell: it is worked out again around it.
      this.replanTool(entry);
      return;
    }
    if (made.gone || made.changed || made.fixed) {
      // Nothing of this edit was saved: it leaves Undo, and a waiting Undo or Redo of it goes.
      this.abandon(entry);
      let why;
      if (made.gone) {
        why = `${made.gone.name || this.weekName} isn't in the ${this.t.sIn("Week")} any more`;
      } else if (made.changed) {
        why = `${made.changed.rowName} has changed`;
      } else {
        const day = this.server.days.find(
          (d) => d.dateValue === made.fixed.day
        );
        why = `${this.nameOf(made.slot, day)} stays where it is set up`;
      }
      // An Undo or Redo has left both lists: nothing to try again.
      this.say(
        entry.kind === "edit"
          ? `${why}.${made.changed ? " Try again." : ""}`
          : `Can't ${entry.kind === "redo" ? "redo" : "undo"} ${entry.baseLabel}: ${why}.`
      );
      return;
    }
    if (!made.runs.length) {
      this.sayOnce(
        entry.note ? `Already done. ${entry.note}` : "Already done."
      );
      return;
    }
    if (!made.rows.length) {
      const unlocked = this.unlockedSince(entry);
      if (unlocked.size) {
        // Someone only took a lock off a cell this edit touches: nothing of theirs is covered,
        // so it is sent again, as it was, naming those cells unlocked as they are now. Each time
        // takes at least one lock out of what it names, so this ends.
        const seen = new Set(
          [...entry.seen].filter((key) => !unlocked.has(key))
        );
        // An Undo or Redo works out the locks it leaves again, by the same rule.
        const locksTarget =
          this.lockTarget(entry.stepId, entry.kind, seen) || entry.locksTarget;
        this.queue = [{ ...entry, seen, locksTarget }, ...this.queue];
        this.showServerAndWaiting();
        this.saveNext();
        return;
      }
      if ((entry.resent || 0) >= MAX_RESENDS) {
        // Sent again and refused again with nothing new to ask: not a loop without end.
        this.abandon(entry);
        this.say(
          `Your change wasn't saved: ${entry.label}. The ${this.t.sIn("Week")} kept changing while it was saved. Try again.`
        );
        return;
      }
      // Nothing of anyone else's would be replaced: no question, it is just made.
      this.useYours(entry, made);
      return;
    }
    const rows = made.rows.map((row) => {
      const day = this.server.days[row.dayIndex];
      return {
        key: `${row.dayIndex}|${row.g}|${row.block}`,
        where: this.slotName({ day: row.dayIndex, group: row.g }, row.block),
        theirs: this.nameOf(row.theirs, day),
        yours: this.nameOf(row.yours, day)
      };
    });
    // What the question shows and what Use yours sends are one plan (conflicts.js).
    this.conflict = { entry, rows, made };
    this.announce(
      rows.length === 1
        ? `${rows[0].where} changed since you opened it.`
        : `${rows.length} cells changed since you opened it.`
    );
  }

  /** An edit that didn't save: out of Undo and Redo, with any waiting Undo or Redo of it. */
  abandon(entry) {
    this.history.forget(entry.stepId);
    this.historyVersion += 1;
    this.queue = this.queue.filter((w) => w.stepId !== entry.stepId);
    this.showServerAndWaiting();
  }

  /** The grid cell a run starts in, in the view on screen, or null. */
  keyForRun(run) {
    const wanted = this.slotKeyOf(null, run);
    const grid = this.editGrid;
    const cell =
      wanted && grid
        ? grid.cells.find((c) => c.slot && slotKey(c.slot) === wanted)
        : null;
    return cell ? cell.key : null;
  }

  focusAfterQuestion(entry, run) {
    const key = entry.key || (run ? this.keyForRun(run) : null);
    const grid = this.template.querySelector('[data-id="edit-grid"]');
    if (grid && key) {
      grid.focusCell(key);
    }
  }

  handleKeepTheirs() {
    if (this.conflict.entry.tool) {
      // Their cells stay; the rest of the tool is made (coordinator, 2026-10-17).
      const entry = this.conflict.entry;
      this.notice = null;
      this.unrepeated = null;
      this.replanTool(entry);
      return;
    }
    const { key, stepId } = this.conflict.entry;
    this.notice = null;
    this.unrepeated = null;
    const firstRun = this.conflict.made.runs[0];
    this.conflict = null;
    // Their change stands, so this step never happened: nothing to undo or redo, and an Undo or
    // Redo of it still waiting is dropped too.
    this.history.forget(stepId);
    this.historyVersion += 1;
    this.queue = this.queue.filter((waiting) => waiting.stepId !== stepId);
    this.showServerAndWaiting();
    this.focusAfterQuestion({ key }, firstRun);
    this.saveNext();
  }

  /** Use yours: exactly the plan the question showed (conflicts.js), nothing else. */
  handleUseYours() {
    const { entry, made } = this.conflict;
    this.notice = null;
    this.unrepeated = null;
    this.conflict = null;
    this.useYours(entry, made);
  }

  /**
   * Sends a plan for an edit, first, before the edits that waited. Its intent now counts what the
   * question showed as seen, for a second question.
   */
  useYours(entry, made) {
    const runs = made.runs;
    noteRows(this.server.days, runs);
    // A waiting Undo or Redo of this step was worked out from what the director saw, not from
    // what is saved now: it is dropped, and a dropped Redo is said.
    const dropped = this.queue.filter((w) => w.stepId === entry.stepId);
    this.queue = this.queue.filter((w) => w.stepId !== entry.stepId);
    if (entry.kind === "undo") {
      // An Undo made over theirs is done: nothing to redo.
      this.history.forget(entry.stepId);
    } else {
      // A change (or a Redo of one) is, from now, what was really saved: Undo takes back this.
      // It keeps its place in Undo; if it had none left (a later change cleared Redo after it
      // was undone), it goes on top, so it can always be taken back.
      const step = { id: entry.stepId, runs, label: entry.baseLabel };
      if (dropped.some((w) => w.kind === "undo")) {
        this.history.unundo(entry.stepId);
      }
      if (!this.history.replace(entry.stepId, step)) {
        this.history.ensure(step);
      }
      this.refreshLocks(entry.stepId, runs);
    }
    this.historyVersion += 1;
    // A note from an earlier question (a second question about the same edit) is kept.
    // A Redo or Undo is sent with the locks of its step's record, which was just made again.
    const locksTarget =
      this.lockTarget(entry.stepId, entry.kind, entry.seen) ||
      entry.locksTarget;
    const note = dropped.some((w) => w.kind === "redo")
      ? "Redo wasn't made."
      : entry.note || null;
    this.queue = [
      {
        ...entry,
        locksTarget,
        note,
        // Sent again after each answer that was still a conflict (askAboutConflict stops it).
        resent: (entry.resent || 0) + 1,
        intent: withSeen(entry.intent, made.rows),
        // A rainy day's marks go with it, as they were.
        edit: { ...entry.edit, runs }
      },
      ...this.queue
    ];
    this.showServerAndWaiting();
    this.focusAfterQuestion(entry, runs[0]);
    this.saveNext();
  }

  /** Escape keeps theirs; Tab stays on the dialog's two buttons. */
  handleConflictKeyDown(event) {
    if (event.key === "Escape") {
      this.handleKeepTheirs();
    } else if (event.key === "Tab") {
      event.preventDefault();
      const keep = this.template.querySelector('[data-id="keep-theirs"]');
      const use = this.template.querySelector('[data-id="use-yours"]');
      (this.template.activeElement === keep ? use : keep).focus();
    }
  }

  renderedCallback() {
    // A list whose counter went to zero is closed, so it doesn't open again by itself later.
    if (this.focusUndoAfterRender) {
      // The line's Undo is gone with the line: focus goes to the Edit menu, where Undo and Redo
      // are.
      this.focusUndoAfterRender = false;
      this.focusEditMenu();
    }
    if (this.focusToolUndoAfterRender) {
      this.focusToolUndoAfterRender = false;
      const toolUndo = this.template.querySelector('[data-id="tool-undo"]');
      if (toolUndo) {
        toolUndo.focus();
      }
    }
    if (this.focusAfterRender) {
      const { cellKey } = this.focusAfterRender;
      this.focusAfterRender = null;
      const grid = this.template.querySelector('[data-id="edit-grid"]');
      if (grid) {
        grid.focusCell(cellKey);
      }
    }
    if (this.focusAfterSetUp) {
      const { key } = this.focusAfterSetUp;
      this.focusAfterSetUp = null;
      const open = this.template.querySelector('[data-id="open-special"]');
      const grid = this.template.querySelector('[data-id="edit-grid"]');
      if (open) {
        open.focus();
      } else if (grid) {
        grid.focusCell(key);
      }
    }
    if (this.focusPillAfterRender) {
      const { index } = this.focusPillAfterRender;
      this.focusPillAfterRender = null;
      const pill = this.template.querySelector(
        `[data-id="day-pills"] button[data-index="${index}"]`
      );
      if (pill) {
        pill.focus();
      }
    }
    if (this.focusCellWhenDrawn) {
      const grid = this.template.querySelector('[data-id="edit-grid"]');
      if (grid) {
        const { key } = this.focusCellWhenDrawn;
        this.focusCellWhenDrawn = null;
        const page = document.activeElement;
        if (!page || page === document.body) {
          grid.focusCell(key);
        }
      }
    }
    if (this.conflict && !this.conflictFocused) {
      const button = this.template.querySelector('[data-id="keep-theirs"]');
      if (button) {
        button.focus();
        this.conflictFocused = true;
      }
    } else if (!this.conflict) {
      this.conflictFocused = false;
    }
  }

  // ---------- helpers ----------

  /**
   * Why something couldn't be done, on the quiet line until the director's next change, and said
   * by screen readers: now, and again with the next save, whose words would talk over it.
   */
  @api
  say(text) {
    this.sayOnce(text);
    this.unrepeated = text;
  }

  /** A short note on the quiet line, said by screen readers once. */
  sayOnce(text) {
    this.notice = text;
    this.unrepeated = null;
    this.announce(text);
  }

  /** Said by screen readers; the same words twice in a row are still said again. */
  @api
  announce(text) {
    this.announcement = "";

    Promise.resolve().then(() => {
      this.announcement = text;
    });
  }
}
