import { LightningElement, api } from "lwc";

/**
 * An empty area, the same on every screen (Shoresh desktop DESIGN_STANDARD.md §5a, design guide
 * "Empty states"): centred, no card or border, one outline icon (a tent: a camp not set up yet,
 * rather than a software inbox), and a title only ("No programs
 * yet"). What to do next is shown by the screen's own add button, never explained here.
 */
export default class ShoreshEmptyState extends LightningElement {
  @api title;
}
