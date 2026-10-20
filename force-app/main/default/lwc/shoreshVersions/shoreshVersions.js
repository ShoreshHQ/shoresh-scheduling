import { LightningElement, api } from "lwc";

const ORIGINS = {
  Manual: "Manual Build",
  Generated: "Generated Schedule",
  Copied: "Copied",
  Imported: "Imported"
};
// VersionReason__c's value for a version kept by the app ("Before Restore").
const AUTO_SAVED = "AutoSaved";

/**
 * The Versions button and its list, as on Shoresh desktop's schedule toolbar (VersionsDropdown):
 * one list shared by Manual Build and Generated Schedule. On the Schedules page a version can be
 * opened (to look at it in the three views) or renamed. On Manual Build (restore) its action is
 * Restore (copied into the week being built), a version can be deleted (a second click,
 * "Delete?", as on the desktop), and the current week can be saved as a version ("Name current
 * version…", Save version).
 *
 * versions: SchedulesController.getVersions rows. openId: the version on screen. restore: Manual
 * Build's list (Restore, delete, Save version); noDraft: Restore and rename only (Generated
 * Schedule before its week is generated). A version that was once the week's published schedule
 * says so and has no delete (it is kept as history).
 * announceWith: the page's way to read words out (its one live region); without it, the list
 * reads them out from its own.
 * Fires: open { id } (Restore when restore), rename { id, name, onDone(saved) },
 * delete { id }, save { name, onDone(saved) }
 */
export default class ShoreshVersions extends LightningElement {
  _versions = [];
  @api openId;
  @api terms;
  @api busy = false;
  @api restore = false;
  // Generated Schedule before its week is generated: Restore and rename only (nothing to save
  // as a version, and no week to delete one from).
  @api noDraft = false;
  @api announceWith;

  isOpen = false;
  renamingId;
  renameValue = "";
  // The version whose delete was clicked once: it now asks "Delete?".
  deletingId;
  saveName = "";
  // Said to screen readers: "Delete Before the trip? Press again to delete."
  announcement = "";
  // After the panel closes, focus goes back to the Versions button (desktop design audit #7).
  focusButtonAfterRender = false;
  // After a delete: { id, index }. Once the action is done (busy false; the list is read again
  // first), focus goes to the version now at that place, or back to the row if it is still there
  // (refused).
  focusAfterDelete = null;
  // After a rename is saved or let go: the row's rename button (the box it was in is gone).
  focusRenameAfterRender = null;

  @api
  get versions() {
    return this._versions;
  }
  set versions(value) {
    this._versions = value || [];
  }

  renderedCallback() {
    if (this.focusButtonAfterRender) {
      this.focusButtonAfterRender = false;
      const button = this.template.querySelector('[data-id="versions-button"]');
      if (button) {
        button.focus();
      }
    }
    if (this.focusRenameAfterRender && !this.renamingId) {
      const id = this.focusRenameAfterRender;
      this.focusRenameAfterRender = null;
      const rename = this.template.querySelector(
        `[data-action="rename"][data-id="${id}"]`
      );
      if (rename) {
        rename.focus();
      }
    }
    if (this.focusAfterDelete && !this.busy) {
      this.focusAfterDeleted();
    }
  }

  focusAfterDeleted() {
    const { id, index } = this.focusAfterDelete;
    this.focusAfterDelete = null;
    const still = this.template.querySelector(
      `[data-action="delete"][data-id="${id}"]`
    );
    const actions = this.template.querySelectorAll('[data-action="open"]');
    if (still) {
      still.focus();
    } else if (actions.length) {
      actions[Math.min(index, actions.length - 1)].focus();
    } else {
      const button = this.template.querySelector('[data-id="versions-button"]');
      if (button) {
        button.focus();
      }
    }
  }

  get title() {
    return this.terms ? this.terms.p("Version") : "Versions";
  }

  get expanded() {
    return String(this.isOpen);
  }

  get ownRegion() {
    return typeof this.announceWith !== "function";
  }

  /** Read out: through the page's live region when it has one, else this list's. */
  say(text) {
    if (this.ownRegion) {
      this.announcement = text;
    } else if (text) {
      this.announceWith(text);
    }
  }

  get buttonIcon() {
    return this.isOpen ? "utility:chevronup" : "utility:chevrondown";
  }

  get rows() {
    return this._versions.map((version) => {
      const confirming = version.id === this.deletingId;
      // "Manual · Auto-saved · " then when it was saved. Once the week's published schedule:
      // "Published", unless the name already says it and when ("Published Oct 18, 2:40 PM").
      const showSaved = !version.namedByPublish;
      const meta = [
        ORIGINS[version.origin] || version.origin,
        version.reason === AUTO_SAVED ? "Auto-saved" : null,
        version.publishedAt && showSaved ? "Published" : null
      ]
        .filter(Boolean)
        .join(" · ");
      return {
        ...version,
        meta: showSaved ? `${meta} · ` : meta,
        showSaved,
        // Once the week's published schedule: kept as history, so never deleted (SchedulePublish).
        deletable: this.restore && !this.noDraft && !version.publishedAt,
        onScreen: version.id === this.openId,
        renaming: version.id === this.renamingId,
        deleteLabel: confirming ? "Delete?" : "delete",
        deleteClass: confirming ? "link link_danger" : "link link_quiet",
        deleteName: confirming
          ? `Delete ${version.name}? Press again to delete.`
          : `Delete ${version.name}`,
        actionName: `${this.actionLabel} ${version.name}`,
        renameName: `Rename ${version.name}`
      };
    });
  }

  get actionLabel() {
    return this.restore ? "Restore" : "Open";
  }
  /** Restore waits while an edit is saving (it would paint over it); Open never does. */
  get actionDisabled() {
    return this.restore && this.busy;
  }
  get canSave() {
    return this.restore && !this.noDraft;
  }
  get versionWord() {
    return this.terms ? this.terms.sIn("Version") : "version";
  }
  get saveLabel() {
    return `Save ${this.versionWord}`;
  }
  get savePlaceholder() {
    return `Name current ${this.versionWord}…`;
  }
  get saveDisabled() {
    return this.busy || !this.saveName.trim();
  }

  /** Delete takes two clicks: the first asks "Delete?" (desktop), leaving it forgets that. */
  handleDelete(event) {
    const id = event.currentTarget.dataset.id;
    const version = this._versions.find((v) => v.id === id);
    if (this.deletingId !== id) {
      this.deletingId = id;
      this.say(`Delete ${version ? version.name : ""}? Press again to delete.`);
      return;
    }
    this.deletingId = null;
    this.say("");
    this.focusAfterDelete = {
      id,
      index: this._versions.findIndex((v) => v.id === id)
    };
    this.dispatchEvent(new CustomEvent("delete", { detail: { id } }));
  }
  handleDeleteBlur() {
    this.deletingId = null;
  }

  handleSaveInput(event) {
    this.saveName = event.target.value;
  }
  handleSaveKey(event) {
    if (event.key === "Enter" && !this.saveDisabled) {
      this.save();
    }
  }
  handleSave() {
    this.save();
  }
  save() {
    this.dispatchEvent(
      new CustomEvent("save", {
        detail: {
          name: this.saveName.trim(),
          onDone: (saved) => {
            if (saved) {
              this.saveName = "";
            }
          }
        }
      })
    );
  }

  get isEmpty() {
    return this._versions.length === 0;
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
        this.focusRenameAfterRender = this.renamingId;
        this.renamingId = null;
      } else if (this.isOpen) {
        this.isOpen = false;
        this.focusButtonAfterRender = true;
      }
    }
  }

  handleOpen(event) {
    const id = event.currentTarget.dataset.id;
    this.isOpen = false;
    this.focusButtonAfterRender = true;
    this.dispatchEvent(new CustomEvent("open", { detail: { id } }));
  }

  handleStartRename(event) {
    const id = event.currentTarget.dataset.id;
    this.renamingId = id;
    this.renameValue = this._versions.find((v) => v.id === id).name;
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
              this.focusRenameAfterRender = id;
            }
          }
        }
      })
    );
  }
}
