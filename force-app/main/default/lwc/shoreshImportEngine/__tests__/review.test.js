// docs/import/review.md (INGEST-5.n): "Shoresh read these as": what the import read without
// asking, in one list, grouped, each line with a one-click change.
import {
  buildProposal,
  importNotes,
  planFor,
  questionCards,
  readAsGroups
} from "./data/engine";
import { csv, existingSetup, terms } from "./data/samples";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const BLOCKS = ["9:00-9:45", "9:50-10:35", "12:00-12:45"];
const GROUPS = ["Bunk 1", "Bunk 2", "Bunk 3", "Bunk 4"];
const ROTATION = ["Art", "Soccer", "Drama", "Music"];

/** An all-camp week: a rotation, then Swim for everyone, then Lunch for everyone. */
function campWeek(groups = GROUPS, cell = defaultCell, divisionRow = null) {
  return DAYS.map((day, d) =>
    csv(`Camp ${day}.csv`, [
      ...(divisionRow ? [["", ...divisionRow]] : []),
      ["Time", ...groups],
      ...BLOCKS.map((b, bi) => [b, ...groups.map((_, g) => cell(g, d, bi))])
    ])
  );
}

function defaultCell(g, d, b) {
  if (b === 1) {
    return "Swim";
  }
  return b === 2 ? "Lunch" : ROTATION[(g + d) % 4];
}

const propose = (files, answers = {}, existing = null) =>
  buildProposal({ files, existing, terms, answers });

function lines(p, answers = {}) {
  return readAsGroups(p, terms, questionCards(p, terms, answers));
}

function line(p, group, name, answers) {
  const found = lines(p, answers).find((g) => g.key === group);
  return found ? found.lines.find((l) => l.name === name) : undefined;
}

function kindOf(p, name) {
  if (p.fixed.some((x) => x.name === name)) return "fixed";
  if (p.recurring.some((x) => x.name === name)) return "recurring";
  return p.activities.some((x) => x.name === name) ? "activity" : null;
}

describe("INGEST-5.1: names read as activity, fixed or recurring", () => {
  it("INGEST-5.1: each new name read without asking is listed in its kind's group, counted", () => {
    const p = propose(campWeek());
    const groups = lines(p);
    expect(groups.map((g) => [g.key, g.label])).toEqual([
      ["activity", "4 activities"],
      ["fixed", "2 fixed activities"]
    ]);
    expect(groups[0].lines.map((l) => l.name)).toEqual(ROTATION.slice().sort());
    expect(line(p, "fixed", "Swim").answer).toBe("fixed");
  });

  it("INGEST-5.1: one click changes it, the setup follows, and the save remembers it", () => {
    const files = campWeek();
    const before = propose(files);
    const swim = line(before, "fixed", "Swim");
    expect(swim.options.map((o) => o.value)).toEqual([
      "fixed",
      "recurring",
      "activity"
    ]);
    const answers = { [swim.id]: "activity" };
    const after = propose(files, answers);
    expect(kindOf(after, "Swim")).toBe("activity");
    expect(line(after, "activity", "Swim", answers).answer).toBe("activity");
    const plan = planFor(after, null, "a0S000000000001", { answers });
    expect(plan.remember).toContainEqual({ key: swim.id, answer: "activity" });
  });

  it("INGEST-5.1 counter-case: a rotation offers only Activity, and a change that does not fit is not taken", () => {
    const files = campWeek();
    const art = line(propose(files), "activity", "Art");
    expect(art.options.map((o) => o.value)).toEqual(["activity"]);
    const p = propose(files, { [art.id]: "fixed" });
    expect(kindOf(p, "Art")).toBe("activity");
  });

  it("INGEST-5.1 counter-case: a name the camp already has is not listed", () => {
    const existing = existingSetup({
      activities: [{ Id: "a01000000000001", Name: "Art", Length__c: 1 }]
    });
    const p = buildProposal({
      files: campWeek(),
      existing,
      terms,
      answers: {}
    });
    expect(line(p, "activity", "Art")).toBeUndefined();
  });
});

describe("INGEST-5.2: two spellings read as one name", () => {
  const files = () =>
    campWeek(GROUPS, (g, d, b) => {
      if (b !== 2) {
        return defaultCell(g, d, b);
      }
      return g === 0 && d === 2 ? "Lunch2" : "Lunch 2";
    });

  it("INGEST-5.2: listed as names joined, not in the notes; Keep apart keeps both", () => {
    const p = propose(files());
    const joined = line(p, "joined", "Lunch2 → Lunch 2");
    expect(joined.options.map((o) => o.label)).toEqual(["Same", "Keep apart"]);
    expect(joined.answer).not.toBe("different");
    expect(importNotes(p, terms).some((n) => n.key.startsWith("readAs|"))).toBe(
      false
    );
    const answers = { [joined.id]: "different" };
    const apart = propose(files(), answers);
    expect(apart.usable.some((x) => x.text === "Lunch2")).toBe(true);
    expect(line(apart, "joined", "Lunch2 → Lunch 2", answers).answer).toBe(
      "different"
    );
  });
});

describe("INGEST-5.3: a division of one", () => {
  it("INGEST-5.3: listed with its dropdown; changing it moves the group", () => {
    const groups = [
      "Juniors - Bunk 1",
      "Juniors - Bunk 2",
      "Seniors - Bunk 3",
      "CIT"
    ];
    const files = campWeek(groups);
    const p = propose(files);
    const cit = line(p, "division", "CIT");
    expect(cit.select).toBe(true);
    expect(cit.answer).toBe("CIT");
    const answers = { [cit.id]: "Seniors" };
    const moved = propose(files, answers);
    expect(moved.groups.find((g) => g.name === "CIT").division).toBe("Seniors");
    expect(line(moved, "division", "CIT", answers).answer).toBe("Seniors");
  });
});

describe("INGEST-5.4: one week's day with its own times", () => {
  const BLOCKS_W = [
    "Period 1 9:00-9:45",
    "Lunch 11:30-12:15",
    "Period 3 1:00-1:45",
    "Period 4 1:50-2:35"
  ];
  const SHORT = [
    "Period 1 9:00-9:45",
    "Lunch 11:30-12:15",
    "Activity A 1:00-2:35"
  ];
  const G = ["Bunk 1", "Bunk 2", "Bunk 3"];
  const R = ["Art", "Swim", "Sports", "Drama", "Music", "Nature"];
  const weekFile = (w) => ({
    name: `Camp - Week ${w + 1}.csv`,
    sheets: [
      {
        name: `Week ${w + 1}`,
        merges: [],
        rows: DAYS.flatMap((day, d) => {
          const blocks = w === 1 && d === 4 ? SHORT : BLOCKS_W;
          return [
            [day],
            ["Time", ...G],
            ...blocks.map((b, bi) => [
              b,
              ...G.map((_, g) => {
                return /^Lunch/.test(b)
                  ? "Lunch"
                  : R[(g + bi + d * 2 + w * 3) % R.length];
              })
            ]),
            []
          ];
        })
      }
    ]
  });

  it("INGEST-5.4: listed as a day of its own; A second program keeps it one", () => {
    const files = [0, 1, 2].map(weekFile);
    const existing = existingSetup();
    const p = buildProposal({ files, existing, terms, answers: {} });
    const day = line(p, "specialDay", "Week 2's Friday");
    expect(day.answer).toBe("special");
    expect(p.reading.timetables).toHaveLength(1);
    const answers = { [day.id]: "program" };
    const two = buildProposal({ files, existing, terms, answers });
    expect(two.reading.timetables).toHaveLength(2);
    expect(line(two, "specialDay", "Week 2's Friday", answers).answer).toBe(
      "program"
    );
  });
});
