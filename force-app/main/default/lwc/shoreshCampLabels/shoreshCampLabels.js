import { LightningElement, api } from "lwc";
import getLabels from "@salesforce/apex/SeasonSetupController.getLabels";
import saveCampLabels from "@salesforce/apex/SeasonSetupController.saveCampLabels";
import campWordsBlockedReason from "@salesforce/apex/SeasonSetupController.campWordsBlockedReason";
import { failed } from "c/shoreshErrors";
import { leftField } from "c/shoreshSavedMark";

const NOT_SAVED = "Camp words not saved. Your changes are still here.";

/**
 * The camp's own words for each term (decision 0006). Blank means the standard word.
 *
 * Saved as you go, like the setup tables (ADR 0011, decision 26 (4)): a word is saved when the
 * director leaves its box (or presses Enter), one save at a time, each with every word as it is
 * on screen then. "Saved" shows quietly; a refusal shows under the box that was left, with the
 * typing kept.
 *
 * Fires: saved (after each save); failed { message } (a save refused).
 * @api focusHeading(): the cursor to the screen's heading.
 */
export default class ShoreshCampLabels extends LightningElement {
  @api campId;
  @api campName;

  rows = [];
  error;
  blockedReason;
  loaded = false;
  // Something typed and not sent yet.
  dirty = false;
  // Saves go one at a time, in order.
  saves = Promise.resolve();
  // Why the last save was refused, under the box that was left: { term, field, message }.
  fieldError = null;

  connectedCallback() {
    this.load();
  }

  async load() {
    try {
      const [labels, blockedReason] = await Promise.all([
        getLabels({ campId: this.campId }),
        campWordsBlockedReason({ campId: this.campId })
      ]);
      this.blockedReason = blockedReason;
      this.loaded = true;
      this.rows = labels.map((row) => ({
        ...row,
        singular: row.isCustom ? row.singular : "",
        plural: row.isCustom ? row.plural : ""
      }));
    } catch (e) {
      this.error = failed(
        "Couldn't open the camp words. Nothing was changed.",
        e
      );
    }
  }

  get title() {
    return `Words ${this.campName || "your camp"} uses`;
  }

  get readOnly() {
    return this.loaded && !!this.blockedReason;
  }

  /** The rows as shown, each with the refusal under the box it belongs to (if any). */
  get view() {
    const at = this.fieldError;
    return this.rows.map((row) => ({
      ...row,
      singularError:
        at && at.term === row.term && at.field === "singular"
          ? at.message
          : null,
      pluralError:
        at && at.term === row.term && at.field === "plural" ? at.message : null
    }));
  }

  @api
  focusHeading() {
    const heading = this.template.querySelector("[data-heading]");
    if (heading) {
      heading.focus();
    }
  }

  handleChange(event) {
    const { term, field } = event.target.dataset;
    this.rows = this.rows.map((row) => {
      return row.term === term ? { ...row, [field]: event.detail.value } : row;
    });
    this.dirty = true;
    if (
      this.fieldError &&
      this.fieldError.term === term &&
      this.fieldError.field === field
    ) {
      this.fieldError = null;
    }
    const mark = this.template.querySelector("c-shoresh-saved-mark");
    if (mark) {
      mark.clear();
    }
  }

  handleLeave(event) {
    if (leftField(event)) {
      this.save(event.currentTarget.dataset);
    }
  }

  handleKey(event) {
    if (event.key === "Enter") {
      this.save(event.currentTarget.dataset);
    }
  }

  /** Sends every word as it is now, after any save still under way. */
  save({ term, field }) {
    if (!this.dirty || this.readOnly || !this.loaded) {
      return this.saves;
    }
    this.dirty = false;
    const labels = this.rows;
    this.saves = this.saves.then(async () => {
      try {
        await saveCampLabels({ campId: this.campId, labels });
        // Every word went, so an earlier refusal no longer stands.
        this.fieldError = null;
        const mark = this.template.querySelector("c-shoresh-saved-mark");
        if (mark) {
          mark.saved();
        }
        this.dispatchEvent(new CustomEvent("saved"));
      } catch (e) {
        // Still to save: the next box left sends it again.
        this.dirty = true;
        const message = failed(NOT_SAVED, e);
        this.fieldError = { term, field, message };
        // The setup page says it at the top too if this screen is no longer showing.
        this.dispatchEvent(new CustomEvent("failed", { detail: { message } }));
      }
    });
    return this.saves;
  }
}
