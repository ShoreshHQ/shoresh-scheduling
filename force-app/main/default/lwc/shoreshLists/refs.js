/*
 * Names a row refers to (a location, a location type, a rain plan), resolved in one place, the
 * same way for every column (slice 4c, after review round 3):
 * - names are folded as rows are (capitals and spacing aside): "ARCHRY" is "Archry";
 * - a name the list's own rows give follows that row as the director settled it: to the row it
 *   was answered to be the same as, to the item set up it matched, to the row itself when it is
 *   saved, and, when that row isn't saved (left out, or it can't be read), to an item added as
 *   by hand (ADR 0007 §5); while that row is still asked about, so is the row naming it;
 * - otherwise the season's item of that name; two of one name are never guessed;
 * - only a name that matches nothing is asked about as similar to another (Greg: always asked),
 *   and otherwise added.
 */
import {
  LEAVE_OUT,
  looseKey,
  mergesFrom,
  similarPairs,
  tidy
} from "c/shoreshImportEngine";

function usable(row) {
  return !row.problems.length && !row.leftOut;
}

function byFold(records) {
  const map = new Map();
  records.forEach((r) => {
    const key = looseKey(r.Name);
    map.set(key, [...(map.get(key) || []), r]);
  });
  return map;
}

/**
 * The resolver for one column. records: the season's items of the kind; leads: the list's own
 * rows, first of each name (only for a rain plan, on the activities list). Returns
 * lookup(name) -> { id, name } | { key, name } | { add } | { wait } | { ambiguous } | null.
 */
export function resolver(records, leads) {
  const camp = byFold(records);
  const leadOf = new Map((leads || []).map((r) => [looseKey(r.name), r]));
  // Two leads whose names differ only in capitals (two items set up, "Swim" and "swim"): a
  // name spelled exactly as one of them is that one.
  const exactLead = new Map((leads || []).map((r) => [r.name, r]));
  const fromCamp = (name) => {
    const found = camp.get(looseKey(name)) || [];
    const exact = found.filter((r) => tidy(r.Name) === tidy(name));
    const pick = found.length === 1 ? found : exact;
    if (pick.length === 1) {
      return { id: pick[0].Id, name: pick[0].Name };
    }
    return found.length ? { ambiguous: found.length, name } : null;
  };
  const follow = (lead, seen) => {
    if (seen.has(lead)) {
      return { add: lead.name, name: lead.name };
    }
    seen.add(lead);
    if (lead.sameAs && leadOf.has(looseKey(lead.sameAs))) {
      return follow(leadOf.get(looseKey(lead.sameAs)), seen);
    }
    if (lead.open) {
      return { wait: true, name: lead.name };
    }
    if (usable(lead)) {
      return lead.existing
        ? { id: lead.existing.Id, name: lead.existing.Name }
        : { key: `Activity:${lead.name}`, name: lead.name };
    }
    // Not saved: the item the director picked for it ("Which Archery?"), or a new one as by
    // hand if that was the answer; else what it matched (one item set up, or several: never
    // guessed), the item set up of its name, or one added as by hand.
    if (lead.existing) {
      return { id: lead.existing.Id, name: lead.existing.Name };
    }
    if (lead.pickedNew) {
      return { add: lead.name, name: lead.name };
    }
    if (lead.found && lead.found.length === 1) {
      return { id: lead.found[0].Id, name: lead.found[0].Name };
    }
    if (lead.found && lead.found.length > 1) {
      return { ambiguous: lead.found.length, name: lead.found[0].Name };
    }
    return fromCamp(lead.name) || { add: lead.name, name: lead.name };
  };
  return (name) => {
    if (!name) {
      return null;
    }
    const lead = exactLead.get(tidy(name)) || leadOf.get(looseKey(name));
    return lead ? follow(lead, new Set()) : fromCamp(name);
  };
}

/**
 * Resolves one reference column on every usable row: r.values[key] becomes the name it resolves
 * to, and r.targets[key] what it points at. Names matching nothing are asked about when similar
 * to a known one; answered the same, they resolve to it; different, they are added. Returns the
 * questions.
 */
export function resolveColumn(rows, column, records, leads, answers, pairKind) {
  const key = column.key;
  const lookup = resolver(records, leads);
  const named = rows.filter((r) => usable(r) && r.values[key]);
  // Names that match nothing, by fold, one spelling kept whatever the row order: the one
  // written most often, then the first alphabetically (so "lake" and "Lake" are one).
  const spellings = new Map();
  named.forEach((r) => {
    if (lookup(r.values[key])) {
      return;
    }
    const fold = looseKey(r.values[key]);
    const seen = spellings.get(fold) || new Map();
    seen.set(r.values[key], (seen.get(r.values[key]) || 0) + 1);
    spellings.set(fold, seen);
  });
  const spelling = new Map();
  const counts = new Map();
  spellings.forEach((seen, fold) => {
    const [name] = [...seen.entries()].sort(
      (x, y) => y[1] - x[1] || x[0].localeCompare(y[0])
    )[0];
    spelling.set(fold, name);
    counts.set(
      name,
      [...seen.values()].reduce((a, b) => a + b, 0)
    );
  });
  const known = [
    ...new Set([
      ...records.map((r) => r.Name),
      ...(leads || []).map((r) => r.name)
    ])
  ];
  const pairs = similarPairs(
    pairKind,
    [...counts.entries()].map(([name, count]) => ({ name, count })),
    known
  );
  const merged = mergesFrom(pairs, answers);
  const leftOut = new Set();
  const open = new Set();
  pairs.forEach((pair) => {
    const answer = answers[pair.id];
    const names = pair.existing ? [pair.a] : [pair.a, pair.b];
    if (answer === LEAVE_OUT) {
      names.forEach((n) => leftOut.add(n));
    } else if (!["a", "b", "different"].includes(answer)) {
      names.forEach((n) => open.add(n));
    }
  });
  named.forEach((r) => {
    let target = lookup(r.values[key]);
    if (!target) {
      const name = spelling.get(looseKey(r.values[key]));
      if (leftOut.has(name)) {
        r.leftOut = true;
        return;
      }
      if (open.has(name)) {
        r.open = true;
        return;
      }
      const kept = merged.get(name) || name;
      target = lookup(kept) || { add: kept, name: kept };
    }
    if (target.wait) {
      r.open = true;
    } else if (target.ambiguous) {
      r.problems.push(
        `${column.heading}: ${target.ambiguous} are called “${target.name}”`
      );
    } else {
      r.values[key] = target.add || target.name;
      r.targets = { ...(r.targets || {}), [key]: target };
    }
  });
  return pairs;
}
