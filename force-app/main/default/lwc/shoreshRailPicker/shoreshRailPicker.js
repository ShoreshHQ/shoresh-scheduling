import { LightningElement, api } from "lwc";

/**
 * A choice on the rail (ADR 0008 part 7): the week shown with an arrow either side ("‹ Week 3 ›",
 * the week raised as every current choice on the rail is), or the program as a word and its
 * chevron. The word opens every choice in a menu, so any week is one step away.
 *
 * Takes and gives what lightning-combobox does, so the screens use it the same way: label (the
 * camp's word, read out as the group's name), value, options ([{ label, value }]), disabled;
 * fires change { value } when another is chosen. arrows: the arrows and the raised look.
 */
export default class ShoreshRailPicker extends LightningElement {
  @api label;
  @api value;
  @api options = [];
  @api disabled = false;
  @api arrows = false;

  get list() {
    return this.options || [];
  }
  get index() {
    return this.list.findIndex((o) => o.value === this.value);
  }
  get shown() {
    return this.list[this.index] || null;
  }
  get shownLabel() {
    return this.shown ? this.shown.label : this.label;
  }
  /** "Week 3, Week": the choice first (the words shown), then what it is a choice of. */
  get buttonName() {
    return this.shown ? `${this.shown.label}, ${this.label}` : this.label;
  }
  get rows() {
    return this.list.map((o) => ({
      ...o,
      checked: String(o.value === this.value)
    }));
  }

  get previous() {
    return this.index > 0 ? this.list[this.index - 1] : null;
  }
  get next() {
    return this.index >= 0 && this.index < this.list.length - 1
      ? this.list[this.index + 1]
      : null;
  }
  get noPrevious() {
    return this.disabled || !this.previous;
  }
  get noNext() {
    return this.disabled || !this.next;
  }
  get previousLabel() {
    return this.previous ? `Previous: ${this.previous.label}` : "Previous";
  }
  get nextLabel() {
    return this.next ? `Next: ${this.next.label}` : "Next";
  }

  choose(value) {
    if (this.disabled || value === undefined || value === this.value) {
      return;
    }
    this.dispatchEvent(new CustomEvent("change", { detail: { value } }));
  }
  handleSelect(event) {
    event.stopPropagation();
    this.choose(event.detail.value);
  }
  handlePrevious() {
    if (this.previous) {
      this.choose(this.previous.value);
    }
  }
  handleNext() {
    if (this.next) {
      this.choose(this.next.value);
    }
  }

  /** Focus on the choice (as lightning-combobox's focus()). */
  @api
  focus() {
    const choose = this.template.querySelector('[data-id="choose"]');
    if (choose) {
      choose.focus();
    }
  }
}
