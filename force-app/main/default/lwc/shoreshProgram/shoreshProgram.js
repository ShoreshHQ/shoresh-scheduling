import { LightningElement, api } from "lwc";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

/**
 * One program: its name and operating days, its time blocks, its divisions, and each
 * division's groups. Saves and deletes go up to the setup screen as events.
 */
export default class ShoreshProgram extends LightningElement {
  @api terms;
  @api busy = false;

  name;
  days = {};
  changed = false;
  _entry;

  /** { program, timeBlocks, divisions: [{ division, groups }] } from SeasonSetupController. */
  @api
  get entry() {
    return this._entry;
  }
  set entry(value) {
    this._entry = value;
    // Fresh data from the server replaces anything typed.
    this.resetForm();
  }

  resetForm() {
    const program = this._entry.program;
    this.name = program.Name;
    this.days = {};
    DAYS.forEach((day) => {
      this.days[day] = !!program[`${day}__c`];
    });
    this.changed = false;
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
          { label: "Afternoon", value: "Afternoon" },
          { label: "Evening", value: "Evening" }
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
    return {
      timeBlocks: t.p("TimeBlock"),
      addTimeBlock: `Add ${t.s("TimeBlock")}`,
      noTimeBlocks: `No ${t.pIn("TimeBlock")} yet.`,
      divisions: t.p("Division"),
      addDivision: `Add ${t.s("Division")}`,
      noDivisions: `No ${t.pIn("Division")} yet.`,
      addGroup: `Add ${t.s("Group")}`,
      noGroups: `No ${t.pIn("Group")} yet.`,
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
    this.dispatchEvent(
      new CustomEvent("save", { detail: { records: [record] } })
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
