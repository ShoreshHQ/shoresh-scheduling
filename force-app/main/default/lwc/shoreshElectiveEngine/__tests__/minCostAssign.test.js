/**
 * The port's minCostAssign seats exactly the rows the desktop's does (its speed-up changes how
 * the cheapest row is found, not which row or path), and the result is optimal: as many rows
 * seated as possible, at the lowest total cost, which greedy-by-rank is not.
 */
import { minCostAssign } from "../minCostAssign";
import { desktopMinCostAssign } from "./data/desktopMinCostAssign";
import { stream } from "./data/electiveCamp";

function randomTable(seed, { maxRows, maxCols }) {
  const r = stream(seed);
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const rows = int(0, maxRows);
  const cols = int(0, maxCols);
  // Small costs so ties are common; 1000 as the unranked cost; null forbidden.
  const values = [1, 1, 2, 3, 4, 1000, null];
  const cost = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => values[int(0, values.length - 1)])
  );
  const capacity = Array.from({ length: cols }, () => int(0, 5));
  return { cost, capacity };
}

/** Every assignment of rows to columns (or none), by brute force: tiny tables only. */
function bestByBruteForce(cost, capacity) {
  let best = { seated: -1, total: Infinity };
  const used = capacity.map(() => 0);
  const walk = (i, seated, total) => {
    if (i === cost.length) {
      if (
        seated > best.seated ||
        (seated === best.seated && total < best.total)
      ) {
        best = { seated, total };
      }
      return;
    }
    walk(i + 1, seated, total);
    for (let j = 0; j < capacity.length; j++) {
      if (cost[i][j] != null && used[j] < capacity[j]) {
        used[j] += 1;
        walk(i + 1, seated + 1, total + cost[i][j]);
        used[j] -= 1;
      }
    }
  };
  walk(0, 0, 0);
  return best;
}

describe("minCostAssign", () => {
  it("seats the same rows as the desktop's on 3000 random tables", () => {
    for (let seed = 1; seed <= 3000; seed++) {
      const { cost, capacity } = randomTable(seed, { maxRows: 30, maxCols: 7 });
      expect([seed, minCostAssign(cost, capacity)]).toEqual([
        seed,
        desktopMinCostAssign(cost, capacity)
      ]);
    }
  });

  it("seats as many as possible at the lowest total cost", () => {
    for (let seed = 1; seed <= 1500; seed++) {
      const { cost, capacity } = randomTable(seed, { maxRows: 6, maxCols: 3 });
      const placed = minCostAssign(cost, capacity);
      const seated = placed.filter((j) => j != null).length;
      const total = placed.reduce(
        (sum, j, i) => (j == null ? sum : sum + cost[i][j]),
        0
      );
      expect(placed.every((j, i) => j == null || cost[i][j] != null)).toBe(
        true
      );
      capacity.forEach((cap, j) => {
        expect(placed.filter((x) => x === j).length).toBeLessThanOrEqual(cap);
      });
      expect([seed, { seated, total }]).toEqual([
        seed,
        bestByBruteForce(cost, capacity)
      ]);
    }
  });
});
