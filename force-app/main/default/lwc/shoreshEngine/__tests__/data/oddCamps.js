/**
 * The odd-camp library (engine care plan, PR 2): made-up camps, each odd in one way a real camp
 * can be, plus a few ordinary ones of every size. Each says in plain words what makes it odd.
 * Synthetic data only. oddCamps.test.js builds every camp and holds it to the settled rules
 * (data/settledRules.js).
 *
 * A camp: { name, odd, spec } where spec is camp.js's, plus:
 *   replaced: [day indexes] a special day replaces (sent as replacedDates),
 *   blank: { atOnce: [activity ids], fit: [location ids] } fields left blank in setup (the spec
 *     holds 1 there, what a blank counts as).
 * small: true marks camps small enough for the exhaustive gap oracle.
 */
import { nsName } from "shoresh-jest/namespace";
import { activity, block, camp, dateAt, group } from "./camp";

const groups = (n, over = () => ({})) =>
  Array.from({ length: n }, (_, i) =>
    group(`g${String(i + 1).padStart(2, "0")}`, over(i))
  );
const blocks = (n) => Array.from({ length: n }, (_, i) => block(i));

/** Three ordinary activities nobody is short of room for. */
const ordinary = () => [
  activity("swim", { min: 1, max: 2, location: "pool" }),
  activity("arts", { min: 1, max: 3, atOnce: 2 }),
  activity("sports", { min: 1, max: 3, atOnce: 2, location: "field" })
];
const ordinaryPlaces = [
  { id: "pool", name: "Pool", fit: 1 },
  { id: "field", name: "Field", fit: 2 }
];

/** An ordinary camp of n groups over five days, in three divisions. */
function ordinaryCamp(n, blockCount) {
  return {
    groups: groups(n, (i) => ({ division: `div${i % 3}` })),
    days: 5,
    blocks: blocks(blockCount),
    locations: [
      { id: "pool", name: "Pool", fit: Math.max(1, Math.floor(n / 4)) },
      { id: "field", name: "Field", fit: Math.max(2, Math.floor(n / 3)) },
      { id: "hall", name: "Hall", fit: Math.max(1, Math.floor(n / 4)) }
    ],
    activities: [
      activity("swim", { min: 2, max: 3, atOnce: null, location: "pool" }),
      activity("soccer", { min: 1, max: 3, atOnce: null, location: "field" }),
      activity("arts", { min: 1, max: 3, atOnce: null, location: "hall" }),
      activity("hike", { min: 1, max: 1, span: 2, atOnce: 2, priority: "Low" }),
      activity("drama", {
        min: 1,
        max: 2,
        atOnce: Math.max(1, Math.floor(n / 4)),
        sameDivision: true,
        early: { count: 1, day: "Wednesday" }
      }),
      activity("games", { min: 0, max: 5, atOnce: null, priority: "Low" }),
      activity("music", { min: 0, max: 5, atOnce: null, priority: "Low" }),
      activity("nature", { min: 0, max: 5, atOnce: null, priority: "Low" })
    ],
    fixed: [{ id: "lunch", name: "Lunch", block: "b3" }]
  };
}

export const ODD_CAMPS = [
  {
    name: "one group",
    odd: "A single bunk: nothing to share, nothing to clash with.",
    small: true,
    spec: {
      groups: groups(1),
      days: 3,
      blocks: blocks(3),
      locations: ordinaryPlaces,
      activities: ordinary()
    }
  },
  {
    name: "sixty groups",
    odd: "Sixty bunks in six divisions over a five-day week, the most a big camp runs.",
    spec: {
      ...ordinaryCamp(60, 6),
      groups: groups(60, (i) => ({ division: `div${i % 6}` }))
    }
  },
  {
    name: "one activity only",
    odd: "The camp offers just one activity, open to everyone at once.",
    small: true,
    spec: {
      groups: groups(3),
      days: 2,
      blocks: blocks(2),
      activities: [activity("swim", { min: 1, max: null, atOnce: null })]
    }
  },
  {
    name: "weekend-only week",
    odd: "The week is a Saturday and a Sunday, and climbing should come by Tuesday.",
    small: true,
    spec: {
      groups: groups(2),
      days: [dateAt(5), dateAt(6)],
      blocks: blocks(2),
      activities: [
        activity("climb", {
          min: 1,
          max: 2,
          early: { count: 1, day: "Tuesday" }
        }),
        activity("arts", { min: 0, max: 2, atOnce: null })
      ]
    }
  },
  {
    name: "Sunday-start week",
    odd: "The week starts on Sunday; climbing twice by Monday counts Sunday as early.",
    small: true,
    spec: {
      groups: groups(1),
      days: [dateAt(-1), dateAt(0), dateAt(1), dateAt(2)],
      blocks: blocks(1),
      activities: [
        activity("climb", {
          min: 2,
          max: 2,
          early: { count: 2, day: "Monday" }
        }),
        activity("arts", { min: 0, max: 4 })
      ]
    }
  },
  {
    name: "goal by Sunday",
    odd: "A Sunday-start week whose early goal is 'by Sunday', the week's first day.",
    small: true,
    spec: {
      groups: groups(1),
      days: [dateAt(-1), dateAt(0), dateAt(1)],
      blocks: blocks(1),
      activities: [
        activity("climb", {
          min: 1,
          max: 1,
          early: { count: 1, day: "Sunday" }
        }),
        activity("arts", { min: 0, max: 3 })
      ]
    }
  },
  {
    name: "half days",
    odd: "One bunk comes mornings only, one afternoons only, one all day.",
    small: true,
    spec: {
      groups: [
        group("am", { availability: "MorningOnly" }),
        group("pm", { availability: "AfternoonOnly" }),
        group("all")
      ],
      days: 2,
      blocks: [block(2), block(3), block(4), block(5)],
      activities: [
        activity("swim", { min: 1, max: 2 }),
        activity("arts", { min: 1, max: 2 }),
        activity("games", { min: 0, max: 4, atOnce: null })
      ]
    }
  },
  {
    name: "overlapping time blocks",
    odd: "A long 9:00 to 10:30 block sits over two short ones; a bunk can be in one or the other pair.",
    small: true,
    spec: {
      groups: groups(2),
      days: 2,
      blocks: [
        block(0),
        block(1, {
          id: "long",
          name: "Long",
          startTime: "09:00",
          endTime: "10:30"
        }),
        block(1, {
          id: "s1",
          name: "Short 1",
          startTime: "09:00",
          endTime: "09:45"
        }),
        block(2, {
          id: "s2",
          name: "Short 2",
          startTime: "09:45",
          endTime: "10:30"
        })
      ],
      activities: [
        activity("swim", { min: 1, max: 3 }),
        activity("arts", { min: 1, max: 3 }),
        activity("hike", { min: 0, max: 1, span: 2, priority: "Low" })
      ]
    }
  },
  {
    name: "every activity closed one day",
    odd: "On Tuesday a camp-wide event takes every bunk all day; nothing else can run.",
    small: true,
    spec: {
      groups: groups(2),
      days: 3,
      blocks: blocks(2),
      activities: [
        activity("swim", { min: 2, max: 2 }),
        activity("arts", { min: 2, max: 2 })
      ],
      cells: ["g01", "g02"].map((g) => ({
        day: 1,
        group: g,
        block: "b0",
        act: "a0E000000000009AAA",
        kind: "S",
        length: 2
      }))
    }
  },
  {
    name: "a closed place",
    odd: "The pool is closed this week, so swimming can't run at all.",
    small: true,
    spec: {
      groups: groups(2),
      days: 2,
      blocks: blocks(2),
      locations: ordinaryPlaces,
      activities: ordinary(),
      weekExceptions: [{ Id: "we1", Week__c: "week1", Location__c: "pool" }]
    }
  },
  {
    name: "scarce places",
    odd: "Four bunks, and every activity is in a place that holds one bunk; only three places.",
    small: true,
    spec: {
      groups: groups(4),
      days: 1,
      blocks: blocks(2),
      locations: [
        { id: "pool", name: "Pool", fit: 1 },
        { id: "field", name: "Field", fit: 1 },
        { id: "hall", name: "Hall", fit: 1 }
      ],
      activities: [
        activity("swim", { atOnce: null, location: "pool" }),
        activity("soccer", { atOnce: null, location: "field" }),
        activity("arts", { atOnce: null, location: "hall" })
      ]
    }
  },
  {
    name: "groups away part of the week",
    odd: "One bunk is away on a trip Monday and Tuesday; another misses Thursday.",
    spec: {
      groups: groups(3),
      days: 4,
      blocks: blocks(2),
      locations: ordinaryPlaces,
      activities: ordinary(),
      away: { g01: [0, 1], g02: [3] }
    }
  },
  {
    name: "heavy eligibility",
    odd: "The youngest bunk may only do two activities; one activity is for one division only.",
    small: true,
    spec: {
      groups: [group("young", { division: "minis" }), group("g1"), group("g2")],
      days: 2,
      blocks: blocks(3),
      activities: [
        activity("sand", { max: 3, atOnce: null, eligible: ["minis"] }),
        activity("story", { max: 3, atOnce: null, eligible: ["young", "g1"] }),
        activity("climb", { min: 1, max: 2, eligible: ["div1"] }),
        activity("archery", { min: 1, max: 2, eligible: ["div1"] }),
        activity("games", { max: 3, atOnce: null, eligible: ["div1"] })
      ]
    }
  },
  {
    name: "eligible activities all full",
    odd: "A bunk may only swim, and the pool is taken by another bunk every block.",
    small: true,
    spec: {
      groups: [group("young", { division: "minis" }), group("g1")],
      days: 1,
      blocks: blocks(2),
      locations: [{ id: "pool", name: "Pool", fit: 1 }],
      activities: [
        activity("swim", { max: 5, atOnce: null, location: "pool" }),
        activity("arts", { max: 5, eligible: ["div1"] })
      ],
      cells: [
        { day: 0, group: "g1", block: "b0", act: "swim" },
        { day: 0, group: "g1", block: "b1", act: "swim" }
      ],
      locks: ["b0", "b1"].map((b) => ({
        date: dateAt(0),
        groupId: "g1",
        blockId: b
      }))
    }
  },
  {
    name: "multi-block activities",
    odd: "A three-block hike and a two-block trip in a four-block day.",
    small: true,
    spec: {
      groups: groups(2),
      days: 2,
      blocks: blocks(4),
      activities: [
        activity("hike", { min: 1, max: 1, span: 3 }),
        activity("trip", { min: 1, max: 2, span: 2 }),
        activity("games", { min: 0, max: 8, atOnce: null, priority: "Low" })
      ]
    }
  },
  {
    name: "impossible goals",
    odd: "Minimums add up to more sessions than the week has blocks.",
    small: true,
    spec: {
      groups: groups(2),
      days: 2,
      blocks: blocks(2),
      activities: [
        activity("swim", { min: 3, max: 3 }),
        activity("arts", { min: 3, max: 3 })
      ]
    }
  },
  {
    name: "priority mix",
    odd: "A scarce high-priority activity, a scarce low one and a free filler.",
    small: true,
    spec: {
      groups: groups(3),
      days: 2,
      blocks: blocks(2),
      activities: [
        activity("swim", { min: 2, max: 2, priority: "High" }),
        activity("boats", { min: 2, max: 2, priority: "Low" }),
        activity("games", { min: 0, max: 4, atOnce: null, priority: "Low" })
      ]
    }
  },
  {
    name: "locks and hand edits",
    odd: "A director locked Monday morning's swim and an empty Tuesday cell, and placed arts by hand.",
    small: true,
    spec: {
      groups: groups(2),
      days: 2,
      blocks: blocks(2),
      locations: ordinaryPlaces,
      activities: ordinary(),
      mode: "fillOpen",
      cells: [
        { day: 0, group: "g01", block: "b0", act: "swim" },
        { day: 0, group: "g02", block: "b1", act: "arts" }
      ],
      locks: [
        { date: dateAt(0), groupId: "g01", blockId: "b0" },
        { date: dateAt(1), groupId: "g02", blockId: "b1" }
      ]
    }
  },
  {
    name: "other programs share places",
    odd: "The teen program holds the pool all Monday morning and runs arts at the same time.",
    small: true,
    spec: {
      groups: groups(2),
      days: 2,
      blocks: blocks(2),
      locations: ordinaryPlaces,
      activities: ordinary(),
      otherPrograms: [
        {
          date: dateAt(0),
          startTime: "08:00",
          endTime: "09:45",
          groups: 1,
          locationId: "pool",
          names: ["Teen swim"]
        },
        {
          date: dateAt(0),
          startTime: "08:00",
          endTime: "08:45",
          groups: 2,
          activityId: "arts",
          names: ["Teen arts"]
        }
      ]
    }
  },
  {
    name: "special and replaced days",
    odd: "Wednesday is replaced by a special day; a carnival takes Monday's second block.",
    small: true,
    replaced: [2],
    spec: {
      groups: groups(2),
      days: 3,
      blocks: blocks(2),
      activities: [
        activity("swim", { min: 1, max: 2 }),
        activity("arts", { min: 1, max: 2 })
      ],
      cells: ["g01", "g02"].map((g) => ({
        day: 0,
        group: g,
        block: "b1",
        act: "a0E000000000001AAA",
        kind: "S"
      }))
    }
  },
  {
    name: "blank groups at once",
    odd: "Arts has its groups-at-once left blank in setup.",
    small: true,
    blank: { atOnce: ["arts"] },
    spec: {
      groups: groups(2),
      days: 1,
      blocks: blocks(1),
      activities: [activity("arts", { max: 5, atOnce: 1 })]
    }
  },
  {
    name: "blank groups that fit",
    odd: "The field's groups-that-fit is left blank in setup.",
    small: true,
    blank: { fit: ["field"] },
    spec: {
      groups: groups(2),
      days: 1,
      blocks: blocks(1),
      locations: [{ id: "field", name: "Field", fit: 1 }],
      activities: [
        activity("soccer", { max: 5, atOnce: null, location: "field" })
      ]
    }
  },
  {
    name: "ordinary small camp",
    odd: "Nothing odd: four bunks, five days, five blocks.",
    spec: ordinaryCamp(4, 5)
  },
  {
    name: "ordinary medium camp",
    odd: "Nothing odd: twelve bunks, five days, six blocks.",
    spec: ordinaryCamp(12, 6)
  },
  {
    name: "ordinary large camp",
    odd: "Nothing odd: thirty bunks, five days, seven blocks.",
    spec: ordinaryCamp(30, 7)
  }
];

/** What the engine gets for a library camp: camp.js's input, blank fields and replaced days added. */
export function inputOf(c) {
  const input = camp(c.spec);
  const blank = c.blank || {};
  for (const r of input.activities) {
    if ((blank.atOnce || []).includes(r.Id)) {
      r[nsName("GroupsAtOnce__c")] = null;
      r[nsName("NoGroupLimit__c")] = false;
    }
  }
  for (const r of input.locations) {
    if ((blank.fit || []).includes(r.Id)) {
      r[nsName("GroupsThatFit__c")] = null;
    }
  }
  if (c.replaced) {
    input.replacedDates = c.replaced.map((d) => input.days[d].dateValue);
  }
  return input;
}
