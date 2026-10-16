import { LightningElement, api } from "lwc";
import getLabels from "@salesforce/apex/SeasonSetupController.getLabels";
import saveCampLabels from "@salesforce/apex/SeasonSetupController.saveCampLabels";
import canEditCampWords from "@salesforce/apex/SeasonSetupController.canEditCampWords";
import { errorMessage } from "c/shoreshErrors";

/**
 * The camp's own words for each term (decision 0006). Blank means the standard word.
 * Fires: saved, cancel.
 */
export default class ShoreshCampLabels extends LightningElement {
  @api campId;
  @api campName;

  rows = [];
  error;
  busy = false;
  canEdit = false;
  loaded = false;

  connectedCallback() {
    this.load();
  }

  async load() {
    try {
      const [labels, canEdit] = await Promise.all([
        getLabels({ campId: this.campId }),
        canEditCampWords({ campId: this.campId })
      ]);
      this.canEdit = canEdit;
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
    return this.loaded && !this.canEdit;
  }

  get saveDisabled() {
    return this.busy || !this.canEdit;
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

  handleCancel() {
    this.dispatchEvent(new CustomEvent("cancel"));
  }
}
