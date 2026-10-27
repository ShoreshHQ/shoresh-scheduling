// Greg's camp: a real camp's 2026 schedule made fictional with Greg's approval
// (fixtures/plant-camp.xlsx), the ordinary baseline beside the made-up level-1 camps. The truth
// below is written by hand from reading the file, as the director means it.
//
// The file: one sheet per group (14 sheets). Each sheet starts with a heading, the group's name
// ("Pirchim 1"), on row 1; row 2 is blank; the day names (Monday to Friday) are on row 3 under
// "Time"; then 12 time blocks, 08:40 to 16:00, written "12:55–01:35" (no am/pm: the afternoon is
// 1, 2, 3 and 4 o'clock). The heading is the group's name, never a day, block or activity.
//
// Groups: 13 in five plant-name divisions (the division is the first word of the sheet's heading),
// plus CIT, its own division (Greg, 2026-10-27).
//
// The file as written, kept as it is (real data): "Swim " with a trailing space; "Swim Returning"
// once (Arazim 2, Wednesday) where every other sheet says "Swim Return"; "Lunch2" once (Tamarim 1,
// Wednesday) for "Lunch 2"; one empty cell (Garinim 2, Tuesday 10:35). The truth says what the
// director means: Swim Return, Lunch 2, and nothing in the empty cell.
import { hm } from "./camps";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const DIVISIONS = ["Pirchim", "Garinim", "Shkedim", "Arazim", "Tamarim", "CIT"];

// [start, end] in minutes after midnight, as the director means them (01:35 is 13:35).
const at = (h, m) => h * 60 + m;
const BLOCKS = [
  [at(8, 40), at(9, 0)],
  [at(9, 0), at(9, 15)],
  [at(9, 20), at(9, 40)],
  [at(9, 45), at(10, 25)],
  [at(10, 35), at(11, 15)],
  [at(11, 25), at(12, 5)],
  [at(12, 10), at(12, 50)],
  [at(12, 55), at(13, 35)],
  [at(13, 40), at(14, 20)],
  [at(14, 25), at(15, 15)],
  [at(15, 20), at(15, 40)],
  [at(15, 40), at(16, 0)]
];

// The same for every group, every day: blocks 0-2 and 10-11.
const FIXED_ROWS = {
  0: "Carpool",
  1: "Group Time",
  2: "Mifkad",
  10: "Busses",
  11: "Carpool"
};

// Blocks 3-9 (09:45 to 15:15), Monday to Friday, read from the file sheet by sheet.
const GRID = {
  "Pirchim 1": [
    "Slingshots | Water Play | Water Play | Gaga Field | FBBG",
    "Music | Slingshots | Virtual Sports | Virtual Sports | Drama",
    "Lunch 1 | Lunch 1 | Lunch 1 | Lunch 1 | Lunch 1",
    "Swim | Menucha | Arts and Crafts | Menucha | Menucha",
    "Swim Return | Sports | Clay | Ruach Prep | Virtual Sports",
    "Sports | Music | Swim | Drama | Ruach",
    "Arts and Crafts | All Camp Activity | Swim Return | All Camp Activity | Shabbat"
  ],
  "Pirchim 2": [
    "Sports | Water Play | Water Play | Mystery Trail | Virtual Sports",
    "Slingshots | Sports | Ruach Prep | Clay | Ruach Prep",
    "Lunch 1 | Lunch 1 | Lunch 1 | Lunch 1 | Lunch 1",
    "Swim | Menucha | Drama | Menucha | Menucha",
    "Swim Return | Music | Gaga Pit | Virtual Sports | Drama",
    "Music | Slingshots | Swim | Arts and Crafts | Ruach",
    "Virtual Sports | All Camp Activity | Swim Return | All Camp Activity | Shabbat"
  ],
  "Garinim 1": [
    "Music | Music | Gaga Pit | FBBG | FBBG",
    "Sports | Water Play | Clay | Arts and Crafts | Ruach Prep",
    "Lunch 1 | Lunch 1 | Lunch 1 | Lunch 1 | Lunch 1",
    "Swim | Slingshots | Little Playground | Drama | Arts and Crafts",
    "Swim Return | Virtual Sports | Virtual Sports | Ruach Prep | Gaga Field",
    "Slingshots | Sports | Swim | Virtual Sports | Ruach",
    "Drama | All Camp Activity | Swim Return | All Camp Activity | Shabbat"
  ],
  "Garinim 2": [
    "Virtual Sports | Slingshots | Slingshots | Clay | Drama",
    "Sports | Water Play |  | Drama | Gaga Field",
    "Lunch 1 | Lunch 1 | Lunch 1 | Lunch 1 | Lunch 1",
    "Swim | Music | Virtual Sports | Arts and Crafts | Virtual Sports",
    "Swim Return | Gaga Pit | Arts and Crafts | Ruach Prep | Clay",
    "Mystery Trail | Sports | Swim | FBBG | Ruach",
    "Music | All Camp Activity | Swim Return | All Camp Activity | Shabbat"
  ],
  "Garinim 3": [
    "Drama | Sports | Music | Little Playground | FBBG",
    "Virtual Sports | Music | Slingshots | Gaga Pit | Virtual Sports",
    "Lunch 1 | Lunch 1 | Lunch 1 | Lunch 1 | Lunch 1",
    "Swim | Water Play | Ruach Prep | Clay | Gaga Field",
    "Swim Return | Slingshots | Drama | Ruach Prep | Arts and Crafts",
    "Arts and Crafts | Virtual Sports | Swim | FBBG | Ruach",
    "Sports | All Camp Activity | Swim Return | All Camp Activity | Shabbat"
  ],
  "Shkedim 1": [
    "Arts and Crafts | Virtual Sports | Arts and Crafts | Sports | Clay",
    "Ruach Prep | Woodworking | Sports | Woodworking | Ruach Prep",
    "Music | Water Play | Water Play | Drama | Drama",
    "Lunch 2 | Lunch 2 | Music | Lunch 2 | Lunch 2",
    "Swim | Mystery Trail | Lunch 4 | Ruach Prep | Gaga Pit",
    "Swim Return | Clay | Slingshots | FBBG | Ruach",
    "Slingshots | All Camp Activity | FBBG | All Camp Activity | Shabbat"
  ],
  "Shkedim 2": [
    "FBBG | Arts and Crafts | Virtual Sports | Slingshots | Slingshots",
    "Arts and Crafts | Drama | Sports | Music | Big Playground",
    "Sports | Water Play | Water Play | Virtual Sports | Clay",
    "Lunch 2 | Lunch 2 | Gaga Field | Lunch 2 | Lunch 2",
    "Swim | Woodworking | Lunch 4 | Ruach Prep | Ruach Prep",
    "Swim Return | Mystery Trail | Music | FBBG | Ruach",
    "Ruach Prep | All Camp Activity | Woodworking | All Camp Activity | Shabbat"
  ],
  "Shkedim 3": [
    "Gaga Field | Woodworking | Mystery Trail | Arts and Crafts | Music",
    "Ruach Prep | Gaga Pit | Ruach Prep | Gaga Field | Arts and Crafts",
    "Sports | Slingshots | Virtual Sports | Music | Woodworking",
    "Lunch 2 | Lunch 2 | Sports | Lunch 2 | Lunch 2",
    "Swim | Water Play | Lunch 4 | Slingshots | Ruach Prep",
    "Swim Return | FBBG | Water Play | Clay | Ruach",
    "FBBG | All Camp Activity | Drama | All Camp Activity | Shabbat"
  ],
  "Arazim 1": [
    "Water Play | Ruach Prep | Woodworking | Drama | Arts and Crafts",
    "Drama | Arts and Crafts | Music | Big Playground | Gaga Pit",
    "Virtual Sports | Sports | Sports | Archery | Virtual Sports",
    "Music | Virtual Sports | Lunch 5 | Mystery Trail | Clay",
    "Lunch 3 | Lunch 3 | Archery | Lunch 3 | Lunch 3",
    "Woodworking | Water Play | Swim | Gaga Field | Ruach",
    "FBBG | All Camp Activity | Swim Return | All Camp Activity | Shabbat"
  ],
  "Arazim 2": [
    "Water Play | Drama | Sports | Woodworking | Gaga Pit",
    "Ruach Prep | Virtual Sports | Drama | FBBG | Ruach Prep",
    "Arts and Crafts | Sports | Archery | Mystery Trail | Arts and Crafts",
    "Archery | Woodworking | Lunch 5 | Music | Big Playground",
    "Lunch 3 | Lunch 3 | Music | Lunch 3 | Lunch 3",
    "Clay | Water Play | Swim | Gaga Pit | Ruach",
    "FBBG | All Camp Activity | Swim Return | All Camp Activity | Shabbat"
  ],
  "Arazim 3": [
    "Woodworking | Ruach Prep | Sports | Water Play | FBBG",
    "Water Play | Big Playground | Woodworking | Sports | Archery",
    "Ruach Prep | Virtual Sports | Music | Clay | Gaga Field",
    "Arts and Crafts | Arts and Crafts | Lunch 5 | Archery | Drama",
    "Lunch 3 | Lunch 3 | Ruach Prep | Lunch 3 | Lunch 3",
    "Virtual Sports | Drama | Swim | Music | Ruach",
    "Mystery Trail | All Camp Activity | Swim Return | All Camp Activity | Shabbat"
  ],
  "Tamarim 1": [
    "Gaga Pit | Clay | Drama | Virtual Sports | Gaga Pit",
    "Ruach Prep | Gaga Field | Arts and Crafts | Water Play | Music",
    "Woodworking | Woodworking | Mystery Trail | Sports | Archery",
    "Lunch 2 | Lunch 2 | Lunch 2 | Lunch 2 | Lunch 2",
    "Swim | Arts and Crafts | FBBG | Music | Ruach Prep",
    "Swim Return | Big Playground | Sports | Archery | Ruach",
    "FBBG | All Camp Activity | Water Play | All Camp Activity | Shabbat"
  ],
  "Tamarim 2": [
    "FBBG | Mystery Trail | Big Playground | Gaga Pit | Big Playground",
    "Woodworking | Clay | Ruach Prep | Water Play | Ruach Prep",
    "Archery | Drama | Woodworking | Sports | Music",
    "Lunch 2 | Lunch 2 | Lunch 2 | Lunch 2 | Lunch 2",
    "Swim | Gaga Field | Virtual Sports | Ruach Prep | Archery",
    "Swim Return | Arts and Crafts | Sports | FBBG | Ruach",
    "Clay | All Camp Activity | Water Play | All Camp Activity | Shabbat"
  ],
  CIT: [
    "FBBG | Ruach Prep | Clay | Music | Gaga Field",
    "Ruach Prep | Mystery Trail | Big Playground | Archery | Ruach Prep",
    "Gaga Pit | Music | Drama | Arts and Crafts | Gaga Pit",
    "Sports | Sports | Archery | Virtual Sports | Woodworking",
    "CIT Block 1 | CIT Block 1 | CIT Block 1 | CIT Block 1 | CIT Block 1",
    "CIT Block 2 | CIT Block 2 | CIT Block 2 | CIT Block 2 | CIT Block 2",
    "CIT Block 3 | CIT Block 3 | CIT Block 3 | CIT Block 3 | CIT Block 3"
  ]
};

/** Everyone, every day, at the same time. */
const FIXED = Object.entries(FIXED_ROWS).map(
  ([b, name]) => `${name}|${hm(BLOCKS[b][0])}`
);

/**
 * At set times for some groups (whole divisions, or everyone but CIT): lunches by division,
 * Menucha for Pirchim, swim by division, All Camp Activity, Ruach, Shabbat, and CIT's own blocks.
 */
const RECURRING = [
  "Lunch 1",
  "Lunch 2",
  "Lunch 3",
  "Lunch 4",
  "Lunch 5",
  "Menucha",
  "Swim",
  "Swim Return",
  "All Camp Activity",
  "Ruach",
  "Shabbat",
  "CIT Block 1",
  "CIT Block 2",
  "CIT Block 3"
];

const ACTIVITIES = [
  "Slingshots",
  "Water Play",
  "Gaga Field",
  "Gaga Pit",
  "FBBG",
  "Music",
  "Virtual Sports",
  "Drama",
  "Arts and Crafts",
  "Clay",
  "Ruach Prep",
  "Sports",
  "Mystery Trail",
  "Little Playground",
  "Big Playground",
  "Woodworking",
  "Archery"
];

function divisionOf(group) {
  const first = group.split(" ")[0];
  return DIVISIONS.includes(first) ? first : "";
}

function cells() {
  const out = new Map();
  for (const [group, rows] of Object.entries(GRID)) {
    BLOCKS.forEach(([start], b) => {
      const row = FIXED_ROWS[b] ? DAYS.map(() => FIXED_ROWS[b]) : null;
      const names = row || rows[b - 3].split(" | ");
      DAYS.forEach((day, d) => {
        if (names[d]) out.set(`|${group}|${day}|${hm(start)}`, names[d]);
      });
    });
  }
  return out;
}

/**
 * Greg's camp as the scorer reads a camp: the file's bytes (read by the caller from
 * fixtures/plant-camp.xlsx) and the true answer.
 */
export function plantCamp(bytes) {
  const groups = Object.keys(GRID).map((name) => ({
    name,
    division: divisionOf(name)
  }));
  return {
    id: "plant-camp",
    level: 1,
    name: "Greg's camp (plant-camp.xlsx)",
    layout: "byGroup",
    format: "xlsx",
    split: "sheetPerGroup",
    files: [{ name: "plant-camp.xlsx", data: bytes }],
    // The heading on row 1 of each sheet: the group's name, not data.
    headings: Object.keys(GRID),
    truth: {
      weeks: [{ label: "", cells: cells() }],
      days: DAYS,
      blocks: BLOCKS.map(([s, e]) => `${hm(s)}-${hm(e)}`),
      divisions: DIVISIONS,
      groups,
      fixed: FIXED,
      recurring: RECURRING,
      activities: ACTIVITIES,
      divisionsInFile: true
    }
  };
}

/** The engine's cells as "group|day|start" -> name, the row each came from kept beside it. */
function readGrid(proposal) {
  const out = new Map();
  for (const p of proposal.usable) {
    const block = proposal.timetables[p.timetable].blocks[p.blockIndex];
    if (block && block.start !== null) {
      out.set(`${p.group}|${p.day}|${hm(block.start)}`, p.text);
    }
  }
  return out;
}

/** Cells that hold what the truth has one block earlier or later: a grid read off by a row. */
function shiftedCells(truth, got) {
  const starts = BLOCKS.map(([s]) => hm(s));
  let shifted = 0;
  for (const [key, name] of got) {
    const [group, day, start] = key.split("|");
    const b = starts.indexOf(start);
    const near = [starts[b - 1], starts[b + 1]].map((s) =>
      truth.get(`|${group}|${day}|${s}`)
    );
    const want = truth.get(`|${key}`);
    if (want !== name && near.includes(name)) shifted++;
  }
  return shifted;
}

/**
 * Greg's check of the headings and the lower day row, from a scoreCamp result made with
 * keepProposal: { headingAsGroup, headingAsData, daysFound, firstBlock (the earliest block's start), shifted }.
 */
export function headingReport(camp, result) {
  const { proposal, plan } = result;
  const headings = new Set(camp.headings);
  const groupNames = new Set(plan.groups.map((g) => g.name));
  const named = [
    ...plan.activities,
    ...plan.fixedActivities,
    ...plan.recurringActivities,
    ...plan.timeBlocks
  ].map((x) => x.name);
  const texts = proposal.usable.map((p) => p.text);
  const program = plan.programs[0];
  return {
    headingAsGroup: camp.headings.filter((h) => groupNames.has(h)).length,
    headingAsData: [...new Set([...named, ...texts])].filter((n) =>
      headings.has(n)
    ),
    daysFound: program ? program.days : [],
    firstBlock: plan.timeBlocks.map((b) => b.start).sort()[0] || null,
    shifted: shiftedCells(camp.truth.weeks[0].cells, readGrid(proposal))
  };
}
