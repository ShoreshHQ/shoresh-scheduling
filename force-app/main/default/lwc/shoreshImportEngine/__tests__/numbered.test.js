// Numbered days in an import (ADR 0025 choice 6): a camp file that says "Day 1" to "Day 6" is read
// as the camp's days of the week, never as groups on one day, and the review shows what each
// number became. Everything here is made up.
import * as XLSX from "xlsx";
import { countDaysFrom, setDayNaming } from "c/shoreshDayNames";
import { dayOf, nameDaysFor, workbookFile } from "c/shoreshImportEngine";
import { dayInTitle } from "../text";
import { scheduleSheets } from "c/shoreshScheduleExport";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";
import { days } from "../../shoreshLists/cells";
import { headingMeaning, readChoices } from "c/shoreshChoicesReader";
import { csvFile } from "c/shoreshImportEngine";
import { opened } from "../../shoreshScheduleViews/__tests__/data/scheduleFixture";
import {
  buildProposal,
  planFor,
  questionCards,
  readAsGroups,
  unplacedLines
} from "./data/engine";
import { csv, existingSetup, program, terms } from "./data/samples";

const NUMBERS = ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6"];
const MON_SAT = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];
const BLOCKS = ["9:00-9:45", "10:00-10:45", "12:00-12:45"];
const ACTIVITIES = ["Swim", "Art", "Soccer", "Drama", "Archery", "Music"];

/** What bunk g does in block i on day d: Lunch in the third block, else a rotation. */
function cellAt(g, i, d) {
  return i === 2 ? "Lunch" : ACTIVITIES[(g + i + d) % ACTIVITIES.length];
}

/** A by-group CSV per bunk, days across as written: the shape the campaign broke. */
function byGroup(bunks, dayWords) {
  return bunks.map((bunk, g) =>
    csv(`Camp - ${bunk}.csv`, [
      ["Time", ...dayWords],
      ...BLOCKS.map((b, i) => [b, ...dayWords.map((_, d) => cellAt(g, i, d))])
    ])
  );
}

/** One day's all-camp grid: a column per bunk. */
function dayGrid(d) {
  return [
    ["Time", "Bunk 1", "Bunk 2"],
    ...BLOCKS.map((b, i) => [b, ...[0, 1].map((g) => cellAt(g, i, d))])
  ];
}

const WEEK1 = {
  Id: "w1",
  Name: "Week 1",
  StartDate__c: "2027-06-27",
  EndDate__c: "2027-07-03"
};

/** A season with these weeks and programs, its days named or numbered. */
function seasonOf({ weeks = [], programs = [], numbered = false, dated } = {}) {
  const setup = existingSetup({ weeks, programs });
  return {
    ...setup,
    season: {
      ...setup.season,
      NumberedDays__c: numbered,
      ...(dated ? { StartDate__c: "2027-06-28", EndDate__c: "2027-07-10" } : {})
    }
  };
}

function mainProgram(runsOn) {
  return program("p1", "Main", {
    days: runsOn,
    divisions: [["d1", "Juniors", [["g1", "Bunk 1"]]]]
  });
}

function propose(files, existing, answers = {}) {
  return buildProposal({ files, existing, terms, answers });
}

const daysRead = (p) => [...new Set(p.usable.map((x) => x.day))];
const linesOf = (p) => {
  const group = readAsGroups(p, terms).find((g) => g.key === "dayNumbers");
  return group ? [group.label, ...group.lines.map((l) => l.name)] : [];
};

afterEach(() => setDayNaming(null));

// WEEK-2.6
describe("WEEK-2.6: a day said by its number", () => {
  it("reads Day 3, Day3, day 3, DAY #3 and D3 as the camp's 3rd day, and never a bare number", () => {
    countDaysFrom(1);
    ["Day 3", "Day3", "day 3", "DAY #3", "D3", "Day-3", "Day 3:"].forEach(
      (text) => expect([text, dayOf(text)]).toEqual([text, "Wednesday"])
    );
    ["3", "Day", "Day 10", "Day 8", "Day 0", "3rd", "Field Day 2"].forEach(
      (text) => expect([text, dayOf(text)]).toEqual([text, null])
    );
    countDaysFrom(7);
    expect(dayOf("Day 1")).toBe("Sunday");
    expect(dayOf("Day 5")).toBe("Thursday");
  });

  it("finds the number in a title, but not in a name like Field Day 2", () => {
    countDaysFrom(1);
    expect(dayInTitle("Week 2 - Day 3")).toBe("Wednesday");
    expect(dayInTitle("Camp 2026 - Day 4.csv")).toBe("Thursday");
    expect(dayInTitle("Day 2 (rain plan)")).toBe("Tuesday");
    expect(dayInTitle("Maple Grove Camp - Day 3")).toBe("Wednesday");
    expect(dayInTitle("Field Day 2")).toBeNull();
    expect(dayInTitle("field-day-2.csv")).toBeNull();
    expect(dayInTitle("Monday - Day 3")).toBe("Monday");
  });

  it("columns: a page per bunk with Day 1 to Day 6 across is days, not six bunks on one day", () => {
    const files = byGroup(["Bunk 1", "Bunk 2"], NUMBERS);
    const p = propose(files, seasonOf({ dated: true }));
    expect(p.reading.pages.map((x) => x.layout)).toEqual([
      "byGroup",
      "byGroup"
    ]);
    expect(p.groups.map((g) => g.name).sort()).toEqual(["Bunk 1", "Bunk 2"]);
    expect(daysRead(p).sort()).toEqual([...MON_SAT].sort());
    // Nothing asked about a single day, and every cell placed.
    expect(questionCards(p, terms, {}).map((c) => c.id)).not.toContain(
      "oneDay|Camp - Bunk 1.csv"
    );
    expect(p.reading.timeAsks.filter((a) => a.type === "oneDay")).toEqual([]);
  });

  it("pages: a sheet per Day N, a file per Day N, and Day N heading rows on one sheet", () => {
    const sheetPerDay = {
      name: "camp.xlsx",
      sheets: [0, 1, 2].map((d) => ({
        name: NUMBERS[d],
        rows: dayGrid(d),
        merges: []
      }))
    };
    const filePerDay = [0, 1, 2].map((d) =>
      csv(`Camp 2026 - Day ${d + 1}.csv`, dayGrid(d))
    );
    const stacked = csv(
      "camp.csv",
      [0, 1, 2].flatMap((d) => [[NUMBERS[d]], ...dayGrid(d), []])
    );
    for (const files of [[sheetPerDay], filePerDay, [stacked]]) {
      const p = propose(files, seasonOf({ dated: true }));
      expect(daysRead(p).sort()).toEqual(["Monday", "Tuesday", "Wednesday"]);
      expect(p.groups.map((g) => g.name).sort()).toEqual(["Bunk 1", "Bunk 2"]);
      expect(p.reading.pages.filter((x) => x.noDay)).toEqual([]);
      expect(p.reading.timeAsks.filter((a) => a.type === "oneDay")).toEqual([]);
    }
  });

  it("never reads Day 3 as a group, while bunks the camp calls D1 and D2 stay bunks", () => {
    const camp = seasonOf({
      programs: [
        program("p1", "Main", {
          divisions: [
            [
              "d1",
              "Juniors",
              [
                ["g1", "D1"],
                ["g2", "D2"]
              ]
            ]
          ]
        })
      ]
    });
    const rows = [
      ["Time", "D1", "D2"],
      ...BLOCKS.map((b, i) => [b, ACTIVITIES[i], ACTIVITIES[i + 1]])
    ];
    const p = propose([csv("Monday.csv", rows)], camp);
    expect(p.reading.pages[0].layout).toBe("allCamp");
    expect(p.groups.map((g) => g.name).sort()).toEqual(["D1", "D2"]);
    expect(daysRead(p)).toEqual(["Monday"]);
  });

  // INGEST-5.11
  it("into a season with no weeks and no programs: the season becomes numbered at save, and the review shows it", () => {
    const existing = seasonOf({ dated: true });
    // The questions any file of new bunks is asked, the same as for named days.
    const answers = {
      "program|Bunk 1,Bunk 2": "new",
      "week|the file's week": "Week 1"
    };
    const p = propose(
      byGroup(["Bunk 1", "Bunk 2"], NUMBERS),
      existing,
      answers
    );
    expect(questionCards(p, terms, answers).filter((c) => !c.answer)).toEqual(
      []
    );
    expect(p.numberDays).toBe(true);
    expect(linesOf(p)).toEqual([
      "6 days by number",
      "Mon Tue Wed → Day 1 Day 2 Day 3",
      ...NUMBERS
    ]);
    const plan = planFor(p, existing, "s");
    expect(plan.numberDays).toBe(true);
    // Its weeks follow the days the grids run (WEEK-2.3): Monday to Saturday.
    expect(plan.fillWeeks[0].days).toBe(MON_SAT.join("+"));
  });

  // INGEST-5.11
  it("into a named season with weeks: it stays named, and each number shows the weekday it lands on", () => {
    const existing = seasonOf({
      weeks: [WEEK1],
      programs: [
        mainProgram(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"])
      ]
    });
    const p = propose(byGroup(["Bunk 1"], NUMBERS.slice(0, 5)), existing);
    expect(p.numberDays).toBe(false);
    expect(planFor(p, existing, "s").numberDays).toBe(false);
    // Sunday to Thursday: Day 1 is Sunday.
    expect(linesOf(p)).toEqual([
      "5 days by number",
      "Day 1 → Sunday",
      "Day 2 → Monday",
      "Day 3 → Tuesday",
      "Day 4 → Wednesday",
      "Day 5 → Thursday"
    ]);
    // Nothing asked about its days.
    expect(
      questionCards(p, terms, {}).filter((c) => c.id.startsWith("oneDay"))
    ).toEqual([]);
  });

  it("a Day 6 into a week of Monday to Friday is listed, never dropped (WEEK-2.4)", () => {
    const week = {
      ...WEEK1,
      StartDate__c: "2027-06-28",
      EndDate__c: "2027-07-02"
    };
    const existing = seasonOf({
      weeks: [week],
      programs: [
        mainProgram(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"])
      ]
    });
    const p = propose(byGroup(["Bunk 1"], NUMBERS), existing);
    expect(linesOf(p)).toContain("Day 6 → Saturday");
    const lines = unplacedLines(p, terms);
    expect(lines.length).toBeGreaterThan(0);
    lines.forEach((l) => expect(l.whereText).toContain("Saturday"));
  });

  // INGEST-5.11
  it("into a numbered season the review just says Day 3, and what cannot be placed says Day 6", () => {
    const week = {
      ...WEEK1,
      StartDate__c: "2027-06-28",
      EndDate__c: "2027-07-02"
    };
    const existing = seasonOf({
      weeks: [week],
      numbered: true,
      programs: [mainProgram(MON_SAT)]
    });
    nameDaysFor(nsRecord(existing));
    const p = propose(byGroup(["Bunk 1"], NUMBERS), existing);
    expect(p.numberDays).toBe(false);
    expect(linesOf(p)).toEqual(["6 days by number", ...NUMBERS]);
    expect(unplacedLines(p, terms)[0].whereText).toContain("Day 6");
  });

  it("in a numbered season, a single-day file is asked as Day 1 to Day 7, and an early day says its number", () => {
    const existing = seasonOf({
      numbered: true,
      programs: [mainProgram(MON_SAT)]
    });
    nameDaysFor(nsRecord(existing));
    const card = questionCards(
      propose([csv("field-day.csv", dayGrid(0))], existing),
      terms,
      {}
    ).find((c) => c.id.startsWith("oneDay"));
    expect(card.options.map((o) => o.label)).toEqual([
      ...NUMBERS,
      "Day 7",
      "Leave it out for now"
    ]);
    expect(card.options[2].value).toBe("Wednesday");

    // INGEST-4.13's card, as existing.test.js has it, in a numbered season.
    const at = (h, m = 0) => h * 60 + m;
    const day = [
      ["Time", "Bunk 1"],
      ["9:00-9:45", "Swim"],
      ["10:00-10:45", "Art"],
      ["11:00-11:20", "Dismissal"]
    ];
    const short = [...day.slice(0, 2), ["10:00-10:20", "Dismissal"]];
    const files = ["Day 1", "Day 2", "Day 3", "Day 4"].map((d) =>
      csv(`${d}.csv`, d === "Day 4" ? short : day)
    );
    const fourDays = seasonOf({
      numbered: true,
      programs: [
        program("p1", "Main", {
          days: ["Monday", "Tuesday", "Wednesday", "Thursday"],
          blocks: [
            ["tb1", "Period 1", at(9), at(9, 45)],
            ["tb2", "Period 2", at(10), at(10, 45)],
            ["tb3", "Dismissal", at(11), at(11, 20)]
          ],
          divisions: [["d1", "Juniors", [["g1", "Bunk 1"]]]],
          fixed: [
            { Id: "f1", Name: "Dismissal", TimeBlock__c: "tb3", Length__c: 1 }
          ]
        })
      ]
    });
    nameDaysFor(nsRecord(fourDays));
    const early = questionCards(propose(files, fourDays), terms, {}).find((c) =>
      c.id.startsWith("change|fixed")
    );
    expect(early.title).toBe(
      "“Dismissal” is set up at Dismissal. The file has it at Dismissal, 1 time block earlier on Day 4."
    );
  });

  it("a file naming its days reads as before, with no days by number shown", () => {
    const p = propose(
      byGroup(["Bunk 1"], ["Monday", "Tuesday"]),
      seasonOf({ dated: true })
    );
    expect(p.numberDays).toBe(false);
    expect(linesOf(p)).toEqual([]);
  });
});

/** A schedule download as the director saves it, read back as the import reads a workbook. */
function downloaded(sheets) {
  const wb = XLSX.utils.book_new();
  sheets.forEach((s) =>
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.name)
  );
  return workbookFile(
    XLSX,
    "schedule.xlsx",
    XLSX.write(wb, { type: "array", bookType: "xlsx" })
  );
}

// WEEK-2.6
describe("WEEK-2.6: a numbered season's downloads read back in", () => {
  const camp = (numbered) =>
    seasonOf({
      numbered,
      programs: [
        mainProgram(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"])
      ]
    });
  const t = buildTerms([]);
  const read = (numbered) => {
    nameDaysFor(nsRecord(camp(numbered)));
    const sheets = scheduleSheets(opened(), [], t);
    expect(sheets[0].name).toBe(numbered ? "Day 1" : "Monday");
    const p = propose([downloaded(sheets)], camp(numbered));
    return p.usable
      .map((x) => `${x.group}|${x.day}|${x.block}|${x.text}`)
      .sort();
  };

  it("the schedule download's Day 1 and Day 2 sheets come back as the same days the named download does", () => {
    const numbered = read(true);
    expect(numbered.length).toBeGreaterThan(0);
    expect(numbered).toEqual(read(false));
    expect(new Set(numbered.map((x) => x.split("|")[1]))).toEqual(
      new Set(["Monday", "Tuesday"])
    );
  });

  it("a setup list's days cell reads Day 2/Day 4 and Day 1-Day 5", () => {
    countDaysFrom(1);
    expect(days("Day 2/Day 4")).toEqual({ value: ["Tuesday", "Thursday"] });
    expect(days("Day 1-Day 5")).toEqual({
      value: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    });
    expect(days("Day 1, Day 3 and Day 5")).toEqual({
      value: ["Monday", "Wednesday", "Friday"]
    });
    countDaysFrom(7);
    expect(days("Day 1 to Day 5")).toEqual({
      value: ["Monday", "Tuesday", "Wednesday", "Thursday", "Sunday"]
    });
    expect(days("Day 9").problem).toBeTruthy();
  });

  it("an electives choices sheet reads Day 3 as the day, never as the rank", () => {
    countDaysFrom(1);
    expect(headingMeaning("Day 3 Period 2")).toEqual({
      use: "choice",
      rank: null,
      day: "Wednesday",
      period: "Period 2"
    });
    expect(headingMeaning("Day 2 P1 - 2nd choice")).toEqual({
      use: "choice",
      rank: 2,
      day: "Tuesday",
      period: "Period 1"
    });
    const reading = readChoices(
      csvFile(
        "choices.csv",
        [
          "Camper name,Bunk,Day,Period,Rank,Activity",
          "Ada Quillfield,Aspen,Day 2,Period 1,1,Drama"
        ].join("\n")
      )
    );
    expect(reading.campers[0].choices[0]).toMatchObject({
      name: "Drama",
      day: "Tuesday",
      period: "Period 1"
    });
  });
});
