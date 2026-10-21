import { LightningElement, api } from "lwc";

/**
 * The lock glyph: a 12 by 12 padlock drawn in the colour of the words around it (the round 13
 * mock-up's lock, docs/design/manual-build.html). One drawing for every lock in Shoresh, so a
 * locked cell, a fixed activity and a locked-empty cell all show the same mark.
 *
 * label: words for screen readers ("Locked", "Locked empty"). Without one the glyph is
 * decoration only, for when the words beside it already say it.
 */
export default class ShoreshLock extends LightningElement {
  @api label;
}
