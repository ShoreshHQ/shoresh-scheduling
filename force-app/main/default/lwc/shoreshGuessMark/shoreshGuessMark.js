import { LightningElement, api } from "lwc";

/**
 * Something Shoresh guessed from an imported file, marked for a look (Greg, decision 45; ADR
 * 0006 §21). The design system's needs-a-look corner (ADR 0015 choice 6) in a cell's top right
 * corner, as on the desktop's provenance dot (ActivitiesScreen.jsx RuleProvenanceDot): pressed,
 * it opens a small pop with what it means ("Guessed from your file") and **Looks right**, which
 * asks the screen to forget the guess (`confirm`). Changing the value clears it too (the screen
 * stops passing it).
 *
 * label: what the mark means, shown in the pop. name: the mark's name for screen readers, which
 * says whose it is ("How often for Swim: guessed from your file"). busy: Looks right waits.
 *
 * Opening puts the cursor on Looks right; Escape, or leaving the pop, closes it, Escape putting
 * the cursor back on the mark.
 *
 * wordsOnly: the same corner for a problem the director fixes in the cell itself (an offering's
 * seats not filled in yet, repo ADR 0018): its words only, no Looks right; the cursor stays on
 * the mark.
 */
export default class ShoreshGuessMark extends LightningElement {
  @api label;
  @api name;
  @api busy = false;
  @api wordsOnly = false;

  open = false;
  focusLooksRight = false;

  get expanded() {
    return this.open ? "true" : "false";
  }

  renderedCallback() {
    if (this.focusLooksRight && this.open) {
      this.focusLooksRight = false;
      const button = this.template.querySelector('[data-id="looks-right"]');
      if (button) {
        button.focus();
      }
    }
  }

  /** The cursor goes to the mark (after the pop closes, or from the screen). */
  @api
  focus() {
    const mark = this.template.querySelector('[data-id="guess-mark"]');
    if (mark) {
      mark.focus();
    }
  }

  get canConfirm() {
    return !this.wordsOnly;
  }

  handleToggle(event) {
    // Not a click on the row (its details, its save).
    event.stopPropagation();
    this.open = !this.open;
    this.focusLooksRight = this.open && this.canConfirm;
  }

  handleKey(event) {
    if (event.key === "Escape" && this.open) {
      // Closes the pop only: not the row's own Escape (which puts its values back).
      event.stopPropagation();
      event.preventDefault();
      this.open = false;
      this.focus();
    }
  }

  /** Leaving the mark and its pop closes it. */
  handleLeave(event) {
    const to = event.relatedTarget;
    if (to && this.template.contains(to)) {
      return;
    }
    this.open = false;
  }

  handleConfirm(event) {
    event.stopPropagation();
    this.dispatchEvent(new CustomEvent("confirm"));
  }
}
