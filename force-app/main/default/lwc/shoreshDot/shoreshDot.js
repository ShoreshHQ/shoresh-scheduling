import { LightningElement, api } from "lwc";

/**
 * The bronze "needs a look" dot (design guide: one dot, one meaning). It shows no words; its words
 * appear in a small tooltip on hover, on a tap, and when it (or the row it sits on) has keyboard
 * focus, and screen readers read them as part of that row (assistive text), without hovering
 * (Greg, 2026-10-17).
 *
 * shape: "dot" (the default), or "overlap" for two things that overlap (two dates, say): two
 * linked rings, so it reads differently from a same-name dot without relying on colour
 * (WCAG 1.4.1).
 *
 * label: a few words in the camp's terms ("Not set up for Bunk 2"). open: the row it sits on has
 * focus or is highlighted, so the tooltip shows. focusable: the dot is its own tab stop (when the
 * row around it isn't focusable itself). inCell: the dot sits in a grid cell, which carries
 * focus and taps: a tap goes to the cell (whose focus shows the words), so the dot never swallows
 * a tap meant for the cell; while the words show because the cell has keyboard focus, Escape hides
 * them and still reaches the cell (where it also puts back what was picked up), so one press does
 * both; and the words open toward the cell, wrapping, so the grid's edge never cuts them off.
 */
export default class ShoreshDot extends LightningElement {
  @api label;
  @api focusable = false;
  @api inCell = false;
  @api shape = "dot";

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
        // Through to the cell only when its keyboard focus brought the words up.
        if (!(this.inCell && this._open)) {
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

  get isOverlap() {
    return this.shape === "overlap";
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
    const where = this.inCell ? "tip-area tip-area_cell" : "tip-area";
    return this.hovered || this.tapped ? `${where} tip-area_pointer` : where;
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
    // In a grid cell the tap is the cell's (its focus shows the words).
    if (this.inCell) {
      return;
    }
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
