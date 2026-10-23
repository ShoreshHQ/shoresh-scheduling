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
import { MONDAY, TUESDAY, runView } from "./data/run";

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
  it("a period this schedule doesn't have: passed, filled one period at a time, and said", () => {
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
      result.findings.filter((f) => f.kind === "UNSUPPORTED_LINKED_CHOICE")
    ).toHaveLength(1);
    // Maya still gets Drama at each period, ranked, one at a time.
    expect(
      result.seats
        .filter((s) => s.camperId === "c1")
        .map((s) => [s.activityId, s.rank, s.linkedChoiceId])
    ).toEqual([
      ["a2", 1, undefined],
      ["a2", 1, undefined]
    ]);
    const board = buildBoard(run, t);
    expect(board.problems.linked).toEqual([
      {
        key: "missing|lc1|d1|Wednesday|b1",
        name: "Drama both days",
        text: "Not on this schedule at Wednesday 12:30 for Juniors"
      }
    ]);
    expect(needsLook(board)).toBe(true);
    const section = problemSections(board, t).find((s) => s.key === "linked");
    expect(section.head).toBe("1 linked choice filled one period at a time");
    expect(section.rows.map((r) => [r.text, r.aside])).toEqual([
      ["Drama both days", "Not on this schedule at Wednesday 12:30 for Juniors"]
    ]);
  });

  it("two linked choices sharing a time, and an activity not offered at a period, are said", () => {
    const pottery = {
      ...BOTH_DAYS,
      id: "lc2",
      name: "Ceramics both days",
      offeringId: "o3"
    };
    const run = readRun(
      linkedView([BOTH_DAYS, pottery], {
        // Pottery isn't offered on Tuesday.
        times: [
          runView().times[0],
          { ...runView().times[1], offeringIds: ["o1", "o2"] }
        ]
      })
    );
    const { linkedChoices, problems } = linkedOf(run);
    expect(linkedChoices.map((c) => c.id)).toEqual(["lc1|d1", "lc2|d1"]);
    expect(problems.map((p) => [p.name, p.text])).toEqual([
      [
        "Ceramics both days",
        "Pottery isn't offered at Tuesday 12:30 for Juniors"
      ],
      ['"Drama both days" and "Ceramics both days"', "Share Monday 12:30"],
      ['"Drama both days" and "Ceramics both days"', "Share Tuesday 12:30"]
    ]);
    // The engine refuses both, as the desktop does: filled one period at a time.
    const result = assignSeats(engineInput(run, t).input);
    expect(result.seats.filter((s) => s.linkedChoiceId).length).toBe(0);
  });
});
