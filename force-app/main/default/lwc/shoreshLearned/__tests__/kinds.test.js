import { buildTerms } from "c/shoreshTerms";
import { describe as kindOf, keyParts } from "../kinds";
import {
  learnedGroups,
  learnedRow,
  matches,
  shortDate,
  speller
} from "../view";

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
    ["kind|Lunch", "fixed", "classify", "Lunch: A fixed activity", 3],
    ["kind|Swim|Main", "activity", "classify", "Swim (Main): An activity", 3],
    [
      "similar|activity|archery|archry|Archery|Archry",
      "different",
      "split",
      "“Archery” and “Archry”: Different: keep both",
      2
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
      "Archery: Times per week: 2 or more",
      0
    ],
    ["program|Group A,Group B", "Main", "other", "Group A, Group B: Main", 0],
    [
      "whoAdd|main|cits",
      "division|Main",
      "other",
      "cits: A division in Main",
      0
    ],
    ["unknown|thing", "x", "other", "thing: x", 0]
  ])("%s answered %s", (question, answer, group, title, choices) => {
    const r = row(question, answer);
    expect(r.group).toBe(group);
    expect(r.title).toBe(title);
    expect(r.choices).toHaveLength(choices);
  });

  it("offers the same choices the server accepts", () => {
    expect(
      kindOf("kind|Lunch", "fixed", t).choices.map((c) => c.value)
    ).toEqual(["fixed", "recurring", "activity"]);
    expect(
      kindOf("similar|g|a|b|A|B", "a", t).choices.map((c) => c.value)
    ).toEqual(["a", "different"]);
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
  it("says who answered and when", () => {
    expect(row("kind|Lunch", "fixed").who).toBe("Answered by you on 3 Jul");
    expect(row("kind|Lunch", "fixed", { byYou: false }).who).toBe(
      "Answered by Dana on 3 Jul"
    );
    expect(row("deleted|Activity||Riflery", "deleted").who).toBe(
      "Deleted by you on 3 Jul"
    );
    expect(shortDate("bad")).toBe("");
  });

  it("orders groups as the desktop does, rows newest first", () => {
    const rows = [
      row("deleted|Activity||A", "deleted"),
      row("kind|Old", "fixed", { answeredOn: "2026-06-01" }),
      row("kind|New", "fixed", { answeredOn: "2026-07-09" })
    ];
    const groups = learnedGroups(rows);
    expect(groups.map((g) => g.label)).toEqual([
      "Classification",
      "Things you deleted"
    ]);
    expect(groups[0].rows.map((r) => r.name)).toEqual(["New", "Old"]);
  });

  it("matches the title or who answered", () => {
    const r = row("kind|Lunch", "fixed", { byYou: false });
    expect(matches(r, "lunch")).toBe(true);
    expect(matches(r, "dana")).toBe(true);
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
