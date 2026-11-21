import { LightningElement, api } from "lwc";

/**
 * A question before something the director may not mean (Shoresh desktop's confirm dialogs, such
 * as ExclusionConfirmDialog.jsx): a heading, a few lines, Cancel and a button that says what it
 * does ("Turn off anyway"). Modal: focus starts on Cancel, as on the desktop, Tab stays on the
 * lines (focusable so a long list scrolls with the keyboard) and the two buttons, and Escape
 * cancels.
 *
 * A line may be a link to what it names (Publish's problems, PUB-6.4): choosing it is no, and says
 * where to go.
 *
 * Fires: answer { yes, go } (go only from a line's link)
 */
export default class ShoreshAsk extends LightningElement {
  @api heading;
  @api lines = [];
  // Callers name what the button does; a verb, never "OK", if one forgets.
  @api confirmLabel = "Go ahead";
  // "danger" for a button that deletes: the one red, the guide's --danger (W4). Anything else
  // is the main button.
  @api tone;

  focused = false;

  get yesClass() {
    return this.tone === "danger"
      ? "slds-button ask-danger"
      : "slds-button slds-button_brand";
  }

  /**
   * A line is its words, or { text, go, sub }: sub sits under the line before it; go makes it a
   * link that answers no, with where to go (answer { yes: false, go }).
   */
  get lineItems() {
    return (this.lines || []).map((line, i) => {
      const item = typeof line === "string" ? { text: line } : line;
      return {
        key: `l${i}`,
        index: i,
        text: item.text,
        go: !!item.go,
        className: item.sub
          ? "slds-m-bottom_x-small ask-sub"
          : "slds-m-bottom_x-small"
      };
    });
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

  /** A line that goes somewhere: no, and where to go. */
  handleGo(event) {
    const line = this.lines[Number(event.currentTarget.dataset.index)];
    this.dispatchEvent(
      new CustomEvent("answer", { detail: { yes: false, go: line.go } })
    );
  }

  answer(yes) {
    this.dispatchEvent(new CustomEvent("answer", { detail: { yes } }));
  }
}
