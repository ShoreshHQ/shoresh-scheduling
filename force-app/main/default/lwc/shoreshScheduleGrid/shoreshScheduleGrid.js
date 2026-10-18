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
 * block shorter or longer ("cellresize"). A click is "cellclick". Cells marked draggable can be
 * dragged ("celldragstart"), a resizable one by its bottom handle ("resizestart"), and anything
 * dropped on a cell is "celldrop". The page decides what may change.
 *
 * A cell with `dot` (its words) shows the bronze "needs a look" dot (c-shoresh-dot): the words
 * on hover, tap, or while the cell has keyboard focus, and always in assistive text. The grid
 * doesn't know why; the page says.
 */
export default class ShoreshScheduleGrid extends LightningElement {
  @api grid;
  @api corner;
  @api label;
  @api editable = false;

  activeKey;
  // The cell that has keyboard focus now, if any: its dot shows its words.
  focusedKey = null;

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
          role: this.editable ? "gridcell" : "cell",
          tabIndex: this.editable ? (cell.key === current ? "0" : "-1") : null,
          // A slot that can't change here (a fixed activity, a group not at camp).
          ariaReadOnly: this.editable && cell.readOnly ? "true" : null,
          draggable: this.editable && cell.movable ? "true" : null,
          ariaSelected: this.editable && cell.selected ? "true" : null,
          handle: this.editable && cell.movable,
          dotOpen: Boolean(cell.dot) && cell.key === this.focusedKey,
          colIndex: cell.column + 2,
          rowSpan: cell.length || 1
        }))
    }));
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
    const key = event.target.dataset && event.target.dataset.cell;
    if (this.editable && key) {
      this.activeKey = key;
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
    // Only a drag that starts on the visible bar changes the length; one that starts elsewhere
    // in the handle's larger click area moves the placement, as anywhere else in the cell.
    const resizing = !!event.target.closest("[data-handle-bar]");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      // The name shown, so a drop somewhere else (a text box) writes a word, not machinery.
      const cell = this.allCells.find((c) => c.key === key);
      event.dataTransfer.setData("text/plain", cell ? cell.text : "");
    }
    this.send(resizing ? "resizestart" : "celldragstart", { key });
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
