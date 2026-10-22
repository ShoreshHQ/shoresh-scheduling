// Writes the made-up camper-choices sheets the electives choices reader is tested against
// (c/shoreshChoicesReader, docs/adr/0016-reading-a-choices-sheet.md) into docs/samples/choices/,
// with manifest.json: for every file, what a correct reading finds in it.
// Run: node scripts/make-choices-samples.mjs
//
// EVERYTHING IS INVENTED. Camper names are drawn only from names.json (made-up surnames), with a
// fixed seed, so the same files come out every time. No file here is, or is copied from, a real
// camp's sheet: the desktop owner ruled the corpus synthetic-only (desktop ADR
// 2026-09-27-elective-preference-etl §8.0), and a test checks every name against names.json.
//
// One shape per file, each a way a camp's own form or registration system hands over choices
// (desktop ADR §8.0's shape classes and §8.1's probes): ranked columns headed in different words,
// one row per choice, two-row (merged) headings, choices per period, a planner that is one camper's
// own sheet, an offerings menu that holds no camper at all, division-only and bunk columns, blank
// rows, a title above the table, footers below it, extra columns nobody asked for, parent comments
// and opt-outs, lists in one cell, tied ranks, and campers who share a name.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "samples",
  "choices"
);
const NAMES = JSON.parse(readFileSync(join(OUT, "names.json"), "utf8"));

const ACTIVITIES = [
  "Archery",
  "Drama",
  "Pottery",
  "Swim",
  "Ceramics",
  "Soccer",
  "Woodworking",
  "Dance",
  "Rock climbing",
  "Cooking",
  "Robotics",
  "Gaga"
];
const DIVISIONS = {
  Juniors: ["Bunk 1", "Bunk 2"],
  Middlers: ["Bunk 3", "Bunk 4"],
  Seniors: ["Bunk 5", "Bunk 6"]
};

// ---------- a seeded random source, so the corpus is the same every run ----------

let seed = 20271021;
function random() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (list) => list[Math.floor(random() * list.length)];
function pickSome(list, n) {
  const pool = [...list];
  const out = [];
  while (out.length < n && pool.length) {
    out.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  }
  return out;
}

const usedNames = new Set();
function newName() {
  for (;;) {
    const name = `${pick(NAMES.first)} ${pick(NAMES.last)}`;
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
  }
}
let nextNumber = 1001;

/** n made-up campers, each with a division and a bunk in it. */
function campers(n, { numbers = false } = {}) {
  return Array.from({ length: n }, () => {
    const division = pick(Object.keys(DIVISIONS));
    return {
      name: newName(),
      number: numbers ? String(nextNumber++) : null,
      division,
      bunk: pick(DIVISIONS[division])
    };
  });
}

// ---------- what a correct reading finds ----------

const ranked = (names, extra = {}) =>
  names.map((name, i) => ({
    name,
    rank: i + 1,
    kind: "ranked",
    day: null,
    period: null,
    ...extra
  }));
const unordered = (names, extra = {}) =>
  names.map((name) => ({
    name,
    rank: null,
    kind: "unordered",
    day: null,
    period: null,
    ...extra
  }));
const cellChoice = (name, day, period) => ({
  name,
  rank: 1,
  kind: "cell",
  day,
  period
});

function truthCamper(c, choices, { division = true, bunk = false } = {}) {
  return {
    name: c.name,
    number: c.number,
    division: division ? c.division : null,
    bunk: bunk ? c.bunk : null,
    choices
  };
}

// ---------- writing files ----------

const manifest = [];

function writeCsv(file, rows) {
  const text = rows
    .map((row) =>
      row
        .map((v) => {
          const s = String(v ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    )
    .join("\n");
  writeFileSync(join(OUT, file), `${text}\n`);
}

/** sheets: [{ name, rows, merges: ["C1:E1", ...] }] */
function writeXlsx(file, sheets) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    ws["!merges"] = (s.merges || []).map((m) => XLSX.utils.decode_range(m));
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  }
  const data = XLSX.write(wb, {
    type: "buffer",
    bookType: "xlsx",
    compression: true
  });
  writeFileSync(join(OUT, file), data);
}

/**
 * One corpus entry. `expect` is what a correct reading finds: campers (in the order the sheet
 * first names them), the comments and opt-outs it shows but never keeps, campers it can't tell
 * apart, and what it reports as not read or worth a look (kind and place only).
 */
function add(file, shape, expect) {
  manifest.push({
    file,
    shape,
    campers: expect.campers || [],
    notKept: expect.notKept || [],
    cantTellApart: expect.cantTellApart || [],
    notRead: expect.notRead || [],
    toCheck: expect.toCheck || []
  });
}

// ---------- the shapes ----------

function rankedSheet(
  file,
  shape,
  {
    heads,
    count = 10,
    idHead = null,
    nameHead = "Camper Name",
    divisionHead = "Division",
    bunkHead = null
  }
) {
  const people = campers(count, { numbers: Boolean(idHead) });
  const header = [
    ...(idHead ? [idHead] : []),
    nameHead,
    ...(divisionHead ? [divisionHead] : []),
    ...(bunkHead ? [bunkHead] : []),
    ...heads
  ];
  const rows = [header];
  const truth = [];
  for (const c of people) {
    const choices = pickSome(ACTIVITIES, heads.length);
    // Some campers leave their last choice blank.
    const filled = random() < 0.2 ? choices.slice(0, -1) : choices;
    rows.push([
      ...(idHead ? [c.number] : []),
      c.name,
      ...(divisionHead ? [c.division] : []),
      ...(bunkHead ? [c.bunk] : []),
      ...heads.map((_, i) => filled[i] || "")
    ]);
    truth.push(
      truthCamper(c, ranked(filled), {
        division: Boolean(divisionHead),
        bunk: Boolean(bunkHead)
      })
    );
  }
  writeCsv(file, rows);
  add(file, shape, { campers: truth });
}

mkdirSync(OUT, { recursive: true });

// 1-5: ranked columns, headed the ways forms head them.
rankedSheet(
  "01-ranked-hash.csv",
  "ranked columns headed #1, #2, #3; division only",
  {
    heads: ["#1", "#2", "#3"]
  }
);
rankedSheet(
  "02-ranked-words.csv",
  "ranked columns headed First Choice ... Fourth Choice; bunk only",
  {
    heads: ["First Choice", "Second Choice", "Third Choice", "Fourth Choice"],
    nameHead: "Name",
    divisionHead: null,
    bunkHead: "Bunk"
  }
);
rankedSheet(
  "03-ranked-ordinals.csv",
  "ranked columns headed 1st choice, 2nd choice; the division is an Edah",
  {
    heads: ["1st choice", "2nd choice", "3rd choice"],
    nameHead: "Camper",
    divisionHead: "Edah"
  }
);
rankedSheet(
  "04-camper-numbers.csv",
  "camper numbers, division and bunk columns, Rank 1-3",
  {
    heads: ["Rank 1", "Rank 2", "Rank 3"],
    idHead: "Camper ID",
    bunkHead: "Cabin"
  }
);

// 5: first and last name in two columns.
{
  const file = "05-split-name.csv";
  const people = campers(9);
  const rows = [
    ["First Name", "Last Name", "Division", "Choice 1", "Choice 2", "Choice 3"]
  ];
  const truth = [];
  for (const c of people) {
    const ch = pickSome(ACTIVITIES, 3);
    const [first, ...last] = c.name.split(" ");
    rows.push([first, last.join(" "), c.division, ...ch]);
    truth.push(truthCamper(c, ranked(ch)));
  }
  writeCsv(file, rows);
  add(file, "first and last name in two columns", { campers: truth });
}

// 6: one row per choice, a rank column and an activity column.
{
  const file = "06-one-row-per-choice.csv";
  const people = campers(8);
  const rows = [["Camper Name", "Division", "Rank", "Activity"]];
  const truth = [];
  for (const c of people) {
    const ch = pickSome(ACTIVITIES, 3);
    ch.forEach((a, i) => rows.push([c.name, c.division, String(i + 1), a]));
    truth.push(truthCamper(c, ranked(ch)));
  }
  writeCsv(file, rows);
  add(file, "one row per choice, with a rank column", { campers: truth });
}

// 7: one row per choice, sorted by activity (a camper's rows are far apart), with numbers.
{
  const file = "07-one-row-per-choice-sorted.csv";
  const people = campers(8, { numbers: true });
  const lines = [];
  const truth = [];
  for (const c of people) {
    const ch = pickSome(ACTIVITIES, 3);
    ch.forEach((a, i) =>
      lines.push([c.number, c.name, c.bunk, String(i + 1), a])
    );
  }
  lines.sort((a, b) => a[4].localeCompare(b[4]) || a[0].localeCompare(b[0]));
  // Choices come out in the order the sheet lists them, so build the truth from the sorted rows.
  for (const c of people) {
    const mine = lines.filter((l) => l[0] === c.number);
    truth.push({ c, mine, first: lines.indexOf(mine[0]) });
  }
  truth.sort((a, b) => a.first - b.first);
  writeCsv(file, [
    ["Camper #", "Name", "Bunk", "Choice Rank", "Elective"],
    ...lines
  ]);
  add(
    file,
    "one row per choice, sorted by activity, with camper numbers and a bunk",
    {
      campers: truth.map(({ c, mine }) =>
        truthCamper(
          c,
          mine.map((l) => ({
            name: l[4],
            rank: Number(l[3]),
            kind: "ranked",
            day: null,
            period: null
          })),
          { division: false, bunk: true }
        )
      )
    }
  );
}

// 8: one row per choice, no rank: choices in no order.
{
  const file = "08-one-row-per-choice-no-rank.csv";
  const people = campers(7);
  const rows = [["Name", "Bunk", "Activity"]];
  const truth = [];
  for (const c of people) {
    const ch = pickSome(ACTIVITIES, 2 + Math.floor(random() * 2));
    ch.forEach((a) => rows.push([c.name, c.bunk, a]));
    truth.push(truthCamper(c, unordered(ch), { division: false, bunk: true }));
  }
  writeCsv(file, rows);
  add(file, "one row per choice with no rank (unordered)", { campers: truth });
}

// 9: a merged "Choices" heading over 1, 2, 3, name and division merged down two rows.
{
  const file = "09-merged-choices-header.xlsx";
  const people = campers(9);
  const rows = [
    ["Camper Name", "Division", "Choices", "", ""],
    ["", "", "1", "2", "3"]
  ];
  const truth = [];
  for (const c of people) {
    const ch = pickSome(ACTIVITIES, 3);
    rows.push([c.name, c.division, ...ch]);
    truth.push(truthCamper(c, ranked(ch)));
  }
  writeXlsx(file, [
    { name: "Choices", rows, merges: ["A1:A2", "B1:B2", "C1:E1"] }
  ]);
  add(file, "two-row heading: Choices merged over 1, 2, 3", { campers: truth });
}

// 10: day names merged over 1st/2nd/3rd: ranked choices for each elective day.
{
  const file = "10-merged-days-header.xlsx";
  const people = campers(8);
  const rows = [
    ["Camper", "Division", "Tuesday", "", "", "Thursday", "", ""],
    ["", "", "1st", "2nd", "3rd", "1st", "2nd", "3rd"]
  ];
  const truth = [];
  for (const c of people) {
    const tue = pickSome(ACTIVITIES, 3);
    const thu = pickSome(ACTIVITIES, 3);
    rows.push([c.name, c.division, ...tue, ...thu]);
    truth.push(
      truthCamper(c, [
        ...ranked(tue, { day: "Tuesday" }),
        ...ranked(thu, { day: "Thursday" })
      ])
    );
  }
  writeXlsx(file, [
    { name: "Sheet1", rows, merges: ["A1:A2", "B1:B2", "C1:E1", "F1:H1"] }
  ]);
  add(file, "two-row heading: each day merged over 1st, 2nd, 3rd", {
    campers: truth
  });
}

// 11: one choice per period, the period in the heading.
{
  const file = "11-choice-per-period.csv";
  const people = campers(10);
  const cols = [
    ["Monday", "Period 3"],
    ["Wednesday", "Period 3"],
    ["Friday", "Period 3"]
  ];
  const rows = [
    ["Camper Name", "Division", ...cols.map(([d, p]) => `${d} ${p}`)]
  ];
  const truth = [];
  for (const c of people) {
    const ch = cols.map(() => pick(ACTIVITIES));
    rows.push([c.name, c.division, ...ch]);
    truth.push(
      truthCamper(
        c,
        ch.map((a, i) => cellChoice(a, cols[i][0], cols[i][1]))
      )
    );
  }
  writeCsv(file, rows);
  add(file, "one choice per period, day and period in each heading", {
    campers: truth
  });
}

// 12: ranked choices within each period ("Tue P2 - 1st choice").
{
  const file = "12-ranked-per-period.csv";
  const people = campers(8);
  const rows = [
    [
      "Name",
      "Division",
      "Tue P2 - 1st choice",
      "Tue P2 - 2nd choice",
      "Thu P2 - 1st choice",
      "Thu P2 - 2nd choice"
    ]
  ];
  const truth = [];
  for (const c of people) {
    const tue = pickSome(ACTIVITIES, 2);
    const thu = pickSome(ACTIVITIES, 2);
    rows.push([c.name, c.division, ...tue, ...thu]);
    truth.push(
      truthCamper(c, [
        ...ranked(tue, { day: "Tuesday", period: "Period 2" }),
        ...ranked(thu, { day: "Thursday", period: "Period 2" })
      ])
    );
  }
  writeCsv(file, rows);
  add(file, "ranked choices within each period, abbreviated headings", {
    campers: truth
  });
}

// 13: a choice for each period plus a ranked list for the rest of the week.
{
  const file = "13-per-period-and-fallback.csv";
  const people = campers(8);
  const rows = [
    [
      "Camper Name",
      "Division",
      "Mon Period 4",
      "Wed Period 4",
      "Choice 1",
      "Choice 2",
      "Choice 3"
    ]
  ];
  const truth = [];
  for (const c of people) {
    const mon = pick(ACTIVITIES);
    const wed = pick(ACTIVITIES);
    const rest = pickSome(ACTIVITIES, 3);
    rows.push([c.name, c.division, mon, wed, ...rest]);
    truth.push(
      truthCamper(c, [
        cellChoice(mon, "Monday", "Period 4"),
        cellChoice(wed, "Wednesday", "Period 4"),
        ...ranked(rest)
      ])
    );
  }
  writeCsv(file, rows);
  add(file, "a choice per period plus a ranked list for the week", {
    campers: truth
  });
}

// 14: division and bunk both present.
rankedSheet("14-division-and-bunk.csv", "division and bunk columns, Pref 1-3", {
  heads: ["Pref 1", "Pref 2", "Pref 3"],
  bunkHead: "Bunk"
});

// 15: blank rows between campers and after the last.
{
  const file = "15-blank-rows.csv";
  const people = campers(9);
  const rows = [["Camper Name", "Division", "#1", "#2", "#3"]];
  const truth = [];
  people.forEach((c, i) => {
    const ch = pickSome(ACTIVITIES, 3);
    rows.push([c.name, c.division, ...ch]);
    if (i % 3 === 2) rows.push(["", "", "", "", ""]);
    truth.push(truthCamper(c, ranked(ch)));
  });
  rows.push(["", "", "", "", ""], ["", "", "", "", ""]);
  writeCsv(file, rows);
  add(file, "blank rows between campers and at the end", { campers: truth });
}

// 16: a title and a season line above the table.
{
  const file = "16-title-above.csv";
  const people = campers(8);
  const rows = [
    ["Camp Willowbend (made up): chugim choices", "", "", "", ""],
    ["Summer 2027", "", "", "", ""],
    ["", "", "", "", ""],
    ["Camper Name", "Division", "Choice 1", "Choice 2", "Choice 3"]
  ];
  const truth = [];
  for (const c of people) {
    const ch = pickSome(ACTIVITIES, 3);
    rows.push([c.name, c.division, ...ch]);
    truth.push(truthCamper(c, ranked(ch)));
  }
  writeCsv(file, rows);
  add(file, "a title and a season line above the table", {
    campers: truth,
    notRead: [
      { kind: "aboveTable", sheet: file, row: 1 },
      { kind: "aboveTable", sheet: file, row: 2 }
    ]
  });
}

// 17: a parent comments box and a swim opt-out. Shown, never kept.
{
  const file = "17-comments-and-opt-out.csv";
  const people = campers(10);
  const rows = [
    [
      "Camper Name",
      "Division",
      "1st Choice",
      "2nd Choice",
      "3rd Choice",
      "Swim opt-out",
      "Comments"
    ]
  ];
  const truth = [];
  const notKept = [];
  const COMMENTS = [
    "Please keep with her bunk friends",
    "He is new this year",
    "Loves anything outdoors"
  ];
  people.forEach((c, i) => {
    const ch = pickSome(ACTIVITIES, 3);
    const optOut = i % 4 === 1 ? "Yes" : "";
    const comment = i % 3 === 0 ? COMMENTS[i % COMMENTS.length] : "";
    rows.push([c.name, c.division, ...ch, optOut, comment]);
    truth.push(truthCamper(c, ranked(ch)));
    if (optOut)
      notKept.push({
        name: c.name,
        kind: "optOut",
        heading: "Swim opt-out",
        text: optOut
      });
    if (comment)
      notKept.push({
        name: c.name,
        kind: "comment",
        heading: "Comments",
        text: comment
      });
  });
  writeCsv(file, rows);
  add(file, "a swim opt-out column and a parent comments column", {
    campers: truth,
    notKept
  });
}

// 18: a form export with columns nobody asked for (timestamp, emails, sizes).
{
  const file = "18-extra-columns.csv";
  const people = campers(8);
  const rows = [
    [
      "Timestamp",
      "Email Address",
      "Camper Name",
      "Parent Name",
      "Division",
      "T-shirt size",
      "Choice 1",
      "Choice 2",
      "Choice 3"
    ]
  ];
  const truth = [];
  people.forEach((c, i) => {
    const ch = pickSome(ACTIVITIES, 3);
    rows.push([
      `2027-05-${String(10 + i).padStart(2, "0")} 09:1${i}`,
      `family${i}@example.com`,
      c.name,
      `Parent of ${c.name.split(" ")[0]}`,
      c.division,
      pick(["S", "M", "L"]),
      ...ch
    ]);
    truth.push(truthCamper(c, ranked(ch)));
  });
  writeCsv(file, rows);
  add(file, "a form export with timestamp, email, parent and size columns", {
    campers: truth,
    notRead: ["A", "B", "D", "F"].map((column) => ({
      kind: "column",
      sheet: file,
      column
    }))
  });
}

// 19: every choice in one cell, no order.
{
  const file = "19-list-in-one-cell.csv";
  const people = campers(9);
  const rows = [["Camper Name", "Division", "Activities"]];
  const truth = [];
  for (const c of people) {
    const ch = pickSome(ACTIVITIES, 3);
    rows.push([c.name, c.division, ch.join(", ")]);
    truth.push(truthCamper(c, unordered(ch)));
  }
  writeCsv(file, rows);
  add(file, "all choices packed in one cell, no order", { campers: truth });
}

// 20: a list packed into one ranked cell on a couple of rows.
{
  const file = "20-list-in-a-ranked-cell.csv";
  const people = campers(8);
  const rows = [["Camper Name", "Division", "#1", "#2", "#3"]];
  const truth = [];
  const toCheck = [];
  people.forEach((c, i) => {
    const ch = pickSome(ACTIVITIES, 4);
    if (i === 2 || i === 5) {
      rows.push([c.name, c.division, ch[0], `${ch[1]}, ${ch[2]}`, ch[3]]);
      truth.push(
        truthCamper(c, [
          ...ranked([ch[0]]),
          ...unordered([ch[1], ch[2]]),
          { name: ch[3], rank: 3, kind: "ranked", day: null, period: null }
        ])
      );
      toCheck.push({
        kind: "listInOneCell",
        sheet: file,
        row: rows.length,
        column: "D"
      });
    } else {
      rows.push([c.name, c.division, ch[0], ch[1], ch[2]]);
      truth.push(truthCamper(c, ranked(ch.slice(0, 3))));
    }
  });
  writeCsv(file, rows);
  add(file, "two campers packed two activities into one ranked cell", {
    campers: truth,
    toCheck
  });
}

// 21: footer lines below the table.
{
  const file = "21-footer-rows.csv";
  const people = campers(8);
  const rows = [
    ["Camper Name", "Division", "Choice 1", "Choice 2", "Choice 3"]
  ];
  const truth = [];
  for (const c of people) {
    const ch = pickSome(ACTIVITIES, 3);
    rows.push([c.name, c.division, ...ch]);
    truth.push(truthCamper(c, ranked(ch)));
  }
  rows.push(["", "", "", "", ""]);
  const total = rows.length + 1;
  rows.push(["Total campers", "", "8", "", ""]);
  rows.push(["Please return by June 1", "", "", "", ""]);
  writeCsv(file, rows);
  add(file, "footer lines below the table (a total, a reminder)", {
    campers: truth,
    notRead: [
      { kind: "notAChoice", sheet: file, row: total, column: "C" },
      { kind: "noChoices", sheet: file, row: total },
      { kind: "noChoices", sheet: file, row: total + 1 }
    ]
  });
}

// 22: two different campers with one name and no camper numbers.
{
  const file = "22-same-name-no-number.csv";
  const people = campers(7);
  const twin = { ...campers(1)[0] };
  const rows = [["Camper Name", "Division", "#1", "#2", "#3"]];
  const truth = [];
  const twinRows = [];
  people.forEach((c, i) => {
    const ch = pickSome(ACTIVITIES, 3);
    rows.push([c.name, c.division, ...ch]);
    truth.push(truthCamper(c, ranked(ch)));
    if (i === 1 || i === 5) {
      const other = { ...twin, division: i === 1 ? "Juniors" : "Seniors" };
      rows.push([other.name, other.division, ...pickSome(ACTIVITIES, 3)]);
      twinRows.push(rows.length);
    }
  });
  writeCsv(file, rows);
  add(file, "two campers share a name, no camper numbers", {
    campers: truth,
    cantTellApart: [{ name: twin.name, rows: twinRows }]
  });
}

// 23: one name, two camper numbers (two campers); and one name with a number on only one row.
{
  const file = "23-same-name-numbers.csv";
  const people = campers(6, { numbers: true });
  const rows = [["Camper Number", "Camper Name", "Division", "#1", "#2", "#3"]];
  const truth = [];
  for (const c of people) {
    const ch = pickSome(ACTIVITIES, 3);
    rows.push([c.number, c.name, c.division, ...ch]);
    truth.push(truthCamper(c, ranked(ch)));
  }
  // A second camper called the same as the first, with a number of their own.
  const twin = {
    ...people[0],
    number: String(nextNumber++),
    division: "Seniors"
  };
  const twinChoices = pickSome(ACTIVITIES, 3);
  rows.push([twin.number, twin.name, twin.division, ...twinChoices]);
  truth.push(truthCamper(twin, ranked(twinChoices)));
  // A camper written once with a number and once without.
  const half = people[3];
  const halfChoices = pickSome(ACTIVITIES, 3);
  rows.push(["", half.name, half.division, ...halfChoices]);
  truth.push(truthCamper({ ...half, number: null }, ranked(halfChoices)));
  writeCsv(file, rows);
  add(
    file,
    "one name, two numbers; and a name with a number on only one of its rows",
    {
      campers: truth,
      toCheck: [{ kind: "numberOnSomeRows", sheet: file, row: rows.length }]
    }
  );
}

// 24: two columns claim the same rank: kept as equal choices, not ordered.
{
  const file = "24-tied-rank-headings.csv";
  const people = campers(8);
  const rows = [["Camper Name", "Division", "#1", "#1", "#2"]];
  const truth = [];
  for (const c of people) {
    const ch = pickSome(ACTIVITIES, 3);
    rows.push([c.name, c.division, ...ch]);
    truth.push(
      truthCamper(c, [
        ...unordered([ch[0], ch[1]]),
        { name: ch[2], rank: 2, kind: "ranked", day: null, period: null }
      ])
    );
  }
  writeCsv(file, rows);
  add(file, "two columns both headed #1", {
    campers: truth,
    toCheck: [{ kind: "sameRankTwice", sheet: file, column: "C" }]
  });
}

// 25: a planner: one camper's own sheet, days across, periods down, no name column.
{
  const file = "25-planner-one-camper.xlsx";
  const [c] = campers(1);
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday"];
  const periods = ["Period 1", "Period 2", "Period 3"];
  const rows = [
    [`Camper name: ${c.name}`, "", "", "", ""],
    ["", ...days]
  ];
  const choices = [];
  for (const p of periods) {
    const row = [p];
    for (const d of days) {
      const a = random() < 0.15 ? "" : pick(ACTIVITIES);
      row.push(a);
      if (a) choices.push({ d, p, a, col: row.length - 1 });
    }
    rows.push(row);
  }
  // The truth lists choices in sheet order: row by row, left to right.
  writeXlsx(file, [{ name: "My week", rows }]);
  add(file, "a planner: one camper's own sheet, days across, periods down", {
    campers: [
      {
        name: c.name,
        number: null,
        division: null,
        bunk: null,
        choices: choices.map((x) => cellChoice(x.a, x.d, x.p))
      }
    ]
  });
}

// 26: an offerings menu: several activities per period, no camper on it.
{
  const file = "26-offerings-menu.xlsx";
  const rows = [
    ["", "Tuesday", "", "Thursday", ""],
    ["", "A", "B", "A", "B"],
    ["Period 1", ...pickSome(ACTIVITIES, 4)],
    ["Period 2", ...pickSome(ACTIVITIES, 4)]
  ];
  writeXlsx(file, [
    { name: "What we offer", rows, merges: ["B1:C1", "D1:E1"] }
  ]);
  add(file, "a menu of what is offered, two per period: no camper's choices", {
    notRead: [{ kind: "menu", sheet: "What we offer" }]
  });
}

// 27: two sheets: instructions first, choices second.
{
  const file = "27-instructions-then-choices.xlsx";
  const people = campers(8);
  const rows = [
    [
      "Camper Name",
      "Division",
      "Bunk",
      "1st choice",
      "2nd choice",
      "3rd choice"
    ]
  ];
  const truth = [];
  for (const c of people) {
    const ch = pickSome(ACTIVITIES, 3);
    rows.push([c.name, c.division, c.bunk, ...ch]);
    truth.push(truthCamper(c, ranked(ch), { bunk: true }));
  }
  writeXlsx(file, [
    {
      name: "Instructions",
      rows: [
        ["Rank three activities for your camper."],
        ["Return this form to the office."]
      ]
    },
    { name: "Choices", rows }
  ]);
  add(file, "instructions on the first sheet, choices on the second", {
    campers: truth,
    notRead: [{ kind: "sheet", sheet: "Instructions" }]
  });
}

// 28: one row per choice per period: Day and Period columns.
{
  const file = "28-day-and-period-columns.csv";
  const people = campers(6);
  const rows = [["Camper Name", "Division", "Day", "Period", "Activity"]];
  const truth = [];
  for (const c of people) {
    const mine = [];
    for (const [d, p] of [
      ["Tuesday", "Period 5"],
      ["Thursday", "Period 5"]
    ]) {
      const a = pick(ACTIVITIES);
      rows.push([c.name, c.division, d, p, a]);
      mine.push(cellChoice(a, d, p));
    }
    truth.push(truthCamper(c, mine));
  }
  writeCsv(file, rows);
  add(file, "one row per period choice, with Day and Period columns", {
    campers: truth
  });
}

writeFileSync(
  join(OUT, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`
);
console.log(`Wrote ${manifest.length} sheets to ${OUT}`);
