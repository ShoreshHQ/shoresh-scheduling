import { LightningElement, api } from "lwc";

/**
 * What "Update to match setup" would change (ADR 0008 part 6; Greg's Manual Build round 1 #5:
 * "for all, or per slot"), shown before anything changes: one row per change, each with what is
 * there now, what it would be, and why ("Group A · Monday · Period 2  Swim → Open  Deleted from
 * setup"); a day whose time blocks or groups changed is one row, its summary first. Each row has
 * its own Update; Update all makes every change listed. Modal: focus starts on Cancel, as on
 * c-shoresh-ask; Tab stays inside and Escape cancels.
 *
 * changes: SetupMatch.Change rows. busy: an update is on its way (the buttons wait). notice: a
 * line above the list ("Setup changed again since you looked…").
 *
 * Fires: update { keys }, close.
 */
export default class ShoreshSetupMatch extends LightningElement {
  @api heading;
  @api changes = [];
  @api busy = false;
  @api notice;

  focused = false;

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
    // The row just updated is gone: focus goes to the next one, or Cancel (WCAG 2.4.3).
    if (
      !this.template.activeElement &&
      !this.focusOn('[data-id="update-one"]')
    ) {
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
      this.handleClose();
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
    this.dispatchEvent(new CustomEvent("update", { detail: { keys } }));
  }

  handleClose() {
    this.dispatchEvent(new CustomEvent("close"));
  }
}
