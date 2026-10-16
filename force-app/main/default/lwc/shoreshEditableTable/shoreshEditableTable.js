import { LightningElement, api } from "lwc";

/**
 * A small table of records edited in place. Changes stay on screen until the scheduler
 * presses Save; nothing is saved behind their back.
 *
 * columns: [{ fieldName, label, type: 'text'|'date'|'time'|'checkbox'|'picklist', options, required }]
 * Fires:
 *   save   { records } - new rows with all values, existing rows with Id and changed fields only
 *   delete { recordId, name }
 */
export default class ShoreshEditableTable extends LightningElement {
  @api title;
  @api objectApiName;
  @api addLabel = "Add";
  @api emptyMessage = "Nothing here yet.";
  /** Values every new row starts with, such as the parent record and a default name. */
  @api newRowDefaults = {};
  @api busy = false;

  drafts = [];
  nextKey = 0;
  _rows = [];
  _columns = [];

  @api
  get columns() {
    return this._columns;
  }
  set columns(value) {
    this._columns = value || [];
    // Column types decide how values are shown (times), so rebuild the rows.
    this.drafts = this._rows.map((record) => this.draftFor(record, false));
  }

  @api
  get rows() {
    return this._rows;
  }
  set rows(value) {
    this._rows = value || [];
    // Fresh data from the server replaces anything typed, saved or not.
    this.drafts = this._rows.map((record) => this.draftFor(record, false));
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
      isNew
    };
  }

  get hasRows() {
    return this.drafts.length > 0;
  }

  get isDirty() {
    return this.drafts.some((d) => d.isNew || d.changed.size > 0);
  }

  get saveDisabled() {
    return this.busy || !this.isDirty;
  }

  get cancelDisabled() {
    return this.busy || !this.isDirty;
  }

  get tableRows() {
    return this.drafts.map((draft) => ({
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
          options: col.options,
          isText: col.type === "text" || !col.type,
          isDate: col.type === "date",
          isTime: col.type === "time",
          isCheckbox: col.type === "checkbox",
          isPicklist: col.type === "picklist",
          value: col.type === "checkbox" ? undefined : value,
          checked: col.type === "checkbox" ? !!value : undefined
        };
      })
    }));
  }

  handleChange(event) {
    const { rowKey, field } = event.target.dataset;
    const draft = this.drafts.find((d) => d.key === rowKey);
    const value =
      event.target.type === "checkbox" || event.target.type === "toggle"
        ? event.target.checked
        : event.detail.value;
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
    const record = { ...defaults, SortOrder__c: this.drafts.length + 1 };
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
    const records = [];
    this.drafts.forEach((draft) => {
      if (draft.isNew) {
        records.push(toRecord(this.objectApiName, draft.values));
      } else if (draft.changed.size > 0) {
        const changes = { Id: draft.original.Id };
        draft.changed.forEach((field) => {
          changes[field] = draft.values[field];
        });
        records.push(toRecord(this.objectApiName, changes));
      }
    });
    this.dispatchEvent(new CustomEvent("save", { detail: { records } }));
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
function toRecord(objectApiName, values) {
  const record = { sobjectType: objectApiName };
  Object.keys(values).forEach((field) => {
    let value = values[field];
    if (
      typeof value === "string" &&
      /^\d{2}:\d{2}(:\d{2}(\.\d{3})?)?$/.test(value)
    ) {
      value = `${value.length === 5 ? `${value}:00.000` : value.length === 8 ? `${value}.000` : value}Z`;
    }
    if (value === "") {
      value = null;
    }
    record[field] = value;
  });
  return record;
}
