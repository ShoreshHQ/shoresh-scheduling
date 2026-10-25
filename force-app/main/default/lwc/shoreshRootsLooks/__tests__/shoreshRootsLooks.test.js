import { looksOf, HW, HH } from "c/shoreshRootsLooks";
import { setupProblems } from "c/shoreshSetupRules";
import { nameWidth } from "c/shoreshRootsFaces";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";

const LABELS = [
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true },
  { term: "Division", singular: "Unit", plural: "Units", isCustom: true },
  { term: "Elective", singular: "Chug", plural: "Chugim", isCustom: true },
  { term: "Location", singular: "Place", plural: "Places", isCustom: true }
];
const t = buildTerms(LABELS);

const OPENABLE = [
  "weeks",
  "programs",
  "divisions",
  "groups",
  "timeBlocks",
  "locations",
  "campWords",
  "activities",
  "fixedActivities",
  "recurringActivities",
  "specialEvents",
  "electives",
  "scheduleWeeks",
  "generatedSchedule",
  "manualBuild",
  "electiveSeats",
  "schedules"
];

// A made-up camp with a little of everything off: no real campers or staff.
const MESSY = {
  season: {
    Id: "s1",
    Name: "Summer 2027",
    StartDate__c: "2027-06-28",
    EndDate__c: "2027-08-06"
  },
  labels: LABELS,
  weeks: [
    {
      Id: "w1",
      Name: "Week 1",
      StartDate__c: "2027-06-28",
      EndDate__c: "2027-07-02"
    },
    {
      Id: "w2",
      Name: "Week 2",
      StartDate__c: "2027-07-02",
      EndDate__c: "2027-07-09"
    },
    {
      Id: "w3",
      Name: "Week 3",
      StartDate__c: "2027-08-09",
      EndDate__c: "2027-08-13"
    }
  ],
  programs: [
    {
      program: { Id: "p1", Name: "Main", Monday__c: true },
      timeBlocks: [
        {
          Id: "b1",
          Name: "Period 1",
          StartTime__c: 32400000,
          EndTime__c: 35100000
        }
      ],
      divisions: [
        {
          division: { Id: "d1", Name: "Juniors" },
          groups: [
            { Id: "g1", Name: "Cedar" },
            { Id: "g2", Name: "Maple" }
          ]
        },
        { division: { Id: "d2", Name: "Seniors" }, groups: [] }
      ]
    },
    {
      program: { Id: "p2", Name: "Teens", Monday__c: true },
      timeBlocks: [],
      divisions: []
    }
  ],
  locations: [{ Id: "l1", Name: "Pool", GroupsThatFit__c: 1 }],
  activities: [
    {
      Id: "a1",
      Name: "Swim",
      Location__c: "l1",
      GroupsAtOnce__c: 3,
      Eligibilities__r: [{ Group__c: "g1" }]
    },
    {
      Id: "a2",
      Name: "Soccer",
      Outdoor__c: true,
      Eligibilities__r: [{ Group__c: "g1" }]
    },
    {
      Id: "a3",
      Name: "Woodworking and Carpentry for Everyone",
      Outdoor__c: true,
      Eligibilities__r: [{ Group__c: "g1" }]
    }
  ],
  special: {
    specialDays: [{ Id: "sd1", Name: "Carnival Night" }],
    specialEvents: [{ Id: "se1", Name: "Color War" }],
    briefs: [
      {
        itemId: "sd1",
        planned: false,
        days: [{ weekId: "w2", day: "Wednesday" }],
        periods: []
      },
      {
        itemId: "se1",
        planned: true,
        days: [{ weekId: "w1", day: "Tuesday" }],
        periods: [{ name: "Period 1", items: ["Relay"] }]
      }
    ]
  },
  electives: {
    sets: [{ Id: "es1", Name: "Chugim A" }],
    offerings: [
      {
        Id: "o1",
        ElectiveSet__c: "es1",
        Activity__c: "a1",
        Proposed__c: true,
        Seats__c: 10
      },
      { Id: "o2", ElectiveSet__c: "es1", Activity__c: "a2", Seats__c: null }
    ]
  }
};

const TABLE = {
  thisWeekId: "w1",
  soonWeekIds: ["w1", "w2"],
  builtWeekIds: ["w1"],
  shortSeats: [{ name: "Ropes", seats: 12, fewest: 5, minimum: 6 }],
  seatsWeekId: "w1",
  seatsSetId: "es1",
  seatsScheduleId: "sc1",
  seatsRunId: "r1"
};

function hand(setup = MESSY, table = TABLE, openable = OPENABLE) {
  const s = nsRecord(setup);
  return looksOf({
    problems: setupProblems(s, t),
    setup: s,
    table,
    terms: t,
    openable
  });
}

const byId = (cards, id) => cards.find((c) => c.key === `hand:${id}`);

describe("c/shoreshRootsLooks: what needs a look", () => {
  it("keeps every signal the attention list had, each kind gathered onto one card", () => {
    const s = nsRecord(MESSY);
    const problems = setupProblems(s, t);
    expect(problems.length).toBeGreaterThan(8);
    const cards = hand();
    problems.forEach((p) => {
      const card = cards.find(
        (c) =>
          c.screen === p.screen &&
          c.label.includes(p.name) &&
          c.label.includes(p.why)
      );
      expect(card).toBeDefined();
      expect(card.label).toContain(p.why);
    });
    // Two outdoor activities with no rain plan: one card, both named.
    const rain = cards.filter((c) => c.off === "no rain plan");
    expect(rain).toHaveLength(1);
    expect(rain[0].name).toBe("Activities");
    expect(rain[0].label).toBe(
      "Soccer and Woodworking and Carpentry for Everyone: Outdoors and has no rain plan."
    );
  });

  it("deals what the table draws as missing: a week close at hand not built, places, a special day not planned, seats short", () => {
    const cards = hand();
    const week = byId(cards, "weekNotBuilt|w2");
    expect(week).toMatchObject({
      screen: "scheduleWeeks",
      meld: "schedules",
      name: "Week 2",
      small: "JUL 2",
      off: "not built",
      nav: { weekId: "w2" }
    });
    // Week 1 is built; Week 3 is not close at hand.
    expect(byId(cards, "weekNotBuilt|w1")).toBeUndefined();
    expect(byId(cards, "weekNotBuilt|w3")).toBeUndefined();

    expect(byId(cards, "noPlace|")).toMatchObject({
      screen: "activities",
      // The camp's own word, as it writes it.
      off: "no Place",
      label: "Soccer and Woodworking and Carpentry for Everyone have no Place."
    });

    expect(byId(cards, "eventNoPlan|sd1")).toMatchObject({
      screen: "specialEvents",
      name: "Carnival Night",
      small: "WEEK 2",
      off: "no activities",
      nav: { specialItemId: "sd1" }
    });
    // Color War is planned, with something in it.
    expect(byId(cards, "eventNoPlan|se1")).toBeUndefined();

    expect(byId(cards, "seatsShort|")).toMatchObject({
      screen: "electiveSeats",
      name: "Ropes",
      small: "CHUGIM",
      off: "one seat short",
      label: "Ropes is one seat short of its minimum.",
      // The exact run counted, so Elective seats opens on it (repo ADR 0020 choice 10).
      nav: { weekId: "w1", setId: "es1", scheduleId: "sc1", runId: "r1" }
    });
  });

  it("deals the weeks not built in season order, whatever order they were made in", () => {
    // Week 2 was made first (the lower record Id), Week 1 later.
    const weeks = [
      { Id: "w9", Name: "Week 1", StartDate__c: "2027-06-28" },
      { Id: "w1", Name: "Week 2", StartDate__c: "2027-07-05" }
    ];
    const cards = hand(
      { ...MESSY, weeks },
      {
        ...TABLE,
        soonWeekIds: ["w9", "w1"],
        builtWeekIds: []
      }
    );
    expect(
      cards
        .filter((c) => c.key.startsWith("hand:weekNotBuilt"))
        .map((c) => c.name)
    ).toEqual(["Week 1", "Week 2"]);
  });

  it("says it in the camp's words", () => {
    const cards = hand();
    expect(byId(cards, "noGroups|groups")).toMatchObject({
      name: "Bunks",
      small: "SENIORS",
      off: "none yet"
    });
    expect(byId(cards, "nothingOpen|activities")).toMatchObject({
      name: "Maple",
      small: "BUNKS",
      off: "no activities open"
    });
    expect(byId(cards, "offeringProposed|Chugim A")).toMatchObject({
      name: "Swim",
      small: "CHUGIM A",
      off: "not confirmed"
    });
  });

  it("lies in the menu's order of the screens that fix them, so each card sits below its meld", () => {
    const cards = hand();
    const screens = cards.map((c) => c.screen);
    const order = OPENABLE.filter((s) => screens.includes(s));
    expect([...new Set(screens)]).toEqual(order);
    const melds = cards.map((c) => c.meld);
    expect(melds).toEqual([...melds].sort((a, b) => rank(a) - rank(b)));
  });

  it("is the same hand for the same camp, every time", () => {
    expect(JSON.stringify(hand())).toBe(JSON.stringify(hand()));
  });

  it("leaves out what the table feeds until it is read, and what can't open", () => {
    const unread = hand(MESSY, null);
    expect(unread.some((c) => c.key.startsWith("hand:weekNotBuilt"))).toBe(
      false
    );
    expect(unread.some((c) => c.key === "hand:seatsShort|")).toBe(false);
    const noSeats = hand(
      MESSY,
      TABLE,
      OPENABLE.filter((s) => s !== "electiveSeats")
    );
    expect(noSeats.some((c) => c.screen === "electiveSeats")).toBe(false);
  });

  it("asks nothing of a camp that doesn't use places", () => {
    const cards = hand({ ...MESSY, locations: [] });
    expect(byId(cards, "noPlace|")).toBeUndefined();
  });

  it("is an empty hand for a calm camp", () => {
    const calm = {
      ...MESSY,
      weeks: MESSY.weeks.slice(0, 1),
      programs: [MESSY.programs[0]].map((p) => ({
        ...p,
        divisions: p.divisions.slice(0, 1)
      })),
      activities: [
        {
          Id: "a1",
          Name: "Swim",
          Location__c: "l1",
          GroupsAtOnce__c: 1
        }
      ],
      special: {},
      electives: {}
    };
    expect(hand(calm, { soonWeekIds: ["w1"], builtWeekIds: ["w1"] })).toEqual(
      []
    );
  });

  it("several offerings short gather onto Chug seats, each named", () => {
    const cards = hand(MESSY, {
      ...TABLE,
      shortSeats: [
        { name: "Ropes", seats: 12, fewest: 5, minimum: 6 },
        { name: "Archery", seats: null, fewest: 1, minimum: 4 }
      ]
    });
    expect(byId(cards, "seatsShort|")).toMatchObject({
      name: "Chug seats",
      small: null,
      off: "under minimum",
      label:
        "Ropes is one seat short of its minimum. Archery is three seats short of its minimum."
    });
  });

  it("fits every name on its card's line, cut after a whole word, never smaller", () => {
    const long = {
      ...MESSY,
      weeks: MESSY.weeks.map((w, i) => {
        return i === 1
          ? { ...w, Name: "The Very Long Second Week of Summer" }
          : w;
      })
    };
    const card = byId(hand(long), "weekNotBuilt|w2");
    expect(card.name).toMatch(/…$/);
    const kept = card.name.slice(0, -1);
    expect(`${kept} `).toBe(
      "The Very Long Second Week of Summer ".slice(0, kept.length + 1)
    );
    expect(nameWidth(card.name) * 13).toBeLessThanOrEqual(
      170 - card.small.length * 6.8 - 8
    );
  });

  it("draws every picture in the hand's box, with the design system's classes only", () => {
    hand().forEach((card) => {
      expect(card.glimpse.w).toBe(HW);
      expect(card.glimpse.h).toBe(HH);
      expect(card.glimpse.shapes.length).toBeGreaterThan(0);
      card.glimpse.shapes.forEach((shape) => {
        expect(shape.cls).toMatch(/^[a-z0-9 -]+$/);
        expect(shape.cls).not.toMatch(/#|rgb/);
      });
      card.glimpse.shapes
        .filter((shape) => shape.rect)
        .forEach((shape) => {
          expect(shape.x).toBeGreaterThanOrEqual(-0.5);
          expect(shape.x + shape.w).toBeLessThanOrEqual(HW + 0.5);
          expect(shape.y + shape.h).toBeLessThanOrEqual(HH + 0.5);
        });
    });
  });

  it("draws every kind the attention list knows, each in a few words of its own", () => {
    const kinds = [
      ["weeks", "weekOutside"],
      ["weeks", "weeksShare"],
      ["weeks", "noWeeks"],
      ["programs", "noPrograms"],
      ["timeBlocks", "noTimeBlocks"],
      ["divisions", "noDivisions"],
      ["groups", "noGroups"],
      ["activities", "noActivities"],
      ["activities", "nothingOpen"],
      ["activities", "noRainPlan"],
      ["activities", "tooManyAtOnce"],
      ["fixedActivities", "spanChanged"],
      ["fixedActivities", "runsNoWeek"],
      ["recurringActivities", "allLeftOut"],
      ["recurringActivities", "placeClosed"],
      ["specialEvents", "specialOffDay"],
      ["specialEvents", "specialTimes"],
      ["electives", "offeringProposed"],
      ["electives", "offeringNoSeats"]
    ];
    const problems = kinds.map(([screen, kind], i) => ({
      key: `p${i}`,
      screen,
      kind,
      name: `Thing ${i}`,
      why: "A long sentence that would never fit on a card.",
      of: `x${i}`,
      atOnce: 3,
      fits: 1,
      day: "Friday"
    }));
    const cards = looksOf({
      problems,
      setup: nsRecord({ season: MESSY.season, labels: LABELS }),
      table: null,
      terms: t
    });
    expect(cards).toHaveLength(kinds.length);
    cards.forEach((card) => {
      expect(card.off).not.toMatch(/sentence/);
      expect(card.off.split(" ").length).toBeLessThanOrEqual(4);
      expect(card.label).toContain("A long sentence");
    });
  });

  it("is nothing without a season", () => {
    expect(
      looksOf({ problems: [], setup: null, table: null, terms: t })
    ).toEqual([]);
  });
});

function rank(meld) {
  return ["camp", "activities", "schedules"].indexOf(meld);
}
