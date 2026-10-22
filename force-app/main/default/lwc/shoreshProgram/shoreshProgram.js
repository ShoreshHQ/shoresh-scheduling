import { LightningElement, api } from "lwc";
import { CHILDREN, FIELD, OBJECT } from "c/shoreshSchema";
import { setTimeNote, spanChange } from "c/shoreshSetupRules";
import { leftField } from "c/shoreshSavedMark";
import groupPlacements from "@salesforce/apex/SetupTablesController.groupPlacements";
import { moveNote } from "./groupMoves";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

/** The element with focus, looking inside components (their shadow roots). */
function focusedElement() {
  let element = document.activeElement;
  while (element && element.shadowRoot && element.shadowRoot.activeElement) {
    element = element.shadowRoot.activeElement;
  }
  return element;
}
// Names as the package has them (c/shoreshSchema).
const PROGRAM = FIELD.Program;
const BLOCK = FIELD.TimeBlock;
const FIXED = FIELD.FixedActivity;
const RECURRING = FIELD.RecurringActivity;
const GROUP = FIELD.Group;
// The operating days, saved together (see saveProgram).
const DAYS_KEY = "Days";
// The section of what everyone in the program does (docs/design/setup/fixed.html).
const WHOLE_CAMP = "Whole camp";

/**
 * One part of one program, for the screen showing it (show): "program" (its name and operating
 * days), "timeBlocks", "divisions", "groups" (each division's groups, with the weeks each runs
 * in), "fixedActivities", or "recurringActivities" (with their weeks, and for recurring ones the
 * days and who each covers). Saves and deletes go up to the setup screen as events.
 *
 * The program's own name and days save as you go, like the tables (ADR 0011, decision 26 (4)): the
 * name when the director leaves it (or presses Enter), the days the moment one is ticked. The
 * name is sent alone; the days always go all together, as the screen shows them, since the server
 * refuses a program with none (one day alone could be refused while another waits unsent). "Saved" shows quietly once it is; a refusal shows next to the field, with the
 * typing kept.
 */
export default class ShoreshProgram extends LightningElement {
  @api terms;
  @api busy = false;
  @api show = "program";
  /** The season's weeks and week exceptions, for the groups' "Runs in" ticks. */
  @api weeks = [];
  @api weekExceptions = [];
  /** The season's locations, for fixed and recurring activities. */
  @api locations = [];
  /** The season's activities with who can do each, for what moving a group changes. */
  @api activities = [];
  /** Asked before a week is unticked on a saved row (passed to the tables; see the table). */
  @api beforeWeekOff;
  /** The weeks in words, in the camp's word for a week (passed to the tables). */
  @api weekWords;
  /**
   * The camp runs more than one program: each table is headed with its program's name (and a
   * group's section with its program's too).
   */
  @api sectioned = false;

  name;
  days = {};
  // Fields ("Name", or "Days" for all five) changed on screen and not sent yet, and those sent and not answered.
  // A reload never puts back either: what the director typed stays until it is saved.
  dirty = new Set();
  sending = new Map(); // field -> saves under way

  nameError;
  daysError;
  divisionRecords = [];
  // Bunks switched to another unit on screen and not saved yet: table's unit -> { unit: [names] }.
  pendingMoves = {};
  // What each bunk is placed in across its program's drafts (GroupPlacements), asked the first
  // time a move would take it out of an activity: groupId -> the answer, or "failed".
  placements = {};
  askedPlacements = new Set();
  _entry;

  /** { program, timeBlocks, divisions: [{ division, groups }] } from SeasonSetupController. */
  @api
  get entry() {
    return this._entry;
  }
  set entry(value) {
    this._entry = value;
    // One list per entry: a new list on every redraw would look like fresh rows to the table,
    // and wipe what was typed there while a save is under way.
    this.divisionRecords = (value.divisions || []).map((d) => d.division);
    // A deleted unit's table is gone, and so are the bunk moves it had not saved.
    const units = new Set(this.divisionRecords.map((d) => d.Id));
    const stale = Object.keys(this.pendingMoves).filter((id) => !units.has(id));
    if (stale.length) {
      this.pendingMoves = Object.fromEntries(
        Object.entries(this.pendingMoves).filter(([id]) => units.has(id))
      );
    }
    this.showSaved();
  }

  /** The saved name and days, except what the director changed and is not saved yet. */
  showSaved() {
    const program = this._entry.program;
    const keep = (field) => this.dirty.has(field) || this.sending.has(field);
    if (!keep("Name")) {
      this.name = program.Name;
    }
    if (!keep(DAYS_KEY)) {
      const days = {};
      DAYS.forEach((day) => {
        days[day] = !!program[PROGRAM[day]];
      });
      this.days = days;
    }
  }

  get isProgram() {
    return this.show === "program";
  }
  get isTimeBlocks() {
    return this.show === "timeBlocks";
  }
  get isDivisions() {
    return this.show === "divisions";
  }
  get isGroups() {
    return this.show === "groups";
  }
  get isFixed() {
    return this.show === "fixedActivities";
  }
  get isRecurring() {
    return this.show === "recurringActivities";
  }
  get hasTimeBlocks() {
    return (this.entry.timeBlocks || []).length > 0;
  }
  get hasDivisions() {
    return (this.entry.divisions || []).length > 0;
  }

  /** A program's own table (its time blocks, its divisions): headed with its name when sectioned. */
  get sectionHeading() {
    return this.sectioned ? this.entry.program.Name : undefined;
  }

  get programId() {
    return this.entry.program.Id;
  }

  /** Object and field names for the tables, as the package has them. */
  get objects() {
    return OBJECT;
  }

  get groupDivisionField() {
    return GROUP.Division;
  }

  get dayOptions() {
    return DAYS.map((day) => ({ day, label: day, checked: this.days[day] }));
  }

  /**
   * As on Shoresh desktop: a blank name is saved as the time range ("9:00 AM – 9:45 AM"), and
   * "From start time" saves the part of day the start falls in (TimeBlockTriggerHandler).
   */
  get blockColumns() {
    return [
      { fieldName: "Name", label: "Name", type: "text" },
      {
        fieldName: BLOCK.StartTime,
        label: "Start",
        type: "time",
        required: true
      },
      { fieldName: BLOCK.EndTime, label: "End", type: "time", required: true },
      {
        fieldName: BLOCK.PartOfDay,
        label: "Part of day",
        type: "picklist",
        options: [
          { label: "From start time", value: "" },
          { label: "Morning", value: "Morning" },
          { label: "Afternoon", value: "Afternoon" }
        ]
      }
    ];
  }

  /** The time block: what fixed and recurring activities' rows share ("Time", fixed.html). */
  timeColumn(fields) {
    return {
      fieldName: fields.TimeBlock,
      label: this.terms.s("TimeBlock"),
      type: "picklist",
      required: true,
      options: (this.entry.timeBlocks || []).map((block) => ({
        label: block.Name,
        value: block.Id
      }))
    };
  }

  /**
   * Length and location: the row's details, opened from its chevron (docs/design/setup/
   * fixed.html shows name, who, time, days and weeks; ADR 0015 choice 12). Saved with the row.
   */
  detailColumns(fields) {
    const t = this.terms;
    return [
      {
        fieldName: fields.Length,
        label: t.s("Length"),
        type: "number",
        min: 1,
        required: true,
        more: true
      },
      {
        fieldName: fields.Location,
        label: t.s("Location"),
        type: "picklist",
        more: true,
        options: [
          { label: "None", value: "" },
          ...(this.locations || []).map((l) => ({ label: l.Name, value: l.Id }))
        ]
      }
    ];
  }

  get fixedColumns() {
    return [
      { fieldName: "Name", label: "Name", type: "text", required: true },
      this.timeColumn(FIXED),
      ...this.detailColumns(FIXED)
    ];
  }

  /**
   * Name, who it covers, its time block, the days it runs (one column: "Every day" quiet, the
   * exception a value, a tick per day on hover or edit) and its weeks.
   */
  get recurringColumns() {
    const program = this.entry.program;
    const days = DAYS.filter((day) => program[PROGRAM[day]]).map((day) => ({
      fieldName: RECURRING[day],
      label: day
    }));
    return [
      {
        fieldName: "Name",
        label: "Name",
        type: "text",
        required: true,
        minWidth: 9
      },
      {
        fieldName: CHILDREN.RecurringActivity.Coverages,
        label: "Who",
        type: "who",
        everyone: `Everyone in ${program.Name}`,
        options: this.whoOptions,
        width: 12
      },
      this.timeColumn(RECURRING),
      {
        fieldName: "days",
        label: "Days",
        type: "days",
        width: 9,
        days,
        every: "Every day",
        none: "No days"
      },
      ...this.detailColumns(RECURRING)
    ];
  }

  /** The whole camp's fixed activities: one section ("Whole camp"; a program's name if several). */
  get fixedHeading() {
    return this.sectioned ? this.entry.program.Name : WHOLE_CAMP;
  }

  /** "Needs attention" only while a row needs it: the rule is quiet, the exception stands out. */
  get fixedNotesHeading() {
    return Object.values(this.fixedNotes).some((note) => note)
      ? this.labels.leftOut
      : undefined;
  }

  get recurringNotesHeading() {
    return Object.values(this.recurringNotes).some((note) => note)
      ? this.labels.leftOut
      : undefined;
  }

  /**
   * Recurring activities in sections (docs/design/setup/fixed.html): the whole camp's, then one
   * per division, then those covering more than one division (only while there are any). An
   * item's section is worked out from who it covers; a section's blank row starts covering that
   * division, and covering it all reads quietly ("Every bunk"). Each section is a table over
   * every row, showing its own (rowFilter).
   */
  get recurringSections() {
    const entry = this._entry;
    if (
      this._sectionsFor === entry &&
      this._sectionsTerms === this.terms &&
      this._sectionsSectioned === this.sectioned
    ) {
      return this._sections;
    }
    const t = this.terms;
    const program = entry.program.Name;
    const prefix = this.sectioned ? `${program} · ` : "";
    const every = `Every ${t.sIn("Group")}`;
    const divisions = (entry.divisions || []).map((d) => d.division);
    const divisionOf = new Map();
    (entry.divisions || []).forEach((d) => {
      divisionOf.set(d.division.Id, d.division.Id);
      (d.groups || []).forEach((g) => divisionOf.set(g.Id, d.division.Id));
    });
    const sectionOf = (who) => {
      const found = new Set(
        (who || []).map((id) => divisionOf.get(id)).filter((id) => id)
      );
      if (found.size === 0) {
        return "all";
      }
      return found.size === 1 ? [...found][0] : "several";
    };
    const whoField = FIELD.Coverage;
    const coverage = CHILDREN.RecurringActivity.Coverages;
    const savedWho = (record) =>
      (record[coverage] || []).map(
        (row) => row[whoField.Division] || row[whoField.Group]
      );
    const title = (name) =>
      `${t.p("RecurringActivity")} in ${program}: ${name}`;
    const section = (key, name, rule, who) => ({
      key,
      heading: `${prefix}${name}`,
      title: title(name),
      rule,
      who,
      filter: (record, shown) => sectionOf(shown || savedWho(record)) === key
    });
    const sections = [
      section("all", WHOLE_CAMP, { ids: [], words: every }, []),
      ...divisions.map((d) =>
        section(d.Id, d.Name, { ids: [d.Id], words: every }, [d.Id])
      )
    ];
    const several = (entry.recurringActivities || []).some(
      (item) => sectionOf(savedWho(item)) === "several"
    );
    if (several) {
      sections.push(
        section(
          "several",
          `More than one ${t.sIn("Division")}`,
          null,
          divisions.map((d) => d.Id)
        )
      );
    }
    this._sectionsFor = entry;
    this._sectionsTerms = this.terms;
    this._sectionsSectioned = this.sectioned;
    this._sections = sections.map((s, index) => ({ ...s, first: index === 0 }));
    return this._sections;
  }

  /** The program's divisions, then its groups (with their division), as in "Who can do it". */
  get whoOptions() {
    const t = this.terms;
    const divisions = [];
    const groups = [];
    (this.entry.divisions || []).forEach((d) => {
      divisions.push({
        label: `${t.s("Division")}: ${d.division.Name}`,
        value: d.division.Id
      });
      (d.groups || []).forEach((grp) => {
        groups.push({
          label: `${grp.Name} (${d.division.Name})`,
          value: grp.Id
        });
      });
    });
    return [...divisions, ...groups];
  }

  get fixedDefaults() {
    return {
      [FIXED.Program]: this.programId,
      [FIXED.Length]: 1
    };
  }

  get recurringDefaults() {
    // No day ticked: the scheduler ticks at least one (Greg, 2026-10-16).
    const defaults = {
      [RECURRING.Program]: this.programId,
      [RECURRING.Length]: 1
    };
    DAYS.forEach((day) => {
      defaults[RECURRING[day]] = false;
    });
    return defaults;
  }

  /**
   * Each saved row's note: whether time blocks changed what it covers since it was saved, and
   * groups left out because they are not at camp then.
   */
  notesFor(items, fields) {
    const notes = {};
    (items || []).forEach((item) => {
      const moved = spanChange(this.entry, item, this.terms, fields);
      notes[item.Id] = [
        moved ? moved.why : "",
        setTimeNote(this.entry, item, fields)
      ]
        .filter((note) => note)
        .join(" ");
    });
    return notes;
  }

  /** The fixes offered on rows whose time blocks changed under them: Id -> actions. */
  actionsFor(items, fields) {
    const actions = {};
    (items || []).forEach((item) => {
      const moved = spanChange(this.entry, item, this.terms, fields);
      if (moved) {
        actions[item.Id] = moved.actions;
      }
    });
    return actions;
  }

  get fixedActions() {
    return this.actionsFor(this.entry.fixedActivities, FIELD.FixedActivity);
  }

  get recurringActions() {
    return this.actionsFor(
      this.entry.recurringActivities,
      FIELD.RecurringActivity
    );
  }

  get fixedNotes() {
    return this.notesFor(this.entry.fixedActivities, FIELD.FixedActivity);
  }

  get recurringNotes() {
    return this.notesFor(
      this.entry.recurringActivities,
      FIELD.RecurringActivity
    );
  }

  get divisionColumns() {
    return [{ fieldName: "Name", label: "Name", type: "text", required: true }];
  }

  get groupColumns() {
    // A group moves to another division of its own program only (GroupMoves).
    const move =
      this.divisionRecords.length > 1
        ? [
            {
              fieldName: GROUP.Division,
              label: this.terms.s("Division"),
              type: "picklist",
              required: true,
              // A new row is added under its own unit; a saved one can move.
              savedOnly: true,
              more: true,
              options: this.divisionRecords.map((d) => ({
                label: d.Name,
                value: d.Id
              }))
            }
          ]
        : [];
    return [
      { fieldName: "Name", label: "Name", type: "text", required: true },
      {
        fieldName: GROUP.Availability,
        label: this.terms.s("Availability"),
        type: "picklist",
        required: true,
        options: [
          { label: "All day", value: "AllDay" },
          { label: "Morning only", value: "MorningOnly" },
          { label: "Afternoon only", value: "AfternoonOnly" }
        ]
      },
      // The division is the section the group sits in, never a repeated column: a group moves
      // from its details, opened from its row.
      ...move
    ];
  }

  /** What moving a group changes, shown under its row before Save. */
  get groupMoveNote() {
    const context = {
      divisions: this.divisionRecords,
      activities: this.activities,
      recurringActivities: this._entry.recurringActivities,
      placements: this.placements,
      want: (groupId) => this.askPlacements(groupId)
    };
    return (values, original) => moveNote(values, original, context);
  }

  /**
   * Asks once what a bunk is placed in; the note is drawn again with the answer. Asked after the
   * note in hand is drawn, never while it is.
   */
  askPlacements(groupId) {
    if (this.askedPlacements.has(groupId)) {
      return;
    }
    this.askedPlacements.add(groupId);
    const answered = (answer) => {
      this.placements = { ...this.placements, [groupId]: answer };
    };
    Promise.resolve()
      .then(() => groupPlacements({ groupId }))
      .then(
        (result) => answered(result || { placed: [], complete: true }),
        () => answered("failed")
      );
  }

  get blockDefaults() {
    return {
      [BLOCK.Program]: this.programId,
      [BLOCK.PartOfDay]: ""
    };
  }

  get divisionDefaults() {
    return { [FIELD.Division.Program]: this.programId };
  }

  get divisions() {
    const program = this.sectioned ? `${this.entry.program.Name} · ` : "";
    return (this.entry.divisions || []).map((d, index) => ({
      id: d.division.Id,
      title: `${this.terms.p("Group")} in ${d.division.Name}`,
      heading: `${program}${d.division.Name}`,
      first: index === 0,
      groups: d.groups,
      defaults: {
        [GROUP.Division]: d.division.Id,
        [GROUP.Availability]: "AllDay"
      },
      namesElsewhere: this.namesElsewhere(d.division.Id)
    }));
  }

  /**
   * For one unit's table: each other unit's bunks (saved, and moving there from other tables),
   * and the bunks moving into this unit from other tables, so a clash shows on both rows.
   */
  namesElsewhere(divisionId) {
    const movingInto = (target) =>
      Object.entries(this.pendingMoves)
        .filter(([from]) => from !== divisionId)
        .flatMap(([, moved]) => moved[target] || []);
    return Object.fromEntries(
      (this.entry.divisions || []).map((other) => {
        const id = other.division.Id;
        const saved =
          id === divisionId ? [] : (other.groups || []).map((g) => g.Name);
        return [id, [...saved, ...movingInto(id)]];
      })
    );
  }

  handlePendingNames(event) {
    this.pendingMoves = {
      ...this.pendingMoves,
      [event.currentTarget.dataset.division]: event.detail.moved
    };
  }

  get labels() {
    const t = this.terms;
    const program = this.entry.program.Name;
    return {
      timeBlocks: `${t.p("TimeBlock")} in ${program}`,
      addTimeBlock: `Add ${t.s("TimeBlock")}`,
      noTimeBlocks: `No ${t.pIn("TimeBlock")} yet`,
      divisions: `${t.p("Division")} in ${program}`,
      addDivision: `Add ${t.s("Division")}`,
      noDivisions: `No ${t.pIn("Division")} yet`,
      addGroup: `Add ${t.s("Group")}`,
      noGroups: `No ${t.pIn("Group")} yet`,
      toDivisions: `${t.p("Division")} →`,
      name: `${t.s("Program")} name`,
      days: "Runs on",
      deleteProgram: `Delete this ${t.sIn("Program")}`,
      fixed: `${t.p("FixedActivity")} in ${program}`,
      addFixed: `Add ${t.s("FixedActivity")}`,
      noFixed: `No ${t.pIn("FixedActivity")} yet`,
      recurring: `${t.p("RecurringActivity")} in ${program}`,
      addRecurring: `Add ${t.s("RecurringActivity")}`,
      noRecurring: `No ${t.pIn("RecurringActivity")} yet`,
      toTimeBlocks: `${t.p("TimeBlock")} →`,
      // What needs a look on a row: who is left out, a time block that changed (desktop: "Needs
      // attention"), not general notes.
      leftOut: "Needs attention",
      weeksColumn: t.p("Week"),
      // What moving a group to another division changes.
      moving: "What changes"
    };
  }

  /** A screen this one needs first (an empty one's button): the page opens it. */
  handleGo(event) {
    this.dispatchEvent(
      new CustomEvent("navigate", {
        detail: { screen: event.currentTarget.dataset.screen }
      })
    );
  }

  handleName(event) {
    this.name = event.detail.value;
    this.edited("Name");
    this.nameError = null;
  }

  handleNameLeave(event) {
    if (leftField(event)) {
      this.saveProgram("Name");
    }
  }

  handleNameKey(event) {
    if (event.key === "Enter") {
      this.saveProgram("Name");
    }
  }

  /** The days are saved the moment one is ticked, as the tables' ticks are. */
  handleDay(event) {
    const day = event.target.dataset.day;
    this.days = { ...this.days, [day]: event.target.checked };
    this.edited(DAYS_KEY);
    this.daysError = null;
    this.saveProgram(DAYS_KEY);
  }

  edited(field) {
    this.dirty.add(field);
    const mark = this.template.querySelector("c-shoresh-saved-mark");
    if (mark) {
      mark.clear();
    }
  }

  /**
   * Sends what changed (field: "Name", or "Days" for all five days as shown). A blank name is
   * not sent: the field says it needs one, as any required field does.
   */
  saveProgram(field) {
    if (!this.dirty.has(field)) {
      return;
    }
    if (field === "Name") {
      const input = this.template.querySelector(
        'lightning-input[data-id="name"]'
      );
      if (input && !input.reportValidity()) {
        return;
      }
    }
    this.dirty.delete(field);
    this.sending.set(field, (this.sending.get(field) || 0) + 1);
    const record = { sobjectType: OBJECT.Program, Id: this.programId };
    if (field === "Name") {
      record.Name = this.name;
    } else {
      DAYS.forEach((day) => {
        record[PROGRAM[day]] = !!this.days[day];
      });
    }
    const done = () => {
      const left = this.sending.get(field) - 1;
      if (left > 0) {
        this.sending.set(field, left);
      } else {
        this.sending.delete(field);
      }
    };
    const onSaved = () => {
      done();
      if (field === DAYS_KEY) {
        this.daysError = null;
      }
      const mark = this.template.querySelector("c-shoresh-saved-mark");
      if (mark) {
        mark.saved();
      }
    };
    // Refused: the change stays on screen, still to save, with why next to it.
    const onFailure = (message) => {
      done();
      if (this.sending.has(field)) {
        // A newer save of the same field is on its way, with what the screen shows now.
        return;
      }
      this.dirty.add(field);
      if (field === "Name") {
        this.nameError = message;
      } else {
        this.daysError = message;
      }
    };
    this.dispatchEvent(
      new CustomEvent("save", {
        detail: { records: [record], onSaved, onFailure }
      })
    );
  }

  /** The cursor into the program's name box (after the card above it is deleted). */
  @api
  focusName() {
    const input = this.template.querySelector(
      'lightning-input[data-id="name"]'
    );
    if (input) {
      input.focus();
    }
  }

  handleDeleteProgram() {
    this.dispatchEvent(
      new CustomEvent("delete", {
        detail: { recordId: this.programId, name: this.entry.program.Name }
      })
    );
  }

  // Tables inside pass their events straight up.
  handleChildSave(event) {
    event.stopPropagation();
    const detail = event.detail;
    // A recurring activity whose save moves it to another section (who it covers changed), or a
    // group moved to another division, may hold the cursor: once the season is read again, the
    // cursor follows it there.
    const held = this.isRecurring || this.isGroups ? this.focusedRow() : null;
    const onDone = detail.onDone;
    const sent =
      held && typeof onDone === "function"
        ? {
            ...detail,
            onDone: () => {
              onDone();
              Promise.resolve().then(() => this.followMoved(held));
            }
          }
        : detail;
    this.dispatchEvent(new CustomEvent("save", { detail: sent }));
  }

  /** This screen's sectioned tables: a recurring activity's, or each division's groups. */
  sectionTables() {
    const id = this.isGroups ? "groups" : "recurring-activities";
    return [
      ...this.template.querySelectorAll(
        `c-shoresh-editable-table[data-id="${id}"]`
      )
    ];
  }

  /** The recurring activity or group whose row holds the cursor, and its table, if any. */
  focusedRow() {
    for (const table of this.sectionTables()) {
      const row = table.focusedRow();
      if (row) {
        return { ...row, table };
      }
    }
    return null;
  }

  /**
   * After a save, a recurring activity or group that held the cursor and left its section (who
   * it covers moved it to another division's, or it moved to another division) takes the cursor
   * along: the same control in its new section, the move said aloud (WCAG 2.4.3), as a place
   * whose type changed does (ADR 0015 choice 11). Only when the cursor was lost with the row.
   */
  followMoved(held) {
    const now = focusedElement();
    if (now && now !== document.body) {
      return;
    }
    const { table, recordId, field, inDetails } = held;
    if (table.isConnected && table.showsRow(recordId)) {
      return;
    }
    const target = this.sectionTables().find((t) => t.showsRow(recordId));
    const moved = target ? this.movedTo(recordId, target) : null;
    if (!moved) {
      return;
    }
    target.takeFocus(
      recordId,
      field,
      inDetails,
      `${moved.name} moved to ${moved.heading}`.trim()
    );
  }

  /** A moved row's name and the heading of the section it is now in. */
  movedTo(recordId, target) {
    if (this.isGroups) {
      const division = this.divisions.find(
        (d) => d.id === target.dataset.division
      );
      const grp = division
        ? (division.groups || []).find((g) => g.Id === recordId)
        : null;
      return grp ? { name: grp.Name, heading: division.heading } : null;
    }
    const item = (this._entry.recurringActivities || []).find(
      (r) => r.Id === recordId
    );
    if (!item) {
      return null;
    }
    const section = this.recurringSections.find(
      (s) => s.key === target.dataset.section
    );
    return { name: item.Name, heading: section ? section.heading : "" };
  }

  handleChildDelete(event) {
    event.stopPropagation();
    this.dispatchEvent(new CustomEvent("delete", { detail: event.detail }));
  }
}
