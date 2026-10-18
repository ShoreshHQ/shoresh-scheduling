import { LightningElement, api } from "lwc";

/**
 * The bronze "needs a look" dot (design guide: one dot, one meaning). It shows no words; its words
 * appear in a small tooltip on hover, on a tap, and when it (or the row it sits on) has keyboard
 * focus, and screen readers read them as part of that row (assistive text), without hovering
 * (Greg, 2026-10-17).
 *
 * label: a few words in the camp's terms ("Not set up for Bunk 2"). open: the row it sits on has
 * focus or is highlighted, so the tooltip shows. focusable: the dot is its own tab stop (when the
 * row around it isn't focusable itself). escapeThrough: Escape hides the words and still reaches
 * the row (a grid cell, where Escape also lets go of what was picked up), so one press does both.
 */
export default class ShoreshDot extends LightningElement {
  @api label;
  @api focusable = false;
  @api escapeThrough = false;

  hovered = false;
  tapped = false;
  focused = false;
  // Escape closed the words; they stay closed until the pointer, focus, or row moves on.
  dismissed = false;
  _open = false;

  /** The row the dot sits on has focus or is highlighted. */
  @api
  get open() {
    return this._open;
  }
  set open(value) {
    if (!!value !== this._open) {
      this.dismissed = false;
    }
    this._open = !!value;
  }

  connectedCallback() {
    // Escape closes the words wherever focus is (the row, or the dot), as tooltips must.
    // It listens first (capture) and uses the key up, so the same press doesn't also close the
    // typing box or answer a question.
    this.onKey = (event) => {
      if (event.key === "Escape" && this.showTip) {
        this.dismissed = true;
        if (!this.escapeThrough) {
          event.stopPropagation();
          event.preventDefault();
        }
      }
    };
    window.addEventListener("keydown", this.onKey, true);
  }

  disconnectedCallback() {
    window.removeEventListener("keydown", this.onKey, true);
  }

  get showTip() {
    return (
      !!this.label &&
      !this.dismissed &&
      (this._open || this.hovered || this.tapped || this.focused)
    );
  }

  /** The words can be pointed at only when the pointer brought them up (hover or tap). */
  get tipClass() {
    return this.hovered || this.tapped
      ? "tip-area tip-area_pointer"
      : "tip-area";
  }

  get tabIndex() {
    return this.focusable ? "0" : null;
  }

  // The tooltip sits inside the dot's area, so the pointer can move onto it and it stays.
  handleEnter() {
    this.hovered = true;
  }
  handleLeave() {
    this.hovered = false;
    this.tapped = false;
    this.dismissed = false;
  }
  handleFocus() {
    this.focused = true;
  }
  handleBlur() {
    this.focused = false;
    this.tapped = false;
    this.dismissed = false;
  }

  /**
   * A tap shows the words, a second tap hides them (on touch a tap also counts as hovering), and
   * neither is taken as a click on the row (picking an activity, say).
   */
  handleTap(event) {
    // A click on the words themselves is left alone.
    if (event.target.closest && event.target.closest(".tip-area")) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    if (this.tapped) {
      this.dismissed = true;
      this.tapped = false;
    } else {
      this.dismissed = false;
      this.tapped = true;
    }
  }
}
