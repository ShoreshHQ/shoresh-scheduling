// Really weird files (level-5 corpus, docs/import/names-and-divisions.md rules 11 to 21): a grid on
// its side, times in cells, letter codes, Hebrew names, one group, a colour key, two activities in
// a cell, emoji, a place in brackets.
import { buildProposal, planFor, questionCards } from "./data/engine";
import { importNotes } from "../plan";
import { similarity, similarPairs } from "../names";
import { divisionInTitle, timeRange } from "../text";
import { csv, terms } from "./data/samples";

const at = (h, m = 0) => h * 60 + m;
const read = (files, answers = {}, existing = null) =>
  buildProposal({ files, existing, terms, answers });
const workbook = (name, sheets) => ({
  name,
  sheets: sheets.map(([sheetName, rows]) => ({
    name: sheetName,
    rows,
    merges: []
  }))
});
const open = (p) => questionCards(p, terms, {}).filter((c) => !c.answer);

/** What was read, cell by cell: "group|day|start" -> activity. */
function cells(p) {
  const out = {};
  for (const x of p.usable) {
    const block = p.timetables[x.timetable].blocks[x.blockIndex];
    out[`${x.group}|${x.day}|${block.start}`] = x.text;
  }
  return out;
}

describe("INGEST-2.11: a grid on its side", () => {
  const day = (name) =>
    csv(`Camp - ${name}.csv`, [
      [`Camp - ${name}`],
      ["Division", "Group", "Period 1 (9:00 - 9:45)", "Lunch (9:45 - 10:30)"],
      ["Juniors", "Bunk 1", "Swim", "Lunch"],
      ["Juniors", "Bunk 2", "Art", "Lunch"],
      ["Seniors", "Bunk 3", "Tennis", "Lunch"]
    ]);

  it("INGEST-2.11: a row per group and a column per time block is read stood upright", () => {
    const p = read([day("Monday"), day("Tuesday")]);
    expect(p.timetables[0].blocks.map((b) => [b.start, b.end])).toEqual([
      [at(9), at(9, 45)],
      [at(9, 45), at(10, 30)]
    ]);
    expect(p.groups.map((g) => [g.division, g.name])).toEqual([
      ["Juniors", "Bunk 1"],
      ["Juniors", "Bunk 2"],
      ["Seniors", "Bunk 3"]
    ]);
    expect(cells(p)[`Bunk 2|Monday|${at(9)}`]).toBe("Art");
    expect(p.fixed.map((f) => f.name)).toEqual(["Lunch"]);
  });

  it("INGEST-2.11: a cell merged across two time blocks runs over both once stood up", () => {
    const sheet = (name) => [
      name,
      [
        ["Group", "9:00 - 9:45", "9:45 - 10:30", "10:30 - 11:15"],
        ["Bunk 1", "Zoo trip", "", "Lunch"],
        ["Bunk 2", "Swim", "Art", "Lunch"],
        ["Bunk 3", "Art", "Swim", "Lunch"]
      ]
    ];
    const file = workbook("Camp 2026.xlsx", [
      sheet("Monday"),
      sheet("Tuesday")
    ]);
    file.sheets.forEach((x) => {
      x.merges = [{ s: { r: 1, c: 1 }, e: { r: 1, c: 2 } }];
    });
    const p = read([file]);
    const trip = p.usable.find((x) => x.text === "Zoo trip");
    expect(trip.span).toBe(2);
  });

  it("INGEST-2.11 counter-case: an upright grid with a time column is read as before", () => {
    const upright = (name) =>
      csv(`Camp - ${name}.csv`, [
        [`Camp - ${name}`],
        ["Time", "Bunk 1", "Bunk 2"],
        ["9:00 - 9:45", "Swim", "Art"],
        ["9:45 - 10:30", "Art", "Swim"]
      ]);
    const p = read([upright("Monday"), upright("Tuesday")]);
    expect(p.groups.map((g) => g.name)).toEqual(["Bunk 1", "Bunk 2"]);
    expect(cells(p)[`Bunk 1|Monday|${at(9, 45)}`]).toBe("Art");
  });
});

describe("INGEST-2.12: the time written in every cell", () => {
  const page = (group) =>
    csv(`Camp - ${group}.csv`, [
      [group],
      ["", "Monday", "Tuesday"],
      ["Period 1", "9-9:45 Swim", "9-9:45 Art"],
      ["Period 2", "10:20-11 Art", "10:20-11 Swim"],
      ["Lunch", "12:20-1:05 Lunch", "12:20-1:05 Lunch"]
    ]);

  it("INGEST-2.12: the time is the row's block, the rest the activity, Monday kept", () => {
    const p = read([page("Bunk 1"), page("Bunk 2")]);
    expect(p.timetables[0].blocks.map((b) => [b.start, b.end])).toEqual([
      [at(9), at(9, 45)],
      [at(10, 20), at(11)],
      [at(12, 20), at(13, 5)]
    ]);
    expect([...new Set(p.usable.map((x) => x.day))]).toEqual([
      "Monday",
      "Tuesday"
    ]);
    expect(cells(p)[`Bunk 1|Monday|${at(10, 20)}`]).toBe("Art");
  });

  it("INGEST-2.12: a bare hour ends a range whose start is a time (10:20-11)", () => {
    expect(timeRange("10:20-11")).toMatchObject({
      start: at(10, 20),
      end: at(11)
    });
    expect(timeRange("Period 1 - 2")).toBeNull();
  });

  it("INGEST-2.12 counter-case: one cell with a time in it is a cell, not a time block", () => {
    const one = (group) =>
      csv(`Camp - ${group}.csv`, [
        [group],
        ["Time", "Monday", "Tuesday"],
        ["9:00-9:45", "Swim", "Art"],
        ["9:45-10:30", "Art 9-9:30 Snack", "Swim"]
      ]);
    const p = read([one("Bunk 1"), one("Bunk 2")]);
    expect(p.timetables[0].blocks.map((b) => b.start)).toEqual([
      at(9),
      at(9, 45)
    ]);
  });
});

describe("INGEST-2.13: letter codes with a key", () => {
  const day = (name) =>
    csv(`Camp - ${name}.csv`, [
      [`Camp - ${name}`],
      ["Time", "Bunk 1", "Bunk 2", "Bunk 3"],
      ["9:00-9:45", "A", "B", "C"],
      ["9:45-10:30", "B", "C", "A"],
      ["10:30-11:15", "Lunch", "Lunch", "Lunch"],
      [],
      ["Key:"],
      ["A = Archery"],
      ["B = Basketball"],
      ["C = Canoeing"]
    ]);

  it("INGEST-2.13: each code is read through the key, and the key is not read as data", () => {
    const p = read([day("Monday"), day("Tuesday")]);
    expect([...new Set(p.usable.map((x) => x.text))].sort()).toEqual([
      "Archery",
      "Basketball",
      "Canoeing",
      "Lunch"
    ]);
    expect(cells(p)[`Bunk 2|Monday|${at(9)}`]).toBe("Basketball");
    expect(p.timetables[0].blocks).toHaveLength(3);
    expect(p.reading.unread).toEqual([]);
  });

  it("INGEST-2.13 counter-case: a title line that looks like a key line is a title", () => {
    const page = (n) =>
      csv(`Camp - Bunk ${n}.csv`, [
        [`Bet - Bunk ${n}`],
        ["Time", "Monday", "Tuesday"],
        ["9:00-9:45", "Swim", "Art"]
      ]);
    const p = read([page(3), page(4)]);
    expect(p.groups.map((g) => [g.division, g.name])).toEqual([
      ["Bet", "Bunk 3"],
      ["Bet", "Bunk 4"]
    ]);
  });
});

describe("INGEST-2.14 to 2.16: Hebrew names", () => {
  it("INGEST-2.14: names apart only by a word of one letter are lettered, never a slip", () => {
    expect(similarity("ניצנים א", "ניצנים ב")).toBeNull();
    expect(similarity("Bunk A", "Bunk B")).toBeNull();
    expect(divisionInTitle("ניצנים א")).toEqual({
      division: "ניצנים",
      group: "ניצנים א"
    });
  });

  it("INGEST-2.14 counter-case: a Latin typo one letter apart is still raised", () => {
    expect(similarity("Archery", "Archrey")).toBe("letter");
    expect(similarity("Music", "Musik")).toBe("letter");
  });

  it("INGEST-2.15: two names one letter apart, each in wide use, are two names", () => {
    const pairs = similarPairs(
      "activity",
      [
        { name: "כדורגל", count: 12 },
        { name: "כדורסל", count: 10 }
      ],
      []
    );
    expect(pairs).toEqual([]);
  });

  it("INGEST-2.15 counter-case: a rare spelling beside a common one is still asked", () => {
    const pairs = similarPairs(
      "activity",
      [
        { name: "Music", count: 20 },
        { name: "Musik", count: 2 }
      ],
      []
    );
    expect(pairs.map((x) => [x.a, x.b])).toEqual([["Music", "Musik"]]);
  });

  it("INGEST-2.16: a sheet per group with Hebrew titles names each group by its sheet", () => {
    const rows = [
      ["Time", "Monday", "Tuesday"],
      ["9:00-9:45", "שחייה", "אמנות"],
      ["9:45-10:30", "אמנות", "שחייה"]
    ];
    const p = read([
      workbook("Camp 2026.xlsx", [
        ["ניצנים - ניצנים א", rows],
        ["ניצנים - ניצנים ב", rows]
      ])
    ]);
    expect(p.groups.map((g) => [g.division, g.name])).toEqual([
      ["ניצנים", "ניצנים א"],
      ["ניצנים", "ניצנים ב"]
    ]);
    expect(open(p)).toEqual([]);
  });
});

describe("INGEST-2.17: a camp of one group", () => {
  const rows = [
    ["Time", "Monday", "Tuesday"],
    ["9:00-9:45", "Swim", "Art"],
    ["9:45-10:30", "Art", "Swim"]
  ];

  it("INGEST-2.17: a workbook's one sheet names its group, not the file", () => {
    const p = read([
      workbook("Hazel Creek Day Camp 2026.xlsx", [["Otters", rows]])
    ]);
    expect(p.groups.map((g) => g.name)).toEqual(["Otters"]);
  });

  it("INGEST-2.17 counter-case: a comma-separated file is still named by the file", () => {
    const p = read([csv("Camp 2026 - Otters.csv", [["Otters"], ...rows])]);
    expect(p.groups.map((g) => g.name)).toEqual(["Otters"]);
    const plain = read([csv("Otters.csv", rows)]);
    expect(plain.groups.map((g) => g.name)).toEqual(["Otters"]);
  });

  it("INGEST-2.17: a page of one column is that group's day, not a by-activity page", () => {
    const day = (name) =>
      csv(`Camp - ${name}.csv`, [
        [`Camp - ${name}`],
        ["Time", "Otters"],
        ["9:00-9:45", "Arts & Crafts"],
        ["9:45-10:30", "Swim"],
        ["10:30-11:15", "Lunch"]
      ]);
    const p = read([day("Monday"), day("Tuesday")]);
    expect(
      p.reading.pages.every((x) => x.layout === "allCamp" && x.confident)
    ).toBe(true);
    expect(p.groups.map((g) => g.name)).toEqual(["Otters"]);
  });

  it("INGEST-2.17: a by-activity page naming one group once a block is read by activity", () => {
    const day = (name) =>
      csv(`Camp - ${name}.csv`, [
        [`Camp - ${name}`],
        ["Time", "Lunch", "Swim", "Art", "Tennis"],
        ["9:00-9:45", "", "Otters", "", ""],
        ["9:45-10:30", "", "", "Otters", ""],
        ["10:30-11:15", "Otters", "", "", ""],
        ["11:15-12:00", "", "", "", "Otters"]
      ]);
    const p = read([day("Monday"), day("Tuesday")]);
    expect(p.reading.pages.every((x) => x.layout === "byActivity")).toBe(true);
    expect(p.groups.map((g) => g.name)).toEqual(["Otters"]);
  });
});

describe("INGEST-2.18: two activities in one cell", () => {
  const day = (name, odd) =>
    csv(`Camp - ${name}.csv`, [
      [`Camp - ${name}`],
      ["Time", "Bunk 1", "Bunk 2", "Bunk 3"],
      ["9:00-9:45", odd, "Art", "Tennis"],
      ["9:45-10:30", "Art", "Tennis", "Swim"],
      ["10:30-11:15", "Tennis", "Swim", "Art"],
      ["11:15-12:00", "Lunch", "Lunch", "Lunch"]
    ]);

  it('INGEST-2.18: "Swim/Art" asks half the period each, or does the group split', () => {
    const p = read([day("Monday", "Swim/Art"), day("Tuesday", "Swim")]);
    const card = open(p).find((c) => c.id === "list|Swim/Art");
    expect(card.title).toBe("Half the period each, or does the group split?");
    expect(card.options.map((o) => o.label)).toEqual([
      "Half the period each",
      "The group splits",
      "Leave it out for now"
    ]);
    const split = read([day("Monday", "Swim/Art"), day("Tuesday", "Swim")], {
      [card.id]: card.options[1].value
    });
    expect(split.electives.sets).toHaveLength(1);
  });

  it("INGEST-2.18 counter-case: names the files never use alone keep the one-or-choice question", () => {
    const p = read([day("Monday", "Hiking / Fishing"), day("Tuesday", "Swim")]);
    const card = open(p).find((c) => c.id === "list|Hiking / Fishing");
    expect(card.title).toContain("or a choice of");
  });
});

describe("INGEST-2.19: an activity shown only by colour", () => {
  const day = (name) =>
    csv(`Camp - ${name}.csv`, [
      [`Camp - ${name}`],
      ["Time", "Bunk 1", "Bunk 2", "Bunk 3"],
      ["9:00-9:45", "", "Art", "Tennis"],
      ["9:45-10:30", "Art", "Tennis", ""],
      ["10:30-11:15", "Tennis", "", "Art"],
      ["11:15-12:00", "Lunch", "Lunch", "Lunch"],
      [],
      ["Blue = Swim"]
    ]);

  it("INGEST-2.19: a colour key is asked, never read as free time without a word", () => {
    const p = read([day("Monday"), day("Tuesday")]);
    const card = open(p).find((c) => c.id === "colour|Swim");
    expect(card.title).toBe(
      "Where was “Swim”? The file showed it only in blue."
    );
    expect(p.activities.map((a) => a.name)).not.toContain("Swim");
    const added = read([day("Monday"), day("Tuesday")], {
      [card.id]: card.options[0].value
    });
    expect(added.activities.map((a) => a.name)).toContain("Swim");
    const plan = planFor(added, null, "season");
    expect(plan.activities.find((a) => a.name === "Swim")).toBeTruthy();
    const left = read([day("Monday"), day("Tuesday")], {
      [card.id]: "leaveOut"
    });
    expect(left.activities.map((a) => a.name)).not.toContain("Swim");
  });

  it("INGEST-2.19 counter-case: a colour the cells are written as is not a colour key", () => {
    const team = (name) =>
      csv(`Camp - ${name}.csv`, [
        [`Camp - ${name}`],
        ["Time", "Bunk 1", "Bunk 2"],
        ["9:00-9:45", "Blue", "Art"],
        [],
        ["Blue = Color war team"]
      ]);
    const p = read([team("Monday"), team("Tuesday")]);
    expect(open(p).filter((c) => c.id.startsWith("colour|"))).toEqual([]);
  });
});

describe("INGEST-2.20 and 2.21: emoji and a place in brackets", () => {
  const day = (name, a, b) =>
    csv(`Camp - ${name}.csv`, [
      [`Camp - ${name}`],
      ["Time", "Bunk 1", "Bunk 2"],
      ["9:00-9:45", a, b],
      ["9:45-10:30", b, a]
    ]);

  it('INGEST-2.20: "🏊 Swim" is read as Swim, the emoji kept in the notes', () => {
    const p = read([
      day("Monday", "🏊 Swim", "Art"),
      day("Tuesday", "Art", "🏊 Swim")
    ]);
    expect(p.activities.map((a) => a.name).sort()).toEqual(["Art", "Swim"]);
    expect(importNotes(p, terms).map((n) => n.text)).toContain(
      "🏊 Swim is read as Swim."
    );
  });

  it("INGEST-2.21: a place two activities are at is a place", () => {
    const p = read([
      day("Monday", "Art (Barn)", "Drama (Barn)"),
      day("Tuesday", "Drama (Barn)", "Art (Barn)")
    ]);
    expect(p.activities.map((a) => a.name).sort()).toEqual(["Art", "Drama"]);
    expect(p.offeredPlaces.map((x) => x.name)).toEqual(["Barn"]);
  });

  it("INGEST-2.21: a place only one activity is at stays part of its name", () => {
    const p = read([
      day("Monday", "Art (Barn)", "Swim"),
      day("Tuesday", "Swim", "Art (Barn)")
    ]);
    expect(p.activities.map((a) => a.name).sort()).toEqual([
      "Art (Barn)",
      "Swim"
    ]);
    expect(p.offeredPlaces).toEqual([]);
  });

  it("INGEST-2.21: a place the camp already has is a place even for one activity", () => {
    const p = read(
      [
        day("Monday", "Art (Barn)", "Swim"),
        day("Tuesday", "Swim", "Art (Barn)")
      ],
      {},
      { locations: [{ Id: "a0L000000000001AAA", Name: "Barn" }] }
    );
    expect(p.activities.map((a) => a.name).sort()).toEqual(["Art", "Swim"]);
  });
});
