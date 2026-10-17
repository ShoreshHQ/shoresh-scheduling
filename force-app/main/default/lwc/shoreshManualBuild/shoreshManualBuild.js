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
  placement,
  slots
} from "./slotEdits";

/** Names compared the way people mean them: spaces and capitals aside. */
function loose(text) {
  return String(text || "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

/**
 * Manual Build (desktop: the Manual schedule): a program's week built by hand. A week not started
 * yet offers "Start a blank week" (fixed and recurring activities placed, the rest Open). In Daily
 * and Group View a slot is changed by typing a name (double-click, Enter, or F2) and cleared with
 * Delete; each edit saves at once. An edit to a slot someone else changed since asks "keep theirs
 * or use yours" (Greg, 2026-10-17); nothing is overwritten unseen. Activity View is read-only.
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
  // Edits waiting for the server, oldest first; each { edit, key, label }.
  queue = [];
  saving = false;
  loadTicket = 0;

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
    window.addEventListener("focus", this.onWindowFocus);
  }

  disconnectedCallback() {
    window.removeEventListener("focus", this.onWindowFocus);
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
      this.closeEditor();
    }
    try {
      const draft = await getDraft({
        programId: this.programId,
        weekId: this.weekId
      });
      if (ticket === this.loadTicket) {
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
    if (fresh && draft) {
      this.dayIndex = 0;
      const all = groups(draft.schedule);
      this.groupKey = all.length ? all[0].key : null;
      this.activityId = null;
    }
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
    const saving = new Set(this.queue.map((entry) => entry.key));
    return {
      ...grid,
      cells: grid.cells.map((cell) => this.decorate(cell, saving))
    };
  }

  decorate(cell, saving) {
    let result = cell;
    if (cell.slot && cell.text === "Open" && this.isAwaySlot(cell.slot)) {
      const grp = this.dayOf(cell.slot).groups[cell.slot.group];
      result = {
        ...cell,
        text: "Not at camp",
        className: "cell cell_away",
        title: `${grp.name}: not at camp`
      };
    }
    if (saving.has(cell.key)) {
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
    if (this.isAwaySlot(slot)) {
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
    return activity ? activity.name : item.slice(2);
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
    this.change(cell, OPEN, 1);
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
    if (placement(day, slot.group, slot.block).slot !== OPEN && !typed) {
      options.push({ key: "open", kind: "open", label: "Open" });
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
    const highlight = Math.min(this.editor.highlight, options.length - 1);
    return options.map((option, i) => ({
      ...option,
      id: `slot-option-${i}`,
      selected: String(i === highlight),
      className: i === highlight ? "option option_on" : "option"
    }));
  }
  get activeOptionId() {
    const option = this.editorOptions.find((o) => o.selected === "true");
    return option ? option.id : null;
  }
  get hasEditorOptions() {
    return this.editorOptions.length > 0;
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
      this.change(cell, OPEN, 1);
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
    this.change(cell, `A:${activity.id}`, activity.length);
  }

  // ---------- saving ----------

  /** Makes an edit on screen at once and queues it for the server. */
  change(cell, next, length) {
    const { slot } = cell;
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
      return;
    }
    const edit = {
      runs: [
        {
          day: day.dateValue,
          groupId: day.groups[slot.group].id,
          firstBlockId: day.blocks[run.first].id,
          before: run.before,
          after: run.after
        }
      ]
    };
    const label =
      next === OPEN
        ? `Cleared ${this.slotName(slot, run.first)}`
        : `Placed ${this.nameOf(next, day)} · ${this.slotName(slot, run.first)}`;
    this.queue = [...this.queue, { edit, key: cell.key, label }];
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
    if (this.saving || !this.queue.length) {
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
      // The server's draft, with the edits still waiting made on top of it.
      this.draft = { ...this.draft, schedule: result.schedule };
      this.queue.forEach((waiting) => this.applyLocally(waiting.edit));
      if (result.conflicts.length) {
        this.askAboutConflict(entry);
      } else {
        this.announce(entry.label);
      }
    } catch (e) {
      this.error = errorMessage(e);
      this.queue = [];
      this.load(true);
    } finally {
      this.saving = false;
    }
    this.saveNext();
  }

  // ---------- someone else changed it ----------

  askAboutConflict(entry) {
    const [run] = entry.edit.runs;
    const dayIndex = this.schedule.days.findIndex(
      (d) => d.dateValue === run.day
    );
    const day = this.schedule.days[dayIndex];
    const g = day ? day.groups.findIndex((grp) => grp.id === run.groupId) : -1;
    const first = day
      ? day.blocks.findIndex((block) => block.id === run.firstBlockId)
      : -1;
    if (g < 0 || first < 0) {
      this.error = `${this.weekName} changed since you opened it. Your last change was not saved.`;
      return;
    }
    const now = slots(day, g).slice(first, first + run.after.length);
    this.conflict = {
      edit: entry.edit,
      key: entry.key,
      label: entry.label,
      where: this.slotName({ day: dayIndex, group: g }, first),
      theirs: this.nameOf(now[0], day),
      yours: this.nameOf(run.after[0], day),
      now
    };
    this.announce(`${this.conflict.where} changed since you opened it.`);
  }

  handleKeepTheirs() {
    const key = this.conflict.key;
    this.conflict = null;
    const grid = this.template.querySelector('[data-id="edit-grid"]');
    if (grid) {
      grid.focusCell(key);
    }
  }

  handleUseYours() {
    const { edit, key, label, now } = this.conflict;
    this.conflict = null;
    const [run] = edit.runs;
    const retry = { runs: [{ ...run, before: now }] };
    this.queue = [...this.queue, { edit: retry, key, label }];
    this.applyLocally(retry);
    this.saveNext();
  }

  handleConflictKeyDown(event) {
    if (event.key === "Escape") {
      this.handleKeepTheirs();
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

  announce(text) {
    this.announcement = text;
  }
}
