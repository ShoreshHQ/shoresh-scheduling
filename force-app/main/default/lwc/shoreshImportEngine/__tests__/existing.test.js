import {
  buildProposal,
  LEAVE_OUT,
  planFor,
  questionCards,
  foundLists,
  importNotes
} from "./data/engine";
import {
  csv,
  existingSetup,
  program,
  samples,
  terms,
  findSamplesFrom
} from "./data/samples";

findSamplesFrom(__dirname);

const at = (h, m = 0) => h * 60 + m;
const MAPLE_BLOCKS = [
  ["tb1", "Period 1", at(9), at(9, 45)],
  ["tb2", "Period 2", at(9, 50), at(10, 35)],
  ["tb3", "Period 3", at(10, 40), at(11, 25)],
  ["tb4", "Lunch", at(11, 30), at(12, 15)],
  ["tb5", "Period 4", at(12, 20), at(13, 5)],
  ["tb6", "Period 5", at(13, 10), at(13, 55)],
  ["tb7", "Period 6", at(14), at(14, 45)]
];

function propose(existing, answers = {}, files = samples("all-camp")) {
  return buildProposal({ files, existing, terms, answers });
}

function cardsOf(p, answers = {}) {
  return questionCards(p, terms, answers).filter(
    (c) => c.stage === "review" || c.select
  );
}

describe("adding to a season that has setup already", () => {
  it("matches programs, time blocks, divisions, and groups by name and time, and adds only the rest", () => {
    const existing = existingSetup({
      programs: [
        program("p1", "Main", {
          blocks: MAPLE_BLOCKS,
          divisions: [
            [
              "d1",
              "Juniors",
              [
                ["g1", "Bunk 1"],
                ["g2", "Bunk 2"]
              ]
            ]
          ]
        })
      ]
    });
    const p = propose(existing);
    expect(p.timetables[0].program.id).toBe("p1");
    expect(p.timetables[0].blocks.every((b) => b.id && !b.isNew)).toBe(true);
    const plan = planFor(p, existing, "season1");
    expect(plan.programs).toEqual([]);
    expect(plan.timeBlocks).toEqual([]);
    expect(plan.divisions.map((d) => d.name)).toEqual(["Seniors"]);
    expect(plan.groups.map((g) => [g.name, g.divisionKey])).toEqual([
      ["Bunk 3", "d1"],
      ["Bunk 4", "D|p1|Seniors"],
      ["Bunk 5", "D|p1|Seniors"],
      ["Bunk 6", "D|p1|Seniors"]
    ]);
    expect(plan.fixedActivities).toEqual([
      {
        key: "F|p1|Lunch",
        id: null,
        programKey: "p1",
        name: "Lunch",
        blockKey: "tb4",
        length: 1,
        locationKey: null
      }
    ]);
  });

  it("asks before changing a time block's times, and changes it only if told to", () => {
    const blocks = MAPLE_BLOCKS.map((b) => {
      return b[0] === "tb1" ? ["tb1", "Period 1", at(9), at(9, 50)] : b;
    });
    const existing = existingSetup({
      programs: [program("p1", "Main", { blocks })]
    });
    const p = propose(existing);
    const [card] = cardsOf(p).filter((c) => c.id.startsWith("change|block"));
    expect(card.title).toBe(
      "Main: Period 1 is set up as 9:00–9:50. The file has 9:00–9:45."
    );
    expect(card.options.map((o) => o.value)).toEqual([
      "keep",
      "change",
      LEAVE_OUT
    ]);
    expect(
      planFor(propose(existing, { [card.id]: "keep" }), existing, "s")
        .timeBlocks
    ).toEqual([]);
    expect(
      planFor(propose(existing, { [card.id]: "change" }), existing, "s")
        .timeBlocks
    ).toEqual([
      {
        key: "tb1",
        id: "tb1",
        start: "09:00",
        end: "09:45"
      }
    ]);
    const left = propose(existing, { [card.id]: LEAVE_OUT });
    expect(left.leftOutCells.some((c) => c.blockKey === "540-585")).toBe(true);
    expect(left.recurring.map((r) => r.name)).not.toContain("Morning meeting");
  });

  it("asks which program when the camp has several and the groups are new", () => {
    const existing = existingSetup({
      programs: [
        program("p1", "Juniors camp", { blocks: MAPLE_BLOCKS }),
        program("p2", "Seniors camp")
      ]
    });
    const p = propose(existing);
    const card = cardsOf(p).find((c) => c.id.startsWith("program|"));
    expect(card.options.map((o) => o.label)).toEqual([
      "Juniors camp",
      "Seniors camp",
      "A new program",
      "Leave these groups out for now"
    ]);
    const chosen = propose(existing, { [card.id]: "Juniors camp" });
    expect(chosen.timetables[0].program.id).toBe("p1");
    const fresh = planFor(
      propose(existing, { [card.id]: "new" }),
      existing,
      "s"
    );
    expect(fresh.programs.map((x) => x.name)).toEqual(["Program 3"]);
    const left = propose(existing, { [card.id]: LEAVE_OUT });
    expect(planFor(left, existing, "s").groups).toEqual([]);
  });

  it("asks before adding days to a program", () => {
    const existing = existingSetup({
      programs: [
        program("p1", "Main", {
          blocks: MAPLE_BLOCKS,
          days: ["Monday", "Tuesday", "Wednesday", "Thursday"]
        })
      ]
    });
    const card = cardsOf(propose(existing)).find((c) =>
      c.id.startsWith("change|days")
    );
    expect(card.title).toBe(
      "Main runs Monday, Tuesday, Wednesday, and Thursday. The file also has Friday."
    );
    const plan = planFor(
      propose(existing, { [card.id]: "change" }),
      existing,
      "s"
    );
    expect(plan.programs).toEqual([
      {
        key: "p1",
        id: "p1",
        name: "Main",
        days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        sortOrder: null
      }
    ]);
    expect(
      planFor(propose(existing, { [card.id]: "keep" }), existing, "s").programs
    ).toEqual([]);
  });

  it("keeps what is set up for a name already there, and asks where the file disagrees", () => {
    const existing = existingSetup({
      programs: [
        program("p1", "Main", {
          blocks: MAPLE_BLOCKS,
          fixed: [
            { Id: "f1", Name: "Lunch", TimeBlock__c: "tb5", Length__c: 1 }
          ]
        })
      ],
      activities: [{ Id: "a1", Name: "Boating", Length__c: 1 }]
    });
    const p = propose(existing);
    const lunch = cardsOf(p).find((c) => c.id.startsWith("change|fixed"));
    expect(lunch.title).toBe(
      "“Lunch” is set up at Period 4. The file has it at Lunch."
    );
    const boating = cardsOf(p).find((c) => c.id.startsWith("change|activity"));
    expect(boating.title).toBe(
      "“Boating” is set up as 1 time block long. In the file it runs 2 time blocks."
    );
    expect(boating.options.map((o) => o.label)).toEqual([
      "Keep 1 time block",
      "Change it to 2 time blocks",
      "Leave it out for now"
    ]);
    const plan = planFor(
      propose(existing, { [lunch.id]: "change", [boating.id]: "keep" }),
      existing,
      "s"
    );
    expect(plan.fixedActivities).toEqual([
      { id: "f1", blockKey: "tb4", length: 1 }
    ]);
    expect(plan.activities.find((a) => a.id === "a1")).toBeUndefined();
    expect(plan.activities.map((a) => a.name)).not.toContain("Boating");
  });

  it("raises a file name close to one the camp has, and uses the camp's when told they are the same", () => {
    const existing = existingSetup({
      programs: [program("p1", "Main", { blocks: MAPLE_BLOCKS })],
      activities: [{ Id: "a1", Name: "Music", Length__c: 1 }]
    });
    const p = propose(existing);
    const card = questionCards(p, terms, {}).find(
      (c) => c.stage === "preview" && c.subject === "Musik"
    );
    expect(card.options.map((o) => o.label)).toEqual([
      "Same: use “Music”",
      "Different: add “Musik”",
      "Leave it out for now"
    ]);
    const same = planFor(propose(existing, { [card.id]: "b" }), existing, "s");
    expect(same.activities.map((a) => a.name)).not.toContain("Musik");
    expect(same.activities.map((a) => a.name)).not.toContain("Music");
  });

  it("asks which division a new group goes in when the file does not say", () => {
    const existing = existingSetup({
      programs: [
        program("p1", "Main", {
          blocks: MAPLE_BLOCKS,
          divisions: [
            ["d1", "Juniors", []],
            ["d2", "Seniors", []]
          ]
        })
      ]
    });
    const p = propose(existing, {}, samples("Bunk"));
    const cards = cardsOf(p).filter((c) => c.id.startsWith("division|"));
    expect(cards.map((c) => c.subject)).toEqual([
      "Bunk 1",
      "Bunk 2",
      "Bunk 3",
      "Bunk 4",
      "Bunk 5",
      "Bunk 6"
    ]);
    expect(cards[0].options.map((o) => o.value)).toEqual([
      "Juniors",
      "Seniors",
      LEAVE_OUT
    ]);
    const answers = Object.fromEntries(
      cards.map((c, i) => [c.id, i < 3 ? "Juniors" : "Seniors"])
    );
    const plan = planFor(
      propose(existing, answers, samples("Bunk")),
      existing,
      "s"
    );
    expect(plan.divisions).toEqual([]);
    expect(plan.groups.map((g) => g.divisionKey)).toEqual([
      "d1",
      "d1",
      "d1",
      "d2",
      "d2",
      "d2"
    ]);
  });
});

describe("what the save sends", () => {
  it("a new camp: everything in the order it depends on, pointing by key", () => {
    const p = propose(existingSetup());
    const pair = p.reading.pairs[0];
    const answered = propose(existingSetup(), {
      [pair.id]: "a",
      "kind|Library time": "recurring"
    });
    const plan = planFor(answered, existingSetup(), "season1");
    expect(plan.seasonId).toBe("season1");
    expect(plan.programs).toEqual([
      {
        key: "P0",
        id: null,
        name: "Main",
        days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        sortOrder: 1
      }
    ]);
    expect(plan.timeBlocks).toHaveLength(7);
    expect(plan.timeBlocks[4]).toEqual({
      key: "B|P0|740-785",
      id: null,
      programKey: "P0",
      name: "Period 4",
      start: "12:20",
      end: "13:05",
      partOfDay: "Afternoon",
      sortOrder: 5
    });
    expect(plan.divisions.map((d) => d.name)).toEqual(["Juniors", "Seniors"]);
    expect(plan.groups.map((g) => g.name)).toEqual([
      "Bunk 1",
      "Bunk 2",
      "Bunk 3",
      "Bunk 4",
      "Bunk 5",
      "Bunk 6"
    ]);
    expect(plan.activities.map((a) => a.name)).toEqual([
      "Archery",
      "Art",
      "Boating",
      "Gym games",
      "Music",
      "Soccer",
      "Swim"
    ]);
    expect(plan.fixedActivities).toEqual([
      {
        key: "F|P0|Lunch",
        id: null,
        programKey: "P0",
        name: "Lunch",
        blockKey: "B|P0|690-735",
        length: 1,
        locationKey: null
      }
    ]);
    expect(
      plan.recurringActivities.map((r) => [r.name, r.days, r.who])
    ).toEqual([
      ["Library time", ["Wednesday"], ["D|P0|Juniors"]],
      ["Morning meeting", ["Monday"], []]
    ]);
  });

  it("places named in the file are added only when ticked, with room for everyone there at once", () => {
    const rows = [["Time", "Bunk 1", "Bunk 2", "Bunk 3"]];
    rows.push(["9:00-9:45", "Swim (Pool)", "Swim (Pool)", "Art (Art room)"]);
    rows.push([
      "12:00-12:45",
      "Lunch (Dining hall)",
      "Lunch (Dining hall)",
      "Lunch (Dining hall)"
    ]);
    const files = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map(
      (d) => csv(`${d}.csv`, rows)
    );
    const p = propose(existingSetup(), {}, files);
    expect(p.offeredPlaces.map((x) => [x.name, x.ticked])).toEqual([
      ["Art room", false],
      ["Dining hall", false],
      ["Pool", false]
    ]);
    expect(planFor(p, existingSetup(), "s").locations).toEqual([]);
    const ticked = propose(
      existingSetup(),
      { "place|Dining hall": "add" },
      files
    );
    const plan = planFor(ticked, existingSetup(), "s");
    expect(plan.locations).toEqual([
      { key: "L|Dining hall", id: null, name: "Dining hall", groupsThatFit: 3 }
    ]);
    expect(plan.fixedActivities[0].locationKey).toBe("L|Dining hall");
  });

  it("the lists and notes speak the camp's words", () => {
    const p = propose(existingSetup());
    const lists = foundLists(p, terms);
    expect(lists.map((l) => l.key)).toEqual([
      "programs",
      "timeBlocks",
      "groups",
      "fixedActivities",
      "recurringActivities",
      "activities",
      "noted"
    ]);
    const noted = lists.find((l) => l.key === "noted");
    expect(noted.items.map((i) => i.detail)).toEqual([
      "Special day, Friday, 6 groups",
      "Trip, Thursday, 3 groups"
    ]);
    expect(importNotes(p, terms).map((n) => n.key)).toContain("rules");
  });
});

describe("review findings", () => {
  const times = ["9:00-9:45", "9:50-10:35", "12:00-12:45"];
  const other = ["9:00-9:50", "9:55-10:40", "12:00-12:45"];
  const day = (rows, groups) => (name) =>
    csv(`${name}.csv`, [
      ["Time", ...groups],
      ...rows.map((b, i) => [
        b,
        ...groups.map((g, gi) => {
          return i === 2 ? "Lunch" : ["Swim", "Art", "Soccer"][(gi + i) % 3];
        })
      ])
    ]);
  const week = (rows, groups, prefix) =>
    ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((d) =>
      day(rows, groups)(`${prefix} ${d}`)
    );
  const blocksOf = (rows) =>
    rows.map((r, i) => {
      const [a, b] = r.split("-").map((x) => {
        const [h, m] = x.split(":").map(Number);
        return (h < 7 ? h + 12 : h) * 60 + m;
      });
      return [`b${i}`, `Period ${i + 1}`, a, b];
    });

  it("two timetables never share one existing program on their own (finding 2)", () => {
    const existing = existingSetup({
      programs: [
        program("p1", "Main", {
          blocks: blocksOf(times),
          divisions: [["d1", "Juniors", [["g1", "Bunk 1"]]]]
        })
      ]
    });
    const files = [
      ...week(times, ["Bunk 1"], "A"),
      ...week(other, ["Bunk 9"], "B")
    ];
    const p = propose(existing, {}, files);
    expect(p.timetables.map((x) => x.program && x.program.id)).toEqual([
      "p1",
      null
    ]);
    const card = cardsOf(p).find((c) => c.id === "program|Bunk 9");
    expect(card.options.map((o) => o.value)).toEqual(["new", LEAVE_OUT]);
    expect(card.preselected).toBeNull();
    const plan = planFor(
      propose(existing, { [card.id]: "new" }, files),
      existing,
      "s"
    );
    expect(plan.programs.map((x) => x.name)).toEqual(["Program 2"]);
    expect(new Set(plan.timeBlocks.map((b) => b.key)).size).toBe(
      plan.timeBlocks.length
    );
  });

  it("a camp block two file blocks fall in cannot be changed, only kept or left out (finding 3)", () => {
    const existing = existingSetup({
      programs: [
        program("p1", "Main", { blocks: [["b1", "Morning", 9 * 60, 10 * 60]] })
      ]
    });
    const files = week(
      ["9:00-9:30", "9:30-10:00", "12:00-12:45"],
      ["Bunk 1"],
      "A"
    );
    const cards = cardsOf(propose(existing, {}, files)).filter((c) =>
      c.id.startsWith("change|block")
    );
    expect(cards).toHaveLength(2);
    cards.forEach((c) =>
      expect(c.options.map((o) => o.value)).toEqual(["keep", LEAVE_OUT])
    );
    const answers = Object.fromEntries(cards.map((c) => [c.id, "change"]));
    expect(
      planFor(
        propose(existing, answers, files),
        existing,
        "s"
      ).timeBlocks.filter((b) => b.id)
    ).toEqual([]);
  });

  it("a group the camp has in another program is left out, and said so (finding 4)", () => {
    const existing = existingSetup({
      programs: [
        program("p1", "Juniors camp", {
          blocks: blocksOf(times),
          divisions: [["d1", "Juniors", [["g1", "Bunk 1"]]]]
        }),
        program("p2", "Seniors camp", {
          divisions: [["d2", "Seniors", [["g3", "Bunk 3"]]]]
        })
      ]
    });
    const files = week(times, ["Bunk 1", "Bunk 3"], "A");
    const first = propose(existing, {}, files);
    const card = cardsOf(first).find((c) => c.id.startsWith("program|"));
    const p = propose(existing, { [card.id]: "Juniors camp" }, files);
    expect(p.groups.find((g) => g.name === "Bunk 3").leftOut).toBe(true);
    expect(importNotes(p, terms).map((n) => n.text)).toContain(
      "Bunk 3 is in Seniors camp, not Juniors camp, so its schedule from these files is left out. Import its file on its own to add it to Seniors camp."
    );
    const plan = planFor(p, existing, "s");
    expect(plan.recurringActivities.flatMap((r) => r.who)).not.toContain("g3");
  });

  it("an activity in one program and fixed in another counts only its activity times (finding 5)", () => {
    const fixedSwim = (name) =>
      csv(`${name}.csv`, [
        ["Time", "Bunk 7", "Bunk 8"],
        ...other.map((b, i) => [
          b,
          i === 0 ? "Swim" : "Art",
          i === 0 ? "Swim" : "Soccer"
        ])
      ]);
    const files = [
      ...week(times, ["Bunk 1", "Bunk 2", "Bunk 3"], "A"),
      ...["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((d) =>
        fixedSwim(`B ${d}`)
      )
    ];
    const p = propose(existingSetup(), {}, files);
    expect(p.fixed.map((f) => f.name)).toContain("Swim");
    const swim = p.activities.find((a) => a.name === "Swim");
    expect(swim.max).toBeLessThanOrEqual(5);
    expect(importNotes(p, terms).some((n) => n.key === "mixed|Swim")).toBe(
      true
    );
  });

  it("Juniors only is said by bunk when the camp's Juniors have a bunk the file does not show", () => {
    const existing = existingSetup({
      programs: [
        program("p1", "Main", {
          blocks: MAPLE_BLOCKS,
          divisions: [
            [
              "d1",
              "Juniors",
              [
                ["g1", "Bunk 1"],
                ["g2", "Bunk 2"],
                ["g3", "Bunk 3"],
                ["g9", "Bunk 9"]
              ]
            ]
          ]
        })
      ]
    });
    const p = propose(existing, { "kind|Library time": "recurring" });
    const library = p.recurring.find((r) => r.name === "Library time");
    expect(library.who.keys).toEqual(["g1", "g2", "g3"]);
  });

  it("a recurring activity set up differently: the card says where, how long, and which days", () => {
    const existing = existingSetup({
      programs: [
        program("p1", "Main", {
          blocks: MAPLE_BLOCKS,
          recurring: [
            {
              Id: "r1",
              Name: "Library time",
              TimeBlock__c: "tb1",
              Length__c: 2,
              Monday__c: true,
              Tuesday__c: false,
              Wednesday__c: true,
              Thursday__c: false,
              Friday__c: false
            }
          ]
        })
      ]
    });
    const card = cardsOf(
      propose(existing, { "kind|Library time": "recurring" })
    ).find((c) => c.id.startsWith("change|recurring"));
    expect(card.title).toBe(
      "“Library time” is set up at Period 1, 2 time blocks long on Monday and Wednesday. The file has it at Period 4 on Wednesday."
    );
  });

  it("a new time block goes after the program's own, by their places in order", () => {
    const existing = existingSetup({
      programs: [program("p1", "Main", { blocks: MAPLE_BLOCKS.slice(0, 6) })]
    });
    const added = planFor(propose(existing), existing, "s").timeBlocks.filter(
      (b) => b.id === null
    );
    expect(added.map((b) => [b.name, b.sortOrder])).toEqual([["Period 6", 7]]);
  });

  it("new divisions and activities go after the camp's own, by their places in order", () => {
    const existing = existingSetup({
      programs: [
        program("p1", "Main", {
          blocks: MAPLE_BLOCKS,
          divisions: [["d1", "Juniors", [["g1", "Bunk 1"]]]]
        })
      ],
      activities: [{ Id: "a1", Name: "Boating", Length__c: 1, SortOrder__c: 4 }]
    });
    const plan = planFor(propose(existing), existing, "s");
    expect(
      plan.divisions
        .filter((d) => d.id === null)
        .map((d) => [d.name, d.sortOrder])
    ).toEqual([["Seniors", 2]]);
    const added = plan.activities.filter((a) => a.id === null);
    expect(added.length).toBeGreaterThan(0);
    expect(Math.min(...added.map((a) => a.sortOrder))).toBe(5);
  });

  it("a changed block keeps its part of day; new blocks get one", () => {
    const blocks = MAPLE_BLOCKS.map((b) => {
      return b[0] === "tb1" ? ["tb1", "Period 1", at(9), at(9, 50)] : b;
    });
    const existing = existingSetup({
      programs: [program("p1", "Main", { blocks })]
    });
    const card = cardsOf(propose(existing)).find((c) =>
      c.id.startsWith("change|block")
    );
    const [changed] = planFor(
      propose(existing, { [card.id]: "change" }),
      existing,
      "s"
    ).timeBlocks;
    expect(changed.partOfDay).toBeUndefined();
  });
});
