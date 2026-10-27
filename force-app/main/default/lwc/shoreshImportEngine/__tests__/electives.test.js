// Electives in last year's file (electives slice E9; wiki plan §6.1; repo ADR 0006 choice 23, ADR
// 0018 choices 45 to 50; desktop ADR 2026-10-11-import-electives-keep-their-shape and Director
// Guide §6 "Double-period electives"): an elective word or a list cell is an elective set, its
// choices proposed offerings, a double period linked choices; asked only about what was found.
import {
  buildProposal,
  importNotes,
  LEAVE_OUT,
  planFor,
  questionCards,
  unplacedLines
} from "./data/engine";
import { byGroupFiles, existingSetup, terms } from "./data/samples";
import { buildTerms } from "c/shoreshTerms";

const GROUPS = [
  "Juniors - Bunk 1",
  "Juniors - Bunk 2",
  "Seniors - Bunk 3",
  "Seniors - Bunk 4"
];
// Blocks 0 Period 1 (9:00), 1 Period 2 (9:50), 2 Lunch, 3 Period 3. Days 0-4.
const LIST = '"Hiking, Fishing, Kayaking"';
const ROTATION = ["Swim", "Art", "Soccer", "Drama"];

function rotation(g, d, b) {
  if (b === 2) return "Lunch";
  return ROTATION[(g + b + d) % ROTATION.length];
}

/** Chugim on Tuesday Period 3 for everyone; the list on Thursday, Periods 1 and 2. */
function week(g, d, b) {
  if (d === 1 && b === 3) return "Chugim";
  if (d === 3 && b <= 1) return LIST;
  return rotation(g, d, b);
}

const WEEK1 = {
  Id: "w1",
  Name: "Week 1",
  StartDate__c: "2027-06-28",
  EndDate__c: "2027-07-02"
};

/** A week whose cells the test picks hold text, the rest as otherwise has them. */
function withCells(test, text, otherwise = week) {
  return (g, d, b) => {
    if (test(g, d, b)) {
      return text;
    }
    return otherwise(g, d, b);
  };
}

function propose(
  cell = week,
  answers = {},
  existing = existingSetup({ weeks: [WEEK1] })
) {
  return buildProposal({
    files: byGroupFiles(GROUPS, cell),
    existing,
    terms,
    answers
  });
}

const setNamed = (p, name) => p.electives.sets.find((s) => s.name === name);
const LIST_SET = "Electives (Fishing, Hiking, Kayaking)";

describe("electives read from last year's file", () => {
  it("an elective word is a set, not asked: said with its one escape", () => {
    const p = propose();
    const chugim = setNamed(p, "Chugim");
    expect(chugim).toMatchObject({ key: "ES|Chugim", isNew: true });
    expect(chugim.offerings).toEqual([]);
    const card = questionCards(p, terms, {}).find(
      (c) => c.id === "elective|Chugim"
    );
    expect(card).toMatchObject({
      flag: true,
      preselected: "elective",
      answer: "elective",
      subtitle: "Read as electives: Tuesday, Period 3, every group.",
      detail: "No choices in the file: add them later."
    });
    expect(card.options.map((o) => o.label)).toEqual([
      "Electives",
      "Not electives"
    ]);
    // Not an activity, not noted.
    expect(p.activities.some((a) => a.name === "Chugim")).toBe(false);
    expect(p.noted).toEqual([]);
  });

  it("a list cell is a set of its choices, proposed, named after them; a double period links each choice", () => {
    const p = propose();
    const set = setNamed(p, LIST_SET);
    expect(set.choices).toEqual(["Fishing", "Hiking", "Kayaking"]);
    expect(set.offerings.map((o) => [o.activityName, o.activityKey])).toEqual([
      ["Fishing", "A|Fishing"],
      ["Hiking", "A|Hiking"],
      ["Kayaking", "A|Kayaking"]
    ]);
    // Each choice gets an activity of its own, never placed as an activity (0 a week), one block
    // long, for who held the set.
    const hiking = p.activities.find((a) => a.name === "Hiking");
    expect(hiking).toMatchObject({
      length: 1,
      min: 0,
      max: 0,
      groupsAtOnce: 1
    });
    // Periods 1 and 2 are back to back (five minutes apart): one linked choice per choice.
    expect(
      set.linked.map((c) => [c.name, c.day, c.blockNames, c.times.length])
    ).toEqual([
      ["Fishing", "Thursday", ["Period 1", "Period 2"], 2],
      ["Hiking", "Thursday", ["Period 1", "Period 2"], 2],
      ["Kayaking", "Thursday", ["Period 1", "Period 2"], 2]
    ]);
    const card = questionCards(p, terms, {}).find(
      (c) => c.id === `elective|${LIST_SET}`
    );
    expect(card.detail).toBe(
      "3 choices proposed: Fishing, Hiking, and Kayaking. Each choice taken as a set across Period 1 and Period 2 on Thursday."
    );
  });

  it("the save sends the sets, the offerings and the linked choices, and marks the linked periods as guessed", () => {
    const p = propose();
    const plan = planFor(p, existingSetup(), "s");
    expect(plan.electiveSets.map((s) => s.name)).toEqual(["Chugim", LIST_SET]);
    expect(plan.offerings).toEqual([
      {
        key: `O|ES|${LIST_SET}|Fishing`,
        id: null,
        name: "Fishing",
        setKey: `ES|${LIST_SET}`,
        activityKey: "A|Fishing"
      },
      expect.objectContaining({ name: "Hiking" }),
      expect.objectContaining({ name: "Kayaking" })
    ]);
    const fishing = plan.linkedChoices[0];
    expect(fishing).toMatchObject({
      name: "Fishing",
      setKey: `ES|${LIST_SET}`,
      offeringKey: `O|ES|${LIST_SET}|Fishing`,
      sortOrder: 1
    });
    expect(fishing.times).toEqual([
      { weekday: "Thursday", blockKey: expect.stringMatching(/^B\|/) },
      { weekday: "Thursday", blockKey: expect.stringMatching(/^B\|/) }
    ]);
    expect(plan.linkedChoices.map((c) => c.sortOrder)).toEqual([1, 2, 3]);
    expect(plan.activities.map((a) => a.name)).toEqual(
      expect.arrayContaining(["Fishing", "Hiking", "Kayaking"])
    );
    expect(plan.guessed.filter((g) => g.kind === "LinkedChoice")).toEqual(
      plan.linkedChoices.map((c) => ({
        kind: "LinkedChoice",
        key: c.key,
        fields: ["periods"]
      }))
    );
    // Every key a linked choice names is something the save makes.
    const made = new Set([
      ...plan.electiveSets.map((s) => s.key),
      ...plan.offerings.map((o) => o.key),
      ...plan.activities.map((a) => a.key),
      ...plan.timeBlocks.map((b) => b.key)
    ]);
    plan.linkedChoices.forEach((c) => {
      expect(made.has(c.setKey)).toBe(true);
      expect(made.has(c.offeringKey)).toBe(true);
      c.times.forEach((x) => expect(made.has(x.blockKey)).toBe(true));
    });
    plan.offerings.forEach((o) => expect(made.has(o.activityKey)).toBe(true));
  });

  it("a choice the camp or the file already has as an activity is that activity", () => {
    const existing = existingSetup({
      activities: [{ Id: "act-hiking", Name: "hiking" }]
    });
    const p = propose(
      (g, d, b) => (d === 0 && b === 0 && g === 0 ? "Fishing" : week(g, d, b)),
      {},
      existing
    );
    const set = setNamed(p, LIST_SET);
    expect(set.offerings.map((o) => [o.activityName, o.activityKey])).toEqual([
      ["Fishing", "A|Fishing"],
      ["hiking", "act-hiking"],
      ["Kayaking", "A|Kayaking"]
    ]);
    // Fishing is the file's own activity (placed once), not a second one.
    expect(p.activities.filter((a) => a.name === "Fishing")).toHaveLength(1);
    expect(p.activities.find((a) => a.name === "Fishing").max).toBe(1);
  });

  it("the grid holds the set by its record in each block of a double period, as one item", () => {
    const [v] = propose().versions;
    const thursday = v.days[3].grid;
    const item = thursday.i.findIndex(([kind]) => kind === "E") + 1;
    expect(thursday.i[item - 1]).toEqual(["E", `ES|${LIST_SET}`, LIST_SET]);
    thursday.r.forEach((row) =>
      expect(row.split(",").slice(0, 2)).toEqual([String(item), String(item)])
    );
    expect(v.days[1].grid.i).toContainEqual(["E", "ES|Chugim", "Chugim"]);
  });

  it("Not electives: the name goes the usual way, and is remembered", () => {
    const answers = { "elective|Chugim": "not" };
    const p = propose(week, answers);
    expect(setNamed(p, "Chugim")).toBeUndefined();
    // Everyone at Tuesday Period 3: what its cells show, a recurring activity.
    expect(p.recurring.map((r) => r.name)).toContain("Chugim");
    const plan = planFor(p, existingSetup(), "s", { answers });
    expect(plan.remember).toContainEqual({
      key: "elective|Chugim",
      answer: "not"
    });
    const card = questionCards(p, terms, answers).find(
      (c) => c.id === "elective|Chugim"
    );
    expect(card.answer).toBe("not");
  });

  it("a name the camp has as an activity stays an activity, with no question", () => {
    const existing = existingSetup({
      activities: [{ Id: "act-chugim", Name: "Chugim", Length__c: 1 }]
    });
    const p = propose(week, {}, existing);
    expect(setNamed(p, "Chugim")).toBeUndefined();
    expect(
      questionCards(p, terms, {}).some((c) => c.id === "elective|Chugim")
    ).toBe(false);
  });

  it("the camp's own word for an elective set is an elective word", () => {
    const camp = buildTerms([
      {
        term: "ElectiveSet",
        singular: "Chug",
        plural: "Chuggim",
        isCustom: true
      }
    ]);
    const p = buildProposal({
      files: byGroupFiles(
        GROUPS,
        withCells((g, d, b) => d === 1 && b === 3, "Chuggim")
      ),
      existing: existingSetup(),
      terms: camp,
      answers: {}
    });
    expect(p.electives.sets.map((s) => s.name)).toEqual([
      "Chuggim",
      "Chuggim (Fishing, Hiking, Kayaking)"
    ]);
    const card = questionCards(p, camp, {}).find(
      (c) => c.id === "elective|Chuggim"
    );
    expect(card.subtitle).toMatch(/^Read as Chuggim:/);
    expect(card.options.map((o) => o.label)).toEqual([
      "Chuggim",
      "Not Chuggim"
    ]);
  });

  it("the camp's own word for electives is an elective word, and names what it reads (wiki decision 66)", () => {
    const camp = buildTerms([
      {
        term: "Elective",
        singular: "Bechira",
        plural: "Bechirot",
        isCustom: true
      },
      {
        term: "ElectiveSet",
        singular: "Chug",
        plural: "Chuggim",
        isCustom: true
      }
    ]);
    const p = buildProposal({
      files: byGroupFiles(
        GROUPS,
        withCells((g, d, b) => d === 1 && b === 3, "Bechirot")
      ),
      existing: existingSetup(),
      terms: camp,
      answers: {}
    });
    // Electives' own word wins over the elective set's when the camp has both.
    expect(p.electives.sets.map((s) => s.name)).toEqual([
      "Bechirot",
      "Bechirot (Fishing, Hiking, Kayaking)"
    ]);
    const card = questionCards(p, camp, {}).find(
      (c) => c.id === "elective|Bechirot"
    );
    expect(card.subtitle).toMatch(/^Read as Bechirot:/);
    expect(card.options.map((o) => o.label)).toEqual([
      "Bechirot",
      "Not Bechirot"
    ]);
  });
});

describe("a list Shoresh isn't sure of is asked once", () => {
  const unsure = withCells(
    (g, d, b) => d === 2 && b === 0 && g === 0,
    "Arts/Crafts"
  );

  it("an unspaced slash, two parts, or & is a question; nothing else is asked about it until answered", () => {
    const p = propose(unsure);
    const card = questionCards(p, terms, {}).find(
      (c) => c.id === "list|Arts/Crafts"
    );
    expect(card.title).toBe(
      "Is “Arts/Crafts” one activity or a choice of Arts or Crafts?"
    );
    expect(card.options.map((o) => o.value)).toEqual([
      "one",
      "several",
      LEAVE_OUT
    ]);
    expect(p.asks.some((a) => a.id.startsWith("kind|Arts/Crafts"))).toBe(false);
    expect(p.activities.some((a) => a.name === "Arts/Crafts")).toBe(false);
    for (const text of [
      "Swim, Snack",
      "Arts & Crafts, Music, Drama",
      "Lunch / Rest"
    ]) {
      const q = propose(
        withCells((g, d, b) => d === 2 && b === 0, `"${text}"`)
      );
      expect(q.asks.some((a) => a.id === `list|${text}`)).toBe(true);
    }
  });

  it("one activity: the usual way; a choice of several: a set of them; left out: listed", () => {
    const one = propose(unsure, { "list|Arts/Crafts": "one" });
    expect(one.activities.some((a) => a.name === "Arts/Crafts")).toBe(true);
    const several = propose(unsure, { "list|Arts/Crafts": "several" });
    expect(
      setNamed(several, "Electives (Arts, Crafts)").offerings.map(
        (o) => o.activityName
      )
    ).toEqual(["Arts", "Crafts"]);
    const out = propose(unsure, { "list|Arts/Crafts": LEAVE_OUT });
    expect(
      unplacedLines(out, terms).find((l) => l.name === "Arts/Crafts")
    ).toMatchObject({ count: 1, why: "left out for now" });
  });

  it("a name with no list in it is never asked about", () => {
    const p = propose(
      withCells((g, d, b) => d === 2 && b === 0, "Arts & Crafts")
    );
    expect(p.asks.some((a) => a.type === "list")).toBe(false);
  });
});

describe("double periods", () => {
  it("groups holding the set across different periods that day are not linked, and it is said", () => {
    // Juniors at Periods 1 and 2, Seniors at Period 2 only.
    const p = propose(
      withCells(
        (g, d, b) => d === 3 && (b === 1 || (b === 0 && g < 2)),
        LIST,
        rotation
      )
    );
    const set = setNamed(p, LIST_SET);
    expect(set.linked).toEqual([]);
    expect(importNotes(p, terms).map((n) => n.text)).toContain(
      `${LIST_SET} on Thursday: different groups hold it across different time blocks, so Shoresh can't link them. Each period is chosen separately.`
    );
  });

  it("lunch between two periods keeps them apart", () => {
    const p = propose(
      withCells((g, d, b) => d === 3 && b >= 1 && b <= 3, LIST, rotation)
    );
    // Period 2, then Lunch at 11:30: not back to back; Lunch then Period 3 at 1:00 neither.
    expect(setNamed(p, LIST_SET).linked).toEqual([]);
  });

  it("a later linked choice of one choice is named with its day and time", () => {
    const p = propose(
      withCells((g, d, b) => (d === 1 || d === 3) && b <= 1, LIST, rotation)
    );
    expect(
      setNamed(p, LIST_SET)
        .linked.filter((c) => c.offeringKey.endsWith("|Fishing"))
        .map((c) => c.name)
    ).toEqual(["Fishing", "Fishing · Thu 9:00"]);
  });
});

describe("the camp's sets, and things deleted stay deleted", () => {
  const campSet = (offerings = [], linkedChoices = []) =>
    existingSetup({
      activities: [{ Id: "act-hiking", Name: "Hiking", Length__c: 1 }],
      electives: {
        sets: [{ Id: "set-1", Name: LIST_SET }],
        offerings,
        linkedChoices
      }
    });

  it("a set the camp has is used; only the offerings it doesn't have are added", () => {
    const existing = campSet(
      [{ Id: "off-1", ElectiveSet__c: "set-1", Activity__c: "act-hiking" }],
      [{ Id: "lc-1", ElectiveSet__c: "set-1", SortOrder__c: 4 }]
    );
    const p = propose(week, {}, existing);
    const set = setNamed(p, LIST_SET);
    expect(set).toMatchObject({ key: "set-1", isNew: false });
    expect(set.offerings.map((o) => o.activityName)).toEqual([
      "Fishing",
      "Kayaking"
    ]);
    // Linked choices after the set's own, and only for the offerings the import adds.
    expect(set.linked.map((c) => [c.name, c.sortOrder])).toEqual([
      ["Fishing", 5],
      ["Kayaking", 6]
    ]);
    const plan = planFor(p, existing, "s");
    expect(plan.electiveSets.map((s) => s.name)).toEqual(["Chugim"]);
    expect(plan.offerings.every((o) => o.setKey === "set-1")).toBe(true);
  });

  it("a set deleted before is left out, its cells listed, with Bring back", () => {
    const key = "deleted|ElectiveSet||Chugim";
    const p = propose(week, { [key]: "deleted" });
    expect(setNamed(p, "Chugim")).toBeUndefined();
    expect(p.deleted).toContainEqual({
      key,
      kind: "ElectiveSet",
      name: "Chugim",
      program: ""
    });
    expect(
      unplacedLines(p, terms).find((l) => l.name === "Chugim")
    ).toMatchObject({ count: 4, why: "deleted before; not brought back" });
    expect(p.asks.some((a) => a.id.startsWith("kind|Chugim"))).toBe(false);
    const back = propose(week, { [key]: "back" });
    expect(setNamed(back, "Chugim")).toBeDefined();
    expect(
      planFor(back, existingSetup(), "s", { answers: { [key]: "back" } }).forget
    ).toContain(key);
  });

  // MEMO-4.2
  it("an offering, an activity or a linked choice deleted before is not added again", () => {
    const answers = {
      [`deleted|Offering|${LIST_SET}|Fishing`]: "deleted",
      "deleted|Activity||Kayaking": "deleted",
      [`deleted|LinkedChoice|${LIST_SET}|Hiking|Thursday|Period 1+Period 2`]:
        "deleted"
    };
    const p = propose(week, answers);
    const set = setNamed(p, LIST_SET);
    expect(set.offerings.map((o) => o.activityName)).toEqual(["Hiking"]);
    expect(set.linked).toEqual([]);
    expect(p.deleted.map((d) => [d.kind, d.name, d.program])).toEqual(
      expect.arrayContaining([
        ["Offering", "Fishing", LIST_SET],
        ["Activity", "Kayaking", ""],
        ["LinkedChoice", "Hiking", LIST_SET]
      ])
    );
    expect(p.activities.some((a) => a.name === "Kayaking")).toBe(false);
  });
});

describe("same files, same reading", () => {
  it("in any order", () => {
    const files = byGroupFiles(GROUPS, week);
    const a = planFor(
      buildProposal({ files, existing: existingSetup(), terms, answers: {} }),
      existingSetup(),
      "s"
    );
    const b = planFor(
      buildProposal({
        files: [...files].reverse(),
        existing: existingSetup(),
        terms,
        answers: {}
      }),
      existingSetup(),
      "s"
    );
    expect(b).toEqual(a);
  });
});
