// Per-screen list imports (slice 4c): Locations and Activities, on made-up camps only.
import { buildTerms } from "c/shoreshTerms";
import { csvFile, LEAVE_OUT } from "c/shoreshImportEngine";
import {
  CHANGE,
  KEEP,
  UNUSED,
  changeAllCounts,
  columnKey,
  listPlan,
  listProposal,
  sanitizeCell,
  similarCards,
  questionCards,
  unescapeCell,
  waitingFor,
  listScreen,
  LIST_SCREENS
} from "c/shoreshLists";

const terms = buildTerms([]);
const bunkTerms = buildTerms([
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true },
  { term: "Division", singular: "Unit", plural: "Units", isCustom: true }
]);

function csv(rows) {
  return csvFile(
    "list.csv",
    rows
      .map((r) =>
        r
          .map((c) => (/[,"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c))
          .join(",")
      )
      .join("\n")
  );
}

function setup() {
  return {
    season: { Id: "a00000000000001AAA", Name: "Summer", Camp__c: "c1" },
    weeks: [],
    weekExceptions: [],
    locationTypes: [{ Id: "lt1", Name: "Field" }],
    locations: [
      { Id: "l1", Name: "Gym", GroupsThatFit__c: 2, LocationType__c: null },
      {
        Id: "l2",
        Name: "Pool",
        GroupsThatFit__c: 1,
        LocationType__c: "lt1",
        Notes__c: "Shallow end"
      }
    ],
    activities: [
      {
        Id: "a1",
        Name: "Archery",
        Location__c: "l1",
        Length__c: 1,
        TimesPerWeekMin__c: 3,
        TimesPerWeekMax__c: 3,
        NoWeeklyMax__c: false,
        Priority__c: "Low",
        Outdoor__c: false,
        GroupsAtOnce__c: 1,
        NoGroupLimit__c: false,
        Eligibilities__r: [{ Division__c: "d1" }]
      },
      {
        Id: "a2",
        Name: "Music",
        Length__c: 1,
        TimesPerWeekMin__c: 1,
        TimesPerWeekMax__c: 2,
        NoWeeklyMax__c: false,
        Priority__c: "High",
        Outdoor__c: false,
        GroupsAtOnce__c: 2,
        NoGroupLimit__c: false
      }
    ],
    programs: [
      {
        program: { Id: "p1", Name: "Main" },
        timeBlocks: [],
        divisions: [
          {
            division: { Id: "d1", Name: "Juniors" },
            groups: [
              { Id: "g1", Name: "Bunk 1" },
              { Id: "g2", Name: "Bunk 2" }
            ]
          },
          {
            division: { Id: "d2", Name: "Seniors" },
            groups: [{ Id: "g3", Name: "Bunk 1" }]
          }
        ],
        fixedActivities: [],
        recurringActivities: []
      }
    ],
    schedules: [],
    labels: []
  };
}

function read(screenKey, rows, answers = {}, t = terms, s = setup()) {
  return listProposal({
    screenKey,
    file: csv(rows),
    setup: s,
    terms: t,
    answers
  });
}

function rowNamed(p, name) {
  return p.rows.find((r) => r.name === name);
}

describe("columns", () => {
  it("every heading word belongs to one column only, on every screen", () => {
    LIST_SCREENS.forEach((key) => {
      const seen = new Map();
      listScreen(key, terms).columns.forEach((c) => {
        c.words.forEach((w) => {
          const folded = w.toLowerCase().replace(/[^a-z0-9]/g, "");
          expect([key, seen.get(folded) || c.key]).toEqual([key, c.key]);
          seen.set(folded, c.key);
        });
      });
    });
  });

  it("matches headings in the camp's words and the usual other words, whatever the capitals", () => {
    const p = read(
      "activities",
      [
        [
          "ACTIVITY",
          "place",
          "Times a week: at least",
          "Same unit only",
          "Colour"
        ],
        ["Archery", "Gym", "3", "no", "red"]
      ],
      {},
      bunkTerms
    );
    const byText = Object.fromEntries(
      p.mapping.headings.map((h) => [h.text, h.column])
    );
    expect(byText).toEqual({
      ACTIVITY: "name",
      place: "location",
      "Times a week: at least": "min",
      "Same unit only": "sameDivision",
      Colour: null
    });
    expect(p.mapping.headings.find((h) => h.text === "Colour").how).toBe(
      "unknown"
    );
  });

  it("an unknown column can be pointed at a column, and the choice is remembered", () => {
    const rows = [
      ["Activity", "Colour"],
      ["Archery", "Gym"]
    ];
    const key = columnKey("activities", "Colour");
    const p = read("activities", rows, { [key]: "location" });
    expect(p.mapping.headings[1]).toMatchObject({
      column: "location",
      how: "chosen"
    });
    const plan = listPlan(p, { [key]: "location" }, "s1", "list.csv");
    expect(plan.remember).toContainEqual({ key, answer: "location" });
    const unused = read("activities", rows, { [key]: UNUSED });
    expect(unused.mapping.headings[1].column).toBeNull();
  });

  it("two headings for one column go to neither, and the list waits for a choice", () => {
    const p = read("locations", [
      ["Name", "Capacity", "Groups that fit"],
      ["Gym", "2", "3"]
    ]);
    expect(p.mapping.headings.filter((h) => h.how === "clash")).toHaveLength(2);
    expect(waitingFor(p, terms, {})).toEqual([
      "Nothing to add or change: the list matches what is set up."
    ]);
  });

  it("a list with no name column waits for one", () => {
    const p = read("locations", [
      ["Where", "Capacity"],
      ["Gym", "2"]
    ]);
    expect(p.blocked).toBe(true);
    expect(waitingFor(p, terms, {})[0]).toMatch(/No column is “Location”/);
  });
});

describe("rows", () => {
  it("lists unreadable rows with their reason and leaves them out", () => {
    const p = read("activities", [
      [
        "Activity",
        "Outdoors",
        "Length",
        "Times a week: at least",
        "Times a week: at most"
      ],
      ["Canoeing", "maybe", "1", "1", "1"],
      ["Hiking", "Yes", "two", "1", "1"],
      ["Drama", "No", "1", "3", "2"],
      ["", "Yes", "1", "1", "1"],
      ["Canoeing", "Yes", "1", "1", "1"]
    ]);
    expect(p.rows.map((r) => [r.rowNumber, r.status, r.problems])).toEqual([
      [2, "unreadable", ['Outdoors: "maybe": write Yes or No']],
      [3, "unreadable", ['Length: "two" is not a whole number']],
      [4, "unreadable", ["At most 2 is less than at least 3 times a week"]],
      [5, "unreadable", ["No name"]],
      [6, "new", []]
    ]);
  });

  it("a name written twice: the first row is used and the second says so", () => {
    const p = read("locations", [
      ["Location", "Groups that fit"],
      ["Barn", "1"],
      ["barn", "2"]
    ]);
    expect(p.rows[1]).toMatchObject({
      status: "unreadable",
      problems: ["barn is also on row 2; only row 2 is used"]
    });
  });

  it("reads yes/no words and takes the formula guard off", () => {
    const p = read("activities", [
      ["Activity", "Outdoors", "Notes"],
      ["Hiking", "Y", "'=bring water"],
      ["Chess", "", "'Round the table"]
    ]);
    expect(rowNamed(p, "Hiking").values).toMatchObject({
      outdoors: true,
      notes: "=bring water"
    });
    expect(rowNamed(p, "Chess").values).toMatchObject({
      outdoors: false,
      notes: "'Round the table"
    });
  });
});

describe("matching what is set up", () => {
  it("shows every difference, only for columns the file has", () => {
    const p = read("activities", [
      [
        "Activity",
        "Times a week: at least",
        "Times a week: at most",
        "Location"
      ],
      ["Archery", "2", "2", ""]
    ]);
    const archery = rowNamed(p, "Archery");
    expect(archery.status).toBe("changed");
    expect(
      archery.differences.map((d) => [d.column, d.from, d.to, d.clears])
    ).toEqual([
      ["location", "Gym", null, true],
      ["min", 3, 2, false],
      ["max", 3, 2, false]
    ]);
  });

  it("a row the same as what is set up changes nothing", () => {
    const p = read("activities", [
      ["Activity", "Times a week: at least", "Who can do it"],
      ["Archery", "3", "Juniors"]
    ]);
    expect(rowNamed(p, "Archery").status).toBe("unchanged");
    expect(waitingFor(p, terms, {})).toEqual([
      "Nothing to add or change: the list matches what is set up."
    ]);
  });

  it("Keep or Change for each difference; only the changes are sent", () => {
    const rows = [
      [
        "Activity",
        "Times a week: at least",
        "Times a week: at most",
        "Priority"
      ],
      ["Music", "1", "3", "Low"]
    ];
    const p = read("activities", rows);
    const [max, priority] = rowNamed(p, "Music").differences;
    expect(waitingFor(p, terms, {})).toEqual([
      "2 differences to Keep or Change."
    ]);
    const answers = { [max.id]: CHANGE, [priority.id]: KEEP };
    const done = read("activities", rows, answers);
    expect(waitingFor(done, terms, answers)).toEqual([]);
    expect(listPlan(done, answers, "s1", "list.csv").records).toEqual([
      {
        kind: "Activity",
        id: "a2",
        fields: { NoWeeklyMax__c: false, TimesPerWeekMax__c: 3 },
        refs: {}
      }
    ]);
  });

  it("Change all counts the changes and how many clear a value", () => {
    const p = read("activities", [
      ["Activity", "Location", "Notes", "Times a week: at least"],
      ["Archery", "", "", "2"],
      ["Music", "Gym", "Bring a song", "1"]
    ]);
    expect(changeAllCounts(p)).toMatchObject({ changes: 4, clears: 1 });
  });

  it("refuses changes that would leave at most below at least", () => {
    const rows = [
      ["Activity", "Times a week: at least", "Times a week: at most"],
      ["Archery", "4", "4"]
    ];
    const p = read("activities", rows);
    const [min, max] = rowNamed(p, "Archery").differences;
    const answers = { [min.id]: CHANGE, [max.id]: KEEP };
    expect(
      waitingFor(read("activities", rows, answers), terms, answers)
    ).toEqual([
      "Archery: at most 3 would be less than at least 4 times a week. Change both, or keep both."
    ]);
  });

  it("who can do it: names of divisions and groups, with the ones two records share written out", () => {
    const p = read("activities", [
      ["Activity", "Who can do it"],
      ["Archery", "Seniors, Bunk 2"],
      ["Drama", "Bunk 1"],
      ["Chess", "Bunk 1 (Seniors)"],
      ["Golf", "Everyone"],
      ["Pottery", "Middlers"]
    ]);
    expect(rowNamed(p, "Archery").differences[0]).toMatchObject({
      from: ["d1"],
      to: ["d2", "g2"]
    });
    expect(rowNamed(p, "Drama").problems[0]).toBe(
      'Who can do it: "Bunk 1" could be 2 different ones: write "Bunk 1 (Juniors)" or "Bunk 1 (Seniors)"'
    );
    expect(rowNamed(p, "Chess").values.who).toEqual(["g3"]);
    expect(rowNamed(p, "Golf").values.who).toEqual([]);
    expect(rowNamed(p, "Pottery").status).toBe("asked");
  });
});

describe("similar names and what will also be added", () => {
  it("asks about a name like one set up, and uses the answer", () => {
    const rows = [
      ["Activity", "Times a week: at least"],
      ["Musik", "2"]
    ];
    const p = read("activities", rows);
    expect(rowNamed(p, "Musik").status).toBe("asked");
    const [card] = similarCards(p, terms, {});
    expect(card.title).toBe("Are “Musik” and “Music” the same activity?");
    const same = read("activities", rows, { [card.id]: "b" });
    expect(rowNamed(same, "Musik")).toMatchObject({
      status: "changed",
      id: "a2"
    });
    const different = read("activities", rows, { [card.id]: "different" });
    expect(rowNamed(different, "Musik").status).toBe("new");
    const out = read("activities", rows, { [card.id]: LEAVE_OUT });
    expect(rowNamed(out, "Musik").status).toBe("leftOut");
    expect(listPlan(out, { [card.id]: LEAVE_OUT }, "s1", "f").forget).toEqual([
      card.id
    ]);
  });

  it("a location the season doesn't have will also be added; a similar one is asked", () => {
    const rows = [
      ["Activity", "Location"],
      ["Canoeing", "Lake"],
      ["Hockey", "Poool"]
    ];
    const p = read("activities", rows);
    expect(p.alsoAdd.location).toEqual(["Lake"]);
    const card = similarCards(p, terms, {}).find((c) =>
      c.title.includes("Poool")
    );
    const answers = { [card.id]: "b" };
    const done = read("activities", rows, answers);
    const plan = listPlan(done, answers, "s1", "f");
    expect(
      plan.records.map((r) => [
        r.kind,
        r.key || r.id,
        (r.refs || {}).Location__c
      ])
    ).toEqual([
      ["Location", "Location:Lake", undefined],
      ["Activity", "Activity:Canoeing", "Location:Lake"],
      ["Activity", "Activity:Hockey", "l2"]
    ]);
  });

  it("a new activity takes the defaults for columns the file doesn't have", () => {
    const p = read("activities", [
      ["Activity", "Times a week: at least"],
      ["Canoeing", "3"]
    ]);
    const plan = listPlan(p, {}, "s1", "f");
    expect(plan.records[0]).toEqual({
      kind: "Activity",
      key: "Activity:Canoeing",
      fields: {
        Name: "Canoeing",
        Length__c: 1,
        TimesPerWeekMin__c: 3,
        NoWeeklyMax__c: false,
        TimesPerWeekMax__c: 3,
        Priority__c: "Low",
        Outdoor__c: false,
        NoGroupLimit__c: false,
        GroupsAtOnce__c: 1,
        SameDivisionOnly__c: false,
        EarlyWeekCount__c: null,
        EarlyWeekByDay__c: null,
        Notes__c: null
      },
      refs: { Location__c: null, RainPlan__c: null },
      who: []
    });
  });

  it("a rain plan can name an activity in the same file, never itself or one nowhere", () => {
    const p = read("activities", [
      ["Activity", "Rain plan"],
      ["Canoeing", "Board games"],
      ["Board games", "Board games"],
      ["Hiking", "Movies"]
    ]);
    expect(rowNamed(p, "Board games").problems).toEqual([
      "Rain plan: can't be itself"
    ]);
    expect(rowNamed(p, "Hiking").status).toBe("asked");
    expect(rowNamed(p, "Canoeing").status).toBe("new");
  });

  it("locations: a new location type will also be added", () => {
    const p = read("locations", [
      ["Location", "Location type", "Groups that fit"],
      ["Barn", "Indoors", "2"],
      ["Pool", "Field", ""]
    ]);
    expect(p.alsoAdd.locationType).toEqual(["Indoors"]);
    expect(rowNamed(p, "Pool").status).toBe("unchanged");
  });
});

describe("the formula guard", () => {
  it("puts an apostrophe before text that a spreadsheet would run, and takes it off again", () => {
    ["=1+1", "+44", "-3", "@sum", "\tx"].forEach((text) => {
      expect(sanitizeCell(text)).toBe(`'${text}`);
      expect(unescapeCell(sanitizeCell(text))).toBe(text);
    });
    expect(sanitizeCell("Gym")).toBe("Gym");
    expect(sanitizeCell(-3)).toBe(-3);
  });
});

describe("names that aren't set up are added, after asking (Greg, 2026-10-17)", () => {
  it("a who name is asked about, then added as the director says", () => {
    const rows = [
      ["Activity", "Who can do it"],
      ["Pottery", "Middlers, Bunk 2"]
    ];
    const p = read("activities", rows);
    const card = questionCards(p, terms, {}).find((c) =>
      c.id.startsWith("whoAdd|")
    );
    expect(card.title).toBe("“Middlers” isn't set up. What is it?");
    expect(card.options.map((o) => o.value)).toEqual([
      "division|Main",
      "group|Main|Juniors",
      "group|Main|Seniors",
      LEAVE_OUT
    ]);
    const answers = { [card.id]: "group|Main|Seniors" };
    const done = read("activities", rows, answers);
    expect(rowNamed(done, "Pottery").status).toBe("new");
    expect(done.alsoAdd.who).toEqual([
      {
        kind: "Group",
        key: "Group:d2:Middlers",
        name: "Middlers",
        parentId: "d2"
      }
    ]);
    const plan = listPlan(done, answers, "s1", "f");
    expect(plan.records[0]).toEqual({
      kind: "Group",
      key: "Group:d2:Middlers",
      fields: { Name: "Middlers", Availability__c: "AllDay" },
      refs: { Division__c: "d2" }
    });
    expect(plan.records[1].who).toEqual(["Group:d2:Middlers", "g2"]);
    expect(plan.remember).toContainEqual({
      key: card.id,
      answer: "group|Main|Seniors"
    });
    const out = read("activities", rows, { [card.id]: LEAVE_OUT });
    expect(rowNamed(out, "Pottery").status).toBe("leftOut");
  });

  it("a rain plan that is nowhere is added, asking only its length", () => {
    const rows = [
      ["Activity", "Rain plan"],
      ["Hiking", "Movies"]
    ];
    const p = read("activities", rows);
    const card = questionCards(p, terms, {}).find((c) => c.lengthQuestion);
    expect(card.title).toBe(
      "“Movies” isn't set up. It will be added as activity: how long is it?"
    );
    expect(waitingFor(p, terms, {})).toEqual(["1 question to answer."]);
    const answers = { [card.id]: "2" };
    const done = read("activities", rows, answers);
    expect(done.alsoAdd.activity).toEqual([{ name: "Movies", length: 2 }]);
    const plan = listPlan(done, answers, "s1", "f");
    expect(
      plan.records.map((r) => [
        r.key,
        r.fields.Length__c,
        r.fields.TimesPerWeekMin__c,
        r.refs.RainPlan__c
      ])
    ).toEqual([
      ["Activity:Movies", 2, 1, null],
      ["Activity:Hiking", 1, 1, "Activity:Movies"]
    ]);
    expect(plan.remember).toEqual([]);
  });
});
