import { LightningElement, api } from "lwc";

/**
 * ‹ Roots on a screen's rail (wiki decision 68, the approved mock-up's back; repo ADR 0020
 * choice 6). It says only "back to Roots" (backtoroots, bubbling up the template it sits in,
 * never out of it); a screen of its own says it again from its host, and the page runs the same
 * journey home as the menu's Roots.
 */
export default class ShoreshRootsBack extends LightningElement {
  /** Set when nothing of the host's follows it in the rail group, so the rail's own separator
   * is the only one (no doubled divider beside ‹ Roots). */
  @api lineless = false;

  get showsLine() {
    return !this.lineless;
  }

  handleClick() {
    this.dispatchEvent(new CustomEvent("backtoroots", { bubbles: true }));
  }
}
