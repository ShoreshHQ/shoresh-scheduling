import { LightningElement, api } from "lwc";
import { setTimeNote, spanChange } from "c/shoreshSetupRules";
import { moveNote } from "./groupMoves";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

/**
 * One part of one program, for the screen showing it (show): "program" (its name and operating
 * days), "timeBlocks", "divisions", "groups" (each division's groups, with the weeks each runs
 * in), "fixedActivities", or "recurringActivities" (with their weeks, and for recurring ones the
 * days and who each covers). Saves and deletes go up to the setup screen as events.
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

  name;
  days = {};
  changed = false;
  divisionRecords = [];
  // Bunks switched to another unit on screen and not saved yet: table's unit -> { unit: [names] }.
  pendingMoves = {};
  // True from this form's Save until the screen reloads (or reports the save failed).
  submitted = false;
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
    // Keep a typed but unsaved name or days when something else on the screen was saved.
    if (!this.changed || this.submitted) {
      this.resetForm();
    }
  }

  resetForm() {
    const program = this._entry.program;
    this.name = program.Name;
    this.days = {};
    DAYS.forEach((day) => {
      this.days[day] = !!program[`${day}__c`];
    });
    this.changed = false;
    this.submitted = false;
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

  get programId() {
    return this.entry.program.Id;
  }

  get dayOptions() {
    return DAYS.map((day) => ({ day, label: day, checked: this.days[day] }));
  }

  get formUnchanged() {
    return this.busy || !this.changed;
  }

  get blockColumns() {
    return [
      { fieldName: "Name", label: "Name", type: "text", required: true },
      {
        fieldName: "StartTime__c",
        label: "Start",
        type: "time",
        required: true
      },
      { fieldName: "EndTime__c", label: "End", type: "time", required: true },
      {
        fieldName: "PartOfDay__c",
        label: "Part of day",
        type: "picklist",
        required: true,
        options: [
          { label: "Morning", value: "Morning" },
          { label: "Afternoon", value: "Afternoon" }
        ]
      }
    ];
  }

  /** Name, time block, length, and location: what fixed and recurring activities share. */
  get setTimeColumns() {
    const t = this.terms;
    return [
      { fieldName: "Name", label: "Name", type: "text", required: true },
      {
        fieldName: "TimeBlock__c",
        label: t.s("TimeBlock"),
        type: "picklist",
        required: true,
        options: (this.entry.timeBlocks || []).map((block) => ({
          label: block.Name,
          value: block.Id
        }))
      },
      {
        fieldName: "Length__c",
        label: t.s("Length"),
        type: "number",
        min: 1,
        required: true
      },
      {
        fieldName: "Location__c",
        label: t.s("Location"),
        type: "picklist",
        options: [
          { label: "None", value: "" },
          ...(this.locations || []).map((l) => ({ label: l.Name, value: l.Id }))
        ]
      }
    ];
  }

  get fixedColumns() {
    return this.setTimeColumns;
  }

  /** Plus a tick for each day the program runs, and who it covers. */
  get recurringColumns() {
    const t = this.terms;
    const program = this.entry.program;
    const days = DAYS.filter((day) => program[`${day}__c`]).map((day) => ({
      fieldName: `${day}__c`,
      label: day,
      type: "checkbox"
    }));
    return [
      ...this.setTimeColumns,
      ...days,
      {
        fieldName: "Coverages__r",
        label: "Who",
        type: "who",
        everyone: `Everyone in ${program.Name}`,
        sourceLabel: `${t.p("Division")} and ${t.p("Group")}`,
        selectedLabel: "Covers",
        options: this.whoOptions
      }
    ];
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
      Program__c: this.programId,
      Name: `${this.terms.s("FixedActivity")} {n}`,
      Length__c: 1
    };
  }

  get recurringDefaults() {
    // No day ticked: the scheduler ticks at least one (Greg, 2026-10-16).
    const defaults = {
      Program__c: this.programId,
      Name: `${this.terms.s("RecurringActivity")} {n}`,
      Length__c: 1
    };
    DAYS.forEach((day) => {
      defaults[`${day}__c`] = false;
    });
    return defaults;
  }

  /**
   * Each saved row's note: whether time blocks changed what it covers since it was saved, and
   * groups left out because they are not at camp then.
   */
  notesFor(items) {
    const notes = {};
    (items || []).forEach((item) => {
      const moved = spanChange(this.entry, item, this.terms);
      notes[item.Id] = [moved ? moved.why : "", setTimeNote(this.entry, item)]
        .filter((note) => note)
        .join(" ");
    });
    return notes;
  }

  /** The fixes offered on rows whose time blocks changed under them: Id -> actions. */
  actionsFor(items) {
    const actions = {};
    (items || []).forEach((item) => {
      const moved = spanChange(this.entry, item, this.terms);
      if (moved) {
        actions[item.Id] = moved.actions;
      }
    });
    return actions;
  }

  get fixedActions() {
    return this.actionsFor(this.entry.fixedActivities);
  }

  get recurringActions() {
    return this.actionsFor(this.entry.recurringActivities);
  }

  get fixedNotes() {
    return this.notesFor(this.entry.fixedActivities);
  }

  get recurringNotes() {
    return this.notesFor(this.entry.recurringActivities);
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
              fieldName: "Division__c",
              label: this.terms.s("Division"),
              type: "picklist",
              required: true,
              // A new row is added under its own unit; a saved one can move.
              savedOnly: true,
              options: this.divisionRecords.map((d) => ({
                label: d.Name,
                value: d.Id
              }))
            }
          ]
        : [];
    return [
      { fieldName: "Name", label: "Name", type: "text", required: true },
      ...move,
      {
        fieldName: "Availability__c",
        label: this.terms.s("Availability"),
        type: "picklist",
        required: true,
        options: [
          { label: "All day", value: "AllDay" },
          { label: "Morning only", value: "MorningOnly" },
          { label: "Afternoon only", value: "AfternoonOnly" }
        ]
      }
    ];
  }

  /** What moving a group changes, shown under its row before Save. */
  get groupMoveNote() {
    const context = {
      divisions: this.divisionRecords,
      activities: this.activities,
      recurringActivities: this._entry.recurringActivities
    };
    return (values, original) => moveNote(values, original, context);
  }

  get blockDefaults() {
    return {
      Program__c: this.programId,
      PartOfDay__c: "Morning"
    };
  }

  get divisionDefaults() {
    return { Program__c: this.programId };
  }

  get divisions() {
    return (this.entry.divisions || []).map((d) => ({
      id: d.division.Id,
      title: `${this.terms.p("Group")} in ${d.division.Name}`,
      groups: d.groups,
      defaults: { Division__c: d.division.Id, Availability__c: "AllDay" },
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
      noTimeBlocks: `No ${t.pIn("TimeBlock")} yet.`,
      divisions: `${t.p("Division")} in ${program}`,
      addDivision: `Add ${t.s("Division")}`,
      noDivisions: `No ${t.pIn("Division")} yet.`,
      addGroup: `Add ${t.s("Group")}`,
      noGroups: `No ${t.pIn("Group")} yet.`,
      groupsNeedDivisions: `${program} has no ${t.pIn("Division")} yet. Add them under ${t.p("Division")} first.`,
      name: `${t.s("Program")} name`,
      days: "Runs on",
      deleteProgram: `Delete this ${t.sIn("Program")}`,
      fixed: `${t.p("FixedActivity")} in ${program}`,
      addFixed: `Add ${t.s("FixedActivity")}`,
      noFixed: `No ${t.pIn("FixedActivity")} yet. Each one takes every ${t.sIn("Group")} in ${program}, in one ${t.sIn("TimeBlock")}, every day it runs.`,
      recurring: `${t.p("RecurringActivity")} in ${program}`,
      addRecurring: `Add ${t.s("RecurringActivity")}`,
      noRecurring: `No ${t.pIn("RecurringActivity")} yet. Each one takes chosen ${t.pIn("Group")} (or all of them) in one ${t.sIn("TimeBlock")}, on the days ticked.`,
      needsBlocks: `${program} has no ${t.pIn("TimeBlock")} yet. Add them under ${t.p("TimeBlock")} first.`,
      leftOut: "Notes"
    };
  }

  handleName(event) {
    this.name = event.detail.value;
    this.changed = true;
  }

  handleDay(event) {
    this.days = {
      ...this.days,
      [event.target.dataset.day]: event.target.checked
    };
    this.changed = true;
  }

  handleSaveProgram() {
    const input = this.template.querySelector(
      'lightning-input[data-id="name"]'
    );
    if (input && !input.reportValidity()) {
      return;
    }
    const record = {
      sobjectType: "Program__c",
      Id: this.programId,
      Name: this.name
    };
    DAYS.forEach((day) => {
      record[`${day}__c`] = this.days[day];
    });
    this.submitted = true;
    const onFailure = () => {
      this.submitted = false;
    };
    this.dispatchEvent(
      new CustomEvent("save", { detail: { records: [record], onFailure } })
    );
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
    this.dispatchEvent(new CustomEvent("save", { detail: event.detail }));
  }

  handleChildDelete(event) {
    event.stopPropagation();
    this.dispatchEvent(new CustomEvent("delete", { detail: event.detail }));
  }
}
