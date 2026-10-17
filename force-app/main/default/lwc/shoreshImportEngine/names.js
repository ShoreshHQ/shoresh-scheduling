/*
 * Names that may be the same thing spelled two ways. Every pair found is asked about; nothing is
 * merged without the director's answer (Greg, 2026-10-16). Three kinds, each raised against the
 * other names in the files and against names already set up in the camp:
 * - capitals, spacing, and punctuation ("Arts & Crafts" / "arts and crafts");
 * - different endings ("Swim" / "Swimming");
 * - one letter different, missing, extra, or swapped ("Music" / "Musik"), which the desktop missed.
 *
 * The endings rule is adapted from Shoresh desktop src/ingest/nearDuplicateNames.js (Apache-2.0,
 * see NOTICE). Numbers keep names apart: "Lunch 1" and "Lunch 2", or "Bunk 3A" and "Bunk 3B",
 * are never raised.
 */

/** Letters and digits only, lower case, with "&" and "+" read as "and". */
export function foldName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/&|\+/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

const WORD_ENDING = /^(s|es|ed|d|ing|er|ers)$/;
const MIN_STEM = 4;

function digitsOf(text) {
  return (text.match(/\d+/g) || []).join(",");
}

function differentEnding(a, b) {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < MIN_STEM || !long.startsWith(short)) {
    return false;
  }
  const tail = long.slice(short.length);
  // "Swim" / "Swimming": the last letter doubled before the ending.
  const doubled =
    tail.charAt(0) === short.charAt(short.length - 1) ? tail.slice(1) : null;
  return (
    WORD_ENDING.test(tail) ||
    (doubled !== null && /^(ing|ed|er|ers)$/.test(doubled))
  );
}

/** Where two strings first differ. */
function firstDifference(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) {
    i++;
  }
  return i;
}

/**
 * Whether two folded names are one edit apart (a letter changed, added, dropped, or two
 * neighbours swapped), where the edit is a letter and not part of a code like "3A".
 */
function oneLetterApart(a, b) {
  if (
    Math.min(a.length, b.length) < MIN_STEM ||
    Math.abs(a.length - b.length) > 1
  ) {
    return false;
  }
  const i = firstDifference(a, b);
  if (i === a.length && i === b.length) {
    return false;
  }
  const changed = a[i] || b[i];
  if (/\d/.test(changed) || (i > 0 && /\d/.test(a[i - 1]))) {
    return false;
  }
  if (a.length === b.length) {
    const swapped =
      a[i] === b[i + 1] &&
      a[i + 1] === b[i] &&
      a.slice(i + 2) === b.slice(i + 2);
    return swapped || a.slice(i + 1) === b.slice(i + 1);
  }
  return a.length > b.length
    ? a.slice(i + 1) === b.slice(i)
    : a.slice(i) === b.slice(i + 1);
}

/** Why two names may be the same ("spelling", "ending", "letter"), or null. */
export function similarity(a, b) {
  if (a === b) {
    return null;
  }
  const fa = foldName(a);
  const fb = foldName(b);
  if (!fa || !fb) {
    return null;
  }
  if (fa === fb) {
    return "spelling";
  }
  if (digitsOf(fa) !== digitsOf(fb)) {
    return null;
  }
  if (differentEnding(fa, fb)) {
    return "ending";
  }
  return oneLetterApart(fa, fb) ? "letter" : null;
}

function pairId(kind, a, b) {
  const [x, y] = [a, b].sort();
  return `similar|${kind}|${foldName(x)}|${foldName(y)}|${x}|${y}`;
}

/**
 * Every similar pair: among the file's names, and between a file name and a name the camp
 * already has. fileNames: [{ name, count }]; campNames: [name]. Returns
 * [{ id, kind, a, b, aCount, bCount, existing (the camp's name, or null), reason }], in a fixed
 * order so the same files always ask the same questions.
 */
export function similarPairs(kind, fileNames, campNames) {
  const files = [...(fileNames || [])].sort((x, y) =>
    x.name.localeCompare(y.name)
  );
  const camp = new Set(campNames || []);
  const pairs = [];
  for (let i = 0; i < files.length; i++) {
    for (let j = i + 1; j < files.length; j++) {
      const reason = similarity(files[i].name, files[j].name);
      // A name the camp already has is asked about as the camp's (below), not as a file name.
      if (reason && !camp.has(files[i].name) && !camp.has(files[j].name)) {
        pairs.push({
          id: pairId(kind, files[i].name, files[j].name),
          kind,
          a: files[i].name,
          b: files[j].name,
          aCount: files[i].count,
          bCount: files[j].count,
          existing: null,
          reason
        });
      }
    }
    for (const existing of [...camp].sort()) {
      const reason = camp.has(files[i].name)
        ? null
        : similarity(files[i].name, existing);
      if (reason) {
        pairs.push({
          id: pairId(kind, files[i].name, existing),
          kind,
          a: files[i].name,
          b: existing,
          aCount: files[i].count,
          bCount: 0,
          existing,
          reason
        });
      }
    }
  }
  return pairs.sort((x, y) => x.id.localeCompare(y.id));
}

/**
 * The name each spelling is to be read as, from the answered pairs. answer "a" or "b" keeps
 * that spelling for both; anything else keeps them apart. Chains ("Swim" -> "Swimming" ->
 * "Swim lessons") are followed to the end. Returns a Map(name -> name).
 */
export function mergesFrom(pairs, answers) {
  const into = new Map();
  for (const pair of pairs) {
    const answer = answers[pair.id];
    if (answer === "a") {
      into.set(pair.b, pair.a);
    } else if (answer === "b") {
      into.set(pair.a, pair.b);
    }
  }
  const resolved = new Map();
  for (const name of into.keys()) {
    let target = name;
    const seen = new Set([name]);
    while (into.has(target) && !seen.has(into.get(target))) {
      target = into.get(target);
      seen.add(target);
    }
    resolved.set(name, target);
  }
  return resolved;
}
