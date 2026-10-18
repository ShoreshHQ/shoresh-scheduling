import * as rules from "c/shoreshSetupRules";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";

// The desktop's required areas (readiness.js), its menu marks (Sidebar.jsx), and its rain plan
// picker (ActivitiesScreen.jsx), in Salesforce's shape. Fixtures use bare names (nsRecord).
const stillNeeded = (setup, programId) =>
  rules.stillNeeded(nsRecord(setup), terms, programId);
const menuMarks = (setup) => rules.menuMarks(nsRecord(setup));
const rainPlanOptions = (activities) =>
  rules.rainPlanOptions(nsRecord(activities));

const terms = buildTerms([
  { term: "Division", singular: "Unit", plural: "Units", isCustom: true },
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true },
  { term: "TimeBlock", singular: "Period", plural: "Periods", isCustom: true }
]);

const main = {
  program: { Id: "p1", Name: "Main", Monday__c: true },
  divisions: [{ division: { Id: "d1" }, groups: [{ Id: "g1" }] }],
  timeBlocks: [{ Id: "t1" }]
};
const ready = {
  season: { Id: "s1" },
  weeks: [{ Id: "w1" }],
  programs: [main],
  activities: [{ Id: "a1" }],
  locations: []
};
const screens = (needed) => needed.map((n) => `${n.screen}:${n.label}`);
const text = (parts) => parts.map((p) => p.text).join("");

describe("stillNeeded", () => {
  it("is empty when building can start", () => {
    expect(stillNeeded(ready)).toEqual([]);
  });

  it("lists everything missing, in the desktop's order, in the camp's words", () => {
    const bare = {
      ...ready,
      weeks: [],
      programs: [{ program: { Id: "p1", Name: "Main" } }],
      activities: []
    };
    expect(screens(stillNeeded(bare))).toEqual([
      "weeks:Weeks",
      "divisions:Units",
      "programs:Days",
      "timeBlocks:Periods",
      "activities:Activities"
    ]);
  });

  it("asks for bunks once units exist but none has any", () => {
    const noBunks = {
      ...ready,
      programs: [
        { ...main, divisions: [{ division: { Id: "d1" }, groups: [] }] }
      ]
    };
    expect(screens(stillNeeded(noBunks))).toEqual(["groups:Bunks"]);
  });

  it("checks the chosen program, not the first", () => {
    const second = {
      program: { Id: "p2", Name: "Teens", Monday__c: true },
      divisions: main.divisions,
      timeBlocks: []
    };
    const setup = { ...ready, programs: [main, second] };
    expect(stillNeeded(setup, "p1")).toEqual([]);
    expect(screens(stillNeeded(setup, "p2"))).toEqual(["timeBlocks:Periods"]);
  });

  it("with no programs asks for programs (their units, days and periods come after)", () => {
    expect(screens(stillNeeded({ ...ready, programs: [] }))).toEqual([
      "programs:Programs"
    ]);
  });
});

describe("stillNeededSentence", () => {
  it("is the desktop's sentence: One thing, or N things joined with and", () => {
    expect(rules.stillNeededSentence([])).toEqual([]);
    expect(
      text(rules.stillNeededSentence([{ screen: "groups", label: "Bunks" }]))
    ).toBe("One thing still needed before you can build the schedule: Bunks.");
    const three = rules.stillNeededSentence([
      { screen: "divisions", label: "Units" },
      { screen: "groups", label: "Bunks" },
      { screen: "timeBlocks", label: "Periods" }
    ]);
    expect(text(three)).toBe(
      "3 things still needed before you can build the schedule: Units, Bunks and Periods."
    );
    expect(three.filter((p) => p.link).map((p) => p.screen)).toEqual([
      "divisions",
      "groups",
      "timeBlocks"
    ]);
  });
});

describe("menuMarks", () => {
  it("! on each empty area building needs, ✓ on every area with rows", () => {
    expect(
      menuMarks({
        season: { Id: "s1" },
        weeks: [],
        programs: [],
        activities: [],
        locations: []
      })
    ).toEqual({
      weeks: "needed",
      programs: "needed",
      divisions: "needed",
      groups: "needed",
      timeBlocks: "needed",
      activities: "needed"
    });
    expect(
      menuMarks({
        ...ready,
        locations: [{ Id: "l1" }],
        programs: [{ ...main, fixedActivities: [{ Id: "f1" }] }]
      })
    ).toEqual({
      weeks: "done",
      programs: "done",
      divisions: "done",
      groups: "done",
      timeBlocks: "done",
      activities: "done",
      locations: "done",
      fixedActivities: "done"
    });
  });

  it("a program that runs on no day still needs its days", () => {
    const noDays = {
      ...ready,
      programs: [{ ...main, program: { Id: "p1", Name: "Main" } }]
    };
    expect(menuMarks(noDays).programs).toBe("needed");
  });

  it("before a season, nothing is marked", () => {
    expect(rules.menuMarks(null)).toEqual({});
  });
});

describe("rainPlanOptions", () => {
  it("offers indoor activities; an outdoor one still chosen says to choose another", () => {
    const activities = [
      { Id: "a1", Name: "Swim", Outdoor__c: false },
      { Id: "a2", Name: "Soccer", Outdoor__c: true, RainPlan__c: "a3" },
      { Id: "a3", Name: "Hiking", Outdoor__c: true },
      { Id: "a4", Name: "Canoe", Outdoor__c: true }
    ];
    expect(rainPlanOptions(activities)).toEqual([
      { label: "Swim", value: "a1" },
      { label: "Hiking (outdoors, choose another)", value: "a3" }
    ]);
  });
});
