// The desktop's own minCostAssign (Scheduling-Project- 69dbd34, src/engine/
// buildElectiveAssignments.js lines 956-1056, Apache-2.0), unchanged except for `export` and the
// formatting, so minCostAssign.test.js can check the port seats exactly the same rows. Test data,
// not shipped.
/**
 * Min-cost max-flow assignment of rows (campers) to columns (offerings).
 *
 * `cost[i][j]` is the cost of row i in column j, or null where the pairing is
 * forbidden. `capacity[j]` is how many rows column j accepts. Returns an array
 * of column indices (or null) per row.
 *
 * Successive shortest paths with Bellman-Ford. Costs are non-negative so
 * Dijkstra with potentials would be faster, but a camp's elective period is
 * tens of campers over tens of offerings, and Bellman-Ford is the version whose
 * correctness is obvious on inspection. Ties break toward the lower column
 * index, and rows are processed in order, so the result is deterministic.
 */
export function desktopMinCostAssign(cost, capacity) {
  const rows = cost.length;
  const cols = capacity.length;
  const result = new Array(rows).fill(null);
  const remaining = [...capacity];

  // One augmenting path per row, cheapest first among rows is NOT required —
  // successive shortest paths is optimal regardless of the order rows are
  // augmented, provided each augmentation is itself a shortest path in the
  // residual graph. Residual edges are what let an earlier row be displaced.
  for (let pass = 0; pass < rows; pass++) {
    // dist over columns, reached either directly from an unassigned row or by
    // displacing an assigned row out of a column it currently holds.
    let best = null;
    for (let i = 0; i < rows; i++) {
      if (result[i] !== null) continue;
      const path = shortestAugmenting(i, cost, remaining, result, rows, cols);
      if (path && (best === null || path.cost < best.cost))
        best = { row: i, ...path };
    }
    if (!best) break;
    applyPath(best, result, remaining);
  }
  return result;
}

// Finds the cheapest way to seat `row`, possibly by displacing already-seated
// rows into other columns. Returns {cost, moves:[{row, col}]} or null.
function shortestAugmenting(row, cost, remaining, result, rows, cols) {
  // Nodes: rows 0..rows-1, columns rows..rows+cols-1.
  const N = rows + cols;
  const dist = new Array(N).fill(Infinity);
  const prev = new Array(N).fill(-1);
  dist[row] = 0;

  for (let iter = 0; iter < N; iter++) {
    let changed = false;
    for (let i = 0; i < rows; i++) {
      if (dist[i] === Infinity) continue;
      for (let j = 0; j < cols; j++) {
        if (cost[i][j] == null) continue;
        if (result[i] === j) continue; // already here; the reverse edge covers it
        const nd = dist[i] + cost[i][j];
        if (nd < dist[rows + j]) {
          dist[rows + j] = nd;
          prev[rows + j] = i;
          changed = true;
        }
      }
    }
    // Leaving a full column means displacing whoever sits in it, refunding
    // their cost — this is the residual edge that makes the result optimal
    // rather than greedy.
    for (let j = 0; j < cols; j++) {
      if (dist[rows + j] === Infinity) continue;
      if (remaining[j] > 0) continue;
      for (let i = 0; i < rows; i++) {
        if (result[i] !== j) continue;
        const nd = dist[rows + j] - cost[i][j];
        if (nd < dist[i]) {
          dist[i] = nd;
          prev[i] = rows + j;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  let bestCol = -1;
  for (let j = 0; j < cols; j++) {
    if (remaining[j] <= 0) continue;
    if (dist[rows + j] === Infinity) continue;
    if (bestCol === -1 || dist[rows + j] < dist[rows + bestCol]) bestCol = j;
  }
  if (bestCol === -1) return null;

  // Walk back, collecting (row -> column) moves.
  const moves = [];
  let node = rows + bestCol;
  while (node !== row) {
    const p = prev[node];
    if (p === -1) return null;
    if (node >= rows) moves.push({ row: p, col: node - rows });
    node = p;
  }
  return { cost: dist[rows + bestCol], moves, col: bestCol };
}

function applyPath(best, result, remaining) {
  for (const m of best.moves) {
    const from = result[m.row];
    if (from !== null && from !== undefined) remaining[from] += 1;
    result[m.row] = m.col;
    remaining[m.col] -= 1;
  }
}
