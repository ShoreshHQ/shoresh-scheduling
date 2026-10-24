import { LightningElement, api } from "lwc";
import previewCopy from "@salesforce/apex/SeasonSetupController.previewCopy";
import copySeason from "@salesforce/apex/SeasonSetupController.copySeason";
import { suggestedCopyName, suggestedCopyStart } from "c/shoreshSetupRules";
import { failed } from "c/shoreshErrors";
import { FIELD } from "c/shoreshSchema";

/**
 * Copy season, a page of its own (wiki decision 56, copy-season-a): the new season's name and
 * first day; the weeks drawn twice, last season's faint over the new ones, so the dates can be
 * seen to move; then what comes along and what stays behind. A first day on another weekday is
 * marked and said ("2027 started on a Sunday"), never refused. The button names the result
 * ("Copy to 2028"). The original season is never changed.
 *
 * What comes along is what SeasonCopier copies (setup belongs to a season, ADR 0018 choice 10
 * for electives); what stays behind belongs to the summer it happened in (ADR 0014 choice 2,
 * ADR 0018 choice 10, decision 56).
 * Fires: copied { seasonId }, cancel.
 */
export default class ShoreshCopySeason extends LightningElement {
  /** The season being copied: its Id, Name, and start and end dates. */
  @api season;
  @api terms;

  newName;
  newStart;
  preview;
  error;
  busy = false;

  focused = false;

  connectedCallback() {
    const start = this.season[FIELD.Season.StartDate];
    this.newStart = suggestedCopyStart(start);
    this.newName = suggestedCopyName(this.season.Name, start, this.newStart);
    this.loadPreview();
  }

  /** Opened: the cursor goes to its heading, where the copy starts (WCAG 2.4.3). */
  renderedCallback() {
    if (!this.focused) {
      const title = this.template.querySelector('[data-id="copy-title"]');
      if (title) {
        this.focused = true;
        title.focus();
      }
    }
  }

  get trimmedName() {
    return (this.newName || "").trim();
  }

  get labels() {
    const t = this.terms;
    return {
      title: `Copy ${t.sIn("Season")}`,
      // Read as one: the page draws the two apart.
      titleName: `Copy ${t.sIn("Season")} ${this.season.Name}`,
      name: `New ${t.sIn("Season")}`,
      start: "First day",
      weeks: `${t.p("Week")} in ${this.season.Name} and in the new ${t.sIn("Season")}`,
      // The button names the result.
      copy: this.trimmedName
        ? `Copy to ${this.trimmedName}`
        : `Copy ${t.sIn("Season")}`,
      comesAlong: "Comes along",
      staysBehind: `Stays in ${this.season.Name}`
    };
  }

  /** What the copy brings, in the camp's words (SeasonCopier, ElectiveCopier). */
  get comesAlong() {
    const t = this.terms;
    return [
      t.p("Week"),
      t.p("Program"),
      t.p("Division"),
      t.p("Group"),
      t.p("TimeBlock"),
      t.p("Location"),
      "Camp words",
      t.p("Activity"),
      t.p("FixedActivity"),
      t.p("RecurringActivity"),
      t.p("ElectiveSet")
    ].map((label) => ({ key: label, label }));
  }

  /**
   * What stays with this season: its schedules and saved versions, its special days and events
   * (ADR 0014 choice 2), its elective seats and the campers' choices (ADR 0018 choice 10).
   */
  get staysBehind() {
    const t = this.terms;
    return [
      "Schedules",
      t.p("Version"),
      t.p("SpecialDay"),
      t.p("SpecialEvent"),
      `${t.s("Elective")} seats`,
      `${t.s("Camper")} choices`
    ].map((label) => ({ key: label, label }));
  }

  /** "2027 started on a Sunday": only when the new first day is another weekday. */
  get weekdayNote() {
    if (!this.preview || !this.preview.weekdaysChange) {
      return null;
    }
    return `${this.season.Name} started on a ${this.preview.oldWeekday}`;
  }

  get previewWeeks() {
    return ((this.preview && this.preview.weeks) || []).map((w, i) => ({
      key: `w${i}`,
      ...w
    }));
  }

  get hasPreviewWeeks() {
    return this.previewWeeks.length > 0;
  }

  /** A season without weeks: its new dates in words instead. */
  get showDates() {
    return !!this.preview && !this.hasPreviewWeeks;
  }

  /** One column per week, each as wide as the page allows. */
  get weeksStyle() {
    return `--weeks: ${Math.max(this.previewWeeks.length, 1)}`;
  }

  get newSeasonLabel() {
    return this.trimmedName || `New ${this.terms.sIn("Season")}`;
  }

  get copyDisabled() {
    return this.busy || !this.preview || !this.trimmedName;
  }

  handleName(event) {
    this.newName = event.detail.value;
  }

  handleStart(event) {
    this.newStart = event.detail.value;
    this.loadPreview();
  }

  async loadPreview() {
    this.preview = null;
    this.error = null;
    const asked = this.newStart;
    if (!asked) {
      return;
    }
    try {
      const preview = await previewCopy({
        seasonId: this.season.Id,
        newStartDate: asked
      });
      // A slower answer for an earlier date must not replace the current one.
      if (asked === this.newStart) {
        this.preview = preview;
      }
    } catch (e) {
      if (asked === this.newStart) {
        this.error = failed(
          "Couldn't work out the copy. Nothing was changed.",
          e
        );
      }
    }
  }

  async handleCopy() {
    this.busy = true;
    this.error = null;
    try {
      const seasonId = await copySeason({
        seasonId: this.season.Id,
        newName: this.newName,
        newStartDate: this.newStart
      });
      this.dispatchEvent(new CustomEvent("copied", { detail: { seasonId } }));
    } catch (e) {
      this.error = failed(
        `${this.terms.s("Season")} not copied. Nothing was saved.`,
        e
      );
    } finally {
      this.busy = false;
    }
  }

  handleCancel() {
    this.dispatchEvent(new CustomEvent("cancel"));
  }
}
