// Writes the made-up sample files for trying "Import last year" (slice 4b) into
// docs/samples/import/. Everything is invented: "Maple Grove Day Camp (made up)", six bunks in
// two divisions, one week. Run: node scripts/make-import-samples.mjs
//
// The same week in three layouts, so files can be imported alone or together:
// - maple-grove-2026-all-camp.xlsx: one sheet per day, bunks across, divisions above them,
//   two-block activities as merged cells;
// - Maple Grove 2026 - Bunk N.csv: one file per bunk, days across (Bunk 3 disagrees with the
//   all-camp file on Tuesday, Period 2, on purpose);
// - maple-grove-2026-by-activity.csv: activities across, the bunks doing each listed in its cell,
//   one day under another.
// Planted on purpose: "Musik" (a one-letter typo of Music) once, an elective (Chugim), a trip
// (Zoo trip), and a special day (Field day on Friday).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "samples",
  "import"
);
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const BLOCKS = [
  ["Period 1", "9:00 - 9:45"],
  ["Period 2", "9:50 - 10:35"],
  ["Period 3", "10:40 - 11:25"],
  ["Lunch", "11:30 - 12:15"],
  ["Period 4", "12:20 - 1:05"],
  ["Period 5", "1:10 - 1:55"],
  ["Period 6", "2:00 - 2:45"]
];
const DIVISIONS = [
  ["Juniors", ["Bunk 1", "Bunk 2", "Bunk 3"]],
  ["Seniors", ["Bunk 4", "Bunk 5", "Bunk 6"]]
];
const BUNKS = DIVISIONS.flatMap(([, bunks]) => bunks);
const ROTATION = ["Swim", "Art", "Soccer", "Gym games", "Music", "Archery"];

/** What bunk g (0-5) does on day d (0-4) in block b (0-6), and how many blocks it runs. */
function cell(g, d, b) {
  const senior = g >= 3;
  if (b === 3) return ["Lunch", 1];
  if (d === 4) return ["Field day", 1];
  if (d === 0 && b === 0) return ["Morning meeting", 1];
  if (d === 2 && b === 4 && !senior) return ["Library time", 1];
  if (d === 1 && b === 6) return ["Chugim", 1];
  if (d === 3 && senior && b >= 5) return b === 5 ? ["Zoo trip", 2] : null;
  if (senior && d === g - 3 && (b === 1 || b === 2))
    return b === 1 ? ["Boating", 2] : null;
  if (g === 1 && d === 3 && b === 0) return ["Musik", 1];
  return [ROTATION[(g + b * 2 + d * 3) % ROTATION.length], 1];
}

function covered(g, d, b) {
  // The second block of a two-block activity (merged in Excel, repeated in CSV).
  for (let up = b - 1; up >= 0; up--) {
    const above = cell(g, d, up);
    if (above) return up + above[1] > b ? above[0] : null;
  }
  return null;
}

function nameAt(g, d, b) {
  const own = cell(g, d, b);
  return own ? own[0] : covered(g, d, b);
}

function allCampWorkbook() {
  const wb = XLSX.utils.book_new();
  DAYS.forEach((day, d) => {
    const rows = [
      [`Maple Grove Day Camp (made up) - ${day}`],
      [
        "",
        "",
        ...DIVISIONS.flatMap(([division, bunks]) => [
          division,
          ...bunks.slice(1).map(() => "")
        ])
      ],
      ["Period", "Time", ...BUNKS]
    ];
    const merges = [
      { s: { r: 1, c: 2 }, e: { r: 1, c: 4 } },
      { s: { r: 1, c: 5 }, e: { r: 1, c: 7 } }
    ];
    BLOCKS.forEach(([name, time], b) => {
      rows.push([
        name,
        time,
        ...BUNKS.map((_, g) => {
          const own = cell(g, d, b);
          if (own && own[1] > 1)
            merges.push({
              s: { r: 3 + b, c: 2 + g },
              e: { r: 3 + b + own[1] - 1, c: 2 + g }
            });
          return own ? own[0] : "";
        })
      ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!merges"] = merges;
    XLSX.utils.book_append_sheet(wb, ws, day);
  });
  return wb;
}

function csv(rows) {
  return (
    rows
      .map((row) =>
        row
          .map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v))
          .join(",")
      )
      .join("\n") + "\n"
  );
}

function bunkCsv(g) {
  const rows = [["Time", ...DAYS]];
  BLOCKS.forEach(([name, time], b) => {
    rows.push([
      `${name} (${time})`,
      ...DAYS.map((_, d) => {
        if (g === 2 && d === 1 && b === 1) return "Soccer";
        return nameAt(g, d, b) || "";
      })
    ]);
  });
  return csv(rows);
}

function byActivityCsv() {
  const names = [
    ...new Set(
      DAYS.flatMap((_, d) =>
        BLOCKS.flatMap((_, b) => BUNKS.map((_, g) => nameAt(g, d, b)))
      )
    )
  ]
    .filter(Boolean)
    .sort();
  const rows = [];
  DAYS.forEach((day, d) => {
    rows.push([day]);
    rows.push(["Period", ...names]);
    BLOCKS.forEach(([name, time], b) => {
      rows.push([
        `${name} ${time}`,
        ...names.map((activity) =>
          BUNKS.filter((_, g) => nameAt(g, d, b) === activity).join(", ")
        )
      ]);
    });
    rows.push([]);
  });
  return csv(rows);
}

mkdirSync(OUT, { recursive: true });
writeFileSync(
  join(OUT, "maple-grove-2026-all-camp.xlsx"),
  XLSX.write(allCampWorkbook(), {
    type: "buffer",
    bookType: "xlsx",
    compression: true
  })
);
BUNKS.forEach((bunk, g) =>
  writeFileSync(join(OUT, `Maple Grove 2026 - ${bunk}.csv`), bunkCsv(g))
);
writeFileSync(join(OUT, "maple-grove-2026-by-activity.csv"), byActivityCsv());
console.log(`Wrote samples to ${OUT}`);
