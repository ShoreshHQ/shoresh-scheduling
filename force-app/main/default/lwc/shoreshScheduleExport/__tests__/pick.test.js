// Print and Excel by choice (PUB-6.6 to PUB-6.11): the whole week, a day, a bunk, an activity, a
// location or a division, and a big camp's day split into readable pages. Made-up data only.
import {
  EVERY,
  PAGE_COLUMNS,
  choiceLabel,
  dayPieces,
  fileTitle,
  pagesFor,
  printChoices,
  scheduleSheets,
  sheetsFor
} from "c/shoreshScheduleExport";
import { campPlaces } from "../pick";
import { sheetName } from "c/shoreshLists";
import { withRaindrops, withSpecials } from "c/shoreshScheduleViews";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";
import {
  LABELS,
  opened
} from "../../shoreshScheduleViews/__tests__/data/scheduleFixture";

const t = buildTerms(LABELS);
const CATALOGUE = nsRecord([
  { Id: "a1", Name: "Swim", Location__c: "l1" },
  { Id: "a2", Name: "Canoe", Location__c: "l1" }
]);
const SETUP = nsRecord({
  activities: CATALOGUE,
  locations: [
    { Id: "l1", Name: "Lake" },
    { Id: "l2", Name: "Gym" }
  ],
  programs: [
    {
      fixedActivities: [{ Id: "f1", Name: "Lunch", Location__c: "l2" }],
      recurringActivities: [],
      divisions: [
        {
          division: { Id: "d1", Name: "Juniors", NoDivision__c: false },
          groups: [{ Id: "g1" }]
        },
        {
          division: { Id: "d2", Name: "Seniors", NoDivision__c: false },
          groups: [{ Id: "g2" }]
        },
        {
          division: { Id: "d0", Name: "No division", NoDivision__c: true },
          groups: []
        }
      ]
    }
  ]
});
const offerings = new Map();

/** A camp of n bunks on one day: bunk i in the division divisionOf(i) gives (or none). */
function bigCamp(n, divisionOf) {
  const groups = [];
  const divisions = new Map();
  for (let i = 0; i < n; i++) {
    const id = `g${i}`;
    groups.push({ id, name: `Bunk ${i + 1}`, gone: false });
    const d = divisionOf(i);
    if (d) {
      if (!divisions.has(d)) divisions.set(d, []);
      divisions.get(d).push({ Id: id });
    }
  }
  const view = {
    days: [
      {
        dateValue: "2026-06-29",
        problem: null,
        blocks: [
          { id: "t1", name: "Period 1", startTime: "09:00", endTime: "09:45" }
        ],
        groups,
        items: [{ kind: "A", id: "a1", name: "Swim" }],
        rows: groups.map(() => "1")
      }
    ]
  };
  const setup = nsRecord({
    activities: CATALOGUE,
    locations: [],
    programs: [
      {
        divisions: [...divisions.entries()].map(([name, list]) => ({
          division: { Id: name, Name: name, NoDivision__c: false },
          groups: list
        }))
      }
    ]
  });
  return { view, setup };
}

describe("print and Excel by choice", () => {
  // PUB-6.6
  describe("the choices", () => {
    it("offers the whole week, each day, bunk, activity, location and division", () => {
      const choices = printChoices(opened(), CATALOGUE, SETUP, t);
      expect(choices.map((c) => [c.kind, c.label])).toEqual([
        ["week", "Whole Week"],
        ["day", "Day"],
        ["group", "Bunk"],
        ["activity", "Activity"],
        ["location", "Location"],
        ["division", "Division"]
      ]);
      const of = (kind) =>
        choices.find((c) => c.kind === kind).options.map((o) => o.label);
      // A day that can't be read isn't offered.
      expect(of("day")).toEqual(["Monday, Jun 29", "Tuesday, Jun 30"]);
      expect(of("group")).toEqual(["Every Bunk", "Bunk 1", "Bunk 2"]);
      // Only activities placed this week, one deleted since among them.
      expect(of("activity")).toEqual([
        "Every Activity",
        "Swim",
        "Pottery (removed)"
      ]);
      // Locations used this week, in the season's order; the No division holder is none.
      expect(of("location")).toEqual(["Every Location", "Lake", "Gym"]);
      expect(of("division")).toEqual(["Every Division", "Juniors", "Seniors"]);
    });

    it("leaves out a kind with nothing this week, and offers nothing with no days", () => {
      const choices = printChoices(opened(), CATALOGUE, {}, t);
      expect(choices.map((c) => c.kind)).toEqual([
        "week",
        "day",
        "group",
        "activity"
      ]);
      expect(printChoices({ days: [] }, CATALOGUE, SETUP, t)).toEqual([]);
      expect(printChoices(null, CATALOGUE, SETUP, t)).toEqual([]);
    });

    it("names a choice for its file", () => {
      const choices = printChoices(opened(), CATALOGUE, SETUP, t);
      expect(choiceLabel(choices, { kind: "week" })).toBe("Whole Week");
      expect(choiceLabel(choices, { kind: "group", key: EVERY })).toBe(
        "Every Bunk"
      );
      // A location alone in the week has no "Every" choice.
      expect(
        printChoices(
          opened(),
          CATALOGUE,
          { ...SETUP, locations: [SETUP.locations[0]] },
          t
        )
          .find((c) => c.kind === "location")
          .options.map((o) => o.label)
      ).toEqual(["Lake"]);
      expect(choiceLabel(choices, { kind: "day", key: "1" })).toBe(
        "Tuesday, Jun 30"
      );
      // Every day has no row of its own (Whole Week is that), but an AI may ask for it.
      expect(choiceLabel(choices, { kind: "day", key: EVERY })).toBe(
        "Every Day"
      );
      // The file: the week and version, then what was chosen; the whole week says no more.
      expect(fileTitle(choices, { kind: "week" }, "Week 1", "Draft")).toBe(
        "Week 1 - Draft"
      );
      expect(
        fileTitle(choices, { kind: "group", key: EVERY }, "Week 1", "Draft")
      ).toBe("Week 1 - Draft - Every Bunk");
    });

    it("skips the No division holder and reads every place a thing can run", () => {
      const places = campPlaces(SETUP);
      expect(places.divisions.map((d) => d.name)).toEqual([
        "Juniors",
        "Seniors"
      ]);
      expect(places.locationOf.get("f1")).toBe("l2");
    });
  });

  // PUB-6.8
  describe("the printout", () => {
    const titles = (choice, view = opened()) =>
      pagesFor(view, choice, CATALOGUE, SETUP, t).map((p) => p.title);

    it("prints the whole week a page per day, a day that can't be read saying so", () => {
      const pages = pagesFor(opened(), { kind: "week" }, CATALOGUE, SETUP, t);
      expect(pages.map((p) => p.title)).toEqual([
        "Monday, Jun 29",
        "Tuesday, Jun 30",
        "Wednesday, Jul 1"
      ]);
      expect(pages[2].table).toBeNull();
      expect(pages[0].table.columns.map((c) => c.label)).toEqual([
        "Bunk 1",
        "Bunk 2"
      ]);
    });

    it("prints one day for the whole camp", () => {
      expect(titles({ kind: "day", key: "1" })).toEqual(["Tuesday, Jun 30"]);
    });

    it("prints one bunk's week, or every bunk a page each", () => {
      const one = pagesFor(
        opened(),
        { kind: "group", key: "g2" },
        CATALOGUE,
        SETUP,
        t
      );
      expect(one.map((p) => p.title)).toEqual(["Bunk 2"]);
      expect(one[0].table.columns.map((c) => c.label)).toEqual([
        "Monday",
        "Tuesday",
        "Wednesday"
      ]);
      expect(titles({ kind: "group", key: EVERY })).toEqual([
        "Bunk 1",
        "Bunk 2"
      ]);
    });

    it("prints where an activity runs", () => {
      const [page] = pagesFor(
        opened(),
        { kind: "activity", key: "a1" },
        CATALOGUE,
        SETUP,
        t
      );
      expect(page.title).toBe("Swim");
      expect(page.table.rows[0].cells[0].text).toBe("Bunk 1");
    });

    it("prints a location's week: what is there and who", () => {
      const [lake] = pagesFor(
        opened(),
        { kind: "location", key: "l1" },
        CATALOGUE,
        SETUP,
        t
      );
      expect(lake.title).toBe("Lake");
      // Monday, Period 1: Swim with Bunk 1. Tuesday, Period 1: Swim with Bunk 2.
      expect(lake.table.rows[0].cells.map((c) => c.text)).toEqual([
        "Swim (Bunk 1)",
        "Swim (Bunk 2)",
        "Can't be shown"
      ]);
      expect(titles({ kind: "location", key: EVERY })).toEqual(["Lake", "Gym"]);
    });

    it("prints a division a page per day with only its bunks", () => {
      const pages = pagesFor(
        opened(),
        { kind: "division", key: "d2" },
        CATALOGUE,
        SETUP,
        t
      );
      expect(pages.map((p) => p.title)).toEqual([
        "Seniors · Monday, Jun 29",
        "Seniors · Tuesday, Jun 30",
        "Seniors · Wednesday, Jul 1"
      ]);
      expect(pages[0].table.columns.map((c) => c.label)).toEqual(["Bunk 2"]);
      expect(pages[0].table.rows[0].cells.map((c) => c.text)).toEqual([
        "Chugim"
      ]);
    });

    it("prints nothing for a choice that isn't there", () => {
      expect(titles({ kind: "group", key: "nope" })).toEqual([]);
      expect(titles({ kind: "location", key: "l9" })).toEqual([]);
    });

    it("prints the same pages every time", () => {
      const once = pagesFor(opened(), { kind: "week" }, CATALOGUE, SETUP, t);
      expect(pagesFor(opened(), { kind: "week" }, CATALOGUE, SETUP, t)).toEqual(
        once
      );
    });

    // PUB-6.9
    it("prints a special day as its own schedule, with its notes, titled with its name", () => {
      const view = opened();
      view.specials = {
        days: [
          {
            dateValue: "2026-06-30",
            specialDayId: "sd1",
            name: "Field Day",
            notes: "Bring water",
            plan: { blocks: [], groups: [], items: [], rows: [] }
          }
        ],
        events: []
      };
      const pages = pagesFor(
        withRaindrops(withSpecials(view)),
        { kind: "day", key: "1" },
        CATALOGUE,
        SETUP,
        t
      );
      expect(pages).toEqual([
        {
          key: "day-1",
          title: "Tuesday, Jun 30 · Field Day",
          table: null,
          notes: "Bring water",
          empty: "Field Day has no schedule yet."
        }
      ]);
    });
  });

  // PUB-6.7
  describe("a big camp's day on paper", () => {
    it("keeps a day that fits on one page", () => {
      const { view, setup } = bigCamp(PAGE_COLUMNS, () => "Juniors");
      expect(dayPieces(view.days[0], campPlaces(setup))).toEqual([
        { indexes: [...Array(PAGE_COLUMNS).keys()], label: null }
      ]);
    });

    it("splits a wide day by division, small divisions sharing a page", () => {
      // 23 bunks: Juniors 4, Inters 5, Seniors 14.
      const division = (i) => {
        if (i < 4) return "Juniors";
        return i < 9 ? "Inters" : "Seniors";
      };
      const { view, setup } = bigCamp(23, division);
      const pages = pagesFor(
        view,
        { kind: "day", key: "0" },
        CATALOGUE,
        setup,
        t
      );
      expect(pages.map((p) => p.title)).toEqual([
        "Monday, Jun 29 · Juniors, Inters",
        "Monday, Jun 29 · Seniors (1 of 2)",
        "Monday, Jun 29 · Seniors (2 of 2)"
      ]);
      expect(pages.map((p) => p.table.columns.length)).toEqual([9, 7, 7]);
      pages.forEach((p) =>
        expect(p.table.columns.length).toBeLessThanOrEqual(PAGE_COLUMNS)
      );
      // Every bunk printed once, in order.
      expect(pages.flatMap((p) => p.table.columns.map((c) => c.label))).toEqual(
        view.days[0].groups.map((g) => g.name)
      );
    });

    it("splits a wide camp with no divisions evenly, naming the bunks on each page", () => {
      const { view, setup } = bigCamp(40, () => null);
      const pages = pagesFor(view, { kind: "week" }, CATALOGUE, setup, t);
      expect(pages.map((p) => p.title)).toEqual([
        "Monday, Jun 29 · Bunk 1 – Bunk 10",
        "Monday, Jun 29 · Bunk 11 – Bunk 20",
        "Monday, Jun 29 · Bunk 21 – Bunk 30",
        "Monday, Jun 29 · Bunk 31 – Bunk 40"
      ]);
    });
  });

  // PUB-6.10
  describe("the Excel file", () => {
    const sheets = (choice, view = opened()) =>
      sheetsFor(view, choice, CATALOGUE, SETUP, t, offerings);

    it("gives a day the whole camp on one sheet", () => {
      expect(sheets({ kind: "day", key: "0" })).toEqual([
        {
          name: "Monday",
          rows: [
            ["Time block", "Bunk 1", "Bunk 2"],
            ["Period 1 (9:00 AM – 9:45 AM)", "Swim", "Chugim"],
            ["Period 2 (10:00 AM – 10:45 AM)", "Swim", "Pottery (removed)"],
            ["Lunch (12:00 PM – 12:45 PM)", "Lunch", "Lunch"]
          ],
          widths: [22, 16, 16]
        }
      ]);
    });

    it("gives a day the whole week's sheet of that day, and the whole week the desktop's file", () => {
      const view = opened();
      const week = scheduleSheets(view, CATALOGUE, t, offerings);
      expect(sheets({ kind: "week" }, view)).toEqual(week);
      // Every day the menu offers (Wednesday can't be read, so it isn't one).
      expect(sheets({ kind: "day", key: EVERY }, view)).toEqual(
        week.filter((s) => ["Monday", "Tuesday"].includes(s.name))
      );
    });

    it("gives a division the whole week's sheet of each day with only its bunks", () => {
      const view = opened();
      const [monday] = scheduleSheets(view, CATALOGUE, t, offerings);
      const [juniors] = sheets({ kind: "division", key: "d1" }, view);
      expect(juniors.rows).toEqual(monday.rows.map((row) => row.slice(0, 2)));
    });

    it("gives every bunk, activity and location a sheet each", () => {
      expect(sheets({ kind: "group", key: EVERY }).map((s) => s.name)).toEqual([
        "Bunk 1",
        "Bunk 2"
      ]);
      const [lake] = sheets({ kind: "location", key: "l1" });
      expect(lake.rows[0]).toEqual([
        "Time block",
        "Monday Jun 29",
        "Tuesday Jun 30",
        "Wednesday Jul 1"
      ]);
      expect(lake.rows[1]).toEqual([
        "Period 1 (9:00 AM – 9:45 AM)",
        "Swim (Bunk 1)",
        "Swim (Bunk 2)",
        "Can't be shown"
      ]);
      expect(sheets({ kind: "activity", key: "a1" })[0].name).toBe("Swim");
    });

    it("gives a division a sheet per day with only its bunks", () => {
      const out = sheets({ kind: "division", key: "d1" });
      expect(out.map((s) => s.name)).toEqual([
        "Juniors Monday",
        "Juniors Tuesday",
        "Juniors Wednesday"
      ]);
      expect(out[0].rows[0]).toEqual(["Time block", "Bunk 1"]);
      expect(out[2].rows).toEqual([["Can't be shown"]]);
    });

    it("puts a special day's name and notes under its sheet, as the whole week's file", () => {
      const view = opened();
      view.specials = {
        days: [
          {
            dateValue: "2026-06-30",
            specialDayId: "sd1",
            name: "Field Day",
            notes: "Bring water",
            plan: { blocks: [], groups: [], items: [], rows: [] }
          }
        ],
        events: []
      };
      const [tuesday] = sheetsFor(
        withSpecials(view),
        { kind: "day", key: "1" },
        CATALOGUE,
        SETUP,
        t,
        offerings
      );
      expect(tuesday.rows.slice(-3)).toEqual([
        [],
        ["Field Day (Special day)"],
        ["Bring water"]
      ]);
    });

    it("leaves out a day a division has no group on", () => {
      const view = opened();
      view.days[1] = {
        ...view.days[1],
        groups: [view.days[1].groups[0]],
        rows: [view.days[1].rows[0]]
      };
      const choice = { kind: "division", key: "d2" };
      expect(
        sheetsFor(view, choice, CATALOGUE, SETUP, t, offerings).map(
          (x) => x.name
        )
      ).toEqual(["Seniors Monday", "Seniors Wednesday"]);
      expect(
        pagesFor(view, choice, CATALOGUE, SETUP, t).map((p) => p.title)
      ).toEqual(["Seniors · Monday, Jun 29", "Seniors · Wednesday, Jul 1"]);
    });

    it("keeps sheet names apart once shortened to Excel's 31 characters", () => {
      const long = "The Very Long Senior Division Name";
      const setup = JSON.parse(JSON.stringify(SETUP));
      setup.programs[0].divisions[0].division.Name = long;
      const names = sheetsFor(
        opened(),
        { kind: "division", key: "d1" },
        CATALOGUE,
        setup,
        t,
        offerings
      ).map((s) => s.name);
      expect(names.every((n) => n.length <= 31)).toBe(true);
      expect(new Set(names).size).toBe(names.length);
      // Each is the name the workbook gives it, even cut at a space.
      expect(names.map(sheetName)).toEqual(names);
      const cut = `${"x".repeat(30)} y`;
      expect(sheetName(cut)).toBe("x".repeat(30));
      expect(sheetName(sheetName(cut))).toBe(sheetName(cut));
    });

    it("lists an elective set's offerings (ELECT-6.3) and guards against formulas", () => {
      const view = opened();
      view.days[0].items = [
        ...view.days[0].items.slice(0, 2),
        { kind: "E", id: "e1", name: "=Chugim", gone: false },
        view.days[0].items[3]
      ];
      const [monday] = sheetsFor(
        view,
        { kind: "day", key: "0" },
        CATALOGUE,
        SETUP,
        t,
        new Map([["e1", ["Archery", "Drama"]]])
      );
      expect(monday.rows[1][2]).toBe("'=Chugim (Archery, Drama)");
      // A bunk's week, too.
      const [bunk2] = sheetsFor(
        view,
        { kind: "group", key: "g2" },
        CATALOGUE,
        SETUP,
        t,
        new Map([["e1", ["Archery", "Drama"]]])
      );
      expect(bunk2.rows[1][1]).toBe("'=Chugim (Archery, Drama)");
    });
  });
});
