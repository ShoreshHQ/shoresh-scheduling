/**
 * The rules one at a time: what Generated Schedule keeps, what it never touches, what it bends
 * (and in which order) when nothing fits, and what it reports as still to place.
 */
import {
  BUDGET,
  FULL,
  MIN_COST,
  generateWeek,
  NONE_FOR,
  reasonFor,
  RELAX_ORDER,
  RULE,
  SEARCHED
} from "c/shoreshEngine";
import { FIELD } from "c/shoreshSchema";
import { buildTerms } from "c/shoreshTerms";
import { earlyDates } from "../setup";
import { activity, at, block, camp, cellsOf, dateAt, group } from "./data/camp";
import { problems } from "./data/check";

const run = (spec) => generateWeek(camp(spec));
const flagAt = (result, d, groupId, blockId) =>
  result.flags.find(
    (f) =>
      f.date === dateAt(d) && f.groupId === groupId && f.blockId === blockId
  );

// Care plan step 7 (Greg, 2026-10-25): never-blank bends only preferences (weekly max, then once a
// day), never who an activity is for or a physical limit; a cell nothing allowed fits says why.
const openAt = (result, d, groupId, blockId) =>
  result.openCells.find(
    (c) =>
      c.date === dateAt(d) && c.groupId === groupId && c.blockId === blockId
  );

/** A week where every lock is a kept cell: its dots are checkWeek's words for a hand edit. */
const handEdited = (spec) =>
  run({
    ...spec,
    locks: (spec.cells || []).map((c) => ({
      date: dateAt(c.day),
      groupId: c.group,
      blockId: c.block
    }))
  });

describe("never blank (Greg, 2026-10-17; care plan step 7)", () => {
  // CORE-4.1, GEN-3.1, GEN-7.2, GEN-7.8
  it("never places an activity the group isn't set up for: the cell stays Open, saying so", () => {
    const result = run({
      groups: [group("g1"), group("g2")],
      activities: [activity("swim", { eligible: ["g2"], atOnce: null })]
    });
    expect(at(result, 0, "g1", 0)).toBeNull();
    expect(flagAt(result, 0, "g1", "b0")).toBeUndefined();
    expect(openAt(result, 0, "g1", "b0").reason).toBe(
      "No activity this week is set up for Bunk g1"
    );
  });

  // GEN-7.2
  it("never bends who an activity is for, even when something else allowed is full", () => {
    const result = run({
      groups: [group("g1"), group("g2")],
      activities: [
        activity("swim", { atOnce: 1 }),
        activity("arts", { eligible: ["g2"], atOnce: null })
      ]
    });
    // g2 takes arts; swim goes to g1. Nothing else may go anywhere.
    expect(result.flags).toEqual([]);
    expect(result.openCells).toEqual([]);
    expect(at(result, 0, "g1", 0)).toBe("swim");
    expect(at(result, 0, "g2", 0)).toBe("arts");
  });

  it("goes over a weekly limit before leaving a cell blank", () => {
    const result = run({ days: 2, activities: [activity("swim", { max: 1 })] });
    expect([at(result, 0, "g1", 0), at(result, 1, "g1", 0)]).toEqual([
      "swim",
      "swim"
    ]);
    // Only the session past the limit is dotted, the latest in the week (Greg, 2026-10-17).
    expect(result.flags).toHaveLength(1);
    expect(result.flags[0]).toMatchObject({
      date: dateAt(1),
      bends: [RULE.WEEKLY_MAX],
      reason: "Over its weekly limit"
    });
  });

  // CORE-4.2, GEN-3.3
  it("never repeats an activity in a day: the cell stays Open, saying so (Greg, 2026-10-25)", () => {
    const result = run({
      blocks: [block(0), block(1)],
      activities: [activity("swim")]
    });
    expect(result.flags).toEqual([]);
    expect(result.openCells.map((c) => c.reason)).toEqual([
      "Everything for Bunk g1 is taken then"
    ]);
  });

  // CORE-4.8
  it("a hand edit twice in a day is dotted on both", () => {
    const result = handEdited({
      blocks: [block(0), block(1)],
      activities: [activity("swim")],
      cells: [
        { day: 0, group: "g1", block: "b0", act: "swim" },
        { day: 0, group: "g1", block: "b1", act: "swim" }
      ]
    });
    expect(result.flags.map((f) => f.bends)).toEqual([
      [RULE.ONCE_A_DAY],
      [RULE.ONCE_A_DAY]
    ]);
    expect(result.flags[0].reason).toBe("Twice in a day");
  });

  // CORE-4.3, GEN-7.1, GEN-7.8
  it("never puts one group too many at an activity: the cell stays Open, everything taken, in camp words", () => {
    const result = generateWeek({
      ...camp({
        groups: [group("g1"), group("g2")],
        activities: [activity("swim", { atOnce: 1 })]
      }),
      terms: buildTerms([
        { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true },
        {
          term: "Activity",
          singular: "Peulah",
          plural: "Peulot",
          isCustom: true
        }
      ])
    });
    expect(result.flags).toEqual([]);
    expect(at(result, 0, "g1", 0)).toBe("swim");
    expect(result.openCells).toEqual([
      {
        date: dateAt(0),
        groupId: "g2",
        blockId: "b0",
        reason: "Everything for Bunk g2 is taken then",
        why: "full"
      }
    ]);
  });

  // CORE-4.3, GEN-7.1
  it("never over-fills a place", () => {
    const result = run({
      groups: [group("g1"), group("g2")],
      locations: [{ id: "pool", name: "Pool", fit: 1 }],
      activities: [activity("swim", { atOnce: null, location: "pool" })]
    });
    expect(result.flags).toEqual([]);
    expect(at(result, 0, "g1", 0)).toBe("swim");
    expect(result.openCells).toEqual([
      {
        date: dateAt(0),
        groupId: "g2",
        blockId: "b0",
        reason: "Everything for Bunk g2 is taken then",
        why: "full"
      }
    ]);
  });

  // GEN-7.1
  it("never shares a same-division activity across divisions", () => {
    const result = run({
      groups: [group("g1"), group("g2", { division: "div2" })],
      activities: [activity("swim", { atOnce: null, sameDivision: true })]
    });
    expect(result.flags).toEqual([]);
    // g2 has room but the activity is held for g1's division: "taken" is true of both.
    expect(at(result, 0, "g1", 0)).toBe("swim");
    expect(result.openCells).toEqual([
      {
        date: dateAt(0),
        groupId: "g2",
        blockId: "b0",
        reason: "Everything for Bunk g2 is taken then",
        why: "full"
      }
    ]);
  });

  // CORE-4.3 PROG-4.1
  // GEN-7.1
  it("counts other programs as full: the cell stays Open", () => {
    const result = run({
      blocks: [block(0)],
      locations: [{ id: "pool", name: "Pool", fit: 1 }],
      activities: [activity("swim", { atOnce: null, location: "pool" })],
      otherPrograms: [
        {
          date: dateAt(0),
          startTime: "08:00",
          endTime: "08:45",
          groups: 1,
          locationId: "pool",
          names: ["Teen swim"]
        }
      ]
    });
    expect(result.flags).toEqual([]);
    expect(openAt(result, 0, "g1", "b0").reason).toBe(
      "Everything for Bunk g1 is taken then"
    );
  });

  // CORE-4.7, GEN-7.3
  it("goes over the weekly max before leaving a cell Open, though a limit stops everything else", () => {
    const result = run({
      days: 2,
      groups: [group("g1"), group("g2")],
      activities: [
        activity("swim", { max: 1, atOnce: null }),
        activity("arts", { atOnce: 1, max: null })
      ]
    });
    expect(result.openCells).toEqual([]);
    expect(
      result.flags.every((f) => f.bends.every((r) => r === RULE.WEEKLY_MAX))
    ).toBe(true);
  });

  // GEN-3.6
  it("names what another program is doing at the place, and says so for groups at once", () => {
    const other = (extra) => ({
      date: dateAt(0),
      startTime: "08:00",
      endTime: "08:45",
      groups: 1,
      ...extra
    });
    // A hand edit (kept): never-blank no longer bends these limits itself.
    const placed = handEdited({
      blocks: [block(0)],
      locations: [{ id: "pool", name: "Pool", fit: 1 }],
      activities: [activity("swim", { atOnce: null, location: "pool" })],
      otherPrograms: [other({ locationId: "pool", names: ["Teen swim"] })],
      cells: [{ day: 0, group: "g1", block: "b0", act: "swim" }]
    });
    expect(placed.flags.find((f) => f.date === dateAt(0)).reason).toBe(
      "More groups at Pool than fit, in use by Teen swim"
    );
    const atOnce = handEdited({
      blocks: [block(0)],
      activities: [activity("swim", { atOnce: 1 })],
      otherPrograms: [other({ activityId: "swim" })],
      cells: [{ day: 0, group: "g1", block: "b0", act: "swim" }]
    });
    expect(atOnce.flags.find((f) => f.date === dateAt(0)).reason).toBe(
      "Over its limit of 1 group at once, with another program"
    );
  });

  it("lists what is in use as people say it: A, A and B, A, B and C", () => {
    const words = (inUseBy) =>
      reasonFor(RULE.PLACE_CAPACITY, { placeName: "Pool", inUseBy });
    expect(words([])).toBe("More groups at Pool than fit");
    expect(words(["Swim"])).toBe(
      "More groups at Pool than fit, in use by Swim"
    );
    expect(words(["Lunch", "Swim"])).toBe(
      "More groups at Pool than fit, in use by Lunch and Swim"
    );
    expect(words(["Archery", "Lunch", "Swim"])).toBe(
      "More groups at Pool than fit, in use by Archery, Lunch and Swim"
    );
  });

  it("a placement over two blocks says each idea once, naming what is there in either", () => {
    const other = (blockStart, blockEnd, extra) => ({
      date: dateAt(0),
      startTime: blockStart,
      endTime: blockEnd,
      groups: 1,
      ...extra
    });
    // Swim runs Period 1 and 2 at the Pool (fits 1); Teen swim is there in Period 1, Lunch and
    // something the user can't read in Period 2.
    const placed = handEdited({
      blocks: [block(0), block(1)],
      locations: [{ id: "pool", name: "Pool", fit: 1 }],
      activities: [
        activity("swim", { atOnce: null, location: "pool", span: 2 })
      ],
      cells: [{ day: 0, group: "g1", block: "b0", act: "swim" }],
      otherPrograms: [
        other("08:00", "08:45", { locationId: "pool", names: ["Teen swim"] }),
        other("09:00", "09:45", { locationId: "pool", names: ["Lunch"] }),
        other("09:00", "09:45", { locationId: "pool", names: [] })
      ]
    });
    const day0 = placed.flags.filter((f) => f.date === dateAt(0));
    expect(day0.map((f) => f.reason)).toEqual([
      "More groups at Pool than fit, in use by Lunch and Teen swim",
      "More groups at Pool than fit, in use by Lunch and Teen swim"
    ]);
    // Each cell's Overlapping line names only what is there then.
    expect(
      placed.overlapping
        .filter((c) => c.dateValue === dateAt(0))
        .map((c) => c.text.split(": ")[1])
    ).toEqual([
      "More groups at Pool than fit, in use by Teen swim",
      "More groups at Pool than fit, in use by Lunch"
    ]);
    // Two bunks swimming both blocks (one at a time); another program swims in Period 1 only.
    const atOnce = handEdited({
      groups: [group("g1"), group("g2")],
      blocks: [block(0), block(1)],
      activities: [activity("swim", { atOnce: 1, span: 2 })],
      otherPrograms: [other("08:00", "08:45", { activityId: "swim" })],
      cells: [
        { day: 0, group: "g1", block: "b0", act: "swim" },
        { day: 0, group: "g2", block: "b0", act: "swim" }
      ]
    });
    expect([
      ...new Set(
        atOnce.flags.filter((f) => f.date === dateAt(0)).map((f) => f.reason)
      )
    ]).toEqual(["Over its limit of 1 group at once, with another program"]);
  });

  // One open cell (Bunk g1, first block) and one activity per rule, each of which would bend
  // exactly that rule there. Taking them away one at a time walks the order rules give way in.
  // GEN-7.1
  describe("only the weekly max gives way; nothing else ever", () => {
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

    const PREFERENCE = [RULE.WEEKLY_MAX];
    const ways = RELAX_ORDER.map((rule, i) => [rule, RELAX_ORDER.slice(i)]);
    it.each(ways.filter(([rule]) => PREFERENCE.includes(rule)))(
      "%s gives way when it is the least serious left",
      (rule, rules) => {
        // Activities the kept cells name must exist even when they aren't candidates any more;
        // they are kept as they are.
        const flag = flagAt(run(spec(rules)), 0, "g1", "b0");
        expect(flag.bends).toEqual([rule]);
        expect(flag.activityId).toBe(candidates[rule].id);
      }
    );
    it.each(ways.filter(([rule]) => !PREFERENCE.includes(rule)))(
      "%s never gives way: the cell stays Open, saying everything is taken then",
      (rule, rules) => {
        const result = run(spec(rules));
        expect(flagAt(result, 0, "g1", "b0")).toBeUndefined();
        expect(openAt(result, 0, "g1", "b0").reason).toBe(
          "Everything for Bunk g1 is taken then"
        );
      }
    );
  });

  // CORE-4.4, GEN-7.5, GEN-9.6
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

  it("fills two short blocks rather than the long one they overlap (earliest end first)", () => {
    for (let option = 1; option <= 5; option++) {
      const result = run({
        option,
        blocks: [
          block(0, { id: "long", startTime: "08:00", endTime: "10:00" }),
          block(0, { id: "s1", startTime: "08:30", endTime: "09:00" }),
          block(1, { id: "s2", startTime: "09:00", endTime: "09:30" })
        ],
        activities: [activity("swim"), activity("arts"), activity("hike")]
      });
      expect([
        at(result, 0, "g1", 0),
        at(result, 0, "g1", 1),
        at(result, 0, "g1", 2)
      ]).toEqual([null, expect.any(String), expect.any(String)]);
    }
  });

  it("leaves out an Open cell that overlaps a kept one before choosing among the rest", () => {
    // Kept 8:00-8:30. Open 8:15-9:00 overlaps it; 8:45-9:30 doesn't, and is filled.
    const result = run({
      blocks: [
        block(0, { id: "k", startTime: "08:00", endTime: "08:30" }),
        block(0, { id: "o1", startTime: "08:15", endTime: "09:00" }),
        block(0, { id: "o2", startTime: "08:45", endTime: "09:30" })
      ],
      activities: [activity("swim"), activity("arts")],
      cells: [{ day: 0, group: "g1", block: "k", act: "swim" }],
      locks: [{ date: dateAt(0), groupId: "g1", blockId: "k" }]
    });
    expect([at(result, 0, "g1", 1), at(result, 0, "g1", 2)]).toEqual([
      null,
      "arts"
    ]);
  });

  // GEN-3.10
  describe("the overlap choice looks at activity lengths (coordinator's review)", () => {
    // Wake-up 8:00-8:30 overlaps P1 8:00-9:00; P2 9:00-10:00 follows P1.
    const blocks = [
      block(0, {
        id: "wake",
        name: "Wake-up",
        startTime: "08:00",
        endTime: "08:30"
      }),
      block(0, { id: "p1", name: "P1", startTime: "08:00", endTime: "09:00" }),
      block(1, { id: "p2", name: "P2", startTime: "09:00", endTime: "10:00" })
    ];
    const hike = activity("hike", { span: 2, min: 1, max: 1, atOnce: null });

    it("a two-block Hike gets P1 and P2; only Wake-up is left, already busy", () => {
      const result = run({ groups: [group("g1")], blocks, activities: [hike] });
      expect(cellsOf(result.days)[0].g1).toEqual([
        null,
        { kind: "A", id: "hike", head: true },
        { kind: "A", id: "hike", head: false }
      ]);
      expect(result.openCells.map((c) => [c.blockId, c.reason])).toEqual([
        ["wake", "Already busy then"]
      ]);
      expect(result.stillNeeded).toEqual([]);
    });

    it("with a one-block Arts too, the Hike still gets P1 and P2 (not Arts twice)", () => {
      const result = run({
        groups: [group("g1")],
        blocks,
        activities: [hike, activity("arts", { atOnce: null })]
      });
      expect(at(result, 0, "g1", 1)).toBe("hike");
      expect(at(result, 0, "g1", 0)).toBeNull();
      expect(result.flags).toEqual([]);
      expect(result.stillNeeded).toEqual([]);
    });

    // CORE-4.4
    // CORE-1.30: an Open cell says why in plain words ("fits here", never "gap").
    it("a two-block activity never runs through two blocks that overlap in time", () => {
      // Wake-up 8:00-8:30 and P1 8:00-9:00 are one stretch of time, not two periods.
      const result = run({
        groups: [group("g1")],
        blocks: blocks.slice(0, 2),
        activities: [hike]
      });
      expect(cellsOf(result.days)[0].g1).toEqual([null, null]);
      expect(result.openCells.map((c) => [c.blockId, c.reason])).toEqual([
        ["wake", "No activity fits here"],
        ["p1", "No activity fits here"]
      ]);
    });

    it("nor through 10:00-11:30, 11:00-11:45 and 11:00-12:00, which all overlap", () => {
      const result = run({
        groups: [group("g1")],
        blocks: [
          block(2, { id: "a", startTime: "10:00", endTime: "11:30" }),
          block(3, { id: "b", startTime: "11:00", endTime: "11:45" }),
          block(3, { id: "c", startTime: "11:00", endTime: "12:00" })
        ],
        activities: [hike]
      });
      expect(cellsOf(result.days)[0].g1).toEqual([null, null, null]);
      expect(result.openCells.map((c) => c.reason)).toEqual([
        "No activity fits here",
        "No activity fits here",
        "No activity fits here"
      ]);
    });

    // GEN-7.6
    it("a cell left out is filled after all when the overlapping one stays Open", () => {
      // Only a four-block activity: it fits nowhere, so Wake-up, left out for P1, isn't busy
      // after all, and every cell says no activity fits.
      const result = run({
        groups: [group("g1")],
        blocks,
        activities: [activity("trek", { span: 4, atOnce: null })]
      });
      expect(result.openCells.map((c) => [c.blockId, c.reason])).toEqual([
        ["wake", "No activity fits here"],
        ["p1", "No activity fits here"],
        ["p2", "No activity fits here"]
      ]);
    });
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

  // CORE-4.5, GEN-7.5, GEN-9.6
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
        reason: "No activity fits here"
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

    it("the dot goes on a session the build placed, not on a later locked one (the director's choice wins)", () => {
      // Swim once a week, locked on Tuesday; Monday's swim is the build's and goes over.
      const spec = {
        days: 2,
        activities: [activity("swim", { max: 1 })],
        cells: [{ day: 1, group: "g1", block: "b0", act: "swim" }],
        locks: [{ date: dateAt(1), groupId: "g1", blockId: "b0" }]
      };
      const result = run(spec);
      expect(result.flags.map((f) => f.date)).toEqual([dateAt(0)]);
      // Both kept: the latest carries it.
      const allKept = run({
        ...spec,
        mode: "fillOpen",
        cells: [
          { day: 0, group: "g1", block: "b0", act: "swim" },
          { day: 1, group: "g1", block: "b0", act: "swim" }
        ],
        locks: []
      });
      expect(allKept.flags.map((f) => f.date)).toEqual([dateAt(1)]);
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

  // GEN-1.3
  it("says so clearly when there are no activities at all, and returns no grid", () => {
    expect(run({ activities: [] })).toEqual({
      ok: false,
      error: "No activities are set up yet."
    });
  });

  // GEN-1.3
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

// GEN-7.7
describe("what is never touched", () => {
  // CORE-5.1, GEN-2.1, GEN-2.9
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

  // GEN-2.1
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

  // CORE-4.6, GEN-2.6
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

  // CORE-5.1, GEN-2.3
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

  // GEN-2.3
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

  // CORE-4.6, GEN-2.5
  it("a locked Open cell stays Open", () => {
    const result = run({
      blocks: [block(0), block(1)],
      activities: [activity("swim"), activity("arts")],
      locks: [{ date: dateAt(0), groupId: "g1", blockId: "b1" }]
    });
    expect(at(result, 0, "g1", 1)).toBeNull();
    expect(at(result, 0, "g1", 0)).not.toBeNull();
  });

  // GEN-2.4
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

  // GEN-2.7
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
  // CORE-4.5, GEN-3.8
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

  // GEN-3.8
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

  // GEN-1.7
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

  // GEN-3.4
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

  // GEN-3.5
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

  // DIV-4.1, GEN-3.7
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

  // DIV-1.1 DIV-4.1
  it("same division only: groups in no division share a division with nobody", () => {
    // A group in no division is held alone in a division record of its own name.
    const spec = {
      groups: [
        group("juniors", { division: "juniors" }),
        group("seniors", { division: "seniors" })
      ],
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
    const onCourt = ["juniors", "seniors"].filter(
      (g) => at(result, 0, g, 0) === "tennis"
    );
    expect(onCourt.length).toBe(1);
    expect(problems(spec, input, result)).toEqual([]);
  });

  // DIV-4.1
  // DIV-4.1, GEN-3.7
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

  // GEN-3.2
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
  // PROG-4.1
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

  // PROG-4.2
  it("another program's groups at an activity count against its groups at once", () => {
    for (let option = 1; option <= 10; option++) {
      const result = run({
        option,
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
      // Respecting it leaves nothing to dot.
      expect(result.flags).toEqual([]);
    }
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

  it("another program's group at a same-division-only activity's place dots it, and the engine keeps away", () => {
    const spec = {
      groups: [group("g1")],
      blocks: [block(0), block(1)],
      locations: [{ id: "court", name: "Court", fit: 3 }],
      activities: [
        activity("tennis", {
          atOnce: null,
          sameDivision: true,
          location: "court",
          min: 1,
          max: 1
        }),
        activity("arts", { atOnce: null })
      ],
      otherPrograms: [
        {
          date: dateAt(0),
          startTime: "08:00",
          endTime: "08:45",
          locationId: "court"
        }
      ]
    };
    // Built from scratch, tennis waits for the second block.
    const built = run(spec);
    expect(at(built, 0, "g1", 1)).toBe("tennis");
    expect(built.flags).toEqual([]);
    // Kept in the first block, it is dotted.
    const kept = run({
      ...spec,
      mode: "fillOpen",
      cells: [{ day: 0, group: "g1", block: "b0", act: "tennis" }]
    });
    expect(flagAt(kept, 0, "g1", "b0")).toMatchObject({
      bends: [RULE.SAME_DIVISION],
      reason: "Shares Court with another division"
    });
  });

  it("another program's group doing a same-division-only activity dots it, even at its place", () => {
    const result = run({
      mode: "fillOpen",
      groups: [group("g1")],
      blocks: [block(0), block(1)],
      locations: [{ id: "court", name: "Court", fit: 3 }],
      activities: [
        activity("tennis", {
          atOnce: null,
          sameDivision: true,
          location: "court"
        }),
        activity("arts", { atOnce: null })
      ],
      cells: [{ day: 0, group: "g1", block: "b0", act: "tennis" }],
      otherPrograms: [
        {
          date: dateAt(0),
          startTime: "08:00",
          endTime: "08:45",
          activityId: "tennis"
        }
      ]
    });
    expect(flagAt(result, 0, "g1", "b0")).toMatchObject({
      bends: [RULE.SAME_DIVISION],
      reason: "Shares Court with another division"
    });
  });

  it("another program's session at the place and doing the activity is one overlap for the cell", () => {
    const result = run({
      mode: "fillOpen",
      groups: [group("g1")],
      blocks: [block(0), block(1)],
      locations: [{ id: "court", name: "Court", fit: 3 }],
      activities: [
        activity("tennis", {
          atOnce: null,
          sameDivision: true,
          location: "court"
        }),
        activity("arts", { atOnce: null })
      ],
      cells: [{ day: 0, group: "g1", block: "b0", act: "tennis" }],
      otherPrograms: [
        {
          date: dateAt(0),
          startTime: "08:00",
          endTime: "08:45",
          locationId: "court",
          activityId: "tennis"
        }
      ]
    });
    expect(result.overlapping).toEqual([
      {
        dateValue: dateAt(0),
        groupId: "g1",
        blockId: "b0",
        rules: [RULE.SAME_DIVISION],
        text: "Bunk g1 · Monday · Period 1: Shares Court with another division"
      }
    ]);
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

describe("a blank setup field counts as 1, and is said (care plan step 1)", () => {
  const blanked = (spec, { atOnce = [], fit = [] }) => {
    const input = camp(spec);
    for (const r of input.activities) {
      if (atOnce.includes(r.Id)) {
        r[FIELD.Activity.GroupsAtOnce] = null;
        r[FIELD.Activity.NoGroupLimit] = false;
      }
    }
    for (const r of input.locations) {
      if (fit.includes(r.Id)) {
        r[FIELD.Location.GroupsThatFit] = null;
      }
    }
    return generateWeek(input);
  };

  // CORE-3.6, GEN-1.5
  it("a blank groups at once: one group at a time, never blocking the build, and a line naming it", () => {
    const result = blanked(
      {
        groups: [group("g1"), group("g2")],
        activities: [activity("arts", { name: "Arts" })]
      },
      { atOnce: ["arts"] }
    );
    expect(result.ok).toBe(true);
    expect(result.setupNotes).toEqual([
      "Arts: Groups at once is blank, so it counts as 1"
    ]);
    expect(
      [at(result, 0, "g1", 0), at(result, 0, "g2", 0)].filter(Boolean)
    ).toEqual(["arts"]);
    expect(result.flags).toEqual([]);
  });

  // CORE-3.6, GEN-1.6
  it("a blank groups that fit: one group at the place, a line naming the place", () => {
    const result = blanked(
      {
        groups: [group("g1"), group("g2")],
        locations: [{ id: "field", name: "Field", fit: 3 }],
        activities: [activity("sports", { atOnce: null, location: "field" })]
      },
      { fit: ["field"] }
    );
    expect(result.ok).toBe(true);
    expect(result.setupNotes).toEqual([
      "Field: Groups that fit is blank, so it counts as 1"
    ]);
    expect(result.openCells).toHaveLength(1);
  });

  it("says nothing of a blank place no activity this week uses", () => {
    const result = blanked(
      {
        locations: [{ id: "shed", name: "Shed", fit: 2 }],
        activities: [activity("swim", { atOnce: null })]
      },
      { fit: ["shed"] }
    );
    expect(result.setupNotes).toEqual([]);
  });

  it("says nothing when every field is set, or the activity has no group limit", () => {
    const result = run({ activities: [activity("swim", { atOnce: null })] });
    expect(result.setupNotes).toEqual([]);
  });
});

// GEN-3.12
describe("early-week goals count the first days of this week's run (Greg, 2026-10-25)", () => {
  const goal = (day, count = 1) =>
    activity("climb", { name: "Climbing", early: { count, day }, max: null });

  it("by Tuesday is the first 2 days of a Monday-Friday camp's run, whatever day it starts", () => {
    // A Monday-start week: Monday and Tuesday.
    expect([...earlyDates([0, 1, 2, 3].map(dateAt), 2)]).toEqual([
      dateAt(0),
      dateAt(1)
    ]);
    // A short Wednesday-Friday week: Wednesday and Thursday.
    expect([...earlyDates([2, 3, 4].map(dateAt), 2, 1)]).toEqual([
      dateAt(2),
      dateAt(3)
    ]);
    // A Tuesday-Friday holiday week, by Monday: Tuesday only.
    expect([...earlyDates([1, 2, 3, 4].map(dateAt), 1, 1)]).toEqual([
      dateAt(1)
    ]);
  });

  it("counts from the camp's own first day: a Sunday-Thursday camp's by Tuesday is 3 days (ADR 0022)", () => {
    const sunday = ["2026-07-05", "2026-07-06", "2026-07-07", "2026-07-08"];
    expect([...earlyDates(sunday, 2, 7)]).toEqual([
      "2026-07-05",
      "2026-07-06",
      "2026-07-07"
    ]);
    // Through the engine: the camp's first day comes with the week (firstDay).
    const input = camp({
      days: 4,
      groups: [group("g1")],
      blocks: [block(0)],
      activities: [goal("Tuesday", 3), activity("arts", { max: null })]
    });
    input.days.forEach((day, i) => {
      day.dateValue = sunday[i];
    });
    input.firstDay = 7;
    const result = generateWeek(input);
    expect([0, 1, 2].map((d) => at(result, d, "g1", 0))).toEqual([
      "climb",
      "climb",
      "climb"
    ]);
    expect(result.spread).toEqual([]);
  });

  it("counts days of the run, not the calendar: a missing weekday doesn't shorten it", () => {
    // Monday, Wednesday, Thursday: by Tuesday counts Monday and Wednesday.
    expect([...earlyDates([dateAt(0), dateAt(2), dateAt(3)], 2)]).toEqual([
      dateAt(0),
      dateAt(2)
    ]);
  });

  it("a goal later than the run is long counts the whole run", () => {
    const days = [0, 1, 2, 3].map(dateAt);
    expect(earlyDates(days, 5).size).toBe(4);
    expect(earlyDates(days, 7).size).toBe(4);
  });

  it("skips a special day and a day the group isn't in: the group's own first days of the run count", () => {
    // Monday to Thursday, by Tuesday. Monday is a special day for everyone; g2 isn't in on
    // Tuesday. g1's early days are Tuesday and Wednesday; g2's are Wednesday and Thursday.
    const input = camp({
      days: 4,
      groups: [group("g1"), group("g2")],
      blocks: [block(0)],
      activities: [
        activity("climb", {
          name: "Climbing",
          early: { count: 2, day: "Tuesday" },
          max: null,
          atOnce: null
        }),
        activity("arts", { max: null })
      ]
    });
    input.replacedDates = [dateAt(0)];
    const tuesday = input.days[1];
    const g2 = tuesday.groups.findIndex((g) => g.id === "g2");
    tuesday.groups = tuesday.groups.filter((_, i) => i !== g2);
    tuesday.rows = tuesday.rows.filter((_, i) => i !== g2);
    const result = generateWeek(input);
    expect(at(result, 1, "g1", 0)).toBe("climb");
    expect(at(result, 2, "g1", 0)).toBe("climb");
    expect(at(result, 2, "g2", 0)).toBe("climb");
    expect(at(result, 3, "g2", 0)).toBe("climb");
    expect(result.spread).toEqual([]);
  });

  // GEN-9.5
  it("places it in the first days of a week that starts mid-week, and never says a week has no early days", () => {
    // Wednesday to Friday, by Tuesday: Wednesday and Thursday count.
    const result = run({
      days: [2, 3, 4].map(dateAt),
      blocks: [block(0)],
      activities: [goal("Tuesday", 2), activity("arts", { max: null })]
    });
    expect(at(result, 0, "g1", 0)).toBe("climb");
    expect(at(result, 1, "g1", 0)).toBe("climb");
    expect(result.spread).toEqual([]);
    expect(result.noEarlyDay).toBeUndefined();
    expect(result.noEarlyDayBy).toBeUndefined();
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

  // GEN-3.13
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

  // CORE-5.3, GEN-4.1
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

  // CLOSE-4.2, GEN-1.2
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
  // GEN-1.11
  it("refuses an option of 0, a fraction or anything that isn't a number", () => {
    const spec = { activities: [activity("swim")] };
    for (const option of [
      0,
      -1,
      1.5,
      "0",
      "two",
      NaN,
      "1e3",
      "0x10",
      " 2",
      "2.0",
      Infinity,
      // A schedule stores four digits (EngineOption__c): an option it couldn't save isn't built.
      10000,
      "10000"
    ]) {
      expect(generateWeek({ ...camp(spec), option })).toEqual({
        ok: false,
        error: "That option can't be built."
      });
    }
    expect(generateWeek({ ...camp(spec), option: 9999 }).ok).toBe(true);
    expect(generateWeek({ ...camp(spec), option: "9999" }).ok).toBe(true);
    const first = generateWeek({ ...camp(spec), option: undefined });
    expect(first).toEqual(generateWeek(camp({ ...spec, option: 1 })));
  });

  // GEN-1.11
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

describe("the lines that name a day", () => {
  it("names a Saturday (and Sunday) like any other day", () => {
    // Two kept swims at a one-group activity on a Saturday: each cell is an overlap.
    const result = run({
      mode: "fillOpen",
      days: [dateAt(5)],
      groups: [group("g1"), group("g2")],
      activities: [activity("swim", { atOnce: 1 })],
      cells: [
        { day: 0, group: "g1", block: "b0", act: "swim" },
        { day: 0, group: "g2", block: "b0", act: "swim" }
      ]
    });
    expect(result.overlapping.map((o) => o.text)).toEqual([
      "Bunk g1 · Saturday · Period 1: Over its limit of 1 group at once",
      "Bunk g2 · Saturday · Period 1: Over its limit of 1 group at once"
    ]);
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
// GEN-9.3
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
    [RULE.PLACE_CAPACITY, cell, "More Bunks at Pool than fit"],
    [FULL, cell, "Everything for Bunk 3 is taken then"],
    [NONE_FOR, cell, "No activity this week is set up for Bunk 3"],
    [SEARCHED, cell, "Everything that fits this day is already placed"],
    [
      MIN_COST,
      { ...cell, activityName: "Swim" },
      "Filling it would leave Bunk 3 short of Swim"
    ],
    [BUDGET, cell, "Shoresh couldn't finish checking every way to fill this"]
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
    const result = handEdited({
      groups: [group("g1"), group("g2")],
      locations: [{ id: "pool", name: "Pool", fit: 1 }],
      activities: [activity("swim", { atOnce: null, location: "pool" })],
      cells: [
        { day: 0, group: "g1", block: "b0", act: "swim" },
        { day: 0, group: "g2", block: "b0", act: "swim" }
      ]
    });
    expect(result.flags[0].reason).toBe(
      reasonFor(RULE.PLACE_CAPACITY, { placeName: "Pool" })
    );
  });
});
