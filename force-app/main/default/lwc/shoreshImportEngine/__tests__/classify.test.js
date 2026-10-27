import { buildProposal, LEAVE_OUT, questionCards } from "./data/engine";
import { mergesFrom, similarity, similarPairs } from "../names";
import {
  byGroupFiles,
  csv,
  DAYS,
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

  it("rule 3: one division once in a one-week file is asked; answered, it is recurring", () => {
    const cell = (g, d, b) => {
      return d === 2 && b === 3 && g < 2 ? "Library" : rotation(g, d, b);
    };
    const asked = propose(cell).asks.find((a) => a.id === "kind|Library");
    expect(asked.facts.reason).toBe("split");
    const p = propose(cell, { "kind|Library": "recurring" });
    expect(kindOf(p, "Library")).toBe("recurring");
    expect(p.recurring[0]).toMatchObject({ block: 3, days: ["Wednesday"] });
    expect(p.recurring[0].who.names).toEqual(["Juniors"]);
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
        csv(`Week ${n} - ${g}.csv`, [
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

  it("rule 3: a division together at different times on two days, nobody else, is asked", () => {
    const cell = (g, d, b) => {
      return g < 2 && ((d === 0 && b === 0) || (d === 2 && b === 3))
        ? "Art"
        : fill(g, d, b);
    };
    const ask = kindAsks(propose(cell)).find((a) => a.name === "Art");
    expect(ask.facts.reason).toBe("split");
    expect(kindOf(propose(cell, { "kind|Art": "recurring" }), "Art")).toBe(
      "recurring"
    );
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

  describe("rule 5: a week without the name is not a change of time", () => {
    const week = (n, cell) =>
      GROUPS.map((g, gi) =>
        csv(`Week ${n} - ${g}.csv`, [
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
