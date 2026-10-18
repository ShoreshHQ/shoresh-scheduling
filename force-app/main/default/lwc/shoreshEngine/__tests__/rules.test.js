/**
 * The rules one at a time: what Generated Schedule keeps, what it never touches, what it bends
 * (and in which order) when nothing fits, and what it reports as still to place.
 */
import { generateWeek, reasonFor, RELAX_ORDER, RULE } from "c/shoreshEngine";
import { buildTerms } from "c/shoreshTerms";
import { activity, at, block, camp, cellsOf, dateAt, group } from "./data/camp";
import { problems } from "./data/check";

const run = (spec) => generateWeek(camp(spec));
const flagAt = (result, d, groupId, blockId) =>
  result.flags.find(
    (f) =>
      f.date === dateAt(d) && f.groupId === groupId && f.blockId === blockId
  );

describe("never blank (Greg, 2026-10-17)", () => {
  it("fills a cell no activity is set up for, flagged with who it's set up for", () => {
    const result = run({
      groups: [group("g1"), group("g2")],
      activities: [activity("swim", { eligible: ["g2"], atOnce: null })]
    });
    expect(at(result, 0, "g1", 0)).toBe("swim");
    expect(flagAt(result, 0, "g1", "b0")).toMatchObject({
      bends: [RULE.ELIGIBILITY],
      reason: "Not set up for Bunk g1"
    });
  });

  it("goes over a weekly limit before leaving a cell blank", () => {
    const result = run({ days: 2, activities: [activity("swim", { max: 1 })] });
    expect([at(result, 0, "g1", 0), at(result, 1, "g1", 0)]).toEqual([
      "swim",
      "swim"
    ]);
    // Over the limit dots every one of that group's sessions of it (Manual Build's rule).
    expect(result.flags).toHaveLength(2);
    for (const flag of result.flags) {
      expect(flag).toMatchObject({
        bends: [RULE.WEEKLY_MAX],
        reason: "Over its weekly limit"
      });
    }
  });

  it("repeats an activity in a day before leaving a cell blank", () => {
    const result = run({
      blocks: [block(0), block(1)],
      activities: [activity("swim")]
    });
    // Twice in a day dots both.
    expect(result.flags.map((f) => f.bends)).toEqual([
      [RULE.ONCE_A_DAY],
      [RULE.ONCE_A_DAY]
    ]);
    expect(result.flags[0].reason).toBe("Twice in a day");
  });

  it("puts one group too many at an activity before leaving a cell blank, in camp words", () => {
    const result = generateWeek({
      ...camp({
        groups: [group("g1"), group("g2")],
        activities: [activity("swim", { atOnce: 1 })]
      }),
      terms: buildTerms([
        { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true }
      ])
    });
    expect(result.flags).toHaveLength(2);
    expect(result.flags[0]).toMatchObject({
      bends: [RULE.GROUPS_AT_ONCE],
      reason: "Over its limit of 1 Bunk at once"
    });
  });

  it("over-fills a place last, naming the place", () => {
    const result = run({
      groups: [group("g1"), group("g2")],
      locations: [{ id: "pool", name: "Pool", fit: 1 }],
      activities: [activity("swim", { atOnce: null, location: "pool" })]
    });
    expect(result.flags.map((f) => f.bends)).toEqual([
      [RULE.PLACE_CAPACITY],
      [RULE.PLACE_CAPACITY]
    ]);
    expect(result.flags[0].reason).toBe("More groups at Pool than fit");
  });

  // One open cell (Bunk g1, first block) and one activity per rule, each of which would bend
  // exactly that rule there. Taking them away one at a time walks the order rules give way in.
  describe("rules give way in order: weekly max, once a day, who it's set up for, groups at once, same division, the place", () => {
    const candidates = {
      [RULE.WEEKLY_MAX]: activity("x", { max: 0, atOnce: null }),
      [RULE.ONCE_A_DAY]: activity("y", { max: null, atOnce: null }),
      [RULE.ELIGIBILITY]: activity("z", { atOnce: null, eligible: ["g2"] }),
      [RULE.GROUPS_AT_ONCE]: activity("w", { atOnce: 1 }),
      [RULE.SAME_DIVISION]: activity("v", { atOnce: null, sameDivision: true }),
      [RULE.PLACE_CAPACITY]: activity("u", { atOnce: null, location: "hut" })
    };
    const spec = (rules) => ({
      mode: "fillOpen",
      groups: [
        group("g1"),
        group("g2"),
        group("g3", { division: "div2" }),
        group("g4")
      ],
      blocks: [block(0), block(1)],
      locations: [{ id: "hut", name: "Hut", fit: 1 }],
      activities: rules.map((rule) => candidates[rule]),
      // Kept cells that make each candidate bend its one rule at Bunk g1's first block. The
      // other groups' second block is locked Open so nothing else moves.
      cells: [
        { day: 0, group: "g1", block: "b1", act: "y" },
        { day: 0, group: "g2", block: "b0", act: "w" },
        { day: 0, group: "g3", block: "b0", act: "v" },
        { day: 0, group: "g4", block: "b0", act: "u" }
      ],
      locks: ["g2", "g3", "g4"].map((g) => ({
        date: dateAt(0),
        groupId: g,
        blockId: "b1"
      }))
    });

    it.each(RELAX_ORDER.map((rule, i) => [rule, RELAX_ORDER.slice(i)]))(
      "%s gives way when it is the least serious left",
      (rule, rules) => {
        // Activities the kept cells name must exist even when they aren't candidates any more;
        // they are kept as they are.
        const s = spec(rules);
        const result = run(s);
        const flag = flagAt(result, 0, "g1", "b0");
        expect(flag.bends).toEqual([rule]);
        expect(flag.activityId).toBe(candidates[rule].id);
      }
    );
  });

  it("leaves Open only a cell nothing can go in: the group is busy at an overlapping time", () => {
    const result = run({
      blocks: [block(0), block(1, { startTime: "08:30", endTime: "09:15" })],
      activities: [activity("swim"), activity("arts")]
    });
    const filled = [at(result, 0, "g1", 0), at(result, 0, "g1", 1)].filter(
      Boolean
    );
    expect(filled).toHaveLength(1);
    expect(result.openCells).toEqual([
      expect.objectContaining({
        groupId: "g1",
        reason: "Already busy then"
      })
    ]);
  });

  it("names the overlap as the reason even when another rule would also stop the activity", () => {
    const result = run({
      blocks: [
        block(0),
        block(1, { id: "bx", startTime: "08:30", endTime: "09:15" })
      ],
      activities: [activity("swim", { max: 1 })]
    });
    expect(result.openCells).toEqual([
      expect.objectContaining({
        blockId: "bx",
        reason: "Already busy then"
      })
    ]);
  });

  it("where blocks overlap, keeps the most cells filled (8:00 and 9:00 rather than 8:30)", () => {
    for (let option = 1; option <= 10; option++) {
      const result = run({
        option,
        groups: [group("g1"), group("g2")],
        blocks: [
          block(0),
          block(0, { id: "bx", startTime: "08:30", endTime: "09:15" }),
          block(1)
        ],
        activities: [activity("swim"), activity("arts"), activity("hike")]
      });
      for (const g of ["g1", "g2"]) {
        expect([at(result, 0, g, 0), at(result, 0, g, 2)]).not.toContain(null);
        expect(at(result, 0, g, 1)).toBeNull();
      }
      expect(
        result.openCells.map((c) => [c.groupId, c.blockId, c.reason])
      ).toEqual([
        ["g1", "bx", "Already busy then"],
        ["g2", "bx", "Already busy then"]
      ]);
    }
  });

  it("keeps the most cells even when the overlapping block has the fewest choices", () => {
    // Another program holds two of the three activities at 8:46-8:59, a time only the 8:30 block
    // covers, so greedy filling would take 8:30 first and lose 8:00 and 9:00.
    for (let option = 1; option <= 10; option++) {
      const result = run({
        option,
        blocks: [
          block(0),
          block(0, { id: "bx", startTime: "08:30", endTime: "09:15" }),
          block(1)
        ],
        activities: ["swim", "arts", "hike"].map((id) =>
          activity(id, { atOnce: 1 })
        ),
        otherPrograms: ["arts", "hike"].map((activityId) => ({
          date: dateAt(0),
          startTime: "08:46",
          endTime: "08:59",
          activityId
        }))
      });
      expect([
        at(result, 0, "g1", 0),
        at(result, 0, "g1", 1),
        at(result, 0, "g1", 2)
      ]).toEqual([expect.any(String), null, expect.any(String)]);
    }
  });

  it("an Open cell beside a kept one at an overlapping time stays Open, already busy", () => {
    const result = run({
      blocks: [
        block(0),
        block(0, { id: "bx", startTime: "08:30", endTime: "09:15" }),
        block(1)
      ],
      activities: [activity("swim"), activity("arts")],
      cells: [{ day: 0, group: "g1", block: "bx", act: "swim" }],
      locks: [{ date: dateAt(0), groupId: "g1", blockId: "bx" }]
    });
    expect(at(result, 0, "g1", 1)).toBe("swim");
    expect(result.openCells.map((c) => c.blockId)).toEqual(["b0", "b1"]);
  });

  it("never shortens an activity: a gap no activity's length fits stays Open, saying so (Greg)", () => {
    const spec = {
      mode: "fillOpen",
      groups: [group("g1")],
      blocks: [block(0), block(1), block(2)],
      activities: [activity("hike", { span: 2, max: null })],
      // A one-block gap at b1, between a kept hike and a trip.
      cells: [
        { day: 0, group: "g1", block: "b0", act: "hike", length: 1 },
        { day: 0, group: "g1", block: "b2", act: "Zoo trip", kind: "T" }
      ]
    };
    const input = camp(spec);
    const result = generateWeek(input);
    expect(at(result, 0, "g1", 1)).toBeNull();
    expect(result.openCells).toEqual([
      expect.objectContaining({
        blockId: "b1",
        reason: "No activity fits this gap"
      })
    ]);
    expect(problems(spec, input, result)).toEqual([]);
  });

  describe("weekly maximums are soft (Greg, 2026-10-17): over them before anything else, smallest overage first", () => {
    it("a third session of each for one bunk, never a fifth of one", () => {
      // 9 cells, three activities at 2 a week: three cells have to go over.
      const result = run({
        days: 3,
        blocks: [block(0), block(1), block(2)],
        activities: ["art", "swim", "hike"].map((id) =>
          activity(id, { max: 2 })
        )
      });
      const counts = {};
      cellsOf(result.days).forEach((d) =>
        d.g1.forEach((c) => {
          counts[c.id] = (counts[c.id] || 0) + 1;
        })
      );
      expect(counts).toEqual({ art: 3, swim: 3, hike: 3 });
      expect(new Set(result.flags.map((f) => f.reason))).toEqual(
        new Set(["Over its weekly limit"])
      );
    });

    it("the smallest overage wins, not the activity used least", () => {
      // Eight days of one block: art once a week, swim five times. Two cells go over: one more
      // of each (1 over each), never two more art (2 over) because art has been used less.
      const result = run({
        days: 8,
        activities: [activity("art", { max: 1 }), activity("swim", { max: 5 })]
      });
      const art = [0, 1, 2, 3, 4, 5, 6, 7].filter(
        (d) => at(result, d, "g1", 0) === "art"
      );
      expect(art).toHaveLength(2);
    });

    it("going over a maximum comes before any other bend and before leaving a cell Open", () => {
      // Arts is at its limit; swim would be a second group at a one-group activity.
      const result = run({
        mode: "fillOpen",
        groups: [group("g1"), group("g2")],
        days: 2,
        activities: [
          activity("arts", { max: 1, atOnce: null }),
          activity("swim", { atOnce: 1 })
        ],
        cells: [
          { day: 0, group: "g1", block: "b0", act: "arts" },
          { day: 1, group: "g2", block: "b0", act: "swim" }
        ]
      });
      expect(at(result, 1, "g1", 0)).toBe("arts");
      expect(flagAt(result, 1, "g1", "b0").bends).toEqual([RULE.WEEKLY_MAX]);
    });
  });

  it("says so clearly when there are no activities at all, and returns no grid", () => {
    expect(run({ activities: [] })).toEqual({
      ok: false,
      error: "No activities are set up yet."
    });
  });

  it("says so when every activity is closed this week", () => {
    const result = run({
      activities: [activity("swim")],
      weekExceptions: [{ Id: "we1", Week__c: "week1", Activity__c: "swim" }]
    });
    expect(result).toEqual({
      ok: false,
      error: "No activities run this week."
    });
    const inCampWords = generateWeek({
      ...camp({
        activities: [activity("swim")],
        weekExceptions: [{ Id: "we1", Week__c: "week1", Activity__c: "swim" }]
      }),
      terms: buildTerms([
        {
          term: "Week",
          singular: "Session",
          plural: "Sessions",
          isCustom: true
        }
      ])
    });
    expect(inCampWords.error).toBe("No activities run this Session.");
  });
});

describe("what is never touched", () => {
  it("keeps fixed activities, and counts a fixed activity's place against its capacity", () => {
    const spec = {
      groups: [group("g1"), group("g2")],
      blocks: [block(0), block(1)],
      locations: [{ id: "hall", fit: 2 }],
      fixed: [{ id: "lunch", name: "Lunch", block: "b1", location: "hall" }],
      activities: [
        activity("assembly", { atOnce: null, location: "hall" }),
        activity("swim", { atOnce: null })
      ]
    };
    const input = camp(spec);
    const result = generateWeek(input);
    expect(cellsOf(result.days)[0].g1[1]).toEqual({
      kind: "F",
      id: "lunch",
      head: true
    });
    expect(problems(spec, input, result)).toEqual([]);
  });

  it("a recurring activity's place counts against its capacity, read from its own field", () => {
    const result = run({
      groups: [group("g1"), group("g2")],
      blocks: [block(0), block(1)],
      locations: [{ id: "pool", fit: 1 }],
      recurring: [
        {
          id: "swimtest",
          name: "Swim test",
          block: "b0",
          location: "pool",
          groups: ["g1"]
        }
      ],
      activities: [
        activity("swim", { atOnce: null, location: "pool", min: 1, max: 1 }),
        activity("arts", { atOnce: null })
      ]
    });
    expect(cellsOf(result.days)[0].g1[0]).toEqual({
      kind: "R",
      id: "swimtest",
      head: true
    });
    expect(at(result, 0, "g2", 0)).toBe("arts");
    expect(at(result, 0, "g2", 1)).toBe("swim");
  });

  it("a fixed activity filling a place keeps another activity out of it at that time", () => {
    const result = run({
      groups: [group("g1"), group("g2")],
      blocks: [block(0)],
      locations: [{ id: "hall", fit: 1 }],
      fixed: [{ id: "show", block: "b0", location: "hall", groups: ["g1"] }],
      activities: [
        activity("assembly", { atOnce: null, location: "hall" }),
        activity("swim", { atOnce: null })
      ]
    });
    expect(at(result, 0, "g2", 0)).toBe("swim");
  });

  it("leaves a not-at-camp cell Open, even though nothing else is blank", () => {
    const result = run({
      groups: [group("g1", { availability: "MorningOnly" })],
      blocks: [block(0), block(5)],
      activities: [activity("swim"), activity("arts")]
    });
    expect(at(result, 0, "g1", 0)).not.toBeNull();
    expect(at(result, 0, "g1", 1)).toBeNull();
    expect(result.openCells).toEqual([]);
  });

  it("a full build clears an unlocked activity left where the group isn't at camp; fill the open cells keeps it", () => {
    const spec = {
      groups: [group("g1", { availability: "AfternoonOnly" })],
      blocks: [block(0), block(5)],
      activities: [activity("swim"), activity("arts")],
      cells: [{ day: 0, group: "g1", block: "b0", act: "arts" }]
    };
    expect(at(run(spec), 0, "g1", 0)).toBeNull();
    expect(at(run({ ...spec, mode: "fillOpen" }), 0, "g1", 0)).toBe("arts");
  });

  it("keeps a locked cell in a full build and replaces an unlocked one", () => {
    const spec = {
      days: 1,
      blocks: [block(0), block(1)],
      activities: [activity("swim"), activity("arts"), activity("hike")],
      cells: [
        { day: 0, group: "g1", block: "b0", act: "hike" },
        { day: 0, group: "g1", block: "b1", act: "hike" }
      ],
      locks: [{ date: dateAt(0), groupId: "g1", blockId: "b0" }]
    };
    const result = run(spec);
    expect(at(result, 0, "g1", 0)).toBe("hike");
    // The second hike was not locked: rebuilt, it isn't the same activity twice in a day.
    expect(at(result, 0, "g1", 1)).not.toBe("hike");
    expect(result.flags).toEqual([]);
  });

  it("a lock on any cell of a multi-block placement keeps all of it", () => {
    const spec = {
      blocks: [block(0), block(1), block(2)],
      activities: [
        activity("hike", { span: 2 }),
        activity("swim"),
        activity("arts")
      ],
      cells: [{ day: 0, group: "g1", block: "b1", act: "hike" }],
      locks: [{ date: dateAt(0), groupId: "g1", blockId: "b2" }]
    };
    const cells = cellsOf(run(spec).days)[0].g1;
    expect(cells[1]).toEqual({ kind: "A", id: "hike", head: true });
    expect(cells[2]).toEqual({ kind: "A", id: "hike", head: false });
  });

  it("a locked Open cell stays Open", () => {
    const result = run({
      blocks: [block(0), block(1)],
      activities: [activity("swim"), activity("arts")],
      locks: [{ date: dateAt(0), groupId: "g1", blockId: "b1" }]
    });
    expect(at(result, 0, "g1", 1)).toBeNull();
    expect(at(result, 0, "g1", 0)).not.toBeNull();
  });

  it("fill the open cells keeps every filled cell and fills only the Open ones", () => {
    const spec = {
      mode: "fillOpen",
      groups: [group("g1"), group("g2")],
      blocks: [block(0), block(1), block(2)],
      activities: [activity("swim"), activity("arts"), activity("hike")],
      cells: [
        { day: 0, group: "g1", block: "b0", act: "hike" },
        { day: 0, group: "g2", block: "b2", act: "swim" }
      ]
    };
    const input = camp(spec);
    const result = generateWeek(input);
    expect(at(result, 0, "g1", 0)).toBe("hike");
    expect(at(result, 0, "g2", 2)).toBe("swim");
    expect(problems(spec, input, result)).toEqual([]);
    // Kept cells count: hike is already on Bunk g1's day.
    expect([at(result, 0, "g1", 1), at(result, 0, "g1", 2)]).not.toContain(
      "hike"
    );
  });

  it("keeps the row of a group setup no longer has, exactly as it was", () => {
    const input = camp({
      groups: [group("g1"), group("gone")],
      blocks: [block(0), block(1)],
      activities: [activity("swim"), activity("arts")],
      cells: [{ day: 0, group: "gone", block: "b0", act: "swim" }]
    });
    input.groups = input.groups.filter((g) => g.Id !== "gone");
    const result = generateWeek(input);
    expect(cellsOf(result.days)[0].gone).toEqual(cellsOf(input.days)[0].gone);
    expect(at(result, 0, "g1", 0)).not.toBeNull();
  });

  it("keeps not-set-up items from an import (an elective, a trip) where they are", () => {
    const spec = {
      blocks: [block(0), block(1)],
      activities: [activity("swim")],
      cells: [{ day: 0, group: "g1", block: "b0", act: "Zoo trip", kind: "T" }]
    };
    const result = run(spec);
    expect(cellsOf(result.days)[0].g1[0]).toEqual({
      kind: "T",
      id: "Zoo trip",
      head: true
    });
    expect(at(result, 0, "g1", 1)).toBe("swim");
  });
});

describe("the hard rules", () => {
  it("multi-block activities fill consecutive at-camp blocks, as one session", () => {
    const result = run({
      blocks: [block(0), block(1), block(2)],
      activities: [
        activity("hike", { span: 2, min: 1, max: 1 }),
        activity("swim", { max: 1 })
      ]
    });
    const cells = cellsOf(result.days)[0].g1;
    const hike = cells.filter((c) => c && c.id === "hike");
    expect(hike.map((c) => c.head)).toEqual([true, false]);
  });

  it("a multi-block activity never runs into a block where the group isn't at camp", () => {
    const result = run({
      groups: [group("g1", { availability: "MorningOnly" })],
      blocks: [block(3), block(4)],
      activities: [activity("hike", { span: 2, min: 1 }), activity("swim")]
    });
    expect(cellsOf(result.days)[0].g1).toEqual([
      { kind: "A", id: "swim", head: true },
      null
    ]);
  });

  it("an activity with no weekly maximum is placed (NoWeeklyMax)", () => {
    const result = run({
      days: 3,
      activities: [activity("archery", { max: null })]
    });
    expect(result.flags).toEqual([]);
    expect([0, 1, 2].map((d) => at(result, d, "g1", 0))).toEqual([
      "archery",
      "archery",
      "archery"
    ]);
  });

  it("a place shared by two activities holds its groups that fit in total, not per activity", () => {
    const result = run({
      groups: ["g1", "g2", "g3", "g4"].map((id) => group(id)),
      locations: [{ id: "field", fit: 3 }],
      activities: [
        activity("soccer", { atOnce: null, location: "field" }),
        activity("frisbee", { atOnce: null, location: "field" }),
        activity("arts", { atOnce: null, priority: "Low" })
      ]
    });
    const atField = ["g1", "g2", "g3", "g4"].filter((g) =>
      ["soccer", "frisbee"].includes(at(result, 0, g, 0))
    );
    expect(atField).toHaveLength(3);
    expect(result.flags).toEqual([]);
  });

  it("a multi-block activity's later block counts against the place too", () => {
    const result = run({
      groups: [group("g1"), group("g2")],
      blocks: [block(0), block(1)],
      locations: [{ id: "pool", fit: 1 }],
      activities: [
        activity("swim", { span: 2, atOnce: null, location: "pool", min: 1 }),
        activity("dive", { atOnce: null, location: "pool" }),
        activity("arts", { atOnce: null }),
        activity("music", { atOnce: null })
      ]
    });
    const cells = cellsOf(result.days)[0];
    const atPool = (b) =>
      ["g1", "g2"].filter(
        (g) => cells[g][b] && ["swim", "dive"].includes(cells[g][b].id)
      ).length;
    expect([atPool(0), atPool(1)]).toEqual([1, 1]);
    expect(result.flags).toEqual([]);
  });

  it("a place nobody set up (a location not in the list) has no limit", () => {
    const result = run({
      groups: [group("g1"), group("g2")],
      locations: [],
      activities: [activity("swim", { atOnce: null, location: "gone" })]
    });
    expect([at(result, 0, "g1", 0), at(result, 0, "g2", 0)]).toEqual([
      "swim",
      "swim"
    ]);
    expect(result.flags).toEqual([]);
  });

  it("same division only: two divisions never share the activity or its place unflagged", () => {
    const spec = {
      groups: [group("g1"), group("g2", { division: "div2" }), group("g3")],
      blocks: [block(0)],
      locations: [{ id: "court", fit: 3 }],
      activities: [
        activity("tennis", {
          atOnce: null,
          sameDivision: true,
          location: "court",
          min: 1
        }),
        activity("arts", { atOnce: null, priority: "Low" })
      ]
    };
    const input = camp(spec);
    const result = generateWeek(input);
    const divisions = new Set(
      ["g1", "g2", "g3"]
        .filter((g) => at(result, 0, g, 0) === "tennis")
        .map((g) => spec.groups.find((x) => x.id === g).division)
    );
    expect(divisions.size).toBe(1);
    expect(problems(spec, input, result)).toEqual([]);
  });

  it("same division only holds whoever arrived first: another activity can't bring a second division into the place", () => {
    const result = run({
      mode: "fillOpen",
      groups: [group("g1"), group("g2", { division: "div2" })],
      locations: [{ id: "court", fit: 3 }],
      activities: [
        activity("tennis", {
          atOnce: null,
          sameDivision: true,
          location: "court"
        }),
        activity("squash", { atOnce: null, location: "court" }),
        activity("arts", { atOnce: null, priority: "Low" })
      ],
      cells: [{ day: 0, group: "g1", block: "b0", act: "tennis" }]
    });
    expect(at(result, 0, "g2", 0)).toBe("arts");
  });

  it("weekly maximum and once a day hold in a week that fits", () => {
    const spec = {
      groups: [group("g1"), group("g2")],
      days: 3,
      blocks: [block(0), block(1), block(2)],
      activities: ["a", "b", "c", "d"].map((id) =>
        activity(id, { max: 3, atOnce: 1 })
      )
    };
    const input = camp(spec);
    const result = generateWeek(input);
    expect(result.flags).toEqual([]);
    expect(problems(spec, input, result)).toEqual([]);
  });
});

describe("other programs count against capacity (G5 supplies them)", () => {
  it("a place another program fills at that clock time is full for this one", () => {
    for (let option = 1; option <= 10; option++) {
      const result = run({
        option,
        blocks: [block(0), block(1)],
        locations: [{ id: "pool", fit: 1 }],
        activities: [
          activity("swim", { atOnce: null, location: "pool", min: 1, max: 1 }),
          activity("arts", { atOnce: null })
        ],
        otherPrograms: [
          {
            date: dateAt(0),
            startTime: "07:30",
            endTime: "08:30",
            locationId: "pool",
            groups: 1
          }
        ]
      });
      expect(at(result, 0, "g1", 0)).toBe("arts");
      expect(at(result, 0, "g1", 1)).toBe("swim");
      expect(result.flags).toEqual([]);
    }
  });

  it("another program's groups at an activity count against its groups at once", () => {
    const result = run({
      blocks: [block(0), block(1)],
      activities: [
        activity("archery", { atOnce: 2, min: 1, max: 1 }),
        activity("arts")
      ],
      otherPrograms: [
        {
          date: dateAt(0),
          startTime: "08:00",
          endTime: "08:45",
          activityId: "archery",
          groups: 2
        }
      ]
    });
    expect(at(result, 0, "g1", 1)).toBe("archery");
  });

  it("a count of 0 groups from another program takes no room", () => {
    const result = run({
      activities: [activity("archery", { atOnce: 1 })],
      otherPrograms: [
        {
          date: dateAt(0),
          startTime: "08:00",
          endTime: "08:45",
          activityId: "archery",
          groups: 0
        }
      ]
    });
    expect(result.flags).toEqual([]);
  });

  it("only overlapping clock times count: a touching time doesn't", () => {
    const result = run({
      locations: [{ id: "pool", fit: 1 }],
      activities: [activity("swim", { atOnce: null, location: "pool" })],
      otherPrograms: [
        {
          date: dateAt(0),
          startTime: "07:00",
          endTime: "08:00",
          locationId: "pool"
        }
      ]
    });
    expect(result.flags).toEqual([]);
  });
});

describe("soft goals and what is still to place", () => {
  it("places an early-in-the-week goal by its day (by Tuesday counts Tuesday)", () => {
    const result = run({
      days: 5,
      blocks: [block(0), block(1)],
      activities: [
        activity("climb", {
          min: 2,
          max: 2,
          early: { count: 2, day: "Tuesday" }
        }),
        activity("swim", { max: null }),
        activity("arts", { max: null })
      ]
    });
    expect(
      at(result, 0, "g1", 0) === "climb" || at(result, 0, "g1", 1) === "climb"
    ).toBe(true);
    expect(
      at(result, 1, "g1", 0) === "climb" || at(result, 1, "g1", 1) === "climb"
    ).toBe(true);
    expect(result.stillNeeded).toEqual([]);
    expect(result.spread).toEqual([]);
  });

  it("a session later in the week doesn't count toward an early goal", () => {
    const misses = [];
    for (let option = 1; option <= 20; option++) {
      const result = run({
        option,
        days: 5,
        activities: [
          activity("swim", { max: 2, early: { count: 1, day: "Tuesday" } }),
          activity("art"),
          activity("arch")
        ],
        cells: [{ day: 4, group: "g1", block: "b0", act: "swim" }],
        locks: [{ date: dateAt(4), groupId: "g1", blockId: "b0" }]
      });
      if (
        at(result, 0, "g1", 0) !== "swim" &&
        at(result, 1, "g1", 0) !== "swim"
      ) {
        misses.push(option);
      }
    }
    expect(misses).toEqual([]);
  });

  it("lists weekly minimums not met and early goals missed, in camp words", () => {
    const result = run({
      days: 2,
      groups: [group("g1"), group("g2")],
      activities: [
        activity("climb", {
          min: 2,
          max: 2,
          atOnce: 1,
          early: { count: 1, day: "Monday" },
          location: "wall"
        })
      ],
      locations: [{ id: "wall", fit: 1 }],
      fixed: [{ id: "lunch", block: "b0", groups: ["g2"] }]
    });
    expect(result.stillNeeded).toContain("climb · Bunk g2: 2 still needed");
    expect(result.spread).toContain(
      "climb · Bunk g2: 1 still needed by Monday"
    );
  });

  it("high priority is placed before low when there isn't room for both", () => {
    const result = run({
      days: 1,
      activities: [
        activity("low", { priority: "Low", atOnce: null }),
        activity("high", { priority: "High", atOnce: null })
      ]
    });
    expect(at(result, 0, "g1", 0)).toBe("high");
  });

  it("an activity closed this week, or at a place closed this week, isn't placed", () => {
    const result = run({
      days: 2,
      activities: [
        activity("swim", { location: "pool", atOnce: null }),
        activity("arts", { atOnce: null }),
        activity("drama", { atOnce: null })
      ],
      locations: [{ id: "pool", fit: 4 }],
      weekExceptions: [
        { Id: "we1", Week__c: "week1", Location__c: "pool" },
        { Id: "we2", Week__c: "week1", Activity__c: "arts" },
        { Id: "we3", Week__c: "other week", Activity__c: "drama" }
      ]
    });
    expect([at(result, 0, "g1", 0), at(result, 1, "g1", 0)]).toEqual([
      "drama",
      "drama"
    ]);
  });
});

describe("Try another", () => {
  it("refuses an option of 0, a fraction or anything that isn't a number", () => {
    const spec = { activities: [activity("swim")] };
    for (const option of [0, -1, 1.5, "0", "two", NaN]) {
      expect(generateWeek({ ...camp(spec), option })).toEqual({
        ok: false,
        error: "That option can't be built."
      });
    }
    const first = generateWeek({ ...camp(spec), option: undefined });
    expect(first).toEqual(generateWeek(camp({ ...spec, option: 1 })));
  });

  it("takes the option as a number or as text", () => {
    const spec = {
      days: 3,
      blocks: [block(0), block(1)],
      activities: ["a", "b", "c", "d"].map((id) => activity(id))
    };
    expect(generateWeek({ ...camp(spec), option: "2" })).toEqual(
      generateWeek(camp({ ...spec, option: 2 }))
    );
  });
});

describe("the grid it returns", () => {
  it("is Manual Build's day shape: the same frame, items in the order cells use them", () => {
    const input = camp({
      groups: [group("g1"), group("g2")],
      blocks: [block(0), block(1)],
      fixed: [{ id: "lunch", name: "Lunch", block: "b1" }],
      activities: [activity("swim", { atOnce: null })],
      cells: [{ day: 0, group: "g1", block: "b0", act: "gone" }]
    });
    const result = generateWeek(input);
    const day = result.days[0];
    expect(day.dateValue).toBe(input.days[0].dateValue);
    expect(day.blocks).toEqual(input.days[0].blocks);
    expect(day.groups).toEqual(input.days[0].groups);
    // The cleared "gone" item is dropped from the list; no number points past it.
    expect(day.items.map((i) => i.id)).toEqual(["swim", "lunch"]);
    expect(day.rows).toEqual(["1,2", "1,2"]);
  });

  it("shows a kept activity by its name in setup now", () => {
    const input = camp({
      mode: "fillOpen",
      blocks: [block(0), block(1)],
      activities: [activity("swim", { name: "Swimming" }), activity("arts")],
      cells: [{ day: 0, group: "g1", block: "b0", act: "swim" }]
    });
    input.days[0].items[0].name = "Swim (old name)";
    const items = generateWeek(input).days[0].items;
    expect(items.find((i) => i.id === "swim").name).toBe("Swimming");
  });
});

// Manual Build's dots reuse these words (ADR 0010): pinned here so a change is deliberate.
describe("the hover reasons, shared with Manual Build", () => {
  const terms = buildTerms([
    { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true },
    { term: "Division", singular: "Edah", plural: "Edot", isCustom: true }
  ]);
  const cell = {
    groupName: "Bunk 3",
    placeName: "Pool",
    groupsAtOnce: 2,
    terms
  };

  it.each([
    [RULE.WEEKLY_MAX, cell, "Over its weekly limit"],
    [RULE.ONCE_A_DAY, cell, "Twice in a day"],
    [RULE.ELIGIBILITY, cell, "Not set up for Bunk 3"],
    [RULE.GROUPS_AT_ONCE, cell, "Over its limit of 2 Bunks at once"],
    [
      RULE.GROUPS_AT_ONCE,
      { ...cell, groupsAtOnce: 1 },
      "Over its limit of 1 Bunk at once"
    ],
    [RULE.SAME_DIVISION, cell, "Shares Pool with another Edah"],
    [
      RULE.SAME_DIVISION,
      { ...cell, placeName: null },
      "With another Edah at the same time"
    ],
    [RULE.PLACE_CAPACITY, cell, "More Bunks at Pool than fit"]
  ])("%s: %j", (rule, details, words) => {
    expect(reasonFor(rule, details)).toBe(words);
  });

  it("uses the model's words when the camp has none", () => {
    expect(reasonFor(RULE.PLACE_CAPACITY, { placeName: "Pool" })).toBe(
      "More groups at Pool than fit"
    );
  });

  it("has words for every rule that can give way", () => {
    for (const rule of RELAX_ORDER) {
      expect(reasonFor(rule, cell)).not.toBe("");
    }
  });

  it("is what the engine puts on a flagged cell", () => {
    const result = run({
      groups: [group("g1"), group("g2")],
      locations: [{ id: "pool", name: "Pool", fit: 1 }],
      activities: [activity("swim", { atOnce: null, location: "pool" })]
    });
    expect(result.flags[0].reason).toBe(
      reasonFor(RULE.PLACE_CAPACITY, { placeName: "Pool" })
    );
  });
});
