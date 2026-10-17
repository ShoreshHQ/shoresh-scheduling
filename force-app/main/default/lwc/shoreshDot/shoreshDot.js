import { LightningElement, api } from "lwc";

/**
 * The bronze "needs a look" dot (design guide: one dot, one meaning). It shows no words; its words
 * appear in a small tooltip on hover, on a tap, and when it (or the row it sits on) has keyboard
 * focus, and screen readers read them as part of that row (assistive text), without hovering
 * (Greg, 2026-10-17).
 *
 * label: a few words in the camp's terms ("Not set up for Bunk 2"). open: the row it sits on has
 * focus or is highlighted, so the tooltip shows. focusable: the dot is its own tab stop (when the
 * row around it isn't focusable itself).
 */
export default class ShoreshDot extends LightningElement {
  @api label;
  @api open = false;
  @api focusable = false;

  hovered = false;
  tapped = false;
  focused = false;

  get showTip() {
    return (
      !!this.label && (this.open || this.hovered || this.tapped || this.focused)
    );
  }

  get tabIndex() {
    return this.focusable ? "0" : null;
  }

  handleEnter() {
    this.hovered = true;
  }
  handleLeave() {
    this.hovered = false;
    this.tapped = false;
  }
  handleFocus() {
    this.focused = true;
  }
  handleBlur() {
    this.focused = false;
    this.tapped = false;
  }

  /** A tap shows the words, and isn't taken as a click on the row (picking an activity, say). */
  handleTap(event) {
    event.stopPropagation();
    event.preventDefault();
    this.tapped = !this.tapped;
  }
}
