import { LightningElement, api } from "lwc";

/**
 * One schedule grid, laid out like Shoresh desktop's: time blocks down the left, one column per
 * group (Daily View) or day (Group and Activity View), a cell that runs several blocks spanning
 * their rows. Read-only.
 *
 * grid: { columns, rows, cells } from c/shoreshScheduleViews. corner: the top-left label.
 */
export default class ShoreshScheduleGrid extends LightningElement {
  @api grid;
  @api corner;

  get columns() {
    return ((this.grid && this.grid.columns) || []).map((column, i) => ({
      ...column,
      style: `grid-row: 1 / span 1; grid-column: ${i + 2} / span 1;`
    }));
  }

  /** Each time block with the cells that start in it (a row for screen readers). */
  get bodyRows() {
    const cells = (this.grid && this.grid.cells) || [];
    return ((this.grid && this.grid.rows) || []).map((row, i) => ({
      ...row,
      cells: cells.filter((cell) => cell.row === i)
    }));
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
}
