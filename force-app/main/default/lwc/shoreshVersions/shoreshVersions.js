import { LightningElement, api } from "lwc";

const ORIGINS = {
  Manual: "Manual Build",
  Generated: "Generated Schedule",
  Copied: "Copied",
  Imported: "Imported"
};

/**
 * The Versions button and its list, as on Shoresh desktop's schedule toolbar: one list shared by
 * Manual Build and Generated Schedule. A version can be opened (to look at it in the three views)
 * or renamed. Restoring, saving, and deleting versions come with Manual Build.
 *
 * versions: SchedulesController.getVersions rows. openId: the version on screen.
 * Fires: open { id }, rename { id, name, onDone(saved) }
 */
export default class ShoreshVersions extends LightningElement {
  @api versions = [];
  @api openId;
  @api terms;
  @api busy = false;

  isOpen = false;
  renamingId;
  renameValue = "";

  get title() {
    return this.terms ? this.terms.p("Version") : "Versions";
  }

  get subtitle() {
    const week = this.terms ? this.terms.sIn("Week") : "week";
    return `Saved copies of this ${week}'s schedule. Open one to look at it.`;
  }

  get buttonIcon() {
    return this.isOpen ? "utility:chevronup" : "utility:chevrondown";
  }

  get rows() {
    return (this.versions || []).map((version) => ({
      ...version,
      origin: ORIGINS[version.origin] || version.origin,
      onScreen: version.id === this.openId,
      renaming: version.id === this.renamingId
    }));
  }

  get isEmpty() {
    return !this.versions || this.versions.length === 0;
  }

  get renameDisabled() {
    return this.busy || !this.renameValue.trim();
  }

  handleToggle() {
    this.isOpen = !this.isOpen;
    this.renamingId = null;
  }

  connectedCallback() {
    this.closeOnOutside = (event) => {
      if (this.isOpen && !event.composedPath().includes(this.template.host)) {
        this.isOpen = false;
        this.renamingId = null;
      }
    };
    document.addEventListener("click", this.closeOnOutside);
  }

  disconnectedCallback() {
    document.removeEventListener("click", this.closeOnOutside);
  }

  handleKeydown(event) {
    if (event.key === "Escape") {
      event.stopPropagation();
      if (this.renamingId) {
        this.renamingId = null;
      } else {
        this.isOpen = false;
      }
    }
  }

  handleOpen(event) {
    const id = event.currentTarget.dataset.id;
    this.isOpen = false;
    this.dispatchEvent(new CustomEvent("open", { detail: { id } }));
  }

  handleStartRename(event) {
    const id = event.currentTarget.dataset.id;
    this.renamingId = id;
    this.renameValue = this.versions.find((v) => v.id === id).name;
  }

  handleRenameInput(event) {
    this.renameValue = event.target.value;
  }

  handleRenameKey(event) {
    if (event.key === "Enter" && !this.renameDisabled) {
      this.saveRename();
    }
  }

  handleSaveRename() {
    this.saveRename();
  }

  saveRename() {
    const id = this.renamingId;
    this.dispatchEvent(
      new CustomEvent("rename", {
        detail: {
          id,
          name: this.renameValue.trim(),
          onDone: (saved) => {
            if (saved && this.renamingId === id) {
              this.renamingId = null;
            }
          }
        }
      })
    );
  }
}
