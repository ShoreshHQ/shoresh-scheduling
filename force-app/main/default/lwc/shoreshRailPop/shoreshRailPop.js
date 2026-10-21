import { LightningElement, api } from "lwc";

// The rows a dropdown's keys move between: a menu's items, or a plain dropdown's marked rows.
const ROWS =
  '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [data-pop-row]';

/**
 * One rail menu (docs/design/spacing-spec-continuous.md, "The grammar"; ADR 0008 part 7): a word
 * and its chevron, the same item as everything on the rail, that opens a dropdown under it. It
 * is never raised while closed (a menu is not a choice); open, it wears the one raised look. The
 * dropdown's rows are the page's own, slotted in: Edit's Undo and Redo, Build's actions, the
 * counter's lists.
 *
 * label: the word ("Edit"). count: a number set as a value before it ("29" of "of 35 placed").
 * mark: the needs-a-look corner before it. alternativeText: the button's name when the word alone
 * isn't enough (it must start with the words shown). menu: a menu (role menu, its rows
 * menuitems, it closes when one is chosen); without it a plain dropdown whose rows are marked
 * data-pop-row. align: "right" opens it to the left from the item's right edge. disabled.
 * raised and noChevron: for a picker whose word is the current choice (c-shoresh-rail-picker).
 *
 * Keys, as a menu button (WAI-ARIA APG): Enter, Space or Down opens it on the first row, Up on
 * the last; Up, Down, Home and End move; Escape closes it with focus back on the word; Tab
 * closes it and moves on. A click outside closes it.
 *
 * Fires select { value } when a row with data-value is chosen (as lightning-button-menu does).
 * A row with aria-expanded opens rows under it and keeps the menu open.
 */
export default class ShoreshRailPop extends LightningElement {
  @api label;
  @api count;
  @api mark = false;
  @api alternativeText;
  @api menu = false;
  @api align = "left";
  @api disabled = false;
  // A picker's current choice (the week shown): raised and in the value style even while
  // closed, as every current choice on the rail is; its chevron can be left off.
  @api raised = false;
  @api noChevron = false;

  isOpen = false;
  // Where focus goes once the rows are drawn: "first" or "last".
  focusRow = null;

  connectedCallback() {
    // The rows are the page's (slotted): their keys and clicks reach this element itself.
    this.onRowKey = (event) => this.handleRowKey(event);
    this.onRowClick = (event) => this.handleRowClick(event);
    this.onFocusOut = (event) => this.handleFocusOut(event);
    this.template.host.addEventListener("keydown", this.onRowKey);
    this.template.host.addEventListener("click", this.onRowClick);
    this.template.host.addEventListener("focusout", this.onFocusOut);
    // A click anywhere else closes it. A click inside is noted as it passes this element (the
    // word's own clicks and the rows'), by the event and by its time: Salesforce's page may hand
    // the page's listener the click in another wrapper, and may not show where it came from.
    this.onInsideClick = (event) => {
      this.insideClick = { event, at: event.timeStamp };
    };
    this.template.host.addEventListener("click", this.onInsideClick);
    this.onPageClick = (event) => {
      const inside = this.insideClick;
      this.insideClick = null;
      const fromHere =
        !!inside && (inside.event === event || inside.at === event.timeStamp);
      if (this.isOpen && !fromHere) {
        this.close(false);
      }
    };
    document.addEventListener("click", this.onPageClick);
  }

  disconnectedCallback() {
    this.template.host.removeEventListener("keydown", this.onRowKey);
    this.template.host.removeEventListener("click", this.onRowClick);
    this.template.host.removeEventListener("focusout", this.onFocusOut);
    this.template.host.removeEventListener("click", this.onInsideClick);
    document.removeEventListener("click", this.onPageClick);
  }

  get hasCount() {
    return this.count !== undefined && this.count !== null && this.count !== "";
  }
  get closed() {
    return !this.isOpen;
  }
  get expanded() {
    return String(this.isOpen);
  }
  get hasPopup() {
    return this.menu ? "menu" : null;
  }
  get popRole() {
    return this.menu ? "menu" : null;
  }
  get popLabel() {
    return this.menu ? this.label : null;
  }
  get buttonClass() {
    if (this.raised) {
      return "shoresh-item shoresh-item_value shoresh-raised";
    }
    return this.isOpen ? "shoresh-item shoresh-raised" : "shoresh-item";
  }
  get showChevron() {
    return !this.noChevron;
  }
  get popClass() {
    return this.align === "right"
      ? "shoresh-pop pop pop_right"
      : "shoresh-pop pop";
  }

  /** Whether the dropdown is open (its rows on screen). */
  @api
  get opened() {
    return this.isOpen;
  }

  /** Focus on the word (as lightning-button-menu's focus()). */
  @api
  focus() {
    const button = this.template.querySelector('[data-id="button"]');
    if (button) {
      button.focus();
    }
  }

  /** Closes the dropdown; focus goes back to the word when asked. */
  @api
  close(refocus = false) {
    if (!this.isOpen) {
      return;
    }
    this.isOpen = false;
    this.dispatchEvent(new CustomEvent("toggle", { detail: { open: false } }));
    if (refocus) {
      this.focus();
    }
  }

  open(focusRow) {
    if (this.disabled) {
      return;
    }
    this.isOpen = true;
    this.focusRow = focusRow;
    this.dispatchEvent(new CustomEvent("toggle", { detail: { open: true } }));
  }

  handleToggle() {
    if (this.isOpen) {
      this.close(false);
    } else {
      // A menu opens on its first row (APG menu button); a plain dropdown keeps focus on the
      // word, and Tab goes into it.
      this.open(this.menu ? "first" : null);
    }
  }

  handleButtonKey(event) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const where = event.key === "ArrowDown" ? "first" : "last";
      if (this.isOpen) {
        this.focusAt(where);
      } else {
        this.open(where);
      }
    } else if (event.key === "Escape" && this.isOpen) {
      event.preventDefault();
      event.stopPropagation();
      this.close(true);
    }
  }

  /** The rows that can take focus now, in order. */
  rows() {
    return [...this.querySelectorAll(ROWS)].filter(
      (row) => !row.disabled && row.getAttribute("aria-disabled") !== "true"
    );
  }

  focusAt(where, from = null) {
    const rows = this.rows();
    if (!rows.length) {
      return;
    }
    let index = 0;
    if (where === "last") {
      index = rows.length - 1;
    } else if (where === "next" || where === "previous") {
      const at = rows.indexOf(from);
      const step = where === "next" ? 1 : -1;
      index = at < 0 ? 0 : (at + step + rows.length) % rows.length;
    }
    rows[index].focus();
  }

  /** Keys on a row (the page's, slotted in). */
  handleRowKey(event) {
    const row = this.rowOf(event.target);
    if (!this.isOpen || !row) {
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        this.focusAt("next", row);
        break;
      case "ArrowUp":
        event.preventDefault();
        this.focusAt("previous", row);
        break;
      case "Home":
        event.preventDefault();
        this.focusAt("first");
        break;
      case "End":
        event.preventDefault();
        this.focusAt("last");
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        this.close(true);
        break;
      case "Tab":
        this.close(false);
        break;
      default:
    }
  }

  /** The row an event came from, if it came from one of this dropdown's rows. */
  rowOf(target) {
    if (!target || target === this.template.host || !target.closest) {
      return null;
    }
    const row = target.closest(ROWS);
    return row && this.template.host.contains(row) ? row : null;
  }

  /**
   * A row was chosen: select with its value (when it has one), and the dropdown closes with
   * focus back on the word, unless the row opens rows under it. A row that does its own work
   * (its own onclick) has already done it.
   */
  handleRowClick(event) {
    const row = this.rowOf(event.target);
    if (!row || row.disabled) {
      return;
    }
    if (row.hasAttribute("aria-expanded")) {
      return;
    }
    const wasOpen = this.isOpen;
    if (row.dataset.value !== undefined) {
      this.dispatchEvent(
        new CustomEvent("select", { detail: { value: row.dataset.value } })
      );
    }
    this.close(wasOpen);
  }

  /** Focus left the word and the dropdown altogether: it closes. */
  handleFocusOut(event) {
    const next = event.relatedTarget;
    if (!this.isOpen || !next) {
      return;
    }
    if (next === this.template.host || this.template.host.contains(next)) {
      return;
    }
    this.close(false);
  }

  renderedCallback() {
    if (this.isOpen && this.focusRow) {
      const where = this.focusRow;
      this.focusRow = null;
      this.focusAt(where);
    }
  }
}
