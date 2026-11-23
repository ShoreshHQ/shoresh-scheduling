/**
 * The activities close to a name typed in a cell that no activity has (LOCK-4.11): what a slip of
 * the keys ("swsw", "Archry") most likely meant, offered before 'Add "<name>" to activities' so
 * Enter places one the season has rather than making a new one. Pure: no screen.
 */

// At most this many are offered.
const MOST = 3;

/** Names compared the way people mean them: spaces and capitals aside. */
export function loose(text) {
  return String(text || "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

/** Letters to change, add or drop to turn one name into the other. */
export function editDistance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next.push(
        Math.min(
          row[j] + 1,
          next[j - 1] + 1,
          row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        )
      );
    }
    row = next;
  }
  return row[b.length];
}

/**
 * The activities ({ name }) whose names are close to typed: at most half its letters (at least
 * one) away, spaces and capitals aside. Closest first, then in the order given; at most 3.
 */
export function closeActivities(typed, activities) {
  const key = loose(typed);
  if (!key) {
    return [];
  }
  const most = Math.max(1, Math.floor(key.length / 2));
  return (activities || [])
    .map((activity, i) => ({
      activity,
      i,
      d: editDistance(key, loose(activity.name))
    }))
    .filter((near) => near.d <= most)
    .sort((x, y) => x.d - y.d || x.i - y.i)
    .slice(0, MOST)
    .map((near) => near.activity);
}
