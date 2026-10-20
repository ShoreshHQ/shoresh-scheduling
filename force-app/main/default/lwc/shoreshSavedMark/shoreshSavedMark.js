import { LightningElement, api } from "lwc";

/**
 * The quiet "✓ Saved" a setup form shows once a field it saves as you go is saved (desktop
 * CampScreen.jsx "✓ Saved"). It stays until the director changes something in that form again.
 * Screen readers hear "Saved" through a polite live region, again on every save even when the
 * words are the same.
 *
 * saved(): show it (and say it). clear(): hide it.
 */
export default class ShoreshSavedMark extends LightningElement {
  text = "";
  flip = false;

  @api
  saved() {
    // Every other time with a trailing non-breaking space: the words read the same, but the live
    // region's text changes, so the same message is read again (as the setup tables do).
    this.flip = !this.flip;
    this.text = this.flip ? "Saved" : "Saved ";
  }

  @api
  clear() {
    this.text = "";
  }

  get shown() {
    return !!this.text;
  }
}

/**
 * Whether a focusout left the field it is heard on (event.currentTarget), rather than moving
 * inside it (a date field's calendar, a dual listbox's buttons). Saving as you go saves then.
 */
export function leftField(event) {
  const field = event.currentTarget;
  const to = event.relatedTarget;
  return !(to && field && (to === field || field.contains(to)));
}
