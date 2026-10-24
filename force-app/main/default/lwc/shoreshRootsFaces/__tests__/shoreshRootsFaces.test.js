import {
  clockOf,
  glimpseOf,
  nameWidth,
  namedColumns,
  pictureSize,
  readCamp,
  shortDate,
  shorten,
  smallOf,
  weekWindow,
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
              /^(f50|f300|f400|f500|fhl|fshade|fcaution|fnone|sedge|s400|s500|s700|snone|dash|g-[a-z0-9_-]+)?$/
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

  it("an overfilled offering shows its campers past the limit; one with no limit counts no empty seats", () => {
    const seatsOf = (seat) =>
      glimpseOf("electiveSeats", readCamp(SETUP, { ...TABLE, seats: [seat] }))
        .shapes;
    const over = seatsOf({ name: "Kayak", seats: 10, taken: 13 });
    expect(over.filter((s) => s.cls === "f500")).toHaveLength(10);
    expect(over.filter((s) => s.cls === "fcaution")).toHaveLength(3);
    expect(over.filter((s) => (s.cls || "").includes("s400"))).toHaveLength(0);
    const open = seatsOf({ name: "Kayak", seats: null, taken: 4 });
    expect(open.filter((s) => s.cls === "f500")).toHaveLength(4);
    expect(open.filter((s) => (s.cls || "").includes("fnone"))).toHaveLength(0);
    expect(words({ shapes: open })).toContain("\u221e");
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

  it("cuts a name after a whole word, never inside one, and never after a little joining word", () => {
    expect(shorten("Swim", 50)).toBe("Swim");
    expect(shorten("Morning meeting", 60)).toBe("Morning…");
    expect(shorten("Arts and Crafts Workshop", 70)).toBe("Arts…");
    expect(shorten("Arts and Crafts Workshop", 100)).toBe("Arts and Crafts…");
    // Only a first word too long for the room is cut inside it.
    expect(shorten("Woodworking", 40).endsWith("…")).toBe(true);
    expect(nameWidth(shorten("Woodworking", 40)) * 11).toBeLessThanOrEqual(40);
  });

  describe("long and short seasons, big and small camps", () => {
    const week = (i) => {
      const d = new Date(Date.UTC(2027, 5, 28 + 7 * i));
      const e = new Date(d.getTime() + 4 * 86400000);
      return {
        Id: `w${i + 1}`,
        Name: `Week ${i + 1}`,
        StartDate__c: d.toISOString().slice(0, 10),
        EndDate__c: e.toISOString().slice(0, 10)
      };
    };
    const seasonOf = (n, table = {}) =>
      readCamp(
        nsRecord({
          ...SETUP,
          weeks: Array.from({ length: n }, (_, i) => week(i))
        }),
        { ...TABLE, ...table }
      );
    const bars = (g) => g.shapes.filter((s) => s.rect && s.h > 30);

    it("a season of up to 12 weeks draws every week; a longer one, 8 bars that read, around this week", () => {
      expect(weekWindow(seasonOf(12).weeks)).toEqual({
        from: 0,
        to: 12,
        whole: true
      });
      const long = seasonOf(30, { thisWeekId: "w14", builtWeekIds: ["w1"] });
      expect(weekWindow(long.weeks)).toEqual({
        from: 11,
        to: 19,
        whole: false
      });
      const g = glimpseOf("weeks", long);
      // Eight bars, each as wide as an eight-week season's.
      expect(bars(g)).toHaveLength(8);
      bars(g).forEach((b) => expect(b.w).toBeGreaterThanOrEqual(20));
      // Their numbers, this week's in the highlight; the season's first and last week by its line.
      expect(words(g)).toEqual(
        expect.arrayContaining(["12", "13", "14", "19", "1", "30"])
      );
      expect(g.shapes.find((s) => s.text && s.value === "14").cls).toBe("g-mb");
      expect(g.shapes.filter((s) => s.rect && s.cls === "fhl")).toHaveLength(2);
      // Before the season (no this week), the window starts where building is still to do.
      const before = seasonOf(30, {
        thisWeekId: null,
        builtWeekIds: ["w1", "w2", "w3", "w4", "w5"]
      });
      expect(weekWindow(before.weeks).from).toBe(3);
      // Shrunk aside, the picture keeps the same window over the season's line.
      expect(bars(glimpseOf("weeks", long, 18)).length).toBe(8);
    });

    it("special events keep flags that read on a long season; weeks too close share one", () => {
      const camp52 = readCamp(
        nsRecord({
          ...SETUP,
          weeks: Array.from({ length: 52 }, (_, i) => week(i)),
          special: {
            briefs: [
              { planned: true, days: [{ weekId: "w10" }] },
              { planned: false, days: [{ weekId: "w11" }] },
              { planned: true, days: [{ weekId: "w30" }] }
            ]
          }
        }),
        TABLE
      );
      [0, 18].forEach((f) => {
        const g = glimpseOf("specialEvents", camp52, f);
        const poles = g.shapes.filter((s) => s.path && s.d === "M3 10.5V1.75");
        // Weeks 10 and 11 share a flag, dashed (one is not planned); week 30 has its own.
        expect(poles).toHaveLength(2);
        expect(poles.map((s) => s.cls)).toEqual(["g-flag-open", "g-flag"]);
        poles.forEach((s) => {
          const scale = Number(/scale\(([\d.]+)\)/.exec(s.transform)[1]);
          expect(scale * 12).toBeGreaterThan(15.9);
        });
      });
    });

    it("Manual Build shows fewer groups before it cuts a name", () => {
      const grid = (names) => ({
        groups: ["Bunk 1", "Bunk 2", "Bunk 3"],
        rows: [
          {
            startTime: "09:00",
            cells: names.map((name) => ({ name, locked: false }))
          }
        ]
      });
      expect(
        namedColumns(
          ["Bunk 1", "Bunk 2", "Bunk 3"],
          grid(["Swim", "Art", "Gaga"]).rows,
          3
        )
      ).toBe(3);
      const long = grid(["Morning meeting", "Woodworking & Carpentry", "Swim"]);
      const k = namedColumns(long.groups, long.rows, 3);
      expect(k).toBeLessThan(3);
      const g = glimpseOf(
        "manualBuild",
        readCamp(SETUP, { ...TABLE, manual: long })
      );
      const shown = words(g);
      expect(shown).toContain("Morning meeting");
      expect(shown.filter((w) => w.endsWith("…"))).toEqual([]);
    });

    it("a recurring activity's long name heads its row instead of being cut in a day's tile", () => {
      const withLong = readCamp(
        nsRecord({
          ...SETUP,
          programs: [
            {
              ...SETUP.programs[0],
              recurringActivities: [
                { Name: "Morning meeting", Monday__c: true, Friday__c: true },
                { Name: "Swim", Wednesday__c: true }
              ]
            }
          ]
        }),
        TABLE
      );
      const shown = words(glimpseOf("recurringActivities", withLong));
      expect(shown).toContain("Morning meeting");
      expect(shown.filter((w) => w.endsWith("…"))).toEqual([]);
    });

    it("a schedule's picture shows a fixed activity whole, or only its padlock", () => {
      const withFixed = readCamp(SETUP, {
        ...TABLE,
        manual: {
          groups: ["Bunk 1"],
          rows: [{ startTime: "09:00", fixed: "Morning meeting", cells: [] }]
        }
      });
      const g = glimpseOf("manualBuild", withFixed, 25);
      expect(words(g)).toEqual([]);
      expect(g.shapes.filter((s) => s.cls === "g-lock")).toHaveLength(2);
    });

    it("seats tell the truth at any size: past the limit always shows, no limit counts past the row", () => {
      const seatsOf = (seat, f = 0) =>
        glimpseOf(
          "electiveSeats",
          readCamp(SETUP, { ...TABLE, seats: [seat] }),
          f
        ).shapes;
      // 61 campers in 60 seats: twenty boxes, the last one past the limit.
      const over = seatsOf({ name: "Art", seats: 60, taken: 61 });
      expect(over.filter((s) => s.cls === "fcaution")).toHaveLength(1);
      // 59 of 60 never looks full.
      const nearly = seatsOf({ name: "Art", seats: 60, taken: 59 });
      expect(
        nearly.filter((s) => (s.cls || "").includes("s400")).length
      ).toBeGreaterThan(0);
      // 124 campers and no limit: a row of boxes, how many, and the open end.
      [0, 18].forEach((f) => {
        const open = seatsOf({ name: "Art", seats: null, taken: 124 }, f);
        expect(words({ shapes: open })).toEqual(["Art", "124", "\u221e"]);
      });
      // One seat is a seat's size, not the whole row.
      const one = seatsOf({ name: "Art", seats: 1, taken: 0 });
      expect(
        Math.max(...one.filter((s) => s.rect).map((s) => s.w))
      ).toBeLessThan(16);
    });

    it("every face reads with one of everything and with a hundred: inside the card, no word cut mid-way", () => {
      const many = (n, make) => Array.from({ length: n }, (_, i) => make(i));
      const NAMES = [
        "Morning meeting",
        "Arts and Crafts Workshop",
        "Swim",
        "Woodworking & Carpentry",
        "Gaga"
      ];
      const campOf = (n) =>
        readCamp(
          nsRecord({
            season: { Id: "s1", StartDate__c: "2027-06-28" },
            labels: [],
            weeks: many(Math.min(n, 52), week),
            programs: many(Math.min(n, 5), (p) => ({
              program: { Name: `Program ${p + 1}`, Monday__c: true },
              timeBlocks: p
                ? []
                : many(Math.min(n, 12), (i) => ({
                    Id: `b${i}`,
                    StartTime__c: (540 + i * 50) * 60000,
                    EndTime__c: (585 + i * 50) * 60000
                  })),
              fixedActivities: p
                ? []
                : [{ Name: "Morning meeting", TimeBlock__c: "b0" }],
              recurringActivities: p
                ? []
                : many(Math.min(n, 10), (i) => ({
                    Name: NAMES[i % 5],
                    Monday__c: true
                  })),
              divisions: p
                ? []
                : many(Math.min(n, 8), (d) => ({
                    division: { Name: `Division ${d + 1}` },
                    groups: many(Math.min(n, 5), (g) => ({
                      Name: `Cabin ${d * 5 + g + 1}`
                    }))
                  }))
            })),
            locations: many(Math.min(n, 30), (i) => ({
              Id: `l${i}`,
              Name: `Place ${i + 1}`
            })),
            activities: many(n, (i) => ({
              Id: `a${i}`,
              Name: `${NAMES[i % 5]} ${i + 1}`,
              Location__c: `l${i % Math.min(n, 30)}`
            })),
            special: { briefs: [] },
            electives: { sets: [], offerings: [], linkedChoices: [] }
          }),
          {
            thisWeekId: "w1",
            shownWeekId: "w1",
            manual: {
              groups: many(Math.min(n, 6), (i) => `Cabin ${i + 1}`),
              rows: many(Math.min(n, 4), (r) => ({
                startTime: "09:00",
                cells: many(Math.min(n, 6), (i) => ({
                  name: NAMES[(r + i) % 5],
                  locked: i === 0
                }))
              }))
            },
            seats: [{ name: "Swim", seats: null, taken: n }]
          }
        );
      // Every name the camps hold.
      const ALL = [
        ...NAMES,
        ...many(100, (i) => `${NAMES[i % 5]} ${i + 1}`),
        ...["Program", "Division", "Cabin", "Place"].flatMap((w) =>
          many(100, (i) => `${w} ${i + 1}`)
        )
      ];
      [campOf(1), campOf(100)].forEach((c) => {
        KEYS.forEach((key) => {
          [0, 25].forEach((f) => {
            const g = glimpseOf(key, c, f);
            // Cut after a whole word ("Morning…"), or inside a single word too long for its
            // room; never mid-word after other words ("Morning mee…").
            g.shapes
              .filter((s) => s.text && s.value.endsWith("…"))
              .forEach((s) => {
                const kept = s.value.slice(0, -1);
                const whole = ALL.some(
                  (n) =>
                    n.startsWith(kept) &&
                    (n[kept.length] === " " || !kept.includes(" "))
                );
                expect(whole).toBe(true);
              });
          });
        });
      });
      // Inside the card, except the faces that run past its edge on purpose, fading out.
      [campOf(1), campOf(100)].forEach((c) => {
        KEYS.forEach((key) => {
          [0, 25]
            .map((f) => glimpseOf(key, c, f))
            .filter((g) => g.fade !== "right")
            .forEach((g) => {
              g.shapes
                .filter((s) => s.text && s.anchor === "start" && !s.style)
                .forEach((s) => {
                  expect(s.x + nameWidth(s.value) * 11).toBeLessThanOrEqual(
                    W + 1
                  );
                });
              g.shapes
                .filter((s) => s.rect)
                .forEach((s) => {
                  expect(s.x + s.w).toBeLessThanOrEqual(W + 1);
                  expect(s.y + s.h).toBeLessThanOrEqual(H + 1);
                });
            });
        });
      });
    });
  });

  it("formats dates and times the same in every time zone", () => {
    expect(shortDate("2027-06-28")).toBe("JUN 28");
    expect(shortDate(null)).toBe("");
    expect(clockOf(540)).toBe("9:00");
    expect(clockOf(810)).toBe("1:30");
    expect(nameWidth("mm")).toBeGreaterThan(nameWidth("ii"));
  });
});
