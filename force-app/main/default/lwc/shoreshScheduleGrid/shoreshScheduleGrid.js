import { LightningElement, api } from "lwc";

/**
 * One schedule grid, laid out like Shoresh desktop's: time blocks down the left, one column per
 * group (Daily View) or day (Group and Activity View), a cell that runs several blocks spanning
 * their rows. Read-only.
 *
 * grid: { columns, rows, cells } from c/shoreshScheduleViews. corner: the top-left label.
 * label: the table's name for screen readers (the day, group, or activity shown).
 *
 * For screen readers it is a table: the header row, then one row per time block. A cell sits in
 * the row it starts in, says which column it is in (aria-colindex) and how many blocks it runs
 * (aria-rowspan); a slot with nothing in it (a group not at camp that day) simply has no cell.
 */
export default class ShoreshScheduleGrid extends LightningElement {
  @api grid;
  @api corner;
  @api label;

  get columns() {
    return ((this.grid && this.grid.columns) || []).map((column, i) => ({
      ...column,
      colIndex: i + 2,
      style: `grid-row: 1 / span 1; grid-column: ${i + 2} / span 1;`
    }));
  }

  /** Each time block with the cells that start in it (a row for screen readers). */
  get bodyRows() {
    const cells = (this.grid && this.grid.cells) || [];
    return ((this.grid && this.grid.rows) || []).map((row, i) => ({
      ...row,
      rowIndex: i + 2,
      cells: cells
        .filter((cell) => cell.row === i)
        .map((cell) => ({
          ...cell,
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
}
