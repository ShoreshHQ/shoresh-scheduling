import { LightningElement, api } from "lwc";
import LightningConfirm from "lightning/confirm";
import { CHILDREN, FIELD, OBJECT } from "c/shoreshSchema";
import { holdsNoDivision } from "c/shoreshImportEngine";
import { leftField } from "c/shoreshSavedMark";
import { rainPlanChoices } from "c/shoreshSetupRules";

// The days an early-week goal can be by (EarlyWeekByDay__c).
const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
];
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
// The activity's own fields that were the table's columns before step 3b (ADR 0015 choice 12):
// they live here now, saved as the table saved them (only the field that changed, compared
// with what it held when the director saw it: SetupTablesController.saveRow, ADR 0011 choice 5).
const ROW_FIELDS = {
  length: ACTIVITY.Length,
  groupsAtOnce: ACTIVITY.GroupsAtOnce,
  noGroupLimit: ACTIVITY.NoGroupLimit,
  noWeeklyMax: ACTIVITY.NoWeeklyMax,
  priority: ACTIVITY.Priority,
  outdoor: ACTIVITY.Outdoor,
  rainPlan: ACTIVITY.RainPlan
};
const INPUT_FIELDS = { ...RULE_FIELDS, ...ROW_FIELDS };
const ROW_SET = new Set(Object.values(ROW_FIELDS));
// The ticks among them, read "Yes" or "No" in "Changed by someone else".
const TICK_FIELDS = new Set([
  ACTIVITY.NoGroupLimit,
  ACTIVITY.NoWeeklyMax,
  ACTIVITY.Outdoor
]);
// Fields typed in (saved on leaving them); the rest are chosen once and saved at once.
const NUMBER_FIELDS = new Set([
  ACTIVITY.EarlyWeekCount,
  ACTIVITY.Length,
  ACTIVITY.GroupsAtOnce
]);
// "This many early in the week" and "by which day": both set or both blank (EarlyWeekComplete),
// so they are always saved together.
const EARLY_WEEK_INPUTS = ["earlyCount", "earlyDay"];
const EARLY_WEEK = EARLY_WEEK_INPUTS.map((key) => RULE_FIELDS[key]);
// Bunks together: the two choices of the one tick it is saved as.
const ANY = "any";
const SAME = "same";

/**
 * One activity's details, in the panel beside the Activities table (step 3b, ADR 0015 choice
 * 12; docs/design/setup/activities.html): who can do it (every group, or only chosen divisions
 * and groups), the less common rules, and the activity's own fields that are not the table's
 * columns (length, groups at once, priority, outdoors, rain plan, no weekly maximum). Opened from the activity's row in the Activities table (open(id)), as
 * the desktop's row Edit opens its details (ActivitiesScreen.jsx); hidden until then, and Close
 * hides it again. Who can do it is a list of ticks, as on the desktop (ActivitiesScreen.jsx,
 * "Eligible Age Divisions" and the group ticks). They save as you go, like the tables (ADR 0011,
 * decision 26 (4)): a tick or a dropdown the moment it changes; a number or the notes when the
 * director leaves the field. Only the rules that changed are sent, except that the early-week count and its day always
 * go together (who can do it is always sent whole: the server replaces the list). "Saved" shows
 * quietly; a refusal shows next to the field, with what was typed kept. If something else on the
 * screen is saved meanwhile, what was typed here stays.
 *
 * The activity's own fields go as the table's rows did (ADR 0011 choice 5): save { record: { Id,
 * field }, seen(), onSaved(result), onFailure(message), shown() }, only the field that changed;
 * seen() is what that field held when the director saw it, read when the save's turn comes (so
 * a save waiting behind another of the same field compares with what that one saved). If
 * someone else changed it since, result.changed names it and nothing is saved: the panel asks
 * Manual Build's question, "Changed by someone else", Keep theirs or Use yours. Closing or
 * opening another activity waits for those saves' answers, so the question is never dropped.
 *
 * Fires: save { rules, whoCanDoIt, onSaved, onFailure(message), shown() }
 * (shown: whether the form still shows that activity; a refusal it can't show is said at the top);
 * close { activityId } (Close pressed: the page puts the cursor back on the row's button)
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
  // Put the cursor on the heading once the details are drawn.
  focusHeadingNext = false;
  // What each of the activity's own fields held when the director saw it (field -> value).
  seen = {};
  // Someone else changed a field since: { field, theirs, yours }, asked until answered.
  conflict = null;
  conflictFocused = false;
  // The field to put the cursor back in once the question is answered.
  focusFieldNext = null;
  // The activity's own-field saves not yet answered: { activityId, answer (a promise) }.
  // Leaving waits for them, so "someone else changed it" is always asked, never dropped.
  ownWaiting = [];

  /** The season setup from SeasonSetupController (activities, programs). */
  @api
  get setup() {
    return this._setup;
  }
  set setup(value) {
    this._setup = value;
    const activities = (value && value.activities) || [];
    if (this.activityId && !activities.some((a) => a.Id === this.activityId)) {
      // The activity is gone (deleted, or another season): its details close.
      this.activityId = null;
      this.forget();
    }
    this.showSaved();
  }

  /** What is saved, except the fields the director changed and are not saved yet. */
  showSaved() {
    const saved = this.draftFor(this.activity);
    const keep = (field) =>
      !!this.draft && (this.dirty.has(field) || this.sending.has(field));
    if (saved) {
      // Fields not being changed are seen as they are now.
      ROW_SET.forEach((field) => {
        if (!keep(field)) {
          this.seen[field] = saved.rules[field];
        }
      });
    }
    if (!saved || !this.draft) {
      this.draft = saved;
      return;
    }
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
    this.seen = {};
    this.conflict = null;
  }

  get activities() {
    return (this._setup && this._setup.activities) || [];
  }

  get activity() {
    return this.activities.find((a) => a.Id === this.activityId);
  }

  /** The activity shown, or null when the details are closed. */
  @api
  get openActivityId() {
    return this.activityId || null;
  }

  draftFor(activity) {
    if (!activity) {
      return null;
    }
    const rules = {};
    Object.values(INPUT_FIELDS).forEach((field) => {
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
        // DIV-1.1: a group in no division is offered by its own name only.
        const none = holdsNoDivision(d.division);
        if (!none) {
          divisions.push({
            label: `${t.s("Division")}: ${d.division.Name}${where}`,
            value: d.division.Id
          });
        }
        (d.groups || []).forEach((grp) => {
          groups.push({
            label: none
              ? `${grp.Name}${where}`
              : `${grp.Name} (${d.division.Name})`,
            value: grp.Id
          });
        });
      });
    });
    return [...divisions, ...groups];
  }

  /** Rain plan: none, or an indoor activity (the one it holds already, too); never itself. */
  get rainPlanOptions() {
    const held = this.rules[ACTIVITY.RainPlan];
    return [
      { label: "None", value: "" },
      ...rainPlanChoices(this.activities, held).filter(
        (option) => option.value !== this.activityId
      )
    ];
  }

  get priorityOptions() {
    return [
      { label: "High", value: "High" },
      { label: "Low", value: "Low" }
    ];
  }

  /** Bunks together: any bunks, or only the same division's (the one tick it is saved as). */
  get togetherOptions() {
    const t = this.terms;
    return [
      { label: `Any ${t.pIn("Group")}`, value: ANY },
      { label: `Same ${t.sIn("Division")}`, value: SAME }
    ];
  }

  get together() {
    return this.rules[ACTIVITY.SameDivisionOnly] ? SAME : ANY;
  }

  get rainPlan() {
    return this.rules[ACTIVITY.RainPlan] || "";
  }
  get length() {
    return this.rules[ACTIVITY.Length];
  }
  get groupsAtOnce() {
    return this.rules[ACTIVITY.GroupsAtOnce];
  }
  get noGroupLimit() {
    return !!this.rules[ACTIVITY.NoGroupLimit];
  }
  get noWeeklyMax() {
    return !!this.rules[ACTIVITY.NoWeeklyMax];
  }
  get priority() {
    return this.rules[ACTIVITY.Priority];
  }
  get outdoor() {
    return !!this.rules[ACTIVITY.Outdoor];
  }

  /** Why the last save of an activity field was refused, by its input (data-field). */
  get fieldErrors() {
    const result = {};
    Object.keys(ROW_FIELDS).forEach((key) => {
      result[key] = this.errors[ROW_FIELDS[key]];
    });
    return result;
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

  /** The ticks' label; with nothing ticked it shows that everyone can (no sentence). */
  get whoLabel() {
    return this.whoCanDoIt.length === 0
      ? `${this.labels.whoCanDoIt}: everyone`
      : this.labels.whoCanDoIt;
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
    const name = this.activity ? this.activity.Name : "";
    return {
      title: `${name} details`.trim(),
      // The panel's heading shows the name; its full name is read out.
      name,
      close: `Close ${name} details`.replace(/\s+/g, " ").trim(),
      length: t.s("Length"),
      groupsAtOnce: t.s("GroupsAtOnce"),
      noGroupLimit: "No limit",
      noWeeklyMax: "No weekly maximum",
      priority: "Priority",
      outdoor: "Outdoors",
      rainPlan: t.s("RainPlan"),
      together: `${t.p("Group")} together`,
      whoCanDoIt: "Who can do it",
      sameDivision: `Only ${t.pIn("Group")} from the same ${t.sIn("Division")} at the same time`,
      // One group, read as "Early in the week: How many … By …" (WCAG 1.3.1).
      early: "Early in the week",
      earlyCount: "How many",
      earlyDay: "By",
      notes: "Notes"
    };
  }

  /**
   * Opens this activity's details (from its row), the cursor on their heading. Another
   * activity's refused change, still unsaved, is asked about first; staying keeps it. Resolves
   * whether the details now show that activity.
   */
  @api
  async open(activityId) {
    if (activityId !== this.activityId && !(await this.mayLeave())) {
      return false;
    }
    if (!this.activities.some((a) => a.Id === activityId)) {
      return false;
    }
    if (activityId !== this.activityId) {
      this.activityId = activityId;
      this.forget();
      this.showSaved();
      this.clearMark();
    }
    this.focusHeadingNext = true;
    this.focusHeading();
    return true;
  }

  renderedCallback() {
    this.focusHeading();
    if (this.conflict && !this.conflictFocused) {
      this.conflictFocused = true;
      const use = this.template.querySelector('[data-id="use-yours"]');
      if (use) {
        use.focus();
      }
    }
    if (this.focusFieldNext && !this.conflict) {
      const input = this.template.querySelector(
        `[data-field="${this.focusFieldNext}"]`
      );
      this.focusFieldNext = null;
      if (input) {
        input.focus();
      }
    }
  }

  focusHeading() {
    const heading =
      this.focusHeadingNext && this.template.querySelector("[data-heading]");
    if (heading) {
      this.focusHeadingNext = false;
      heading.focus();
    }
  }

  /**
   * Whether the activity shown may be left. Its own fields' saves on their way are waited for
   * first: if someone else changed one, the question is asked and the details stay until it is
   * answered (ADR 0011 choice 5). Then a refused change still unsaved is asked about.
   */
  async mayLeave() {
    const activityId = this.activityId;
    await this.ownAnswered(activityId);
    if (activityId !== this.activityId || this.conflict) {
      // Left meanwhile, or the question is open: it is answered before anything else.
      return false;
    }
    if (!this.activityId || !this.dirty.size) {
      return true;
    }
    // Only a refused change is still unsaved here: leaving a field saves it.
    return LightningConfirm.open({
      label: "Unsaved changes",
      message: `Discard your unsaved changes to "${this.activity.Name}"?`,
      variant: "header",
      theme: "warning"
    });
  }

  /** Resolves once every own-field save of this activity has its answer (sent meanwhile too). */
  async ownAnswered(activityId) {
    const waiting = this.ownWaiting.filter((w) => w.activityId === activityId);
    if (waiting.length) {
      await Promise.all(waiting.map((w) => w.answer));
      await this.ownAnswered(activityId);
    }
  }

  /** Close: the details go (asking first about a refused change still unsaved). */
  async handleClose() {
    if (!(await this.mayLeave())) {
      return;
    }
    const activityId = this.activityId;
    this.activityId = null;
    this.forget();
    this.dispatchEvent(new CustomEvent("close", { detail: { activityId } }));
  }

  /** A tick is chosen once, so it is saved at once, like the rule ticks. */
  handleWhoChange(event) {
    this.update(WHO_KEY, { whoCanDoIt: [...event.detail.value] });
    this.save(WHO_KEY);
  }

  /** A number or the notes: saved on leaving the field. */
  handleRuleLeave(event) {
    const field = INPUT_FIELDS[event.currentTarget.dataset.field];
    if (field && leftField(event)) {
      this.save(field, event.currentTarget);
    }
  }

  /** Enter in a number saves it too, as in every setup form (ADR 0013 choice 1). */
  handleRuleKey(event) {
    const field = INPUT_FIELDS[event.currentTarget.dataset.field];
    if (event.key === "Enter" && field) {
      this.save(field, event.currentTarget);
    }
  }

  handleRule(event) {
    const field = INPUT_FIELDS[event.target.dataset.field];
    if (!field) {
      return;
    }
    const target = event.target;
    const radio = target.tagName === "LIGHTNING-RADIO-GROUP";
    let value =
      target.type === "checkbox" ? target.checked : event.detail.value;
    if (radio) {
      // Bunks together is saved as its one tick: the same division's only.
      value = value === SAME;
    }
    if (NUMBER_FIELDS.has(field)) {
      value = value === "" || value === null ? null : Number(value);
    }
    if (value === "") {
      value = null;
    }
    this.update(field, { rules: { ...this.draft.rules, [field]: value } });
    // A tick, a choice or a dropdown is chosen once, so it is saved at once.
    if (
      target.type === "checkbox" ||
      radio ||
      target.tagName === "LIGHTNING-COMBOBOX"
    ) {
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
    // The activity's own field (not a rule): sent as a record, as the program's own fields are.
    const own = ROW_SET.has(field);
    if (own && field === ACTIVITY.RainPlan && rules[field] === "") {
      rules[field] = null;
    }
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
    const shown = () => activityId === this.activityId;
    if (own) {
      this.sendOwn(field, rules, { done, onSaved, onFailure, shown });
      return;
    }
    this.dispatchEvent(
      new CustomEvent("save", {
        detail: {
          rules,
          whoCanDoIt: [...this.draft.whoCanDoIt],
          onSaved,
          onFailure,
          shown
        }
      })
    );
  }

  /**
   * One of the activity's own fields, compared and set as the table's rows are (ADR 0011
   * choice 5): saved only if no one else changed it since the director saw it; otherwise the
   * question, and nothing is saved until it is answered.
   */
  sendOwn(field, record, { done, onSaved, onFailure, shown }) {
    const activityId = this.activityId;
    const name = this.activity ? this.activity.Name : null;
    // Read when the save's turn comes: an earlier save of this field may have moved it on.
    const seen = () => ({
      sobjectType: OBJECT.Activity,
      Id: activityId,
      Name: name,
      [field]: activityId === this.activityId ? this.seen[field] : undefined
    });
    let answer;
    const waiting = {
      activityId,
      answer: new Promise((resolve) => {
        answer = resolve;
      })
    };
    this.ownWaiting.push(waiting);
    const stopWaiting = () => {
      this.ownWaiting = this.ownWaiting.filter((w) => w !== waiting);
      answer();
    };
    const refused = (message) => {
      onFailure(message);
      stopWaiting();
    };
    const answered = (result) => {
      try {
        this.answerOwn(field, record, result, { activityId, done, onSaved });
      } finally {
        stopWaiting();
      }
    };
    this.dispatchEvent(
      new CustomEvent("save", {
        detail: { record, seen, onSaved: answered, onFailure: refused, shown }
      })
    );
  }

  /** The answer to one own-field save: saved, or the question if someone else changed it. */
  answerOwn(field, record, result, { activityId, done, onSaved }) {
    const changed = (result && result.changed) || [];
    if (!changed.length) {
      if (activityId === this.activityId) {
        // Saved: typing since is compared with what was sent.
        this.seen[field] = record[field];
      }
      onSaved();
      return;
    }
    if (activityId !== this.activityId) {
      // Leaving waits for this answer, so only a deleted activity's details are gone by now.
      return;
    }
    done();
    if (this.sending.has(field)) {
      // A newer save of the same field is on its way, and gets its own answer.
      return;
    }
    // Someone else changed it: nothing saved; the typing stays until the director chooses.
    this.dirty.add(field);
    const theirs = result.theirs ? result.theirs[field] : null;
    this.conflictFocused = false;
    this.conflict = {
      field,
      theirs: theirs === undefined ? null : theirs,
      yours: record[field]
    };
  }

  // ---------- someone else changed the field (the setup tables' question) ----------

  /** The question's one row: "Archery · Length", theirs and yours as the director reads them. */
  get conflictRows() {
    if (!this.conflict) {
      return [];
    }
    const { field, theirs, yours } = this.conflict;
    const key = Object.keys(ROW_FIELDS).find((k) => ROW_FIELDS[k] === field);
    const name = this.activity ? this.activity.Name : "";
    return [
      {
        key,
        where: `${name} · ${this.labels[key]}`,
        theirs: this.shown(field, theirs),
        yours: this.shown(field, yours)
      }
    ];
  }

  /** A value as the director reads it: Yes or No, an activity by its name, None when blank. */
  shown(field, value) {
    if (TICK_FIELDS.has(field)) {
      return value ? "Yes" : "No";
    }
    if (value === null || value === undefined || value === "") {
      return "None";
    }
    if (field === ACTIVITY.RainPlan) {
      const plan = this.activities.find((a) => a.Id === value);
      return plan ? plan.Name : "None";
    }
    return String(value);
  }

  /** Theirs stays: the field shows what someone else saved, and nothing is sent. */
  handleKeepTheirs() {
    const { field, theirs } = this.conflict;
    this.dirty.delete(field);
    this.seen[field] = theirs;
    this.draft = {
      ...this.draft,
      rules: { ...this.draft.rules, [field]: theirs }
    };
    this.closeConflict(field);
  }

  /** The same change again, naming what is there now. */
  handleUseYours() {
    const { field, theirs } = this.conflict;
    this.seen[field] = theirs;
    this.closeConflict(field);
    this.save(field);
  }

  /** As the setup tables' question: Escape keeps theirs, and Tab stays on its two buttons. */
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

  closeConflict(field) {
    this.conflict = null;
    this.focusFieldNext = Object.keys(ROW_FIELDS).find(
      (k) => ROW_FIELDS[k] === field
    );
  }
}
