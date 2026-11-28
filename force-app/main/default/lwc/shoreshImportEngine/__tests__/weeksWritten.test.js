// INGEST-2.34: the weeks an activity's cells name. Made-up camp only.
import { buildProposal, importNotes, planFor } from "./data/engine";
import { cellName } from "../text";
import { FIELD } from "c/shoreshSchema";
import { csv, existingSetup, terms } from "./data/samples";

// A season of five weeks, Monday to Friday.
const WEEKS = [0, 1, 2, 3, 4].map((i) => ({
  Id: `w${i + 1}`,
  Name: `Week ${i + 1}`,
  [FIELD.Week.StartDate]:
    `2027-0${6 + Math.floor((28 + i * 7) / 31)}-${String(((28 + i * 7 - 1) % 31) + 1).padStart(2, "0")}`,
  [FIELD.Week.SortOrder]: i + 1
}));

// A spreadsheet, so a cell keeps its commas.
const week = (cell) => ({
  name: "Week.xlsx",
  sheets: [
    {
      name: "Week",
      merges: [],
      rows: [
        ["Time", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        ["9:00-9:45", "Archery", "Canoe", cell, "Archery", "Canoe"],
        ["10:00-10:45", "Canoe", "Archery", "Canoe", "Archery", "Canoe"]
      ]
    }
  ]
});
const propose = (files) =>
  buildProposal({
    files,
    existing: existingSetup({ weeks: WEEKS }),
    terms,
    answers: {}
  });
const notesOf = (p) =>
  importNotes(p, terms)
    .filter((n) => /^weeks/.test(n.key))
    .map((n) => n.text);

describe("INGEST-2.34: an activity's cells name the weeks it runs in", () => {
  it("INGEST-2.34: reads the weeks off a cell's name, ranges and lists as written", () => {
    expect(cellName("Water Slide Weeks 2, 4-5")).toMatchObject({
      name: "Water Slide",
      weeks: [2, 4, 5]
    });
    expect(cellName("Water Slide (Week 3)")).toMatchObject({
      name: "Water Slide",
      weeks: [3]
    });
    expect(cellName("Water Slide")).toMatchObject({ weeks: null });
    // Before a place or times, and the word written again.
    expect(cellName("Water Slide Week 1 (Pond)")).toMatchObject({
      name: "Water Slide",
      place: "Pond",
      weeks: [1]
    });
    expect(cellName("Water Slide Weeks 2-3 @ Pond")).toMatchObject({
      name: "Water Slide",
      weeks: [2, 3]
    });
    expect(cellName("Water Slide Week 1 9:00-10:00")).toMatchObject({
      name: "Water Slide",
      weeks: [1]
    });
    expect(cellName("Hike Week 1-2, Week 4")).toMatchObject({
      name: "Hike",
      weeks: [1, 2, 4]
    });
    // Counter-case: a name with a week in it is a name.
    for (const name of ["Week 1 Kickoff", "Weeks of Wonder", "Spirit Week"]) {
      expect(cellName(name)).toMatchObject({ name, weeks: null });
    }
  });

  it("INGEST-2.34: a week number is the season's week of that name first, as a file's week sheet is", () => {
    // A staff week before Week 1: "Week 2" is the third week of the season.
    const named = ["Staff Week", "Week 1", "Week 2"].map((Name, i) => ({
      ...WEEKS[i],
      Name
    }));
    const p = buildProposal({
      files: [week("Water Slide Week 2")],
      existing: existingSetup({ weeks: named }),
      terms,
      answers: {}
    });
    expect(p.activities.find((a) => a.name === "Water Slide")).toMatchObject({
      runsIn: [2],
      offWeeks: ["w1", "w2"]
    });
  });

  it("INGEST-2.34: a set time named with its week in every cell runs every week, and why", () => {
    const lunch = {
      name: "Week.xlsx",
      sheets: [
        {
          name: "Week",
          merges: [],
          rows: [
            ["Time", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
            ["9:00-9:45", "Archery", "Canoe", "Archery", "Canoe", "Archery"],
            ["12:00-12:45", ...Array(5).fill("Lunch Week 2")]
          ]
        }
      ]
    };
    const p = propose([lunch]);
    expect(notesOf(p)).toEqual([
      "Lunch is at a set time, so it runs every week."
    ]);
  });

  it("INGEST-2.34: counter-case: weeks named by their dates, or numbered within sessions, go by place", () => {
    for (const names of [
      ["Week of 6/21", "Week of 6/28", "Week of 7/5"],
      ["Session 1 Week 1", "Session 1 Week 2", "Session 2 Week 1"]
    ]) {
      const p = buildProposal({
        files: [week("Water Slide Week 2")],
        existing: existingSetup({
          weeks: names.map((Name, i) => ({ ...WEEKS[i], Name }))
        }),
        terms,
        answers: {}
      });
      expect(
        p.activities.find((a) => a.name === "Water Slide").offWeeks
      ).toEqual(["w1", "w3"]);
    }
  });

  it("INGEST-2.34: an activity the camp has keeps its weeks, and that is said", () => {
    const existing = existingSetup({
      weeks: WEEKS,
      activities: [{ Id: "a01000000000001", Name: "Water Slide", Length__c: 1 }]
    });
    const p = buildProposal({
      files: [week("Water Slide Weeks 2, 4")],
      existing,
      terms,
      answers: {}
    });
    expect(p.activities.find((a) => a.name === "Water Slide")).toBeUndefined();
    expect(notesOf(p)).toEqual([
      "Water Slide: the files name Weeks 2 and 4; its weeks stay as they are."
    ]);
  });

  it("INGEST-2.34: the activity is one, running in those weeks, off in the others, and said so", () => {
    const p = propose([week("Water Slide Weeks 2, 4-5")]);
    const slide = p.activities.find((a) => a.name === "Water Slide");
    expect(p.activities.map((a) => a.name)).not.toContain(
      "Water Slide Weeks 2, 4-5"
    );
    expect(slide).toMatchObject({ runsIn: [2, 4, 5], offWeeks: ["w1", "w3"] });
    expect(notesOf(p)).toEqual(["Water Slide runs in Weeks 2, 4 and 5."]);
    const entry = planFor(
      p,
      existingSetup({ weeks: WEEKS }),
      "s1"
    ).activities.find((a) => a.name === "Water Slide");
    expect(entry.offWeeks).toEqual(["w1", "w3"]);
  });

  it("INGEST-2.34: in a season with no weeks yet, the weeks the import adds are added, and named", () => {
    const empty = existingSetup();
    const dated = {
      ...empty,
      season: {
        ...empty.season,
        [FIELD.Season.StartDate]: "2027-06-28",
        [FIELD.Season.EndDate]: "2027-07-16"
      }
    };
    const p = buildProposal({
      files: [week("Water Slide Week 2")],
      existing: dated,
      terms,
      answers: {}
    });
    const plan = planFor(p, dated, "s1");
    expect(plan.fillWeeks.map((w) => w.start)).toEqual([
      "2027-06-28",
      "2027-07-05",
      "2027-07-12"
    ]);
    expect(
      plan.activities.find((a) => a.name === "Water Slide").offWeeks
    ).toEqual(["Week:2027-06-28", "Week:2027-07-12"]);
  });

  it("INGEST-2.34: a week the season doesn't have is said, not guessed", () => {
    const p = propose([week("Water Slide Weeks 2, 7")]);
    expect(p.activities.find((a) => a.name === "Water Slide")).toMatchObject({
      runsIn: [2],
      offWeeks: ["w1", "w3", "w4", "w5"]
    });
    expect(notesOf(p)).toEqual([
      "Water Slide: the files name Week 7, which the season doesn't have.",
      "Water Slide runs in Week 2."
    ]);
  });

  it("INGEST-2.34: counter-case: the same activity without weeks elsewhere runs every week, and that is said", () => {
    const files = [
      week("Water Slide Weeks 2, 4"),
      csv("Week 2.csv", [
        ["Time", "Monday"],
        ["9:00-9:45", "Water Slide"]
      ])
    ];
    const p = propose(files);
    const slide = p.activities.find((a) => a.name === "Water Slide");
    expect(slide.offWeeks).toBeUndefined();
    expect(notesOf(p)).toEqual([
      "Water Slide runs every week: the files have it in other weeks too."
    ]);
  });

  it("INGEST-2.34: counter-case: every week named, or none the season has, keeps it every week", () => {
    const all = propose([week("Water Slide Weeks 1-5")]);
    expect(
      all.activities.find((a) => a.name === "Water Slide").offWeeks
    ).toBeUndefined();
    const none = propose([week("Water Slide Week 9")]);
    expect(
      none.activities.find((a) => a.name === "Water Slide").offWeeks
    ).toBeUndefined();
    expect(notesOf(none)).toEqual([
      "Water Slide: the files name Week 9, which the season doesn't have."
    ]);
  });
});
