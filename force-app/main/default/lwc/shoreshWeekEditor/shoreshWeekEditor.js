import { LightningElement, api } from "lwc";
import addActivity from "@salesforce/apex/ManualBuildController.addActivity";
import { failed } from "c/shoreshErrors";
import { FIELD } from "c/shoreshSchema";
import {
  activityCards,
  activityGrid,
  dailyGrid,
  dayLabel,
  days,
  groupGrid,
  groups,
  kindLabel
} from "c/shoreshScheduleViews";
import {
  OPEN,
  applyRun,
  editRun,
  isSetTime,
  owner,
  placement
} from "./slotEdits";
import { REFUSED, moveEdit, removeEdit, resizeEdit } from "./moves";
import { LEFT_OUT, replan, toolRuns } from "./tools";
import { History } from "./history";
import { intentOf, plan, withSeen } from "./conflicts";
import { paletteChips } from "./counts";
import {
  RULE,
  checkWeek,
  otherProgramsAt,
  reasonFor,
  readActivities,
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
 * the slots: pickers, tools, checks, status and outcome.
 *
 * terms: the camp's words. setup: the season (SeasonSetupController.getSeasonSetup).
 */
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
  // A short line under the toolbar when something the director chose couldn't be made.
  notice;
  // A line said that the next save's announcement would talk over: said again with it, once.
  unrepeated = null;
  // The activity list's Filter box.
  filter = "";
  // "Cleared Monday" after a day or week tool: { text, stepId }, shown with Undo while Undo
  // would take back that step.
  toolNotice = null;
  // After the line's Undo, focus goes to the toolbar's (the line itself goes away).
  focusUndoAfterRender = false;
  // Where keyboard focus goes once the page has drawn (after a list line was clicked).
  focusAfterRender = null;
  // Placements whose dot the last edit changed: a quiet pulse acknowledges it (desktop
  // useFlagChangeAck), only for a director's own edit and only when it touched a few.
  pulseKeys = [];
  pulseFlip = false;
  // The last check and what it was worked out from. Changed in place, so updating it while the
  // page renders doesn't ask for another render (so never @track it).
  checkMemo = { inputs: null, result: null };
  // Picked up from the keyboard, or being dragged: { kind: "activity", id } or
  // { kind: "cell" | "resize", slot, key }.
  picked;
  dragging;
  history = new History();
  // Bumped whenever history changes, so Undo and Redo show what they would do.
  historyVersion = 0;
  stepSeq = 0;
  // What the host was last told by statechange.
  told = null;

  connectedCallback() {
    // The slot box sits where the slot was on screen; scrolling would leave it behind.
    this.onScroll = () => this.followEditor();
    window.addEventListener("scroll", this.onScroll, true);
  }

  disconnectedCallback() {
    window.removeEventListener("scroll", this.onScroll, true);
  }

  get t() {
    return this.terms;
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
      this.dayIndex = 0;
      const all = groups(draft.schedule);
      this.groupKey = all.length ? all[0].key : null;
      this.activityId = null;
    }
  }

  /** Another week is about to be shown: nothing of this visit to the last one is kept. */
  @api
  clear() {
    this.draft = null;
    this.notice = null;
    this.unrepeated = null;
    this.closeEditor();
    // Undo is for this visit to this week (Greg #10).
    this.history.clear();
    this.historyVersion += 1;
    this.picked = null;
  }

  /** The week after a Restore: Undo starts over, as on the desktop. */
  @api
  restored(draft) {
    this.history.clear();
    this.historyVersion += 1;
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

  /** A line on the quiet line, said by screen readers once (the host's own news). */
  @api
  setNotice(text) {
    this.notice = text;
    this.announce(text);
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
    const inputs = [schedule, this.draft, this.t];
    const memo = this.checkMemo;
    if (memo.inputs && memo.inputs.every((input, i) => input === inputs[i])) {
      return memo.result;
    }
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
    const activities = readActivities(draft.activityRecords);
    const weekDays = (schedule && schedule.days) || [];
    const result = checkWeek(
      weekDays,
      {
        activities,
        locations: readLocations(draft.locationRecords),
        ...readProgram(entry),
        notFor: new Map(
          ((this.draft && this.draft.activities) || []).map((a) => [
            a.id,
            a.notFor || []
          ])
        ),
        isAway: (groupId, blockId) => away.has(`${groupId}|${blockId}`),
        ...otherProgramsAt(readOtherPrograms(draft.otherPrograms), weekDays)
      },
      { t: this.t, dayName: (dateValue) => dayLabel(dateValue).label }
    );
    memo.inputs = inputs;
    memo.result = result;
    return result;
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
    this.closeEditor();
    this.pulseKeys = [];
    this.picked = null;
    if (this.view !== "activity") {
      this.activityId = null;
    }
  }
  get corner() {
    return this.t.s("TimeBlock");
  }

  get dayPills() {
    return days(this.schedule).map((day) => ({
      ...day,
      className: day.index === this.dayIndex ? "pill pill_on" : "pill"
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
    this.closeEditor();
    this.pulseKeys = [];
    this.picked = null;
  }

  get groupPills() {
    return groups(this.schedule).map((grp) => ({
      ...grp,
      className: grp.key === this.groupKey ? "pill pill_on" : "pill"
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
    return {
      ...grid,
      cells: grid.cells.map((cell) => this.decorate(cell, saving))
    };
  }

  decorate(cell, saving) {
    let result = cell;
    if (cell.slot) {
      const here = placement(
        this.dayOf(cell.slot),
        cell.slot.group,
        cell.slot.block
      ).slot;
      result = {
        ...cell,
        readOnly: this.lockedReason(cell.slot) !== null,
        movable: here.startsWith("A:"),
        dot: this.dotFor(cell.slot) || null
      };
      if (this.picked && this.picked.key === cell.key) {
        result.className = `${result.className} cell_picked`;
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
        className: "cell cell_away",
        title: `${grp.name}: not at camp`
      };
    }
    if (cell.slot && saving.has(slotKey(cell.slot))) {
      result = { ...result, className: `${result.className} cell_saving` };
    }
    return result;
  }

  /** The words of a placement's dot, if it has one (keyed by where it starts). */
  dotFor(slot) {
    return this.checked.flags.get(this.placementKeyOf(slot));
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
    return `← All ${this.t.p("Activity")}`;
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
      dayLabel(day.dateValue).label,
      day.blocks[block].name
    ].join(" · ");
  }

  cellByKey(key) {
    const grid = this.editGrid;
    return grid ? grid.cells.find((cell) => cell.key === key) : null;
  }

  /** Why a slot can't be changed here, or null. */
  lockedReason(slot) {
    const day = this.dayOf(slot);
    const at = placement(day, slot.group, slot.block);
    if (isSetTime(at.slot)) {
      return `${this.nameOf(at.slot, day)} stays where it is set up.`;
    }
    // A placement left there from an earlier setup can still be cleared.
    if (at.slot === OPEN && this.isAwaySlot(slot)) {
      return `${day.groups[slot.group].name} isn't at camp then.`;
    }
    return null;
  }

  /** What a slot's identity is called: the day's saved name, else the activity's. */
  nameOf(slot, day) {
    if (slot === OPEN) {
      return "Open";
    }
    const item = owner(slot);
    const saved = day.items.find(
      (i) =>
        `${i.kind}:${["A", "F", "R"].includes(i.kind) ? i.id : i.name}` === item
    );
    if (saved) {
      return saved.name;
    }
    const activity = this.activityFor(item);
    return activity ? activity.name : "deleted since";
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
    this.change(cell.slot, cell.key, OPEN, 1);
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
    const name = text.trim().replace(/\s+/g, " ");
    if (
      name &&
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
      this.change(cell.slot, cell.key, OPEN, 1);
      return;
    }
    let activity = option.activity;
    if (option.kind === "add") {
      try {
        activity = await addActivity({
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
      this.awayIn(slot)
    );
    if (!run) {
      const head = placement(day, slot.group, slot.block).first;
      if (next !== OPEN && this.isAwaySlot({ ...slot, block: head })) {
        this.say(`${day.groups[slot.group].name} isn't at camp then.`);
      }
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

  /** A new change ({ day, group, first, before, after } runs): saved, and one Undo step. */
  commit(runs, label, key) {
    if (this.refuseWhileRestoring()) {
      return;
    }
    const serverRuns = runs.map((run) => this.toServerRun(run));
    this.stepSeq += 1;
    const step = { id: this.stepSeq, runs: serverRuns, label };
    this.history.record(step);
    this.historyVersion += 1;
    this.send(serverRuns, label, key, step.id, runs[0]);
  }

  /** Where an edit starts, for the "saving" shade: from its own run, or found from the server's. */
  slotKeyOf(firstRun, serverRun) {
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
        `Can't ${kind === "redo" ? "redo" : "undo"} ${baseLabel || label}: the week has changed.`
      );
      return;
    }
    this.notice = null;
    this.toolNotice = null;
    this.unrepeated = null;
    // A reload already on its way is older than this edit: its answer must not replace it. The
    // week is no longer the version just restored, and a refused Restore is behind it.
    this.edited();
    const edit = { runs: serverRuns };
    const before = this.checked;
    const entry = {
      edit,
      key,
      label,
      stepId,
      kind,
      baseLabel: baseLabel || label,
      // What the director chose and saw, by time block (conflicts.js): what a question compares.
      intent,
      slotKey: this.slotKeyOf(firstRun, serverRuns[0])
    };
    this.queue = [...this.queue, entry];
    this.applyLocally(edit);
    // A dot the edit brought or took away, said with its save (a sighted director sees it).
    entry.news = this.dotNews(before, this.checked);
    this.pulseKeys =
      kind === "edit" ? this.dotChanges(before, this.checked) : [];
    this.pulseFlip = !this.pulseFlip;
    this.saveNext();
  }

  /**
   * The placements (still on the grid) whose dot changed, when they are few enough to be one
   * edit's doing (desktop MAX_SINGLE_EDIT_CELLS, 3); otherwise none.
   */
  dotChanges(before, after) {
    const keys = new Set([...before.flags.keys(), ...after.flags.keys()]);
    const changed = [...keys].filter(
      (key) => before.flags.get(key) !== after.flags.get(key)
    );
    const still = new Set(after.placements.map((p) => p.key));
    return changed.length <= 3 ? changed.filter((key) => still.has(key)) : [];
  }

  /**
   * One short line on what an edit did to the bronze dots, for screen readers: the first dot it
   * brought ("Soccer · Bunk 1: Over its limit of 1 Bunk at once"), or else the first it took away
   * ("Soccer · Bunk 1: fine now"), with how many more. Null when the dots didn't change.
   */
  dotNews(before, after) {
    const named = (checked, key) => {
      const p = checked.placements.find((x) => x.key === key);
      return p ? `${this.activityName(p.id)} · ${p.groupName}` : "";
    };
    const brought = [...after.flags].filter(
      ([key, words]) => before.flags.get(key) !== words
    );
    // A dot gone with its placement (cleared or moved) isn't "fine now": only placements still
    // on the grid.
    const still = new Set(after.placements.map((p) => p.key));
    const gone = [...before.flags.keys()].filter(
      (key) => !after.flags.has(key) && still.has(key)
    );
    let line = null;
    let more = 0;
    if (brought.length) {
      const [key, words] = brought[0];
      line = `${named(after, key)}: ${words}`;
      more = brought.length - 1;
    } else if (gone.length) {
      line = `${named(before, gone[0])}: fine now`;
      more = gone.length - 1;
    }
    return line && more ? `${line}, and ${more} more` : line;
  }

  /** The draft with an edit made, as the grid shows it until the server answers. */
  applyLocally(edit) {
    const schedule = this.schedule;
    const daysNow = schedule.days.map((day) => {
      let result = day;
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
      const result = await this.saveRuns([entry.edit]);
      if (result.status === "refused") {
        // The host's reason, as it would read from a server refusal.
        throw new Error(result.message);
      }
      this.queue = this.queue.slice(1);
      this.server = result.schedule;
      this.showServerAndWaiting();
      if (result.conflicts.length) {
        this.askAboutConflict(entry);
      } else {
        this.reportError(null);
        // A note that came with this change (Redo skipped.) is added to the line. Anything
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
        failed(`Not saved: ${entry.label}.`, e) +
          (dropped > 0
            ? ` ${dropped} more ${dropped === 1 ? "change was" : "changes were"} not saved.`
            : "")
      );
      this.queue = [];
      // What is saved is no longer known here: undoing could only guess.
      this.history.clear();
      this.historyVersion += 1;
      // The host reads the week again.
      this.dispatchEvent(new CustomEvent("reload"));
    } finally {
      this.saving = false;
    }
    this.saveNext();
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

  /** Ctrl or Cmd with Z undoes, with Shift (or Ctrl+Y) redoes; typing boxes keep their own. */
  handleKeyDown(event) {
    // The key's real target, inside the activity list's shadow if need be; never while the
    // typing box or the "keep theirs or use yours" question is open.
    const path = event.composedPath ? event.composedPath() : [];
    const target = path.length ? path[0] : event.target;
    const tag = target && target.tagName;
    if (
      !(event.ctrlKey || event.metaKey) ||
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
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
    if (tool.kind === "clear") {
      return this.stayedText(result.week, result.stayed);
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
    return tool.kind === "clear"
      ? `Cleared ${tool.name}`
      : `Copied ${tool.fromName} to ${tool.toName}`;
  }

  /** What a tool says when it changes nothing. */
  toolNothing(tool, said) {
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
    return `${this.nameOf(slot, day)} · ${day.groups[group].name} · ${dayLabel(day.dateValue).label}`;
  }

  /** "2 stayed: Archery · Bunk 1 · Monday (deleted since); …" (at most five named). */
  stayedText(week, stayed) {
    const why = {
      [LEFT_OUT.GONE]: "deleted since",
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
      const target = dayLabel(week[o.day].dateValue).label;
      switch (o.why) {
        case LEFT_OUT.AWAY:
          return "not at camp then";
        case LEFT_OUT.NO_BLOCK:
          return `${target} has no ${source.blocks[o.missing].name}`;
        case LEFT_OUT.NO_GROUP:
          return `not on ${target}`;
        case LEFT_OUT.GONE:
          return "deleted since";
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
        `${this.nameOf(o.slot, source)} · ${source.groups[o.group].name} · ${dayLabel(week[o.day].dateValue).label}: ${why(o)}`
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
  runTool(tool) {
    const seen = this.schedule.days;
    const result = toolRuns(tool, seen, {
      isAway: (week, d, g, b) => this.isAwayOn(week, d, g, b)
    });
    const said = this.toolWords(tool, result);
    const label = this.toolLabel(tool);
    if (!result.runs.length) {
      this.say(this.toolNothing(tool, said));
      return;
    }
    this.commit(result.runs, label, null);
    const entry = this.queue[this.queue.length - 1];
    if (entry && entry.stepId === this.stepSeq) {
      // The week as the director saw it goes with the change, for working it out again.
      entry.tool = { ...tool, seen, kept: new Set() };
      // What stayed or was left out is said with the save too.
      entry.extra = said;
    }
    this.showToolNotice(label, said, this.stepSeq);
  }

  showToolNotice(label, said, stepId) {
    this.toolNotice = {
      label,
      text: said ? `${label}. ${said}` : label,
      stepId
    };
  }

  /**
   * After Keep theirs, or when the saved week has changed under a tool (a fixed activity now in
   * a cell it clears, say): the tool is worked out again on the saved week, leaving every cell
   * someone else changed since the director looked as it is now, and the rest is made, as the
   * same Undo step (coordinator, 2026-10-17). The line says what was left: "Cleared Monday,
   * except 1 cell that changed".
   */
  /**
   * After Keep theirs, or when the saved week has changed under a tool (a fixed activity now in
   * a cell it clears, say): the tool is worked out again on the server's week (tools.js replan),
   * never touching a cell someone else changed since the director looked or one kept in an
   * earlier round, and the rest is made as the same Undo step, before the edits that waited
   * (coordinator, 2026-10-17). The line says what wasn't made: "Cleared Monday, except 1 cell
   * someone else changed".
   */
  replanTool(entry) {
    const { tool, stepId } = entry;
    this.conflict = null;
    this.queue = this.queue.filter((w) => w.stepId !== stepId);
    const saved = this.server.days;
    const result = replan(tool, tool.seen, saved, tool.kept, (week, d, g, b) =>
      this.isAwayOn(week, d, g, b)
    );
    const label = this.toolLabel(tool);
    if (!result.runs.length) {
      this.history.forget(stepId);
      this.historyVersion += 1;
      this.showServerAndWaiting();
      this.say(
        `${label}: nothing done, someone else changed those cells first.`
      );
      this.saveNext();
      return;
    }
    const serverRuns = result.runs.map((run) => this.toServerRun(run, saved));
    const step = { id: stepId, runs: serverRuns, label };
    if (!this.history.replace(stepId, step)) {
      this.history.ensure(step);
    }
    this.historyVersion += 1;
    const except = result.missed
      ? `${label}, except ${result.missed} ${result.missed === 1 ? "cell that" : "cells that"} changed`
      : label;
    const said = this.toolWords(tool, result);
    this.queue = [
      {
        edit: { runs: serverRuns },
        key: null,
        label: except,
        stepId,
        kind: "edit",
        baseLabel: label,
        intent: intentOf(
          saved,
          serverRuns,
          (at) => this.slotName({ day: at.dayIndex, group: at.g }, at.block),
          (at) => this.dayGroupName({ day: at.dayIndex, group: at.g })
        ),
        slotKey: this.slotKeyOf(result.runs[0], serverRuns[0]),
        tool: { ...tool, kept: result.kept },
        extra: said
      },
      ...this.queue
    ];
    this.showServerAndWaiting();
    this.showToolNotice(except, said, stepId);
    this.saveNext();
  }

  // ---------- the activity list ----------

  get showPalette() {
    return !this.isActivity;
  }
  get chips() {
    return paletteChips(
      this.schedule,
      this.checked,
      (this.draft && this.draft.activities) || [],
      this.isGroup ? this.groupKey : null,
      this.filter
    );
  }
  get neededChips() {
    return this.chips.stillNeeded;
  }
  get placedChips() {
    return this.chips.placed;
  }
  get paletteHeading() {
    return this.t.p("Activity");
  }
  get pickedActivityId() {
    return this.picked && this.picked.kind === "activity"
      ? this.picked.id
      : null;
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

  handleResizeStart(event) {
    const cell = this.cellByKey(event.detail.key);
    if (cell && cell.movable) {
      this.dragging = {
        kind: "resize",
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
      return;
    }
    this.picked = { kind: "resize", slot: cell.slot, key: cell.key };
    this.announce(`${cell.text}: choose where it ends.`);
  }

  handleCellEscape() {
    if (this.picked) {
      this.letGo();
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

  /** What was dragged or picked up, put down on a cell. */
  putDown(what, cell, at = 0) {
    if (!what || !cell || !cell.slot) {
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
    const result = moveEdit(this.schedule.days, from, cell.slot, (p) =>
      this.isAwaySlot(p)
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
    const result = removeEdit(this.schedule.days, slot);
    if (result) {
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
    return `${day.groups[slot.group].name} · ${dayLabel(day.dateValue).label}`;
  }

  resizeTo(slot, key, lastBlock) {
    const day = this.dayOf(slot);
    const at = placement(day, slot.group, slot.block);
    const name = this.nameOf(at.slot, day);
    if (lastBlock < at.first) {
      this.say(`${name} can't end before it starts.`);
      return;
    }
    const result = resizeEdit(this.schedule.days, slot, lastBlock, (p) =>
      this.isAwaySlot(p)
    );
    if (!result) {
      return;
    }
    if (result.refused) {
      this.refuse(this.refusal(result.refused, name, slot));
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
        why = `${made.gone.name || this.weekName} isn't in the week any more`;
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
        entry.note
          ? `Already as you had it. ${entry.note}`
          : "Already as you had it."
      );
      return;
    }
    if (!made.rows.length) {
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
    }
    this.historyVersion += 1;
    // A note from an earlier question (a second question about the same edit) is kept.
    const note = dropped.some((w) => w.kind === "redo")
      ? "Redo skipped."
      : entry.note || null;
    this.queue = [
      {
        ...entry,
        note,
        intent: withSeen(entry.intent, made.rows),
        edit: { runs }
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
      this.focusUndoAfterRender = false;
      const undo = this.template.querySelector('[data-id="undo"]');
      const target =
        undo && !undo.disabled
          ? undo
          : this.template.querySelector('[data-id="redo"]');
      if (target) {
        target.focus();
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
