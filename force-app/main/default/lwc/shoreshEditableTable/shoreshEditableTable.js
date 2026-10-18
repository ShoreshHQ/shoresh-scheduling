import { LightningElement, api } from "lwc";
import { looseKey } from "c/shoreshImportEngine";
import { FIELD, OBJECT } from "c/shoreshSchema";

// Each object's fields, by the object's name as the package has it (a week's name gives
// the week fields).
const FIELDS_OF = Object.fromEntries(
  Object.keys(OBJECT).map((kind) => [OBJECT[kind], FIELD[kind]])
);
// Who an item is for: who can do an activity, or who a recurring activity covers.
const WHO_FIELDS = {
  [OBJECT.Activity]: FIELD.ActivityEligibility,
  [OBJECT.RecurringActivity]: FIELD.Coverage
};
const OFF = FIELD.WeekException;
const WEEK = FIELD.Week;
// The blank last row's key.
const ADD = "add";

/**
 * A table of records edited in place, saved as you go, like the desktop's setup tables (ADR
 * 0011; desktop DESIGN_STANDARD §6a "InlineAddRow"). The last row is always blank: typing there
 * and pressing Enter, the add button, or leaving the row adds it. A saved row's changes are saved
 * when the director presses Enter in it or leaves it; Escape puts it back as saved. One row is
 * saved at a time, in the order the director left them. A row someone else changed since it was
 * shown asks "Keep theirs" or "Use yours" (as Manual Build does, ADR 0008 §4).
 *
 * columns: [{ fieldName, label, type: 'text'|'number'|'date'|'time'|'checkbox'|'picklist', options,
 *   required, min, excludeSelf }]  (min: smallest number allowed, for number columns;
 *   excludeSelf: a picklist of records leaves out the row's own record; savedOnly: the blank row
 *   shows the value as text, not a field to change)
 * When the screen reloads after something else was saved, anything typed here and not yet
 * saved stays on screen.
 *
 * filterField / filterValue: show only rows whose filterField equals filterValue ("" means rows
 * where it is empty; no filterValue shows every row). The blank row always shows.
 *
 * weeks / weekExceptions / weeksHeading: with weeks and a heading (such as "Runs in"), each row
 * gets a tick per week, ticked unless a week exception names the row in that week. The blank
 * row starts with every week ticked. weekPhrase words each tick for screen readers ("runs in").
 *
 * A "who" column (type "who", fieldName: the child rows' relationship, such as Coverages__r,
 * options: the divisions and groups to choose from, everyone: what an empty choice means,
 * sourceLabel / selectedLabel: the picker's two list headings) shows
 * who each row covers, with a Change button that opens the same picker as activities' "Who can
 * do it" under the row. An empty choice means everyone.
 *
 * flagSameNames: a row whose name matches another row's, ignoring capitals and spacing (the
 *   import's looseKey, so it is what would make an import ask "Which ...?"), gets a small
 *   "Same name as another" dot (c/shoreshDot: its words on hover, focus, or tap, and to
 *   screen readers). Every row counts, hidden or blank-row typing. A heads-up only.
 * overlapLabel: a row whose StartDate__c to EndDate__c overlaps another row's gets the same dot
 *   with these words ("Overlaps another week", in the camp's words). A heads-up only.
 *   sameNameScope / sameNamesElsewhere: when rows can move to another scope (a group's
 *   division), a row is compared within the scope its values now name, and against
 *   sameNamesElsewhere[scope] (names in other scopes' tables, and names moving in from them).
 *
 * rowNotes / notesHeading: a read-only note per saved row (record Id -> text), in a last column.
 * draftNote / draftNoteHeading: a note worked out from a saved row's unsaved values,
 *   draftNote(values, original) -> text or null, shown in that column while it applies (instead
 *   of the row's saved note). Without notesHeading the column shows only while one applies.
 * rowActions: fixes offered in a saved row's note; each is a change to that row, saved at once.
 *
 * Fires:
 *   pendingnames { moved: { scope: [names] } } - with sameNameScope, whenever the saved rows
 *          switched to another scope (and not saved yet) change, so the screen can show those
 *          names to the other scopes' tables
 *   save   { record, seen, extras: { weeksOff, weeksBackOn, who }, seenWho, onSaved, onFailure,
 *          onDone } - one row: a new one with all its values, or a saved one with Id and changed
 *          fields only, and seen: those fields as the director saw them. weeksOff
 *          [{ target, week }, or { row: 0, week } for a new row], weeksBackOn [week exception
 *          Ids], who [{ target, targets }, or { row: 0, targets }]; seenWho: who it covered as
 *          seen, when who changed. The screen calls onSaved(result) with SetupTablesController
 *          .saveRow's answer, or onFailure() if it did not go through; then, once it has
 *          reloaded, onDone(), and the next row is sent.
 *   delete { recordId, name }
 *   merge  { recordIds } - with mergeLabel: the saved row asked about first, then the saved rows
 *          whose names match it (capitals and spacing aside)
 */
export default class ShoreshEditableTable extends LightningElement {
  @api title;
  @api objectApiName;
  /** The add button's name, and the blank row's name placeholder ("Add Bunk"). */
  @api addLabel = "Add";
  @api emptyMessage = "Nothing here yet.";
  @api busy = false;
  @api weeksHeading;
  @api weekPhrase = "runs in";
  @api notesHeading;
  @api rowNotes = {};
  @api flagSameNames = false;
  // Weeks: the tag for a row whose dates overlap another row's (StartDate__c to EndDate__c).
  @api overlapLabel;
  @api sameNameScope;
  @api sameNamesElsewhere = {};
  @api draftNote;
  @api draftNoteHeading;
  /** Fixes offered on saved rows: record Id -> [{ key, label, changes }]. */
  @api rowActions = {};
  /**
   * With flagSameNames: a button with this label ("Same location?") beside the tag of a saved
   * row whose saved name another saved row has; it asks the screen to merge them.
   */
  @api mergeLabel;
  /**
   * Optional: asked before a week is unticked on a saved row, ({ recordId, name, weekId,
   * weekName }) -> Promise<boolean>; false leaves the week ticked. The place for the desktop's
   * "Turn off … for Week 3?" when the week already has placements (PR #48).
   */
  @api beforeWeekOff;

  drafts = [];
  addRow = this.blankRow();
  // Row keys waiting to be saved, in order; and the one being saved.
  queue = [];
  sending = null;
  // Someone else changed a row being saved: the question shown.
  conflict = null;
  // Said to screen readers after each save.
  announcement = "";
  // Said once in the console when the screen names an object this table doesn't know.
  reportedUnknown = false;
  focusAddRow = false;
  _rows = [];
  _columns = [];
  _weeks = [];
  _weekExceptions = [];
  _defaults = {};

  /** Values the blank row starts with, such as the parent record and default numbers. */
  @api
  get newRowDefaults() {
    return this._defaults;
  }
  set newRowDefaults(value) {
    this._defaults = value && typeof value === "object" ? value : {};
    if (!this.addRow.dirty && !this.addRow.adding) {
      this.addRow = this.blankRow();
    }
  }

  /** The field the Show filter looks at (a location's type). */
  @api
  get filterField() {
    return this._filterField;
  }
  set filterField(value) {
    this._filterField = value;
  }

  /** Show only rows whose saved filterField is this ("" for none); the blank row starts with it. */
  @api
  get filterValue() {
    return this._filterValue;
  }
  set filterValue(value) {
    this._filterValue = value;
    if (!this.addRow.dirty && !this.addRow.adding) {
      this.addRow = this.blankRow();
    }
  }

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
    this.drafts = this.keepTyping(this._rows);
  }

  @api
  get columns() {
    return this._columns;
  }
  set columns(value) {
    this._columns = value || [];
    // The screen may hand over the columns again whenever it redraws; keep what was typed.
    this.drafts = this.keepTyping(this._rows);
    if (!this.addRow.dirty && !this.addRow.adding) {
      this.addRow = this.blankRow();
    }
  }

  @api
  get rows() {
    return this._rows;
  }
  set rows(value) {
    this._rows = value || [];
    this.drafts = this.keepTyping(this._rows);
  }

  // ---------- rows ----------

  /**
   * Rows for these records, carrying over any unsaved changes. A change is kept only where it
   * still differs from what is saved, so a row's own save clears it and later typing stays.
   */
  keepTyping(records) {
    const previous = new Map(this.drafts.map((d) => [d.key, d]));
    const offWeeks = this.offWeeks;
    return records.map((record) => {
      const draft = this.draftFor(record);
      const old = previous.get(draft.key);
      if (!old) {
        return draft;
      }
      const saved = this.savedOff(draft, offWeeks);
      old.weekTicks.forEach((ticked, week) => {
        if (ticked === saved.has(week)) {
          draft.weekTicks.set(week, ticked);
        }
      });
      if (!sameIds(old.who, draft.savedWho)) {
        draft.who = old.who;
        draft.seenWho = old.seenWho;
      }
      draft.whoOpen = old.whoOpen;
      draft.inFlight = old.inFlight;
      draft.refused = old.refused;
      old.changed.forEach((field) => {
        if (!sameValue(old.values[field], draft.original[field])) {
          draft.values[field] = old.values[field];
          draft.changed.add(field);
          draft.seen[field] = old.seen[field];
        }
      });
      return draft;
    });
  }

  draftFor(record) {
    const shown = this.shownValues(record);
    return {
      key: `row-${record.Id}`,
      original: shown,
      values: { ...shown },
      changed: new Set(),
      // What each changed field held when the director changed it.
      seen: {},
      // Unsaved week ticks: week Id -> ticked. Only differences from what is saved count.
      weekTicks: new Map(),
      // Who the row covers (division and group Ids), as saved and as chosen on screen.
      savedWho: this.whoOf(record),
      who: this.whoOf(record),
      seenWho: null,
      whoOpen: false,
      // The changes being saved right now (field -> value), while they are.
      inFlight: null,
      isNew: false
    };
  }

  /** The blank last row, with the screen's starting values. */
  blankRow() {
    const filtered =
      this._filterField && this._filterValue
        ? { [this._filterField]: this._filterValue }
        : {};
    return {
      key: ADD,
      original: {},
      values: this.shownValues({ ...(this._defaults || {}), ...filtered }),
      changed: new Set(),
      seen: {},
      weekTicks: new Map(),
      savedWho: [],
      who: [],
      seenWho: null,
      whoOpen: false,
      isNew: true,
      dirty: false,
      adding: false
    };
  }

  /** A record's values as the inputs show them (times as "09:00:00.000"). */
  shownValues(record) {
    const shown = { ...record };
    (this._columns || [])
      .filter((col) => col.type === "time")
      .forEach((col) => {
        shown[col.fieldName] = timeText(shown[col.fieldName]);
      });
    return shown;
  }

  rowFor(key) {
    return key === ADD ? this.addRow : this.drafts.find((d) => d.key === key);
  }

  /** Redraws after a row's values changed in place. */
  touch(draft) {
    if (draft.key === ADD) {
      this.addRow = { ...draft };
    } else {
      this.drafts = [...this.drafts];
    }
  }

  get whoColumn() {
    return this.columns.find((col) => col.type === "who");
  }

  whoOf(record) {
    const column = this.whoColumn;
    if (!column) {
      return [];
    }
    const who = WHO_FIELDS[this.objectApiName];
    if (!who) {
      return [];
    }
    return (record[column.fieldName] || []).map(
      (row) => row[who.Division] || row[who.Group]
    );
  }

  whoChanged(draft) {
    return !sameIds(draft.who, draft.savedWho);
  }

  /** Whether a saved row has anything to save. */
  hasChanges(draft, offWeeks = this.offWeeks) {
    return (
      draft.changed.size > 0 ||
      this.whoChanged(draft) ||
      this.weekChanges(draft, offWeeks).size > 0
    );
  }

  get hasRows() {
    return this.drafts.length > 0;
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

  get hasNotes() {
    return (
      !!this.notesHeading ||
      this.visibleDrafts.some((d) => !!this.draftNotes.get(d.key))
    );
  }

  /** Each saved row's draft note, worked out once per change (row key -> text). */
  get draftNotes() {
    if (this._notesFor !== this.drafts || this._notesFrom !== this.draftNote) {
      this._notesFor = this.drafts;
      this._notesFrom = this.draftNote;
      this._draftNotes = new Map(
        this.drafts.map((d) => [d.key, this.noteFromDraft(d)])
      );
    }
    return this._draftNotes;
  }

  get notesTitle() {
    return this.notesHeading || this.draftNoteHeading;
  }

  noteFromDraft(draft) {
    return typeof this.draftNote === "function"
      ? this.draftNote(draft.values, draft.original)
      : null;
  }

  /** Every column, for a row that spans the table (who picker, empty state). */
  get fullSpan() {
    return (
      this.columns.length +
      (this.hasWeeks ? this._weeks.length : 0) +
      (this.hasNotes ? 1 : 0) +
      1
    );
  }

  /** Row Id -> (week Id -> the week exception Ids saying the row does not run that week). */
  get offWeeks() {
    const result = new Map();
    this._weekExceptions.forEach((mark) => {
      const target =
        mark[OFF.Group] ||
        mark[OFF.Activity] ||
        mark[OFF.Location] ||
        mark[OFF.FixedActivity] ||
        mark[OFF.RecurringActivity];
      const weeks = result.get(target) || new Map();
      const week = mark[OFF.Week];
      weeks.set(week, [...(weeks.get(week) || []), mark.Id]);
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

  get visibleDrafts() {
    if (
      !this.filterField ||
      this.filterValue === undefined ||
      this.filterValue === null
    ) {
      return this.drafts;
    }
    // A row being changed stays until it is saved: changing its type mustn't hide it unsaved.
    const offWeeks = this.offWeeks;
    return this.drafts.filter(
      (draft) =>
        (draft.original[this.filterField] || "") === this.filterValue ||
        this.hasChanges(draft, offWeeks) ||
        draft.key === this.sending
    );
  }

  get hasVisibleRows() {
    return this.visibleDrafts.length > 0;
  }

  /**
   * The screen named an object this table doesn't know (none, not one of Shoresh's, or written
   * without the package's prefix): shown as an error, never edited or saved half-right.
   */
  get unknownObject() {
    return !FIELDS_OF[this.objectApiName];
  }

  renderedCallback() {
    if (this.unknownObject && !this.reportedUnknown) {
      this.reportedUnknown = true;
      console.error(
        `shoreshEditableTable: unknown object "${this.objectApiName}". Pass a name from c/shoreshSchema (OBJECT).`
      );
    }
    if (this.focusAddRow) {
      this.focusAddRow = false;
      this.focusRow(ADD);
    }
    if (this.focusAfterRefusal && !this.addRow.adding) {
      const from = this.focusAfterRefusal;
      this.focusAfterRefusal = null;
      const target = this.template.querySelector(
        from === "add"
          ? '[data-id="add"]'
          : `[data-row-key="${ADD}"][data-field="${from}"]`
      );
      if (target) {
        target.focus();
      }
    }
    if (this.focusAfterQuestion && !this.conflict) {
      // Back where the director was when the question came up.
      this.focusRow(this.focusAfterQuestion);
      this.focusAfterQuestion = null;
    }
    if (this.conflict && !this.conflictFocused) {
      this.conflictFocused = true;
      const keep = this.template.querySelector('[data-id="keep-theirs"]');
      if (keep) {
        keep.focus();
      }
    }
    this.reportMoves();
  }

  focusRow(key) {
    const first = this.template.querySelector(
      `[data-row-key="${key}"][data-field]`
    );
    if (first) {
      first.focus();
    }
  }

  reportMoves() {
    if (!this.sameNameScope) {
      return;
    }
    const field = this.sameNameScope;
    const moved = {};
    this.drafts.forEach((draft) => {
      const to = draft.values[field];
      if (to && to !== draft.original[field] && draft.values.Name) {
        moved[to] = [...(moved[to] || []), draft.values.Name];
      }
    });
    const signature = JSON.stringify(moved);
    if (signature !== this._movedSignature) {
      this._movedSignature = signature;
      this.dispatchEvent(
        new CustomEvent("pendingnames", { detail: { moved } })
      );
    }
  }

  /** Every row the flags look at: the saved rows and the blank row's typing. */
  get flaggedRows() {
    return this.addRow.dirty && !this.addRow.adding
      ? [...this.drafts, this.addRow]
      : this.drafts;
  }

  /** Keys of the rows whose name another row also has, in the same scope. */
  get sameNameKeys() {
    const same = new Set();
    if (!this.flagSameNames) {
      return same;
    }
    const scopeOf = (draft) => {
      return this.sameNameScope ? draft.values[this.sameNameScope] || "" : "";
    };
    const elsewhere = this.sameNamesElsewhere || {};
    const byName = new Map();
    this.flaggedRows.forEach((draft) => {
      const name = looseKey(draft.values.Name);
      if (!name) {
        return;
      }
      const scope = scopeOf(draft);
      const key = `${scope}|${name}`;
      byName.set(key, [...(byName.get(key) || []), draft.key]);
      if ((elsewhere[scope] || []).some((other) => looseKey(other) === name)) {
        same.add(draft.key);
      }
    });
    byName.forEach((keys) => {
      if (keys.length > 1) {
        keys.forEach((key) => same.add(key));
      }
    });
    return same;
  }

  /** Saved rows by their saved name (capitals and spacing aside), where two or more share it. */
  get savedNameMatches() {
    const byName = new Map();
    if (!this.mergeLabel) {
      return byName;
    }
    this.drafts.forEach((draft) => {
      const name = looseKey(draft.original.Name);
      if (name) {
        byName.set(name, [...(byName.get(name) || []), draft.original.Id]);
      }
    });
    byName.forEach((ids, name) => {
      if (ids.length < 2) {
        byName.delete(name);
      }
    });
    return byName;
  }

  /**
   * After "Same location?" closes: back to that row's button, or its first field once merged
   * (the blank row's if the row is gone).
   */
  @api
  focusRowOf(recordId) {
    const key = `row-${recordId}`;
    const button = this.template.querySelector(
      `[data-id="merge"][data-row-key="${key}"]`
    );
    if (button) {
      button.focus();
    } else {
      this.focusRow(this.rowFor(key) ? key : ADD);
    }
  }

  handleMerge(event) {
    const draft = this.rowFor(event.currentTarget.dataset.rowKey);
    const others = (
      this.savedNameMatches.get(looseKey(draft.original.Name)) || []
    ).filter((id) => id !== draft.original.Id);
    this.dispatchEvent(
      new CustomEvent("merge", {
        detail: { recordIds: [draft.original.Id, ...others] }
      })
    );
  }

  /** Keys of the rows whose dates overlap another row's, saved or being typed. */
  get overlapKeys() {
    const keys = new Set();
    if (!this.overlapLabel) {
      return keys;
    }
    // Only weeks are told apart by their dates.
    const start = (d) => d.values[WEEK.StartDate];
    const end = (d) => d.values[WEEK.EndDate];
    const dated = this.flaggedRows.filter((d) => start(d) && end(d));
    dated.forEach((a) => {
      if (
        dated.some((b) => b !== a && start(a) <= end(b) && start(b) <= end(a))
      ) {
        keys.add(a.key);
      }
    });
    return keys;
  }

  /**
   * What the table body shows: the saved rows (or, when there are none, the empty state), then
   * the blank row.
   */
  get bodyRows() {
    // Worked out once for every row drawn.
    const shared = {
      offWeeks: this.offWeeks,
      sameNames: this.sameNameKeys,
      overlaps: this.overlapKeys,
      matches: this.savedNameMatches
    };
    const rows = this.visibleDrafts.map((draft) =>
      this.tableRow(draft, shared)
    );
    if (rows.length === 0) {
      rows.push({
        key: "empty",
        isEmptyState: true,
        message: this.hasRows
          ? "Nothing to show with this choice."
          : this.emptyMessage
      });
    }
    return [...rows, this.tableRow(this.addRow, shared)];
  }

  /** The desktop's words while the blank row is being added. */
  get addText() {
    return this.addRow.adding ? "Adding…" : "Add";
  }

  get addDisabled() {
    return this.busy || this.addRow.adding || !this.complete(this.addRow);
  }

  tableRow(draft, { offWeeks, sameNames, overlaps, matches }) {
    const whoColumn = this.whoColumn;
    const notes = this.rowNotes || {};
    const mergeable =
      !draft.isNew &&
      sameNames.has(draft.key) &&
      matches.has(looseKey(draft.original.Name));
    const firstText = (this.columns.find((c) => this.isTextColumn(c)) || {})
      .fieldName;
    // A refused change still on screen, until it is saved or put back.
    const notSaved =
      !draft.isNew && !!draft.refused && this.hasChanges(draft, offWeeks);
    return {
      key: draft.key,
      isRow: true,
      whoKey: `${draft.key}-who`,
      whoOpen: !!whoColumn && draft.whoOpen,
      who: draft.who,
      whoOptions: whoColumn ? whoColumn.options : [],
      whoSource: whoColumn ? whoColumn.sourceLabel : "",
      whoSelected: whoColumn ? whoColumn.selectedLabel : "",
      whoLabel: whoColumn
        ? `${whoColumn.label}: ${draft.values.Name || ""}`.trim()
        : "",
      note: draft.isNew
        ? ""
        : this.draftNotes.get(draft.key) || notes[draft.original.Id] || "",
      actions: draft.isNew
        ? []
        : ((this.rowActions || {})[draft.original.Id] || []).map((action) => ({
            ...action,
            key: `${draft.key}-${action.key}`,
            name: action.key
          })),
      isNew: draft.isNew,
      rowClass: draft.isNew ? "add-row" : notSaved ? "not-saved" : "",
      notSaved,
      // The blank row is locked while it is being added, so nothing typed is lost or added twice.
      locked: draft.isNew && !!draft.adding,
      deleteLabel: `Delete ${draft.values.Name || ""}`.trim(),
      cells: this.columns.map((col) => {
        const value = draft.values[col.fieldName];
        if (col.savedOnly && draft.isNew) {
          const shown = (col.options || []).find((o) => o.value === value);
          return {
            key: `${draft.key}-${col.fieldName}`,
            fieldName: col.fieldName,
            isFixed: true,
            fixedText: shown ? shown.label : ""
          };
        }
        return {
          key: `${draft.key}-${col.fieldName}`,
          fieldName: col.fieldName,
          // The blank row's fields say what they add ("Add Bunk: Name"); a refused row's
          // fields say they aren't saved, read as the director tabs through them.
          label: draft.isNew
            ? `${this.addLabel}: ${col.label}`
            : notSaved
              ? `${col.label}, not saved`
              : col.label,
          // The blank row says what it is for in its first text field.
          placeholder:
            draft.isNew && col.fieldName === firstText ? this.addLabel : "",
          // The blank row never shows "Complete this field": its + stays greyed out instead.
          required: !!col.required && !draft.isNew,
          disabled: draft.isNew && !!draft.adding,
          options: col.excludeSelf
            ? (col.options || []).filter(
                (option) => !option.value || option.value !== draft.original.Id
              )
            : col.options,
          isText: this.isTextColumn(col),
          sameName: col.fieldName === "Name" && sameNames.has(draft.key),
          canMerge: col.fieldName === "Name" && mergeable,
          mergeLabel: this.mergeLabel,
          // Named for its row, so a screen reader can tell the buttons apart.
          mergeName: `${this.mergeLabel} ${draft.original.Name || ""}`.trim(),
          overlaps: col.fieldName === "Name" && overlaps.has(draft.key),
          overlapLabel: this.overlapLabel,
          isNumber: col.type === "number",
          min: col.min,
          isDate: col.type === "date",
          isTime: col.type === "time",
          isCheckbox: col.type === "checkbox",
          isPicklist: col.type === "picklist",
          isWho: col.type === "who",
          whoSummary:
            col.type === "who" ? this.whoSummary(col, draft) : undefined,
          whoButton: draft.whoOpen ? "Done" : "Change",
          // Named for its row, so a screen reader can tell the buttons apart.
          whoName: `${draft.whoOpen ? "Done" : "Change"}: ${col.label}, ${
            draft.values.Name || this.addLabel
          }`,
          value:
            col.type === "checkbox" || col.type === "who" ? undefined : value,
          checked: col.type === "checkbox" ? !!value : undefined
        };
      }),
      weekCells: this.weekCells(draft, offWeeks)
    };
  }

  isTextColumn(col) {
    return col.type === "text" || !col.type;
  }

  weekCells(draft, offWeeks) {
    if (!this.hasWeeks) {
      return [];
    }
    const saved = this.savedOff(draft, offWeeks);
    const name = draft.values.Name || this.addLabel;
    return this._weeks.map((week) => ({
      key: `${draft.key}-week-${week.Id}`,
      weekId: week.Id,
      checked: draft.weekTicks.has(week.Id)
        ? draft.weekTicks.get(week.Id)
        : !saved.has(week.Id),
      label: `${name} ${this.weekPhrase} ${week.Name}`
    }));
  }

  /** "Everyone", or the names chosen. */
  whoSummary(column, draft) {
    return this.whoNames(column, draft.who);
  }

  /** Names for these choices; with `known`, only those on screen (never a record Id). */
  whoNames(column, ids, known) {
    if (ids.length === 0) {
      return column.everyone || "Everyone";
    }
    const names = new Map(
      (column.options || []).map((option) => [option.value, option.label])
    );
    return ids
      .map((id) => names.get(id) || (known ? null : id))
      .filter((name) => name)
      .join(", ");
  }

  // ---------- typing ----------

  handleWhoToggle(event) {
    const draft = this.rowFor(event.currentTarget.dataset.rowKey);
    draft.whoOpen = !draft.whoOpen;
    this.touch(draft);
    if (!draft.whoOpen) {
      // Done: the choice is made.
      this.commit(draft.key, false);
    }
  }

  handleWhoChange(event) {
    const draft = this.rowFor(event.target.dataset.rowKey);
    if (!draft.isNew && draft.seenWho === null) {
      draft.seenWho = [...draft.savedWho];
    }
    draft.who = [...event.detail.value];
    draft.dirty = true;
    this.touch(draft);
  }

  /** A fix from the row's note: a change to that row, saved at once. */
  handleRowAction(event) {
    const { rowKey, action } = event.currentTarget.dataset;
    const draft = this.rowFor(rowKey);
    const chosen = (this.rowActions[draft.original.Id] || []).find(
      (a) => a.key === action
    );
    Object.keys(chosen.changes).forEach((field) => {
      this.setValue(draft, field, chosen.changes[field]);
    });
    this.touch(draft);
    this.commit(draft.key, false);
  }

  async handleTick(event) {
    const { rowKey, week } = event.target.dataset;
    const box = event.target;
    const ticked = box.checked;
    const draft = this.rowFor(rowKey);
    if (!draft.isNew && !ticked && typeof this.beforeWeekOff === "function") {
      // A question first (the desktop's "Turn off … for Week 3?" when it has placements).
      const weekName = (this._weeks.find((w) => w.Id === week) || {}).Name;
      const go = await this.beforeWeekOff({
        recordId: draft.original.Id,
        name: draft.values.Name,
        weekId: week,
        weekName
      });
      if (!go) {
        box.checked = true;
        this.touch(draft);
        return;
      }
    }
    draft.weekTicks = new Map(draft.weekTicks).set(week, ticked);
    draft.dirty = true;
    this.touch(draft);
    if (!draft.isNew) {
      // As on the desktop, a week tick on a saved row is saved the moment it is clicked.
      this.commit(draft.key, false);
    }
  }

  handleChange(event) {
    const { rowKey, field } = event.target.dataset;
    const draft = this.rowFor(rowKey);
    const column = this.columns.find((col) => col.fieldName === field);
    let value =
      event.target.type === "checkbox" || event.target.type === "toggle"
        ? event.target.checked
        : event.detail.value;
    if (column && column.type === "number") {
      // The number input hands back text; Salesforce wants a number (or nothing).
      value = value === "" || value === null ? null : Number(value);
    }
    this.setValue(draft, field, value);
    draft.dirty = true;
    this.touch(draft);
  }

  setValue(draft, field, value) {
    draft.values = { ...draft.values, [field]: value };
    if (draft.isNew) {
      return;
    }
    // While a change is being saved, it is what typing is compared with.
    const before =
      draft.inFlight && field in draft.inFlight
        ? draft.inFlight[field]
        : draft.original[field];
    if (!draft.changed.has(field)) {
      draft.seen[field] = before;
    }
    if (sameValue(value, before)) {
      draft.changed.delete(field);
      delete draft.seen[field];
    } else {
      draft.changed.add(field);
    }
    if (!this.hasChanges(draft)) {
      // Typed back to what is saved: nothing is left unsaved.
      draft.refused = false;
    }
  }

  /** Enter saves the row; Escape puts a saved row back as it was. */
  handleRowKeyDown(event) {
    const key = event.currentTarget.dataset.row;
    const from = event.target.tagName;
    if (event.key === "Enter" && from === "LIGHTNING-INPUT") {
      event.preventDefault();
      this.commit(key, true, event.target.dataset.field);
    } else if (
      event.key === "Escape" &&
      key !== ADD &&
      ["LIGHTNING-INPUT", "LIGHTNING-COMBOBOX"].includes(from) &&
      !event.defaultPrevented &&
      // Escape in a date or time field closes its picker; it doesn't undo the row.
      !["date", "time"].includes(event.target.type)
    ) {
      this.revert(key);
    }
  }

  /** Leaving a row (for anywhere outside it and its who picker) saves it. */
  handleRowLeave(event) {
    const key = event.currentTarget.dataset.row;
    const to = event.relatedTarget;
    const within =
      to && typeof to.closest === "function" ? to.closest("[data-row]") : null;
    if (within && within.dataset.row === key) {
      return;
    }
    this.commit(key, false);
  }

  handleAdd() {
    this.commit(ADD, true, "add");
  }

  revert(key) {
    const draft = this.rowFor(key);
    if (!draft || draft.isNew) {
      return;
    }
    draft.values = { ...draft.original };
    draft.changed = new Set();
    draft.seen = {};
    draft.weekTicks = new Map();
    draft.who = [...draft.savedWho];
    draft.seenWho = null;
    draft.refused = false;
    this.touch(draft);
  }

  handleDelete(event) {
    const draft = this.rowFor(event.currentTarget.dataset.rowKey);
    this.dispatchEvent(
      new CustomEvent("delete", {
        detail: { recordId: draft.original.Id, name: draft.original.Name }
      })
    );
  }

  // ---------- saving, one row at a time ----------

  /** Every required value filled in. */
  complete(draft) {
    return this.columns.every(
      (col) =>
        !col.required ||
        (col.savedOnly && draft.isNew) ||
        !isBlank(draft.values[col.fieldName])
    );
  }

  /** The row's inputs pass their own checks; shown under each field when `show`. */
  valid(key, show) {
    const inputs = [
      ...this.template.querySelectorAll(
        `lightning-input[data-row-key="${key}"], lightning-combobox[data-row-key="${key}"]`
      )
    ];
    return inputs.reduce((ok, input) => {
      const check = show ? input.reportValidity : input.checkValidity;
      return (typeof check === "function" ? check.call(input) : true) && ok;
    }, true);
  }

  /**
   * Queues the row for saving if it has something to save and can be saved. The blank row is
   * added only once it is filled in; leaving it half-typed keeps the typing, quietly (desktop).
   */
  commit(key, pressed, from) {
    const draft = this.rowFor(key);
    if (!draft || this.unknownObject) {
      return;
    }
    if (draft.isNew) {
      // Not filled in yet: nothing happens, and the + stays greyed out (desktop InlineAddRow).
      if (!draft.dirty || draft.adding || !this.complete(draft)) {
        return;
      }
      if (!this.valid(key, pressed)) {
        return;
      }
      draft.adding = true;
      draft.pressed = pressed;
      // Where the cursor was, to put it back if the add is refused (not after leaving the row).
      draft.from = pressed ? from : null;
      this.touch(draft);
    } else if (key === this.sending) {
      // Being saved: whether anything is left to save is known once the screen has reloaded.
    } else if (!this.hasChanges(draft) || !this.valid(key, true)) {
      return;
    }
    if (!this.queue.includes(key)) {
      this.queue = [...this.queue, key];
    }
    this.sendNext();
  }

  sendNext() {
    if (this.sending || this.conflict) {
      return;
    }
    while (this.queue.length) {
      const [key, ...rest] = this.queue;
      this.queue = rest;
      const draft = this.rowFor(key);
      if (draft && (draft.isNew ? draft.adding : this.hasChanges(draft))) {
        this.send(draft);
        return;
      }
    }
  }

  send(draft) {
    const timeFields = new Set(
      this.columns.filter((c) => c.type === "time").map((c) => c.fieldName)
    );
    const offWeeks = this.offWeeks;
    const extras = { weeksOff: [], weeksBackOn: [] };
    let record;
    let seen = null;
    let seenWho = null;
    const who = [];
    if (draft.isNew) {
      record = toRecord(
        this.objectApiName,
        { [this.sortField]: this.nextSortOrder, ...draft.values },
        timeFields
      );
      if (draft.who.length > 0) {
        who.push({ row: 0, targets: [...draft.who] });
      }
    } else {
      const changes = { Id: draft.original.Id };
      const before = {};
      draft.changed.forEach((field) => {
        changes[field] = draft.values[field];
        before[field] = draft.seen[field];
      });
      record = toRecord(this.objectApiName, changes, timeFields);
      seen = toRecord(this.objectApiName, before, timeFields);
      if (this.whoChanged(draft)) {
        who.push({ target: draft.original.Id, targets: [...draft.who] });
        seenWho = [...(draft.seenWho || draft.savedWho)];
      }
    }
    const saved = this.savedOff(draft, offWeeks);
    this.weekChanges(draft, offWeeks).forEach((ticked, week) => {
      if (ticked) {
        extras.weeksBackOn.push(...saved.get(week));
      } else if (draft.isNew) {
        extras.weeksOff.push({ row: 0, week });
      } else {
        extras.weeksOff.push({ target: draft.original.Id, week });
      }
    });
    if (this.whoColumn) {
      extras.who = who;
    }
    const sent = {
      changes: Object.fromEntries(
        [...draft.changed].map((field) => [field, draft.values[field]])
      ),
      who: seenWho ? [...draft.who] : null
    };
    this.sending = draft.key;
    draft.inFlight = draft.isNew ? null : sent.changes;
    this.dispatchEvent(
      new CustomEvent("save", {
        detail: {
          record,
          seen,
          extras,
          seenWho,
          onSaved: (result) => this.saved(draft.key, sent, result),
          onFailure: () => this.failed(draft.key),
          onDone: () => this.done()
        }
      })
    );
  }

  get sortField() {
    return FIELDS_OF[this.objectApiName].SortOrder;
  }

  /** After the last row: one more than the highest saved, so rows keep their order. */
  get nextSortOrder() {
    const orders = this.drafts
      .map((d) => d.original[this.sortField])
      .filter((n) => typeof n === "number");
    return orders.length ? Math.max(...orders) + 1 : this.drafts.length + 1;
  }

  saved(key, sent, result) {
    const answer = result || {};
    const draft = this.rowFor(key);
    if (answer.changed && answer.changed.length) {
      this.askAbout(key, answer);
      return;
    }
    if (answer.theirWho) {
      this.askAbout(key, answer);
      return;
    }
    if (key === ADD) {
      // The new row shows at once, as saved, until the screen reloads it.
      const values = { ...draft.values, Id: answer.id };
      const added = this.draftFor(values);
      added.original = { ...values };
      added.values = { ...values };
      this.drafts = [...this.drafts, added];
      this.announce(`${draft.values.Name || ""} added`.trim());
      // Its fields were locked while it was added, so nothing typed since is lost.
      this.addRow = this.blankRow();
      this.focusAddRow = !!draft.pressed;
      return;
    }
    if (draft) {
      draft.refused = false;
      // What was sent is saved now: typing since is compared with that, not with the old values.
      Object.keys(sent.changes).forEach((field) => {
        if (draft.changed.has(field)) {
          draft.seen[field] = sent.changes[field];
        }
      });
      if (sent.who) {
        draft.seenWho = sent.who;
      }
    }
    this.announce(`${(draft && draft.values.Name) || ""} saved`.trim());
  }

  /** Said again even when it is the same words as last time, so screen readers repeat it. */
  announce(text) {
    // Every other time with a trailing non-breaking space: the words read the same, but the
    // live region's text changes, so the same message is read again.
    this.announced = !this.announced;
    this.announcement = this.announced ? text : `${text}\u00a0`;
  }

  failed(key) {
    if (key === ADD) {
      // Refused: open again, with the cursor back where it was (the field, or the Add button).
      this.focusAfterRefusal = this.addRow.from;
      this.addRow = { ...this.addRow, adding: false };
      return;
    }
    // Refused: marked as not saved until it is saved or put back.
    const draft = this.rowFor(key);
    if (draft) {
      draft.refused = true;
      this.touch(draft);
    }
  }

  done() {
    const draft = this.rowFor(this.sending);
    if (draft) {
      draft.inFlight = null;
    }
    const was = this.sending;
    this.sending = null;
    // Only the blank row's own add unlocks it: one waiting its turn stays locked and goes next.
    if (was === ADD && this.addRow.adding) {
      this.addRow = { ...this.addRow, adding: false };
    }
    this.sendNext();
  }

  // ---------- someone else changed the row ----------

  askAbout(key, answer) {
    const draft = this.rowFor(key);
    const theirs = answer.theirs || {};
    const name = draft.values.Name || draft.original.Name || "";
    const rows = (answer.changed || []).map((field) => {
      const column = this.columns.find((c) => c.fieldName === field) || {
        fieldName: field,
        label: field
      };
      return {
        key: field,
        field,
        where: `${name} · ${column.label}`,
        theirsValue: theirs[field],
        yoursValue: draft.values[field],
        value: column.type === "time" ? timeText(theirs[field]) : theirs[field]
      };
    });
    if (answer.theirWho) {
      const column = this.whoColumn;
      rows.push({
        key: "who",
        where: `${name} · ${column.label}`,
        yours: this.whoNames(column, draft.who),
        theirWho: answer.theirWho
      });
    }
    this.conflictFocused = false;
    this.conflict = { key, rows };
  }

  /**
   * The question's rows. Who someone else chose is named from the choices on screen, which the
   * reload after the save brings up to date (a bunk they just added is named once it has).
   */
  get conflictRows() {
    const whoColumn = this.whoColumn;
    return this.conflict.rows.map((row) => {
      if (row.theirWho) {
        return { ...row, theirs: this.whoNames(whoColumn, row.theirWho, true) };
      }
      const column = this.columns.find((c) => c.fieldName === row.field) || {};
      return {
        ...row,
        theirs: shownValue(column, row.theirsValue),
        yours: shownValue(column, row.yoursValue)
      };
    });
  }

  /** Theirs stays; the director's other changes to the row are still saved. */
  handleKeepTheirs() {
    const { key, rows } = this.conflict;
    const draft = this.rowFor(key);
    if (draft) {
      rows.forEach((row) => {
        if (row.theirWho) {
          draft.who = [...row.theirWho];
          draft.seenWho = null;
        } else {
          draft.values = { ...draft.values, [row.field]: row.value };
          draft.changed.delete(row.field);
          delete draft.seen[row.field];
        }
      });
      this.touch(draft);
    }
    this.closeConflict(key);
  }

  /** The same change again, naming what is there now. */
  handleUseYours() {
    const { key, rows } = this.conflict;
    const draft = this.rowFor(key);
    if (draft) {
      rows.forEach((row) => {
        if (row.theirWho) {
          draft.seenWho = [...row.theirWho];
        } else {
          draft.seen[row.field] = row.value;
          draft.changed.add(row.field);
        }
      });
      this.touch(draft);
    }
    this.closeConflict(key);
  }

  /** As Manual Build's question: Escape keeps theirs, and Tab stays on its two buttons. */
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

  closeConflict(key) {
    this.conflict = null;
    this.focusAfterQuestion = key;
    if (!this.queue.includes(key)) {
      this.queue = [key, ...this.queue];
    }
    this.sendNext();
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

/** A value as the director reads it: a choice's name, Yes or No, a clock time. */
function shownValue(column, value) {
  if (isBlank(value)) {
    return column.type === "checkbox" ? "No" : "None";
  }
  if (column.type === "checkbox") {
    return value ? "Yes" : "No";
  }
  if (column.type === "picklist") {
    // A choice someone else just added is named once the reload brings it; never its Id.
    const option = (column.options || []).find((o) => o.value === value);
    return option ? option.label : "None";
  }
  if (column.type === "date") {
    // "Sat, Jul 3, 2027", as a camp director reads a date.
    const [y, m, d] = String(value).split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  }
  if (column.type === "time") {
    const [hours, minutes] = timeText(value).split(":").map(Number);
    const hour = hours % 12 || 12;
    return `${hour}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
  }
  return String(value);
}

function isBlank(value) {
  return value === undefined || value === null || value === "";
}

function sameValue(a, b) {
  return (isBlank(a) && isBlank(b)) || a === b;
}

function sameIds(a, b) {
  const set = new Set(b);
  return a.length === set.size && a.every((id) => set.has(id));
}

/** Shapes a row for Apex: names the object, and gives times the zone marker Apex expects. */
function toRecord(objectApiName, values, timeFields) {
  const record = { sobjectType: objectApiName };
  Object.keys(values).forEach((field) => {
    let value = values[field];
    if (timeFields.has(field) && typeof value === "string" && value !== "") {
      value = apexTime(value);
    }
    record[field] = value === "" || value === undefined ? null : value;
  });
  return record;
}

/** "09:00" or "09:00:00.000" -> "09:00:00.000Z". */
function apexTime(value) {
  const [hours, minutes, rest] = value.replace("Z", "").split(":");
  const [seconds, millis] = (rest || "00").split(".");
  return `${hours}:${minutes}:${seconds}.${(millis || "000").padEnd(3, "0")}Z`;
}
