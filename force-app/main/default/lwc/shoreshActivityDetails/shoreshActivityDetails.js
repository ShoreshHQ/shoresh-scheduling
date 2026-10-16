import { LightningElement, api } from "lwc";
import LightningConfirm from "lightning/confirm";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const RULE_FIELDS = [
  "SameDivisionOnly__c",
  "EarlyWeekCount__c",
  "EarlyWeekByDay__c",
  "Notes__c"
];

/**
 * One activity's details: who can do it (every group, or only chosen divisions and groups) and
 * the less common rules. Changes stay on screen until Save; if something else on the screen is
 * saved meanwhile, what was typed here stays.
 *
 * Fires: save { rules, whoCanDoIt, onFailure }
 */
export default class ShoreshActivityDetails extends LightningElement {
  @api terms;
  @api busy = false;

  activityId;
  draft;
  changed = false;
  submitted = false;
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
      this.changed = false;
    }
    if (this.submitted || !this.changed) {
      // This panel's own save went through, or nothing was typed: show what is saved.
      this.submitted = false;
      this.changed = false;
      this.draft = this.draftFor(this.activity);
    }
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
    RULE_FIELDS.forEach((field) => {
      rules[field] = activity[field] === undefined ? null : activity[field];
    });
    const whoCanDoIt = (activity.Eligibilities__r || []).map(
      (row) => row.Division__c || row.Group__c
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
    return this.rules.EarlyWeekByDay__c || "";
  }

  get everyoneNote() {
    const t = this.terms;
    return this.whoCanDoIt.length === 0
      ? `Nobody chosen: every ${t.sIn("Group")} can do it.`
      : `Only the chosen ${t.pIn("Division")} and ${t.pIn("Group")} can do it.`;
  }

  get saveDisabled() {
    return this.busy || !this.changed;
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
    if (this.changed) {
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
    this.changed = false;
    this.draft = this.draftFor(this.activity);
  }

  handleWhoChange(event) {
    this.update({ whoCanDoIt: [...event.detail.value] });
  }

  handleRule(event) {
    const field = event.target.dataset.field;
    let value =
      event.target.type === "checkbox"
        ? event.target.checked
        : event.detail.value;
    if (field === "EarlyWeekCount__c") {
      value = value === "" || value === null ? null : Number(value);
    }
    if (value === "") {
      value = null;
    }
    this.update({ rules: { ...this.draft.rules, [field]: value } });
  }

  update(part) {
    this.draft = { ...this.draft, ...part };
    this.changed = true;
  }

  handleCancel() {
    this.changed = false;
    this.draft = this.draftFor(this.activity);
  }

  handleSave() {
    const inputs = [
      ...this.template.querySelectorAll("lightning-input, lightning-combobox")
    ];
    if (!inputs.reduce((ok, input) => input.reportValidity() && ok, true)) {
      return;
    }
    this.submitted = true;
    const onFailure = () => {
      this.submitted = false;
    };
    this.dispatchEvent(
      new CustomEvent("save", {
        detail: {
          rules: {
            sobjectType: "Activity__c",
            Id: this.activityId,
            ...this.draft.rules
          },
          whoCanDoIt: [...this.draft.whoCanDoIt],
          onFailure
        }
      })
    );
  }
}
