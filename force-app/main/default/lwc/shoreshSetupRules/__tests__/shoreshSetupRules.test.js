import * as rules from "c/shoreshSetupRules";
import { buildTerms } from "c/shoreshTerms";
import { FIELD } from "c/shoreshSchema";
import { nsName, nsRecord } from "shoresh-jest/namespace";

const { suggestedCopyName, suggestedCopyStart } = rules;
// Fixtures are written with bare names and given to the rules as the package would send them
// (nsRecord: unchanged normally, shoresh__-prefixed in the namespaced run). Expected records go
// through nsRecord too.
const setupProblems = (setup, t) => rules.setupProblems(nsRecord(setup), t);
// The set-time notes here are about recurring activities (who they cover), and the changed
// blocks about a fixed one ("Rest"): each is given its own object's fields.
const setTimeNote = (entry, item) =>
  rules.setTimeNote(nsRecord(entry), nsRecord(item), FIELD.RecurringActivity);
const spanChange = (entry, item, t) =>
  rules.spanChange(nsRecord(entry), nsRecord(item), t, FIELD.FixedActivity);

const terms = buildTerms([
  { term: "Week", singular: "Session", plural: "Sessions", isCustom: true },
  { term: "Season", singular: "Season", plural: "Seasons", isCustom: false },
  { term: "Program", singular: "Program", plural: "Programs", isCustom: false },
  {
    term: "TimeBlock",
    singular: "Time block",
    plural: "Time blocks",
    isCustom: false
  },
  {
    term: "Division",
    singular: "Division",
    plural: "Divisions",
    isCustom: false
  },
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true },
  {
    term: "Activity",
    singular: "Activity",
    plural: "Activities",
    isCustom: false
  },
  {
    term: "RainPlan",
    singular: "Wet-weather plan",
    plural: "Wet-weather plans",
    isCustom: true
  }
]);

const season = {
  Name: "Summer 2026",
  StartDate__c: "2026-06-29",
  EndDate__c: "2026-08-07"
};
const week = (Name, start, end) => ({
  Name,
  StartDate__c: start,
  EndDate__c: end
});
const fullProgram = {
  program: { Name: "Main" },
  timeBlocks: [{ Name: "Period 1" }],
  divisions: [{ division: { Name: "Juniors" }, groups: [{ Name: "Bunk 1" }] }]
};

// [screen, name, why] for each problem, which is what the director sees and where it leads.
const found = (setup) =>
  setupProblems(setup, terms).map((p) => [p.screen, p.name, p.why]);

const swim = { Id: "a1", Name: "Swim", Eligibilities__r: [] };

describe("setupProblems", () => {
  it("finds nothing wrong with a complete season", () => {
    const setup = {
      season,
      weeks: [week("Session 1", "2026-06-29", "2026-07-03")],
      programs: [fullProgram],
      activities: [swim]
    };
    expect(setupProblems(setup, terms)).toEqual([]);
  });

  it("nothing to say before a season loads", () => {
    expect(setupProblems(null, terms)).toEqual([]);
  });

  it("says what is missing, in the camp words, and which screen fixes it", () => {
    const setup = {
      season,
      weeks: [],
      programs: [
        {
          program: { Name: "Main" },
          timeBlocks: [],
          divisions: [{ division: { Name: "Juniors" }, groups: [] }]
        }
      ]
    };
    expect(found(setup)).toEqual([
      ["weeks", "Summer 2026", "No Sessions yet."],
      ["timeBlocks", "Main", "No time blocks yet."],
      ["groups", "Juniors", "No Bunks yet."],
      ["activities", "Summer 2026", "No activities yet."]
    ]);
    expect(found({ season, weeks: [], programs: [] })).toContainEqual([
      "programs",
      "Summer 2026",
      "No programs yet. Every season needs at least one."
    ]);
    expect(
      found({
        season,
        weeks: [week("S", "2026-06-29", "2026-07-03")],
        programs: [{ ...fullProgram, divisions: [] }],
        activities: [swim]
      })
    ).toEqual([["divisions", "Main", "No divisions yet."]]);
  });

  it("shows a week that starts before the season", () => {
    expect(
      found({
        season,
        weeks: [week("Early", "2026-06-22", "2026-06-26")],
        programs: [fullProgram],
        activities: [swim]
      })
    ).toEqual([["weeks", "Early", "Falls outside the dates of this season."]]);
  });

  it("an activity with no limit on groups at once is never more than its location fits", () => {
    const setup = (noLimit) => ({
      season,
      weeks: [week("Session 1", "2026-06-29", "2026-07-03")],
      programs: [fullProgram],
      locations: [{ Id: "l1", Name: "Pool", GroupsThatFit__c: 2 }],
      activities: [
        {
          ...swim,
          Location__c: "l1",
          GroupsAtOnce__c: 5,
          NoGroupLimit__c: noLimit
        }
      ]
    });
    expect(found(setup(true))).toEqual([]);
    expect(found(setup(false))).toEqual([
      [
        "activities",
        "Swim",
        'Allows 5 Bunks at once, but "Pool" fits 2. Scheduling uses 2; change whichever number is wrong.'
      ]
    ]);
  });

  it("gives each problem a key of its own", () => {
    const keys = setupProblems({ season, weeks: [], programs: [] }, terms).map(
      (p) => p.key
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("shows weeks outside the season and weeks that overlap, without changing them", () => {
    const setup = {
      season,
      weeks: [
        week("Session 2", "2026-07-02", "2026-07-08"),
        week("Session 1", "2026-06-29", "2026-07-03"),
        week("Late", "2026-08-10", "2026-08-14")
      ],
      programs: [fullProgram],
      activities: [swim]
    };
    expect(found(setup)).toEqual([
      ["weeks", "Late", "Falls outside the dates of this season."],
      ["weeks", "Session 1 and Session 2", "Share dates."]
    ]);
  });

  it("names each problem's kind, so Roots' hand can gather each kind onto one card", () => {
    const setup = {
      season,
      weeks: [
        week("Session 2", "2026-07-02", "2026-07-08"),
        week("Session 1", "2026-06-29", "2026-07-03"),
        week("Late", "2026-08-10", "2026-08-14")
      ],
      programs: [],
      activities: []
    };
    expect(setupProblems(setup, terms).map((p) => p.kind)).toEqual([
      "weekOutside",
      "weeksShare",
      "noPrograms",
      "noActivities"
    ]);
    expect(
      setupProblems({ season, weeks: [], programs: [] }, terms).every(
        (p) => typeof p.kind === "string" && p.kind
      )
    ).toBe(true);
  });
});

describe("activity nudges", () => {
  const base = {
    season,
    weeks: [week("Session 1", "2026-06-29", "2026-07-03")],
    programs: [fullProgram],
    locations: [{ Id: "l1", Name: "Art room", GroupsThatFit__c: 2 }]
  };

  it("an outdoor activity without a rain plan needs attention", () => {
    const setup = {
      ...base,
      activities: [
        { Name: "Soccer", Outdoor__c: true, RainPlan__c: null },
        { Name: "Kickball", Outdoor__c: true, RainPlan__c: "a9" },
        { Name: "Art", Outdoor__c: false, RainPlan__c: null }
      ]
    };
    expect(found(setup)).toEqual([
      ["activities", "Soccer", "Outdoors and has no Wet-weather plan."]
    ]);
  });

  it("an activity allowing more groups than its location fits needs attention", () => {
    const setup = {
      ...base,
      activities: [
        { Name: "Art", Location__c: "l1", GroupsAtOnce__c: 3 },
        { Name: "Clay", Location__c: "l1", GroupsAtOnce__c: 2 },
        {
          Name: "Open studio",
          Location__c: "l1",
          GroupsAtOnce__c: 1,
          NoGroupLimit__c: true
        }
      ]
    };
    expect(found(setup)).toEqual([
      [
        "activities",
        "Art",
        'Allows 3 Bunks at once, but "Art room" fits 2. Scheduling uses 2; change whichever number is wrong.'
      ]
    ]);
  });

  it("a group that no activity is open to needs attention", () => {
    const programs = [
      {
        program: { Name: "Main" },
        timeBlocks: [{ Name: "Period 1" }],
        divisions: [
          {
            division: { Id: "d1", Name: "Juniors" },
            groups: [
              { Id: "g1", Name: "Bunk 1" },
              { Id: "g2", Name: "Bunk 2" }
            ]
          },
          {
            division: { Id: "d2", Name: "Seniors" },
            groups: [{ Id: "g3", Name: "Bunk 3" }]
          }
        ]
      }
    ];
    const onlyFor = (...ids) =>
      ids.map((id) => {
        return id.startsWith("d") ? { Division__c: id } : { Group__c: id };
      });
    const setup = {
      ...base,
      programs,
      activities: [
        { Name: "Swim", Eligibilities__r: onlyFor("g1") },
        { Name: "Hike", Eligibilities__r: onlyFor("d2") }
      ]
    };
    expect(found(setup)).toEqual([
      ["activities", "Bunk 2", "No activities are open to this Bunk."]
    ]);
    // An activity open to everyone (nobody chosen) is open to every group.
    setup.activities.push({ Name: "Art" });
    expect(found(setup)).toEqual([]);
  });
});

describe("copy suggestions", () => {
  it("suggests the same weekday 52 weeks later", () => {
    expect(suggestedCopyStart("2026-06-29")).toBe("2027-06-28");
  });

  it("moves the year in the name when there is one", () => {
    expect(suggestedCopyName("Summer 2026", "2026-06-29", "2027-06-28")).toBe(
      "Summer 2027"
    );
    expect(suggestedCopyName("Main summer", "2026-06-29", "2027-06-28")).toBe(
      "Main summer (copy)"
    );
    expect(suggestedCopyName("Summer 2026", "2026-06-29", "2026-08-10")).toBe(
      "Summer 2026 (copy)"
    );
  });
});

describe("fixed and recurring activities", () => {
  const ENTRY = {
    program: { Id: "p1", Name: "Main" },
    timeBlocks: [
      { Id: "t1", Name: "Period 1", PartOfDay__c: "Morning" },
      { Id: "t2", Name: "Lunch", PartOfDay__c: "Afternoon" }
    ],
    divisions: [
      {
        division: { Id: "d1", Name: "Juniors" },
        groups: [
          { Id: "g1", Name: "Bunk 1", Availability__c: "AllDay" },
          { Id: "g2", Name: "Bunk 2", Availability__c: "MorningOnly" }
        ]
      },
      {
        division: { Id: "d2", Name: "Seniors" },
        groups: [{ Id: "g3", Name: "Bunk 3", Availability__c: "AfternoonOnly" }]
      }
    ]
  };

  it("says which groups are left out because they are not at camp then", () => {
    expect(setTimeNote(ENTRY, { TimeBlock__c: "t2", Length__c: 1 })).toBe(
      "Bunk 2 is morning only and is left out."
    );
    expect(setTimeNote(ENTRY, { TimeBlock__c: "t1", Length__c: 1 })).toBe(
      "Bunk 3 is afternoon only and is left out."
    );
    expect(setTimeNote(ENTRY, { TimeBlock__c: "t1", Length__c: 2 })).toBe(
      "Bunk 2 is morning only and is left out of its afternoon part. " +
        "Bunk 3 is afternoon only and is left out of its morning part."
    );
    // One only for the Juniors at lunch leaves out their morning-only bunk.
    expect(
      setTimeNote(ENTRY, {
        TimeBlock__c: "t2",
        Length__c: 1,
        Coverages__r: [{ Division__c: "d1" }]
      })
    ).toBe("Bunk 2 is morning only and is left out.");
    // A recurring activity only for the Seniors in the afternoon leaves nobody out.
    expect(
      setTimeNote(ENTRY, {
        TimeBlock__c: "t2",
        Length__c: 1,
        Coverages__r: [{ Division__c: "d2" }]
      })
    ).toBe("");
  });

  it("needs attention when nobody it covers is there, it runs in no week, or its location is shut", () => {
    const setup = {
      season: {
        Name: "Summer 2026",
        StartDate__c: "2026-06-29",
        EndDate__c: "2026-08-07"
      },
      weeks: [
        {
          Id: "w1",
          Name: "Week 1",
          StartDate__c: "2026-06-29",
          EndDate__c: "2026-07-03"
        },
        {
          Id: "w2",
          Name: "Week 2",
          StartDate__c: "2026-07-06",
          EndDate__c: "2026-07-10"
        }
      ],
      locations: [{ Id: "l1", Name: "Pool", GroupsThatFit__c: 3 }],
      activities: [{ Name: "Archery" }],
      weekExceptions: [
        { Week__c: "w1", FixedActivity__c: "f2" },
        { Week__c: "w2", FixedActivity__c: "f2" },
        { Week__c: "w2", Location__c: "l1" }
      ],
      programs: [
        {
          ...ENTRY,
          fixedActivities: [
            {
              Id: "f1",
              Name: "Swim",
              TimeBlock__c: "t1",
              Length__c: 1,
              LastTimeBlock__c: "t1",
              Location__c: "l1"
            },
            {
              Id: "f2",
              Name: "Flag",
              TimeBlock__c: "t1",
              Length__c: 1,
              LastTimeBlock__c: "t1"
            }
          ],
          recurringActivities: [
            {
              Id: "r1",
              Name: "Juniors lunch",
              TimeBlock__c: "t2",
              Length__c: 1,
              LastTimeBlock__c: "t2",
              Coverages__r: [{ Group__c: "g2" }]
            }
          ]
        }
      ]
    };
    const nudges = setupProblems(setup, terms).filter((p) =>
      ["fixedActivities", "recurringActivities"].includes(p.screen)
    );
    expect(nudges.map(({ screen, name, why }) => [screen, name, why])).toEqual([
      [
        "fixedActivities",
        "Swim",
        '"Pool" is not open in Week 2, but this runs then.'
      ],
      ["fixedActivities", "Flag", "Runs in no Sessions."],
      [
        "recurringActivities",
        "Juniors lunch",
        "Every Bunk it covers is left out: none is at camp then."
      ]
    ]);
  });

  describe("time blocks changed under an item", () => {
    const P1 = { Id: "b1", Name: "Period 1", PartOfDay__c: "Morning" };
    const P2 = { Id: "b2", Name: "Period 2", PartOfDay__c: "Morning" };
    const P3 = { Id: "b3", Name: "Period 3", PartOfDay__c: "Morning" };
    const SNACK = { Id: "b9", Name: "Snack", PartOfDay__c: "Morning" };
    const withBlocks = (timeBlocks) => ({ ...ENTRY, timeBlocks });
    // Rest was saved covering Period 2 – Period 3.
    const rest = { TimeBlock__c: "b2", Length__c: 2, LastTimeBlock__c: "b3" };

    it("says nothing while it covers what it did", () => {
      expect(spanChange(withBlocks([P1, P2, P3]), rest, terms)).toBeNull();
    });

    it("a block added inside it: keep the new coverage, or stretch back to where it ended", () => {
      const moved = spanChange(withBlocks([P1, P2, SNACK, P3]), rest, terms);
      expect(moved.why).toBe(
        "Time blocks changed since it was saved: it covered Period 2 – Period 3 and now covers Period 2 – Snack."
      );
      expect(moved.actions).toEqual(
        nsRecord([
          {
            key: "keep",
            label: "Keep Period 2 – Snack",
            changes: { LastTimeBlock__c: "b9" }
          },
          {
            key: "stretch",
            label: "Stretch to Period 2 – Period 3",
            changes: { Length__c: 3 }
          }
        ])
      );
    });

    it("a block inside it removed: keep the shorter coverage, or extend into the next block", () => {
      // Saved as Period 1 – Period 2 (length 2); Period 2 deleted.
      const item = { TimeBlock__c: "b1", Length__c: 2, LastTimeBlock__c: null };
      const moved = spanChange(withBlocks([P1, P3]), item, terms);
      expect(moved.why).toBe(
        "Time blocks changed since it was saved: the time block it ended in was deleted, and it now covers Period 1 – Period 3."
      );
      expect(moved.actions).toEqual(
        nsRecord([
          {
            key: "shorter",
            label: "Keep the shorter Period 1",
            changes: { Length__c: 1 }
          },
          {
            key: "extend",
            label: "Extend to Period 3",
            changes: { LastTimeBlock__c: "b3" }
          }
        ])
      );
      // Saved as Period 1 – Period 2 (length 3 before Snack was removed from the middle).
      const longer = {
        TimeBlock__c: "b1",
        Length__c: 3,
        LastTimeBlock__c: "b2"
      };
      const shorter = spanChange(withBlocks([P1, P2, P3]), longer, terms);
      expect(shorter.actions.map((a) => a.label)).toEqual([
        "Keep the shorter Period 1 – Period 2",
        "Extend to Period 3"
      ]);
      expect(shorter.actions[0].changes).toEqual(nsRecord({ Length__c: 2 }));
    });

    it("at the end of the day, with its last block gone, only keeping makes sense", () => {
      // Rest: Period 3, length 2 (Period 3 – Period 4); Period 4 deleted.
      const atEnd = spanChange(
        withBlocks([P1, P2, P3]),
        { TimeBlock__c: "b3", Length__c: 2, LastTimeBlock__c: null },
        terms
      );
      expect(atEnd.why).toBe(
        "Time blocks changed since it was saved: it now covers Period 3. " +
          "It now runs to the end of the day, so it can only be kept as it is."
      );
      expect(atEnd.actions.map((a) => [a.label, a.changes])).toEqual(
        nsRecord([["Keep Period 3", { LastTimeBlock__c: "b3" }]])
      );
      // Rest: Period 2, length 3 (Period 2 – Period 4); Period 4 deleted.
      const shorterDay = spanChange(
        withBlocks([P1, P2, P3]),
        { TimeBlock__c: "b2", Length__c: 3, LastTimeBlock__c: null },
        terms
      );
      expect(shorterDay.actions.map((a) => a.label)).toEqual([
        "Keep Period 2 – Period 3"
      ]);
      // Never a length below 1 anywhere.
      [atEnd, shorterDay].forEach((moved) =>
        moved.actions.forEach((a) =>
          expect(
            a.changes[nsName("Length__c")] === undefined ||
              a.changes[nsName("Length__c")] >= 1
          ).toBe(true)
        )
      );
    });

    it("when the block it starts in was moved, both fixes name what they cover in today's order", () => {
      // Rest: Period 3, length 2 (Period 3 – Period 4); Period 3 then moved before Period 1.
      const P4 = { Id: "b4", Name: "Period 4", PartOfDay__c: "Morning" };
      const item = { TimeBlock__c: "b3", Length__c: 2, LastTimeBlock__c: "b4" };
      const moved = spanChange(withBlocks([P3, P1, P2, P4]), item, terms);
      expect(moved.why).toBe(
        "Time blocks changed since it was saved: it covered Period 3 – Period 4 and now covers Period 3 – Period 1."
      );
      expect(moved.actions.map((a) => [a.label, a.changes])).toEqual(
        nsRecord([
          ["Keep Period 3 – Period 1", { LastTimeBlock__c: "b1" }],
          ["Stretch to Period 3 – Period 4", { Length__c: 4 }]
        ])
      );
    });

    it("with no saved end and nothing else to offer, says so plainly", () => {
      const plain = spanChange(
        withBlocks([P1, P2]),
        { TimeBlock__c: "b1", Length__c: 1, LastTimeBlock__c: null },
        terms
      );
      expect(plain.why).toBe(
        "Time blocks changed since it was saved: it now covers Period 1. It can only be kept as it is."
      );
    });

    it("offers only what makes sense, and says why", () => {
      // Its old end moved before its start.
      const moved = spanChange(
        withBlocks([P3, P1, P2]),
        { TimeBlock__c: "b1", Length__c: 2, LastTimeBlock__c: "b3" },
        terms
      );
      expect(moved.why).toContain("so it can only be kept as it is");
      expect(moved.actions.map((a) => a.label)).toEqual([
        "Keep Period 1 – Period 2"
      ]);
    });

    it("uses the camp's own words", () => {
      const periods = buildTerms([
        { term: "TimeBlock", singular: "Slot", plural: "Slots", isCustom: true }
      ]);
      expect(
        spanChange(withBlocks([P1, P2, SNACK, P3]), rest, periods).why
      ).toMatch(/^Slots changed since it was saved/);
    });

    it("offers a recurring activity's fixes as saves of a recurring activity", () => {
      const setup = {
        season,
        weeks: [
          {
            Id: "w1",
            Name: "Session 1",
            StartDate__c: "2026-06-29",
            EndDate__c: "2026-07-03"
          }
        ],
        weekExceptions: [{ Week__c: "w1", RecurringActivity__c: "r1" }],
        activities: [{ Name: "Archery" }],
        programs: [
          {
            ...withBlocks([P1, P2, SNACK, P3]),
            recurringActivities: [{ Id: "r1", Name: "Rest", ...rest }]
          }
        ]
      };
      const nudges = setupProblems(setup, terms).filter(
        (p) => p.name === "Rest"
      );
      expect(nudges.map((p) => [p.screen, p.why])).toEqual([
        [
          "recurringActivities",
          "Time blocks changed since it was saved: it covered Period 2 – Period 3 and now covers Period 2 – Snack."
        ],
        ["recurringActivities", "Runs in no Sessions."]
      ]);
      expect(nudges[0].actions.map((a) => a.record)).toEqual(
        nsRecord([
          {
            sobjectType: "RecurringActivity__c",
            Id: "r1",
            LastTimeBlock__c: "b9"
          },
          { sobjectType: "RecurringActivity__c", Id: "r1", Length__c: 3 }
        ])
      );
    });

    it("offers the fixes on its Needs attention item, as saves of that row", () => {
      const setup = {
        season: {
          Name: "S",
          StartDate__c: "2026-06-29",
          EndDate__c: "2026-08-07"
        },
        weeks: [],
        activities: [{ Name: "Archery" }],
        programs: [
          {
            ...withBlocks([P1, P2, SNACK, P3]),
            fixedActivities: [{ Id: "f1", Name: "Rest", ...rest }]
          }
        ]
      };
      const item = setupProblems(setup, terms).find((p) => p.name === "Rest");
      expect(item.screen).toBe("fixedActivities");
      expect(item.actions.map((a) => [a.label, a.record])).toEqual(
        nsRecord([
          [
            "Keep Period 2 – Snack",
            {
              sobjectType: "FixedActivity__c",
              Id: "f1",
              LastTimeBlock__c: "b9"
            }
          ],
          [
            "Stretch to Period 2 – Period 3",
            { sobjectType: "FixedActivity__c", Id: "f1", Length__c: 3 }
          ]
        ])
      );
    });
  });
});

describe("CORE-3.8: a fixed activity's early day that cannot happen is shown", () => {
  const t = buildTerms([]);
  const ENTRY = {
    program: { Id: "p1", Name: "Main", Monday__c: true, Friday__c: true },
    timeBlocks: [
      { Id: "t1", Name: "Period 1" },
      { Id: "t2", Name: "Period 2" },
      { Id: "t3", Name: "Dismissal" }
    ]
  };
  const note = (item) =>
    rules.earlyNote(
      nsRecord(ENTRY),
      nsRecord({ TimeBlock__c: "t3", Length__c: 1, ...item }),
      t
    );

  it("CORE-3.8: an early day the program doesn't run is named on the row", () => {
    expect(note({ EarlyDay__c: "Tuesday", EarlyBlocks__c: 1 })).toBe(
      "Main doesn't run on Tuesday, so it never starts earlier."
    );
  });

  it("CORE-3.8: more time blocks earlier than come before it is named on the row", () => {
    expect(note({ EarlyDay__c: "Friday", EarlyBlocks__c: 3 })).toBe(
      "Only 2 time blocks before Dismissal, so on Friday it starts at Period 1."
    );
  });

  it("CORE-3.8: an early day on the first time block is named on the row", () => {
    expect(
      rules.earlyNote(
        nsRecord(ENTRY),
        nsRecord({
          TimeBlock__c: "t1",
          EarlyDay__c: "Friday",
          EarlyBlocks__c: 1
        }),
        t
      )
    ).toBe(
      "Nothing comes before Period 1, so on Friday it never starts earlier."
    );
  });

  it("CORE-3.8 counter-case: an early day that fits, or none, says nothing", () => {
    expect(note({ EarlyDay__c: "Friday", EarlyBlocks__c: 2 })).toBe("");
    expect(note({})).toBe("");
  });
});

// ADR 0014 slice 6: a special day on a weekday its week no longer has, and one whose time blocks
// no longer match the regular day's. Shown, never fixed.
describe("special days", () => {
  const ms = (h, m) => (h * 60 + m) * 60000;
  // The Special events screen's items (the Evening program's own "No time blocks yet" aside).
  const special = (setup) =>
    found(setup).filter(([screen]) => screen === "specialEvents");
  const specialSetup = (periods, days = []) => ({
    season,
    weeks: [
      { Id: "w1", ...week("Session 1", "2026-06-29", "2026-07-03") },
      // Wednesday to Friday only.
      { Id: "w2", ...week("Short session", "2026-07-08", "2026-07-10") }
    ],
    programs: [
      // A program with no time blocks yet is passed over: the next one is the regular day.
      { ...fullProgram, program: { Name: "Evening" }, timeBlocks: [] },
      {
        ...fullProgram,
        timeBlocks: [
          { Name: "Period 1", StartTime__c: ms(9, 0), EndTime__c: ms(10, 0) },
          { Name: "Lunch", StartTime__c: ms(12, 30), EndTime__c: ms(13, 15) }
        ]
      }
    ],
    activities: [swim],
    special: {
      specialDays: [{ Id: "sd1", Name: "Field Day" }],
      specialEvents: [{ Id: "se1", Name: "Carnival" }],
      briefs: [
        { itemId: "sd1", planned: true, rows: 1, periods, days },
        {
          itemId: "se1",
          planned: true,
          rows: 1,
          periods: [{ name: "Lunch", startTime: "11:00", endTime: "11:30" }],
          days: [{ weekId: "w2", day: "Monday" }]
        }
      ]
    }
  });

  it("finds nothing when its time blocks are the regular day's or its own", () => {
    const setup = specialSetup(
      [
        { name: "Period 1", startTime: "09:00", endTime: "10:00" },
        { name: " lunch ", startTime: "12:30", endTime: "13:15" },
        { name: "Families arrive", startTime: "10:30", endTime: "11:25" },
        { name: "", startTime: "14:00", endTime: "15:00" }
      ],
      [{ weekId: "w1", day: "Monday" }]
    );
    expect(special(setup)).toEqual([]);
  });

  it("shows a time block whose times no longer match the regular day's, without changing it", () => {
    const periods = [
      { name: "Period 1", startTime: "09:00", endTime: "10:00" },
      { name: "Lunch", startTime: "12:00", endTime: "12:45" }
    ];
    const setup = specialSetup(periods);
    expect(special(setup)).toEqual([
      [
        "specialEvents",
        "Field Day",
        "Its time blocks no longer match Main's: Lunch is 12:00–12:45 here and 12:30–13:15 there."
      ]
    ]);
    expect(periods[1].startTime).toBe("12:00");
  });

  it("shows a special day on a weekday its week no longer has", () => {
    const setup = specialSetup(
      [],
      [
        { weekId: "w2", day: "Monday" },
        { weekId: "w2", day: "Friday" }
      ]
    );
    expect(special(setup)).toEqual([
      [
        "specialEvents",
        "Field Day",
        'On Monday of "Short session", which that Session no longer has. Take it off that day.'
      ]
    ]);
  });

  it("says nothing about a plan that can't be read beyond its days", () => {
    const setup = specialSetup([]);
    setup.special.briefs[0] = {
      itemId: "sd1",
      planned: true,
      problem: "broken",
      rows: 0,
      periods: [],
      days: []
    };
    expect(special(setup)).toEqual([]);
  });
});

// Repo ADR 0018 (slice E4; plan section 4.6): elective offerings for Roots' Needs attention.
// Marked in their rows on the Electives screen, so that screen doesn't list them again.
describe("elective offerings", () => {
  const electiveSetup = (offerings) => ({
    season,
    weeks: [week("Session 1", "2026-06-29", "2026-07-03")],
    programs: [fullProgram],
    activities: [
      swim,
      { Id: "a2", Name: "Woodworking", Eligibilities__r: [] },
      { Id: "a3", Name: "Photography", Eligibilities__r: [] }
    ],
    electives: {
      sets: [{ Id: "es1", Name: "Chugim" }],
      offerings,
      linkedChoices: []
    }
  });
  const electives = (setup) =>
    setupProblems(setup, terms).filter((p) => p.screen === "electives");

  it("a proposed offering and one with blank or 0 seats need a look; no limit doesn't", () => {
    const problems = electives(
      electiveSetup([
        { Id: "o1", ElectiveSet__c: "es1", Activity__c: "a1", Seats__c: 0 },
        {
          Id: "o2",
          ElectiveSet__c: "es1",
          Activity__c: "a2",
          Seats__c: 10,
          Proposed__c: true
        },
        { Id: "o3", ElectiveSet__c: "es1", Activity__c: "a3" },
        {
          Id: "o4",
          ElectiveSet__c: "es1",
          Activity__c: "a1",
          NoSeatLimit__c: true
        }
      ])
    );
    expect(problems.map((p) => [p.name, p.why, p.markedInPlace])).toEqual([
      ["Swim", 'In "Chugim": choose how many seats "Swim" has.', true],
      ["Woodworking", 'In "Chugim": proposed, not confirmed yet.', true],
      [
        "Photography",
        'In "Chugim": choose how many seats "Photography" has.',
        true
      ]
    ]);
  });

  it("a season without electives has none", () => {
    expect(electives({ ...electiveSetup([]), electives: undefined })).toEqual(
      []
    );
  });
});
