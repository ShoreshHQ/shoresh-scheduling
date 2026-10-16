import { LightningElement, api } from "lwc";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

/**
 * One part of one program, for the screen showing it (show): "program" (its name and operating
 * days), "timeBlocks", "divisions", or "groups" (each division's groups, with the weeks each runs
 * in). Saves and deletes go up to the setup screen as events.
 */
export default class ShoreshProgram extends LightningElement {
  @api terms;
  @api busy = false;
  @api show = "program";
  /** The season's weeks and week exceptions, for the groups' "Runs in" ticks. */
  @api weeks = [];
  @api weekExceptions = [];

  name;
  days = {};
  changed = false;
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
      },
      { fieldName: "EventsOnly__c", label: "Events only", type: "checkbox" }
    ];
  }

  get divisionColumns() {
    return [{ fieldName: "Name", label: "Name", type: "text", required: true }];
  }

  get groupColumns() {
    return [
      { fieldName: "Name", label: "Name", type: "text", required: true },
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

  get blockDefaults() {
    return {
      Program__c: this.programId,
      PartOfDay__c: "Morning",
      EventsOnly__c: false
    };
  }

  get divisionDefaults() {
    return { Program__c: this.programId };
  }

  get divisionRecords() {
    return (this.entry.divisions || []).map((d) => d.division);
  }

  get divisions() {
    return (this.entry.divisions || []).map((d) => ({
      id: d.division.Id,
      title: `${this.terms.p("Group")} in ${d.division.Name}`,
      groups: d.groups,
      defaults: { Division__c: d.division.Id, Availability__c: "AllDay" }
    }));
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
      deleteProgram: `Delete this ${t.sIn("Program")}`
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
