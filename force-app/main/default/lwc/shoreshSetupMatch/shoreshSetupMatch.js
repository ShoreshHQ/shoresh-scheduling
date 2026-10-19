import { LightningElement, api } from "lwc";

/**
 * What "Update to match setup" would change (ADR 0008 part 6; Greg's Manual Build round 1 #5:
 * "for all, or per slot"), shown before anything changes: one row per change, each with what is
 * there now, what it would be, and why ("Group A · Monday · Period 2  Swim → Open  Deleted from
 * setup"); a day whose time blocks or groups changed is one row, its summary first. Each row has
 * its own Update; Update all makes every change listed. Modal: focus starts on Cancel, as on
 * c-shoresh-ask; Tab stays inside and Escape cancels.
 *
 * changes: SetupMatch.Change rows. busy: an update is on its way (the buttons, Cancel and Escape
 * wait: the update's answer is for the list as it was; focus waits on the list itself, inside the
 * dialog). notice: a line above the list ("Setup changed again since you looked…").
 * announcement: words for screen readers only ("Updated to match setup."). Both are read out
 * from a live region that is always in the dialog; said: change it to have them read out again,
 * even the same words as last time (a second update of one row).
 *
 * Fires: update { keys }, close.
 */
export default class ShoreshSetupMatch extends LightningElement {
  @api heading;
  @api changes = [];
  @api busy = false;
  @api notice;
  @api announcement;
  @api said = 0;

  focused = false;
  // Focus was moved to the list while an update was on its way.
  parked = false;

  /**
   * The live region's words. A screen reader reads a live region out when its words change, so
   * each "said" alternates a trailing no-break space: the same words again still change it.
   */
  get spoken() {
    const words = this.notice || this.announcement || "";
    return words && this.said % 2 ? `${words}\u00a0` : words;
  }

  get rows() {
    return (this.changes || []).map((change) => {
      const lines = (change.lines || []).map((line, i) => ({
        ...line,
        key: `${change.key}-${i}`
      }));
      const named = change.summary || (lines[0] && lines[0].place) || "";
      return {
        key: change.key,
        summary: change.summary,
        lines,
        updateLabel: `Update ${named}`
      };
    });
  }

  renderedCallback() {
    if (!this.focused) {
      this.focused = true;
      this.focusOn('[data-id="close"]');
      return;
    }
    const at = this.template.activeElement;
    if (this.busy) {
      // Every button waits: focus waits on the list, so it never leaves the dialog (WCAG 2.4.3).
      if (!at || at.disabled) {
        this.parked = this.focusOn('[data-id="changes"]');
      }
      return;
    }
    // The row just updated is gone, or focus waited on the list for the update: focus goes to
    // the first row's Update, or Cancel. Focus the director put on the list stays there.
    const waited = this.parked && at && at.dataset.id === "changes";
    this.parked = false;
    if ((!at || waited) && !this.focusOn('[data-id="update-one"]')) {
      this.focusOn('[data-id="close"]');
    }
  }

  focusOn(selector) {
    const target = this.template.querySelector(selector);
    if (target && !target.disabled) {
      target.focus();
      return true;
    }
    return false;
  }

  handleKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (!this.busy) {
        this.handleClose();
      }
      return;
    }
    if (event.key === "Tab") {
      const stops = [
        ...this.template.querySelectorAll('[data-id="changes"], button')
      ].filter((stop) => !stop.disabled);
      const at = stops.indexOf(this.template.activeElement);
      const next = event.shiftKey
        ? (at - 1 + stops.length) % stops.length
        : (at + 1) % stops.length;
      event.preventDefault();
      stops[next].focus();
    }
  }

  handleUpdateOne(event) {
    this.update([event.currentTarget.dataset.key]);
  }

  handleUpdateAll() {
    this.update((this.changes || []).map((change) => change.key));
  }

  update(keys) {
    if (this.busy) {
      return;
    }
    this.dispatchEvent(new CustomEvent("update", { detail: { keys } }));
  }

  handleClose() {
    this.dispatchEvent(new CustomEvent("close"));
  }
}
