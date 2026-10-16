import {
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

describe("setupProblems", () => {
  it("finds nothing wrong with a complete season", () => {
    const setup = {
      season,
      weeks: [week("Session 1", "2026-06-29", "2026-07-03")],
      programs: [fullProgram]
    };
    expect(setupProblems(setup, terms)).toEqual([]);
  });

  it("nothing to say before a season loads", () => {
    expect(setupProblems(null, terms)).toEqual([]);
  });

  it("says what is missing, in the camp words", () => {
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
    expect(setupProblems(setup, terms)).toEqual([
      "This season has no Sessions yet.",
      '"Main" has no time blocks yet.',
      '"Juniors" has no Bunks yet.'
    ]);
    expect(setupProblems({ season, weeks: [], programs: [] }, terms)).toContain(
      "This season has no programs yet. Every season needs at least one."
    );
    expect(
      setupProblems(
        {
          season,
          weeks: [week("S", "2026-06-29", "2026-07-03")],
          programs: [{ ...fullProgram, divisions: [] }]
        },
        terms
      )
    ).toEqual(['"Main" has no divisions yet.']);
  });

  it("shows weeks outside the season and weeks that overlap, without changing them", () => {
    const setup = {
      season,
      weeks: [
        week("Session 2", "2026-07-02", "2026-07-08"),
        week("Session 1", "2026-06-29", "2026-07-03"),
        week("Late", "2026-08-10", "2026-08-14")
      ],
      programs: [fullProgram]
    };
    expect(setupProblems(setup, terms)).toEqual([
      '"Late" falls outside the dates of this season.',
      '"Session 1" and "Session 2" share dates.'
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
    expect(setupProblems(setup, terms)).toEqual([
      '"Soccer" is outdoors and has no Wet-weather plan.'
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
    expect(setupProblems(setup, terms)).toEqual([
      '"Art" allows 3 Bunks at once, but "Art room" fits 2. Scheduling uses 2; change whichever number is wrong.'
    ]);
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
