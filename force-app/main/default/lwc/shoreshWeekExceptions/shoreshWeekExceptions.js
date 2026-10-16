import { LightningElement, api } from "lwc";

// Salesforce Ids are unique across objects, so a target Id alone says which row it is.
const keyOf = (targetId, weekId) => `${targetId}|${weekId}`;
const targetOf = (row) => row.Group__c || row.Activity__c || row.Location__c;

/**
 * What does not run in which weeks (week exceptions), as a grid: one row per group, activity,
 * and location, one column per week, a tick for "does not run" (or "closed"). Changes stay on
 * screen until Save.
 *
 * Fires: save { toAdd, toRemove, onFailure }
 */
export default class ShoreshWeekExceptions extends LightningElement {
  @api terms;
  @api busy = false;

  // What is saved: grid key -> week exception Ids (normally one).
  saved = new Map();
  // Unsaved ticks: grid key -> true (tick) or false (untick).
  pending = new Map();
  submitted = false;
  _setup;

  /** The season setup from SeasonSetupController (weeks, programs, weekExceptions). */
  @api
  get setup() {
    return this._setup;
  }
  set setup(value) {
    this._setup = value;
    const saved = new Map();
    ((value && value.weekExceptions) || []).forEach((row) => {
      const key = keyOf(targetOf(row), row.Week__c);
      saved.set(key, [...(saved.get(key) || []), row.Id]);
    });
    this.saved = saved;
    if (this.submitted) {
      // This grid's own save went through.
      this.submitted = false;
      this.pending = new Map();
      return;
    }
    // Something else was saved: keep unsaved ticks that still differ from what is saved,
    // for groups and weeks that are still there.
    const onScreen = new Set();
    this.rowGroups().forEach((rows) =>
      rows.forEach((row) => row.cells.forEach((cell) => onScreen.add(cell.key)))
    );
    const kept = new Map();
    this.pending.forEach((ticked, key) => {
      if (onScreen.has(key) && ticked !== this.saved.has(key)) {
        kept.set(key, ticked);
      }
    });
    this.pending = kept;
  }

  get weeks() {
    return ((this._setup && this._setup.weeks) || []).map((week) => ({
      id: week.Id,
      name: week.Name
    }));
  }

  get hasGrid() {
    return (
      this.weeks.length > 0 && this.rowGroups().some((rows) => rows.length > 0)
    );
  }

  get columnCount() {
    return this.weeks.length + 1;
  }

  /** Groups first, then activities, then locations; a section only when it has rows. */
  get sections() {
    const t = this.terms;
    const [groups, activities, locations] = this.rowGroups();
    return [
      { key: "groups", heading: t.p("Group"), rows: groups },
      { key: "activities", heading: t.p("Activity"), rows: activities },
      { key: "locations", heading: t.p("Location"), rows: locations }
    ].filter((section) => section.rows.length > 0);
  }

  /** [group rows, activity rows, location rows]. Needs no camp words, so it works before they load. */
  rowGroups() {
    const setup = this._setup || {};
    const groups = [];
    (setup.programs || []).forEach((entry) => {
      (entry.divisions || []).forEach((d) => {
        (d.groups || []).forEach((grp) => {
          groups.push(
            this.row(
              grp,
              "Group__c",
              `${entry.program.Name} · ${d.division.Name}`,
              "does not run in"
            )
          );
        });
      });
    });
    const activities = (setup.activities || []).map((activity) =>
      this.row(activity, "Activity__c", "", "does not run in")
    );
    const locations = (setup.locations || []).map((location) =>
      this.row(location, "Location__c", "", "is closed in")
    );
    return [groups, activities, locations];
  }

  row(record, field, place, phrase) {
    return {
      id: record.Id,
      name: record.Name,
      place,
      field,
      cells: this.weeks.map((week) => {
        const key = keyOf(record.Id, week.id);
        return {
          key,
          checked: this.isTicked(key),
          label: `${record.Name} ${phrase} ${week.name}`
        };
      })
    };
  }

  /** The field each row's target goes in: Group__c, Activity__c, or Location__c. */
  get fieldByTarget() {
    const result = new Map();
    this.rowGroups().forEach((rows) =>
      rows.forEach((row) => result.set(row.id, row.field))
    );
    return result;
  }

  isTicked(key) {
    return this.pending.has(key) ? this.pending.get(key) : this.saved.has(key);
  }

  get isDirty() {
    return this.pending.size > 0;
  }

  get saveDisabled() {
    return this.busy || !this.isDirty;
  }

  get labels() {
    const t = this.terms;
    return {
      title: t.p("WeekException"),
      intro:
        `Tick each ${t.sIn("Week")} a ${t.sIn("Group")} or ${t.sIn("Activity")} does not run ` +
        `(for example, away on a trip), or a ${t.sIn("Location")} is closed. ` +
        `Copying the ${t.sIn("Season")} carries these over.`,
      empty: `Add ${t.pIn("Week")} and ${t.pIn("Group")} first.`
    };
  }

  handleTick(event) {
    const key = event.target.dataset.key;
    const ticked = event.target.checked;
    const next = new Map(this.pending);
    if (ticked === this.saved.has(key)) {
      next.delete(key);
    } else {
      next.set(key, ticked);
    }
    this.pending = next;
  }

  handleCancel() {
    this.pending = new Map();
  }

  handleSave() {
    const toAdd = [];
    const toRemove = [];
    const fieldByTarget = this.fieldByTarget;
    this.pending.forEach((ticked, key) => {
      const [targetId, weekId] = key.split("|");
      if (ticked) {
        toAdd.push({
          sobjectType: "WeekException__c",
          [fieldByTarget.get(targetId)]: targetId,
          Week__c: weekId
        });
      } else {
        toRemove.push(...this.saved.get(key));
      }
    });
    this.submitted = true;
    const onFailure = () => {
      this.submitted = false;
    };
    this.dispatchEvent(
      new CustomEvent("save", { detail: { toAdd, toRemove, onFailure } })
    );
  }
}
