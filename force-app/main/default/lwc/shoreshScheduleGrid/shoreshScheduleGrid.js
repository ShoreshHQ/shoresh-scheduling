import { LightningElement, api } from "lwc";

const EDIT_KEYS = new Set(["Enter", "F2"]);

/** What a drag carried as text, if anything. */
function dragData(event) {
  return event.dataTransfer ? event.dataTransfer.getData("text/plain") : "";
}
const CLEAR_KEYS = new Set(["Delete", "Backspace"]);

/**
 * One schedule grid, laid out like Shoresh desktop's: time blocks down the left, one column per
 * group (Daily View) or day (Group and Activity View), a cell that runs several blocks spanning
 * their rows. Read-only unless `editable` (Manual Build).
 *
 * grid: { columns, rows, cells } from c/shoreshScheduleViews. corner: the top-left label.
 * label: the table's name for screen readers (the day, group, or activity shown).
 *
 * For screen readers it is a table: the header row, then one row per time block. A cell sits in
 * the row it starts in, says which column it is in (aria-colindex) and how many blocks it runs
 * (aria-rowspan); a slot with nothing in it (a group not at camp that day) simply has no cell.
 *
 * Editable, it is a grid with one cell in the tab order: arrow keys move between cells; Enter, F2,
 * or a double-click asks to change the cell ("editcell", with the cell's key and where it is on
 * screen); Delete or Backspace asks to clear it ("clearcell"); Space picks it up or puts down
 * what was picked ("cellspace"); Escape lets go ("cellescape"); Shift with Up or Down makes it a
 * block shorter or longer ("cellresize"). A click is "cellclick" ("handleclick" on a cell's bottom
 * handle). Cells marked draggable can be dragged ("celldragstart"), and anything dropped on a cell
 * is "celldrop". The page decides what may change.
 *
 * The bottom handle stretches a placement with the pointer (desktop useSpanExtendDrag.js): pressed
 * anywhere in its area and moved, the cell itself grows or shrinks block by block under the
 * pointer, over Open slots only; a slot it can't run into is marked with a ghost of the name and
 * the stretch stops there. Letting go sends "cellstretch" ({ key, length, stopped }: the length
 * shown, 0 when the pointer went above the cell's first block, and whether a slot stopped it).
 * Escape lets go without a change. Pointer events, so a mouse, a trackpad, a pen and touch all
 * work, in Chrome and Safari alike; a press that doesn't move stays a click.
 *
 * A cell with `dot` (its words) shows the bronze "needs a look" dot (c-shoresh-dot): the words
 * on hover, tap, or while the cell has keyboard focus, and always in assistive text. The grid
 * doesn't know why; the page says. A cell with `locked` shows the lock icon (Generated Schedule:
 * the director's Lock keeps it through every build), "Locked" in assistive text.
 *
 * Editable, it says which cell keyboard focus has reached ("cellfocus", with the cell's key), so
 * the page can offer actions on it (a dot in the cell taking focus, tapped, counts as the cell).
 * A locked cell's lock says `lockLabel` ("Locked" when not given) in assistive text.
 */
export default class ShoreshScheduleGrid extends LightningElement {
  @api grid;
  @api corner;
  @api label;
  @api editable = false;

  activeKey;
  // The cell that has keyboard focus now, if any: its dot shows its words.
  focusedKey = null;
  // A stretch by the handle: where it began ({ key, pointerId, x, y, row, column, length, name,
  // moved }), and what it shows now ({ key, name, length, blocked, stopped, above }).
  pressed = null;
  stretch = null;
  // A drag of the handle is not also a click on what is under the pointer when it ends.
  swallowClick = false;

  /** Moves keyboard focus to a cell (after an editor closes, say). */
  @api
  focusCell(key) {
    if (key) {
      this.activeKey = key;
    }

    Promise.resolve().then(() => {
      const cell = this.cellElement(this.currentKey);
      if (cell) {
        cell.focus();
      }
    });
  }

  /** Where a cell is on screen now, or null when it isn't shown. */
  @api
  cellRect(key) {
    const cell = this.cellElement(key);
    if (!cell) {
      return null;
    }
    const rect = cell.getBoundingClientRect();
    return {
      top: rect.top,
      left: rect.left,
      bottom: rect.bottom,
      width: rect.width
    };
  }

  get frameRole() {
    return this.editable ? "grid" : "table";
  }

  get columns() {
    return ((this.grid && this.grid.columns) || []).map((column, i) => ({
      ...column,
      colIndex: i + 2,
      style: `grid-row: 1 / span 1; grid-column: ${i + 2} / span 1;`
    }));
  }

  get allCells() {
    return (this.grid && this.grid.cells) || [];
  }

  /** The cell keyboard focus sits on: the last one used, else the first. */
  get currentKey() {
    const cells = this.allCells;
    if (cells.some((cell) => cell.key === this.activeKey)) {
      return this.activeKey;
    }
    return cells.length ? cells[0].key : null;
  }

  /** Each time block with the cells that start in it (a row for screen readers). */
  get bodyRows() {
    const current = this.editable ? this.currentKey : null;
    return ((this.grid && this.grid.rows) || []).map((row, i) => ({
      ...row,
      rowIndex: i + 2,
      cells: this.allCells
        .filter((cell) => cell.row === i)
        .map((cell) => ({
          ...cell,
          ...this.stretchLook(cell),
          role: this.editable ? "gridcell" : "cell",
          tabIndex: this.editable ? (cell.key === current ? "0" : "-1") : null,
          // A slot that can't change here (a fixed activity, a group not at camp).
          ariaReadOnly: this.editable && cell.readOnly ? "true" : null,
          draggable: this.editable && cell.movable ? "true" : null,
          ariaSelected: this.editable && cell.selected ? "true" : null,
          handle: this.editable && cell.movable,
          dotOpen: Boolean(cell.dot) && cell.key === this.focusedKey,
          lockText: cell.lockLabel || "Locked",
          colIndex: cell.column + 2,
          rowSpan: cell.length || 1
        }))
    }));
  }

  /** How a cell looks while the handle stretches a placement: the cell itself grows. */
  stretchLook(cell) {
    const stretch = this.stretch;
    if (!stretch) {
      return {};
    }
    if (cell.key === stretch.key) {
      return {
        className: `${cell.className} cell_stretching`,
        style: `grid-row: ${cell.row + 1} / span ${Math.max(stretch.length, 1)}; grid-column: ${cell.column + 2} / span 1;`
      };
    }
    if (cell.key === stretch.blocked) {
      return {
        className: `${cell.className} cell_stretch-blocked`,
        ghost: stretch.name
      };
    }
    return {};
  }

  get rowCount() {
    return this.bodyRows.length + 1;
  }

  get colCount() {
    return this.columns.length + 1;
  }

  get columnTemplate() {
    return `grid-template-columns: 140px repeat(${this.columns.length}, minmax(0, 1fr));`;
  }

  get bodyStyle() {
    const rows = this.bodyRows.length;
    return `${this.columnTemplate} grid-template-rows: repeat(${Math.max(rows, 1)}, minmax(48px, auto));`;
  }

  /** Wide enough for every column (Daily View with many groups scrolls sideways). */
  get frameStyle() {
    return `min-width: ${140 + this.columns.length * 130}px;`;
  }

  // ---------- editing ----------

  cellElement(key) {
    return key ? this.template.querySelector(`[data-cell="${key}"]`) : null;
  }

  /** The cell covering a row in a column, if any. */
  cellAt(row, column) {
    return this.allCells.find(
      (cell) =>
        cell.column === column &&
        row >= cell.row &&
        row < cell.row + (cell.length || 1)
    );
  }

  handleFocusIn(event) {
    // The cell itself, or something in it that takes focus (its dot, tapped).
    const at = event.target.closest && event.target.closest("[data-cell]");
    const key = at ? at.dataset.cell : null;
    if (this.editable && key) {
      this.activeKey = key;
      this.dispatchEvent(new CustomEvent("cellfocus", { detail: { key } }));
    }
    this.focusedKey = key || null;
  }

  handleFocusOut() {
    this.focusedKey = null;
  }

  handleKeyDown(event) {
    const key = event.target.dataset && event.target.dataset.cell;
    if (!this.editable || !key) {
      return;
    }
    const cell = this.allCells.find((c) => c.key === key);
    if (!cell) {
      return;
    }
    if (
      event.shiftKey &&
      (event.key === "ArrowUp" || event.key === "ArrowDown")
    ) {
      event.preventDefault();
      this.send("cellresize", {
        key,
        delta: event.key === "ArrowDown" ? 1 : -1
      });
      return;
    }
    if (event.key === " " || event.key === "Escape") {
      event.preventDefault();
      this.send(event.key === " " ? "cellspace" : "cellescape", { key });
      return;
    }
    let next;
    switch (event.key) {
      case "ArrowUp":
        next = this.cellAt(cell.row - 1, cell.column);
        break;
      case "ArrowDown":
        next = this.cellAt(cell.row + (cell.length || 1), cell.column);
        break;
      case "ArrowLeft":
        next = this.cellAt(cell.row, cell.column - 1);
        break;
      case "ArrowRight":
        next = this.cellAt(cell.row, cell.column + 1);
        break;
      default:
        if (EDIT_KEYS.has(event.key)) {
          event.preventDefault();
          this.ask("editcell", key, event.target);
        } else if (CLEAR_KEYS.has(event.key)) {
          event.preventDefault();
          this.ask("clearcell", key, event.target);
        }
        return;
    }
    event.preventDefault();
    if (next) {
      this.focusCell(next.key);
    }
  }

  handleDoubleClick(event) {
    const target = event.target.closest("[data-cell]");
    if (this.editable && target) {
      this.activeKey = target.dataset.cell;
      this.ask("editcell", target.dataset.cell, target);
    }
  }

  send(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  cellKeyOf(event) {
    const target = event.target.closest && event.target.closest("[data-cell]");
    return this.editable && target ? target.dataset.cell : null;
  }

  handleClick(event) {
    if (this.swallowClick) {
      this.swallowClick = false;
      return;
    }
    const key = this.cellKeyOf(event);
    if (key) {
      this.activeKey = key;
      const onHandle = !!event.target.closest("[data-handle]");
      this.send(onHandle ? "handleclick" : "cellclick", { key });
    }
  }

  handleDragStart(event) {
    const key = this.cellKeyOf(event);
    if (!key) {
      return;
    }
    // The handle stretches (pointer events below); it never also starts a move of the cell.
    if (event.target.closest("[data-handle]")) {
      event.preventDefault();
      return;
    }
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      // The name shown, so a drop somewhere else (a text box) writes a word, not machinery.
      const cell = this.allCells.find((c) => c.key === key);
      event.dataTransfer.setData("text/plain", cell ? cell.text : "");
    }
    this.send("celldragstart", { key });
  }

  // ---------- stretching by the handle ----------

  handlePointerDown(event) {
    this.swallowClick = false;
    if (!this.editable || event.button > 0 || !event.isPrimary) {
      return;
    }
    const key = this.cellKeyOf(event);
    const cell = key && this.allCells.find((c) => c.key === key);
    if (!cell || !cell.movable || !event.target.closest("[data-handle]")) {
      return;
    }
    // No text selection and no browser drag of the cell: the handle's own gesture.
    event.preventDefault();
    this.activeKey = key;
    this.pressed = {
      key,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      row: cell.row,
      column: cell.column,
      length: cell.length || 1,
      name: cell.text,
      moved: false
    };
  }

  handlePointerMove(event) {
    const pressed = this.pressed;
    if (!pressed || event.pointerId !== pressed.pointerId) {
      return;
    }
    if (!pressed.moved) {
      // A few pixels of wobble is still a click (a click on the handle picks up its end).
      if (
        Math.abs(event.clientX - pressed.x) < 4 &&
        Math.abs(event.clientY - pressed.y) < 4
      ) {
        return;
      }
      pressed.moved = true;
      this.capture(pressed.pointerId);
      this.listenForEscape(true);
    }
    event.preventDefault();
    const next = this.stretchTo(pressed, this.rowAt(event.clientY));
    const now = this.stretch;
    if (
      !now ||
      now.length !== next.length ||
      now.blocked !== next.blocked ||
      now.stopped !== next.stopped ||
      now.above !== next.above
    ) {
      this.stretch = next;
    }
  }

  handlePointerUp(event) {
    const pressed = this.pressed;
    if (!pressed || event.pointerId !== pressed.pointerId) {
      return;
    }
    this.pressed = null;
    if (!pressed.moved) {
      // A plain click: the click that follows says so ("handleclick").
      return;
    }
    const shown = this.stretchTo(pressed, this.rowAt(event.clientY));
    this.endStretch(pressed.pointerId);
    this.swallowClick = true;
    this.send("cellstretch", {
      key: pressed.key,
      length: shown.above ? 0 : shown.length,
      stopped: shown.stopped
    });
  }

  handlePointerCancel(event) {
    if (this.pressed && event.pointerId === this.pressed.pointerId) {
      this.endStretch(this.pressed.pointerId);
      this.pressed = null;
    }
  }

  /** Escape while stretching: let go, nothing changes. */
  escapeStretch = (event) => {
    if (event.key === "Escape" && this.pressed) {
      event.preventDefault();
      event.stopPropagation();
      this.endStretch(this.pressed.pointerId);
      this.pressed = null;
      this.swallowClick = true;
    }
  };

  listenForEscape(on) {
    if (on) {
      window.addEventListener("keydown", this.escapeStretch, true);
    } else {
      window.removeEventListener("keydown", this.escapeStretch, true);
    }
  }

  endStretch(pointerId) {
    this.stretch = null;
    this.listenForEscape(false);
    const frame = this.template.querySelector(".frame");
    if (
      frame &&
      frame.hasPointerCapture &&
      frame.hasPointerCapture(pointerId)
    ) {
      frame.releasePointerCapture(pointerId);
    }
  }

  /** The pointer keeps talking to the grid while it stretches, even off the cell. */
  capture(pointerId) {
    const frame = this.template.querySelector(".frame");
    try {
      if (frame && frame.setPointerCapture) {
        frame.setPointerCapture(pointerId);
      }
    } catch {
      // Not a live pointer (a test's event): the grid still hears it over its cells.
    }
  }

  disconnectedCallback() {
    this.listenForEscape(false);
  }

  /** Which time block row a point on screen is in: -1 above the first, the last below it. */
  rowAt(y) {
    const heads = this.template.querySelectorAll(
      '.grid_body [role="rowheader"]'
    );
    if (!heads.length) {
      return -1;
    }
    for (let i = 0; i < heads.length; i++) {
      const rect = heads[i].getBoundingClientRect();
      if (y < rect.top) {
        return i - 1;
      }
      if (y < rect.bottom) {
        return i;
      }
    }
    return heads.length - 1;
  }

  /**
   * What a stretch to `row` shows: the placement's own blocks, then Open slots it can run into,
   * up to the first one it can't (ADR 0008: it stops at a filled slot, like the desktop).
   */
  stretchTo(pressed, row) {
    const shown = {
      key: pressed.key,
      name: pressed.name,
      length: pressed.length,
      blocked: null,
      stopped: false,
      above: row < pressed.row
    };
    if (shown.above) {
      return shown;
    }
    const ownEnd = pressed.row + pressed.length - 1;
    let end = pressed.row;
    for (let r = pressed.row + 1; r <= row; r++) {
      const there = r > ownEnd ? this.cellAt(r, pressed.column) : null;
      if (r <= ownEnd || this.canRunInto(there, r)) {
        end = r;
      } else {
        shown.blocked = there ? there.key : null;
        shown.stopped = true;
        break;
      }
    }
    shown.length = end - pressed.row + 1;
    return shown;
  }

  /** An Open slot that can take more of a placement (not kept empty, not a group away). */
  canRunInto(cell, row) {
    return (
      !!cell && cell.row === row && cell.open && !cell.readOnly && !cell.locked
    );
  }

  handleDragOver(event) {
    if (this.cellKeyOf(event)) {
      event.preventDefault();
    }
  }

  /**
   * A drop on a cell: its key, what the drag carried (to tell it from other things dropped), and
   * how far down the cell it landed (0 top to 1 bottom).
   */
  handleDrop(event) {
    const key = this.cellKeyOf(event);
    if (!key) {
      return;
    }
    event.preventDefault();
    const rect = this.cellElement(key).getBoundingClientRect();
    const at =
      rect.height > 0
        ? Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
        : 0;
    this.send("celldrop", { key, data: dragData(event), at });
  }

  ask(name, key, element) {
    const rect = element.getBoundingClientRect();
    this.dispatchEvent(
      new CustomEvent(name, {
        detail: {
          key,
          rect: {
            top: rect.top,
            left: rect.left,
            bottom: rect.bottom,
            width: rect.width
          }
        }
      })
    );
  }
}
