/**
 * What the port adds to the desktop engine, in Salesforce's shapes: seat limits ("No limit",
 * blank or 0 seats placed as no limit and said), times filled in date, block and division order,
 * the camp's own words in findings, and which linked choice a seat came from.
 */
import { assignSeats, linkedSetPlan } from "c/shoreshElectiveEngine";
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
  it("places an offering with blank seats as no limit and says so, once per offering", () => {
    const out = assignSeats({
      campers: campers(3),
      times: [{ id: "t1" }, { id: "t2" }],
      offerings: [
        offering("t1", "pottery", { seats: null }),
        offering("t2", "pottery", { seats: undefined }),
        offering("t1", "archery", { seats: 3 })
      ],
      choices: campers(3).map((c) => ({
        camperId: c.id,
        key: "pottery",
        rank: 1
      }))
    });
    expect(out.ok).toBe(true);
    expect(out.seats.filter((x) => x.activityId === "pottery")).toHaveLength(6);
    expect(out.findings).toEqual([
      {
        kind: "NO_SEATS_SET",
        activityId: "pottery",
        timeIds: ["t1", "t2"],
        message: "Choose how many seats “Pottery” has."
      }
    ]);
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

  it("places an offering with 0 seats as no limit and says so (0 is not closed)", () => {
    const out = assignSeats({
      campers: campers(2),
      times: [{ id: "t1" }],
      offerings: [offering("t1", "ceramics", { seats: 0 })],
      choices: [{ camperId: "c0", key: "ceramics", rank: 1 }]
    });
    expect(out.seats.map((x) => [x.camperId, x.activityId])).toEqual([
      ["c0", "ceramics"],
      ["c1", "ceramics"]
    ]);
    expect(out.findings).toEqual([
      {
        kind: "NO_SEATS_SET",
        activityId: "ceramics",
        timeIds: ["t1"],
        message: "Choose how many seats “Ceramics” has."
      }
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

  it("two linked choices of one offering at one time: the first by name is kept, the other flagged", () => {
    const out = assignSeats(
      both({
        offerings: [
          offering("t1", "pottery", { seats: 5 }),
          offering("t2", "pottery", { seats: 5 })
        ],
        linkedChoices: [
          { id: "lp2", key: "pottery-again", name: "Pottery again" },
          { id: "lp", key: "pottery", name: "Pottery" }
        ],
        linkedChoiceTimes: [
          { linkedChoiceId: "lp", timeId: "t1", activityId: "pottery" },
          { linkedChoiceId: "lp", timeId: "t2", activityId: "pottery" },
          { linkedChoiceId: "lp2", timeId: "t2", activityId: "pottery" },
          { linkedChoiceId: "lp2", timeId: "t1", activityId: "pottery" }
        ],
        choices: [
          { camperId: "c0", linkedChoiceId: "lp", rank: 1 },
          { camperId: "c1", linkedChoiceId: "lp2", rank: 1 }
        ]
      })
    );
    expect(out.findings).toEqual([
      {
        kind: "LINKED_SEATS_SHARED",
        linkedChoiceIds: ["lp2"],
        keptLinkedChoiceId: "lp",
        timeId: "t1",
        activityId: "pottery",
        camperIds: ["c1"],
        message:
          "“Pottery again” shares “Pottery” seats with “Pottery” in t1, so 1 camper who asked " +
          "for “Pottery again” got a seat each period instead."
      }
    ]);
    // The kept set is placed as a set; the other camper still gets a seat each period.
    expect(
      out.seats.map((x) => [x.camperId, x.timeId, x.linkedChoiceId ?? null])
    ).toEqual([
      ["c0", "t1", "lp"],
      ["c1", "t1", null],
      ["c0", "t2", "lp"],
      ["c1", "t2", null]
    ]);
  });

  it("which set is kept doesn't depend on the order the linked choices arrive in", () => {
    const input = both({
      linkedChoices: [
        { id: "lp", key: "pottery", name: "Pottery" },
        { id: "lp2", key: "pottery-again", name: "Pottery again" }
      ],
      linkedChoiceTimes: [
        { linkedChoiceId: "lp2", timeId: "t1", activityId: "pottery" },
        { linkedChoiceId: "lp2", timeId: "t2", activityId: "pottery" },
        { linkedChoiceId: "lp", timeId: "t2", activityId: "pottery" },
        { linkedChoiceId: "lp", timeId: "t1", activityId: "pottery" }
      ]
    });
    const reversed = {
      ...input,
      linkedChoices: [...input.linkedChoices].reverse(),
      linkedChoiceTimes: [...input.linkedChoiceTimes].reverse()
    };
    expect(assignSeats(reversed)).toEqual(assignSeats(input));
  });
});

describe("a linked choice with a period this run can't give it", () => {
  const input = (more = {}) => ({
    campers: campers(2),
    times: [
      { id: "t1", name: "Mon 12:30" },
      { id: "t2", name: "Tue 12:30" },
      { id: "t3", name: "Wed 12:30" }
    ],
    offerings: [
      offering("t1", "drama", { seats: 5 }),
      offering("t2", "drama", { seats: 5 }),
      offering("t2", "archery", { seats: 5 }),
      offering("t3", "archery", { seats: 5 })
    ],
    linkedChoices: [{ id: "ld", key: "drama-week", name: "Drama all week" }],
    linkedChoiceTimes: [
      { linkedChoiceId: "ld", timeId: "t1", activityId: "drama" },
      { linkedChoiceId: "ld", timeId: "t2", activityId: "drama" },
      // Not in this run, and drama not offered at t3.
      {
        linkedChoiceId: "ld",
        timeId: "t9",
        activityId: "drama",
        name: "Fri 12:30"
      },
      { linkedChoiceId: "ld", timeId: "t3", activityId: "drama" }
    ],
    choices: [{ camperId: "c0", linkedChoiceId: "ld", rank: 1 }],
    ...more
  });

  it("is kept whole over the periods it has, and says which it couldn't give", () => {
    const out = assignSeats(input());
    expect(out.findings).toEqual([
      {
        kind: "LINKED_PERIOD_LEFT_OUT",
        linkedChoiceIds: ["ld"],
        timeIds: ["t3", "t9"],
        camperIds: ["c0"],
        message:
          "“Drama all week”: Wed 12:30 and Fri 12:30 can’t be given in this run; its other " +
          "periods were kept together."
      }
    ]);
    expect(
      out.seats
        .filter((x) => x.camperId === "c0")
        .map((x) => [x.timeId, x.activityId, x.linkedChoiceId ?? null])
    ).toEqual([
      ["t1", "drama", "ld"],
      ["t2", "drama", "ld"],
      ["t3", "archery", null]
    ]);
  });

  it("is matched to its own offering when ids are given, not just its activity", () => {
    const out = linkedSetPlan({
      linkedChoices: [{ id: "ld", key: "d", name: "Drama" }],
      linkedChoiceTimes: [
        {
          linkedChoiceId: "ld",
          timeId: "t1",
          activityId: "drama",
          offeringId: "oA"
        },
        {
          linkedChoiceId: "ld",
          timeId: "t2",
          activityId: "drama",
          offeringId: "oA"
        }
      ],
      timeIds: ["t1", "t2"],
      offerings: [
        { timeId: "t1", activityId: "drama", offeringId: "oA" },
        // Another offering of the same activity at t2: not this one.
        { timeId: "t2", activityId: "drama", offeringId: "oB" }
      ]
    });
    expect(out.sets.get("ld")).toEqual({
      members: [
        {
          linkedChoiceId: "ld",
          timeId: "t1",
          activityId: "drama",
          offeringId: "oA"
        }
      ],
      left: ["t2"]
    });
  });

  it("with none of its periods here, places nobody in it and says so", () => {
    const out = assignSeats(
      input({
        linkedChoiceTimes: [
          { linkedChoiceId: "ld", timeId: "t8", activityId: "drama" },
          { linkedChoiceId: "ld", timeId: "t9", activityId: "drama" }
        ]
      })
    );
    expect(out.findings[0]).toMatchObject({
      kind: "LINKED_PERIOD_LEFT_OUT",
      timeIds: ["t8", "t9"],
      camperIds: []
    });
    expect(out.findings[0].message).toMatch(
      /^“Drama all week”: t8 and t9 can’t be given in this run; nobody was placed in it\.$/
    );
    expect(out.seats.some((x) => x.linkedChoiceId)).toBe(false);
  });
});

describe("empty input", () => {
  it("returns no seats and no findings", () => {
    expect(assignSeats()).toEqual({ ok: true, seats: [], findings: [] });
  });
});
