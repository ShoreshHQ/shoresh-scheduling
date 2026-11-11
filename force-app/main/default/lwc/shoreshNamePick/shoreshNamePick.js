import { LightningElement, api } from "lwc";

/** Names compared as people type them: capitals and spaces don't count. */
const fold = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/\s+/g, "");

/**
 * A picklist you type into, as the grid's typing box (ADR 0008 §6): the options whose name holds
 * what is typed, and, when none is that name, 'Add "<name>" to <addTo>'. Nothing is picked unless
 * the person picks it: Enter takes the line highlighted (the option named exactly, else the only
 * one starting so, else Add), and leaving the field with anything else puts back what it held, so
 * typing never quietly lands on another name (UX pass 2026-11-10: typing "Drama" into the
 * offering's picklist picked Art).
 *
 * options: [{ label, value }]. value: the one picked. addTo: the words after "to" ("activities");
 * left out, nothing new can be added. Says "change" { value } for an option, "addname" { name }
 * for Add.
 */
export default class ShoreshNamePick extends LightningElement {
  @api label;
  @api options = [];
  @api addTo;
  @api placeholder;
  @api disabled = false;
  @api required = false;

  _value = null;
  typed = null;
  open = false;
  highlighted = 0;

  @api
  get value() {
    return this._value;
  }
  set value(next) {
    this._value = next || null;
    this.typed = null;
  }

  get pickedLabel() {
    const found = (this.options || []).find((o) => o.value === this._value);
    return found ? found.label : "";
  }
  get text() {
    return this.typed === null ? this.pickedLabel : this.typed;
  }
  get ariaRequired() {
    return this.required ? "true" : "false";
  }
  get expanded() {
    return this.open ? "true" : "false";
  }

  /** The lines under the field: the names that hold what is typed, then Add when none is it. */
  get choices() {
    const typed = this.typed === null ? "" : this.typed.trim();
    const want = fold(typed);
    const all = this.options || [];
    const matching = want
      ? all.filter((o) => fold(o.label).includes(want))
      : all;
    const lines = matching.map((o) => ({
      kind: "pick",
      label: o.label,
      value: o.value
    }));
    if (this.addTo && typed && !all.some((o) => fold(o.label) === want)) {
      lines.push({
        kind: "add",
        label: `Add "${typed}" to ${this.addTo}`,
        name: typed
      });
    }
    return lines;
  }
  /** What Enter takes before an arrow is pressed: the exact name, the only one starting so, else Add. */
  get startAt() {
    const lines = this.choices;
    const want = fold(this.typed || "");
    if (!want) return 0;
    const exact = lines.findIndex(
      (l) => l.kind === "pick" && fold(l.label) === want
    );
    if (exact >= 0) return exact;
    const starting = lines.filter(
      (l) => l.kind === "pick" && fold(l.label).startsWith(want)
    );
    if (starting.length === 1) return lines.indexOf(starting[0]);
    const add = lines.findIndex((l) => l.kind === "add");
    return add >= 0 ? add : -1;
  }
  get shownOptions() {
    return this.choices.map((line, index) => ({
      ...line,
      index,
      id: `name-pick-${index}`,
      selected: index === this.highlighted ? "true" : "false",
      className: index === this.highlighted ? "option option_on" : "option"
    }));
  }
  get activeId() {
    return this.open &&
      this.highlighted >= 0 &&
      this.highlighted < this.choices.length
      ? `name-pick-${this.highlighted}`
      : null;
  }

  handleFocus() {
    if (!this.disabled) {
      this.open = true;
      this.highlighted = this.choices.findIndex((l) => l.value === this._value);
    }
  }
  handleInput(event) {
    this.typed = event.target.value;
    this.open = true;
    this.highlighted = this.startAt;
  }
  handleKeyDown(event) {
    const count = this.choices.length;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      this.open = true;
      if (count) {
        const step = event.key === "ArrowDown" ? 1 : -1;
        this.highlighted =
          (Math.max(this.highlighted, -1) + step + count) % count;
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      const line = this.choices[this.highlighted];
      if (this.open && line) this.take(line);
    } else if (event.key === "Escape" && this.open) {
      event.preventDefault();
      event.stopPropagation();
      this.putBack();
    }
  }
  /** A mouse press on a line keeps the field's focus, so leaving doesn't put the text back first. */
  handleOptionMouseDown(event) {
    event.preventDefault();
  }
  handleOptionClick(event) {
    const line = this.choices[Number(event.currentTarget.dataset.index)];
    if (line) this.take(line);
  }
  /** Leaving: the name typed exactly is taken; anything else puts back what the field held. */
  handleFocusOut(event) {
    const to = event.relatedTarget;
    if (to && this.template.contains(to)) return;
    const want = fold(this.typed || "");
    const exact = want
      ? this.choices.find((l) => l.kind === "pick" && fold(l.label) === want)
      : null;
    if (exact) {
      this.take(exact);
    } else {
      this.putBack();
    }
  }

  take(line) {
    this.open = false;
    this.typed = null;
    if (line.kind === "add") {
      this.dispatchEvent(
        new CustomEvent("addname", { detail: { name: line.name } })
      );
      return;
    }
    if (line.value !== this._value) {
      this._value = line.value;
      this.dispatchEvent(
        new CustomEvent("change", { detail: { value: line.value } })
      );
    }
  }
  putBack() {
    this.open = false;
    this.typed = null;
  }
}
