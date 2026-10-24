import {
  clockOf,
  glimpseOf,
  nameWidth,
  pictureSize,
  readCamp,
  shortDate,
  smallOf,
  W,
  H
} from "c/shoreshRootsFaces";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";

const KEYS = [
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
  "generatedSchedule",
  "manualBuild",
  "electiveSeats",
  "schedules"
];

const t = buildTerms([]);

// A made-up camp: no real campers or staff.
const SETUP = nsRecord({
  season: { Id: "s1", Name: "Summer 2027", StartDate__c: "2027-06-28" },
  labels: [
    { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true },
    { term: "Week", singular: "Week", plural: "Weeks", isCustom: false }
  ],
  weeks: [1, 2, 3].map((n) => ({
    Id: `w${n}`,
    Name: `Week ${n}`,
    StartDate__c: `2027-07-0${n * 2}`,
    EndDate__c: `2027-07-0${n * 2 + 1}`
  })),
  programs: [
    {
      program: {
        Name: "Day camp",
        Monday__c: true,
        Tuesday__c: true,
        Wednesday__c: false
      },
      timeBlocks: [
        { Id: "b1", StartTime__c: 32400000, EndTime__c: 35100000 },
        { Id: "b2", StartTime__c: 41400000, EndTime__c: 44100000 }
      ],
      fixedActivities: [{ Name: "Lunch", TimeBlock__c: "b2" }],
      recurringActivities: [
        { Name: "Swim", Monday__c: true, Wednesday__c: true }
      ],
      divisions: [
        {
          division: { Name: "Otters" },
          groups: [{ Name: "Cedar" }, { Name: "Birch" }]
        }
      ]
    }
  ],
  locations: [{ Id: "l1", Name: "Lake" }],
  activities: [
    { Id: "a1", Name: "Kayak", Location__c: "l1" },
    { Id: "a2", Name: "Canoe" }
  ],
  special: {
    specialEvents: [{ Id: "e1", Name: "Carnival Night" }],
    briefs: [{ itemId: "e1", planned: false, days: [{ weekId: "w2" }] }]
  },
  electives: {
    sets: [{ Id: "set1", Name: "Chugim" }],
    offerings: [
      { Id: "o1", ElectiveSet__c: "set1", Activity__c: "a1" },
      { Id: "o2", ElectiveSet__c: "set1", Activity__c: "a2", Proposed__c: true }
    ],
    linkedChoices: [{ Offering__c: "o1" }]
  }
});

const TABLE = {
  thisWeekId: "w2",
  shownWeekId: "w2",
  builtWeekIds: ["w1"],
  generated: {
    groups: ["Cedar", "Birch"],
    rows: [
      {
        startTime: "09:00",
        cells: [
          { name: "Kayak", locked: true },
          { name: "", locked: false }
        ]
      },
      { startTime: "11:30", fixed: "Lunch", cells: [] }
    ]
  },
  seats: [{ name: "Kayak", seats: 10, taken: 4, minimum: 6 }],
  versionCount: 1,
  latestVersion: { name: "As published", weekId: "w1", published: true }
};

const words = (g) => g.shapes.filter((s) => s.text).map((s) => s.value);
const has = (g, cls) => g.shapes.some((s) => (s.cls || "").includes(cls));

describe("c/shoreshRootsFaces", () => {
  const camp = readCamp(SETUP, TABLE);

  it("reads the camp from its setup and the table's one request", () => {
    expect(camp.year).toBe(2027);
    expect(camp.weeks.map((w) => [w.n, w.built, w.now])).toEqual([
      [1, true, false],
      [2, false, true],
      [3, false, false]
    ]);
    expect(camp.shownWeek.name).toBe("Week 2");
    expect(camp.programs[0].days).toEqual([true, true, false, false, false]);
    expect(camp.blocks.map((b) => [b.start, b.fixed])).toEqual([
      [540, null],
      [690, "Lunch"]
    ]);
    expect(camp.places).toEqual([{ name: "Lake", acts: ["Kayak"] }]);
    expect(camp.noPlace).toEqual(["Canoe"]);
    expect(camp.events).toEqual([{ n: 2, done: false }]);
    // A proposed offering is not on the menu yet; a linked one carries the link.
    expect(camp.sets).toEqual([
      { name: "Chugim", offerings: [{ name: "Kayak", linked: true }] }
    ]);
    // The camp's own words first.
    expect(camp.words[0]).toEqual({
      term: "Group",
      std: "Group",
      mine: "Bunk"
    });
  });

  it("draws every card, full and as a picture, inside its box, with token classes only", () => {
    KEYS.forEach((key) => {
      [0, 18].forEach((f) => {
        const g = glimpseOf(key, camp, f);
        expect(g.w).toBe(W);
        expect(g.h).toBe(H);
        expect(g.shapes.length).toBeGreaterThan(0);
        g.shapes
          .filter((s) => s.rect)
          .forEach((s) => {
            expect(Math.min(s.w, s.h)).toBeGreaterThanOrEqual(0);
          });
        g.shapes.forEach((s) => {
          expect(s.key).toBeTruthy();
          (s.cls || "").split(" ").forEach((c) => {
            expect(c).toMatch(
              /^(f50|f300|f400|f500|fhl|fshade|fnone|sedge|s400|s500|s700|snone|dash|g-[a-z0-9_-]+)?$/
            );
          });
        });
      });
    });
  });

  it("the same camp always gives the same faces", () => {
    KEYS.forEach((key) => {
      expect(glimpseOf(key, readCamp(SETUP, TABLE))).toEqual(
        glimpseOf(key, camp)
      );
    });
  });

  it("shows the exception, not the rule: what has no place, no plan or no seat is dashed", () => {
    expect(words(glimpseOf("activities", camp))).toEqual(["Kayak", "Canoe"]);
    expect(has(glimpseOf("activities", camp), "dash")).toBe(true);
    expect(words(glimpseOf("locations", camp))).toEqual([
      "Lake",
      "Kayak",
      "Canoe"
    ]);
    // Carnival Night has no plan yet: its flag is dashed.
    expect(
      glimpseOf("specialEvents", camp).shapes.some(
        (s) => s.cls === "g-flag-open"
      )
    ).toBe(true);
    // Kayak is two seats short of its minimum: two dashed seats.
    expect(
      glimpseOf("electiveSeats", camp).shapes.filter((s) =>
        (s.cls || "").includes("s700 dash")
      )
    ).toHaveLength(2);
  });

  it("draws the schedules as they stand: placed cells, the fixed row locked across, the director's locks", () => {
    const g = glimpseOf("generatedSchedule", camp);
    expect(g.shapes.filter((s) => s.cls === "g-lock").length).toBe(4);
    expect(words(glimpseOf("schedules", camp))).toEqual([
      "Week 1 · As published",
      ""
    ]);
    expect(has(glimpseOf("schedules", camp), "g-check")).toBe(true);
  });

  it("the small tag beside a name: the season's year, the week a schedule shows", () => {
    expect(smallOf("weeks", camp, t)).toBe("2027");
    expect(smallOf("manualBuild", camp, t)).toBe("WEEK 2");
    expect(smallOf("activities", camp, t)).toBeNull();
  });

  it("a card turns into a picture only when its words would read under 11 px", () => {
    expect(pictureSize(1, 260, 187)).toBe(0);
    const f = pictureSize(0.5, 260, 187);
    expect(f).toBeGreaterThan(11);
    // On screen, the picture's words are 11.5 px or more.
    const e = Math.min((260 - 28) / W, (187 - 34 - 23 * 1.25) / H) * 0.5;
    expect(f * e).toBeGreaterThanOrEqual(11.5);
  });

  it("an empty camp draws outlines, never made-up data", () => {
    const empty = readCamp({ season: { Id: "s1" } }, null);
    KEYS.filter((k) => k !== "campWords").forEach((key) => {
      const g = glimpseOf(key, empty);
      // The days of the week head Recurring activities' columns even when empty.
      expect(words(g).filter((w) => w && !/^[MTWF]$/.test(w))).toEqual([]);
      expect(has(g, "dash") || has(g, "g-flag-open")).toBe(true);
    });
  });

  it("long names are cut to fit, with an ellipsis", () => {
    const long = readCamp(
      nsRecord({
        ...SETUP,
        programs: [
          {
            ...SETUP.programs[0],
            divisions: [
              {
                division: { Name: "A very long division name that never ends" },
                groups: [{ Name: "x" }]
              }
            ]
          }
        ]
      }),
      TABLE
    );
    const text = words(glimpseOf("groups", long))[0];
    expect(text.endsWith("…")).toBe(true);
    expect(nameWidth(text) * 11).toBeLessThanOrEqual(84);
  });

  it("formats dates and times the same in every time zone", () => {
    expect(shortDate("2027-06-28")).toBe("JUN 28");
    expect(shortDate(null)).toBe("");
    expect(clockOf(540)).toBe("9:00");
    expect(clockOf(810)).toBe("1:30");
    expect(nameWidth("mm")).toBeGreaterThan(nameWidth("ii"));
  });
});
