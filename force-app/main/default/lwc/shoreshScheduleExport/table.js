/**
 * A schedule grid on paper (c-shoresh-schedule-print): the table rows and their cells, shared by
 * the printout of a view (shoreshScheduleExport printPages) and by a choice (pick.js pagesFor).
 */
const REMOVED = "(removed)";

/**
 * What a grid cell prints, in parts ({ key, text, rain }): its name, or in Activity View each
 * group's; a part a rainy-day switch put there carries its raindrop (issue #129), as on screen.
 * Nothing for Open.
 */
function printParts(cell) {
  if (cell.names) {
    return cell.names.map((n, i) => ({
      key: String(i),
      text: i ? `, ${n.name}` : n.name,
      rain: !!n.rain
    }));
  }
  if (cell.open || !cell.text) {
    return [];
  }
  return [{ key: "0", text: cell.text, rain: !!cell.rain }];
}

/** What a grid cell prints: its words, nothing for Open. */
function printText(cell) {
  if (cell.names) {
    return cell.names.map((n) => n.name).join(", ");
  }
  if (cell.open) {
    return "";
  }
  return cell.text;
}

/**
 * A schedule grid ({ columns, rows, cells }) as table rows: each row its time block, then a cell
 * per column that starts there (rowspan for one running several blocks; colspan for one item
 * across groups side by side, as the screen draws it, mergeKey; covered places left out).
 */
export function printTable(grid) {
  const rowCount = grid.rows.length;
  const colCount = grid.columns.length;
  const starts = new Map();
  const covered = new Set();
  const spans = new Map();
  const runs = new Map();
  grid.cells.forEach((cell) => {
    if (cell.mergeKey) {
      const key = `${cell.row}|${cell.mergeKey}`;
      if (!runs.has(key)) runs.set(key, []);
      runs.get(key).push(cell);
    }
  });
  runs.forEach((list) => {
    list.sort((a, b) => a.column - b.column);
    let start = 0;
    for (let i = 1; i <= list.length; i++) {
      if (i === list.length || list[i].column !== list[i - 1].column + 1) {
        if (i - start > 1) {
          spans.set(list[start], i - start);
          list.slice(start + 1, i).forEach((c) => {
            for (let r = c.row; r < c.row + c.length; r++) {
              covered.add(`${r}:${c.column}`);
            }
          });
        }
        start = i;
      }
    }
  });
  grid.cells.forEach((cell) => {
    starts.set(`${cell.row}:${cell.column}`, cell);
    for (let r = cell.row + 1; r < cell.row + cell.length; r++) {
      covered.add(`${r}:${cell.column}`);
    }
  });
  const rows = [];
  for (let r = 0; r < rowCount; r++) {
    const row = grid.rows[r];
    const cells = [];
    for (let c = 0; c < colCount; c++) {
      const at = `${r}:${c}`;
      if (covered.has(at)) {
        continue;
      }
      const cell = starts.get(at);
      const text = cell ? printText(cell) : "";
      cells.push({
        key: at,
        text,
        parts: cell ? printParts(cell) : [],
        // Paper staff carry says nothing about setup: "not set up yet" stays on screen.
        note: cell && cell.note && text && !cell.notSetUp ? cell.note : null,
        rowspan: cell ? cell.length : 1,
        colspan: (cell && spans.get(cell)) || 1,
        className: text ? "cell" : "cell cell_empty"
      });
    }
    rows.push({
      key: row.key,
      time: row.said || row.time,
      note: row.gone ? REMOVED : null,
      cells
    });
  }
  return {
    columns: grid.columns.map((col) => ({
      key: col.key,
      label: col.label,
      sub: col.sub,
      note: col.note
    })),
    rows
  };
}
