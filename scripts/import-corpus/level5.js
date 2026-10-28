// Level 5, "really weird" (docs/import/corpus.md): files a real camp could send that break the
// usual rules. Each camp is an ordinary one-week camp of level 1 with exactly one weird trait
// (weird files are rare, so they rarely come two at a time), 32 camps per trait:
//
// - transposed:   an all-camp grid on its side: a row per group, a column per time block.
// - timeInCell:   a page per group with no time column; every cell carries its own time
//                 ("9-9:45 Art", "12:00-12:45 Lunch").
// - legend:       cells are letter codes ("A", "B") with a legend under the grid ("A = Archery").
// - hebrew:       groups, divisions, activities and set times named in Hebrew.
// - oneGroup:     the whole camp is one group.
// - hugeCamp:     100 to 160 groups in six to eight divisions.
// - oneDay:       a one-day program: the file has a single day.
// - longDay:      11 to 15 half-hour periods, a very long file.
// - colorOnly:    one activity was shown only by a cell color; exported, its cells are blank and
//                 only a color legend ("Blue = Swim") is left. Only the director can say.
// - multiActivity: a few cells name two activities ("Swim/Art"): half and half, or a split
//                 group? Only the director can say.
//
// The true answer is the camp's own week, with two additions for the last two traits: the cells
// only the director can explain (truth.unknownCells) are not compared, and the camp must ask
// (truth.mustAsk): asking is the right read there, and reading on silently is wrong ("silent").
// Not in the corpus, because the right reading is Greg's call (corpus.md lists the questions):
// emoji in names, an activity and its place in one cell ("Art (Barn)").
// Deterministic: the same seed always gives the same camp.
import {
  ACTIVITIES,
  LAYOUT_CHOICES,
  filesOf,
  hm,
  ordinaryCamp,
  pagesOf,
  randomFrom,
  sheet,
  stacked
} from "./camps";

/** How many camps the full level-5 corpus has. */
export const LEVEL5_SIZE = 320;

export const TRAITS = [
  "transposed",
  "timeInCell",
  "legend",
  "hebrew",
  "oneGroup",
  "hugeCamp",
  "oneDay",
  "longDay",
  "colorOnly",
  "multiActivity"
];

const HEBREW = {
  Swim: "שחייה",
  Archery: "קשתות",
  Art: "אמנות",
  Soccer: "כדורגל",
  Basketball: "כדורסל",
  Music: "מוזיקה",
  Drama: "דרמה",
  Nature: "טבע",
  Gaga: "גאגא",
  Tennis: "טניס",
  Ceramics: "קרמיקה",
  Woodshop: "נגרות",
  Dance: "ריקוד",
  Climbing: "טיפוס",
  Science: "מדע",
  Cooking: "בישול",
  Gymnastics: "התעמלות",
  Softball: "סופטבול",
  Yoga: "יוגה",
  Photography: "צילום",
  "Arts & Crafts": "יצירה",
  "Ultimate Frisbee": "פריזבי",
  "Ropes Course": "חבלים",
  Canoeing: "קיאקים",
  Lunch: "ארוחת צהריים",
  Flagpole: "מפקד",
  "Morning Circle": "מעגל בוקר",
  "Boker Tov": "בוקר טוב",
  "Line Up": "מסדר"
};
const HEBREW_DIVISIONS = [
  "ניצנים",
  "שתילים",
  "גזעים",
  "צמרות",
  "בוגרים",
  "נחשונים"
];
const HEBREW_LETTERS = [..."אבגדהוזחטיכלמנסעפצקרשת"];
const COLORS = ["Blue", "Green", "Yellow", "Orange", "Pink", "Purple"];

/** The layouts a trait can be written in (a by-activity page names each activity once). */
function layoutsFor(trait) {
  if (trait === "transposed")
    return LAYOUT_CHOICES.filter(([l]) => l === "allCamp");
  if (trait === "timeInCell")
    return LAYOUT_CHOICES.filter(([l]) => l === "byGroup");
  if (["legend", "colorOnly", "multiActivity"].includes(trait))
    return LAYOUT_CHOICES.filter(([l]) => l !== "byActivity");
  return LAYOUT_CHOICES;
}

/** The rotation of camps.js over the camp's own groups, blocks and activities. */
function rotate(camp, step) {
  camp.cell = (g, d, b) => {
    const block = camp.blocks[b];
    if (block.fixed) return block.fixed;
    const p = camp.blocks.slice(0, b).filter((x) => !x.fixed).length;
    return camp.activityList[(g * step + p + d * 2) % camp.activityList.length];
  };
}

function regroup(camp, divisions) {
  camp.divisions = divisions;
  camp.groups = divisions.flatMap((d) =>
    d.groups.map((g) => ({ name: g, division: d.name }))
  );
}

/** One level-5 camp and its true answer (camp.truth, as the scorer reads it). */
export function weirdCamp(seed) {
  const trait = TRAITS[(seed - 1) % TRAITS.length];
  const r = randomFrom(seed * 104729 + 5);
  const base = ordinaryCamp(16000 + seed);
  const [layout, format, split] = r.pick(layoutsFor(trait));
  const camp = {
    ...base,
    id: `L5-${String(seed).padStart(3, "0")}`,
    level: 5,
    layout,
    format,
    split,
    variations: [trait],
    blocks: base.blocks.map((b) => ({ ...b })),
    fixed: [...base.fixed]
  };
  camp.activityList = r
    .shuffle(ACTIVITIES)
    .slice(0, Math.max(camp.blocks.filter((b) => !b.fixed).length + 1, 8));

  if (trait === "hugeCamp") {
    const names = [
      "Aleph",
      "Bet",
      "Gimmel",
      "Daled",
      "Hey",
      "Vav",
      "Zayin",
      "Chet"
    ];
    const count = r.int(6, 8);
    let n = 0;
    const divisions = names.slice(0, count).map((name) => {
      const size = r.int(15, 20);
      return {
        name,
        groups: Array.from({ length: size }, () => `Bunk ${++n}`)
      };
    });
    regroup(camp, divisions);
  }
  if (trait === "oneGroup") {
    regroup(camp, [
      { name: "Camp", groups: [r.pick(["Otters", "Bunk 1", "Group 1"])] }
    ]);
  }
  if (trait === "oneDay") {
    camp.days = [r.pick(["Sunday", "Monday", "Wednesday", "Friday"])];
  }
  if (trait === "longDay") {
    const periods = r.int(11, 15);
    const blocks = [];
    let at = 8 * 60;
    const push = (name, minutes, fixed) => {
      blocks.push({ name, start: at, end: at + minutes, fixed });
      at += minutes;
    };
    if (base.fixed.length > 1) push(base.fixed[0], 15, base.fixed[0]);
    for (let p = 1; p <= periods; p++) {
      push(`Period ${p}`, 30, null);
      if (p === 6) push("Lunch", 45, "Lunch");
    }
    camp.blocks = blocks;
    camp.fixed = blocks.filter((b) => b.fixed).map((b) => b.fixed);
    camp.activityList = r.shuffle(ACTIVITIES).slice(0, periods + 2);
  }
  // A step that shares no factor with the list, so no two groups ever have the same day.
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const n = camp.activityList.length;
  const step = r.pick([1, 2, 3, 5, 7].filter((x) => x < n && gcd(x, n) === 1));
  rotate(camp, step);
  if (trait === "hebrew") {
    const he = (x) => HEBREW[x] || x;
    camp.activityList = camp.activityList.map(he);
    camp.blocks = camp.blocks.map((b) =>
      b.fixed ? { ...b, name: he(b.name), fixed: he(b.fixed) } : b
    );
    camp.fixed = camp.fixed.map(he);
    camp.divisions = camp.divisions.map((d, i) => ({
      name: HEBREW_DIVISIONS[i],
      groups: d.groups.map(
        (_, j) => `${HEBREW_DIVISIONS[i]} ${HEBREW_LETTERS[j] || j + 1}`
      )
    }));
    regroup(camp, camp.divisions);
    rotate(camp, step);
  }

  // What each cell truly is, and what the file writes there.
  const truthCell = camp.cell;
  const unknown = new Set();
  let written = truthCell;
  let legendLines = [];
  if (trait === "legend") {
    const names = [...new Set(camp.activityList)];
    const codeOf = new Map(
      names.map((n, i) => [n, String.fromCharCode(65 + i)])
    );
    written = (g, d, b) =>
      camp.blocks[b].fixed
        ? truthCell(g, d, b)
        : codeOf.get(truthCell(g, d, b));
    legendLines = ["Key:", ...names.map((n) => `${codeOf.get(n)} = ${n}`)];
  }
  if (trait === "colorOnly") {
    const hidden = camp.activityList[0];
    written = (g, d, b) =>
      truthCell(g, d, b) === hidden ? "" : truthCell(g, d, b);
    legendLines = [`${r.pick(COLORS)} = ${hidden}`];
    camp.groups.forEach((_, g) =>
      camp.days.forEach((_d, d) =>
        camp.blocks.forEach((_b, b) => {
          if (truthCell(g, d, b) === hidden) unknown.add(`${g}|${d}|${b}`);
        })
      )
    );
    camp.hidden = hidden;
  }
  const doubled = new Map();
  if (trait === "multiActivity") {
    const count = r.int(1, 3);
    for (let i = 0, tries = 0; i < count && tries < 50; tries++) {
      const g = r.int(0, camp.groups.length - 1);
      const d = r.int(0, camp.days.length - 1);
      const b = r.int(0, camp.blocks.length - 1);
      if (camp.blocks[b].fixed || doubled.has(`${g}|${d}|${b}`)) continue;
      const a = truthCell(g, d, b);
      const other = r.pick(camp.activityList.filter((x) => x !== a));
      doubled.set(`${g}|${d}|${b}`, `${a}${r.pick(["/", " / "])}${other}`);
      unknown.add(`${g}|${d}|${b}`);
      i++;
    }
    written = (g, d, b) => doubled.get(`${g}|${d}|${b}`) || truthCell(g, d, b);
  }
  camp.written = written;
  camp.doubled = doubled;
  camp.legendLines = legendLines;
  camp.truth = truthOf(camp, truthCell, unknown, trait);
  Object.defineProperty(camp, "files", {
    get: () => weirdCampFiles(camp),
    enumerable: false
  });
  return camp;
}

export function weirdCamps(count) {
  return Array.from({ length: count }, (_, i) => weirdCamp(i + 1));
}

// ---------- the true answer ----------

function truthOf(camp, cellOf, unknown, trait) {
  const cells = new Map();
  const activities = new Set();
  const unknownCells = [];
  camp.groups.forEach((g, gi) =>
    camp.days.forEach((day, d) =>
      camp.blocks.forEach((block, b) => {
        const key = `|${g.name}|${day}|${hm(block.start)}`;
        if (unknown.has(`${gi}|${d}|${b}`)) {
          unknownCells.push(key);
          return;
        }
        const name = cellOf(gi, d, b);
        cells.set(key, name);
        if (!block.fixed) activities.add(name);
      })
    )
  );
  // Names only the director can explain: a two-activity cell, the activity shown by color.
  const ignoreNames = [
    ...new Set([...(camp.doubled || new Map()).values()]),
    ...(camp.hidden ? [camp.hidden] : [])
  ];
  return {
    weeks: [{ label: "", cells }],
    days: camp.days,
    blocks: camp.blocks.map((b) => `${hm(b.start)}-${hm(b.end)}`),
    divisions: camp.divisions.map((d) => d.name),
    groups: camp.groups,
    fixed: camp.fixed.map(
      (f) => `${f}|${hm(camp.blocks.find((b) => b.fixed === f).start)}`
    ),
    recurring: [],
    activities: [...activities],
    divisionsInFile:
      camp.divisions.length > 1 &&
      (camp.layout !== "byActivity" || trait === "hebrew"),
    unknownCells,
    ignoreNames,
    mustAsk: unknown.size > 0
  };
}

// ---------- writing the files as a director would ----------

const clock = (m, short) => {
  const h = Math.floor(m / 60);
  const twelve = h > 12 ? h - 12 : h;
  const mm = String(m % 60).padStart(2, "0");
  return short && mm === "00" ? `${twelve}` : `${twelve}:${mm}`;
};

function blockLabel(block) {
  return `${block.name} (${clock(block.start)} - ${clock(block.end)})`;
}

function dayText(camp, d) {
  const day = camp.days[d];
  return camp.shortDays ? day.slice(0, 3) : day;
}

/** Transposed: a row per group (with its division), a column per block. */
function transposedPage(camp, d) {
  const divisions = camp.divisions.length > 1;
  const rows = [
    [`${camp.name} - ${dayText(camp, d)}`],
    [
      ...(divisions ? ["Division"] : []),
      "Group",
      ...camp.blocks.map(blockLabel)
    ]
  ];
  camp.groups.forEach((g, gi) =>
    rows.push([
      ...(divisions ? [g.division] : []),
      g.name,
      ...camp.blocks.map((_, b) => camp.written(gi, d, b))
    ])
  );
  return { rows, merges: [] };
}

/** A page per group, days across, the time written in every cell. */
function timeInCellPage(camp, g, short) {
  const group = camp.groups[g];
  const title =
    camp.divisions.length > 1
      ? `${group.division} - ${group.name}`
      : group.name;
  const rows = [[title], ["", ...camp.days.map((_, d) => dayText(camp, d))]];
  camp.blocks.forEach((block, b) =>
    rows.push([
      block.name,
      ...camp.days.map(
        (_, d) =>
          `${clock(block.start, short)}-${clock(block.end, short)} ${camp.written(g, d, b)}`
      )
    ])
  );
  return { title, rows };
}

function withLegend(camp, pages) {
  if (!camp.legendLines.length) return pages;
  return pages.map((p) => ({
    ...p,
    sheets: p.sheets.map((s) =>
      sheet(
        s.name,
        [...s.rows, [], ...camp.legendLines.map((l) => [l])],
        s.merges
      )
    )
  }));
}

function weirdPages(camp) {
  const trait = camp.variations[0];
  const base = camp.name;
  if (trait === "transposed") {
    const pages = camp.days.map((_, d) => transposedPage(camp, d));
    if (camp.split === "sheetPerDay")
      return [
        {
          file: `${base} 2026.xlsx`,
          sheets: pages.map((p, d) => sheet(dayText(camp, d), p.rows))
        }
      ];
    if (camp.split === "filePerDay")
      return pages.map((p, d) => ({
        file: `${base} 2026 - ${dayText(camp, d)}.csv`,
        sheets: [sheet(dayText(camp, d), p.rows)]
      }));
    const one = stacked(pages);
    return [
      {
        file: `${base} 2026.${camp.format}`,
        sheets: [sheet("Schedule", one.rows)]
      }
    ];
  }
  if (trait === "timeInCell") {
    const short = camp.id.endsWith("2") || camp.id.endsWith("7");
    const pages = camp.groups.map((_, g) => timeInCellPage(camp, g, short));
    if (camp.split === "sheetPerGroup")
      return [
        {
          file: `${base} 2026.xlsx`,
          sheets: pages.map((p) => sheet(p.title, p.rows.slice(1)))
        }
      ];
    return pages.map((p, g) => ({
      file: `${base} 2026 - ${camp.groups[g].name}.csv`,
      sheets: [sheet(p.title, p.rows)]
    }));
  }
  // Every other trait is written as level 1 writes the camp, with the file's own cell text.
  const writing = {
    ...camp,
    cell: camp.written,
    activities: [...new Set(camp.activityList)]
  };
  return withLegend(camp, pagesOf(writing));
}

/** The camp's files as a director would upload them (as campFiles in camps.js). */
export function weirdCampFiles(camp) {
  return filesOf(weirdPages(camp));
}

// ---------- scoring ----------

const total = (o) => Object.values(o).reduce((a, b) => a + (b || 0), 0);

/**
 * One level-5 camp through scoreCamp (score.js). Where only the director can explain a cell
 * (truth.mustAsk), asking is the right read: the camp is correct when it asks and reads nothing
 * else wrong, and reading on without a question counts as one wrong read of kind "silent".
 */
export function scoreWeirdCamp(camp, deps, scoreCamp) {
  const r = scoreCamp(camp, deps);
  if (r.error) return r;
  if (camp.truth.mustAsk) {
    const asked = total(r.questions) > 0;
    r.wrong.silent = asked ? 0 : 1;
    r.rightAsk = asked;
    r.perfect = total(r.wrong) === 0;
  }
  return r;
}

function pad(text, width) {
  return String(text).padEnd(width);
}

/** Level 5's report: per trait, camps, correct, asked, questions, wrong reads by kind. */
export function weirdTable(results) {
  const lines = [
    `${pad("Trait", 15)}${pad("Camps", 7)}${pad("Correct", 9)}${pad("Asked", 7)}${pad("Questions", 11)}${pad("Wrong", 7)}Wrong by kind; example`
  ];
  const row = (label, list) => {
    const asked = list.filter((r) => total(r.questions) > 0).length;
    const q = list.reduce((n, r) => n + total(r.questions), 0);
    const kinds = {};
    for (const r of list)
      for (const [k, v] of Object.entries(r.wrong))
        if (v) kinds[k] = (kinds[k] || 0) + v;
    const wrongCamps = list.filter((r) => total(r.wrong) > 0);
    const example = wrongCamps[0] ? `; e.g. ${wrongCamps[0].camp.id}` : "";
    const errors = list.filter((r) => r.error).length;
    const shown =
      Object.entries(kinds)
        .map(([k, v]) => `${k} ${v}`)
        .join(", ") || "0";
    return `${pad(label, 15)}${pad(list.length, 7)}${pad(list.filter((r) => r.perfect).length, 9)}${pad(asked, 7)}${pad(q, 11)}${pad(wrongCamps.length, 7)}${shown}${errors ? `; errors ${errors}` : ""}${example}`;
  };
  for (const trait of TRAITS) {
    const list = results.filter((r) => r.camp.variations[0] === trait);
    if (list.length) lines.push(row(trait, list));
  }
  lines.push(row("All", results));
  return lines.join("\n");
}
