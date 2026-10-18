import { LightningElement, api } from "lwc";

/**
 * A question before something the director may not mean (Shoresh desktop's confirm dialogs, such
 * as ExclusionConfirmDialog.jsx): a heading, a few lines, Cancel and a button that says what it
 * does ("Turn off anyway"). Modal: focus starts on Cancel, as on the desktop, Tab stays on the
 * two buttons, and Escape cancels.
 *
 * Fires: answer { yes }
 */
export default class ShoreshAsk extends LightningElement {
  @api heading;
  @api lines = [];
  @api confirmLabel = "OK";

  focused = false;

  get lineItems() {
    return (this.lines || []).map((text, i) => ({ key: `l${i}`, text }));
  }

  renderedCallback() {
    if (!this.focused) {
      this.focused = true;
      const no = this.template.querySelector('[data-id="no"]');
      if (no) {
        no.focus();
      }
    }
  }

  handleKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.answer(false);
      return;
    }
    if (event.key === "Tab") {
      const buttons = [...this.template.querySelectorAll("button")];
      const at = buttons.indexOf(this.template.activeElement);
      const next = event.shiftKey
        ? (at - 1 + buttons.length) % buttons.length
        : (at + 1) % buttons.length;
      event.preventDefault();
      buttons[next].focus();
    }
  }

  handleNo() {
    this.answer(false);
  }

  handleYes() {
    this.answer(true);
  }

  answer(yes) {
    this.dispatchEvent(new CustomEvent("answer", { detail: { yes } }));
  }
}
