import { LightningElement, api } from "lwc";

/**
 * A small table of records edited in place. Changes stay on screen until the scheduler
 * presses Save; nothing is saved behind their back.
 *
 * columns: [{ fieldName, label, type: 'text'|'number'|'date'|'time'|'checkbox'|'picklist', options,
 *   required, min, excludeSelf }]  (min: smallest number allowed, for number columns;
 *   excludeSelf: a picklist of records leaves out the row's own record)
 * When the screen reloads after something else was saved, anything typed here and not yet
 * saved stays on screen. Only this table's own successful save clears it.
 *
 * filterField / filterValue: show only rows whose filterField equals filterValue ("" means rows
 * where it is empty; no filterValue shows every row). Hidden rows keep their unsaved typing
 * and are still saved; new rows always show.
 *
 * weeks / weekExceptions / weeksHeading: with weeks and a heading (such as "Runs in"), each row
 * gets a tick per week, ticked unless a week exception names the row in that week. New rows
 * start with every week ticked. weekPhrase words each tick for screen readers ("runs in").
 *
 * Fires:
 *   save   { records, onFailure } - new rows with all values, existing rows with Id and changed
 *          fields only; call onFailure() if the save did not go through. With weeks, also
 *          weeksOff [{ target, week }, or { row, week } for a new row: its place in records]
 *          and weeksBackOn [week exception Ids]
 *   delete { recordId, name }
 */
export default class ShoreshEditableTable extends LightningElement {
  @api title;
  @api objectApiName;
  @api addLabel = "Add";
  @api emptyMessage = "Nothing here yet.";
  /**
   * Values every new row starts with, such as the parent record and a default name.
   * "{n}" in a text value becomes the new row's position, so new rows get distinct names.
   */
  @api newRowDefaults = {};
  @api busy = false;
  @api filterField;
  @api filterValue;
  @api weeksHeading;
  @api weekPhrase = "runs in";

  drafts = [];
  nextKey = 0;
  // True from this table's Save until the screen reloads (or reports the save failed).
  submitted = false;
  _rows = [];
  _columns = [];
  _weeks = [];
  _weekExceptions = [];

  @api
  get weeks() {
    return this._weeks;
  }
  set weeks(value) {
    this._weeks = value || [];
  }

  /** The season's week exceptions; only those naming this table's rows matter. */
  @api
  get weekExceptions() {
    return this._weekExceptions;
  }
  set weekExceptions(value) {
    this._weekExceptions = value || [];
  }

  @api
  get columns() {
    return this._columns;
  }
  set columns(value) {
    this._columns = value || [];
    // The screen may hand over the columns again whenever it redraws; keep what was typed.
    this.drafts = this.keepTyping(this._rows);
  }

  @api
  get rows() {
    return this._rows;
  }
  set rows(value) {
    this._rows = value || [];
    if (this.submitted) {
      // This table's own save went through: show exactly what was saved.
      this.submitted = false;
      this.drafts = this._rows.map((record) => this.draftFor(record, false));
      return;
    }
    // Something else was saved: keep what was typed here and not yet saved.
    this.drafts = this.keepTyping(this._rows);
  }

  /** Rows for these records, carrying over any unsaved changes and unsaved new rows. */
  keepTyping(records) {
    const previous = this.drafts;
    const kept = records.map((record) => {
      const draft = this.draftFor(record, false);
      const old = previous.find((d) => !d.isNew && d.original.Id === record.Id);
      if (old) {
        draft.weekTicks = new Map(old.weekTicks);
        old.changed.forEach((field) => {
          if (!sameValue(old.values[field], draft.original[field])) {
            draft.values[field] = old.values[field];
            draft.changed.add(field);
          }
        });
      }
      return draft;
    });
    return [...kept, ...previous.filter((d) => d.isNew)];
  }

  draftFor(record, isNew) {
    this.nextKey += 1;
    const shown = { ...record };
    this.columns
      .filter((col) => col.type === "time")
      .forEach((col) => {
        shown[col.fieldName] = timeText(shown[col.fieldName]);
      });
    return {
      key: `row-${this.nextKey}`,
      original: shown,
      values: { ...shown },
      changed: new Set(),
      // Unsaved week ticks: week Id -> ticked. Only differences from what is saved count.
      weekTicks: new Map(),
      isNew
    };
  }

  get hasRows() {
    return this.drafts.length > 0;
  }

  get isDirty() {
    const offWeeks = this.offWeeks;
    return this.drafts.some(
      (d) =>
        d.isNew || d.changed.size > 0 || this.weekChanges(d, offWeeks).size > 0
    );
  }

  get hasWeeks() {
    return !!this.weeksHeading && this._weeks.length > 0;
  }

  get weekCount() {
    return this._weeks.length;
  }

  get columnCount() {
    return this.columns.length;
  }

  /** Row Id -> (week Id -> the week exception Ids saying the row does not run that week). */
  get offWeeks() {
    const result = new Map();
    this._weekExceptions.forEach((mark) => {
      const target = mark.Group__c || mark.Activity__c || mark.Location__c;
      const weeks = result.get(target) || new Map();
      weeks.set(mark.Week__c, [...(weeks.get(mark.Week__c) || []), mark.Id]);
      result.set(target, weeks);
    });
    return result;
  }

  savedOff(draft, offWeeks) {
    return (!draft.isNew && offWeeks.get(draft.original.Id)) || new Map();
  }

  /** Week ticks that differ from what is saved, for weeks still on screen: week Id -> ticked. */
  weekChanges(draft, offWeeks) {
    if (!this.hasWeeks) {
      return new Map();
    }
    const saved = this.savedOff(draft, offWeeks);
    const changes = new Map();
    this._weeks.forEach((week) => {
      if (
        draft.weekTicks.has(week.Id) &&
        draft.weekTicks.get(week.Id) === saved.has(week.Id)
      ) {
        changes.set(week.Id, draft.weekTicks.get(week.Id));
      }
    });
    return changes;
  }

  get saveDisabled() {
    return this.busy || !this.isDirty;
  }

  get cancelDisabled() {
    return this.busy || !this.isDirty;
  }

  get visibleDrafts() {
    if (
      !this.filterField ||
      this.filterValue === undefined ||
      this.filterValue === null
    ) {
      return this.drafts;
    }
    return this.drafts.filter(
      (draft) =>
        draft.isNew ||
        (draft.values[this.filterField] || "") === this.filterValue
    );
  }

  get hasVisibleRows() {
    return this.visibleDrafts.length > 0;
  }

  get tableRows() {
    const offWeeks = this.offWeeks;
    return this.visibleDrafts.map((draft) => ({
      key: draft.key,
      isNew: draft.isNew,
      deleteLabel: draft.isNew
        ? "Remove this new row"
        : `Delete ${draft.values.Name || ""}`.trim(),
      cells: this.columns.map((col) => {
        const value = draft.values[col.fieldName];
        return {
          key: `${draft.key}-${col.fieldName}`,
          fieldName: col.fieldName,
          label: col.label,
          required: !!col.required,
          options: col.excludeSelf
            ? (col.options || []).filter(
                (option) => !option.value || option.value !== draft.original.Id
              )
            : col.options,
          isText: col.type === "text" || !col.type,
          isNumber: col.type === "number",
          min: col.min,
          isDate: col.type === "date",
          isTime: col.type === "time",
          isCheckbox: col.type === "checkbox",
          isPicklist: col.type === "picklist",
          value: col.type === "checkbox" ? undefined : value,
          checked: col.type === "checkbox" ? !!value : undefined
        };
      }),
      weekCells: this.weekCells(draft, offWeeks)
    }));
  }

  weekCells(draft, offWeeks) {
    if (!this.hasWeeks) {
      return [];
    }
    const saved = this.savedOff(draft, offWeeks);
    const name = draft.values.Name || "This row";
    return this._weeks.map((week) => ({
      key: `${draft.key}-week-${week.Id}`,
      weekId: week.Id,
      checked: draft.weekTicks.has(week.Id)
        ? draft.weekTicks.get(week.Id)
        : !saved.has(week.Id),
      label: `${name} ${this.weekPhrase} ${week.Name}`
    }));
  }

  handleTick(event) {
    const { rowKey, week } = event.target.dataset;
    const draft = this.drafts.find((d) => d.key === rowKey);
    draft.weekTicks = new Map(draft.weekTicks).set(week, event.target.checked);
    this.drafts = [...this.drafts];
  }

  handleChange(event) {
    const { rowKey, field } = event.target.dataset;
    const draft = this.drafts.find((d) => d.key === rowKey);
    const column = this.columns.find((col) => col.fieldName === field);
    let value =
      event.target.type === "checkbox" || event.target.type === "toggle"
        ? event.target.checked
        : event.detail.value;
    if (column && column.type === "number") {
      // The number input hands back text; Salesforce wants a number (or nothing).
      value = value === "" || value === null ? null : Number(value);
    }
    draft.values = { ...draft.values, [field]: value };
    if (!draft.isNew) {
      if (sameValue(value, draft.original[field])) {
        draft.changed.delete(field);
      } else {
        draft.changed.add(field);
      }
    }
    this.drafts = [...this.drafts];
  }

  handleAdd() {
    const defaults =
      typeof this.newRowDefaults === "object" ? this.newRowDefaults : {};
    const position = this.drafts.length + 1;
    const record = { SortOrder__c: position };
    Object.keys(defaults).forEach((field) => {
      const value = defaults[field];
      record[field] =
        typeof value === "string" ? value.replace("{n}", position) : value;
    });
    this.drafts = [...this.drafts, this.draftFor(record, true)];
  }

  handleDelete(event) {
    const rowKey = event.currentTarget.dataset.rowKey;
    const draft = this.drafts.find((d) => d.key === rowKey);
    if (draft.isNew) {
      this.drafts = this.drafts.filter((d) => d !== draft);
      return;
    }
    this.dispatchEvent(
      new CustomEvent("delete", {
        detail: { recordId: draft.original.Id, name: draft.original.Name }
      })
    );
  }

  handleCancel() {
    this.drafts = this._rows.map((record) => this.draftFor(record, false));
  }

  handleSave() {
    const inputs = [
      ...this.template.querySelectorAll("lightning-input, lightning-combobox")
    ];
    const allValid = inputs.reduce(
      (ok, input) => input.reportValidity() && ok,
      true
    );
    if (!allValid) {
      return;
    }
    const timeFields = new Set(
      this.columns.filter((c) => c.type === "time").map((c) => c.fieldName)
    );
    const records = [];
    const weeksOff = [];
    const weeksBackOn = [];
    const offWeeks = this.offWeeks;
    this.drafts.forEach((draft) => {
      if (draft.isNew) {
        records.push(toRecord(this.objectApiName, draft.values, timeFields));
      } else if (draft.changed.size > 0) {
        const changes = { Id: draft.original.Id };
        draft.changed.forEach((field) => {
          changes[field] = draft.values[field];
        });
        records.push(toRecord(this.objectApiName, changes, timeFields));
      }
      const saved = this.savedOff(draft, offWeeks);
      this.weekChanges(draft, offWeeks).forEach((ticked, week) => {
        if (ticked) {
          weeksBackOn.push(...saved.get(week));
        } else if (draft.isNew) {
          weeksOff.push({ row: records.length - 1, week });
        } else {
          weeksOff.push({ target: draft.original.Id, week });
        }
      });
    });
    this.submitted = true;
    const onFailure = () => {
      this.submitted = false;
    };
    const detail = this.hasWeeks
      ? { records, weeksOff, weeksBackOn, onFailure }
      : { records, onFailure };
    this.dispatchEvent(new CustomEvent("save", { detail }));
  }
}

/** Salesforce sends times as milliseconds after midnight; the time field wants "09:00:00.000". */
export function timeText(value) {
  if (typeof value !== "number") {
    return value;
  }
  const pad = (n, size = 2) => String(n).padStart(size, "0");
  const hours = Math.floor(value / 3600000);
  const minutes = Math.floor((value % 3600000) / 60000);
  const seconds = Math.floor((value % 60000) / 1000);
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(value % 1000, 3)}`;
}

function sameValue(a, b) {
  const empty = (v) => v === undefined || v === null || v === "";
  return (empty(a) && empty(b)) || a === b;
}

/** Shapes a row for Apex: names the object, and gives times the zone marker Apex expects. */
function toRecord(objectApiName, values, timeFields) {
  const record = { sobjectType: objectApiName };
  Object.keys(values).forEach((field) => {
    let value = values[field];
    if (timeFields.has(field) && typeof value === "string" && value !== "") {
      value = apexTime(value);
    }
    record[field] = value === "" ? null : value;
  });
  return record;
}

/** "09:00" or "09:00:00.000" -> "09:00:00.000Z". */
function apexTime(value) {
  const [hours, minutes, rest] = value.replace("Z", "").split(":");
  const [seconds, millis] = (rest || "00").split(".");
  return `${hours}:${minutes}:${seconds}.${(millis || "000").padEnd(3, "0")}Z`;
}
