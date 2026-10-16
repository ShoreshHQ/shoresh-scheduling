import {
  spanChange,
  setTimeNote,
  setupProblems,
  suggestedCopyName,
  suggestedCopyStart
} from "c/shoreshSetupRules";
import { buildTerms } from "c/shoreshTerms";

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
      expect(moved.actions).toEqual([
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
      ]);
    });

    it("a block inside it removed: keep the shorter coverage, or extend into the next block", () => {
      // Saved as Period 1 – Period 2 (length 2); Period 2 deleted.
      const item = { TimeBlock__c: "b1", Length__c: 2, LastTimeBlock__c: null };
      const moved = spanChange(withBlocks([P1, P3]), item, terms);
      expect(moved.why).toBe(
        "Time blocks changed since it was saved: the time block it ended in was deleted, and it now covers Period 1 – Period 3."
      );
      expect(moved.actions).toEqual([
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
      ]);
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
      expect(shorter.actions[0].changes).toEqual({ Length__c: 2 });
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
      expect(item.actions.map((a) => [a.label, a.record])).toEqual([
        [
          "Keep Period 2 – Snack",
          { sobjectType: "FixedActivity__c", Id: "f1", LastTimeBlock__c: "b9" }
        ],
        [
          "Stretch to Period 2 – Period 3",
          { sobjectType: "FixedActivity__c", Id: "f1", Length__c: 3 }
        ]
      ]);
    });
  });
});
