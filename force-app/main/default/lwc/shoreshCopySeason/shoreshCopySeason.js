import { LightningElement, api } from "lwc";
import previewCopy from "@salesforce/apex/SeasonSetupController.previewCopy";
import copySeason from "@salesforce/apex/SeasonSetupController.copySeason";
import { suggestedCopyName, suggestedCopyStart } from "c/shoreshSetupRules";
import { errorMessage } from "c/shoreshErrors";
import { FIELD } from "c/shoreshSchema";

/**
 * "Copy last season": pick a name and a new start date, see exactly where every week lands,
 * then copy. The original season is never changed.
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

  connectedCallback() {
    const start = this.season[FIELD.Season.StartDate];
    this.newStart = suggestedCopyStart(start);
    this.newName = suggestedCopyName(this.season.Name, start, this.newStart);
    this.loadPreview();
  }

  get labels() {
    const t = this.terms;
    return {
      title: `Copy ${t.sIn("Season")} "${this.season.Name}"`,
      intro:
        `Makes a new ${t.sIn("Season")} with the same ${t.pIn("Week")}, ${t.pIn("Program")}, ` +
        `${t.pIn("Division")}, ${t.pIn("Group")}, ${t.pIn("TimeBlock")} and ${t.pIn("WeekException")}, ` +
        `each linked to the one it came from. "${this.season.Name}" stays exactly as it is.`,
      name: `New ${t.sIn("Season")} name`,
      start: "New start date",
      weeks: `${t.p("Week")} in the new ${t.sIn("Season")}`,
      week: t.s("Week"),
      copy: `Copy ${t.sIn("Season")}`
    };
  }

  get weekdayWarning() {
    if (!this.preview || !this.preview.weekdaysChange) {
      return null;
    }
    return (
      `"${this.season.Name}" started on a ${this.preview.oldWeekday}; this date is a ${this.preview.newWeekday}. ` +
      `Every ${this.terms.sIn("Week")} will move to different days of the week. ` +
      `Choose a ${this.preview.oldWeekday} to keep them on the same days.`
    );
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

  get copyDisabled() {
    return this.busy || !this.preview || !this.newName || !this.newName.trim();
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
        this.error = errorMessage(e);
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
      this.error = errorMessage(e);
    } finally {
      this.busy = false;
    }
  }

  handleCancel() {
    this.dispatchEvent(new CustomEvent("cancel"));
  }
}
