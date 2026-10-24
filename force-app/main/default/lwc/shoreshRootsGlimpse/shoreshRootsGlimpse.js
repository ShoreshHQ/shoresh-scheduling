import { LightningElement, api } from "lwc";

/**
 * Draws one Roots card's glimpse (repo ADR 0020): the shapes c/shoreshRootsFaces made from the
 * camp's own data, every fill and stroke a design-system token (ADR 0015). No markup is ever set
 * as text: each shape is an SVG element in this template.
 */
export default class ShoreshRootsGlimpse extends LightningElement {
  /** { w, h, align, fade, shapes } from c/shoreshRootsFaces glimpseOf. */
  @api glimpse;

  get shapes() {
    return (this.glimpse && this.glimpse.shapes) || [];
  }

  get viewBox() {
    const g = this.glimpse || {};
    return `0 0 ${g.w || 220} ${g.h || 128}`;
  }

  get align() {
    return `${(this.glimpse && this.glimpse.align) || "xMidYMax"} meet`;
  }

  /** A glimpse that runs on past its card fades out at that edge. */
  get svgClass() {
    const fade = this.glimpse && this.glimpse.fade;
    return fade ? `glimpse glimpse_fade-${fade}` : "glimpse";
  }
}
