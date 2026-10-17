import { LightningElement, api } from "lwc";
import getDraft from "@salesforce/apex/ManualBuildController.getDraft";
import startBlankWeek from "@salesforce/apex/ManualBuildController.startBlankWeek";
import saveSlots from "@salesforce/apex/ManualBuildController.saveSlots";
import addActivity from "@salesforce/apex/ManualBuildController.addActivity";
import { errorMessage } from "c/shoreshErrors";
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
import { History } from "./history";
import { intentOf, plan, withSeen } from "./conflicts";
import { paletteChips } from "./counts";

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
 * Manual Build (desktop: the Manual schedule): a program's week built by hand. A week not started
 * yet offers "Start a blank week" (fixed and recurring activities placed, the rest Open). In Daily
 * and Group View an activity is dragged from the list onto a slot, a placement dragged to another
 * slot (moved, or swapped with what is there) or back to the list (taken out), its bottom handle
 * dragged to make it longer or shorter; or a name is typed (double-click, Enter, or F2) and Delete
 * clears. From the keyboard, Space picks up a placement or a list activity and Space puts it
 * down; Shift with Up or Down changes the length. Each edit saves at once and can be undone (50
 * steps). An edit to a slot someone else changed since asks "keep theirs or use yours" (Greg,
 * 2026-10-17); nothing is overwritten unseen. Activity View is read-only.
 *
 * setup: the season (SeasonSetupController.getSeasonSetup). terms: the camp's words.
 */
export default class ShoreshManualBuild extends LightningElement {
  @api terms;

  _setup;
  programId;
  weekId;
  // ManualBuildController's DraftView: { schedule, activities, away }, or null (not started).
  draft;
  loadedFor;
  loading = false;
  starting = false;
  error;
  view = "day";
  dayIndex = 0;
  groupKey;
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
  // Edits waiting for the server, oldest first; each { edit, key, label }.
  queue = [];
  saving = false;
  loadTicket = 0;
  // The activity list's Filter box.
  filter = "";
  // Picked up from the keyboard, or being dragged: { kind: "activity", id } or
  // { kind: "cell" | "resize", slot, key }.
  picked;
  dragging;
  history = new History();
  // Bumped whenever history changes, so Undo and Redo show what they would do.
  historyVersion = 0;
  stepSeq = 0;

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
    this.load();
  }

  connectedCallback() {
    this.onWindowFocus = () => this.refresh();
    // The slot box sits where the slot was on screen; scrolling would leave it behind.
    this.onScroll = () => this.followEditor();
    window.addEventListener("focus", this.onWindowFocus);
    window.addEventListener("scroll", this.onScroll, true);
  }

  disconnectedCallback() {
    window.removeEventListener("focus", this.onWindowFocus);
    window.removeEventListener("scroll", this.onScroll, true);
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

  handleProgram(event) {
    this.programId = event.detail.value;
    this.load();
  }
  handleWeek(event) {
    this.weekId = event.detail.value;
    this.load();
  }

  /** Opens the chosen week's draft, or finds there is none yet. */
  async load(again = false) {
    const key = `${this.programId}|${this.weekId}`;
    if (!this.canChoose) {
      this.draft = null;
      this.loadedFor = null;
      return;
    }
    if (key === this.loadedFor && !again) {
      return;
    }
    this.loadedFor = key;
    this.loadTicket += 1;
    const ticket = this.loadTicket;
    if (!again) {
      this.draft = null;
      this.loading = true;
      this.notice = null;
      this.unrepeated = null;
      this.closeEditor();
      // Undo is for this visit to this week (Greg #10).
      this.history.clear();
      this.historyVersion += 1;
      this.picked = null;
    }
    try {
      const draft = await getDraft({
        programId: this.programId,
        weekId: this.weekId
      });
      if (ticket === this.loadTicket) {
        // A reload after a refused save keeps saying why; another week starts clean.
        if (!again) {
          this.error = null;
        }
        this.show(draft, !again);
      }
    } catch (e) {
      if (ticket === this.loadTicket) {
        this.error = errorMessage(e);
        this.loadedFor = again ? key : null;
      }
    } finally {
      if (ticket === this.loadTicket) {
        this.loading = false;
      }
    }
  }

  /** Coming back to the window shows other people's changes, unless an edit is under way. */
  refresh() {
    if (
      this.draft &&
      !this.saving &&
      !this.queue.length &&
      !this.editor &&
      !this.conflict
    ) {
      this.load(true);
    }
  }

  show(draft, fresh) {
    this.draft = draft;
    // What was picked up was a position in the old copy of the week: let it go.
    this.picked = null;
    // The week as the server last sent it, without edits still waiting to save.
    this.server = draft ? draft.schedule : null;
    if (fresh && draft) {
      this.dayIndex = 0;
      const all = groups(draft.schedule);
      this.groupKey = all.length ? all[0].key : null;
      this.activityId = null;
    }
  }

  /** Just after Start a blank week: fixed or recurring activities whose slot was taken. */
  get notPlaced() {
    const lines = (this.draft && this.draft.notPlaced) || [];
    return lines.length ? lines : null;
  }

  get showStart() {
    return this.canChoose && !this.loading && !this.draft && !this.error;
  }

  async handleStart() {
    this.starting = true;
    this.error = null;
    try {
      this.show(
        await startBlankWeek({
          programId: this.programId,
          weekId: this.weekId
        }),
        true
      );
      this.announce(`Started ${this.weekName}.`);
    } catch (e) {
      this.error = errorMessage(e);
    } finally {
      this.starting = false;
    }
  }

  get weekName() {
    const week = this.weekOptions.find((o) => o.value === this.weekId);
    return week ? week.label : "";
  }
  get startLabel() {
    return `Start a blank ${this.t.sIn("Week")}`;
  }

  // ---------- views ----------

  get schedule() {
    return this.draft ? this.draft.schedule : null;
  }
  get hasNoDays() {
    return !!this.schedule && this.schedule.days.length === 0;
  }
  get noDaysMessage() {
    return `${this.weekName} has no days ${this.programName} runs.`;
  }
  get programName() {
    const program = this.programOptions.find((o) => o.value === this.programId);
    return program ? program.label : "";
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
        movable: here.startsWith("A:")
      };
      if (this.picked && this.picked.key === cell.key) {
        result.className = `${result.className} cell_picked`;
        result.selected = true;
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

  get catalogue() {
    return (this._setup && this._setup.activities) || [];
  }
  locationName(activityId) {
    const activity = this.catalogue.find((a) => a.Id === activityId);
    const location =
      activity &&
      ((this._setup && this._setup.locations) || []).find(
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
        tag: `Not set up for ${grp.name}`
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
        this.error = errorMessage(e);
        return;
      }
      if (!this.draft.activities.some((a) => a.id === activity.id)) {
        this.draft = {
          ...this.draft,
          activities: [...this.draft.activities, activity]
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
  toServerRun(run) {
    const day = this.schedule.days[run.day];
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
    this.unrepeated = null;
    // A reload already on its way is older than this edit: its answer must not replace it.
    this.loadTicket += 1;
    this.loading = false;
    const edit = { runs: serverRuns };
    this.queue = [
      ...this.queue,
      {
        edit,
        key,
        label,
        stepId,
        kind,
        baseLabel: baseLabel || label,
        // What the director chose and saw, by time block (conflicts.js): what a question compares.
        intent,
        slotKey: this.slotKeyOf(firstRun, serverRuns[0])
      }
    ];
    this.applyLocally(edit);
    this.saveNext();
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
      const result = await saveSlots({
        scheduleId: this.schedule.schedule.id,
        edits: [entry.edit]
      });
      this.queue = this.queue.slice(1);
      this.server = result.schedule;
      this.showServerAndWaiting();
      if (result.conflicts.length) {
        this.askAboutConflict(entry);
      } else {
        this.error = null;
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
        this.announce(said ? `${entry.label}. ${said}` : entry.label);
      }
    } catch (e) {
      const dropped = this.queue.length - 1;
      this.error =
        errorMessage(e) +
        (dropped > 0
          ? ` ${dropped} more ${dropped === 1 ? "change was" : "changes were"} not saved.`
          : "");
      this.queue = [];
      // What is saved is no longer known here: undoing could only guess.
      this.history.clear();
      this.historyVersion += 1;
      this.load(true);
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
    if (!this.canUndo) {
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
    if (this.cannotRedo) {
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

  // ---------- the activity list ----------

  get showPalette() {
    return !this.isActivity;
  }
  get chips() {
    return paletteChips(
      this.schedule,
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
  announce(text) {
    this.announcement = "";

    Promise.resolve().then(() => {
      this.announcement = text;
    });
  }
}
