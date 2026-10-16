import { LightningElement, api } from "lwc";

const keyOf = (groupId, weekId) => `${groupId}|${weekId}`;

/**
 * Which groups do not run in which weeks (week exceptions), as a grid: one row per group, one
 * column per week, a tick for "does not run". Changes stay on screen until Save.
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
      const key = keyOf(row.Group__c, row.Week__c);
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
    this.rows.forEach((row) =>
      row.cells.forEach((cell) => onScreen.add(cell.key))
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
    return this.weeks.length > 0 && this.rows.length > 0;
  }

  get rows() {
    const rows = [];
    const weeks = this.weeks;
    ((this._setup && this._setup.programs) || []).forEach((entry) => {
      (entry.divisions || []).forEach((d) => {
        (d.groups || []).forEach((grp) => {
          rows.push({
            id: grp.Id,
            name: grp.Name,
            place: `${entry.program.Name} · ${d.division.Name}`,
            cells: weeks.map((week) => {
              const key = keyOf(grp.Id, week.id);
              return {
                key,
                checked: this.isTicked(key),
                label: `${grp.Name} does not run in ${week.name}`
              };
            })
          });
        });
      });
    });
    return rows;
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
        `Tick each ${t.sIn("Week")} a ${t.sIn("Group")} does not run ` +
        `(for example, away on a trip). Copying the ${t.sIn("Season")} carries these over.`,
      group: t.s("Group"),
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
    this.pending.forEach((ticked, key) => {
      const [groupId, weekId] = key.split("|");
      if (ticked) {
        toAdd.push({
          sobjectType: "WeekException__c",
          Group__c: groupId,
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
