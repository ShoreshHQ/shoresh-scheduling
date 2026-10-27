// Made-up camps for measuring "Import last year" (docs/import/corpus.md), with the true answer
// for each. Everything is invented. Deterministic: the same seed always gives the same camps.
//
// Level 1, "ordinary": one schedule that repeats every week, clean data (no typos, no doubles,
// no trips or special days), written in one of the layouts the import reads (layouts.js).
import * as XLSX from "xlsx";

/** A small seeded random source (mulberry32): the same seed, the same numbers. */
export function randomFrom(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
    shuffle: (list) => {
      const out = [...list];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    }
  };
}

export const CAMP_WORDS = [
  ["Maple", "Cedar", "Willow", "Birch", "Pine", "Juniper", "Aspen", "Hazel"],
  ["Hollow", "Ridge", "Brook", "Meadow", "Lake", "Grove", "Hill", "Creek"]
];
export const CAMP_KINDS = ["Day Camp", "Camp", "Summer Camp", "Day Program"];

export const ACTIVITIES = [
  "Swim",
  "Archery",
  "Art",
  "Soccer",
  "Basketball",
  "Music",
  "Drama",
  "Nature",
  "Gaga",
  "Tennis",
  "Ceramics",
  "Woodshop",
  "Dance",
  "Climbing",
  "Science",
  "Cooking",
  "Gymnastics",
  "Softball",
  "Yoga",
  "Photography",
  "Arts & Crafts",
  "Ultimate Frisbee",
  "Ropes Course",
  "Canoeing"
];

export const DIVISION_SETS = [
  ["Juniors", "Seniors"],
  ["Juniors", "Inters", "Seniors"],
  ["Aleph", "Bet", "Gimmel", "Daled"],
  ["Explorers", "Pioneers", "Trailblazers"],
  ["Sprouts", "Saplings", "Oaks", "Redwoods", "Sequoias"],
  ["Minnows", "Dolphins", "Sharks", "Orcas", "Whales", "Marlins"]
];

const ANIMALS = [
  "Otters",
  "Foxes",
  "Owls",
  "Bears",
  "Hawks",
  "Wolves",
  "Badgers",
  "Herons",
  "Lynx",
  "Beavers",
  "Ravens",
  "Moose"
];

// How groups are named: "Bunk 7", "Cabin 7", "Juniors 2" (the division in the name), "Otters".
export const GROUP_STYLES = [
  "Bunk",
  "Cabin",
  "Group",
  "divisionNumber",
  "animal"
];

export const WEEKS = [
  ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  ["Monday", "Tuesday", "Wednesday", "Thursday"],
  ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"]
];

export const OPENINGS = ["Flagpole", "Morning Circle", "Boker Tov", "Line Up"];
export const LAYOUT_CHOICES = [
  // [layout, format, how the pages are split]
  ["allCamp", "xlsx", "sheetPerDay"],
  ["allCamp", "xlsx", "oneSheet"],
  ["allCamp", "csv", "filePerDay"],
  ["allCamp", "csv", "oneFile"],
  ["byGroup", "xlsx", "sheetPerGroup"],
  ["byGroup", "csv", "filePerGroup"],
  ["byActivity", "xlsx", "sheetPerDay"],
  ["byActivity", "csv", "oneFile"]
];
export const TIME_STYLES = ["plain", "ampm", "24h"];
export const LABEL_STYLES = ["nameAndTimeColumns", "nameWithTime", "timeOnly"];

export function groupNames(r, divisions, style) {
  let n = 0;
  const animals = r.shuffle(ANIMALS.concat(ANIMALS.map((a) => `Little ${a}`)));
  return divisions.map((division) => ({
    name: division.name,
    groups: Array.from({ length: division.size }, (_, i) => {
      n++;
      if (style === "divisionNumber") return `${division.name} ${i + 1}`;
      if (style === "animal") return animals[n - 1];
      return `${style} ${n}`;
    })
  }));
}

/** The day's time blocks: [{ name, start, end, fixed }], minutes after midnight. */
export function blocksFor(r, opening) {
  const periods = r.int(4, 7);
  const length = r.pick([40, 45, 50, 60]);
  const gap = r.pick([0, 5]);
  const lunchAfter = Math.min(periods - 1, r.int(2, 3));
  const word = r.pick(["Period", "Activity", "Block"]);
  const blocks = [];
  let at = r.pick([8 * 60 + 30, 9 * 60, 9 * 60 + 15]);
  const push = (name, minutes, fixed) => {
    blocks.push({ name, start: at, end: at + minutes, fixed });
    at += minutes + gap;
  };
  if (opening) push(opening, 15, opening);
  for (let p = 1; p <= periods; p++) {
    push(`${word} ${p}`, length, null);
    if (p === lunchAfter) push("Lunch", 45, "Lunch");
  }
  return blocks;
}

/** One level-1 camp and its true answer. */
export function ordinaryCamp(seed) {
  const r = randomFrom(seed * 7919 + 17);
  const [layout, format, split] = LAYOUT_CHOICES[seed % LAYOUT_CHOICES.length];
  const divisionNames = r.pick(DIVISION_SETS).slice(0, r.int(1, 6));
  const big = r.chance(0.2);
  const divisions = divisionNames.map((name) => ({
    name,
    size: big ? r.int(5, Math.floor(40 / divisionNames.length)) : r.int(2, 5)
  }));
  const total = divisions.reduce((n, d) => n + d.size, 0);
  // Two dozen animal names at most; a bigger camp numbers its bunks.
  const style = r.pick(
    GROUP_STYLES.filter((x) => x !== "animal" || total <= 24)
  );
  const opening = r.chance(0.6) ? r.pick(OPENINGS) : null;
  const blocks = blocksFor(r, opening);
  const days = r.pick(WEEKS);
  const periods = blocks.filter((b) => !b.fixed).length;
  // More activities than periods, so no activity sits in one block every day.
  const activities = r
    .shuffle(ACTIVITIES)
    .slice(0, Math.max(periods + 1, r.int(6, 14)));
  const camp = {
    id: `L1-${String(seed).padStart(3, "0")}`,
    level: 1,
    name: `${r.pick(CAMP_WORDS[0])} ${r.pick(CAMP_WORDS[1])} ${r.pick(CAMP_KINDS)}`,
    layout,
    format,
    split,
    timeStyle: r.pick(TIME_STYLES),
    labelStyle: r.pick(LABEL_STYLES),
    // How the files write a day: "Monday" or "Mon".
    shortDays: r.chance(0.3),
    days,
    blocks,
    divisions: groupNames(r, divisions, style),
    activities,
    fixed: blocks.filter((b) => b.fixed).map((b) => b.fixed)
  };
  camp.groups = camp.divisions.flatMap((d) =>
    d.groups.map((g) => ({ name: g, division: d.name }))
  );
  const step = r.int(1, activities.length - 1);
  camp.cell = (g, d, b) => {
    const block = blocks[b];
    if (block.fixed) return block.fixed;
    const p = blocks.slice(0, b).filter((x) => !x.fixed).length;
    // A rotation: each group a different activity, moving on a period and a day at a time.
    return activities[(g * step + p + d * 2) % activities.length];
  };
  // Only the activities the week shows (a small camp may never reach some of the list).
  const shown = new Set();
  camp.groups.forEach((_, g) =>
    days.forEach((_d, d) =>
      blocks.forEach((_b, b) => shown.add(camp.cell(g, d, b)))
    )
  );
  camp.activities = activities.filter((a) => shown.has(a));
  // A by-activity page lists groups by name only, so it shows divisions only when the group's
  // name carries one ("Juniors 2").
  camp.divisionsInFile =
    camp.divisions.length > 1 &&
    (layout !== "byActivity" || style === "divisionNumber");
  return camp;
}

/** How many camps the full level-1 corpus has (the node script scores them all). */
export const CORPUS_SIZE = 320;

/** The level-1 corpus: `count` camps from seed 1. */
export function ordinaryCamps(count) {
  return Array.from({ length: count }, (_, i) => ordinaryCamp(i + 1));
}

/** Minutes after midnight as "09:05", the key the scorer compares times by. */
export const hm = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// ---------- writing the camp's files as a director would ----------

function clockText(minutes, style) {
  const h = Math.floor(minutes / 60);
  const m = String(minutes % 60).padStart(2, "0");
  if (style === "24h") return `${String(h).padStart(2, "0")}:${m}`;
  const twelve = h > 12 ? h - 12 : h;
  return style === "ampm"
    ? `${twelve}:${m} ${h >= 12 ? "PM" : "AM"}`
    : `${twelve}:${m}`;
}

function timeText(camp, block) {
  const sep = camp.timeStyle === "24h" ? "-" : " - ";
  return `${clockText(block.start, camp.timeStyle)}${sep}${clockText(block.end, camp.timeStyle)}`;
}

/** The first cells of a block's row, and the headings above them. */
export function labelCells(camp, block) {
  if (camp.labelStyle === "nameAndTimeColumns")
    return [block.name, timeText(camp, block)];
  if (camp.labelStyle === "nameWithTime")
    return [`${block.name} (${timeText(camp, block)})`];
  return [timeText(camp, block)];
}

export function labelHeadings(camp) {
  if (camp.labelStyle === "nameAndTimeColumns") return ["Period", "Time"];
  return ["Time"];
}

function dayText(camp, d) {
  const day = camp.days[d];
  return camp.shortDays ? day.slice(0, 3) : day;
}

export function sheet(name, rows, merges = []) {
  return { name, rows, merges };
}

function allCampPage(camp, d) {
  const lead = labelHeadings(camp).length;
  const rows = [[`${camp.name} - ${dayText(camp, d)}`]];
  const merges = [];
  if (camp.divisions.length > 1) {
    const row = labelHeadings(camp).map(() => "");
    for (const division of camp.divisions) {
      merges.push({
        s: { r: 1, c: row.length },
        e: { r: 1, c: row.length + division.groups.length - 1 }
      });
      row.push(division.name, ...division.groups.slice(1).map(() => ""));
    }
    rows.push(row);
  }
  rows.push([...labelHeadings(camp), ...camp.groups.map((g) => g.name)]);
  camp.blocks.forEach((block, b) => {
    rows.push([
      ...labelCells(camp, block),
      ...camp.groups.map((_, g) => camp.cell(g, d, b))
    ]);
  });
  return { rows, merges, lead };
}

function byActivityPage(camp, d) {
  const names = [...camp.activities].sort();
  const rows = [[`${camp.name} - ${dayText(camp, d)}`]];
  const setTimes = [...camp.fixed, ...(camp.recurring || [])];
  rows.push([...labelHeadings(camp), ...setTimes, ...names]);
  camp.blocks.forEach((block, b) => {
    const doing = (name) =>
      camp.groups
        .filter((_, g) => camp.cell(g, d, b) === name)
        .map((g) => g.name)
        .join(", ");
    rows.push([
      ...labelCells(camp, block),
      ...setTimes.map(doing),
      ...names.map(doing)
    ]);
  });
  return { rows, merges: [] };
}

function byGroupPage(camp, g) {
  const group = camp.groups[g];
  const title =
    camp.divisions.length > 1
      ? `${group.division} - ${group.name}`
      : group.name;
  const rows = [
    [title],
    [...labelHeadings(camp), ...camp.days.map((_, d) => dayText(camp, d))]
  ];
  camp.blocks.forEach((block, b) => {
    rows.push([
      ...labelCells(camp, block),
      ...camp.days.map((_, d) => camp.cell(g, d, b))
    ]);
  });
  return { title, rows };
}

/** Pages stacked in one sheet, a blank row between them (merges moved down with them). */
export function stacked(pages) {
  const rows = [];
  const merges = [];
  for (const page of pages) {
    const offset = rows.length;
    rows.push(...page.rows, []);
    for (const m of page.merges) {
      merges.push({
        s: { r: m.s.r + offset, c: m.s.c },
        e: { r: m.e.r + offset, c: m.e.c }
      });
    }
  }
  return { rows, merges };
}

/** The camp's pages as { file, sheets: [{ name, rows, merges }] } (before writing them out). */
function pagesOf(camp) {
  const base = camp.name;
  if (camp.layout === "byGroup") {
    const pages = camp.groups.map((_, g) => byGroupPage(camp, g));
    if (camp.split === "sheetPerGroup") {
      return [
        {
          file: `${base} 2026.xlsx`,
          sheets: pages.map((p) => sheet(p.title, p.rows.slice(1)))
        }
      ];
    }
    return pages.map((p) => ({
      file: `${base} 2026 - ${camp.groups[pages.indexOf(p)].name}.csv`,
      sheets: [sheet(p.title, p.rows)]
    }));
  }
  const pageOf = camp.layout === "allCamp" ? allCampPage : byActivityPage;
  const pages = camp.days.map((_, d) => pageOf(camp, d));
  if (camp.split === "sheetPerDay") {
    return [
      {
        file: `${base} 2026.xlsx`,
        sheets: pages.map((p, d) => sheet(dayText(camp, d), p.rows, p.merges))
      }
    ];
  }
  if (camp.split === "filePerDay") {
    return pages.map((p, d) => ({
      file: `${base} 2026 - ${dayText(camp, d)}.csv`,
      sheets: [sheet(dayText(camp, d), p.rows)]
    }));
  }
  const one = stacked(pages);
  const file = `${base} 2026.${camp.format}`;
  return [{ file, sheets: [sheet("Schedule", one.rows, one.merges)] }];
}

export function csvText(rows) {
  return rows
    .map((row) =>
      row
        .map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v))
        .join(",")
    )
    .join("\n");
}

/**
 * The camp's files as a director would upload them: [{ name, csv }] for CSV files, [{ name, data }]
 * (xlsx bytes) for workbooks. Read them with csvFile or workbookFile, as the screen does.
 */
export function campFiles(camp) {
  return filesOf(pagesOf(camp));
}

/** Pages ({ file, sheets }) written out as campFiles returns them. */
export function filesOf(pages) {
  return pages.map(({ file, sheets }) => {
    if (file.endsWith(".csv"))
      return { name: file, csv: csvText(sheets[0].rows) };
    const wb = XLSX.utils.book_new();
    for (const s of sheets) {
      const ws = XLSX.utils.aoa_to_sheet(s.rows);
      ws["!merges"] = s.merges;
      XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
    }
    return {
      name: file,
      data: XLSX.write(wb, { type: "array", bookType: "xlsx" })
    };
  });
}
