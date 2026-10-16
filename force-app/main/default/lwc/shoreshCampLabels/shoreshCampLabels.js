import { LightningElement, api } from "lwc";
import getLabels from "@salesforce/apex/SeasonSetupController.getLabels";
import saveCampLabels from "@salesforce/apex/SeasonSetupController.saveCampLabels";
import campWordsBlockedReason from "@salesforce/apex/SeasonSetupController.campWordsBlockedReason";
import { errorMessage } from "c/shoreshErrors";

/**
 * The camp's own words for each term (decision 0006). Blank means the standard word.
 * Fires: saved.
 */
export default class ShoreshCampLabels extends LightningElement {
  @api campId;
  @api campName;

  rows = [];
  error;
  busy = false;
  blockedReason;
  loaded = false;

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
      this.error = errorMessage(e);
    }
  }

  get title() {
    return `Words ${this.campName || "your camp"} uses`;
  }

  get readOnly() {
    return this.loaded && !!this.blockedReason;
  }

  get saveDisabled() {
    return this.busy || !this.loaded || !!this.blockedReason;
  }

  handleChange(event) {
    const { term, field } = event.target.dataset;
    this.rows = this.rows.map((row) => {
      return row.term === term ? { ...row, [field]: event.detail.value } : row;
    });
  }

  async handleSave() {
    this.busy = true;
    this.error = null;
    try {
      await saveCampLabels({ campId: this.campId, labels: this.rows });
      this.dispatchEvent(new CustomEvent("saved"));
    } catch (e) {
      this.error = errorMessage(e);
    } finally {
      this.busy = false;
    }
  }

  /** Puts back the words as saved. */
  handleCancel() {
    this.error = null;
    this.load();
  }
}
