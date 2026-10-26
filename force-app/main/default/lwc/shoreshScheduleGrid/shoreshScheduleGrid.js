import { LightningElement, api } from "lwc";
import { RAIN_PLAN, gridMinWidth } from "c/shoreshScheduleViews";

const EDIT_KEYS = new Set(["Enter", "F2"]);
const ARROWS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

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
 * Nothing from the engine or the rule checks is drawn on a cell (Greg, engine care plan Q18): the
 * page's Why list says it, beside the grid. A cell with `locked` shows the padlock (c-shoresh-lock) in
 * its bottom-right corner (Generated Schedule: the director's Lock keeps it through every build),
 * "Locked" in assistive text before the name.
 *
 * Editable, it says which cell keyboard focus has reached ("cellfocus", with the cell's key), so
 * the page can offer actions on it.
 * A locked cell's lock says `lockLabel` ("Locked" when not given) in assistive text.
 *
 * Choosing cells together (Greg decision 45, for Copy and Paste): Cmd/Ctrl with a click asks to
 * add or take off a cell ("cellselect" { key, toggle: true }); Shift with a click, a drag with
 * Shift held, Shift with Left or Right, and Cmd/Ctrl+Shift with any arrow ask to reach from where
 * the choice started to a cell ("cellselect" { key, extend: true }). Shift with Up or Down stays
 * the length (desktop SlotCell.jsx: range selection gave that chord up). Focus follows the cell
 * reached, and its "cellfocus" says `extend: true`, so the page keeps what is chosen; focus
 * moved any other way says nothing of it. The page marks the chosen cells (`selected`).
 *
 * The look (docs/design round 13, wiki decisions 36 to 43, ADR 0008 part 8): the grid sits on its
 * zone's surface with no lines; times only down the side, names only across the top, both aligned
 * to the cells. Every placed cell is the one raised look; an Open cell is recessed and wordless
 * ("Open" stays its name for screen readers). A row where every column holds the same fixed or
 * recurring activity for one block (Lunch, Assembly) is one slim cell across the columns, with
 * the lock. A cell's other states keep their meaning as
 * marks with words for screen readers, and a quiet line under the grid names the marks on it:
 * not set up yet (a dashed edge), removed (the name struck through), not at camp (hatched).
 *
 * Cells with the same `mergeKey` in the same row, in columns side by side, are drawn as one
 * cell across those columns (ADR 0014 slice 4: a special event over several bunks, decision
 * 47.3; a special day's own schedule doing one thing in every bunk). The first one's key stands
 * for them all. A special event's cell (`event`) has its quiet flag before the name and its
 * place (`where`) under it; with the padlock bottom-right and the look mark top-right, all three
 * show at once (decision 51). An elective set's cell (`elective`, ADR 0018 slice E5, decision
 * 53.2) is one cell across the bunks the same way, its set mark before the name ("Chugim (4)").
 *
 * Same-activity outlines (wiki decision 38): pointing at a cell, or keyboard focus on it, gives
 * every other cell of that activity (`activityKey`) a pale highlight outline. `held` ({
 * activityKey, fits: [cell keys] }), from the page, outlines every cell of a held activity and
 * draws the dashed "fits here" on the Open cells it names; while something is held, that wins.
 */
export default class ShoreshScheduleGrid extends LightningElement {
  @api grid;
  @api corner;
  @api label;
  @api editable = false;
  // An activity held from the drawer: { activityKey, fits: [cell keys] }, or null.
  @api held;

  activeKey;
  // The cell that has keyboard focus now, if any.
  focusedKey = null;
  // The cell under the pointer, if any (its activity's other cells are outlined).
  hoverKey = null;
  // A stretch by the handle: where it began ({ key, pointerId, x, y, row, column, length, name,
  // moved }), and what it shows now ({ key, name, length, blocked, stopped, above }).
  pressed = null;
  stretch = null;
  // A drag of the handle is not also a click on what is under the pointer when it ends.
  swallowClick = false;
  // The column Up and Down keep to (a slim row spans them all).
  navColumn = null;
  // A drag with Shift held, choosing cells: { pointerId, key } (the cell last reached), or null.
  choosing = null;
  // The cell focus is being moved to while cells are chosen (its cellfocus says extend), or null.
  extendFocusKey = null;

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

  /** Editable, several cells can be chosen together (for Copy and Paste). */
  get multiSelectable() {
    return this.editable ? "true" : null;
  }

  get columns() {
    return ((this.grid && this.grid.columns) || []).map((column, i) => ({
      ...column,
      colIndex: i + 2,
      labelClass: column.note ? "head-name head-name_gone" : "head-name",
      style: `grid-row: 1 / span 1; grid-column: ${i + 2} / span 1;`
    }));
  }

  get allCells() {
    return (this.grid && this.grid.cells) || [];
  }

  /**
   * The rows where every column holds the same fixed or recurring activity for one block (Lunch,
   * Assembly): each is drawn as one slim cell across the columns. Their marks and words must
   * match too, so nothing one bunk's cell says is lost.
   */
  get slimRows() {
    const columns = ((this.grid && this.grid.columns) || []).length;
    const byRow = new Map();
    this.allCells.forEach((cell) => {
      if (!byRow.has(cell.row)) {
        byRow.set(cell.row, []);
      }
      byRow.get(cell.row).push(cell);
    });
    const same = (a, b) =>
      a.text === b.text &&
      a.title === b.title &&
      !!a.locked === !!b.locked &&
      !!a.gone === !!b.gone;
    const slim = new Set();
    byRow.forEach((cells, row) => {
      if (
        columns > 0 &&
        cells.length === columns &&
        cells.every(
          (c) => c.setTime && (c.length || 1) === 1 && same(c, cells[0])
        ) &&
        // Nothing from a row above runs into it.
        !this.allCells.some((c) => c.row < row && c.row + (c.length || 1) > row)
      ) {
        slim.add(row);
      }
    });
    return slim;
  }

  /**
   * The cells as drawn: in a slim row only its first column's cell, spanning every column (the
   * rest go; the slot is read-only, so nothing is lost by sending the first one's key).
   */
  get drawnCells() {
    return this.merged(this.slimDrawn());
  }

  /**
   * Cells with the same mergeKey in one row, in columns side by side, as one cell spanning them:
   * the first one's, with colSpan and mergedKeys (every key it stands for).
   */
  merged(cells) {
    const runs = new Map();
    cells.forEach((cell) => {
      if (!cell.mergeKey || cell.colSpan) {
        return;
      }
      // Only cells that look the same are one: the same lock.
      const key = `${cell.row}|${cell.mergeKey}|${!!cell.locked}`;
      if (!runs.has(key)) {
        runs.set(key, []);
      }
      runs.get(key).push(cell);
    });
    const covered = new Map();
    runs.forEach((list) => {
      list.sort((a, b) => a.column - b.column);
      let start = 0;
      for (let i = 1; i <= list.length; i++) {
        if (i === list.length || list[i].column !== list[i - 1].column + 1) {
          if (i - start > 1) {
            const first = list[start];
            covered.set(first.key, list.slice(start, i));
            list.slice(start + 1, i).forEach((c) => covered.set(c.key, null));
          }
          start = i;
        }
      }
    });
    if (!covered.size) {
      return cells;
    }
    return cells
      .filter((cell) => covered.get(cell.key) !== null)
      .map((cell) => {
        const group = covered.get(cell.key);
        if (!group) {
          return cell;
        }
        return {
          ...cell,
          colSpan: group.length,
          mergedKeys: group.map((c) => c.key),
          selected: group.some((c) => c.selected) || cell.selected,
          style: `grid-row: ${cell.row + 1} / span ${cell.length || 1}; grid-column: ${cell.column + 2} / span ${group.length};`
        };
      });
  }

  slimDrawn() {
    const slim = this.slimRows;
    const columns = ((this.grid && this.grid.columns) || []).length;
    return this.allCells
      .filter(
        (cell) =>
          !slim.has(cell.row) ||
          cell.column ===
            Math.min(
              ...this.allCells
                .filter((c) => c.row === cell.row)
                .map((c) => c.column)
            )
      )
      .map((cell) => {
        if (!slim.has(cell.row)) {
          return cell;
        }
        return {
          ...cell,
          colSpan: columns,
          style: `grid-row: ${cell.row + 1} / span 1; grid-column: 2 / span ${columns};`
        };
      });
  }

  /**
   * The cell keyboard focus sits on: the last one used (or the cell drawn as one with it, when
   * it is no longer drawn on its own), else the first.
   */
  get currentKey() {
    const cells = this.drawnCells;
    const key = this.activeKey;
    const cell = cells.find(
      (c) => c.key === key || (c.mergedKeys && c.mergedKeys.includes(key))
    );
    if (cell) {
      return cell.key;
    }
    return cells.length ? cells[0].key : null;
  }

  /**
   * Which activity's other cells are outlined, and which Open cells say "fits here": what the
   * page holds, else the cell under the pointer or with keyboard focus.
   */
  get outline() {
    const held = this.held;
    if (held && held.activityKey) {
      return {
        activityKey: held.activityKey,
        except: null,
        fits: new Set(held.fits || [])
      };
    }
    const key = this.hoverKey || this.focusedKey;
    const cell = key && this.allCells.find((c) => c.key === key);
    return cell && cell.activityKey
      ? { activityKey: cell.activityKey, except: cell.key, fits: new Set() }
      : null;
  }

  /**
   * A cell's classes for the outlines (never both on one cell: "fits" is only on Open ones). The
   * selected cell keeps only its selection outline, never the paler same-activity one.
   */
  outlineClass(cell, outline) {
    if (!outline || cell.selected) {
      return "";
    }
    if (outline.fits.has(cell.key) && cell.open) {
      return " cell_fits";
    }
    if (
      cell.activityKey &&
      cell.activityKey === outline.activityKey &&
      cell.key !== outline.except
    ) {
      return " cell_same";
    }
    return "";
  }

  /** Each time block with the cells that start in it (a row for screen readers). */
  get bodyRows() {
    const current = this.editable ? this.currentKey : null;
    const slim = this.slimRows;
    const outline = this.outline;
    const cells = this.drawnCells;
    return ((this.grid && this.grid.rows) || []).map((row, i) => ({
      ...row,
      rowIndex: i + 2,
      slim: slim.has(i),
      headClass: row.gone ? "row-head row-head_gone" : "row-head",
      said: row.gone
        ? `${row.said || row.name} (removed)`
        : row.said || row.name,
      cells: cells
        .filter((cell) => cell.row === i)
        .map((cell) => {
          const look = {
            ...cell,
            className: `${cell.className}${cell.locked ? " cell_locked" : ""}${slim.has(i) ? " cell_slim" : ""}${this.outlineClass(cell, outline)}`
          };
          return {
            ...look,
            ...this.stretchLook(look),
            role: this.editable ? "gridcell" : "cell",
            tabIndex: this.editable
              ? cell.key === current
                ? "0"
                : "-1"
              : null,
            // A slot that can't change here (a fixed activity, a group not at camp).
            ariaReadOnly: this.editable && cell.readOnly ? "true" : null,
            draggable: this.editable && cell.movable ? "true" : null,
            ariaSelected: this.editable && cell.selected ? "true" : null,
            handle: this.editable && cell.movable,
            lockText: cell.lockLabel || "Locked",
            // The lock: a director's Lock (with its words), or a fixed or recurring activity's.
            setTimeLock: !!cell.setTime && !cell.locked,
            // Open, not at camp, locked empty: no word on the cell, only for screen readers.
            quiet: !!cell.open || !!cell.away || cell.text === "",
            nameClass: cell.gone ? "cell-name cell-name_gone" : "cell-name",
            // A special event: its quiet flag before the name, its place under it.
            flag: !!cell.event,
            // An elective set: its mark before the name (decision 53.2).
            setMark: !!cell.elective && !cell.event,
            colIndex: cell.column + 2,
            colSpan: cell.colSpan || null,
            rowSpan: cell.length || 1
          };
        })
    }));
  }

  /** What a screen reader hears after a switched cell's name (issue #129). */
  get rainSaid() {
    return `, ${RAIN_PLAN}`;
  }

  /** The quiet line under the grid: the marks on it that don't say themselves. */
  get legend() {
    const cells = this.allCells;
    const has = (test) => cells.some(test);
    return [
      has((c) => c.away) && {
        key: "away",
        label: "not at camp",
        className: "legend-mark legend-mark_away"
      },
      has((c) => c.notSetUp) && {
        key: "not-set-up",
        label: "not set up yet",
        className: "legend-mark legend-mark_not-set-up"
      },
      has((c) => c.gone) ||
      ((this.grid && this.grid.rows) || []).some((r) => r.gone) ||
      ((this.grid && this.grid.columns) || []).some((c) => c.note)
        ? {
            key: "gone",
            label: "removed",
            className: "legend-mark legend-mark_gone"
          }
        : null
    ].filter(Boolean);
  }

  get hasLegend() {
    return this.legend.length > 0;
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
      // A slim row across every column: the ghost sits over the stretched column only.
      const span = cell.colSpan || 1;
      const at = stretch.column - cell.column;
      return {
        className: `${cell.className} cell_stretch-blocked`,
        ghost: stretch.name,
        style:
          span > 1
            ? `${cell.style} --ghost-left: calc((100% + var(--shoresh-space-cell-gap)) * ${at} / ${span}); --ghost-width: calc((100% + var(--shoresh-space-cell-gap)) / ${span} - var(--shoresh-space-cell-gap));`
            : cell.style
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

  /**
   * The time column, then one column per bunk (or day), the same columns the drawer under the
   * grid uses (the page passes the count on, so each tile sits under its column).
   */
  get columnTemplate() {
    return `grid-template-columns: var(--shoresh-head-w) repeat(${this.columns.length}, minmax(0, 1fr));`;
  }

  /** Activity rows at least a tile tall, slim rows the short height (spacing-spec-continuous). */
  get bodyStyle() {
    const rows = this.bodyRows;
    const tall = "minmax(var(--shoresh-tile-h), auto)";
    const heights = rows.length
      ? rows
          .map((row) => (row.slim ? "var(--shoresh-short-h)" : tall))
          .join(" ")
      : tall;
    return `${this.columnTemplate} grid-template-rows: ${heights};`;
  }

  /** Wide enough for every column (Daily View with many groups scrolls sideways). */
  get frameStyle() {
    return `min-width: ${gridMinWidth(this.columns.length)};`;
  }

  // ---------- editing ----------

  cellElement(key) {
    return key ? this.template.querySelector(`[data-cell="${key}"]`) : null;
  }

  /** The cell covering a row in a column, if any (a slim row's one cell covers every column). */
  cellAt(row, column) {
    return this.drawnCells.find(
      (cell) =>
        column >= cell.column &&
        column < cell.column + (cell.colSpan || 1) &&
        row >= cell.row &&
        row < cell.row + (cell.length || 1)
    );
  }

  handleFocusIn(event) {
    // The cell itself, or something in it that takes focus.
    const at = event.target.closest && event.target.closest("[data-cell]");
    const key = at ? at.dataset.cell : null;
    if (this.editable && key) {
      this.activeKey = key;
      const extend = key === this.extendFocusKey;
      this.extendFocusKey = null;
      this.dispatchEvent(
        new CustomEvent("cellfocus", {
          detail: extend ? { key, extend } : { key }
        })
      );
    }
    this.focusedKey = key || null;
  }

  handleFocusOut() {
    this.focusedKey = null;
  }

  /** The pointer over a cell: its activity's other cells are outlined. */
  handlePointerOver(event) {
    const at = event.target.closest && event.target.closest("[data-cell]");
    const key = at ? at.dataset.cell : null;
    if (key !== this.hoverKey) {
      this.hoverKey = key;
    }
  }

  handlePointerLeave() {
    this.hoverKey = null;
  }

  handleKeyDown(event) {
    const key = event.target.dataset && event.target.dataset.cell;
    if (!this.editable || !key) {
      return;
    }
    const cell = this.drawnCells.find((c) => c.key === key);
    if (!cell) {
      return;
    }
    // Up and Down through a slim row come out in the column they went in from.
    const column =
      cell.colSpan > 1 && this.navColumn !== null
        ? this.navColumn
        : cell.column;
    const sideways = event.key === "ArrowLeft" || event.key === "ArrowRight";
    if (
      event.shiftKey &&
      ARROWS.has(event.key) &&
      (sideways || event.ctrlKey || event.metaKey)
    ) {
      // Choosing cells together: reach the next cell from where the choice started.
      event.preventDefault();
      const next = this.nextCell(cell, column, event.key);
      if (next) {
        this.navColumn = next.colSpan > 1 ? column : next.column;
        this.choose(next.key, { extend: true });
      }
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
    if (!ARROWS.has(event.key)) {
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
    const next = this.nextCell(cell, column, event.key);
    if (next) {
      this.navColumn = next.colSpan > 1 ? column : next.column;
      this.focusCell(next.key);
    }
  }

  /** The cell an arrow key goes to from a cell (in `column`, for Up and Down), if any. */
  nextCell(cell, column, arrow) {
    switch (arrow) {
      case "ArrowUp":
        return this.cellAt(cell.row - 1, column);
      case "ArrowDown":
        return this.cellAt(cell.row + (cell.length || 1), column);
      case "ArrowLeft":
        return this.cellAt(cell.row, cell.column - 1);
      default:
        return this.cellAt(cell.row, cell.column + (cell.colSpan || 1));
    }
  }

  /** Asks the page to choose a cell with others (see above); focus follows it. */
  choose(key, how) {
    this.send("cellselect", { key, ...how });
    const focused = this.focusedKey;
    if (key !== focused) {
      this.extendFocusKey = key;
    }
    this.focusCell(key);
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
    // A drag with Shift (or Cmd/Ctrl) held chooses cells; it never also moves one.
    if (this.choosing || event.shiftKey || event.ctrlKey || event.metaKey) {
      event.preventDefault();
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
    if (
      key &&
      (event.shiftKey || event.ctrlKey || event.metaKey) &&
      !event.target.closest("[data-handle]")
    ) {
      // Choosing cells: no text selection, no drag, and the click after it is this, not a click.
      event.preventDefault();
      this.swallowClick = true;
      if (event.shiftKey) {
        this.choosing = { pointerId: event.pointerId, key };
        this.choose(key, { extend: true });
      } else {
        this.choose(key, { toggle: true });
      }
      return;
    }
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
    const choosing = this.choosing;
    if (choosing && event.pointerId === choosing.pointerId) {
      if (event.buttons === 0) {
        // Let go somewhere the grid didn't hear it.
        this.choosing = null;
        return;
      }
      const key = this.cellKeyOf(event);
      if (key && key !== choosing.key) {
        choosing.key = key;
        this.choose(key, { extend: true });
      }
      return;
    }
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
      now.column !== next.column ||
      now.stopped !== next.stopped ||
      now.above !== next.above
    ) {
      this.stretch = next;
    }
  }

  handlePointerUp(event) {
    if (this.choosing && event.pointerId === this.choosing.pointerId) {
      this.choosing = null;
      return;
    }
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
    if (this.choosing && event.pointerId === this.choosing.pointerId) {
      this.choosing = null;
    }
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
      column: pressed.column,
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
