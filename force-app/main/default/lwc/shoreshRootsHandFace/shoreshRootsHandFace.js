import { LightningElement, api } from "lwc";

/**
 * One hand card's face (repo ADR 0020 choice 10), the same on the hand and on the sheet a screen
 * grows out of: what it is about, the few words for what is off, and its picture, drawn by
 * c-shoresh-roots-glimpse from c/shoreshRootsLooks. The card's surface and lift are its host's,
 * styled by whoever holds it.
 */
export default class ShoreshRootsHandFace extends LightningElement {
  /** A card from c/shoreshRootsLooks looksOf. */
  @api card;

  get name() {
    return this.card?.name || "";
  }

  get small() {
    return this.card?.small || null;
  }

  get off() {
    return this.card?.off || "";
  }

  get glimpse() {
    return this.card?.glimpse || null;
  }
}
