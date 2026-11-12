import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";
import { mergesFrom, similarPairs } from "c/shoreshImportEngine";
import { describe as kindOf, keyParts } from "../kinds";
import { shortDate } from "c/shoreshTerms";
import { learnedRow, matches, speller } from "../view";

const t = buildTerms([
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true }
]);

const row = (question, answer, extra = {}) =>
  learnedRow(
    {
      id: question,
      question,
      answer,
      byYou: true,
      byName: "Dana",
      answeredOn: "2026-07-03",
      ...extra
    },
    t
  );

describe("each remembered question in camp words", () => {
  it.each([
    ["kind|Lunch", "fixed", "classify", "Lunch is a fixed activity", 3],
    ["kind|Swim|Main", "activity", "classify", "Swim (Main) is an activity", 3],
    [
      "similar|activity|archery|archry|Archery|Archry",
      "different",
      "split",
      "“Archery” and “Archry”: Different: keep both",
      3
    ],
    [
      "list|Art / Music",
      "several",
      "split",
      "Art / Music: Split into choices",
      2
    ],
    [
      "change|activity|Archery|2",
      "keep",
      "value",
      "Archery: Kept the current value",
      2
    ],
    [
      "change|block|Main|Period 1|9:00-9:45",
      "keep",
      "value",
      "Main, Period 1: Kept the current value",
      0
    ],
    ["ampm|5:00|Dinner", "evening", "value", "Dinner: In the evening", 2],
    ["tueThu|main|swim", "Tuesday", "value", "swim: Tuesday", 2],
    [
      "programDay|main|Saturday",
      "drop",
      "value",
      "main on Saturday: Without Saturday",
      2
    ],
    [
      "choiceName|pottery",
      "same|Pottery",
      "pref_label",
      "pottery: Read as Pottery",
      0
    ],
    [
      "columns|electives|first choice",
      "unused",
      "pref_columns",
      "first choice: Not used",
      0
    ],
    [
      "deleted|Activity||Riflery",
      "deleted",
      "deleted",
      "Riflery: Activity deleted",
      0
    ],
    [
      "deleted|Group|Main|Bunk 3",
      "deleted",
      "deleted",
      "Bunk 3 (Main): Bunk deleted",
      0
    ],
    [
      "guessed|a0S|Activity||Archery|often",
      "2-none",
      "guessed",
      "Archery: 2 or more a week",
      0
    ],
    // Word walk 2026-11-12: "1 a week", never "1–1"; a unit on the count.
    [
      "guessed|a0S|Activity||Boating|often",
      "1-1",
      "guessed",
      "Boating: 1 a week",
      0
    ],
    [
      "guessed|a0S|Activity||Swim|often",
      "2-3",
      "guessed",
      "Swim: 2–3 a week",
      0
    ],
    [
      "guessed|a0S|Activity||Swim|who",
      "everyone",
      "guessed",
      "Swim: Who: Everyone",
      0
    ],
    // A cell two files disagree about: no leading comma when the file named no week.
    [
      "cross||Bunk 3|Tuesday|name:period 2",
      "Soccer",
      "value",
      "Bunk 3, Tuesday, period 2: Soccer",
      0
    ],
    [
      "cross|Week 1|Bunk 3|Tuesday|590-635",
      "Soccer",
      "value",
      "Week 1, Bunk 3, Tuesday, 9:50 AM–10:35 AM: Soccer",
      0
    ],
    // The week question of a file that names no week says whose schedule it was.
    [
      "week|the file's week",
      "Week 1",
      "other",
      "Last year's schedule: Week 1",
      0
    ],
    ["program|Group A,Group B", "Main", "other", "Group A, Group B: Main", 0],
    [
      "whoAdd|main|cits",
      "division|Main",
      "other",
      "cits is a division in Main",
      0
    ],
    ["unknown|thing", "x", "other", "thing: x", 0]
  ])("%s answered %s", (question, answer, group, title, choices) => {
    const r = row(question, answer);
    expect(r.group).toBe(group);
    expect(r.title).toBe(title);
    expect(r.choices).toHaveLength(choices);
  });

  // MEMO-4.4
  it("offers the same choices the server accepts", () => {
    expect(
      kindOf("kind|Lunch", "fixed", t).choices.map((c) => c.value)
    ).toEqual(["fixed", "recurring", "activity"]);
    expect(
      kindOf("similar|g|a|b|A|B", "a", t).choices.map((c) => c.value)
    ).toEqual(["a", "b", "different"]);
  });

  it("names a cell's time block, and who, as the camp writes them now", () => {
    const setup = {
      programs: [
        {
          program: nsRecord({ Id: "p1", Name: "Main" }),
          divisions: [{ division: nsRecord({ Id: "d1", Name: "Seniors" }) }],
          timeBlocks: [
            nsRecord({
              Id: "b2",
              Name: "Period 2",
              StartTime__c: 590 * 60000,
              EndTime__c: 635 * 60000
            })
          ]
        }
      ]
    };
    const spell = speller(setup);
    const at = (question, answer) =>
      learnedRow({ id: "x", question, answer, byYou: true }, t, spell).title;
    expect(at("cross||Bunk 3|Tuesday|590-635", "Soccer")).toBe(
      "Bunk 3, Tuesday, Period 2: Soccer"
    );
    expect(at("guessed|a0S|Activity||Boating|who", "main/seniors")).toBe(
      "Boating: Who: Seniors (Main)"
    );
  });

  it("says plainly what forgetting means", () => {
    expect(row("kind|Lunch", "fixed").forgotten).toBe(
      "Shoresh will ask this question again."
    );
    expect(row("deleted|Activity||Riflery", "deleted").forgotten).toBe(
      "It can come back next import."
    );
  });

  it("reads escaped parts as written", () => {
    expect(keyParts("dash|main|a\\|b|M-W")).toEqual([
      "dash",
      "main",
      "a|b",
      "M-W"
    ]);
  });
});

describe("who, when, groups and search", () => {
  // MEMO-6.2
  it("says who answered and when", () => {
    expect(row("kind|Lunch", "fixed").who).toBe("Answered by you on Jul 3");
    expect(row("kind|Lunch", "fixed", { byYou: false }).who).toBe(
      "Answered by Dana on Jul 3"
    );
    expect(row("deleted|Activity||Riflery", "deleted").who).toBe(
      "Deleted by you on Jul 3"
    );
    expect(shortDate("bad")).toBe("");
  });

  // MEMO-6.2
  it("says a former user when whoever answered is no longer here", () => {
    const former = { byYou: false, byName: null };
    expect(row("kind|Lunch", "fixed", former).who).toBe(
      "Answered by a former user on Jul 3"
    );
    expect(row("deleted|Activity||Riflery", "deleted", former).who).toBe(
      "Deleted by a former user on Jul 3"
    );
    expect(row("guessed|a0S|Activity||Archery|often", "3", former).who).toBe(
      "Guessed in an import on Jul 3"
    );
  });

  it("matches a line's what, how, when or mark", () => {
    const r = {
      title: "Lunch is a fixed activity",
      how: "Answered as before · Dana",
      when: "Jul 3",
      flag: "Updated"
    };
    expect(matches(r, "lunch")).toBe(true);
    expect(matches(r, "dana")).toBe(true);
    expect(matches(r, "jul 3")).toBe(true);
    expect(matches(r, "updated")).toBe(true);
    expect(matches(r, "swim")).toBe(false);
  });
});

describe("names as the camp writes them now", () => {
  const spell = speller({
    programs: [
      {
        program: { Name: "Main" },
        divisions: [
          { division: { Name: "Juniors" }, groups: [{ Name: "Bunk 3" }] }
        ]
      }
    ],
    locations: [{ Name: "Big Pool" }]
  });

  it("matches ignoring capitals and spacing, else keeps what is stored", () => {
    expect(spell("big  pool")).toBe("Big Pool");
    expect(spell("bunk 3")).toBe("Bunk 3");
    expect(spell("archery")).toBe("archery");
    expect(speller(undefined)("swim")).toBe("swim");
  });

  it("spells every name in the title", () => {
    const r = learnedRow(
      {
        id: "1",
        question: "programDay|main|Saturday",
        answer: "add",
        answeredOn: "2026-07-03"
      },
      t,
      spell
    );
    expect(r.title).toBe("Main on Saturday: Added Saturday");
  });
});

describe("similar names: each choice keeps what the import keeps", () => {
  it.each([
    [["Archry", "Archery"]],
    [["archery", "Archery"]],
    [["Kayaks", "Kayak"]]
  ])("%j", (names) => {
    const [pair] = similarPairs(
      "activity",
      names.map((name) => ({ name, count: 1 })),
      []
    );
    const kind = kindOf(pair.id, "a", t);
    for (const choice of kind.choices.filter((c) => c.value !== "different")) {
      const merged = mergesFrom([pair], { [pair.id]: choice.value });
      const kept = names.find((n) => !merged.has(n));
      expect(choice.label).toBe(`Same: keep “${kept}”`);
    }
    expect(mergesFrom([pair], { [pair.id]: "different" }).size).toBe(0);
  });

  it("offers one Same, the camp's spelling, when one name is already the camp's", () => {
    const spell = speller({ activities: [{ Name: "Archery" }] });
    const r = learnedRow(
      {
        id: "1",
        question: "similar|activity|archery|archry|Archery|Archry",
        answer: "b",
        answeredOn: "2026-07-03"
      },
      t,
      spell
    );
    expect(r.choices.map((c) => [c.value, c.label])).toEqual([
      ["b", "Same: keep “Archery”"],
      ["different", "Different: keep both"]
    ]);
    expect(r.title).toBe("“Archery” and “Archry”: Same: keep “Archery”");
    // The import with Archery set up: either "same" keeps the camp's spelling.
    const [pair] = similarPairs(
      "activity",
      [{ name: "Archry", count: 1 }],
      ["Archery"]
    );
    expect(pair.id).toBe("similar|activity|archery|archry|Archery|Archry");
    expect(mergesFrom([pair], { [pair.id]: "b" }).get("Archry")).toBe(
      "Archery"
    );
  });

  it("shows the pair's names as the file wrote them, never the camp's spelling", () => {
    const spell = speller({ activities: [{ Name: "ARCHERY" }] });
    const r = learnedRow(
      {
        id: "1",
        question: "similar|activity|archery|archry|Archery|Archry",
        answer: "b",
        answeredOn: "2026-07-03"
      },
      t,
      spell
    );
    expect(r.name).toBe("“Archery” and “Archry”");
  });
});

// MEMO-6.3
describe("never an Id or an internal name", () => {
  it("names the item and its weeks for runs-in", () => {
    const spell = speller({
      weeks: [
        { Id: "a0W000000000001AAA", Name: "Week 1" },
        { Id: "a0W000000000002AAA", Name: "Week 2" }
      ],
      activities: [{ Id: "a0A000000000001AAA", Name: "Archery" }]
    });
    const runsIn = (question) =>
      learnedRow(
        { id: "1", question, answer: "keep", answeredOn: "2026-07-03" },
        t,
        spell
      );
    expect(
      runsIn(
        "change|runsIn|a0A000000000001AAA|a0W000000000001AAA,a0W000000000002AAA"
      ).title
    ).toBe("Archery, off in Week 1, Week 2: Kept the current value");
    expect(
      runsIn("change|runsIn|a0A00000000009XAAA|a0W00000000009XAAA").title
    ).toBe("An item, weeks it runs in: Kept the current value");
    expect(runsIn("change|runsIn|Activity:new:Pottery|").title).toBe(
      "Pottery, weeks it runs in: Kept the current value"
    );
  });

  it("names a deleted kind in the camp's words", () => {
    expect(row("deleted|LocationType||Field", "deleted").title).toBe(
      "Field: Location type deleted"
    );
    expect(row("deleted|ProgramGroup|Main|Bunk 3", "deleted").title).toBe(
      "Bunk 3 (Main): Bunk deleted"
    );
  });
});

// DIV-1.1
describe("a group in no division", () => {
  it("its holding record is not a name the camp has set up", () => {
    const spell = speller(
      nsRecord({
        programs: [
          {
            program: { Name: "Main" },
            divisions: [
              {
                division: { Id: "d9", Name: "Tent 1", NoDivision__c: true },
                groups: [{ Id: "g9", Name: "Tent 1" }]
              }
            ]
          }
        ]
      })
    );
    expect(spell.nameOf("d9")).toBeNull();
    expect(spell.nameOf("g9")).toBe("Tent 1");
  });
});
