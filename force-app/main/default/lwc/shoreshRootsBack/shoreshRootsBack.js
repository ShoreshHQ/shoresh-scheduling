import { LightningElement } from "lwc";

/**
 * ‹ Roots on a screen's rail (wiki decision 68, the approved mock-up's back; repo ADR 0020
 * choice 6). It says only "back to Roots" (backtoroots, bubbling out of the screen); the page
 * runs the same journey home as the menu's Roots.
 */
export default class ShoreshRootsBack extends LightningElement {
  handleClick() {
    this.dispatchEvent(
      new CustomEvent("backtoroots", { bubbles: true, composed: true })
    );
  }
}
