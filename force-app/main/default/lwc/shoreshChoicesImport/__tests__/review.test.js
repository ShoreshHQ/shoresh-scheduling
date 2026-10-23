// What Bring in choices' three cards show, and the request it sends (docs/adr/0017, slice E6).
// Names are made up (docs/samples/choices/names.json).
import { csvFile } from "c/shoreshImportEngine";
import { readChoices } from "c/shoreshChoicesReader";
import { buildTerms } from "c/shoreshTerms";
import {
  allSettled,
  buildRequest,
  cantTellApartRows,
  countLines,
  groupsOfProgram,
  keptCommentRows,
  notReadRows,
  ordinal,
  proposalFor,
  readBacks,
  rememberedAnswers,
  shapeOf,
  sheetPreview,
  toCheckRows
} from "../review";

const t = buildTerms([
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true },
  { term: "Camper", singular: "Camper", plural: "Campers", isCustom: false }
]);
const lines = (...rows) => rows.join("\n");
const ACTIVITIES = [
  { Id: "a1", Name: "Archery" },
  { Id: "a2", Name: "Drama" },
  { Id: "a3", Name: "Pottery" }
];
const SETUP = {
  programs: [
    {
      program: { Id: "p1", Name: "Main" },
      divisions: [
        {
          division: { Id: "d1", Name: "Juniors" },
          groups: [
            { Id: "g1", Name: "Aspen" },
            { Id: "g2", Name: "Willow" }
          ]
        }
      ]
    },
    {
      program: { Id: "p2", Name: "Teens" },
      divisions: [
        {
          division: { Id: "d2", Name: "Seniors" },
          groups: [{ Id: "g9", Name: "Oak" }]
        }
      ]
    }
  ]
};
const SHEET = lines(
  "Timestamp,Camper ID,Child's name,Cabin,Chug choice 1,Chug choice 2,Chug choice 3,Anything we should know?,Parent email",
  "6/2 9:14,1001,Maya Fernwood,Aspen,Archery,Drama,Pottery Wheel,,maya.parent@example.com",
  "6/2 9:20,1002,Eli Marblecrest,Aspen,Pottery Wheel,Archery,Photo club,,",
  "6/2 10:02,1004,Ari Quillfield,Cedar,Archery,Drama,Pottery,Would love to be with his cousin,",
  "6/3 8:31,,Noa Oakhollow,Willow,Drama,Pottery,,,",
  "6/3 9:12,,Noa Oakhollow,Oak,Archery,Drama,,,",
  '6/4 7:55,1036,Ruby Pebblestone,,"Archery, Drama, Pottery",,,,',
  ",,,,,,,,"
);
const file = csvFile("chugim-week3.csv", SHEET);
const reading = () =>
  readChoices(file, { activities: ACTIVITIES.map((a) => a.Name) });

describe("card 1: how the sheet was read", () => {
  it("says the layout found, never asks it", () => {
    expect(shapeOf(reading())).toBe("One ranked list");
    const perPeriod = readChoices(
      csvFile(
        "p.csv",
        lines(
          "Name,Monday Period 1,Tuesday Period 2",
          "Maya Fernwood,Archery,Drama"
        )
      )
    );
    expect(shapeOf(perPeriod)).toBe("One per period");
    const both = readChoices(
      csvFile(
        "b.csv",
        lines(
          "Name,Monday Period 1,#1,#2",
          "Maya Fernwood,Archery,Drama,Pottery"
        )
      )
    );
    expect(shapeOf(both)).toBe("Both");
    const loose = readChoices(
      csvFile(
        "u.csv",
        lines("Name,Activities", 'Maya Fernwood,"Archery, Drama"')
      )
    );
    expect(shapeOf(loose)).toBe("One list, in no order");
  });

  it("draws the sheet with each column's reading over it, and never the cells of a column not read", () => {
    const preview = sheetPreview(file, reading(), t);
    expect(preview.columns.map((c) => c.label)).toEqual([
      "Not read",
      "Camper #",
      "Name",
      "Bunk",
      "1st",
      "2nd",
      "3rd",
      "Comment",
      "Not read"
    ]);
    expect(preview.columns.map((c) => c.kind)).toEqual([
      "not",
      "read",
      "read",
      "read",
      "read",
      "read",
      "read",
      "comment",
      "not"
    ]);
    expect(preview.headingNumber).toBe(1);
    expect(preview.rows).toHaveLength(6);
    const maya = preview.rows[0];
    expect(maya.mine).toBe(true);
    expect(maya.cells.map((c) => c.text)).toEqual([
      "",
      "1001",
      "Maya Fernwood",
      "Aspen",
      "Archery",
      "Drama",
      "Pottery Wheel",
      "",
      ""
    ]);
    expect(JSON.stringify(preview)).not.toContain("example.com");
  });

  it("reads back a ranked camper and one whose choices have no order, never as ranks", () => {
    const [maya, ruby] = readBacks(reading());
    expect(maya.name).toBe("Maya Fernwood");
    expect(maya.place).toBe("Aspen");
    expect(maya.choices.map((c) => [c.mark, c.label, c.spoken])).toEqual([
      ["1", "Archery", "First choice:"],
      ["2", "Drama", "Second choice:"],
      ["3", "Pottery Wheel", "Third choice:"]
    ]);
    expect(ruby.name).toBe("Ruby Pebblestone");
    expect(ruby.choices.every((c) => c.unordered && c.mark === "")).toBe(true);
    expect(ruby.choices[0].spoken).toBe("One of their choices:");
  });

  it("writes ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd"
    ]);
  });
});

describe("card 2: what needs a person", () => {
  it("lists the names the camp doesn't have, with the likely one offered first", () => {
    const r = reading();
    expect(r.newNames).toEqual([
      { name: "Pottery Wheel", campers: 2 },
      { name: "Photo club", campers: 1 }
    ]);
    expect(proposalFor("Pottery Wheel", ACTIVITIES)).toEqual({
      id: "a3",
      name: "Pottery"
    });
    expect(proposalFor("Photo club", ACTIVITIES)).toBeNull();
    expect(proposalFor("Archery", ACTIVITIES)).toBeNull();
  });

  it("brings back the camp's earlier answers, marked, and drops any it can't use", () => {
    const answers = rememberedAnswers(
      reading().newNames,
      [
        { key: "choiceName|potterywheel", answer: "same|Pottery" },
        { key: "choiceName|photoclub", answer: "leave" },
        { key: "choiceName|other", answer: "same|Gone" }
      ],
      ACTIVITIES
    );
    expect(answers).toEqual({
      potterywheel: { kind: "same", activityId: "a3", remembered: true },
      photoclub: { kind: "leave", remembered: true }
    });
    expect(
      rememberedAnswers(
        [{ name: "Photo club", campers: 1 }],
        [{ key: "choiceName|photoclub", answer: "same|Gone" }],
        ACTIVITIES
      )
    ).toEqual({});
  });

  it("names the two campers it can't tell apart by their rows and bunks", () => {
    expect(cantTellApartRows(reading())).toEqual([
      {
        key: "apart-0",
        name: "Noa Oakhollow",
        where: "Rows 5, 6",
        why: "No camper number. Willow and Oak."
      }
    ]);
  });

  it("lists what was not read: columns by heading, rows, and bunks the program doesn't have", () => {
    const rows = notReadRows(reading(), groupsOfProgram(SETUP, "p1"), t);
    expect(rows.map((r) => [r.name, r.where, r.why])).toEqual([
      ["Timestamp", "Column A", "Not read"],
      ["Parent email", "Column I", "Not read"],
      ["Ari Quillfield", "Row 4", 'No Bunk "Cedar"'],
      ["Ruby Pebblestone", "Row 7", "No Bunk"]
    ]);
  });

  it("keeps each comment with its camper, and says what to check", () => {
    expect(keptCommentRows(reading())).toEqual([
      {
        key: "kept-0",
        name: "Ari Quillfield",
        text: "Would love to be with his cousin"
      }
    ]);
    const checks = toCheckRows(reading(), t);
    expect(checks.map((c) => c.why)).toEqual(["Read as choices in no order"]);
  });
});

describe("the request: what the director confirmed", () => {
  const place = { seasonId: "s1", setId: "e1", weekId: "w1", scheduleId: "c1" };
  const build = (answers) =>
    buildRequest({
      reading: reading(),
      activities: ACTIVITIES,
      answers,
      groups: groupsOfProgram(SETUP, "p1"),
      place,
      fileName: "chugim-week3.csv",
      fingerprint: "abc",
      runRevision: null
    });

  it("waits until every name is settled", () => {
    expect(allSettled(reading().newNames, {})).toBe(false);
    expect(
      build({ potterywheel: { kind: "same", activityId: "a3" } })
    ).toBeNull();
  });

  it("carries each camper with their bunk, comment and settled choices", () => {
    const request = build({
      potterywheel: { kind: "same", activityId: "a3" },
      photoclub: { kind: "leave" }
    });
    expect(request).toMatchObject({
      seasonId: "s1",
      electiveSetId: "e1",
      weekId: "w1",
      scheduleId: "c1",
      fileName: "chugim-week3.csv",
      fingerprint: "abc",
      runRevision: null,
      addActivities: [],
      remember: {
        "choiceName|potterywheel": "same|Pottery",
        "choiceName|photoclub": "leave"
      }
    });
    // Noa Oakhollow, twice with no number, is not among them.
    expect(request.campers.map((c) => c.name)).toEqual([
      "Maya Fernwood",
      "Eli Marblecrest",
      "Ari Quillfield",
      "Ruby Pebblestone"
    ]);
    const [maya, eli, ari, ruby] = request.campers;
    expect(maya).toMatchObject({
      row: 2,
      camperNumber: "1001",
      groupId: "g1",
      comment: null
    });
    expect(maya.choices).toEqual([
      { n: "Archery", a: "a1", r: 1, k: "ranked" },
      { n: "Drama", a: "a2", r: 2, k: "ranked" },
      { n: "Pottery Wheel", a: "a3", r: 3, k: "ranked" }
    ]);
    // Photo club left out: that one choice only.
    expect(eli.choices.map((c) => c.n)).toEqual(["Pottery Wheel", "Archery"]);
    expect(ari).toMatchObject({
      groupId: null,
      comment: "Would love to be with his cousin"
    });
    expect(ruby.choices).toEqual([
      { n: "Archery", a: "a1", k: "unordered" },
      { n: "Drama", a: "a2", k: "unordered" },
      { n: "Pottery", a: "a3", k: "unordered" }
    ]);
  });

  it("carries a name to add, and remembers nothing for it", () => {
    const request = build({
      potterywheel: { kind: "same", activityId: "a3" },
      photoclub: { kind: "add" }
    });
    expect(request.addActivities).toEqual(["Photo club"]);
    expect(request.remember["choiceName|photoclub"]).toBeUndefined();
    expect(request.campers[1].choices[2]).toEqual({
      n: "Photo club",
      add: "Photo club",
      r: 3,
      k: "ranked"
    });
  });
});

describe("card 3: the count", () => {
  it("says every hand change kept, every name kept, and what the set doesn't offer", () => {
    const request = buildRequest({
      reading: reading(),
      activities: ACTIVITIES,
      answers: {
        potterywheel: { kind: "same", activityId: "a3" },
        photoclub: { kind: "leave" }
      },
      groups: groupsOfProgram(SETUP, "p1"),
      place: { seasonId: "s1", setId: "e1", weekId: "w1", scheduleId: "c1" },
      fileName: "f.csv"
    });
    const out = countLines({
      request,
      check: {
        runId: "r1",
        runName: "Chugim · Week 3",
        added: 1,
        known: 3,
        handChanged: [0],
        differs: [0],
        renamed: [{ index: 1, savedName: "Eli Marblecreste" }],
        notOnSheet: 2
      },
      set: { name: "Chugim", activityIds: ["a1", "a2"] },
      t,
      activities: ACTIVITIES
    });
    expect(out.map((l) => [l.text, !!l.look])).toEqual([
      ["4 campers: 1 new, 3 already here", false],
      ['Brought into "Chugim · Week 3" again', false],
      ["1 camper's choices were changed by hand: kept", false],
      [
        "Maya Fernwood: the sheet now says something else; the hand change is kept",
        true
      ],
      [
        'Camper number 1002 is "Eli Marblecreste" here; the sheet says "Eli Marblecrest". Kept "Eli Marblecreste".',
        true
      ],
      ["2 campers in this run aren't on this sheet: their choices stay", false],
      ["Pottery isn't offered in Chugim: 4 choices", true]
    ]);
  });
});
