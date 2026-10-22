/**
 * Min-cost max-flow assignment of rows (campers) to columns (offerings), ported unchanged in
 * behaviour from the desktop's src/engine/buildElectiveAssignments.js (Scheduling-Project-
 * 69dbd34, Apache-2.0), where it is the private minCostAssign.
 *
 * cost[i][j] is the cost of row i in column j, or null where the pairing is forbidden.
 * capacity[j] is how many rows column j accepts. Returns, per row, a column index or null.
 *
 * Successive shortest paths with Bellman-Ford: optimal, not greedy (the desktop's D11), because
 * residual edges let an earlier row be moved to make room. Ties break toward the lower row and
 * the lower column index, so the same cost table always gives the same answer.
 *
 * One change from the desktop, for speed only: each pass seats the unseated row with the
 * cheapest path (the lowest row on a tie). The desktop finds that row by running a search from
 * every unseated row; here one search backwards from the open columns gives every row's cost at
 * once, and the forward search then runs for the chosen row alone, so the seats are the same
 * (checked against the desktop's own code in the tests). If that backwards search ever fails
 * to settle, the pass falls back to the desktop's way.
 */
export function minCostAssign(cost, capacity) {
  const rows = cost.length;
  const cols = capacity.length;
  const result = new Array(rows).fill(null);
  const remaining = [...capacity];

  for (let pass = 0; pass < rows; pass++) {
    const toOpen = costsToOpen(cost, remaining, result, rows, cols);
    let best = null;
    if (toOpen) {
      let row = -1;
      for (let i = 0; i < rows; i++) {
        if (
          result[i] === null &&
          toOpen[i] !== Infinity &&
          (row === -1 || toOpen[i] < toOpen[row])
        ) {
          row = i;
        }
      }
      const path =
        row === -1
          ? null
          : shortestAugmenting(row, cost, remaining, result, rows, cols);
      best = path ? { row, ...path } : null;
    } else {
      for (let i = 0; i < rows; i++) {
        if (result[i] !== null) {
          continue;
        }
        const path = shortestAugmenting(i, cost, remaining, result, rows, cols);
        if (path && (best === null || path.cost < best.cost)) {
          best = { row: i, ...path };
        }
      }
    }
    if (!best) {
      break;
    }
    applyPath(best, result, remaining);
  }
  return result;
}

// Every row's cheapest path to a column with room, over the same edges shortestAugmenting
// uses, searched backwards from those columns. null if it doesn't settle.
function costsToOpen(cost, remaining, result, rows, cols) {
  const N = rows + cols;
  const dist = new Array(N).fill(Infinity);
  for (let j = 0; j < cols; j++) {
    if (remaining[j] > 0) {
      dist[rows + j] = 0;
    }
  }
  for (let iter = 0; iter < N; iter++) {
    let changed = false;
    // A row reaches a column it isn't in.
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        if (
          cost[i][j] == null ||
          result[i] === j ||
          dist[rows + j] === Infinity
        ) {
          continue;
        }
        const nd = cost[i][j] + dist[rows + j];
        if (nd < dist[i]) {
          dist[i] = nd;
          changed = true;
        }
      }
    }
    // A full column is left by moving a row seated in it.
    for (let i = 0; i < rows; i++) {
      const j = result[i];
      if (j === null || remaining[j] > 0 || dist[i] === Infinity) {
        continue;
      }
      const nd = dist[i] - cost[i][j];
      if (nd < dist[rows + j]) {
        dist[rows + j] = nd;
        changed = true;
      }
    }
    if (!changed) {
      return dist;
    }
  }
  return null;
}

// The cheapest way to seat `row`, possibly by moving already-seated rows to other columns.
// Returns { cost, moves: [{ row, col }], col } or null.
function shortestAugmenting(row, cost, remaining, result, rows, cols) {
  // Nodes: rows 0..rows-1, then columns rows..rows+cols-1.
  const N = rows + cols;
  const dist = new Array(N).fill(Infinity);
  const prev = new Array(N).fill(-1);
  dist[row] = 0;

  for (let iter = 0; iter < N; iter++) {
    let changed = false;
    for (let i = 0; i < rows; i++) {
      if (dist[i] === Infinity) {
        continue;
      }
      for (let j = 0; j < cols; j++) {
        if (cost[i][j] == null || result[i] === j) {
          continue;
        }
        const nd = dist[i] + cost[i][j];
        if (nd < dist[rows + j]) {
          dist[rows + j] = nd;
          prev[rows + j] = i;
          changed = true;
        }
      }
    }
    // Leaving a full column means moving whoever sits in it, refunding their cost: the residual
    // edge that makes the result optimal rather than greedy.
    for (let j = 0; j < cols; j++) {
      if (dist[rows + j] === Infinity || remaining[j] > 0) {
        continue;
      }
      for (let i = 0; i < rows; i++) {
        if (result[i] !== j) {
          continue;
        }
        const nd = dist[rows + j] - cost[i][j];
        if (nd < dist[i]) {
          dist[i] = nd;
          prev[i] = rows + j;
          changed = true;
        }
      }
    }
    if (!changed) {
      break;
    }
  }

  let bestCol = -1;
  for (let j = 0; j < cols; j++) {
    if (remaining[j] <= 0 || dist[rows + j] === Infinity) {
      continue;
    }
    if (bestCol === -1 || dist[rows + j] < dist[rows + bestCol]) {
      bestCol = j;
    }
  }
  if (bestCol === -1) {
    return null;
  }

  const moves = [];
  let node = rows + bestCol;
  while (node !== row) {
    const p = prev[node];
    if (p === -1) {
      return null;
    }
    if (node >= rows) {
      moves.push({ row: p, col: node - rows });
    }
    node = p;
  }
  return { cost: dist[rows + bestCol], moves, col: bestCol };
}

function applyPath(best, result, remaining) {
  for (const m of best.moves) {
    const from = result[m.row];
    if (from !== null && from !== undefined) {
      remaining[from] += 1;
    }
    result[m.row] = m.col;
    remaining[m.col] -= 1;
  }
}
