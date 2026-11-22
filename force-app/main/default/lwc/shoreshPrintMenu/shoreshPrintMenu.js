import { LightningElement, api } from "lwc";

/**
 * Print or Excel as a rail menu (PUB-6.6): the whole week, then Day, the bunk, activity, location
 * and division words, each opening its choices under it ("Every Bunk" first where there are
 * several), one open at a time. The same menu on the Schedules page, Generated Schedule and
 * Manual Build.
 *
 * label: "Print" or "Excel". alternativeText: its name when the word alone isn't ("Download
 * Excel", Greg 2026-11-12). choices: c/shoreshScheduleExport printChoices. primary: the
 * screen's main button (the Schedules page's Print). disabled: nothing to print. busy: a file or
 * printout under way: a choice then does nothing (the menu stays usable, so focus never drops).
 * Fires: choose { kind, key } (no key for the whole week).
 */
export default class ShoreshPrintMenu extends LightningElement {
  @api label;
  @api alternativeText;
  @api choices = [];
  @api primary = false;
  @api disabled = false;
  @api busy = false;

  openKind = null;

  /**
   * Closed by any way (Escape, its word, a choice, focus leaving it), it opens again with every
   * kind closed. Only the dropdown says when focus has left: in Salesforce a click on a choice
   * moves focus with no sign of where to, and closing the kind then lost the click.
   */
  handleToggle(event) {
    if (!event.detail.open) {
      this.openKind = null;
    }
  }

  get rows() {
    return (this.choices || []).map((kind) => {
      const open = kind.kind === this.openKind;
      return {
        ...kind,
        whole: kind.kind === "week",
        expanded: String(open),
        open,
        value: kind.kind,
        options: kind.options.map((option) => ({
          ...option,
          value: `${kind.kind}|${option.key}`
        }))
      };
    });
  }

  get hidden() {
    return !(this.choices || []).length;
  }

  get off() {
    return this.disabled || this.hidden;
  }

  /** A kind's word opens its choices under it; the one open before closes. */
  handleKind(event) {
    const kind = event.currentTarget.dataset.kind;
    this.openKind = this.openKind === kind ? null : kind;
  }

  handleSelect(event) {
    const value = event.detail.value || "";
    this.openKind = null;
    if (this.busy) {
      return;
    }
    const cut = value.indexOf("|");
    const detail =
      cut < 0
        ? { kind: value }
        : { kind: value.slice(0, cut), key: value.slice(cut + 1) };
    this.dispatchEvent(new CustomEvent("choose", { detail }));
  }
}
