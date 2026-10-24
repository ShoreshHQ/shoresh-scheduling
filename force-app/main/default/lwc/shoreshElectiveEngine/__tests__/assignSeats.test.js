/**
 * What the port adds to the desktop engine, in Salesforce's shapes: seat limits ("No limit",
 * 0 means closed, blank stops the assignment), times filled in date, block and division order,
 * the camp's own words in findings, and which linked choice a seat came from.
 */
import { assignSeats } from "c/shoreshElectiveEngine";
import { buildTerms } from "c/shoreshTerms";

const campers = (n) => Array.from({ length: n }, (_, i) => ({ id: `c${i}` }));
const offering = (timeId, activityId, more = {}) => ({
  timeId,
  activityId,
  key: activityId,
  name: activityId.charAt(0).toUpperCase() + activityId.slice(1),
  seats: 1,
  ...more
});

describe("seat limits", () => {
  it("stops when a limited offering has blank seats, naming each once", () => {
    const out = assignSeats({
      campers: campers(1),
      times: [{ id: "t1" }, { id: "t2" }],
      offerings: [
        offering("t1", "pottery", { seats: null }),
        offering("t2", "pottery", { seats: undefined }),
        offering("t1", "archery", { seats: 3 })
      ]
    });
    expect(out).toEqual({
      ok: false,
      error: "Fill blank capacities first.",
      blank: ["Pottery"]
    });
  });

  it("seats everyone in an offering with no limit", () => {
    const out = assignSeats({
      campers: campers(40),
      times: [{ id: "t1" }],
      offerings: [offering("t1", "swim", { seats: null, noLimit: true })],
      choices: campers(40).map((c) => ({
        camperId: c.id,
        key: "swim",
        rank: 1
      }))
    });
    expect(out.ok).toBe(true);
    expect(out.seats).toHaveLength(40);
    expect(out.findings).toEqual([]);
  });

  it("treats 0 seats as closed, never as unlimited", () => {
    const out = assignSeats({
      campers: campers(2),
      times: [{ id: "t1" }],
      offerings: [offering("t1", "ceramics", { seats: 0 })],
      choices: [{ camperId: "c0", key: "ceramics", rank: 1 }]
    });
    expect(out.seats).toEqual([]);
    expect(out.findings).toEqual([
      expect.objectContaining({ kind: "NO_CAPACITY", camperIds: ["c0", "c1"] })
    ]);
  });
});

describe("times", () => {
  it("are filled in date, block and division order, whatever their ids", () => {
    const times = [
      { id: "a", date: "2026-07-07", blockOrder: 1, divisionOrder: 0 },
      { id: "b", date: "2026-07-06", blockOrder: 2, divisionOrder: 0 },
      { id: "c", date: "2026-07-06", blockOrder: 1, divisionOrder: 1 },
      { id: "d", date: "2026-07-06", blockOrder: 1, divisionOrder: 0 }
    ];
    const out = assignSeats({ campers: campers(1), times });
    expect(out.findings.map((f) => f.timeId)).toEqual(["d", "c", "b", "a"]);
  });
});

describe("findings", () => {
  it("use the camp's word for division", () => {
    const terms = buildTerms([
      { term: "Division", singular: "Edah", plural: "Edot", isCustom: true }
    ]);
    const out = assignSeats({
      campers: campers(1),
      times: [{ id: "t1" }],
      offerings: [offering("t1", "archery")],
      attendance: { c0: [] },
      terms
    });
    expect(out.findings).toEqual([
      {
        kind: "NO_CAMPERS",
        timeId: "t1",
        message:
          "No camper is eligible for this period — check that the Edot on the sheet match " +
          "the camp’s Edah names."
      }
    ]);
  });

  it("name an offering by its name, not its key", () => {
    const out = assignSeats({
      campers: campers(1),
      times: [{ id: "t1" }],
      offerings: [
        offering("t1", "a1", { name: "Ropes course", seats: 5, minimum: 3 }),
        offering("t1", "a2", { name: "Drama", seats: 5 })
      ],
      choices: [{ camperId: "c0", key: "a1", rank: 1 }]
    });
    expect(out.findings[0].message).toMatch(/^“Ropes course” had 1 of the 3/);
    expect(out.seats[0]).toMatchObject({
      activityId: "a2",
      flags: ["NOT_REQUESTED"],
      notRequestedReason: "CHOICES_DID_NOT_RUN"
    });
  });
});

describe("linked choices", () => {
  it("say which linked choice each of its seats came from", () => {
    const out = assignSeats({
      campers: campers(1),
      times: [{ id: "t1" }, { id: "t2" }],
      offerings: [offering("t1", "pottery"), offering("t2", "pottery")],
      linkedChoices: [
        { id: "lc", key: "pottery-double", name: "Pottery (double)" }
      ],
      linkedChoiceTimes: [
        { linkedChoiceId: "lc", timeId: "t1", activityId: "pottery" },
        { linkedChoiceId: "lc", timeId: "t2", activityId: "pottery" }
      ],
      choices: [{ camperId: "c0", linkedChoiceId: "lc", rank: 1 }]
    });
    expect(out.seats).toEqual([
      {
        camperId: "c0",
        timeId: "t1",
        activityId: "pottery",
        key: "pottery-double",
        rank: 1,
        flags: [],
        linkedChoiceId: "lc"
      },
      {
        camperId: "c0",
        timeId: "t2",
        activityId: "pottery",
        key: "pottery-double",
        rank: 1,
        flags: [],
        linkedChoiceId: "lc"
      }
    ]);
  });
});

describe("a double period linked for every choice (slice E9)", () => {
  // Pottery and Archery each linked across the same two times: each takes its own seats there.
  const both = (more = {}) => ({
    campers: campers(2),
    times: [{ id: "t1" }, { id: "t2" }],
    offerings: [
      offering("t1", "pottery"),
      offering("t2", "pottery"),
      offering("t1", "archery"),
      offering("t2", "archery")
    ],
    linkedChoices: [
      { id: "lp", key: "pottery", name: "Pottery" },
      { id: "la", key: "archery", name: "Archery" }
    ],
    linkedChoiceTimes: [
      { linkedChoiceId: "lp", timeId: "t1", activityId: "pottery" },
      { linkedChoiceId: "lp", timeId: "t2", activityId: "pottery" },
      { linkedChoiceId: "la", timeId: "t1", activityId: "archery" },
      { linkedChoiceId: "la", timeId: "t2", activityId: "archery" }
    ],
    choices: [
      { camperId: "c0", linkedChoiceId: "lp", rank: 1 },
      { camperId: "c1", linkedChoiceId: "lp", rank: 1 },
      { camperId: "c1", linkedChoiceId: "la", rank: 2 }
    ],
    ...more
  });

  it("two offerings' linked choices at the same times are each placed as a set", () => {
    const out = assignSeats(both());
    expect(
      out.findings.filter((f) => f.kind === "UNSUPPORTED_LINKED_CHOICE")
    ).toEqual([]);
    const of = (camperId) =>
      out.seats
        .filter((x) => x.camperId === camperId)
        .map((x) => [x.timeId, x.activityId, x.linkedChoiceId]);
    // One Pottery seat a time: one camper has Pottery for both, the other Archery for both.
    expect(of("c0")).toEqual([
      ["t1", "pottery", "lp"],
      ["t2", "pottery", "lp"]
    ]);
    expect(of("c1")).toEqual([
      ["t1", "archery", "la"],
      ["t2", "archery", "la"]
    ]);
  });

  it("two linked choices of one offering at one time are still refused", () => {
    const out = assignSeats(
      both({
        linkedChoices: [
          { id: "lp", key: "pottery", name: "Pottery" },
          { id: "lp2", key: "pottery-again", name: "Pottery again" }
        ],
        linkedChoiceTimes: [
          { linkedChoiceId: "lp", timeId: "t1", activityId: "pottery" },
          { linkedChoiceId: "lp", timeId: "t2", activityId: "pottery" },
          { linkedChoiceId: "lp2", timeId: "t2", activityId: "pottery" },
          { linkedChoiceId: "lp2", timeId: "t1", activityId: "pottery" }
        ],
        choices: [{ camperId: "c0", linkedChoiceId: "lp", rank: 1 }]
      })
    );
    expect(
      out.findings
        .filter((f) => f.kind === "UNSUPPORTED_LINKED_CHOICE")
        .map((f) => [f.linkedChoiceIds, f.timeId])
    ).toEqual([
      [["lp", "lp2"], "t1"],
      [["lp", "lp2"], "t2"]
    ]);
    expect(out.seats.some((x) => x.linkedChoiceId)).toBe(false);
  });
});

describe("empty input", () => {
  it("returns no seats and no findings", () => {
    expect(assignSeats()).toEqual({ ok: true, seats: [], findings: [] });
  });
});
