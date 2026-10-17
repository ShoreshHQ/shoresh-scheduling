// A group is its division and its name (PR 15 review blocker), and Greg's choices on the
// preview: a division per new group, a program per set of groups, and moving a group.
import {
  buildProposal,
  LEAVE_OUT,
  planFor,
  questionCards
} from "c/shoreshImportEngine";
import { csv, existingSetup, program, terms } from "./data/samples";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const BLOCKS = ["9:00-9:45", "9:50-10:35", "12:00-12:45"];
const at = (h, m = 0) => h * 60 + m;

/** An all-camp week: a division row over the group columns. */
function campWeek(divisionRow, groups, cell) {
  return DAYS.map((day, d) =>
    csv(`Camp ${day}.csv`, [
      ["", ...divisionRow],
      ["Time", ...groups],
      ...BLOCKS.map((b, bi) => [b, ...groups.map((_, g) => cell(g, d, bi))])
    ])
  );
}

function rotation(g, d, b) {
  return b === 2
    ? "Lunch"
    : ["Swim", "Art", "Soccer", "Music"][(g + b + d) % 4];
}
const propose = (files, existing = null, answers = {}) =>
  buildProposal({ files, existing, terms, answers });
const cards = (p, answers = {}) => questionCards(p, terms, answers);

describe("the same group name in different divisions", () => {
  it("are two groups, never merged, and raise no false disagreements", () => {
    const files = campWeek(
      ["Juniors", "Juniors", "Seniors", "Seniors"],
      ["Bunk 1", "Bunk 2", "Bunk 1", "Bunk 2"],
      rotation
    );
    const p = propose(files);
    expect(p.groups.map((g) => [g.name, g.recordName, g.division])).toEqual([
      ["Bunk 1 (Juniors)", "Bunk 1", "Juniors"],
      ["Bunk 2 (Juniors)", "Bunk 2", "Juniors"],
      ["Bunk 1 (Seniors)", "Bunk 1", "Seniors"],
      ["Bunk 2 (Seniors)", "Bunk 2", "Seniors"]
    ]);
    expect(p.reading.disagreements).toEqual([]);
    const plan = planFor(p, null, "s");
    expect(plan.groups.map((g) => [g.name, g.divisionKey])).toEqual([
      ["Bunk 1", "D|P0|Juniors"],
      ["Bunk 2", "D|P0|Juniors"],
      ["Bunk 1", "D|P0|Seniors"],
      ["Bunk 2", "D|P0|Seniors"]
    ]);
    expect(p.fixed.map((f) => f.name)).toEqual(["Lunch"]);
  });

  it("columns named Juniors - Bunk 1 and Seniors - Bunk 1 are two groups too", () => {
    const files = DAYS.map((day, d) =>
      csv(`Camp ${day}.csv`, [
        ["Time", "Juniors - Bunk 1", "Seniors - Bunk 1"],
        ...BLOCKS.map((b, bi) => [b, rotation(0, d, bi), rotation(1, d, bi)])
      ])
    );
    expect(propose(files).groups.map((g) => g.name)).toEqual([
      "Bunk 1 (Juniors)",
      "Bunk 1 (Seniors)"
    ]);
  });

  it("a file that does not say which one asks, and uses the answer", () => {
    const camp = campWeek(
      ["Juniors", "Seniors"],
      ["Bunk 1", "Bunk 1"],
      rotation
    );
    const lone = csv("Bunk 1.csv", [
      ["Time", ...DAYS],
      ...BLOCKS.map((b, bi) => [b, ...DAYS.map((_, d) => rotation(0, d, bi))])
    ]);
    const files = [...camp, lone];
    const ask = cards(propose(files)).find(
      (c) => c.id === "whichGroup|Bunk 1|Bunk 1.csv"
    );
    expect(ask.title).toBe("Which Bunk 1 is in Bunk 1.csv?");
    expect(ask.options.map((o) => o.value)).toEqual([
      "Bunk 1 (Juniors)",
      "Bunk 1 (Seniors)",
      LEAVE_OUT
    ]);
    const answered = propose(files, null, { [ask.id]: "Bunk 1 (Juniors)" });
    expect(answered.groups.map((g) => g.name)).toEqual([
      "Bunk 1 (Juniors)",
      "Bunk 1 (Seniors)"
    ]);
    expect(answered.reading.disagreements).toEqual([]);
  });

  it("a division only hinted at by a file name gives way to one a file states", () => {
    const camp = campWeek(
      ["Juniors", "Juniors"],
      ["Bunk 1", "Bunk 2"],
      rotation
    );
    const lone = csv("Camp 2026 - Bunk 1.csv", [
      ["Time", ...DAYS],
      ...BLOCKS.map((b, bi) => [b, ...DAYS.map((_, d) => rotation(0, d, bi))])
    ]);
    const p = propose([...camp, lone]);
    expect(p.groups.map((g) => g.name)).toEqual(["Bunk 1", "Bunk 2"]);
    expect(cards(p).some((c) => c.id.startsWith("whichGroup"))).toBe(false);
  });
});

describe("division and program, shown for every new group and changeable (Greg)", () => {
  const existing = existingSetup({
    programs: [
      program("p1", "Main", {
        blocks: [
          ["b1", "P1", at(9), at(9, 45)],
          ["b2", "P2", at(9, 50), at(10, 35)],
          ["b3", "Lunch", at(12), at(12, 45)]
        ],
        divisions: [
          ["d1", "Juniors", [["g1", "Bunk 1"]]],
          ["d2", "Seniors", []]
        ]
      })
    ]
  });
  const noUnits = DAYS.map((day, d) =>
    csv(`Camp ${day}.csv`, [
      ["Time", "Bunk 1", "Bunk 7"],
      ...BLOCKS.map((b, bi) => [b, rotation(0, d, bi), rotation(1, d, bi)])
    ])
  );

  it("the file's division is preselected; none is preselected when the file is silent and the program has divisions", () => {
    const p = propose(noUnits, existing);
    const units = cards(p).filter((c) => c.select === "division");
    expect(units.map((c) => [c.subject, c.preselected])).toEqual([
      ["Bunk 7", null]
    ]);
    expect(units[0].answer).toBeNull();
    expect(units[0].options.map((o) => o.value)).toEqual([
      "Juniors",
      "Seniors",
      LEAVE_OUT
    ]);
    const plan = planFor(
      propose(noUnits, existing, { [units[0].id]: "Seniors" }),
      existing,
      "s"
    );
    expect(plan.groups).toEqual([
      {
        key: "G|Bunk 7",
        id: null,
        divisionKey: "d2",
        name: "Bunk 7",
        sortOrder: 2
      }
    ]);
  });

  it("a camp with no divisions and a file naming none starts with Main, shown and changeable", () => {
    const p = propose(noUnits);
    const units = cards(p).filter((c) => c.select === "division");
    expect(units.map((c) => c.answer)).toEqual(["Main", "Main"]);
  });

  it("the program is shown preselected for the camp's only program, and can be changed", () => {
    const p = propose(noUnits, existing);
    const choice = cards(p).find((c) => c.select === "program");
    expect(choice.answer).toBe("Main");
    expect(choice.options.map((o) => o.value)).toEqual([
      "Main",
      "new",
      LEAVE_OUT
    ]);
    const moved = propose(noUnits, existing, { [choice.id]: "new" });
    expect(moved.timetables[0].program).toBeNull();
  });
});

describe("moving a group to the division the file shows (Greg)", () => {
  const blocks = [
    ["b1", "P1", at(9), at(9, 45)],
    ["b2", "P2", at(9, 50), at(10, 35)],
    ["b3", "Lunch", at(12), at(12, 45)]
  ];
  const existing = existingSetup({
    programs: [
      program("p1", "Main", {
        blocks,
        divisions: [
          ["d1", "Juniors", [["g3", "Bunk 3"]]],
          ["d2", "Seniors", [["g4", "Bunk 4"]]]
        ],
        recurring: [
          {
            Id: "r1",
            Name: "Library",
            TimeBlock__c: "b2",
            Length__c: 1,
            Monday__c: true,
            Coverages__r: [{ Division__c: "d1" }]
          }
        ]
      })
    ],
    activities: [
      {
        Id: "a1",
        Name: "Boating",
        Length__c: 1,
        Eligibilities__r: [{ Division__c: "d2" }]
      }
    ]
  });
  const files = campWeek(
    ["Seniors", "Seniors"],
    ["Bunk 3", "Bunk 4"],
    rotation
  );

  it("asks: move, keep, add a new one, or leave out, saying what moving changes", () => {
    const card = cards(propose(files, existing)).find((c) =>
      c.id.startsWith("move|")
    );
    expect(card.title).toBe(
      "Bunk 3 is in Juniors. The file puts it in Seniors."
    );
    expect(card.subtitle).toBe(
      "If it moves, Bunk 3 is no longer in Library (for Juniors) and is now in Boating (for Seniors)."
    );
    expect(card.options.map((o) => o.label)).toEqual([
      "Move Bunk 3 from Juniors to Seniors",
      "Keep it in Juniors",
      "Add a new Bunk 3 to Seniors",
      "Leave it out for now"
    ]);
  });

  it("each answer saves what it says", () => {
    const id = cards(propose(files, existing)).find((c) =>
      c.id.startsWith("move|")
    ).id;
    const plan = (answer) =>
      planFor(propose(files, existing, { [id]: answer }), existing, "s").groups;
    expect(plan("move")).toEqual([{ key: "g3", id: "g3", divisionKey: "d2" }]);
    expect(plan("keep")).toEqual([]);
    expect(plan("new")).toEqual([
      {
        key: "G|Bunk 3 (Seniors)",
        id: null,
        divisionKey: "d2",
        name: "Bunk 3",
        sortOrder: 2
      }
    ]);
    expect(plan(LEAVE_OUT)).toEqual([]);
  });
});

describe("who can do an imported activity (PR 15 review, finding 2)", () => {
  it("is written out when the season has groups the files do not show", () => {
    const existing = existingSetup({
      programs: [
        program("p1", "Main", {
          divisions: [
            [
              "d1",
              "Cabins",
              [
                ["g7", "Cabin 7"],
                ["g8", "Cabin 8"]
              ]
            ]
          ]
        })
      ]
    });
    const files = DAYS.map((day, d) =>
      csv(`Camp ${day}.csv`, [
        ["Time", "Bunk 1", "Bunk 2"],
        ...BLOCKS.map((b, bi) => [
          b,
          ...[0, 1].map((g) => {
            return bi === 0 && (g + d) % 2 === 0
              ? "Archery"
              : rotation(g, d, bi);
          })
        ])
      ])
    );
    const card = cards(propose(files, existing)).find(
      (c) => c.select === "program"
    );
    const p = propose(files, existing, { [card.id]: "new" });
    const archery = p.activities.find((a) => a.name === "Archery");
    expect(archery.who.names).toEqual(["Main"]);
    expect(archery.who.keys).toEqual(["D|P0|Main"]);
  });

  it("is everyone when the files cover every group in the season", () => {
    const files = DAYS.map((day, d) =>
      csv(`Camp ${day}.csv`, [
        ["Time", "Bunk 1", "Bunk 2"],
        ...BLOCKS.map((b, bi) => [b, rotation(0, d, bi), rotation(1, d, bi)])
      ])
    );
    expect(
      propose(files).activities.every((a) => a.who.keys.length === 0)
    ).toBe(true);
  });
});

describe("the same files in any order give the same result (PR 15 review, finding 3)", () => {
  it("plan and questions do not depend on the order files were chosen in", () => {
    const camp = campWeek(
      ["Juniors", "Seniors"],
      ["Bunk 1", "Bunk 9"],
      rotation
    );
    const other = DAYS.map((day, d) =>
      csv(`Other ${day}.csv`, [
        ["Time", "Cabin 1"],
        ...["8:00-8:50", "9:00-9:50", "12:00-12:45"].map((b, bi) => [
          b,
          rotation(0, d, bi)
        ])
      ])
    );
    const forward = propose([...camp, ...other]);
    const backward = propose([...other, ...camp].reverse());
    expect(JSON.stringify(planFor(backward, null, "s"))).toBe(
      JSON.stringify(planFor(forward, null, "s"))
    );
    expect(cards(backward).map((c) => c.id)).toEqual(
      cards(forward).map((c) => c.id)
    );
  });
});

describe("PR 16 reviews", () => {
  const teens = existingSetup({
    programs: [
      program("pt", "Teens", {
        divisions: [["dt", "Teens", [["gt", "Teen 1"]]]]
      })
    ]
  });
  /** A week for one program: its own times so it is its own timetable. */
  const week = (prefix, groups, times, cell) =>
    DAYS.map((day, d) =>
      csv(`${prefix} ${day}.csv`, [
        ["Time", ...groups],
        ...times.map((b, bi) => [b, ...groups.map((_, g) => cell(g, d, bi))])
      ])
    );
  const morning = ["9:00-9:45", "9:50-10:35", "12:00-12:45"];
  const later = ["9:15-10:00", "10:05-10:50", "12:15-1:00"];
  function all(g, d, b) {
    return b === 0 && (g + d) % 2 === 0 ? "Archery" : rotation(g, d, b);
  }

  it("two new programs each with a division called Main: who names both (coordinator blocker)", () => {
    const files = [
      ...week("A", ["Red", "Blue"], morning, all),
      ...week("B", ["Green", "Gold"], later, all)
    ];
    const first = propose(files, teens);
    const answers = Object.fromEntries(
      cards(first)
        .filter((c) => c.select === "program")
        .map((c) => [c.id, "new"])
    );
    const p = propose(files, teens, answers);
    const archery = p.activities.find((a) => a.name === "Archery");
    const keys = archery.who.keys;
    expect(keys.sort()).toEqual(["D|P0|Main", "D|P1|Main"]);
  });

  it("the same division and name in two programs are two groups", () => {
    const files = [
      ...DAYS.map((day, d) =>
        csv(`A ${day}.csv`, [
          ["", "Juniors", "Juniors"],
          ["Time", "Bunk 1", "Bunk 2"],
          ...morning.map((b, bi) => [b, rotation(0, d, bi), rotation(1, d, bi)])
        ])
      ),
      ...DAYS.map((day, d) =>
        csv(`B ${day}.csv`, [
          ["", "Juniors", "Juniors"],
          ["Time", "Bunk 1", "Bunk 3"],
          ...later.map((b, bi) => [b, rotation(0, d, bi), rotation(1, d, bi)])
        ])
      )
    ];
    const p = propose(files);
    expect(p.groups.map((g) => g.name)).toEqual([
      "Bunk 1 (schedule 1)",
      "Bunk 2",
      "Bunk 1 (schedule 2)",
      "Bunk 3"
    ]);
    expect(
      planFor(p, null, "s").groups.map((g) => [g.name, g.divisionKey])
    ).toEqual([
      ["Bunk 1", "D|P0|Juniors"],
      ["Bunk 2", "D|P0|Juniors"],
      ["Bunk 1", "D|P1|Juniors"],
      ["Bunk 3", "D|P1|Juniors"]
    ]);
  });

  it("an aftercare block at 5:00-6:00 stays in the afternoon", () => {
    const rows = [
      ["Time", "Bunk 1"],
      ["9:00-9:45", "Swim"],
      ["3:00-3:45", "Art"],
      ["5:00-6:00", "Aftercare"]
    ];
    const p = propose(["Monday", "Tuesday"].map((d) => csv(`${d}.csv`, rows)));
    expect(p.timetables[0].blocks.map((b) => b.start)).toEqual([
      at(9),
      at(15),
      at(17)
    ]);
  });

  it("the move card leaves out what names the group itself", () => {
    const existing = existingSetup({
      programs: [
        program("p1", "Main", {
          blocks: [
            ["b1", "P1", at(9), at(9, 45)],
            ["b2", "P2", at(9, 50), at(10, 35)],
            ["b3", "Lunch", at(12), at(12, 45)]
          ],
          divisions: [
            ["d1", "Juniors", [["g3", "Bunk 3"]]],
            ["d2", "Seniors", [["g4", "Bunk 4"]]]
          ]
        })
      ],
      activities: [
        {
          Id: "a1",
          Name: "Pottery",
          Length__c: 1,
          Eligibilities__r: [{ Division__c: "d1" }, { Group__c: "g3" }]
        }
      ]
    });
    const files = campWeek(
      ["Seniors", "Seniors"],
      ["Bunk 3", "Bunk 4"],
      rotation
    );
    const card = cards(propose(files, existing)).find((c) =>
      c.id.startsWith("move|")
    );
    expect(card.subtitle).toBe(
      "Nothing set up is for Juniors or Seniors by name, so moving changes nothing else."
    );
  });

  it("a division that already has a group of that name is not offered for it", () => {
    const files = campWeek(
      ["Juniors", "Seniors"],
      ["Bunk 1", "Bunk 1"],
      rotation
    );
    const p = propose(files);
    const units = cards(p).filter((c) => c.select === "division");
    expect(
      units.map((c) => [c.subject, c.answer, c.options.map((o) => o.value)])
    ).toEqual([
      ["Bunk 1 (Juniors)", "Juniors", ["Juniors", LEAVE_OUT]],
      ["Bunk 1 (Seniors)", "Seniors", ["Seniors", LEAVE_OUT]]
    ]);
  });

  it("another program's divisions do not hide this program's (round 2 repro)", () => {
    const a = DAYS.map((day, d) =>
      csv(`A ${day}.csv`, [
        ["", "Juniors"],
        ["Time", "Bunk 1"],
        ...BLOCKS.map((b, bi) => [b, rotation(0, d, bi)])
      ])
    );
    const laterTimes = ["9:15-10:00", "10:05-10:50", "12:15-1:00"];
    const b = DAYS.map((day, d) =>
      csv(`B ${day}.csv`, [
        ["Time", "Bunk 1", "Juniors - Bunk 3"],
        ...laterTimes.map((t, bi) => [
          t,
          rotation(0, d, bi),
          rotation(1, d, bi)
        ])
      ])
    );
    const p = propose([...a, ...b]);
    const unit = cards(p).find((c) => c.id === "division|Bunk 1 (schedule 2)");
    expect(unit.options.map((o) => o.value)).toEqual(["Juniors", LEAVE_OUT]);
  });

  it("a group of another program cannot be kept, only added anew or left out", () => {
    const existing = existingSetup({
      programs: [
        program("pa", "Afternoon", {
          divisions: [["da", "Juniors", [["g3", "Bunk 3"]]]]
        }),
        program("pm", "Morning", {
          blocks: [
            ["b1", "P1", at(9), at(9, 45)],
            ["b2", "P2", at(9, 50), at(10, 35)],
            ["b3", "Lunch", at(12), at(12, 45)]
          ],
          divisions: [["ds", "Seniors", [["g4", "Bunk 4"]]]]
        })
      ]
    });
    const files = campWeek(
      ["Seniors", "Seniors"],
      ["Bunk 3", "Bunk 4"],
      rotation
    );
    const card = cards(propose(files, existing)).find((c) =>
      c.id.startsWith("move|")
    );
    expect(card.title).toBe(
      "Bunk 3 is in Juniors, in Afternoon. The file puts it in Seniors."
    );
    expect(card.options.map((o) => o.value)).toEqual(["new", LEAVE_OUT]);
  });

  it("two files of the same name give the same result either way round", () => {
    const one = csv("Monday.csv", [
      ["Time", "Bunk 1"],
      ["9:00-9:45", "Swim"]
    ]);
    const two = csv("Monday.csv", [
      ["Time", "Bunk 1"],
      ["9:00-9:45", "Art"]
    ]);
    const a = propose([one, two]);
    const b = propose([two, one]);
    expect(cards(a).map((c) => [c.id, c.subtitle])).toEqual(
      cards(b).map((c) => [c.id, c.subtitle])
    );
  });

  it("Grades 3-5 and Ages 6-8 are not times", () => {
    const { timeRange } = jest.requireActual("../text");
    expect(timeRange("Grades 3-5")).toBeNull();
    expect(timeRange("Ages 6-8")).toBeNull();
    expect(timeRange("Friday 9-10")).toMatchObject({ start: at(9) });
  });
});

describe("PR 16 round 3", () => {
  const lone = (name, d0 = 0) =>
    csv(name, [
      ["Time", ...DAYS],
      ...BLOCKS.map((b, bi) => [b, ...DAYS.map((_, d) => rotation(d0, d, bi))])
    ]);

  it("a lone file's unit is offered but not chosen, in a new camp", () => {
    const p = propose([lone("Juniors - Bunk 1.csv")]);
    const unit = cards(p).find((c) => c.select === "division");
    expect(unit.answer).toBeNull();
    expect(unit.options.map((o) => o.value)).toEqual([
      "Juniors",
      "Main",
      LEAVE_OUT
    ]);
  });

  it("a lone file's unit is offered beside the camp's own", () => {
    const existing = existingSetup({
      programs: [program("p1", "Main", { divisions: [["d2", "Seniors", []]] })]
    });
    const unit = cards(propose([lone("Juniors - Bunk 1.csv")], existing)).find(
      (c) => c.select === "division"
    );
    expect(unit.answer).toBeNull();
    expect(unit.options.map((o) => o.value)).toEqual([
      "Seniors",
      "Juniors",
      LEAVE_OUT
    ]);
  });

  it("answering morning merges two pages' versions of the same block", () => {
    const monday = csv("Monday.csv", [
      ["Time", "Bunk 1"],
      ["6:00 AM-6:30 AM", "Wake up"],
      ["9:00-9:45", "Swim"]
    ]);
    const tuesday = csv("Tuesday.csv", [
      ["Time", "Bunk 1"],
      ["6:00-6:30", "Wake up"],
      ["9:00-9:45", "Art"]
    ]);
    const first = propose([monday, tuesday]);
    const card = cards(first).find((c) => c.id.startsWith("ampm|"));
    const p = propose([monday, tuesday], null, { [card.id]: "morning" });
    expect(p.timetables[0].blocks.map((b) => [b.start, b.end])).toEqual([
      [at(6), at(6, 30)],
      [at(9), at(9, 45)]
    ]);
    const wake = p.reading.placements.filter((x) => x.text === "Wake up");
    expect(new Set(wake.map((x) => x.blockKey)).size).toBe(1);
  });

  it("two programs' 6:00-6:30 rows holding different things are separate questions", () => {
    const a = DAYS.map((day) =>
      csv(`A ${day}.csv`, [
        ["Time", "Bunk 1"],
        ["6:00-6:30", "Breakfast"],
        ["9:00-9:45", "Swim"]
      ])
    );
    const b = DAYS.map((day) =>
      csv(`B ${day}.csv`, [
        ["Time", "Tent 1"],
        ["6:00-6:30", "Pickup"],
        ["9:10-9:50", "Art"]
      ])
    );
    const ids = cards(propose([...a, ...b]))
      .filter((c) => c.id.startsWith("ampm|"))
      .map((c) => c.title);
    expect(ids).toEqual([
      "Is Breakfast 6:00–6:30 in the morning or the evening?",
      "Is Pickup 6:00–6:30 in the morning or the evening?"
    ]);
  });
});

describe("PR 16 round 4", () => {
  it("a new camp can always choose Main, beside a unit a file name suggests", () => {
    const file = csv("Maple Grove 2026 - Bunk 1.csv", [
      ["Time", ...DAYS],
      ...BLOCKS.map((b, bi) => [b, ...DAYS.map((_, d) => rotation(0, d, bi))])
    ]);
    const unit = cards(propose([file])).find((c) => c.select === "division");
    expect(unit.answer).toBeNull();
    expect(unit.options.map((o) => o.value)).toEqual([
      "Maple Grove 2026",
      "Main",
      LEAVE_OUT
    ]);
  });

  const pickup = csv("Monday.csv", [
    ["Time", "Bunk 1"],
    ["6:00 PM-6:30 PM", "Pickup"],
    ["9:00-9:45", "Swim"]
  ]);
  const wake = csv("Tuesday.csv", [
    ["Time", "Bunk 1"],
    ["6:00-6:30", "Wake up"],
    ["9:00-9:45", "Art"]
  ]);
  const blockOf = (p, text) => {
    const placement = p.reading.placements.find((x) => x.text === text);
    return p.timetables[0].blocks.find((b) => b.fileKey === placement.blockKey);
  };

  it("a bare time is not merged with a stated one before its question is answered", () => {
    const p = propose([pickup, wake]);
    const card = cards(p).find((c) => c.id.startsWith("ampm|"));
    expect(card.title).toBe(
      "Is Wake up 6:00–6:30 in the morning or the evening?"
    );
    expect(blockOf(p, "Wake up").fileKey).not.toBe(
      blockOf(p, "Pickup").fileKey
    );
    const morning = propose([pickup, wake], null, { [card.id]: "morning" });
    expect([
      blockOf(morning, "Wake up").start,
      blockOf(morning, "Pickup").start
    ]).toEqual([at(6), at(18)]);
    const evening = propose([pickup, wake], null, { [card.id]: "evening" });
    expect(blockOf(evening, "Wake up").fileKey).toBe(
      blockOf(evening, "Pickup").fileKey
    );
  });

  it("the block kept is the one whose label states AM or PM", () => {
    const bare = csv("A Monday.csv", [
      ["Time", "Bunk 1"],
      ["6:00-6:30", "Wake up"],
      ["9:00-9:45", "Swim"]
    ]);
    const stated = csv("B Tuesday.csv", [
      ["Time", "Bunk 1"],
      ["6:00 AM-6:30 AM", "Wake up"],
      ["9:00-9:45", "Art"]
    ]);
    const card = cards(propose([bare, stated])).find((c) =>
      c.id.startsWith("ampm|")
    );
    const p = propose([bare, stated], null, { [card.id]: "morning" });
    expect(p.timetables[0].blocks[0].name).toBe("6:00 AM-6:30 AM");
    expect(p.timetables[0].blocks).toHaveLength(2);
  });
});
