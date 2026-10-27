import {
  buildProposal,
  importNotes,
  LEAVE_OUT,
  questionCards
} from "./data/engine";
import { mergesFrom, similarity, similarPairs } from "../names";
import {
  byGroupFiles,
  csv,
  DAYS,
  existingSetup,
  program,
  samples,
  terms,
  findSamplesFrom
} from "./data/samples";

findSamplesFrom(__dirname);

const GROUPS = [
  "Juniors - Bunk 1",
  "Juniors - Bunk 2",
  "Seniors - Bunk 3",
  "Seniors - Bunk 4"
];
const ROTATION = ["Swim", "Art", "Soccer", "Drama"];
// Blocks: 0 Period 1, 1 Period 2, 2 Lunch, 3 Period 3. Days 0-4.
function rotation(g, d, b) {
  return ROTATION[(g + b + d) % ROTATION.length];
}

function propose(cell, answers = {}) {
  return buildProposal({
    files: byGroupFiles(GROUPS, cell),
    existing: null,
    terms,
    answers
  });
}

function kindOf(proposal, name) {
  if (proposal.fixed.some((f) => f.name === name)) return "fixed";
  if (proposal.recurring.some((f) => f.name === name)) return "recurring";
  if (proposal.activities.some((f) => f.name === name)) return "activity";
  return null;
}

describe("fixed, then recurring, then activities", () => {
  it("every group, same time block, every day, nowhere else: a fixed activity, not asked", () => {
    const p = propose((g, d, b) => {
      return b === 2 ? "Lunch" : rotation(g, d, b);
    });
    expect(kindOf(p, "Lunch")).toBe("fixed");
    expect(p.fixed[0]).toMatchObject({ block: 2, length: 1 });
    expect(p.asks.filter((a) => a.type === "kind")).toEqual([]);
  });

  it("a rotation is activities, not asked", () => {
    const p = propose((g, d, b) => {
      return b === 2 ? "Lunch" : rotation(g, d, b);
    });
    expect(ROTATION.map((n) => kindOf(p, n))).toEqual([
      "activity",
      "activity",
      "activity",
      "activity"
    ]);
  });

  it("staggered by division every day: recurring activities for each division, not asked", () => {
    const p = propose((g, d, b) => {
      if (b === 2) return g < 2 ? "Lunch" : rotation(g, d, b);
      if (b === 3) return g >= 2 ? "Lunch" : rotation(g, d, b);
      return rotation(g, d, b);
    });
    expect(kindOf(p, "Lunch")).toBe("recurring");
    expect(
      p.recurring.map((r) => [r.block, r.days.length, r.who.names])
    ).toEqual([
      [2, 5, ["Juniors"]],
      [3, 5, ["Seniors"]]
    ]);
    expect(p.asks.filter((a) => a.type === "kind")).toEqual([]);
  });

  it("everyone on one day at the same time: a recurring activity, not asked", () => {
    const p = propose((g, d, b) => {
      return d === 0 && b === 0 ? "Flag" : rotation(g, d, b);
    });
    expect(kindOf(p, "Flag")).toBe("recurring");
    expect(p.recurring[0]).toMatchObject({ days: ["Monday"], block: 0 });
    expect(p.recurring[0].who.keys).toEqual([]);
  });

  it("rule 7: one division once in a one-week file is recurring, not asked (Greg 2026-10-27)", () => {
    const p = propose((g, d, b) => {
      return d === 2 && b === 3 && g < 2 ? "Library" : rotation(g, d, b);
    });
    expect(kindOf(p, "Library")).toBe("recurring");
    expect(p.recurring[0]).toMatchObject({ block: 3, days: ["Wednesday"] });
    expect(p.recurring[0].who.names).toEqual(["Juniors"]);
    expect(p.asks.filter((a) => a.type === "kind")).toEqual([]);
  });

  it("a name at a set time and also scattered elsewhere is never decided silently", () => {
    const cell = (g, d, b) => {
      if (b === 2) return "Swim";
      if (g === 1 && d === 3 && b === 0) return "Swim";
      return ["Art", "Soccer", "Drama"][(g + b + d) % 3];
    };
    const p = propose(cell);
    const ask = p.asks.find((a) => a.id === "kind|Swim");
    expect(ask.facts.reason).toBe("scattered");
    const card = questionCards(p, terms, {}).find((c) => c.id === "kind|Swim");
    expect(card.options.map((o) => o.value)).toEqual([
      "fixed",
      "recurring",
      "activity",
      LEAVE_OUT
    ]);
    expect(kindOf(propose(cell, { "kind|Swim": "fixed" }), "Swim")).toBe(
      "fixed"
    );
    expect(kindOf(propose(cell, { "kind|Swim": "activity" }), "Swim")).toBe(
      "activity"
    );
    expect(
      kindOf(propose(cell, { "kind|Swim": LEAVE_OUT }), "Swim")
    ).toBeNull();
  });

  it("rule 1: fixed at two times a day (Carpool morning and afternoon) is two fixed activities", () => {
    const p = propose((g, d, b) => {
      return b === 0 || b === 3 ? "Carpool" : rotation(g, d, b);
    });
    expect(kindOf(p, "Carpool")).toBe("fixed");
    expect(p.fixed.map((f) => [f.name, f.block])).toEqual([
      ["Carpool", 0],
      ["Carpool", 3]
    ]);
    expect(new Set(p.fixed.map((f) => f.key)).size).toBe(2);
    expect(p.asks.filter((a) => a.type === "kind")).toEqual([]);
  });

  it("rule 2: everyone but one group at one time twice a week is a recurring activity", () => {
    const p = propose((g, d, b) => {
      return (d === 1 || d === 3) && b === 3 && g < 3
        ? "All Camp"
        : rotation(g, d, b);
    });
    expect(kindOf(p, "All Camp")).toBe("recurring");
    expect(p.recurring[0]).toMatchObject({
      block: 3,
      days: ["Tuesday", "Thursday"]
    });
    expect(p.asks.filter((a) => a.type === "kind")).toEqual([]);
  });

  it("rule 2: a division counts the groups that have the name at all (one bunk's cell spelled otherwise)", () => {
    // Swim Return for Juniors on Monday; on Wednesday for Bunk 1 and the Seniors, Bunk 2's
    // cell says something else that day.
    const p = propose((g, d, b) => {
      if (d === 0 && b === 1 && g < 2) return "Swim Return";
      if (d === 2 && b === 3 && g !== 1) return "Swim Return";
      return rotation(g, d, b);
    });
    expect(kindOf(p, "Swim Return")).toBe("recurring");
    expect(p.asks.filter((a) => a.type === "kind")).toEqual([]);
  });

  it("rule 3: one group at the same time on most days is its recurring activity", () => {
    const p = propose((g, d, b) => {
      return g === 3 && b === 1 && d < 4 ? "CIT Block" : rotation(g, d, b);
    });
    expect(kindOf(p, "CIT Block")).toBe("recurring");
    expect(p.recurring[0]).toMatchObject({
      block: 1,
      days: ["Monday", "Tuesday", "Wednesday", "Thursday"]
    });
    expect(p.recurring[0].who.names).toEqual(["Bunk 4"]);
  });

  it("rule 5: two groups of different divisions together once is an activity, not asked", () => {
    const p = propose((g, d, b) => {
      return d === 2 && b === 3 && (g === 1 || g === 2)
        ? "Library"
        : rotation(g, d, b);
    });
    expect(kindOf(p, "Library")).toBe("activity");
    expect(p.asks.filter((a) => a.type === "kind")).toEqual([]);
  });

  it("rule 5: a division together, but at three or more different times a week, is an activity", () => {
    const pairs = ["Art", "Soccer", "Drama"];
    const p = propose((g, d, b) => {
      return b === 2 ? "Lunch" : pairs[(Math.floor(g / 2) + b + d) % 3];
    });
    expect(pairs.map((n) => kindOf(p, n))).toEqual([
      "activity",
      "activity",
      "activity"
    ]);
    expect(p.asks.filter((a) => a.type === "kind")).toEqual([]);
  });

  it("a fixed activity may skip a special day (a name that fills the whole day)", () => {
    const p = propose((g, d, b) => {
      if (d === 4) return b === 2 ? "Lunch" : "Field day";
      return b === 2 ? "Lunch" : rotation(g, d, b);
    });
    expect(kindOf(p, "Lunch")).toBe("fixed");
    expect(p.noted.map((n) => n.name)).toEqual(["Field day"]);
    expect(kindOf(p, "Field day")).toBeNull();
  });

  it("weeks in the files must agree before a set time is sure", () => {
    const week = (n, cell) =>
      GROUPS.map((g, gi) =>
        csv(`Camp - ${g} - Week ${n}.csv`, [
          ["Time", ...DAYS],
          ...["Period 1 9:00-9:45", "Period 2 9:50-10:35"].map((b, bi) => [
            b,
            ...DAYS.map((_, d) => cell(gi, d, bi))
          ])
        ])
      );
    const steady = (g, d, b) => {
      return b === 0 ? "Flag" : rotation(g, d, b);
    };
    const moved = (g, d, b) => {
      return b === 1 ? "Flag" : rotation(g, d, b);
    };
    const agree = buildProposal({
      files: [...week(1, steady), ...week(2, steady)],
      existing: null,
      terms,
      answers: {}
    });
    expect(
      agree.reading.placements
        .map((p) => p.week)
        .filter((w, i, a) => a.indexOf(w) === i)
        .sort()
    ).toEqual(["Week 1", "Week 2"]);
    expect(kindOf(agree, "Flag")).toBe("fixed");
    const differ = buildProposal({
      files: [...week(1, steady), ...week(2, moved)],
      existing: null,
      terms,
      answers: {}
    });
    expect(differ.asks.find((a) => a.id === "kind|Flag").facts.reason).toBe(
      "weeks"
    );
  });

  it("electives and trips are noted by their words, including the camp's own", () => {
    const own = buildProposal({
      files: byGroupFiles(GROUPS, (g, d, b) => {
        return d === 1 && b === 3 ? "Chug time" : rotation(g, d, b);
      }),
      existing: null,
      terms: {
        ...terms,
        s: (t) => {
          return t === "Elective" ? "Chug time" : terms.s(t);
        },
        p: (t) => {
          return t === "Elective" ? "Chug times" : terms.p(t);
        }
      },
      answers: {}
    });
    // An elective is set up now (slice E9), not noted.
    expect(own.noted).toEqual([]);
    expect(own.electives.sets.map((s) => s.name)).toEqual(["Chug time"]);
    const trip = propose((g, d, b) => {
      return d === 3 && g >= 2 && b >= 2 ? "Museum Trip" : rotation(g, d, b);
    });
    expect(trip.noted.map((n) => [n.name, n.kind])).toEqual([
      ["Museum Trip", "T"]
    ]);
  });
});

describe("review findings: the rules refined (docs/import/classification.md)", () => {
  // Fillers that are never "Art" or "Sports", and differ between any two bunks at once.
  const FILL = ["Swim", "Soccer", "Drama", "Music"];
  const fill = (g, d, b) => FILL[(g + b + d) % FILL.length];
  const kindAsks = (p) => p.asks.filter((a) => a.type === "kind");

  it.each([
    ["on a trip", "Zoo trip"],
    ["with no cells", ""],
    ["off", "Off"]
  ])(
    "rule 1: a bunk %s on Wednesday does not break a fixed Carpool",
    (_, away) => {
      const p = propose((g, d, b) => {
        if (g === 2 && d === 2) return away;
        return b === 0 ? "Carpool" : rotation(g, d, b);
      });
      expect(kindOf(p, "Carpool")).toBe("fixed");
      expect(p.fixed).toHaveLength(1);
      expect(kindAsks(p)).toEqual([]);
    }
  );

  it("rule 1: another activity in the slot for one bunk one day does break fixed", () => {
    const p = propose((g, d, b) => {
      if (g === 2 && d === 2 && b === 0) return "Drama";
      return b === 0 ? "Carpool" : rotation(g, d, b);
    });
    expect(kindOf(p, "Carpool")).not.toBe("fixed");
  });

  it("rule 2: one bunk's steady Sports does not make Sports recurring when the others rotate it", () => {
    const sports = {
      1: [
        [0, 1],
        [2, 1],
        [4, 1]
      ],
      0: [
        [0, 0],
        [1, 3],
        [3, 1]
      ],
      2: [
        [1, 0],
        [2, 3],
        [4, 1]
      ],
      3: [
        [0, 3],
        [3, 0],
        [4, 0]
      ]
    };
    const p = propose((g, d, b) => {
      if (b === 2) return "Lunch";
      return sports[g].some(([sd, sb]) => sd === d && sb === b)
        ? "Sports"
        : fill(g, d, b);
    });
    expect(kindOf(p, "Sports")).toBe("activity");
    expect(kindAsks(p)).toEqual([]);
  });

  it("rule 2: Juniors together for Art once does not make Art recurring when Seniors rotate it", () => {
    const art = {
      0: [[0, 0]],
      1: [[0, 0]],
      2: [
        [1, 1],
        [2, 3],
        [3, 0]
      ],
      3: [
        [1, 3],
        [3, 1],
        [4, 0]
      ]
    };
    const p = propose((g, d, b) => {
      return art[g].some(([ad, ab]) => ad === d && ab === b)
        ? "Art"
        : fill(g, d, b);
    });
    expect(kindOf(p, "Art")).toBe("activity");
    expect(kindAsks(p)).toEqual([]);
  });

  it("rule 7: a division together at different times on two days, nobody else, is recurring", () => {
    const p = propose((g, d, b) => {
      return g < 2 && ((d === 0 && b === 0) || (d === 2 && b === 3))
        ? "Art"
        : fill(g, d, b);
    });
    expect(kindOf(p, "Art")).toBe("recurring");
    expect(kindAsks(p)).toEqual([]);
  });

  it("rule 4: a one-day file reads nothing as fixed; everyone together is recurring", () => {
    const p = propose((g, d, b) => {
      if (d !== 0) return "";
      return b === 2 ? "Lunch" : rotation(g, d, b);
    });
    expect(kindOf(p, "Lunch")).toBe("recurring");
    expect(p.fixed).toEqual([]);
    expect(kindAsks(p)).toEqual([]);
  });

  it("rule 4: with three groups, two bunks of different divisions together once is an activity", () => {
    const three = GROUPS.slice(0, 3);
    const p = buildProposal({
      files: byGroupFiles(three, (g, d, b) => {
        return d === 2 && b === 3 && g > 0 ? "Library" : fill(g, d, b);
      }),
      existing: null,
      terms,
      answers: {}
    });
    expect(kindOf(p, "Library")).toBe("activity");
    expect(kindAsks(p)).toEqual([]);
  });

  it("rule 7: one division's single Lunch 4 beside Lunch 1 is recurring, not asked", () => {
    const p = propose((g, d, b) => {
      if (g < 2 && b === 2) return "Lunch 1";
      if (g >= 2 && d === 2 && b === 3) return "Lunch 4";
      return fill(g, d, b);
    });
    expect(kindOf(p, "Lunch 1")).toBe("recurring");
    expect(kindOf(p, "Lunch 4")).toBe("recurring");
    expect(kindAsks(p)).toEqual([]);
  });

  it("rule 7: Juniors' Library Wednesday and Campfire Thursday, once each, are both recurring", () => {
    const p = propose((g, d, b) => {
      if (g < 2 && d === 2 && b === 0) return "Library";
      if (g < 2 && d === 3 && b === 3) return "Campfire";
      return fill(g, d, b);
    });
    expect(kindOf(p, "Library")).toBe("recurring");
    expect(kindOf(p, "Campfire")).toBe("recurring");
    expect(kindAsks(p)).toEqual([]);
  });

  it("rule 2 before rule 7: a name a division has at three or more times is an activity everywhere", () => {
    // Juniors together at Hike in Periods 1, 2 and 4 over the week; Seniors once.
    const hike = ["0|0", "1|1", "3|3"];
    const p = propose((g, d, b) => {
      if (g < 2 && hike.includes(`${d}|${b}`)) return "Hike";
      if (g >= 2 && d === 4 && b === 0) return "Hike";
      return fill(g, d, b);
    });
    expect(kindOf(p, "Hike")).toBe("activity");
    expect(kindAsks(p)).toEqual([]);
  });

  describe("rule 7: whole divisions together are a set time, even once", () => {
    const EIGHT = [
      "Aleph - Bunk 1",
      "Aleph - Bunk 2",
      "Bet - Bunk 3",
      "Bet - Bunk 4",
      "Gimmel - Bunk 5",
      "Gimmel - Bunk 6",
      "Daled - Bunk 7",
      "Daled - Bunk 8"
    ];
    const SIX = ["Art", "Soccer", "Drama", "Music", "Gaga", "Nature"];
    const read = (name, at) =>
      buildProposal({
        files: byGroupFiles(EIGHT, (g, d, b) => {
          return at(g, d, b) ? name : SIX[(g + b + d) % SIX.length];
        }),
        existing: null,
        terms,
        answers: {}
      });

    it.each([
      [
        "Aleph and Bet at Color War Practice once, Tuesday Period 2",
        (g, d, b) => g < 4 && d === 1 && b === 1
      ],
      [
        "Sports for Aleph and Bet Monday Period 1, Gimmel and Daled Wednesday Period 3",
        (g, d, b) =>
          (g < 4 && d === 0 && b === 0) || (g >= 4 && d === 2 && b === 3)
      ],
      [
        "Sports for Aleph and Bet Monday Period 1 and Thursday Period 3",
        (g, d, b) => g < 4 && ((d === 0 && b === 0) || (d === 3 && b === 3))
      ]
    ])("%s is recurring, not asked", (_, at) => {
      const p = read("Practice", at);
      expect(kindOf(p, "Practice")).toBe("recurring");
      expect(kindAsks(p)).toEqual([]);
    });

    it("Bunk 1 of Aleph with Bunk 3 of Bet once is an activity (rule 6)", () => {
      const p = read("Practice", (g, d, b) => {
        return (g === 0 || g === 2) && d === 1 && b === 1;
      });
      expect(kindOf(p, "Practice")).toBe("activity");
      expect(kindAsks(p)).toEqual([]);
    });
  });

  it("similar names: Swim and Swimming for one bunk each are asked, and answered different neither is recurring through the other", () => {
    const cell = (g, d, b) => {
      if ((d === 0 || d === 2) && b === 0 && g < 2) {
        return g === 0 ? "Swim" : "Swimming";
      }
      return fill(g, d, b) === "Swim" ? "Drama" : fill(g, d, b);
    };
    const asked = propose(cell);
    const pair = asked.reading.pairs.find(
      (x) => [x.a, x.b].sort().join("|") === "Swim|Swimming"
    );
    expect(pair).toBeDefined();
    const p = propose(cell, { [pair.id]: "different" });
    expect(kindOf(p, "Swim")).not.toBe("recurring");
    expect(kindOf(p, "Swimming")).not.toBe("recurring");
  });

  it("rule 1: a group that never has the name in its slot is not fixed (Carpool for three bunks of four)", () => {
    const p = propose((g, d, b) => {
      if (b === 0) return g === 3 ? fill(g, d, b) : "Carpool";
      return rotation(g, d, b);
    });
    expect(kindOf(p, "Carpool")).not.toBe("fixed");
    const blank = propose((g, d, b) => {
      if (b === 0) return g === 3 ? "" : "Carpool";
      return rotation(g, d, b);
    });
    expect(kindOf(blank, "Carpool")).not.toBe("fixed");
  });

  it("rule 1: a cell spelled otherwise, still asked, does not break a fixed Lunch (lunch, LUNCH)", () => {
    const p = propose((g, d, b) => {
      if (b === 2) {
        if (g === 1 && d === 3) return "lunch ";
        return g === 0 && d === 1 ? "LUNCH" : "Lunch";
      }
      return rotation(g, d, b);
    });
    expect(kindOf(p, "Lunch")).toBe("fixed");
    expect(p.reading.pairs.map((x) => x.reason)).toContain("spelling");
    expect(kindAsks(p)).toEqual([]);
  });

  it("rule 6: a division is every group of it in the program, a cell spelled otherwise counting until answered", () => {
    // Swim Return: Juniors Monday and Wednesday in Period 2; Bunk 2's Wednesday cell says
    // "Swim Returning". Bunk 1 with Bunk 3 the same way is no division.
    const read = (mate) =>
      propose((g, d, b) => {
        if ((d === 0 || d === 2) && b === 1 && (g === 0 || g === mate)) {
          return g === mate && d === 2 ? "Swim Returning" : "Swim Return";
        }
        return fill(g, d, b);
      });
    expect(kindOf(read(1), "Swim Return")).toBe("recurring");
    expect(kindAsks(read(1))).toEqual([]);
    expect(kindOf(read(2), "Swim Return")).toBe("activity");
    expect(kindAsks(read(2))).toEqual([]);
  });

  describe("rule 5: a week without the name is not a change of time", () => {
    const week = (n, cell) =>
      GROUPS.map((g, gi) =>
        csv(`Camp - ${g} - Week ${n}.csv`, [
          ["Time", ...DAYS],
          ...["Period 1 9:00-9:45", "Period 2 9:50-10:35"].map((b, bi) => [
            b,
            ...DAYS.map((_, d) => cell(gi, d, bi))
          ])
        ])
      );
    const read = (second) =>
      buildProposal({
        files: [
          ...week(1, (g, d, b) => (b === 0 ? "Flag" : rotation(g, d, b))),
          ...week(2, second)
        ],
        existing: null,
        terms,
        answers: {}
      });

    it("empty that week: still fixed, not asked", () => {
      const p = read((g, d, b) => (b === 0 ? "" : rotation(g, d, b)));
      expect(kindOf(p, "Flag")).toBe("fixed");
      expect(kindAsks(p)).toEqual([]);
    });

    it("other activities there that week: a set time, not asked", () => {
      const p = read((g, d, b) => rotation(g, d, b + 1));
      expect(kindOf(p, "Flag")).toBe("recurring");
      expect(kindAsks(p)).toEqual([]);
    });

    const twoWeeks = (first, second) =>
      buildProposal({
        files: [...week(1, first), ...week(2, second)],
        existing: null,
        terms,
        answers: {}
      });
    const juniorsFlag = (g, d, b) => {
      return g < 2 && b === 0 ? "Flag" : rotation(g, d, b);
    };

    it("rule 5: a bunk on a trip one day in week 2 is not a change of time", () => {
      const p = twoWeeks(juniorsFlag, (g, d, b) => {
        return g === 1 && d === 2 ? "Zoo trip" : juniorsFlag(g, d, b);
      });
      expect(kindOf(p, "Flag")).toBe("recurring");
      expect(kindAsks(p)).toEqual([]);
    });

    it("rule 5: the slot taken by another activity in week 2 is still asked", () => {
      const p = twoWeeks(juniorsFlag, (g, d, b) => {
        return g === 1 && d === 2 && b === 0 ? "Drama" : juniorsFlag(g, d, b);
      });
      expect(kindAsks(p).map((a) => [a.name, a.facts.reason])).toEqual([
        ["Flag", "weeks"]
      ]);
    });

    it("rule 3: the same slot in two weeks is enough repetition (Juniors' Library, Wednesday only)", () => {
      const library = (g, d, b) => {
        return g < 2 && d === 2 && b === 1 ? "Library" : rotation(g, d, b);
      };
      const p = twoWeeks(library, library);
      expect(kindOf(p, "Library")).toBe("recurring");
      expect(kindAsks(p)).toEqual([]);
    });

    it("rule 6: two bunks of different divisions together in both weeks are an activity", () => {
      const library = (g, d, b) => {
        const together = (g === 1 || g === 2) && d === 2 && b === 1;
        return together ? "Library" : rotation(g, d, b);
      };
      const p = twoWeeks(library, library);
      expect(kindOf(p, "Library")).toBe("activity");
      expect(kindAsks(p)).toEqual([]);
    });
  });

  it("rule 4: Lunch for everyone on a Friday of its own is fixed when fixed at that time Monday to Thursday", () => {
    const friday = ["Period 1 9:00-10:00", "Lunch 11:30-12:15"];
    const files = [
      ...byGroupFiles(GROUPS, (g, d, b) => {
        if (d === 4) return "";
        return b === 2 ? "Lunch" : rotation(g, d, b);
      }),
      ...GROUPS.map((g, gi) =>
        csv(`Friday - ${g}.csv`, [
          ["Time", "Friday"],
          [friday[0], ROTATION[gi]],
          [friday[1], "Lunch"]
        ])
      )
    ];
    const p = buildProposal({ files, existing: null, terms, answers: {} });
    expect(p.timetables.filter((t) => !t.leftOut)).toHaveLength(2);
    expect(p.fixed.filter((f) => f.name === "Lunch")).toHaveLength(2);
    expect(p.recurring.filter((r) => r.name === "Lunch")).toEqual([]);
  });
});

describe("rule 8: a division whose bunks always move together is one group (Greg 2026-10-27)", () => {
  // Each division together all day, rotating through more activities than periods.
  const NAMES = [
    "Archery",
    "Art",
    "Soccer",
    "Drama",
    "Music",
    "Gaga",
    "Nature"
  ];
  const travel = (g, d, b) => {
    const v = g < 2 ? 0 : 1;
    return b === 2 ? "Lunch" : NAMES[(v + b + d * 3) % NAMES.length];
  };

  it("reads each always-together division as one group, and says so", () => {
    const p = propose(travel);
    expect(p.groups.filter((g) => !g.leftOut).map((g) => g.name)).toEqual([
      "Juniors",
      "Seniors"
    ]);
    expect(
      importNotes(p, terms).filter((n) => n.key.startsWith("oneGroup|"))
    ).toEqual([
      {
        key: "oneGroup|Juniors",
        text: expect.stringContaining("Bunk 1, Bunk 2 always do the same thing")
      },
      {
        key: "oneGroup|Seniors",
        text: expect.stringContaining("Seniors is set up as one")
      }
    ]);
  });

  it("a division whose bunks differ in one time block stays a division of bunks", () => {
    const p = propose((g, d, b) => {
      return g === 1 && d === 4 && b === 3 ? "Ropes" : travel(g, d, b);
    });
    const names = p.groups.filter((g) => !g.leftOut).map((g) => g.name);
    expect(names).toEqual(["Bunk 1", "Bunk 2", "Seniors"]);
  });

  const keptNote = (p) =>
    importNotes(p, terms).find((n) => n.key === "oneGroup|Juniors");
  const groupNames = (p) =>
    p.groups.filter((g) => !g.leftOut).map((g) => g.name);
  const read = (existing, answers = {}) =>
    buildProposal({
      files: byGroupFiles(GROUPS, travel),
      existing,
      terms,
      answers
    });

  it("rule 8: bunks the camp already has stay as they are, matched, with a note", () => {
    const existing = existingSetup({
      programs: [
        program("p1", "Main", {
          blocks: [],
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
    const p = read(existing);
    expect(groupNames(p)).toEqual(["Bunk 1", "Bunk 2", "Seniors"]);
    expect(p.groups.filter((g) => g.name.startsWith("Bunk"))).toEqual([
      expect.objectContaining({ isNew: false }),
      expect.objectContaining({ isNew: false })
    ]);
    expect(keptNote(p).text).toContain("the camp already has them");
  });

  const at = (h, m = 0) => h * 60 + m;
  const BLOCK_TIMES = [
    ["tb1", "Period 1", at(9), at(9, 45)],
    ["tb2", "Period 2", at(9, 50), at(10, 35)],
    ["tb3", "Lunch", at(11, 30), at(12, 15)],
    ["tb4", "Period 3", at(13), at(13, 45)]
  ];
  // The camp as the first import of the travelling file saved it: Juniors and Seniors as groups.
  const savedAsOne = (
    divisions = [
      [
        "d1",
        "Main",
        [
          ["g1", "Juniors"],
          ["g2", "Seniors"]
        ]
      ]
    ]
  ) =>
    existingSetup({
      programs: [program("p1", "Main", { blocks: BLOCK_TIMES, divisions })]
    });

  it("rule 8: re-importing the same file matches the group read as one last time", () => {
    const p = read(savedAsOne());
    expect(p.timetables[0].program.id).toBe("p1");
    expect(groupNames(p)).toEqual(["Juniors", "Seniors"]);
    expect(p.groups.every((g) => g.isNew === false)).toBe(true);
    expect(NAMES.map((n) => kindOf(p, n)).filter(Boolean)).not.toContain(
      "recurring"
    );
    expect(p.reading.splitAsks).toEqual([]);
  });

  it("rule 8: re-imported with the bunks now differing, it asks to split, keeping the group until answered", () => {
    const differ = (g, d, b) => {
      return g === 1 && d === 4 && b === 3 ? "Ropes" : travel(g, d, b);
    };
    const files = byGroupFiles(GROUPS, differ);
    const reread = (answers) =>
      buildProposal({ files, existing: savedAsOne(), terms, answers });
    const p = reread({});
    expect(p.reading.splitAsks.map((a) => a.group)).toEqual(["Juniors"]);
    const card = questionCards(p, terms, {}).find((c) =>
      c.id.startsWith("split|Juniors")
    );
    expect(card.answer).toBeNull();
    expect(card.subtitle).toContain("moved together last time");
    expect(groupNames(p)).toEqual(["Juniors", "Seniors"]);
    expect(p.groups.find((g) => g.name === "Juniors").isNew).toBe(false);
    const split = reread({ [card.id]: "split" });
    expect(groupNames(split)).toEqual(["Bunk 1", "Bunk 2", "Seniors"]);
  });

  it("rule 8: a bunk of the same name in another division of the camp does not stop the merge", () => {
    const p = read(savedAsOne([["d2", "Seniors", [["g7", "Bunk 1"]]]]));
    expect(groupNames(p)).toContain("Juniors");
  });

  it("rule 8: a one-day file and a one-block file keep their bunks, with no note", () => {
    const oneDay = buildProposal({
      files: byGroupFiles(GROUPS, (g, d, b) => {
        return d === 1 ? travel(g, d, b) : "";
      }),
      existing: null,
      terms,
      answers: {}
    });
    expect(groupNames(oneDay)).toEqual(GROUPS.map((g) => g.split(" - ")[1]));
    expect(keptNote(oneDay)).toBeUndefined();
    const oneBlock = buildProposal({
      files: byGroupFiles(GROUPS, (g, d, b) => (b === 0 ? "Color War" : "")),
      existing: null,
      terms,
      answers: {}
    });
    expect(groupNames(oneBlock)).toEqual(GROUPS.map((g) => g.split(" - ")[1]));
    expect(keptNote(oneBlock)).toBeUndefined();
  });

  it("rule 8: a remembered answer that is not about a group's identity does not stop the merge", () => {
    const p = read(null, { "cross|Bunk 1|Monday|Period 1": "Art" });
    expect(groupNames(p)).toContain("Juniors");
  });

  it("rule 8: a remembered answer about a bunk (deleted) keeps the bunks, and still applies", () => {
    const deleted = "deleted|Group|Main|Bunk 2";
    const p = read(null, { [deleted]: "deleted" });
    expect(keptNote(p).text).toContain("an answer about them is remembered");
    expect(p.groups.find((g) => g.name === "Bunk 2").leftOut).toBe(true);
    expect(groupNames(p)).not.toContain("Juniors");
  });

  it("a travelling division's activity met once or twice a week is an activity, not a set time", () => {
    // As camp L1T-011: Juniors at Archery Monday Period 2; Seniors Monday Period 1 and
    // Thursday Period 3 (rule 7 no longer applies: Juniors is one group, not a division).
    const p = propose(travel);
    const kinds = NAMES.map((n) => kindOf(p, n)).filter(Boolean);
    expect(kinds.length).toBeGreaterThan(3);
    expect(new Set(kinds)).toEqual(new Set(["activity"]));
    expect(kindOf(p, "Lunch")).toBe("fixed");
    expect(p.asks.filter((a) => a.type === "kind")).toEqual([]);
  });
});

describe("activities take their values from the file", () => {
  it("times a week, length, groups at once, and who did it", () => {
    const cell = (g, d, b) => {
      if (g >= 2 && d === g - 2 && (b === 0 || b === 1)) return "Boating";
      if (b === 2) return "Lunch";
      return rotation(g, d, b);
    };
    const p = propose(cell);
    const boating = p.activities.find((a) => a.name === "Boating");
    expect(boating).toMatchObject({
      length: 2,
      min: 1,
      max: 1,
      groupsAtOnce: 1
    });
    expect(boating.who.names).toEqual(["Seniors"]);
    const swim = p.activities.find((a) => a.name === "Swim");
    expect(swim.who.names).toEqual([]);
    expect(swim.groupsAtOnce).toBeGreaterThanOrEqual(1);
  });
});

describe("similar names: always asked, never merged on their own", () => {
  it.each([
    ["Music", "Musik", "letter"],
    ["Swim", "Swimming", "ending"],
    ["Arts & Crafts", "arts and crafts", "spelling"],
    ["Gaga", "GaGa", "spelling"],
    ["Archery", "Archrey", "letter"],
    ["Lunch 1", "Lunch 2", null],
    ["Bunk 3A", "Bunk 3B", null],
    ["Art", "Arts", "ending"],
    ["Gym", "Gyms", "ending"],
    ["Art", "Arty", null],
    ["Soccer", "Hockey", null]
  ])("%s / %s: %s", (a, b, reason) => {
    expect(similarity(a, b)).toBe(reason);
  });

  it("raises names against the camp's, but not two the camp already has", () => {
    const pairs = similarPairs(
      "activity",
      [{ name: "Musik", count: 1 }],
      ["Music", "Muzik"]
    );
    expect(pairs.map((p) => [p.a, p.b, p.existing])).toEqual([
      ["Musik", "Music", "Music"],
      ["Musik", "Muzik", "Muzik"]
    ]);
  });

  it("merges only as answered, and leave-out leaves both out", () => {
    const files = samples("all-camp");
    const first = buildProposal({ files, existing: null, terms, answers: {} });
    const [pair] = first.reading.pairs;
    expect([pair.a, pair.b]).toEqual(["Music", "Musik"]);
    expect(first.activities.map((a) => a.name)).toContain("Musik");
    const merged = buildProposal({
      files,
      existing: null,
      terms,
      answers: { [pair.id]: "a" }
    });
    expect(merged.activities.map((a) => a.name)).not.toContain("Musik");
    const music = merged.activities.find((a) => a.name === "Music");
    expect(music.max).toBeGreaterThanOrEqual(
      first.activities.find((a) => a.name === "Music").max
    );
    const left = buildProposal({
      files,
      existing: null,
      terms,
      answers: { [pair.id]: LEAVE_OUT }
    });
    expect(left.activities.map((a) => a.name)).not.toContain("Music");
    expect(left.activities.map((a) => a.name)).not.toContain("Musik");
  });
});

describe("a large camp", () => {
  it("40 groups, 14 time blocks, a week of five days reads in well under two seconds", () => {
    const groups = Array.from(
      { length: 40 },
      (_, i) => `Division ${Math.floor(i / 5)} - Bunk ${i + 1}`
    );
    const blocks = Array.from({ length: 14 }, (_, b) => {
      const start = 8 * 60 + b * 35;
      const t = (m) =>
        `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, "0")}`;
      return `Period ${b + 1} ${t(start)}-${t(start + 30)}`;
    });
    const names = Array.from(
      { length: 50 },
      (_, i) =>
        `Activity ${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`
    );
    const files = byGroupFiles(
      groups,
      (g, d, b) => {
        return b === 6
          ? "Lunch"
          : names[(g * 3 + b * 7 + d * 11) % names.length];
      },
      blocks
    );
    const started = Date.now();
    const p = buildProposal({ files, existing: null, terms, answers: {} });
    questionCards(p, terms, {});
    expect(Date.now() - started).toBeLessThan(2000);
    expect(p.groups).toHaveLength(40);
    expect(p.fixed.map((f) => f.name)).toEqual(["Lunch"]);
  });
});

describe("similar-name answers merge sets, never swap names (review finding 6)", () => {
  const pair = (a, b, existing = null) => ({ id: `${a}|${b}`, a, b, existing });

  it("a cycle of answers keeps one spelling for all three", () => {
    const pairs = [
      pair("Swim", "Swimm"),
      pair("Swimm", "Swims"),
      pair("Swim", "Swims")
    ];
    const merged = mergesFrom(pairs, {
      "Swim|Swimm": "b",
      "Swimm|Swims": "b",
      "Swim|Swims": "a"
    });
    const kept = new Set(
      ["Swim", "Swimm", "Swims"].map((n) => merged.get(n) || n)
    );
    expect(kept.size).toBe(1);
  });

  it("the camp's spelling wins when one of them is set up", () => {
    const pairs = [pair("Musik", "Music", "Music"), pair("Musik", "Muzik")];
    const merged = mergesFrom(pairs, {
      "Musik|Music": "b",
      "Musik|Muzik": "b"
    });
    expect(merged.get("Musik")).toBe("Music");
    expect(merged.get("Muzik")).toBe("Music");
  });

  it("different keeps them apart", () => {
    expect(
      mergesFrom([pair("Art", "Arts")], { "Art|Arts": "different" }).size
    ).toBe(0);
  });
});
