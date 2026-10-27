// docs/import/names-and-divisions.md: a division of one (rule 1), and names read as the same
// without asking (rules 2 and 3), each with its counter-case.
import { buildProposal, importNotes, questionCards } from "./data/engine";
import { csv, terms } from "./data/samples";
import {
  plainEnding,
  readWithoutAsking,
  sameSpelling,
  sitsLike
} from "../names";
import { ownDivisions } from "../structure";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const BLOCKS = ["9:00-9:45", "9:50-10:35", "12:00-12:45"];

/** An all-camp week; divisionRow null for a file with no divisions. */
function campWeek(divisionRow, groups, cell) {
  return DAYS.map((day, d) =>
    csv(`Camp ${day}.csv`, [
      ...(divisionRow ? [["", ...divisionRow]] : []),
      ["Time", ...groups],
      ...BLOCKS.map((b, bi) => [b, ...groups.map((_, g) => cell(g, d, bi))])
    ])
  );
}

const GROUPS = ["Bunk 1", "Bunk 2", "Bunk 3", "Bunk 4"];
const ACTIVITIES = ["Art", "Soccer", "Drama", "Music"];

/** Block 0 a rotation, block 1 `second`, block 2 `lunch` (each a function of g, d). */
function week(second, lunch = () => "Lunch 2") {
  return campWeek(null, GROUPS, (g, d, b) => {
    if (b === 0) {
      return ACTIVITIES[(g + d) % 4];
    }
    return b === 1 ? second(g, d) : lunch(g, d);
  });
}

const propose = (files, answers = {}) =>
  buildProposal({ files, existing: null, terms, answers });
const unanswered = (p) =>
  questionCards(p, terms, {}).filter((c) => c.answer === null);
const notesOf = (p) => importNotes(p, terms).map((n) => n.key);
const names = (p) => [...new Set(p.usable.map((x) => x.text))].sort();

describe("rule 1: a division of one", () => {
  it("a group with no division beside divided groups is its own division, said in the notes", () => {
    const files = campWeek(
      null,
      ["Juniors - Bunk 1", "Juniors - Bunk 2", "Seniors - Bunk 3", "CIT"],
      (g, d, b) => (b === 2 ? "Lunch" : ACTIVITIES[(g + b + d) % 4])
    );
    const p = propose(files);
    expect(p.groups.map((g) => [g.name, g.division])).toEqual([
      ["Bunk 1", "Juniors"],
      ["Bunk 2", "Juniors"],
      ["Bunk 3", "Seniors"],
      ["CIT", "CIT"]
    ]);
    expect(unanswered(p).filter((c) => c.select === "division")).toEqual([]);
    expect(notesOf(p)).toContain("ownDivision|CIT");
  });

  it("counter-case: a file with no divisions anywhere keeps its groups undivided", () => {
    const groups = [
      { name: "Bunk 1", division: null, timetable: 0 },
      { name: "CIT", division: null, timetable: 0 }
    ];
    expect(ownDivisions(groups)).toEqual(groups);
    const p = propose(week((g) => ACTIVITIES[(g + 1) % 4]));
    expect(p.reading.groups.some((g) => g.ownDivision)).toBe(false);
    expect(notesOf(p).some((k) => k.startsWith("ownDivision|"))).toBe(false);
  });
});

describe("rule 2: the same name spelled with other spacing, capitals or punctuation", () => {
  it("Lunch2 once among Lunch 2 is read as Lunch 2, not asked, said in the notes", () => {
    const p = propose(
      week(
        (g, d) => ACTIVITIES[(g + d + 1) % 4],
        (g, d) => (g === 0 && d === 2 ? "Lunch2" : "Lunch 2")
      )
    );
    expect(p.reading.pairs).toEqual([]);
    expect(names(p)).not.toContain("Lunch2");
    expect(notesOf(p)).toContain("readAs|activity|Lunch2");
    expect(sameSpelling("Arts&Crafts", "Arts & Crafts")).toBe(true);
  });

  it("counter-case: different numbers never merge", () => {
    expect(sameSpelling("Lunch 2", "Lunch 3")).toBe(false);
    expect(sameSpelling("Bunk 1 2", "Bunk 12")).toBe(false);
  });

  it("a remembered answer about the pair still wins (keyed by the pair, read name kept)", () => {
    const files = week(
      (g, d) => ACTIVITIES[(g + d + 1) % 4],
      (g, d) => (g === 0 && d === 2 ? "Lunch2" : "Lunch 2")
    );
    const first = propose(files);
    expect(
      first.activities.concat(first.fixed, first.recurring).map((a) => a.name)
    ).not.toContain("Lunch2");
    const id = "similar|activity|lunch2|lunch2|Lunch 2|Lunch2";
    const kept = propose(files, { [id]: "different" });
    expect(names(kept)).toContain("Lunch2");
  });
});

describe("rule 3: the same name with another ending, in the same place", () => {
  const swimReturn = (rare) => (g, d) => {
    return g === 0 && d === 2 ? rare : "Swim Return";
  };

  it("Swim Returning once where every other group has Swim Return is read as Swim Return", () => {
    const p = propose(week(swimReturn("Swim Returning")));
    expect(p.reading.pairs).toEqual([]);
    expect(names(p)).not.toContain("Swim Returning");
    expect(notesOf(p)).toContain("readAs|activity|Swim Returning");
  });

  it("a deleted name is matched by the read name: Swim Returning goes with Swim Return", () => {
    const p = propose(week(swimReturn("Swim Returning")), {
      "deleted|Activity||Swim Return": "deleted"
    });
    const all = [...p.activities, ...p.fixed, ...p.recurring].map(
      (a) => a.name
    );
    expect(all).not.toContain("Swim Returning");
    expect(all).not.toContain("Swim Return");
    expect(p.deleted.map((d) => d.name)).toEqual(["Swim Return"]);
  });

  it("counter-case: Swim and Swimming both common are asked", () => {
    const p = propose(week((g) => (g < 2 ? "Swim" : "Swimming")));
    expect(p.reading.pairs.map((x) => [x.a, x.b])).toEqual([
      ["Swim", "Swimming"]
    ]);
  });

  it("counter-case: the rare form at an unrelated time is asked", () => {
    const placements = [
      ...GROUPS.map((group) => ({
        text: "Swim Return",
        group,
        week: "",
        day: "Monday",
        block: "9:50-10:35"
      })),
      {
        text: "Swim Returning",
        group: "Bunk 1",
        week: "",
        day: "Tuesday",
        block: "12:00-12:45"
      }
    ];
    expect(sitsLike("Swim Returning", "Swim Return", placements)).toBe(false);
    const pair = {
      id: "x",
      kind: "activity",
      a: "Swim Return",
      b: "Swim Returning",
      aCount: 10,
      bCount: 1,
      existing: null,
      reason: "ending"
    };
    expect(readWithoutAsking([pair], placements).asked).toEqual([pair]);
  });

  it("counter-case: never across different words", () => {
    expect(plainEnding("Swim Returning", "Swim Return")).toBe(true);
    expect(plainEnding("Free Swimming", "Swim Return")).toBe(false);
    expect(plainEnding("Swim Returning", "Lake Return")).toBe(false);
  });
});

// Review of PR 166.
const DIVIDED = ["Juniors - Bunk 1", "Juniors - Bunk 2", "Seniors - Bunk 3"];
const rotate = (g, d, b) => (b === 2 ? "Lunch" : ACTIVITIES[(g + b + d) % 4]);
const kindOf = (p, name) => {
  if (p.fixed.some((a) => a.name === name)) {
    return "fixed";
  }
  if (p.recurring.some((a) => a.name === name)) {
    return "recurring";
  }
  return p.activities.some((a) => a.name === name) ? "activity" : null;
};

describe("rule 1 with answers and camp-wide columns", () => {
  it("a remembered division answer replaces rule 1, and the note is not shown", () => {
    const files = campWeek(null, [...DIVIDED, "CIT"], rotate);
    const p = propose(files, { "division|CIT": "Seniors" });
    expect(p.groups.find((g) => g.name === "CIT").division).toBe("Seniors");
    expect(notesOf(p).some((k) => k.startsWith("ownDivision|"))).toBe(false);
  });

  it("an All Camp, Everyone or Staff column is never a division of one", () => {
    for (const column of ["All Camp", "everyone", "STAFF", "Counselors"]) {
      const p = propose(campWeek(null, [...DIVIDED, column], rotate));
      const g = p.groups.find((x) => x.recordName === column);
      expect({ column, own: !!g && g.division === column }).toEqual({
        column,
        own: false
      });
      expect(notesOf(p).some((k) => k.startsWith("ownDivision|"))).toBe(false);
    }
  });
});

describe("rule 4: a division spelled like another is asked, never a division of one", () => {
  const files = () =>
    campWeek(
      null,
      [
        "Juniors - Bunk 1",
        "Juniors - Bunk 2",
        "Junoirs - Bunk 4",
        "Seniors - Bunk 3"
      ],
      rotate
    );

  it("Junoirs beside Juniors is asked as a similar division name", () => {
    const p = propose(files());
    expect(p.reading.pairs.map((x) => [x.kind, x.a, x.b])).toEqual([
      ["division", "Juniors", "Junoirs"]
    ]);
    const card = unanswered(p).find((c) => c.id === p.reading.pairs[0].id);
    expect(card.title).toContain("Division".toLowerCase());
  });

  it("answered the same, Bunk 4 is in Juniors", () => {
    const first = propose(files());
    const p = propose(files(), { [first.reading.pairs[0].id]: "a" });
    expect(p.groups.find((g) => g.name === "Bunk 4").division).toBe("Juniors");
  });
});

describe("rules 2 and 3: a question both of whose names are read as one is not asked", () => {
  it("lunch 2 and Lunch-2, both read as Lunch 2", () => {
    const p = propose(
      week(
        (g, d) => ACTIVITIES[(g + d + 1) % 4],
        (g, d) => {
          if (g === 0 && d === 2) {
            return "lunch 2";
          }
          return g === 1 && d === 3 ? "Lunch-2" : "Lunch 2";
        }
      )
    );
    expect(p.reading.pairs).toEqual([]);
    expect(names(p).filter((n) => /lunch/i.test(n))).toEqual(["Lunch 2"]);
  });

  it("swim and Swims, both read as Swim", () => {
    const pairs = [
      {
        id: "1",
        kind: "activity",
        a: "Swim",
        b: "swim",
        aCount: 20,
        bCount: 1,
        existing: null,
        reason: "spelling"
      },
      {
        id: "2",
        kind: "activity",
        a: "Swim",
        b: "Swims",
        aCount: 20,
        bCount: 1,
        existing: null,
        reason: "ending"
      },
      {
        id: "3",
        kind: "activity",
        a: "Swims",
        b: "swim",
        aCount: 1,
        bCount: 1,
        existing: null,
        reason: "ending"
      }
    ];
    const at = (text, group) => ({
      text,
      group,
      week: "",
      day: "Monday",
      block: "9:00"
    });
    const placements = [at("Swim", "A"), at("swim", "B"), at("Swims", "C")];
    const r = readWithoutAsking(pairs, placements);
    expect(r.read.map((x) => [x.from, x.to])).toEqual([
      ["swim", "Swim"],
      ["Swims", "Swim"]
    ]);
    expect(r.asked).toEqual([]);
  });
});

describe("rules 1-3 with rule 7 (whole divisions at once) and rule 8 (one group)", () => {
  it("an activity only CIT does, at different times, stays an activity", () => {
    const files = campWeek(null, [...DIVIDED, "CIT"], (g, d, b) => {
      if (g === 3 && b === d % 2) {
        return "Leadership";
      }
      return rotate(g, d, b);
    });
    const p = propose(files);
    expect(p.groups.find((g) => g.name === "CIT").division).toBe("CIT");
    expect(kindOf(p, "Leadership")).toBe("activity");
  });

  it("an item only CIT has, in one slot every day, is a set time like any division's", () => {
    const files = campWeek(null, [...DIVIDED, "CIT"], (g, d, b) => {
      return g === 3 && b === 0 ? "Staff Training" : rotate(g, d, b);
    });
    expect(kindOf(propose(files), "Staff Training")).toBe("recurring");
  });

  it("a division read as one group (rule 8) is not split or re-divided by rule 1", () => {
    const files = campWeek(
      null,
      [
        "Juniors - Bunk 1",
        "Juniors - Bunk 2",
        "Seniors - Bunk 3",
        "Seniors - Bunk 4",
        "CIT"
      ],
      (g, d, b) => {
        if (b === 2) {
          return "Lunch";
        }
        const unit = g < 2 ? 0 : g < 4 ? 1 : 2;
        return ACTIVITIES[(unit + b + d) % 4];
      }
    );
    const p = propose(files);
    expect(p.groups.map((g) => [g.name, g.division])).toEqual([
      ["Juniors", null],
      ["Seniors", null],
      ["CIT", "CIT"]
    ]);
    expect(notesOf(p)).toEqual(
      expect.arrayContaining(["ownDivision|CIT", "oneGroup|Juniors"])
    );
  });
});
