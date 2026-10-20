import { LightningElement, api } from "lwc";
import LightningConfirm from "lightning/confirm";
import { CHILDREN, FIELD, OBJECT } from "c/shoreshSchema";
import { leftField } from "c/shoreshSavedMark";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const ACTIVITY = FIELD.Activity;
const WHO = FIELD.ActivityEligibility;
// "Who can do it", beside the rule fields, in what is changed and not saved yet.
const WHO_KEY = "who";
// Each rule's input (its data-field) and the activity field it saves.
const RULE_FIELDS = {
  sameDivision: ACTIVITY.SameDivisionOnly,
  earlyCount: ACTIVITY.EarlyWeekCount,
  earlyDay: ACTIVITY.EarlyWeekByDay,
  notes: ACTIVITY.Notes
};
// "This many early in the week" and "by which day": both set or both blank (EarlyWeekComplete),
// so they are always saved together.
const EARLY_WEEK_INPUTS = ["earlyCount", "earlyDay"];
const EARLY_WEEK = EARLY_WEEK_INPUTS.map((key) => RULE_FIELDS[key]);

/**
 * One activity's details: who can do it (every group, or only chosen divisions and groups) and
 * the less common rules. They save as you go, like the tables (ADR 0011, decision 26 (4)): a tick
 * or a dropdown the moment it changes; a number, the notes, or "who" when the director leaves the
 * field. Only the rules that changed are sent, except that the early-week count and its day always
 * go together (who can do it is always sent whole: the server replaces the list). "Saved" shows
 * quietly; a refusal shows next to the field, with what was typed kept. If something else on the
 * screen is saved meanwhile, what was typed here stays.
 *
 * Fires: save { rules, whoCanDoIt, onSaved, onFailure(message), shown() }
 * (shown: whether the form still shows that activity; a refusal it can't show is said at the top)
 */
export default class ShoreshActivityDetails extends LightningElement {
  @api terms;
  @api busy = false;

  activityId;
  draft;
  // Fields (rule fields, or "who") changed and not sent yet; and those sent, not yet answered.
  dirty = new Set();
  sending = new Map();
  // Why the last save of a field was refused: field -> message, shown next to it.
  errors = {};
  _setup;

  /** The season setup from SeasonSetupController (activities, programs). */
  @api
  get setup() {
    return this._setup;
  }
  set setup(value) {
    this._setup = value;
    const activities = (value && value.activities) || [];
    if (!activities.some((a) => a.Id === this.activityId)) {
      this.activityId = activities.length ? activities[0].Id : null;
      this.forget();
    }
    this.showSaved();
  }

  /** What is saved, except the fields the director changed and are not saved yet. */
  showSaved() {
    const saved = this.draftFor(this.activity);
    if (!saved || !this.draft) {
      this.draft = saved;
      return;
    }
    const keep = (field) => this.dirty.has(field) || this.sending.has(field);
    const rules = { ...saved.rules };
    Object.keys(rules).forEach((field) => {
      if (keep(field)) {
        rules[field] = this.draft.rules[field];
      }
    });
    this.draft = {
      rules,
      whoCanDoIt: keep(WHO_KEY) ? this.draft.whoCanDoIt : saved.whoCanDoIt
    };
  }

  /** Another activity: nothing of the last one's typing carries over. */
  forget() {
    this.dirty = new Set();
    this.sending = new Map();
    this.errors = {};
    this.draft = null;
  }

  get activities() {
    return (this._setup && this._setup.activities) || [];
  }

  get activity() {
    return this.activities.find((a) => a.Id === this.activityId);
  }

  get hasActivities() {
    return this.activities.length > 0;
  }

  get activityOptions() {
    return this.activities.map((a) => ({ label: a.Name, value: a.Id }));
  }

  draftFor(activity) {
    if (!activity) {
      return null;
    }
    const rules = {};
    Object.values(RULE_FIELDS).forEach((field) => {
      rules[field] = activity[field] === undefined ? null : activity[field];
    });
    const whoCanDoIt = (activity[CHILDREN.Activity.Eligibilities] || []).map(
      (row) => row[WHO.Division] || row[WHO.Group]
    );
    return { rules, whoCanDoIt };
  }

  /** Every division, then every group (with its division), across the season's programs. */
  get targetOptions() {
    const t = this.terms;
    const divisions = [];
    const groups = [];
    const programs = (this._setup && this._setup.programs) || [];
    const severalPrograms = programs.length > 1;
    programs.forEach((entry) => {
      (entry.divisions || []).forEach((d) => {
        const where = severalPrograms ? ` (${entry.program.Name})` : "";
        divisions.push({
          label: `${t.s("Division")}: ${d.division.Name}${where}`,
          value: d.division.Id
        });
        (d.groups || []).forEach((grp) => {
          groups.push({
            label: `${grp.Name} (${d.division.Name})`,
            value: grp.Id
          });
        });
      });
    });
    return [...divisions, ...groups];
  }

  get dayOptions() {
    return [
      { label: "No day", value: "" },
      ...DAYS.map((day) => ({ label: day, value: day }))
    ];
  }

  get whoCanDoIt() {
    return this.draft ? this.draft.whoCanDoIt : [];
  }

  get rules() {
    return this.draft ? this.draft.rules : {};
  }

  get earlyDay() {
    return this.rules[ACTIVITY.EarlyWeekByDay] || "";
  }

  get sameDivision() {
    return this.rules[ACTIVITY.SameDivisionOnly];
  }

  get earlyCount() {
    return this.rules[ACTIVITY.EarlyWeekCount];
  }

  get notes() {
    return this.rules[ACTIVITY.Notes];
  }

  get everyoneNote() {
    const t = this.terms;
    return this.whoCanDoIt.length === 0
      ? `Nobody chosen: every ${t.sIn("Group")} can do it.`
      : `Only the chosen ${t.pIn("Division")} and ${t.pIn("Group")} can do it.`;
  }

  get whoError() {
    return this.errors[WHO_KEY];
  }
  get sameDivisionError() {
    return this.errors[ACTIVITY.SameDivisionOnly];
  }
  get earlyCountError() {
    return this.errors[ACTIVITY.EarlyWeekCount];
  }
  get earlyDayError() {
    return this.errors[ACTIVITY.EarlyWeekByDay];
  }
  get notesError() {
    return this.errors[ACTIVITY.Notes];
  }

  get labels() {
    const t = this.terms;
    return {
      title: `${t.s("Activity")} details`,
      intro: `Who can do each ${t.sIn("Activity")}, and the rules most ${t.pIn("Activity")} don't need.`,
      activity: t.s("Activity"),
      whoCanDoIt: "Who can do it",
      available: `${t.p("Division")} and ${t.p("Group")}`,
      chosen: "Can do it",
      moreRules: "More rules",
      sameDivision: `Only ${t.pIn("Group")} from the same ${t.sIn("Division")} at the same time`,
      earlyCount: "Get this many done early in the week",
      earlyDay: "By",
      notes: "Notes",
      empty: `Add ${t.pIn("Activity")} in the table above and save them first.`
    };
  }

  async handleActivityChange(event) {
    const picker = event.target;
    const chosen = event.detail.value;
    if (this.dirty.size) {
      // Only a refused change is still unsaved here: leaving a field saves it.
      const ok = await LightningConfirm.open({
        label: "Unsaved changes",
        message: `Discard your unsaved changes to "${this.activity.Name}"?`,
        variant: "header",
        theme: "warning"
      });
      if (!ok) {
        // Stay on the activity being edited.
        picker.value = this.activityId;
        return;
      }
    }
    this.activityId = chosen;
    this.forget();
    this.draft = this.draftFor(this.activity);
    this.clearMark();
  }

  handleWhoChange(event) {
    this.update(WHO_KEY, { whoCanDoIt: [...event.detail.value] });
  }

  /** Who can do it is saved when the director leaves the list (not on every move in it). */
  handleWhoLeave(event) {
    if (leftField(event)) {
      this.save(WHO_KEY);
    }
  }

  /** A number or the notes: saved on leaving the field. */
  handleRuleLeave(event) {
    const field = RULE_FIELDS[event.currentTarget.dataset.field];
    if (field && leftField(event)) {
      this.save(field, event.currentTarget);
    }
  }

  handleRule(event) {
    const field = RULE_FIELDS[event.target.dataset.field];
    if (!field) {
      return;
    }
    let value =
      event.target.type === "checkbox"
        ? event.target.checked
        : event.detail.value;
    if (field === ACTIVITY.EarlyWeekCount) {
      value = value === "" || value === null ? null : Number(value);
    }
    if (value === "") {
      value = null;
    }
    this.update(field, { rules: { ...this.draft.rules, [field]: value } });
    // A tick or a dropdown is chosen once, so it is saved at once.
    const target = event.target;
    if (target.type === "checkbox" || target.tagName === "LIGHTNING-COMBOBOX") {
      this.save(field);
    }
  }

  update(field, part) {
    this.draft = { ...this.draft, ...part };
    this.dirty.add(field);
    if (this.errors[field]) {
      this.errors = { ...this.errors, [field]: null };
    }
    this.clearMark();
  }

  clearMark() {
    const mark = this.template.querySelector("c-shoresh-saved-mark");
    if (mark) {
      mark.clear();
    }
  }

  /**
   * Sends one changed field (a rule field, or "who"). The two early-week fields go together: the
   * server takes both or neither, so one alone would be refused while the other is still blank. A
   * value a field itself refuses (an early count under 1) is not sent; the field says why, as any
   * field does.
   */
  save(field, input) {
    const fields = EARLY_WEEK.includes(field) ? EARLY_WEEK : [field];
    const changed = fields.filter((f) => this.dirty.has(f));
    if (!changed.length) {
      return;
    }
    const inputs = EARLY_WEEK.includes(field)
      ? EARLY_WEEK_INPUTS.map((key) =>
          this.template.querySelector(`[data-field="${key}"]`)
        )
      : [input];
    if (inputs.some((i) => i && i.reportValidity && !i.reportValidity())) {
      return;
    }
    const rules = { sobjectType: OBJECT.Activity, Id: this.activityId };
    fields.forEach((f) => {
      this.dirty.delete(f);
      this.sending.set(f, (this.sending.get(f) || 0) + 1);
      if (f !== WHO_KEY) {
        rules[f] = this.draft.rules[f];
      }
    });
    const activityId = this.activityId;
    const done = () => {
      fields.forEach((f) => {
        const left = (this.sending.get(f) || 0) - 1;
        if (left > 0) {
          this.sending.set(f, left);
        } else {
          this.sending.delete(f);
        }
      });
    };
    const onSaved = () => {
      if (activityId !== this.activityId) {
        return;
      }
      done();
      // Saved together: a refusal shown on either is answered now.
      const cleared = { ...this.errors };
      fields.forEach((f) => {
        cleared[f] = null;
      });
      this.errors = cleared;
      const mark = this.template.querySelector("c-shoresh-saved-mark");
      if (mark) {
        mark.saved();
      }
    };
    // Refused: what was typed stays, still to save, with why next to the field left.
    const onFailure = (message) => {
      if (activityId !== this.activityId) {
        return;
      }
      done();
      if (this.sending.has(field)) {
        // A newer save of the same field is on its way, with what the screen shows now.
        return;
      }
      changed.forEach((f) => this.dirty.add(f));
      const shown = { ...this.errors };
      fields.forEach((f) => {
        shown[f] = f === field ? message : null;
      });
      this.errors = shown;
    };
    this.dispatchEvent(
      new CustomEvent("save", {
        detail: {
          rules,
          whoCanDoIt: [...this.draft.whoCanDoIt],
          onSaved,
          onFailure,
          shown: () => activityId === this.activityId
        }
      })
    );
  }
}
