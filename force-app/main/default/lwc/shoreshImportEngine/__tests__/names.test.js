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
