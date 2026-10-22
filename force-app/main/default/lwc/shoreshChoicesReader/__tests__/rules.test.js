// The reader's rules one at a time, on small made-up sheets (docs/adr/0017-reading-a-choices-sheet.md).
import { csvFile } from "c/shoreshImportEngine";
import { headingMeaning, readChoices } from "c/shoreshChoicesReader";
import { corpusFrom } from "./data/corpus";

const { sheetFile } = corpusFrom(__dirname);

const read = (text, options) =>
  readChoices(csvFile("choices.csv", text), options);
const lines = (...rows) => rows.join("\n");

describe("what a heading means", () => {
  it.each([
    ["Camper Name", { use: "name" }],
    ["Student", { use: "name" }],
    ["Name", { use: "name" }],
    ["First Name", { use: "firstName" }],
    ["Last Name", { use: "lastName" }],
    ["Camper ID", { use: "number" }],
    ["Camper #", { use: "number" }],
    ["Division", { use: "division" }],
    ["Edah", { use: "division" }],
    ["Bunk", { use: "bunk" }],
    ["Cabin", { use: "bunk" }],
    ["#2", { use: "choice", rank: 2, day: null, period: null }],
    ["Third Choice", { use: "choice", rank: 3, day: null, period: null }],
    ["1st choice", { use: "choice", rank: 1, day: null, period: null }],
    ["Pref 4", { use: "choice", rank: 4, day: null, period: null }],
    [
      "Monday Period 3",
      { use: "choice", rank: null, day: "Monday", period: "Period 3" }
    ],
    [
      "Tue P2 - 2nd choice",
      { use: "choice", rank: 2, day: "Tuesday", period: "Period 2" }
    ],
    ["Activities", { use: "choices" }],
    ["Activity", { use: "choiceValue" }],
    ["Rank", { use: "rankValue" }],
    ["Day", { use: "dayValue" }],
    ["Period", { use: "periodValue" }],
    ["Comments", { use: "comment" }],
    ["Swim opt-out", { use: "optOut" }]
  ])("%s", (heading, meaning) => {
    expect(headingMeaning(heading)).toEqual(meaning);
  });

  it.each([
    "Parent Name",
    "Email Address",
    "Monday Night Live",
    "T-shirt size",
    "Date of birth",
    "Timestamp",
    "Medical",
    "Medical notes",
    "Allergies",
    "Medications",
    "Health concerns",
    "Dietary needs"
  ])("%s is not a field the reader uses", (heading) => {
    expect(headingMeaning(heading)).toBeNull();
  });
});

describe("reading", () => {
  it("never copies what an unused column holds", () => {
    const reading = read(
      lines(
        "Camper Name,Parent Email,Date of birth,#1",
        "Maya Fernwood,parent@example.com,2016-04-02,Archery"
      )
    );
    const text = JSON.stringify(reading);
    expect(text).not.toContain("example.com");
    expect(text).not.toContain("2016-04-02");
    expect(reading.notRead.map((n) => n.heading)).toEqual([
      "Parent Email",
      "Date of birth"
    ]);
  });

  it("never copies what a medical or allergy column holds", () => {
    const reading = read(
      lines(
        "Name,#1,Medical,Allergies,Medical notes",
        "Maya Fernwood,Archery,asthma inhaler,peanuts,epipen"
      )
    );
    const text = JSON.stringify(reading);
    for (const held of ["asthma", "peanuts", "epipen"]) {
      expect(text).not.toContain(held);
    }
    expect(reading.notKept).toEqual([]);
    expect(reading.notRead.map((n) => n.heading)).toEqual([
      "Medical",
      "Allergies",
      "Medical notes"
    ]);
  });

  it("keeps comments and opt-outs out of the campers", () => {
    const reading = read(
      lines(
        "Camper Name,#1,Comments,Swim opt-out",
        "Maya Fernwood,Archery,A note from home,Yes"
      )
    );
    expect(JSON.stringify(reading.campers)).not.toContain("A note from home");
    expect(reading.notKept).toEqual([
      expect.objectContaining({ kind: "comment", text: "A note from home" }),
      expect.objectContaining({ kind: "optOut", text: "Yes" })
    ]);
    expect(reading.notKept[0].camper).toBe(reading.campers[0].key);
  });

  it("does not take a list in one ranked cell for one activity", () => {
    const reading = read(lines("Camper Name,#1", "Maya Fernwood,Swim; Drama"));
    expect(reading.campers[0].choices.map((c) => [c.name, c.kind])).toEqual([
      ["Swim", "unordered"],
      ["Drama", "unordered"]
    ]);
  });

  it("reads a cell naming one of the camp's activities as that one activity", () => {
    const reading = read(
      lines(
        "Name,#1,#2,Activities",
        'Maya Fernwood,"Arts, Crafts",Rock / Rope,"Arts, Crafts; Swim"'
      ),
      { activities: ["arts & crafts", "Arts, Crafts", "Rock / Rope", "Swim"] }
    );
    expect(
      reading.campers[0].choices.map((c) => [c.name, c.rank, c.kind])
    ).toEqual([
      ["Arts, Crafts", 1, "ranked"],
      ["Rock / Rope", 2, "ranked"],
      ["Arts", null, "unordered"],
      ["Crafts", null, "unordered"],
      ["Swim", null, "unordered"]
    ]);
    expect(reading.toCheck).toEqual([]);
  });

  it("names the choices the camp has no activity for", () => {
    const reading = read(
      lines(
        "Camper Name,#1,#2",
        "Maya Fernwood,Archery,Pottery wheel",
        "Noa Oakhollow,pottery wheel,archery"
      ),
      { activities: [{ name: "Archery" }, "Drama"] }
    );
    expect(reading.newNames).toEqual([{ name: "Pottery wheel", campers: 2 }]);
  });

  it("keeps two campers with one name out of the campers, with their rows", () => {
    const reading = read(
      lines(
        "Camper Name,Division,#1",
        "Maya Fernwood,Juniors,Archery",
        "Maya Fernwood,Seniors,Drama"
      )
    );
    expect(reading.campers).toEqual([]);
    expect(reading.cantTellApart).toEqual([
      {
        name: "Maya Fernwood",
        rows: [
          { sheet: "choices.csv", row: 2, division: "Juniors", bunk: null },
          { sheet: "choices.csv", row: 3, division: "Seniors", bunk: null }
        ]
      }
    ]);
  });

  it.each([
    ["the same bunk", ["Bunk 1", "Bunk 1", "Bunk 1", "Bunk 1"]],
    ["different bunks", ["Bunk 1", "Bunk 2", "Bunk 1", "Bunk 2"]]
  ])(
    "keeps one name apart when unranked rows name one activity twice (%s)",
    (_, bunks) => {
      // Desktop preferenceSheet.js: an unranked choice's slot is the activity it names, so two
      // rows naming Drama collide (sameNameCampers) instead of merging into one camper.
      const activities = ["Drama", "Swim", "Drama", "Gaga"];
      const reading = read(
        lines(
          "Name,Bunk,Activity",
          ...activities.map((a, i) => `Maya Fernwood,${bunks[i]},${a}`)
        )
      );
      expect(reading.campers).toEqual([]);
      expect(reading.cantTellApart).toEqual([
        {
          name: "Maya Fernwood",
          rows: bunks.map((bunk, i) => ({
            sheet: "choices.csv",
            row: i + 2,
            division: null,
            bunk
          }))
        }
      ]);
    }
  );

  it.each([
    [
      "choices that don't contradict",
      ["Maya Cohen,Swim,Art,", "Maya Cohen,,,Drama"]
    ],
    [
      "the same row twice",
      ["Maya Cohen,Swim,Art,Drama", "Maya  cohen,Swim,Art,Drama"]
    ]
  ])(
    "keeps one name on two rows of a one-row-per-camper sheet apart (%s)",
    (_, rows) => {
      const reading = read(lines("Name,#1,#2,#3", ...rows));
      expect(reading.campers).toEqual([]);
      expect(reading.cantTellApart).toEqual([
        expect.objectContaining({
          rows: [
            expect.objectContaining({ row: 2 }),
            expect.objectContaining({ row: 3 })
          ]
        })
      ]);
    }
  );

  it("merges one camper's rows when they name different choices", () => {
    const reading = read(
      lines(
        "Camper Name,Rank,Activity",
        "Maya Fernwood,1,Archery",
        "Maya  fernwood,2,Drama"
      )
    );
    expect(reading.campers).toHaveLength(1);
    expect(reading.campers[0].rows.map((r) => r.row)).toEqual([2, 3]);
  });

  it("says when one camper number carries two names", () => {
    const reading = read(
      lines(
        "Camper ID,Camper Name,Rank,Activity",
        "1001,Maya Fernwood,1,Archery",
        "1001,Noa Oakhollow,2,Drama"
      )
    );
    expect(reading.campers).toHaveLength(1);
    expect(reading.campers[0].name).toBe("Maya Fernwood");
    expect(reading.campers[0].choices.map((c) => c.name)).toEqual(["Archery"]);
    expect(reading.toCheck).toEqual([
      expect.objectContaining({
        kind: "oneNumberTwoNames",
        row: 3,
        number: "1001"
      })
    ]);
  });

  it("keeps only the first name's choices when one camper number carries two names", () => {
    const reading = read(
      lines(
        "ID,Name,#1,#2,Comments",
        "101,Maya Elderglen,Archery,Drama,",
        "101,Noa Brightwater,Swim,Art,Loves the pool"
      )
    );
    expect(reading.campers).toHaveLength(1);
    const [maya] = reading.campers;
    expect(maya.name).toBe("Maya Elderglen");
    expect(maya.rows).toEqual([expect.objectContaining({ row: 2 })]);
    expect(maya.choices.map((c) => [c.name, c.rank])).toEqual([
      ["Archery", 1],
      ["Drama", 2]
    ]);
    expect(reading.toCheck).toEqual([
      expect.objectContaining({
        kind: "oneNumberTwoNames",
        row: 3,
        number: "101",
        name: "Noa Brightwater"
      })
    ]);
    expect(reading.notKept).toEqual([
      expect.objectContaining({ camper: null, name: "Noa Brightwater", row: 3 })
    ]);
  });

  it("keeps the first choice when one camper's rows give two choices for one rank", () => {
    const reading = read(
      lines(
        "ID,Name,#1,#2",
        "101,Maya Elderglen,Archery,Drama",
        "101,Maya Elderglen,Swim,Drama"
      )
    );
    expect(reading.campers).toHaveLength(1);
    expect(reading.campers[0].choices.map((c) => [c.name, c.rank])).toEqual([
      ["Archery", 1],
      ["Drama", 2]
    ]);
    expect(reading.toCheck).toEqual([
      expect.objectContaining({ kind: "sameRankTwice", row: 3, number: "101" })
    ]);
  });

  it("says when one camper's rows give two divisions, and keeps the first", () => {
    const reading = read(
      lines(
        "Camper Name,Division,Rank,Activity",
        "Maya Fernwood,Juniors,1,Archery",
        "Maya Fernwood,Seniors,2,Drama"
      )
    );
    expect(reading.campers[0].division).toBe("Juniors");
    expect(reading.toCheck).toEqual([
      expect.objectContaining({ kind: "differs", field: "division", row: 3 })
    ]);
  });

  it("reads a two-row heading in a comma-separated file (no merged cells)", () => {
    const reading = read(
      lines(
        "Camper Name,Wednesday,,",
        ",1st,2nd,3rd",
        "Maya Fernwood,Archery,Drama,Swim"
      )
    );
    expect(reading.notRead).toEqual([]);
    expect(
      reading.campers[0].choices.map((c) => [c.name, c.rank, c.day])
    ).toEqual([
      ["Archery", 1, "Wednesday"],
      ["Drama", 2, "Wednesday"],
      ["Swim", 3, "Wednesday"]
    ]);
  });

  it("reads a sheet with no table as nothing, and says so", () => {
    const reading = read(lines("Rank three activities.", "Thank you"));
    expect(reading.campers).toEqual([]);
    expect(reading.notRead).toEqual([{ kind: "sheet", sheet: "choices.csv" }]);
  });

  it("names a planner's camper from the sheet when the page names no one", () => {
    const file = sheetFile("25-planner-one-camper.xlsx");
    file.sheets[0].rows[0] = [];
    const reading = readChoices(file);
    expect(reading.campers.map((c) => c.name)).toEqual(["My week"]);
    expect(reading.toCheck).toEqual([
      expect.objectContaining({ kind: "nameFromSheet", sheet: "My week" })
    ]);
  });
});
