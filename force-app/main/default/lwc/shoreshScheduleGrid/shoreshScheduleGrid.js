import { LightningElement, api } from "lwc";

const EDIT_KEYS = new Set(["Enter", "F2"]);
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
 * screen); Delete or Backspace asks to clear it ("clearcell"). The page decides what may change.
 */
export default class ShoreshScheduleGrid extends LightningElement {
  @api grid;
  @api corner;
  @api label;
  @api editable = false;

  activeKey;

  /** Moves keyboard focus to a cell (after an editor closes, say). */
  @api
  focusCell(key) {
    if (key) {
      this.activeKey = key;
    }

    Promise.resolve().then(() => {
      const cell = this.cellElement(this.activeKey);
      if (cell) {
        cell.focus();
      }
    });
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
