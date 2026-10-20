import { LightningElement, api } from "lwc";

/**
 * A question before something the director may not mean (Shoresh desktop's confirm dialogs, such
 * as ExclusionConfirmDialog.jsx): a heading, a few lines, Cancel and a button that says what it
 * does ("Turn off anyway"). Modal: focus starts on Cancel, as on the desktop, Tab stays on the
 * lines (focusable so a long list scrolls with the keyboard) and the two buttons, and Escape
 * cancels.
 *
 * Fires: answer { yes }
 */
export default class ShoreshAsk extends LightningElement {
  @api heading;
  @api lines = [];
  // Callers name what the button does; a verb, never "OK", if one forgets.
  @api confirmLabel = "Go ahead";

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
      const stops = [
        ...this.template.querySelectorAll('[data-id="lines"], button')
      ];
      const at = stops.indexOf(this.template.activeElement);
      const next = event.shiftKey
        ? (at - 1 + stops.length) % stops.length
        : (at + 1) % stops.length;
      event.preventDefault();
      stops[next].focus();
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
