// The elective downloads (electives slice E10; repo ADR 0018 choices 45 to 48): rosters one page
// per offering, each camper's week, the full report, and the campers file that Bring in choices
// reads back as it was. Every name is made up.
import { readChoices } from "c/shoreshChoicesReader";
import { buildTerms } from "c/shoreshTerms";
import {
  camperScheduleRows,
  campersRows,
  campersSheets,
  downloadTitle,
  fullReportSheets,
  readDownload,
  rosterPages,
  rosterSheets,
  summaryRows
} from "../downloads";
import { finalDownload, finalView } from "./data/download";

const t = buildTerms([
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true },
  { term: "Seats", singular: "Seats", plural: "Seats", isCustom: false },
  { term: "Camper", singular: "Camper", plural: "Campers", isCustom: false },
  {
    term: "ElectiveSet",
    singular: "Elective set",
    plural: "Elective sets",
    isCustom: false
  }
]);

const reading = (download = finalDownload()) => readDownload(download, t);

/** Every text cell of every sheet, flattened. */
const cellsOf = (sheets) =>
  sheets.flatMap((s) => s.rows.flat()).filter((c) => typeof c === "string");

describe("rosters: one page per offering, its whole week", () => {
  it("lists each time it is offered with who is there, by bunk, the bunk beside each", () => {
    const d = reading();
    const pages = rosterPages(d);
    expect(pages.map((p) => p.title)).toEqual(["Archery", "Drama", "Pottery"]);
    const archery = pages[0];
    expect(archery.columns.map((c) => [c.label, c.count])).toEqual([
      ["Mon 12:30", "2 of 2"],
      ["Tue 12:30", "2 of 2"]
    ]);
    expect(archery.columns[1].people).toEqual([
      { key: "x5", name: "Maya Fernwood", bunk: "Aspen" },
      { key: "x7", name: "Eli Marblecrest", bunk: "Willow" }
    ]);
    // No limit: the count alone. A camper with no bunk says so.
    const drama = pages[1];
    expect(drama.columns[0].count).toBe("2");
    expect(drama.columns[0].people.map((p) => p.bunk)).toEqual([
      "Willow",
      "No Bunk"
    ]);
    expect(d.header).toBe("Chugim · Week 1 · Final 14 Oct");
  });

  it("a final run's roster keeps the names it was finalized with", () => {
    const view = finalView();
    view.seats = view.seats.map((s) => {
      return s.offeringId === "o1"
        ? { ...s, activityName: "Archery range" }
        : s;
    });
    const pages = rosterPages(reading(finalDownload({ view })));
    expect(pages[0].title).toBe("Archery range");
  });

  it("as a file: a sheet per offering, laid out as its page, every cell guarded", () => {
    const view = finalView();
    view.campers = view.campers.map((c) => {
      return c.id === "c1" ? { ...c, name: "=HYPERLINK(1)" } : c;
    });
    const sheets = rosterSheets(reading(finalDownload({ view })));
    expect(sheets.map((s) => s.name)).toEqual(["Archery", "Drama", "Pottery"]);
    expect(sheets[0].rows.slice(0, 4)).toEqual([
      ["Archery"],
      ["Chugim · Week 1 · Final 14 Oct"],
      [],
      ["Mon 12:30", "2 of 2", "Tue 12:30", "2 of 2"]
    ]);
    // "=HYPERLINK(1)" sorts first in Aspen, on both days; written so it is never a formula.
    expect(sheets[0].rows[4]).toEqual([
      "'=HYPERLINK(1)",
      "Aspen",
      "'=HYPERLINK(1)",
      "Aspen"
    ]);
  });
});

describe("camper schedules: each camper's week", () => {
  it("is their bunk's week with their seat where the set sits, and a long activity once", () => {
    const rows = camperScheduleRows(reading());
    expect(rows[0]).toEqual([
      "Camper",
      "Bunk",
      "Day",
      "Time block",
      "Starts",
      "Activity",
      "Elective set",
      "Blocks"
    ]);
    const maya = rows.filter((r) => r[0] === "Maya Fernwood");
    expect(maya).toEqual([
      ["Maya Fernwood", "Aspen", "Monday", "Morning", "9:00", "Flag", "", 1],
      [
        "Maya Fernwood",
        "Aspen",
        "Monday",
        "Period 1",
        "12:30",
        "Archery",
        "Chugim",
        1
      ],
      ["Maya Fernwood", "Aspen", "Monday", "Period 2", "2:00", "Swim", "", 2],
      ["Maya Fernwood", "Aspen", "Tuesday", "Morning", "9:00", "Flag", "", 1],
      [
        "Maya Fernwood",
        "Aspen",
        "Tuesday",
        "Period 1",
        "12:30",
        "Archery",
        "Chugim",
        1
      ],
      ["Maya Fernwood", "Aspen", "Tuesday", "Period 2", "2:00", "Swim", "", 2]
    ]);
    // Bunk order, then name; the camper with no bunk last, with only their electives.
    expect([...new Set(rows.slice(1).map((r) => r[0]))]).toEqual([
      "Ari Brookfield",
      "Maya Fernwood",
      "Eli Marblecrest",
      "Bea Stonebridge"
    ]);
    expect(rows.filter((r) => r[0] === "Bea Stonebridge")).toEqual([
      [
        "Bea Stonebridge",
        "No Bunk",
        "Monday",
        "Period 1",
        "12:30",
        "Drama",
        "Chugim",
        1
      ],
      [
        "Bea Stonebridge",
        "No Bunk",
        "Tuesday",
        "Period 1",
        "12:30",
        "Couldn't be placed",
        "Chugim",
        1
      ]
    ]);
  });
});

describe("the full report", () => {
  it("has the desktop's four sheets", () => {
    const sheets = fullReportSheets(reading());
    expect(sheets.map((s) => s.name)).toEqual([
      "Camper schedules",
      "Rosters",
      "Exceptions",
      "Summary"
    ]);
    const roster = sheets[1].rows;
    expect(roster[0]).toEqual([
      "Day",
      "Time block",
      "Activity",
      "Camper",
      "Bunk",
      "Count",
      "Seats"
    ]);
    // The count once, on the first row of each time.
    expect(roster.slice(1, 3)).toEqual([
      ["Monday", "Period 1", "Archery", "Ari Brookfield", "Aspen", 2, 2],
      ["Monday", "Period 1", "Archery", "Maya Fernwood", "Aspen", "", ""]
    ]);
    const problems = sheets[2].rows.map((r) => r[0]);
    expect(problems).toEqual(
      expect.arrayContaining([
        "Couldn't be placed",
        "Not one they chose",
        "No Bunk on the sheet"
      ])
    );
  });

  it("counts seats by how they were chosen, never an unordered choice as a rank", () => {
    const summary = new Map(summaryRows(reading()));
    expect(summary.get("Run")).toBe("Chugim · Week 1");
    expect(summary.get("Status")).toBe("Final · 14 Oct · Greg");
    expect(summary.get("Source file")).toBe("chugim.xlsx");
    expect(summary.get("Placed")).toBe("3 of 4");
    expect(summary.get("First choice")).toBe(4);
    expect(summary.get("Second choice")).toBe(1);
    expect(summary.get("One of their choices")).toBe(1);
    expect(summary.get("Not one they chose")).toBe(1);
    expect(summary.get("Couldn't be placed")).toBe(1);
    // Maya is in Archery twice.
    expect(summary.get("In one offering more than once")).toBe(1);
  });

  it("an out-of-date final run says so", () => {
    const d = reading(
      finalDownload({ view: finalView({ scheduleChanged: true }) })
    );
    expect(new Map(summaryRows(d)).get("Status")).toBe("Final · Out of date");
    expect(fullReportSheets(d)[2].rows.map((r) => r[0])).toContain(
      "Out of date"
    );
  });
});

describe("campers: to edit and bring back", () => {
  it("is laid out as Bring in choices reads it: a row per choice, no rank for no order", () => {
    const rows = campersRows(reading());
    expect(rows[0]).toEqual([
      "Camper number",
      "Camper name",
      "Division",
      "Bunk",
      "Day",
      "Period",
      "Rank",
      "Activity"
    ]);
    expect(rows.slice(1)).toEqual([
      ["", "Ari Brookfield", "Juniors", "Aspen", "", "", 1, "Archery"],
      ["", "Ari Brookfield", "Juniors", "Aspen", "", "", 2, "Pottery"],
      ["", "Bea Stonebridge", "", "", "", "", "", "Drama"],
      ["", "Bea Stonebridge", "", "", "", "", "", "Pottery"],
      [
        "SYN-1003",
        "Eli Marblecrest",
        "Juniors",
        "Willow",
        "",
        "",
        1,
        "Archery"
      ],
      [
        "SYN-1003",
        "Eli Marblecrest",
        "Juniors",
        "Willow",
        "Tuesday",
        "Period 1",
        1,
        "Drama"
      ],
      ["SYN-1001", "Maya Fernwood", "Juniors", "Aspen", "", "", 1, "Archery"],
      ["SYN-1001", "Maya Fernwood", "Juniors", "Aspen", "", "", 2, "Drama"]
    ]);
  });

  it("reads back through Bring in choices as the same campers and choices", () => {
    const d = reading();
    const sheet = campersSheets(d)[0];
    const read = readChoices(
      { sheets: [{ name: sheet.name, rows: sheet.rows }] },
      { activities: ["Archery", "Drama", "Pottery"] }
    );
    expect(read.cantTellApart).toEqual([]);
    expect(read.newNames).toEqual([]);
    const back = new Map(read.campers.map((c) => [c.name, c]));
    expect([...back.keys()].sort()).toEqual([
      "Ari Brookfield",
      "Bea Stonebridge",
      "Eli Marblecrest",
      "Maya Fernwood"
    ]);
    expect(back.get("Maya Fernwood").number).toBe("SYN-1001");
    expect(back.get("Maya Fernwood").bunk).toBe("Aspen");
    expect(back.get("Maya Fernwood").division).toBe("Juniors");
    const choices = (name) =>
      back
        .get(name)
        .choices.map((c) => [c.name, c.rank, c.kind, c.day, c.period]);
    expect(choices("Maya Fernwood")).toEqual([
      ["Archery", 1, "ranked", null, null],
      ["Drama", 2, "ranked", null, null]
    ]);
    // In no order stays in no order.
    expect(choices("Bea Stonebridge")).toEqual([
      ["Drama", null, "unordered", null, null],
      ["Pottery", null, "unordered", null, null]
    ]);
    // The camper's one choice for Tuesday's Period 1 comes back for that period, first.
    expect(choices("Eli Marblecrest")).toEqual([
      ["Archery", 1, "ranked", null, null],
      ["Drama", 1, "ranked", "Tuesday", "Period 1"]
    ]);
  });

  it("names a choice of an activity the set doesn't offer by the season's name for it", () => {
    const view = finalView();
    view.campers = [
      {
        ...view.campers[0],
        choices: JSON.stringify([{ n: "Rope", a: "a9", r: 1, k: "ranked" }])
      }
    ];
    const rows = campersRows(
      reading(finalDownload({ view })),
      new Map([["a9", "Ropes course"]])
    );
    expect(rows[1][7]).toBe("Ropes course");
  });

  it("names a linked choice by its name on the sheet", () => {
    const view = finalView({
      linkedChoices: [{ id: "l1", name: "Pottery double" }]
    });
    view.campers = [
      {
        ...view.campers[0],
        choices: JSON.stringify([
          { n: "Pottery double", a: "a3", l: "l1", r: 1, k: "ranked" }
        ])
      }
    ];
    expect(campersRows(reading(finalDownload({ view })))[1][7]).toBe(
      "Pottery double"
    );
  });

  it("uses the camp's own words for the bunk and division only when Bring in choices reads them", () => {
    const words = buildTerms([
      { term: "Group", singular: "Cabin", plural: "Cabins", isCustom: true },
      { term: "Division", singular: "Tzrif", plural: "Tzrifim", isCustom: true }
    ]);
    const rows = campersRows(readDownload(finalDownload(), words));
    expect(rows[0].slice(2, 4)).toEqual(["Division", "Cabin"]);
  });
});

describe("what never goes into a download", () => {
  it("a parent's comment, in any file", () => {
    const d = reading();
    const all = cellsOf([
      ...rosterSheets(d),
      ...fullReportSheets(d),
      ...campersSheets(d)
    ]);
    expect(all.some((c) => c.includes("cousin"))).toBe(false);
  });

  it("a child's name, in a file name", () => {
    const d = reading();
    expect(downloadTitle(d, "rosters")).toBe("Chugim Week 1 rosters");
  });
});
