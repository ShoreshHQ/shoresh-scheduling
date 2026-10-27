/*
 * Names that may be the same thing spelled two ways. Every pair found is asked about, nothing
 * merged without the director's answer (Greg, 2026-10-16), except the slips rules 2 and 3 of
 * docs/import/names-and-divisions.md read without asking and show in the notes (Greg,
 * 2026-10-27). Three kinds, each raised against the other names in the files and against names
 * already set up in the camp:
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
  if (!long.startsWith(short)) {
    return false;
  }
  const tail = long.slice(short.length);
  if (short.length < MIN_STEM) {
    // Short names only by a plain plural: Art / Arts, Gym / Gyms.
    return short.length >= 3 && /^(s|es)$/.test(tail);
  }
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

function rootOf(parent, name) {
  let root = name;
  while (parent.get(root) !== root) {
    root = parent.get(root);
  }
  return root;
}

/** The spelling a merged set keeps: the camp's name if it has one, else the most chosen. */
function keptSpelling(members, votes, campNames) {
  const camp = members.filter((m) => campNames.has(m)).sort();
  if (camp.length) {
    return camp[0];
  }
  return [...members].sort(
    (x, y) => (votes.get(y) || 0) - (votes.get(x) || 0) || x.localeCompare(y)
  )[0];
}

/**
 * The name each spelling is to be read as, from the answered pairs. "a" or "b" says the two are
 * the same and which spelling to keep; anything else keeps them apart. Names said to be the same
 * form one set (Swim, Swimming, Swim lessons), which keeps one spelling: the camp's, if one of
 * them is already set up, otherwise the one chosen most often (then alphabetical), so answers
 * never swap names around. Returns a Map(name -> name kept), for the names that change.
 */
export function mergesFrom(pairs, answers) {
  const parent = new Map();
  const votes = new Map();
  const campNames = new Set();
  const join = (x, y) => {
    [x, y].forEach((n) => parent.has(n) || parent.set(n, n));
    parent.set(rootOf(parent, x), rootOf(parent, y));
  };
  for (const pair of pairs) {
    const answer = answers[pair.id];
    if (answer !== "a" && answer !== "b") {
      continue;
    }
    join(pair.a, pair.b);
    const kept = answer === "a" ? pair.a : pair.b;
    votes.set(kept, (votes.get(kept) || 0) + 1);
    if (pair.existing) {
      campNames.add(pair.existing);
    }
  }
  const sets = new Map();
  for (const name of parent.keys()) {
    const root = rootOf(parent, name);
    sets.set(root, [...(sets.get(root) || []), name]);
  }
  const resolved = new Map();
  for (const members of sets.values()) {
    const kept = keptSpelling(members, votes, campNames);
    members.filter((m) => m !== kept).forEach((m) => resolved.set(m, kept));
  }
  return resolved;
}

// ---------- read, not asked (docs/import/names-and-divisions.md, rules 2 and 3) ----------

const PLAIN_ENDING = /^(s|es|ing|ed)$/;

function wordsOf(name) {
  return String(name || "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** Rule 2: the same letters and the same numbers, written with other spacing, capitals or punctuation. */
export function sameSpelling(a, b) {
  return (
    similarity(a, b) === "spelling" &&
    digitsOf(String(a)) === digitsOf(String(b))
  );
}

/** Rule 3's words: the same words but the last, which only adds -s, -es, -ing or -ed. */
export function plainEnding(rare, common) {
  const r = wordsOf(rare);
  const c = wordsOf(common);
  if (
    r.length !== c.length ||
    r.slice(0, -1).join() !== c.slice(0, -1).join()
  ) {
    return false;
  }
  const [short, long] = [c[c.length - 1], r[r.length - 1]].sort(
    (x, y) => x.length - y.length
  );
  if (short.length < 3 || !long.startsWith(short)) {
    return false;
  }
  const tail = long.slice(short.length);
  const doubled = tail.charAt(0) === short.charAt(short.length - 1);
  return (
    PLAIN_ENDING.test(tail) || (doubled && /^(ing|ed)$/.test(tail.slice(1)))
  );
}

const sameSlot = (x, y) =>
  x.week === y.week &&
  x.day === y.day &&
  String(x.block).trim() === String(y.block).trim();
const sameBlock = (x, y) =>
  x.week === y.week && String(x.block).trim() === String(y.block).trim();

/**
 * Rule 3's place: every cell of the rare form is where the common form is, in the same block on
 * the same day for another group, or in the same block on another day for the same group.
 * placements: [{ text, group, week, day, block }].
 */
export function sitsLike(rare, common, placements) {
  const commons = placements.filter((p) => p.text === common);
  return placements
    .filter((p) => p.text === rare)
    .every((r) =>
      commons.some(
        (c) =>
          (sameSlot(c, r) && c.group !== r.group) ||
          (sameBlock(c, r) && c.group === r.group && c.day !== r.day)
      )
    );
}

function readAs(pair, placements) {
  if (pair.existing) {
    return null;
  }
  const [rare, common] =
    pair.aCount < pair.bCount
      ? [pair.a, pair.b]
      : pair.bCount < pair.aCount
        ? [pair.b, pair.a]
        : [null, null];
  if (!rare) {
    return null;
  }
  const rareCount = Math.min(pair.aCount, pair.bCount);
  const commonCount = Math.max(pair.aCount, pair.bCount);
  if (sameSpelling(rare, common)) {
    return { from: rare, to: common, rule: "spelling" };
  }
  const ending =
    pair.kind === "activity" &&
    rareCount <= 2 &&
    rareCount * 5 <= commonCount &&
    plainEnding(rare, common) &&
    sitsLike(rare, common, placements);
  return ending ? { from: rare, to: common, rule: "ending" } : null;
}

/**
 * The similar pairs read without asking (rules 2 and 3) and the rest, still asked:
 * { asked: [pair], read: [{ pair, kind, from, to, rule, answer }] }. A name that rules 2 or 3
 * would read as two different names is asked about instead. placements: the activity cells.
 */
export function readWithoutAsking(pairs, placements) {
  const found = pairs.map((pair) => ({ pair, as: readAs(pair, placements) }));
  const targets = new Map();
  found
    .filter((f) => f.as)
    .forEach((f) => {
      const key = `${f.pair.kind}|${f.as.from}`;
      targets.set(key, (targets.get(key) || 0) + 1);
    });
  const read = [];
  const asked = [];
  for (const { pair, as } of found) {
    if (as && targets.get(`${pair.kind}|${as.from}`) === 1) {
      read.push({
        pair,
        kind: pair.kind,
        ...as,
        answer: as.to === pair.a ? "a" : "b"
      });
    } else {
      asked.push(pair);
    }
  }
  // A question whose two names are both already read as one name answers itself ("lunch 2"
  // and "Lunch-2", both Lunch 2): not asked.
  const readName = new Map(read.map((r) => [`${r.kind}|${r.from}`, r.to]));
  const as = (kind, name) => readName.get(`${kind}|${name}`) || name;
  return {
    asked: asked.filter((p) => as(p.kind, p.a) !== as(p.kind, p.b)),
    read
  };
}
