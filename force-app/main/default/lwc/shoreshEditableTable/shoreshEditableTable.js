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
// The weeks in words, as the mock-up writes them (docs/design/setup/groups.html).
const WEEK_WORDS = {
  every: "Every week",
  none: "No weeks",
  off: "Off",
  one: "Wk",
  many: "Wks"
};
// Each kind of column's width (rem); the name and words columns share what is left.
const WIDTHS = {
  number: 6.5,
  picklist: 11,
  time: 8.5,
  date: 10,
  checkbox: 5,
  who: 14,
  often: 9,
  days: 11
};
// A shared column's least room (rem), unless the column says (minWidth).
const SHARED_MIN = 12;
// Short day names, as the mock-up writes them ("Mon Wed Fri", "Off Fri").
const SHORT_DAYS = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun"
};

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
 *   excludeSelf: a picklist of records leaves out the row's own record; optionsFor(saved): the
 *   choices one row offers, from its saved record ({} for the blank row), where they differ by
 *   row (an outdoor rain plan only where it is held); options still names every value;
 *   savedOnly: the blank row shows the value as text, not a field to change)
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
 * shows who each row covers, with a Change button that opens a list of ticks under the row, as
 * activities' "Who can do it" and the desktop's (FixedEventsScreen.jsx "Age Divisions" ticks).
 * An empty choice means everyone.
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
 * The shared table pattern (ADR 0015 choice 11; docs/design/setup/): rows sit raised, one under
 * another, their fields reading as words until the pointer or the cursor is on the row; a
 * section's heading names it with its count (heading), never a repeated column; the weeks are
 * the exception in words with a strip of ticks in their place on hover or edit; the blank row is
 * dashed; the row's end holds its delete and the chevron that opens its details.
 *
 * heading: the section's name ("Juniors"), shown with how many rows it shows. Without it the
 *   table's title is only read out. showColumns: the column names show above the rows (the
 *   first section of a screen); otherwise they are read out only.
 * A column with more: true is one of the row's details, not a column: it shows, with its label,
 *   under the row when its chevron opens them, and is saved with the row. type "readonly": words
 *   worked out from the saved row (textFor(saved)), never edited or sent.
 * weekWords: { every, none, off, one, many } - the weeks in words ("Every week", "No weeks",
 *   "Off Wk 3", "Off Wks 6–7"); a place says "Closed".
 * Step 3b (ADR 0015 choice 12) adds three kinds of column. type "often" (fieldName: at least,
 *   maxField: at most, noMaxField, minLabel, maxLabel, scale): bars at rest, scaled to scale (the
 *   camp's highest weekly count), the two numbers in their place on hover or edit. type "days"
 *   (days: [{ fieldName, label }], every, none): "Every day" quiet, "Mon Wed Fri" or "Off Fri" a
 *   value, a tick per day on hover or edit, saved with the row. A readonly column's
 *   exceptionFor(saved) makes its words a value rather than quiet. rowFilter / whoRule /
 *   newRowWho: sections a field can't name (a recurring activity's division, from who it covers).
 *   With detailsLabel, the row's end holds a chevron that asks the page to open its details
 *   beside the table; the row whose details are open carries the 2 px selection line.
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
 *   delete { recordId, name, onDeleted } - the screen calls onDeleted() once the row is deleted
 *          and the season read again; the table then says "Deleted <name>" and moves the
 *          cursor to the next row (else the one above, else the blank row)
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
  /**
   * Optional: a button with this label ("Details") on each saved row that asks the screen to
   * open the row's details (the desktop's row Edit, ActivitiesScreen.jsx). detailsOpenFor: the
   * record whose details are open, so its button says so (aria-expanded).
   */
  @api detailsLabel;
  @api detailsOpenFor;
  /** The section this table is: its name, shown with its count. */
  @api heading;
  /** The column names show above the rows (else they are read out only). */
  @api showColumns = false;
  /**
   * Optional: which saved rows this section shows, (record, who) -> boolean, for sections a
   * field can't name (a recurring activity's division, from who it covers). Every row is still
   * handed over, so names and order are compared across the sections.
   */
  @api rowFilter;
  /**
   * Optional, with a who column: the choice that is this section's rule, read quietly
   * ({ ids, words }: a division's section, [division], "Every bunk"); anything else is a value.
   */
  @api whoRule;
  /**
   * The weeks column's widest (rem): a long season's strip wraps rather than squeeze the other
   * columns. Narrower where a panel shares the screen (Activities' details).
   */
  @api weeksMax = 20;

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
  // Where the cursor goes once it is on the page (takeFocus): { key, field }.
  focusTaken = null;
  _rows = [];
  _columns = [];
  _weeks = [];
  _weekExceptions = [];
  _defaults = {};
  _weekWords = WEEK_WORDS;

  /** The weeks in words: { every, none, off, one, many }. */
  @api
  get weekWords() {
    return this._weekWords;
  }
  set weekWords(value) {
    this._weekWords = { ...WEEK_WORDS, ...(value || {}) };
  }

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

  /** Who the blank row starts covering (a division's section: that division). */
  @api
  get newRowWho() {
    return this._newRowWho || [];
  }
  set newRowWho(value) {
    this._newRowWho = Array.isArray(value) ? value : [];
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
      // Only a choice made here and not saved yet is kept; a section that never changed the
      // row takes who the reload says (another section's table may have changed it).
      if (
        !sameIds(old.who, old.savedWho) &&
        !sameIds(old.who, draft.savedWho)
      ) {
        draft.who = old.who;
        draft.seenWho = old.seenWho;
      }
      draft.whoOpen = old.whoOpen;
      draft.moreOpen = old.moreOpen;
      // A question about this row is still open (its strip stays shown for focus to return).
      draft.asking = old.asking;
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
      moreOpen: false,
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
      who: [...(this._newRowWho || [])],
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

  /**
   * Every field a row edits, as a column of its own: "how often" is two numbers (at least, at
   * most) and "days" one tick per day, each named as the director reads it.
   */
  get fieldColumns() {
    return this.columns.flatMap((col) => {
      if (col.type === "often") {
        return [
          { ...col, type: "number", label: col.minLabel || col.label },
          {
            fieldName: col.maxField,
            label: col.maxLabel || col.label,
            type: "number",
            min: col.min
          }
        ];
      }
      if (col.type === "days") {
        return (col.days || []).map((day) => ({
          fieldName: day.fieldName,
          label: day.label,
          type: "checkbox"
        }));
      }
      return [col];
    });
  }

  fieldColumn(field) {
    return this.fieldColumns.find((col) => col.fieldName === field);
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

  /** The columns shown in the row; the rest (more) open under it. */
  get mainColumns() {
    return this.columns.filter((col) => !col.more);
  }

  get moreColumns() {
    return this.columns.filter((col) => col.more);
  }

  /** A section after the first stands a step apart from the one above. */
  get sectionClass() {
    return this.heading && !this.showColumns
      ? "section section_apart"
      : "section";
  }

  /** How many rows the section shows (its heading's count). */
  get shownCount() {
    return this.visibleDrafts.length;
  }

  /** Each column's width in rem, or null for the name and words columns (they share the rest). */
  get widths() {
    const widths = this.mainColumns.map((col) => ({
      key: `col-${col.fieldName}`,
      rem: col.width || WIDTHS[col.type] || null,
      least: col.minWidth || SHARED_MIN
    }));
    if (this.hasWeeks) {
      // Room for the strip: one fine tick per week, or the words. At most 20rem: a long
      // season's strip wraps rather than squeeze the name.
      widths.push({
        key: "col-weeks",
        rem: Math.min(
          Number(this.weeksMax) || 20,
          Math.max(9, this._weeks.length * 1.625 + 1)
        )
      });
    }
    if (this.hasNotes) {
      widths.push({ key: "col-notes", rem: 14 });
    }
    widths.push({ key: "col-end", rem: 5.5 });
    return widths;
  }

  get cols() {
    return this.widths.map(({ key, rem }) => ({ key, style: widthStyle(rem) }));
  }

  /**
   * Never narrower than its fixed columns plus room for a name (12rem each shared column): a
   * table with more columns than its screen has room for scrolls inside itself, never squeezes
   * a name to nothing.
   */
  get tableStyle() {
    const rem = this.widths.reduce(
      (sum, w) => sum + (w.rem || w.least || SHARED_MIN),
      0
    );
    return `min-width: ${rem}rem`;
  }

  /** The column names, read out with every cell (shown only with showColumns). */
  get headers() {
    const headers = this.mainColumns.map((col) => ({
      key: `head-${col.fieldName}`,
      label: col.label,
      className: `th th_${col.type || "text"}`
    }));
    if (this.hasWeeks) {
      headers.push({
        key: "head-weeks",
        label: this.weeksHeading,
        className: "th th_weeks",
        dataId: "weeks-heading"
      });
    }
    if (this.hasNotes) {
      headers.push({
        key: "head-notes",
        label: this.notesTitle,
        className: "th"
      });
    }
    headers.push({
      key: "head-end",
      label: "Actions",
      className: "th th_end"
    });
    return headers;
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
      this.mainColumns.length +
      (this.hasWeeks ? 1 : 0) +
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
    const byField =
      !!this.filterField &&
      this.filterValue !== undefined &&
      this.filterValue !== null;
    const byRule = typeof this.rowFilter === "function";
    if (!byField && !byRule) {
      return this.drafts;
    }
    // A row being changed stays until it is saved: changing its type mustn't hide it unsaved.
    const offWeeks = this.offWeeks;
    return this.drafts.filter(
      (draft) =>
        ((!byField ||
          (draft.original[this.filterField] || "") === this.filterValue) &&
          (!byRule || this.rowFilter(draft.original, draft.savedWho))) ||
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
    if (this.focusAfterDelete && !this.rowFor(this.focusAfterDelete.key)) {
      const { index } = this.focusAfterDelete;
      this.focusAfterDelete = null;
      const visible = this.visibleDrafts;
      const next = visible[index] || visible[index - 1];
      this.focusRow(next ? next.key : ADD);
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
    this.applyTakenFocus();
    this.reportMoves();
    this.announceDraftNotes();
  }

  /**
   * A note worked out from typing ("Moves to Seniors: …") is read out once, in the table's one
   * live region, when it appears or changes. Each row's note cell is not its own live region, so
   * a reload never reads every note at once.
   */
  announceDraftNotes() {
    const notes = this.draftNotes;
    if (notes === this.notesHeard) {
      return;
    }
    const before = this.notesHeard;
    this.notesHeard = notes;
    if (!before) {
      return;
    }
    const fresh = [...notes].find(
      ([key, note]) => note && before.get(key) !== note
    );
    if (fresh) {
      this.announce(fresh[1]);
    }
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

  /** Whether this table shows the record's row (a section shows only its own). */
  @api
  showsRow(recordId) {
    return this.visibleDrafts.some((d) => d.original.Id === recordId);
  }

  /**
   * Where the cursor is, when it is in one of this table's saved rows: { recordId, field,
   * inDetails }. The screen asks as a row is saved, so the cursor can follow a row that the
   * save moves to another section (a place whose type changed; WCAG 2.4.3).
   */
  @api
  focusedRow() {
    const active = this.template.activeElement;
    const tr =
      active && typeof active.closest === "function"
        ? active.closest("[data-row]")
        : null;
    const draft = tr ? this.rowFor(tr.dataset.row) : null;
    if (!draft || draft.isNew) {
      return null;
    }
    return {
      recordId: draft.original.Id,
      field: active.dataset.field,
      inDetails: !!active.closest("[data-more-row]")
    };
  }

  /**
   * A row moved here from another section while it held the cursor: the cursor goes to the same
   * field in it (its details open again if that is where the cursor was), else to the row's
   * first field, else, when this table doesn't show the row, to the blank row. Said aloud.
   */
  @api
  takeFocus(recordId, field, inDetails, words) {
    const draft = this.rowFor(`row-${recordId}`);
    const visible = !!draft && this.visibleDrafts.includes(draft);
    this.focusTaken = visible ? { key: draft.key, field } : { key: ADD };
    if (words) {
      this.announce(words);
    }
    if (visible && inDetails && this.moreColumns.length && !draft.moreOpen) {
      // Once its details are drawn.
      draft.moreOpen = true;
      this.touch(draft);
    } else {
      this.applyTakenFocus();
    }
  }

  /** The cursor goes where takeFocus said, once that field is on the page. */
  applyTakenFocus() {
    if (!this.focusTaken) {
      return;
    }
    const { key, field } = this.focusTaken;
    const target =
      (field &&
        this.template.querySelector(
          `[data-row-key="${key}"][data-field="${field}"]`
        )) ||
      this.template.querySelector(`[data-row-key="${key}"][data-field]`);
    if (target) {
      this.focusTaken = null;
      target.focus();
    }
  }

  /** After the row's details close: back to its Details button. */
  @api
  focusDetailsOf(recordId) {
    const button = this.template.querySelector(
      `[data-id="details"][data-row-key="row-${recordId}"]`
    );
    if (button) {
      button.focus();
    }
  }

  handleDetails(event) {
    const draft = this.rowFor(event.currentTarget.dataset.rowKey);
    if (draft && !draft.isNew) {
      this.dispatchEvent(
        new CustomEvent("details", { detail: { recordId: draft.original.Id } })
      );
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
    // A section a rule picks (rowFilter) with none of its own shows just its blank row; only the
    // first says the list is empty, once, when nothing is set up at all.
    const quiet =
      typeof this.rowFilter === "function" &&
      (this.hasRows || !this.showColumns);
    if (rows.length === 0 && !quiet) {
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

  /** Its spoken name: "Add Bunk", and "Adding Bunk…" while it is being added. */
  get addName() {
    return this.addRow.adding
      ? `${this.addLabel.replace(/^Add\b/, "Adding")}…`
      : this.addLabel;
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
    const hasMore = !draft.isNew && this.moreColumns.length > 0;
    const moreOpen = hasMore && !!draft.moreOpen;
    const name = draft.values.Name || "";
    // A field's name for screen readers: what the blank row adds, or that a refused row's
    // change isn't saved, read as the director tabs through.
    const named = (label) => {
      if (draft.isNew) {
        return `${this.addLabel}: ${label}`;
      }
      return notSaved ? `${label}, not saved` : label;
    };
    const cell = (col) => {
      const value = draft.values[col.fieldName];
      const className = `cell cell_${col.type || "text"} shoresh-cell${
        col.fieldName === "Name" ? " shoresh-name" : ""
      }`;
      if (col.type === "readonly") {
        const saved = draft.isNew ? {} : draft.original || {};
        // The rule reads quietly; an exception (exceptionFor) is a value.
        const exception = !!col.exceptionFor && !!col.exceptionFor(saved);
        return {
          key: `${draft.key}-${col.fieldName}`,
          fieldName: col.fieldName,
          className,
          isReadonly: true,
          fixedClass: exception ? "fixed exception" : "fixed",
          fixedText: col.textFor ? col.textFor(saved) || "" : ""
        };
      }
      if (col.type === "often") {
        return this.oftenCell(col, draft, className, named);
      }
      if (col.type === "days") {
        return this.daysCell(col, draft, className, named);
      }
      if (col.savedOnly && draft.isNew) {
        const shown = (col.options || []).find((o) => o.value === value);
        return {
          key: `${draft.key}-${col.fieldName}`,
          fieldName: col.fieldName,
          className,
          isFixed: true,
          fixedText: shown ? shown.label : ""
        };
      }
      return {
        key: `${draft.key}-${col.fieldName}`,
        fieldName: col.fieldName,
        className: col.more
          ? `more-field more-field_${col.type || "text"}`
          : className,
        // The blank row's fields say what they add ("Add Bunk: Name"); a refused row's
        // fields say they aren't saved, read as the director tabs through them.
        label: named(col.label),
        // The blank row says what it is for in its first text field.
        placeholder:
          draft.isNew && col.fieldName === firstText ? this.addLabel : "",
        isAddName: draft.isNew && col.fieldName === firstText,
        // The blank row never shows "Complete this field": its + stays greyed out instead.
        required: !!col.required && !draft.isNew,
        disabled: draft.isNew && !!draft.adding,
        options: this.rowOptions(col, draft),
        // A choice not made reads as the column's name, quietly, never "Select an Option".
        pickPlaceholder: col.label,
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
        whoClass:
          col.type === "who" && !this.whoIsRule(draft)
            ? "who exception"
            : "who",
        whoButton: draft.whoOpen ? "Done" : "Change",
        // Named for its row, so a screen reader can tell the buttons apart.
        whoName: `${draft.whoOpen ? "Done" : "Change"}: ${col.label}, ${
          name || this.addLabel
        }`,
        value: this.shownChoice(col, draft, value),
        checked: col.type === "checkbox" ? !!value : undefined
      };
    };
    const weekCells = this.weekCells(draft, offWeeks);
    const weeks = this.weeksInWords(weekCells);
    const selected = !draft.isNew && draft.original.Id === this.detailsOpenFor;
    return {
      key: draft.key,
      isRow: true,
      whoKey: `${draft.key}-who`,
      whoOpen: !!whoColumn && draft.whoOpen,
      who: draft.who,
      whoOptions: whoColumn ? whoColumn.options : [],
      // The ticks' label: whose they are, and "everyone" while none is ticked.
      whoLabel: whoColumn
        ? `${whoColumn.label}: ${name}${
            draft.who.length === 0 ? ` (${this.whoNames(whoColumn, [])})` : ""
          }`
        : "",
      hasDetails: !!this.detailsLabel && !draft.isNew,
      detailsName: `${name} details`.trim(),
      detailsOpen: selected ? "true" : "false",
      detailsGlyphClass: selected ? "shoresh-glyph turned" : "shoresh-glyph",
      // The row's own details (its more columns), opened from its chevron.
      hasMore,
      moreOpen,
      moreOpenText: moreOpen ? "true" : "false",
      moreKey: `${draft.key}-more`,
      moreName: `${name} details`.trim(),
      moreGlyphClass: moreOpen ? "shoresh-glyph turned" : "shoresh-glyph",
      moreCells: moreOpen ? this.moreColumns.map(cell) : [],
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
      rowClass: [
        "row shoresh-row",
        draft.isNew ? "add-row" : "",
        notSaved ? "not-saved" : "",
        moreOpen ? "row_open" : "",
        // Its details are open beside the table: the 2 px selection line (activities.html).
        selected ? "row_selected" : "",
        draft.asking ? "row_asking" : ""
      ]
        .filter((c) => c)
        .join(" "),
      notSaved,
      // The blank row is locked while it is being added, so nothing typed is lost or added twice.
      locked: draft.isNew && !!draft.adding,
      deleteLabel: `Delete ${name}`.trim(),
      cells: this.mainColumns.map(cell),
      weekCells,
      weeksText: weeks.text,
      weeksTextClass: weeks.exception ? "weeks-text exception" : "weeks-text",
      weeksName: `${name || this.addLabel}: ${this.weeksHeading || ""}`.trim()
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
    return this._weeks.map((week, index) => ({
      key: `${draft.key}-week-${week.Id}`,
      weekId: week.Id,
      number: index + 1,
      checked: draft.weekTicks.has(week.Id)
        ? draft.weekTicks.get(week.Id)
        : !saved.has(week.Id),
      label: `${name} ${this.weekPhrase} ${week.Name}`
    }));
  }

  /**
   * The weeks as the exception, in words: "Every week" (the rule, quiet), "Off Wk 3" or
   * "Off Wks 1, 6–7" (the weeks it is off, by their place in the season), "No weeks".
   */
  weeksInWords(cells) {
    const words = this._weekWords;
    const off = cells.filter((c) => !c.checked).map((c) => c.number);
    if (off.length === 0) {
      return { text: words.every, exception: false };
    }
    if (off.length === cells.length) {
      return { text: words.none, exception: true };
    }
    return {
      text: `${words.off} ${off.length > 1 ? words.many : words.one} ${ranges(off)}`,
      exception: true
    };
  }

  /** The section's rule in its words ("Every bunk"), "Everyone", or the names chosen. */
  whoSummary(column, draft) {
    const rule = this.whoRule;
    if (rule && sameIds(draft.who, rule.ids || [])) {
      return rule.words;
    }
    return this.whoNames(column, draft.who);
  }

  /** Whether the row covers who it would by default: everyone, or its section's rule. */
  whoIsRule(draft) {
    const rule = this.whoRule;
    return rule ? sameIds(draft.who, rule.ids || []) : draft.who.length === 0;
  }

  /**
   * "How often": bars at rest, scaled to the camp's highest weekly count (column scale), never
   * capped at five (decision 42); the two numbers in their place under the pointer or while the
   * row is edited. At least is filled, up to at most is a tint, the rest empty slots.
   */
  oftenCell(col, draft, className, named) {
    const min = draft.values[col.fieldName];
    const max = draft.values[col.maxField];
    const noMax = !!col.noMaxField && !!draft.values[col.noMaxField];
    const least = Number(min) || 0;
    const most = noMax ? least : Math.max(Number(max) || 0, least);
    const scale = Math.max(Number(col.scale) || 1, least, most);
    const bars = [];
    for (let i = 1; i <= scale; i += 1) {
      const kind =
        i <= least ? " bar_min" : noMax || i <= most ? " bar_max" : "";
      bars.push({ key: `${draft.key}-bar-${i}`, className: `bar${kind}` });
    }
    let words = isBlank(min) ? "" : `${least}`;
    if (!isBlank(min) && noMax) {
      words = `${least} or more`;
    } else if (!isBlank(min) && most > least) {
      words = `${least}–${most}`;
    }
    return {
      key: `${draft.key}-${col.fieldName}`,
      fieldName: col.fieldName,
      className,
      isOften: true,
      // The blank row is typed in, so it shows its numbers, not bars.
      showBars: !draft.isNew,
      oftenClass: draft.isNew ? "often often_open" : "often",
      bars,
      oftenName: `${col.label}: ${words}`.trim(),
      value: min,
      maxValue: max,
      maxField: col.maxField,
      minLabel: named(col.minLabel || col.label),
      maxLabel: named(col.maxLabel || col.label),
      min: col.min,
      required: !!col.required && !draft.isNew,
      disabled: draft.isNew && !!draft.adding
    };
  }

  /**
   * The days, as the weeks: every day is the rule, read quietly ("Every day"); otherwise the
   * days it runs ("Mon Wed Fri"), or the one it skips ("Off Fri"). Under the pointer or while the
   * row is edited, one tick per day in their place, saved with the row.
   */
  daysCell(col, draft, className, named) {
    const days = col.days || [];
    const short = (day) => day.short || SHORT_DAYS[day.label] || day.label;
    const on = days.filter((day) => !!draft.values[day.fieldName]);
    const off = days.filter((day) => !draft.values[day.fieldName]);
    let text;
    if (off.length === 0) {
      text = col.every || "Every day";
    } else if (on.length === 0) {
      text = col.none || "No days";
    } else if (off.length === 1 && on.length > 1) {
      text = `Off ${short(off[0])}`;
    } else {
      text = on.map(short).join(" ");
    }
    const name = draft.values.Name || this.addLabel;
    return {
      key: `${draft.key}-${col.fieldName}`,
      fieldName: col.fieldName,
      className,
      isDays: true,
      daysText: text,
      // The blank row's days are still to choose: quiet, not an exception.
      daysTextClass:
        off.length === 0 || draft.isNew
          ? "rest days-text"
          : "rest days-text exception",
      daysName: `${name}: ${col.label}`,
      dayCells: days.map((day) => ({
        key: `${draft.key}-${day.fieldName}`,
        fieldName: day.fieldName,
        short: short(day),
        label: named(day.label),
        checked: !!draft.values[day.fieldName],
        disabled: draft.isNew && !!draft.adding
      }))
    };
  }

  /** A field's value as shown: a blank choice is its "None" option, when it has one. */
  shownChoice(col, draft, value) {
    if (col.type === "checkbox" || col.type === "who") {
      return undefined;
    }
    if (
      col.type === "picklist" &&
      isBlank(value) &&
      (this.rowOptions(col, draft) || []).some((o) => o.value === "")
    ) {
      return "";
    }
    return value;
  }

  /** A picklist's choices in one row: its own (optionsFor), less the row's own record. */
  rowOptions(col, draft) {
    const saved = draft.isNew ? {} : draft.original || {};
    const options = col.optionsFor ? col.optionsFor(saved) : col.options;
    return col.excludeSelf
      ? (options || []).filter(
          (option) => !option.value || option.value !== saved.Id
        )
      : options;
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

  /** The row's chevron: its details open under it, or close. Nothing is saved by it. */
  handleMoreToggle(event) {
    const draft = this.rowFor(event.currentTarget.dataset.rowKey);
    draft.moreOpen = !draft.moreOpen;
    this.touch(draft);
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
    let draft = this.rowFor(rowKey);
    if (!draft.isNew && !ticked && typeof this.beforeWeekOff === "function") {
      // A question first (the desktop's "Turn off … for Week 3?" when it has placements).
      const weekName = (this._weeks.find((w) => w.Id === week) || {}).Name;
      // The question takes focus and covers the row, so the row keeps its strip shown until it
      // is answered: then the tick is still there for focus to come back to (WCAG 2.4.3).
      draft.asking = true;
      this.touch(draft);
      let go;
      try {
        go = await this.beforeWeekOff({
          recordId: draft.original.Id,
          name: draft.values.Name,
          weekId: week,
          weekName
        });
      } finally {
        // Back on the tick (WCAG 2.4.3), while the row still shows its strip: the page can't
        // reach inside this table to put it there itself.
        if (box.isConnected && typeof box.focus === "function") {
          box.focus();
        }
        // The page may have redrawn meanwhile (it is busy while it looks), making a new row.
        draft = this.rowFor(rowKey) || draft;
        draft.asking = false;
        this.touch(draft);
      }
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
    const column = this.fieldColumn(field);
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
    const key = event.currentTarget.dataset.rowKey;
    const draft = this.rowFor(key);
    const name = draft.original.Name;
    const index = this.visibleDrafts.findIndex((d) => d.key === key);
    this.dispatchEvent(
      new CustomEvent("delete", {
        detail: {
          recordId: draft.original.Id,
          name,
          onDeleted: () => this.deleted(key, index, name)
        }
      })
    );
  }

  /**
   * The screen deleted the row and read the season again: it is said, and the cursor moves to
   * the row that took its place, else the row above, else the blank row, once the row is gone.
   */
  deleted(key, index, name) {
    this.announce(`Deleted ${name || ""}`.trim());
    this.focusAfterDelete = { key, index };
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
      // Who it covers, as sent, so its section keeps showing it until the reload says so.
      added.savedWho = [...draft.who];
      added.who = [...draft.who];
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
      const column = this.fieldColumn(field) || {
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
      const column = this.fieldColumn(row.field) || {};
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

/** A column's width as a style, or none (the name shares what is left). */
function widthStyle(rem) {
  return rem ? `width: ${rem}rem` : "";
}

/** [1, 2, 3, 6] -> "1–3, 6". */
function ranges(numbers) {
  const out = [];
  let start = numbers[0];
  let last = numbers[0];
  numbers.slice(1).forEach((n) => {
    if (n === last + 1) {
      last = n;
      return;
    }
    out.push(start === last ? `${start}` : `${start}–${last}`);
    start = n;
    last = n;
  });
  out.push(start === last ? `${start}` : `${start}–${last}`);
  return out.join(", ");
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
