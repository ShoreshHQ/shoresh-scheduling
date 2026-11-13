import {
  buildProposal,
  LEAVE_OUT,
  planFor,
  questionCards
} from "./data/engine";
import {
  BLOCKS,
  csv,
  DAYS,
  existingSetup,
  program,
  terms
} from "./data/samples";

// Blocks: 0 Period 1, 1 Period 2, 2 Lunch, 3 Period 3. Days 0-4 (Friday is 4).
const GROUPS = [
  "Juniors - Bunk 1",
  "Juniors - Bunk 2",
  "Seniors - Bunk 3",
  "Seniors - Bunk 4"
];
const ROTATION = ["Swim", "Art", "Soccer", "Drama"];
const ID = "clash|Main|Field day";

/** Two weeks of by-group files: cell(group, day, block, week) -> text. */
function twoWeeks(cell, groups = GROUPS, blocks = BLOCKS) {
  return [1, 2].flatMap((n) =>
    groups.map((g, gi) =>
      csv(`Camp - ${g} - Week ${n}.csv`, [
        ["Time", ...DAYS],
        ...blocks.map((b, bi) => [b, ...DAYS.map((_, d) => cell(gi, d, bi, n))])
      ])
    )
  );
}

// Field day fills every Friday, Lunch block too; Lunch every other day.
const fieldDay = (g, d, b) => {
  if (d === 4) return "Field day";
  return b === 2 ? "Lunch" : ROTATION[(g + b + d) % 4];
};

function propose(cell, answers = {}, existing = null, files = null) {
  return buildProposal({
    files: files || twoWeeks(cell),
    existing,
    terms,
    answers
  });
}

/** The answers with Lunch answered fixed (it is asked: not there on Fridays). */
function withLunchFixed(cell, more = {}, existing = null, files = null) {
  const first = propose(cell, {}, existing, files);
  const kinds = first.asks.filter(
    (a) => a.type === "kind" && a.name === "Lunch"
  );
  return { ...Object.fromEntries(kinds.map((k) => [k.id, "fixed"])), ...more };
}

function clashCards(p, answers) {
  return questionCards(p, terms, answers).filter((c) =>
    c.id.startsWith("clash|")
  );
}

/** The time blocks a recurring record covers on its days. */
function recurringAt(p, name) {
  return p.recurring
    .filter((r) => r.name === name)
    .flatMap((r) => Array.from({ length: r.length }, (_, k) => r.block + k));
}

describe("INGEST-3.11: a recurring activity in a fixed activity's time block", () => {
  it("INGEST-3.11: asked in the review, naming both, with recurring around the fixed activity pre-selected; the save has no clash", () => {
    const answers = withLunchFixed(fieldDay);
    const p = propose(fieldDay, answers);
    expect(p.fixed.map((f) => [f.name, f.block])).toEqual([["Lunch", 2]]);
    const [card] = clashCards(p, answers);
    expect(card.title).toBe(
      "What is “Field day” at Lunch on Friday, where “Lunch” is?"
    );
    expect(card.subtitle).toBe(
      "Main: “Lunch” is a fixed activity, at Lunch every day for every group."
    );
    expect(card.options.map((o) => o.value)).toEqual([
      "around",
      "special",
      LEAVE_OUT
    ]);
    expect(card.options[0].label).toBe("A recurring activity, not at Lunch");
    expect(card.preselected).toBe("around");
    expect(card.answer).toBe("around");
    // Unanswered, the pre-selected answer is what comes in: never over Lunch.
    expect(recurringAt(p, "Field day").sort()).toEqual([0, 1, 3]);
    const plan = planFor(p, null, "season1");
    expect(
      plan.recurringActivities.map((r) => [r.name, r.length, r.days])
    ).toEqual([
      ["Field day", 2, ["Friday"]],
      ["Field day", 1, ["Friday"]]
    ]);
  });

  it("INGEST-3.11: A special day notes it as a special day on its days, and nothing recurring comes in", () => {
    const answers = withLunchFixed(fieldDay, { [ID]: "special" });
    const p = propose(fieldDay, answers);
    expect(p.recurring.filter((r) => r.name === "Field day")).toEqual([]);
    expect(p.noted.map((n) => [n.name, n.kind])).toEqual([["Field day", "D"]]);
    expect(p.fixed.map((f) => f.name)).toEqual(["Lunch"]);
    // Still shown, with the answer given, so it can be changed back.
    expect(clashCards(p, answers).map((c) => c.answer)).toEqual(["special"]);
  });

  it("INGEST-3.11: Leave it out leaves the recurring activity out", () => {
    const answers = withLunchFixed(fieldDay, { [ID]: LEAVE_OUT });
    const p = propose(fieldDay, answers);
    expect(p.recurring.filter((r) => r.name === "Field day")).toEqual([]);
    expect(p.leftOutNames).toEqual(["Field day"]);
  });

  it("INGEST-3.11: the camp's own fixed Lunch counts too", () => {
    const existing = existingSetup({
      programs: [
        program("p1", "Main", {
          blocks: [
            ["tb1", "Period 1", 540, 585],
            ["tb2", "Period 2", 590, 635],
            ["tb3", "Lunch", 690, 735],
            ["tb4", "Period 3", 780, 825]
          ],
          fixed: [
            { Id: "f1", Name: "Lunch", TimeBlock__c: "tb3", Length__c: 1 }
          ]
        })
      ]
    });
    const p = propose(fieldDay, {}, existing);
    const [card] = clashCards(p, {});
    expect(card.title).toBe(
      "What is “Field day” at Lunch on Friday, where “Lunch” is?"
    );
    expect(card.answer).toBe("around");
    expect(recurringAt(p, "Field day").sort()).toEqual([0, 1, 3]);
  });

  it("INGEST-3.11: a file that prints Lunch on Friday splits the run itself: nothing to ask", () => {
    const printed = (g, d, b) => {
      return d === 4 && b === 2 ? "Lunch" : fieldDay(g, d, b);
    };
    const p = propose(printed, {});
    expect(p.fixed.map((f) => f.name)).toEqual(["Lunch"]);
    expect(clashCards(p, {})).toEqual([]);
    expect(recurringAt(p, "Field day").sort()).toEqual([0, 1, 3]);
  });

  it("INGEST-3.11: one only in the fixed activity's block can't go around it: asked with no answer chosen, and not a special day", () => {
    const pizza = (g, d, b) => {
      if (d === 4 && b === 2) return "Pizza";
      return b === 2 ? "Lunch" : ROTATION[(g + b + d) % 4];
    };
    const answers = withLunchFixed(pizza);
    const p = propose(pizza, answers);
    const [card] = clashCards(p, answers);
    expect(card.options.map((o) => o.value)).toEqual([LEAVE_OUT]);
    expect(card.answer).toBeNull();
  });

  it("INGEST-3.11: a special day answered in one program leaves the other program's same name as it was", () => {
    const later = [
      "Period 1 9:15-10:00",
      "Period 2 10:05-10:50",
      "Lunch 12:15-1:00",
      "Period 3 1:05-1:50"
    ];
    const files = [
      ...twoWeeks(fieldDay, GROUPS.slice(0, 2)),
      ...twoWeeks(fieldDay, ["Seniors - Bunk 5", "Seniors - Bunk 6"], later)
    ];
    const answers = withLunchFixed(fieldDay, { [ID]: "special" }, null, files);
    const p = propose(fieldDay, answers, null, files);
    expect(p.timetables.map((t) => t.name)).toEqual(["Main", "Program 2"]);
    expect(
      p.recurring
        .filter((r) => r.name === "Field day")
        .map((r) => [r.timetable.name, r.block, r.length])
    ).toEqual([
      ["Program 2", 0, 2],
      ["Program 2", 3, 1]
    ]);
    expect(clashCards(p, answers).map((c) => [c.id, c.answer])).toEqual([
      [ID, "special"],
      ["clash|Program 2|Field day", "around"]
    ]);
    expect(p.noted.map((n) => [n.name, n.kind, n.groups])).toEqual([
      ["Field day", "D", 2]
    ]);
  });

  it("INGEST-3.11: a cell once in a fixed activity's block in a later week is not asked about: the import writes the first week's pattern", () => {
    // Swim every Juniors morning; once at Lunch for Bunk 1 on a Monday of week 2.
    const stray = (g, d, b, week) => {
      if (week === 2 && g === 0 && d === 0 && b === 2) return "Swim";
      if (b === 2) return "Lunch";
      if (b === 0 && g < 2) return "Swim";
      return ["Art", "Soccer", "Drama"][(g + b + d) % 3];
    };
    const answers = withLunchFixed(stray, { "kind|Swim": "recurring" });
    const p = propose(stray, answers);
    expect(p.fixed.map((f) => f.name)).toEqual(["Lunch"]);
    expect(recurringAt(p, "Swim")).toEqual([0]);
    expect(clashCards(p, answers)).toEqual([]);
  });

  it("INGEST-3.11: the camp's early day for its fixed activity counts when the file has none", () => {
    // Lunch set up at Period 2, one time block earlier on Friday; the file moves it to Lunch.
    const existing = existingSetup({
      programs: [
        program("p1", "Main", {
          blocks: [
            ["tb1", "Period 1", 540, 585],
            ["tb2", "Period 2", 590, 635],
            ["tb3", "Lunch", 690, 735],
            ["tb4", "Period 3", 780, 825]
          ],
          fixed: [
            {
              Id: "f1",
              Name: "Lunch",
              TimeBlock__c: "tb2",
              Length__c: 1,
              EarlyDay__c: "Friday",
              EarlyBlocks__c: 1
            }
          ]
        })
      ]
    });
    const first = propose(fieldDay, {}, existing);
    const move = first.asks.find((a) => a.type === "fixed");
    expect(move.earlyDay).toBeUndefined();
    const answers = { [move.id]: "change" };
    const p = propose(fieldDay, answers, existing);
    const plan = planFor(p, existing, "season1");
    expect(plan.fixedActivities).toEqual([
      {
        id: "f1",
        blockKey: "tb3",
        length: 1
      }
    ]);
    // On Friday the save keeps Lunch at Period 2 and Lunch: Field day is around both.
    const [card] = clashCards(p, answers);
    expect(card.title).toBe(
      "What is “Field day” at Period 2 and Lunch on Friday, where “Lunch” is?"
    );
    expect(recurringAt(p, "Field day")).toEqual([0, 3]);
  });

  it("INGEST-3.11: the questions come in the same order whatever order they were answered in", () => {
    // Carnival fills every Wednesday, Field day every Friday.
    const twoDays = (g, d, b) => (d === 2 ? "Carnival" : fieldDay(g, d, b));
    const carnival = "clash|Main|Carnival";
    const order = (answers) => {
      const all = withLunchFixed(twoDays, answers);
      return clashCards(propose(twoDays, all), all).map((c) => c.id);
    };
    const expected = [carnival, ID];
    expect(order({})).toEqual(expected);
    expect(order({ [ID]: "special", [carnival]: "special" })).toEqual(expected);
    expect(order({ [carnival]: "special", [ID]: "special" })).toEqual(expected);
    expect(order({ [ID]: "special" })).toEqual(expected);
  });
});
