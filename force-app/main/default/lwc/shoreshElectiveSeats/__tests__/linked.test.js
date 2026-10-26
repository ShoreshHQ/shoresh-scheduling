// Linked choices in a run (electives slice E8; repo ADR 0016 "Slice E8", ADR 0018 choices 38 to
// 44): the engine's input from the set's linked choices, a sheet's choice of one, what Assign
// seats sends, what keeps one from being placed as a set, and the same seats in any order.
import { assignSeats } from "c/shoreshElectiveEngine";
import { buildTerms } from "c/shoreshTerms";
import {
  assignRequest,
  buildBoard,
  choicesOf,
  engineInput,
  needsLook,
  problemSections,
  readRun
} from "../seats";
import { linkedIdOf, linkedOf, weekdayOf } from "../linked";
import { MONDAY, TUESDAY, runView, seat } from "./data/run";

const t = buildTerms([
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true },
  {
    term: "LinkedChoice",
    singular: "Linked choice",
    plural: "Linked choices",
    isCustom: false
  }
]);

const choices = (list) => JSON.stringify(list);

// "Drama both days": Drama (no limit) on Monday and Tuesday's Period 1, for every division.
const BOTH_DAYS = {
  id: "lc1",
  name: "Drama both days",
  offeringId: "o2",
  appliesTo: "All",
  divisionIds: [],
  periods: [
    { weekday: "Monday", blockId: "b1" },
    { weekday: "Tuesday", blockId: "b1" }
  ]
};

/** The fixture run with linked choices, and Maya choosing "Drama both days" first. */
function linkedView(linkedChoices = [BOTH_DAYS], overrides = {}) {
  const base = runView();
  return runView({
    linkedChoices,
    campers: [
      {
        ...base.campers[0],
        choices: choices([
          { n: "Drama both days", a: "a2", l: "lc1", r: 1, k: "ranked" },
          { n: "Archery", a: "a1", r: 2, k: "ranked" }
        ])
      },
      ...base.campers.slice(1)
    ],
    ...overrides
  });
}

describe("linked choices in the engine's input", () => {
  it("knows a date's weekday whatever the time zone", () => {
    expect(weekdayOf(MONDAY)).toBe("Monday");
    expect(weekdayOf(TUESDAY)).toBe("Tuesday");
    expect(weekdayOf("2027-07-11")).toBe("Sunday");
    expect(linkedIdOf("lc1|d1")).toBe("lc1");
    expect(linkedIdOf(undefined)).toBeNull();
  });

  it("passes each linked choice once per division it applies to, at that division's times", () => {
    const { input } = engineInput(readRun(linkedView()), t);
    expect(input.linkedChoices).toEqual([
      { id: "lc1|d1", key: "linked|lc1", name: "Drama both days" }
    ]);
    expect(input.linkedChoiceTimes).toEqual([
      { linkedChoiceId: "lc1|d1", timeId: `${MONDAY}|b1|d1`, activityId: "a2" },
      { linkedChoiceId: "lc1|d1", timeId: `${TUESDAY}|b1|d1`, activityId: "a2" }
    ]);
  });

  it("a sheet's choice of a linked choice names it, and its activity at each of its periods", () => {
    const { choices: rows } = choicesOf(readRun(linkedView()));
    expect(rows.filter((c) => c.camperId === "c1")).toEqual([
      {
        camperId: "c1",
        key: "linked|lc1",
        timeId: null,
        rank: 1,
        rankKind: "ordered-fallback"
      },
      {
        camperId: "c1",
        key: "a2",
        timeId: `${MONDAY}|b1|d1`,
        rank: 1,
        rankKind: "ordered-fallback"
      },
      {
        camperId: "c1",
        key: "a2",
        timeId: `${TUESDAY}|b1|d1`,
        rank: 1,
        rankKind: "ordered-fallback"
      },
      {
        camperId: "c1",
        key: "a1",
        timeId: null,
        rank: 2,
        rankKind: "ordered-fallback"
      }
    ]);
  });

  it("places the camper in it as a set, and Assign sends which linked choice each seat is part of", () => {
    const run = readRun(linkedView());
    const { input } = engineInput(run, t);
    const result = assignSeats(input);
    expect(result.ok).toBe(true);
    const maya = result.seats.filter((s) => s.camperId === "c1");
    expect(maya.map((s) => [s.timeId, s.activityId, s.linkedChoiceId])).toEqual(
      [
        [`${MONDAY}|b1|d1`, "a2", "lc1|d1"],
        [`${TUESDAY}|b1|d1`, "a2", "lc1|d1"]
      ]
    );
    const request = assignRequest(run, result);
    expect(request.seats.filter((s) => s.camperId === "c1")).toEqual([
      {
        camperId: "c1",
        day: MONDAY,
        blockId: "b1",
        offeringId: "o2",
        linkedChoiceId: "lc1"
      },
      {
        camperId: "c1",
        day: TUESDAY,
        blockId: "b1",
        offeringId: "o2",
        linkedChoiceId: "lc1"
      }
    ]);
    // A seat of no linked choice says so.
    expect(
      request.seats.find((s) => s.camperId === "c2").linkedChoiceId
    ).toBeNull();
    // By camper: the seat is their first choice.
    const board = buildBoard(
      readRun(
        linkedView([BOTH_DAYS], {
          assigned: true,
          seats: request.seats.map((s, i) => ({
            id: `x${i}`,
            ...s,
            locked: false,
            byHand: false
          }))
        })
      ),
      t
    );
    const mayaRow = board.camperSections
      .flatMap((s) => s.rows)
      .find((r) => r.camper.id === "c1");
    expect(mayaRow.cells.map((c) => [c.name, c.words])).toEqual([
      ["Drama", ""],
      ["Drama", ""]
    ]);
  });

  it("the same seats whatever order the linked choices, campers and times arrive in", () => {
    const second = {
      ...BOTH_DAYS,
      id: "lc2",
      name: "Pottery both days",
      offeringId: "o3",
      periods: [{ weekday: "Monday", blockId: "b1" }]
    };
    const view = linkedView([BOTH_DAYS, second]);
    const shuffled = {
      ...view,
      linkedChoices: [...view.linkedChoices].reverse(),
      campers: [...view.campers].reverse(),
      times: [...view.times].reverse()
    };
    const once = assignSeats(engineInput(readRun(view), t).input);
    const again = assignSeats(engineInput(readRun(shuffled), t).input);
    expect(again.seats).toEqual(once.seats);
    expect(again.findings).toEqual(once.findings);
  });

  it("is used only when its offering is confirmed; otherwise a choice of it counts as its activity", () => {
    const run = readRun(
      linkedView([{ ...BOTH_DAYS, offeringId: "o4" }], {
        campers: [
          {
            ...runView().campers[0],
            choices: choices([
              { n: "Ceramics both days", a: "a4", l: "lc1", r: 1, k: "ranked" }
            ])
          }
        ]
      })
    );
    const { input } = engineInput(run, t);
    expect(input.linkedChoices).toEqual([]);
    expect(input.choices).toEqual([
      {
        camperId: "c1",
        key: "a4",
        timeId: null,
        rank: 1,
        rankKind: "ordered-fallback"
      }
    ]);
  });

  it("Only these and All except decide which divisions get it", () => {
    const only = engineInput(
      readRun(
        linkedView([
          { ...BOTH_DAYS, appliesTo: "OnlyThese", divisionIds: ["d2"] }
        ])
      ),
      t
    ).input;
    expect(only.linkedChoices).toEqual([]);
    const except = engineInput(
      readRun(
        linkedView([
          { ...BOTH_DAYS, appliesTo: "AllExcept", divisionIds: ["d2"] }
        ])
      ),
      t
    ).input;
    expect(except.linkedChoices.map((c) => c.id)).toEqual(["lc1|d1"]);
  });
});

describe("what keeps a linked choice from being placed as a set", () => {
  it("a period this schedule doesn't have: passed, the rest kept together, and said", () => {
    const wednesday = {
      ...BOTH_DAYS,
      periods: [...BOTH_DAYS.periods, { weekday: "Wednesday", blockId: "b1" }]
    };
    const run = readRun(linkedView([wednesday]));
    const { input } = engineInput(run, t);
    expect(input.linkedChoiceTimes.map((m) => m.timeId)).toEqual([
      `${MONDAY}|b1|d1`,
      `${TUESDAY}|b1|d1`,
      "missing|Wednesday|b1|d1"
    ]);
    const result = assignSeats(input);
    expect(
      result.findings
        .filter((f) => f.kind === "LINKED_PERIOD_LEFT_OUT")
        .map((f) => f.timeIds)
    ).toEqual([["missing|Wednesday|b1|d1"]]);
    // Maya gets Drama on Monday and Tuesday as the set (engine care PR 8: never refused).
    expect(
      result.seats
        .filter((s) => s.camperId === "c1")
        .map((s) => [s.activityId, s.rank, s.linkedChoiceId])
    ).toEqual([
      ["a2", 1, "lc1|d1"],
      ["a2", 1, "lc1|d1"]
    ]);
    const board = buildBoard(run, t);
    expect(board.problems.linked).toEqual([
      {
        key: "missing|lc1|d1|Wednesday|b1",
        ids: ["lc1"],
        name: "Drama both days",
        text: "Not on this schedule at Wednesday 12:30 for Juniors"
      }
    ]);
    expect(needsLook(board)).toBe(true);
    const section = problemSections(board, t).find((s) => s.key === "linked");
    expect(section.head).toBe("1 linked choice not given in full");
    expect(section.rows.map((r) => [r.text, r.aside])).toEqual([
      ["Drama both days", "Not on this schedule at Wednesday 12:30 for Juniors"]
    ]);
  });

  it("two linked choices of one offering sharing a time, and an activity not offered at a period, are said", () => {
    const pottery = {
      ...BOTH_DAYS,
      id: "lc2",
      name: "Ceramics both days",
      offeringId: "o3"
    };
    // Another linked choice of Drama over the same days: it shares their seats.
    const again = { ...BOTH_DAYS, id: "lc3", name: "Drama again" };
    const run = readRun(
      linkedView([BOTH_DAYS, pottery, again], {
        // Pottery isn't offered on Tuesday.
        times: [
          runView().times[0],
          { ...runView().times[1], offeringIds: ["o1", "o2"] }
        ]
      })
    );
    const { linkedChoices, problems } = linkedOf(run);
    expect(linkedChoices.map((c) => c.id)).toEqual([
      "lc1|d1",
      "lc2|d1",
      "lc3|d1"
    ]);
    // Ceramics shares the times but not Drama's seats: not a problem (slice E9).
    expect(problems.map((p) => [p.name, p.text])).toEqual([
      [
        "Ceramics both days",
        "Pottery isn't offered at Tuesday 12:30 for Juniors"
      ],
      [
        "Drama both days",
        'Shares Monday 12:30 with "Drama again", which was kept as a set'
      ]
    ]);
    // The engine keeps the first by name ("Drama again") as a set and sets the other aside.
    const result = assignSeats(engineInput(run, t).input);
    expect(
      result.findings
        .filter((f) => f.kind === "LINKED_SEATS_SHARED")
        .map((f) => [f.linkedChoiceIds, f.keptLinkedChoiceId])
    ).toEqual([[["lc1|d1"], "lc3|d1"]]);
    expect(result.seats.some((s) => s.linkedChoiceId === "lc1|d1")).toBe(false);
    // Maya asked for the one set aside: said, with the set kept and the period.
    const board = buildBoard(run, t);
    const section = problemSections(board, t).find((x) => x.key === "split");
    expect(section.rows.map((r) => [r.text, r.aside])).toEqual([
      [
        board.problems.split[0].camper.name,
        'Asked for "Drama both days", which shares Mon 12:30 with "Drama again", kept as a set'
      ]
    ]);
  });
});

// Seniors (Oak, Noa Pinecrest) beside Juniors: their own times at the day and block given.
const SENIORS = {
  id: "g3",
  name: "Oak",
  divisionId: "d2",
  divisionName: "Seniors"
};
const seniorTime = (day, blockId) => ({
  key: `${day}|${blockId}|d2`,
  day,
  blockId,
  blockName: blockId === "b1" ? "Period 1" : "Period 2",
  startTime: blockId === "b1" ? "12:30" : "14:00",
  blockOrder: blockId === "b1" ? 0 : 1,
  divisionId: "d2",
  divisionOrder: 2,
  groupIds: ["g3"],
  offeringIds: ["o1", "o2", "o3"]
});
const NOA = (list) => ({
  id: "c5",
  name: "Noa Pinecrest",
  groupId: "g3",
  choices: choices(list)
});

describe("a camper a linked choice doesn't cover", () => {
  // "Drama" (the activity's own name, desktop D7's first default) on Monday and Tuesday Period 1:
  // the set sits there for Juniors, and on Monday Period 2 for Seniors.
  const DRAMA = { ...BOTH_DAYS, name: "Drama" };
  const seniorsView = (linkedChoices, noaChoices) => {
    const base = linkedView(linkedChoices);
    return {
      ...base,
      times: [...base.times, seniorTime(MONDAY, "b2")],
      groups: [...base.groups, SENIORS],
      campers: [...base.campers, NOA(noaChoices)]
    };
  };

  it("whose division holds none of its periods keeps the choice as its activity, and it is said", () => {
    const run = readRun(
      seniorsView(
        [DRAMA],
        [{ n: "Drama", a: "a2", l: "lc1", r: 1, k: "ranked" }]
      )
    );
    const { input } = engineInput(run, t);
    expect(input.linkedChoices.map((c) => c.id)).toEqual(["lc1|d1"]);
    expect(input.choices.filter((c) => c.camperId === "c5")).toEqual([
      {
        camperId: "c5",
        key: "a2",
        timeId: null,
        rank: 1,
        rankKind: "ordered-fallback"
      }
    ]);
    // The engine places Noa in Drama at the Seniors' time, ranked first.
    const noa = assignSeats(input).seats.filter((s) => s.camperId === "c5");
    expect(noa.map((s) => [s.timeId, s.activityId, s.rank])).toEqual([
      [`${MONDAY}|b2|d2`, "a2", 1]
    ]);
    const board = buildBoard(run, t);
    expect(needsLook(board)).toBe(true);
    const section = problemSections(board, t).find(
      (s) => s.key === "uncovered"
    );
    expect(section.head).toBe(
      "1 asked for a linked choice not for their division"
    );
    expect(section.rows.map((r) => [r.text, r.aside, r.target])).toEqual([
      [
        "Noa Pinecrest",
        '"Drama" doesn\'t cover Seniors, so it counts as Drama',
        { view: "camper", camperId: "c5" }
      ]
    ]);
  });

  it("whose division Only these leaves out keeps the choice too, said once however often chosen", () => {
    const base = linkedView([
      { ...DRAMA, appliesTo: "OnlyThese", divisionIds: ["d1"] }
    ]);
    const run = readRun({
      ...base,
      times: [
        ...base.times,
        seniorTime(MONDAY, "b1"),
        seniorTime(TUESDAY, "b1")
      ],
      groups: [...base.groups, SENIORS],
      campers: [
        ...base.campers,
        NOA([
          {
            n: "Drama",
            a: "a2",
            l: "lc1",
            d: "Monday",
            p: "1",
            r: 1,
            k: "ranked"
          },
          {
            n: "Drama",
            a: "a2",
            l: "lc1",
            d: "Tuesday",
            p: "1",
            r: 2,
            k: "ranked"
          }
        ])
      ]
    });
    const { input } = engineInput(run, t);
    expect(input.linkedChoices.map((c) => c.id)).toEqual(["lc1|d1"]);
    expect(
      input.choices
        .filter((c) => c.camperId === "c5")
        .map((c) => [c.key, c.timeId, c.rank])
    ).toEqual([
      ["a2", `${MONDAY}|b1|d2`, 1],
      ["a2", `${TUESDAY}|b1|d2`, 2]
    ]);
    const board = buildBoard(run, t);
    expect(board.problems.uncovered.map((u) => u.camper.id)).toEqual(["c5"]);
    // Maya, a Junior it covers, is not among them.
    expect(choicesOf(run).uncovered).toEqual([
      { camperId: "c5", linkedChoiceId: "lc1" }
    ]);
  });
});

describe("a camper who asked for a linked choice but can't have it as a set", () => {
  it("is said, as the engine says it: missing one of its periods, or locked into one", () => {
    const base = linkedView();
    const view = {
      ...base,
      // Willow (Eli) doesn't take Tuesday's Period 1.
      times: [base.times[0], { ...base.times[1], groupIds: ["g1"] }],
      campers: [
        base.campers[0],
        base.campers[1],
        {
          ...base.campers[2],
          choices: choices([
            { n: "Drama both days", a: "a2", l: "lc1", r: 1, k: "ranked" }
          ])
        },
        base.campers[3]
      ],
      // Maya is locked into Archery on Tuesday.
      seats: [seat("x1", "c1", TUESDAY, "o1", { locked: true, byHand: true })]
    };
    const run = readRun(view);
    const result = assignSeats(engineInput(run, t).input);
    const engineSaid = result.findings
      .filter((f) => f.kind === "UNSUPPORTED_LINKED_CHOICE" && f.camperIds)
      .map((f) => f.camperIds);
    // The same campers the engine names (in the campers' order here).
    expect(engineSaid).toEqual([["c3"], ["c1"]]);
    const board = buildBoard(run, t);
    expect(
      board.problems.split.map((s) => [s.camperId, s.linkedChoiceId, s.reason])
    ).toEqual([
      ["c1", "lc1", "locked"],
      ["c3", "lc1", "absent"]
    ]);
    expect(needsLook(board)).toBe(true);
    const section = problemSections(board, t).find((s) => s.key === "split");
    expect(section.head).toBe(
      "2 given their linked choice one period at a time"
    );
    expect(section.rows.map((r) => [r.text, r.aside])).toEqual([
      [
        "Maya Fernwood",
        'Asked for "Drama both days" but has a locked seat in one of its periods'
      ],
      [
        "Eli Marblecrest",
        'Asked for "Drama both days" but doesn\'t attend every period it covers'
      ]
    ]);
  });

  it("nothing is said when the set is given", () => {
    const board = buildBoard(readRun(linkedView()), t);
    expect(board.problems.split).toEqual([]);
    expect(board.problems.uncovered).toEqual([]);
    expect(
      problemSections(board, t).filter((s) =>
        ["split", "uncovered", "linked"].includes(s.key)
      )
    ).toEqual([]);
  });
});

describe("the counter counts linked choices, not their problems", () => {
  it("one linked choice missing Thursday for two divisions is one", () => {
    const thursday = {
      ...BOTH_DAYS,
      periods: [
        { weekday: "Monday", blockId: "b1" },
        { weekday: "Thursday", blockId: "b1" }
      ]
    };
    const base = linkedView([thursday]);
    const run = readRun({
      ...base,
      times: [...base.times, seniorTime(MONDAY, "b1")],
      groups: [...base.groups, SENIORS]
    });
    const board = buildBoard(run, t);
    expect(board.problems.linked.map((p) => p.text)).toEqual([
      "Not on this schedule at Thursday 12:30 for Juniors",
      "Not on this schedule at Thursday 12:30 for Seniors"
    ]);
    const section = problemSections(board, t).find((s) => s.key === "linked");
    expect(section.head).toBe("1 linked choice not given in full");
    expect(section.rows).toHaveLength(2);
  });
});
