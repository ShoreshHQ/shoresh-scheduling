// Level 3, "hard" (docs/import/corpus.md): made-up camps with one repeating week, as level 1, plus
// the untidy things almost every real camp's file has. Each camp has two or three of six traits:
//
// - double:   a group has one activity for two periods in a row (a merged cell in Excel, the
//             name written twice in a CSV, the group listed in both blocks by activity).
// - trip:     one division (or the whole camp) on a Field Trip one afternoon (merged down the
//             afternoon in Excel, written in every block in a CSV, its own column by activity).
// - halfDay:  the youngest division goes home after Lunch: its afternoon cells are blank.
// - gaps:     a few blank cells in ordinary periods (nothing scheduled then).
// - spelling: a few cells spelled otherwise than the rest ("archery", "ARCHERY", "Arts&Crafts").
// - notes:    a line under the title ("Updated June 2 - subject to change") and footnotes under
//             the grid ("Rain plan: ...", "* Bring a water bottle").
//
// The true answer: trips are noted, not set up (classify.js), so a trip is not an activity, but
// its cells stay in the imported week as the trip (version.js); blank cells are not grid cells; a
// slip is its usual spelling; a half-day division's groups are Morning only (INGEST-2.9) when all
// they have is in the morning as the import sets it (before noon) and the day has an afternoon;
// a Lunch at noon or later would be dropped, so they stay all day.
// Deterministic: the same seed always gives the same camp.
import {
  filesOf,
  hm,
  labelCells,
  labelHeadings,
  ordinaryCamp,
  randomFrom,
  sheet,
  stacked
} from "./camps";

/** How many camps the full level-3 corpus has. */
export const LEVEL3_SIZE = 320;

export const TRAITS = [
  "double",
  "trip",
  "halfDay",
  "gaps",
  "spelling",
  "notes"
];
const TRIP = "Field Trip";
const NOTE_ABOVE = [
  "Updated June 2 - subject to change",
  "DRAFT v3",
  "Questions? Ask the head counselor"
];
const NOTES_BELOW = [
  ["Rain plan: indoor activities in the gym"],
  ["* Bring a water bottle and sunscreen every day"],
  ["Rain plan: movie in the dining hall", "* Closed-toe shoes for Woodshop"]
];

/** A slip in how a name is written: other capitals, or the spaces left out. */
function slipOf(r, name) {
  const ways = [name.toLowerCase(), name.toUpperCase()];
  if (name.includes(" ")) ways.push(name.replace(/ /g, ""));
  return r.pick(ways.filter((w) => w !== name));
}

/** The traits a camp has: two or three, never halfDay without a second division. */
function traitsOf(r, camp) {
  const allowed = TRAITS.filter(
    (t) =>
      (t !== "halfDay" || camp.divisions.length > 1) &&
      // A by-activity page writes a name once, in its column's heading: no cell to misspell.
      (t !== "spelling" || camp.layout !== "byActivity")
  );
  return r.shuffle(allowed).slice(0, r.int(2, 3));
}

/** One level-3 camp and its true answer (camp.truth, as the scorer reads it). */
export function hardCamp(seed) {
  const base = ordinaryCamp(8000 + seed * 8 + (seed % 8));
  const r = randomFrom(seed * 15485863 + 7);
  const camp = {
    ...base,
    id: `L3-${String(seed).padStart(3, "0")}`,
    level: 3
  };
  const traits = traitsOf(r, camp);
  camp.variations = traits;
  const { blocks, days, groups } = camp;
  const lunch = blocks.findIndex((b) => b.fixed === "Lunch");
  const afternoon = blocks.map((_, b) => b).filter((b) => b > lunch);
  const free = (b) => !blocks[b].fixed;
  // grid[g][d][b]: the activity (null: blank); runs: "g|d|b" -> blocks one cell covers.
  const grid = groups.map((_, g) =>
    days.map((_d, d) => blocks.map((_b, b) => base.cell(g, d, b)))
  );
  const runs = new Map();
  const taken = new Set();
  const key = (g, d, b) => `${g}|${d}|${b}`;

  if (traits.includes("halfDay")) {
    const youngest = camp.divisions[0].name;
    groups.forEach((group, g) => {
      if (group.division !== youngest) return;
      days.forEach((_d, d) =>
        afternoon.forEach((b) => {
          grid[g][d][b] = null;
          taken.add(key(g, d, b));
        })
      );
    });
    camp.halfDay = youngest;
  }
  if (traits.includes("trip") && afternoon.length > 0) {
    const divisions = camp.divisions.filter((x) => x.name !== camp.halfDay);
    const division = r.pick(divisions).name;
    const d = r.int(1, days.length - 1);
    groups.forEach((group, g) => {
      if (group.division !== division) return;
      afternoon.forEach((b) => {
        grid[g][d][b] = TRIP;
        taken.add(key(g, d, b));
      });
      if (afternoon.length > 1)
        runs.set(key(g, d, afternoon[0]), afternoon.length);
    });
    camp.trip = { division, day: days[d] };
  }
  if (traits.includes("double")) {
    const count = r.int(1, 4);
    for (let i = 0, tries = 0; i < count && tries < 50; tries++) {
      const g = r.int(0, groups.length - 1);
      const d = r.int(0, days.length - 1);
      const b = r.int(0, blocks.length - 2);
      if (!free(b) || !free(b + 1)) continue;
      if (taken.has(key(g, d, b)) || taken.has(key(g, d, b + 1))) continue;
      grid[g][d][b + 1] = grid[g][d][b];
      runs.set(key(g, d, b), 2);
      taken.add(key(g, d, b));
      taken.add(key(g, d, b + 1));
      i++;
    }
  }
  if (traits.includes("gaps")) {
    const count = r.int(1, 3);
    for (let i = 0, tries = 0; i < count && tries < 50; tries++) {
      const g = r.int(0, groups.length - 1);
      const d = r.int(0, days.length - 1);
      const b = r.int(0, blocks.length - 1);
      if (!free(b) || taken.has(key(g, d, b))) continue;
      grid[g][d][b] = null;
      taken.add(key(g, d, b));
      i++;
    }
  }
  // What each cell says in the file: the activity, or a slip of it.
  const written = grid.map((row) => row.map((day) => [...day]));
  if (traits.includes("spelling")) {
    const count = r.int(1, 2);
    for (let i = 0, tries = 0; i < count && tries < 50; tries++) {
      const g = r.int(0, groups.length - 1);
      const d = r.int(0, days.length - 1);
      const b = r.int(0, blocks.length - 1);
      if (!free(b) || taken.has(key(g, d, b)) || !grid[g][d][b]) continue;
      written[g][d][b] = slipOf(r, grid[g][d][b]);
      taken.add(key(g, d, b));
      i++;
    }
  }
  camp.grid = grid;
  camp.written = written;
  camp.runs = runs;
  camp.notes = traits.includes("notes")
    ? { above: r.pick(NOTE_ABOVE), below: r.pick(NOTES_BELOW) }
    : null;
  camp.truth = truthOf(camp);
  return camp;
}

export function hardCamps(count) {
  return Array.from({ length: count }, (_, i) => hardCamp(i + 1));
}

// ---------- the true answer ----------

function truthOf(camp) {
  const cells = new Map();
  const activities = new Set();
  camp.groups.forEach((g, gi) =>
    camp.days.forEach((day, d) =>
      camp.blocks.forEach((block, b) => {
        const name = camp.grid[gi][d][b];
        if (!name) return;
        cells.set(`|${g.name}|${day}|${hm(block.start)}`, name);
        if (!block.fixed && name !== TRIP) activities.add(name);
      })
    )
  );
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
    divisionsInFile: camp.divisionsInFile,
    availability: halfDayAvailability(camp)
  };
}

/** INGEST-2.9: "group|MorningOnly" for each half-day group, when all it has is before noon. */
function halfDayAvailability(camp) {
  if (!camp.halfDay) return [];
  const lunch = camp.blocks.findIndex((b) => b.fixed === "Lunch");
  const noon = 12 * 60;
  const lined =
    camp.blocks.every((b, i) => i > lunch || b.start < noon) &&
    camp.blocks.some((b) => b.start >= noon);
  return lined
    ? camp.groups
        .filter((g) => g.division === camp.halfDay)
        .map((g) => `${g.name}|MorningOnly`)
    : [];
}

// ---------- writing the files as a director would ----------

function dayText(camp, d) {
  const day = camp.days[d];
  return camp.shortDays ? day.slice(0, 3) : day;
}

/** A cell as written: in Excel, the rest of a merged run is blank and merged with the first. */
function cellText(camp, g, d, b) {
  if (camp.format === "xlsx" && coveredBy(camp, g, d, b)) return "";
  return camp.written[g][d][b] || "";
}

/** Whether block b of a group's day is inside a run that starts in an earlier block. */
function coveredBy(camp, g, d, b) {
  for (let s = b - 1; s >= 0; s--) {
    const n = camp.runs.get(`${g}|${d}|${s}`);
    if (n) return s + n > b;
  }
  return false;
}

/** Excel merges for a page whose block b is row firstRow + b and group/day x is column colOf(x). */
function runMerges(camp, firstRow, cellsOf) {
  if (camp.format !== "xlsx") return [];
  const merges = [];
  for (const [k, n] of camp.runs) {
    const [g, d, b] = k.split("|").map(Number);
    const c = cellsOf(g, d);
    if (c === null) continue;
    merges.push({
      s: { r: firstRow + b, c },
      e: { r: firstRow + b + n - 1, c }
    });
  }
  return merges;
}

function withNotes(camp, page) {
  if (!camp.notes) return page;
  const [title, ...rest] = page.rows;
  const shift = (m) => ({
    s: { r: m.s.r + 1, c: m.s.c },
    e: { r: m.e.r + 1, c: m.e.c }
  });
  return {
    ...page,
    rows: [
      title,
      [camp.notes.above],
      ...rest,
      [],
      ...camp.notes.below.map((n) => [n])
    ],
    merges: page.merges.map(shift)
  };
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
  const first = rows.length;
  camp.blocks.forEach((block, b) => {
    rows.push([
      ...labelCells(camp, block),
      ...camp.groups.map((_, g) => cellText(camp, g, d, b))
    ]);
  });
  merges.push(
    ...runMerges(camp, first, (g, day) => (day === d ? lead + g : null))
  );
  return withNotes(camp, { rows, merges });
}

function byActivityPage(camp, d) {
  const names = new Set();
  camp.groups.forEach((_, g) =>
    camp.blocks.forEach((block, b) => {
      const n = camp.grid[g][d][b];
      if (n && !block.fixed) names.add(n);
    })
  );
  const columns = [...camp.fixed, ...[...names].sort()];
  const rows = [
    [`${camp.name} - ${dayText(camp, d)}`],
    [...labelHeadings(camp), ...columns]
  ];
  camp.blocks.forEach((block, b) => {
    const doing = (name) =>
      camp.groups
        .filter((_, g) => camp.grid[g][d][b] === name)
        .map((g) => g.name)
        .join(", ");
    rows.push([...labelCells(camp, block), ...columns.map(doing)]);
  });
  return withNotes(camp, { rows, merges: [] });
}

function byGroupPage(camp, g) {
  const group = camp.groups[g];
  const title =
    camp.divisions.length > 1
      ? `${group.division} - ${group.name}`
      : group.name;
  const lead = labelHeadings(camp).length;
  const rows = [
    [title],
    [...labelHeadings(camp), ...camp.days.map((_, d) => dayText(camp, d))]
  ];
  camp.blocks.forEach((block, b) => {
    rows.push([
      ...labelCells(camp, block),
      ...camp.days.map((_, d) => cellText(camp, g, d, b))
    ]);
  });
  const merges = runMerges(camp, 2, (gg, d) => (gg === g ? lead + d : null));
  return { title, ...withNotes(camp, { rows, merges }) };
}

/** The sheet without its first row (the title, which becomes the sheet's name). */
function untitled(page) {
  const up = (m) => ({
    s: { r: m.s.r - 1, c: m.s.c },
    e: { r: m.e.r - 1, c: m.e.c }
  });
  return sheet(page.title, page.rows.slice(1), page.merges.map(up));
}

function pagesOf(camp) {
  const base = camp.name;
  if (camp.layout === "byGroup") {
    const pages = camp.groups.map((_, g) => byGroupPage(camp, g));
    if (camp.split === "sheetPerGroup") {
      return [{ file: `${base} 2026.xlsx`, sheets: pages.map(untitled) }];
    }
    return pages.map((p, g) => ({
      file: `${base} 2026 - ${camp.groups[g].name}.csv`,
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
  return [
    {
      file: `${base} 2026.${camp.format}`,
      sheets: [sheet("Schedule", one.rows, one.merges)]
    }
  ];
}

/** The camp's files as a director would upload them (as campFiles in camps.js). */
export function hardCampFiles(camp) {
  return filesOf(pagesOf(camp));
}
