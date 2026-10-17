import { buildProposal, questionCards } from "./data/engine";
import {
  cellName,
  dayOf,
  divisionInTitle,
  timeRange,
  withoutTimes,
  listedNames
} from "../text";
import { parseCsv, sheetToPages, distinctName, sharedPrefix } from "../sheets";
import { csv, samples, terms, findSamplesFrom } from "./data/samples";

findSamplesFrom(__dirname);

const at = (h, m = 0) => h * 60 + m;

describe("reading a cell", () => {
  it("reads times the way a day camp writes them", () => {
    expect(timeRange("9:00-9:45")).toMatchObject({
      start: at(9),
      end: at(9, 45)
    });
    expect(timeRange("Period 1 (9:00 - 9:45)")).toMatchObject({
      start: at(9),
      end: at(9, 45)
    });
    // A bare 1 to 6 is the afternoon; 7 to 11 the morning; 12 noon (desktop's camp-day rule).
    expect(timeRange("1:10 - 1:55")).toMatchObject({
      start: at(13, 10),
      end: at(13, 55)
    });
    expect(timeRange("11:30 - 12:15")).toMatchObject({
      start: at(11, 30),
      end: at(12, 15)
    });
    expect(timeRange("12:20 - 1:05")).toMatchObject({
      start: at(12, 20),
      end: at(13, 5)
    });
    expect(timeRange("1:30 - 2:15 PM")).toMatchObject({
      start: at(13, 30),
      end: at(14, 15)
    });
    expect(timeRange("11:30 - 12:15 PM")).toMatchObject({
      start: at(11, 30),
      end: at(12, 15)
    });
    expect(timeRange("14:00")).toMatchObject({ start: at(14), end: null });
    expect(timeRange("Period 2")).toBeNull();
    // A bare hour that starts a range (review finding 1).
    expect(timeRange("9 - 9:45am")).toMatchObject({
      start: at(9),
      end: at(9, 45)
    });
    expect(timeRange("9-10am")).toMatchObject({ start: at(9), end: at(10) });
    expect(timeRange("1-2pm")).toMatchObject({ start: at(13), end: at(14) });
    expect(timeRange("12-12:45")).toMatchObject({
      start: at(12),
      end: at(12, 45)
    });
    expect(timeRange("Period 1 - 2")).toBeNull();
  });

  it("takes times out of names", () => {
    expect(withoutTimes("Period 1 (9:00-9:45)")).toBe("Period 1");
    expect(withoutTimes("Lunch 11:30 - 12:15")).toBe("Lunch");
    expect(withoutTimes("9:00 to 9:45")).toBe("");
    expect(withoutTimes("Period 1 9-10am")).toBe("Period 1");
  });

  it("reads a name and its place, and skips what names nothing", () => {
    expect(cellName("Swim (Pool)")).toEqual({ name: "Swim", place: "Pool" });
    expect(cellName("Art @ Art room")).toEqual({
      name: "Art",
      place: "Art room"
    });
    expect(cellName("Lunch 12:00")).toEqual({ name: "Lunch", place: null });
    expect(cellName("")).toBeNull();
    expect(cellName("-")).toBeNull();
    expect(cellName("Change")).toBeNull();
    expect(cellName("12")).toBeNull();
  });

  it("knows days written in full or short", () => {
    expect(dayOf("MONDAY")).toBe("Monday");
    expect(dayOf("Tues")).toBe("Tuesday");
    expect(dayOf("Weds.")).toBe("Wednesday");
    expect(dayOf("Swim")).toBeNull();
    expect(dayOf("S")).toBeNull();
  });

  it("finds a division in a group's name only where the file says so", () => {
    expect(divisionInTitle("Juniors - Bunk 1")).toEqual({
      division: "Juniors",
      group: "Bunk 1"
    });
    expect(divisionInTitle("Yeladim 3")).toEqual({
      division: "Yeladim",
      group: "Yeladim 3"
    });
    expect(divisionInTitle("Bunk 3")).toEqual({
      division: null,
      group: "Bunk 3"
    });
    expect(divisionInTitle("2-3A")).toEqual({ division: null, group: "2-3A" });
  });

  it("lists the groups in a by-activity cell", () => {
    expect(listedNames("Bunk 1, Bunk 2")).toEqual(["Bunk 1", "Bunk 2"]);
    expect(listedNames("Bunk 1 & Bunk 2 / Bunk 3")).toEqual([
      "Bunk 1",
      "Bunk 2",
      "Bunk 3"
    ]);
  });
});

describe("reading a file", () => {
  it("reads comma-separated files, quotes and all", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"]
    ]);
    expect(parseCsv("a;b\n1;2")).toEqual([
      ["a", "b"],
      ["1", "2"]
    ]);
  });

  it("splits a sheet holding one day under another, with times beside the names", () => {
    const pages = sheetToPages({
      name: "Week",
      rows: [
        ["Monday"],
        ["Period", "Time", "Bunk 1", "Bunk 2"],
        ["Period 1", "9:00-9:45", "Swim", "Art"],
        ["Lunch", "12:00-12:45", "Lunch", "Lunch"],
        [],
        ["Tuesday"],
        ["Period", "Time", "Bunk 1", "Bunk 2"],
        ["Period 1", "9:00-9:45", "Art", "Swim"]
      ]
    });
    expect(pages.map((p) => p.title)).toEqual(["Monday", "Tuesday"]);
    expect(pages[0].columns).toEqual(["Bunk 1", "Bunk 2"]);
    expect(pages[0].rows.map((r) => r.label)).toEqual([
      "Period 1 9:00-9:45",
      "Lunch 12:00-12:45"
    ]);
  });

  it("reads divisions written over the group columns, and merged cells as blocks spanned", () => {
    const [page] = sheetToPages({
      name: "Monday",
      rows: [
        ["", "Juniors", "", "Seniors"],
        ["Time", "Bunk 1", "Bunk 2", "Bunk 3"],
        ["9:00-9:45", "Boating", "Art", "Swim"],
        ["9:50-10:35", "", "Swim", "Art"]
      ],
      merges: [{ s: { r: 2, c: 1 }, e: { r: 3, c: 1 } }]
    });
    expect(page.divisions).toEqual(["Juniors", "Juniors", "Seniors"]);
    expect(page.rows[0].spans).toEqual([2, 1, 1]);
  });

  it("names a group after its file, keeping a short code readable", () => {
    const names = ["Camp 2026 - Bunk 1.csv", "Camp 2026 - Bunk 2.csv"];
    expect(distinctName(names[0], sharedPrefix(names))).toBe("Bunk 1");
    expect(
      distinctName(
        "camp-bunk-1.csv",
        sharedPrefix(["camp-bunk-1.csv", "camp-bunk-2.csv"])
      )
    ).toBe("bunk 1");
    expect(
      distinctName(
        "Camp - Juniors - Bunk 1.csv",
        sharedPrefix([
          "Camp - Juniors - Bunk 1.csv",
          "Camp - Seniors - Bunk 3.csv"
        ])
      )
    ).toBe("Juniors - Bunk 1");
    expect(distinctName("Rainbows.xlsx", sharedPrefix(["Rainbows.xlsx"]))).toBe(
      "Rainbows"
    );
  });
});

describe("the three layouts", () => {
  const read = (files) =>
    buildProposal({ files, existing: null, terms, answers: {} });

  it.each([
    ["all-camp", "allCamp", 5],
    ["Bunk", "byGroup", 6],
    ["by-activity", "byActivity", 5]
  ])("recognises the %s sample as %s", (filter, layout, pages) => {
    const proposal = read(samples(filter));
    expect(proposal.reading.pages).toHaveLength(pages);
    expect(
      proposal.reading.pages.every((p) => p.layout === layout && p.confident)
    ).toBe(true);
  });

  it.each(["all-camp", "Bunk", "by-activity"])(
    "reads the same week from the %s sample",
    (filter) => {
      const proposal = read(samples(filter));
      expect(proposal.groups.map((g) => g.name)).toEqual([
        "Bunk 1",
        "Bunk 2",
        "Bunk 3",
        "Bunk 4",
        "Bunk 5",
        "Bunk 6"
      ]);
      expect(proposal.timetables[0].blocks.map((b) => b.name)).toEqual([
        "Period 1",
        "Period 2",
        "Period 3",
        "Lunch",
        "Period 4",
        "Period 5",
        "Period 6"
      ]);
      expect(proposal.fixed.map((f) => f.name)).toEqual(["Lunch"]);
      expect(proposal.recurring.map((r) => r.name)).toEqual([
        "Morning meeting"
      ]);
      expect(proposal.noted.map((n) => [n.name, n.kind])).toEqual([
        ["Chugim", "E"],
        ["Field day", "D"],
        ["Zoo trip", "T"]
      ]);
      const boating = proposal.activities.find((a) => a.name === "Boating");
      expect(boating.length).toBe(2);
    }
  );

  it("only the all-camp file says which bunks are Juniors and Seniors", () => {
    expect(read(samples("all-camp")).groups.map((g) => g.division)).toEqual([
      "Juniors",
      "Juniors",
      "Juniors",
      "Seniors",
      "Seniors",
      "Seniors"
    ]);
    expect(
      new Set(read(samples("Bunk")).groups.map((g) => g.division))
    ).toEqual(new Set(["Main"]));
  });

  it("the layout can be changed by the director, and is then read that way", () => {
    const files = samples("all-camp");
    const first = read(files);
    const layouts = Object.fromEntries(
      first.reading.pages.map((p) => [p.key, "byActivity"])
    );
    const changed = buildProposal({
      files,
      existing: null,
      terms,
      answers: {},
      layouts
    });
    expect(changed.reading.pages.every((p) => p.layout === "byActivity")).toBe(
      true
    );
    expect(changed.groups.map((g) => g.name)).toContain("Swim");
  });

  it("a page that does not say its day is read as nothing, and said so", () => {
    const proposal = read([
      csv("Camp.csv", [
        ["Time", "Bunk 1", "Bunk 2"],
        ["9:00-9:45", "Swim", "Art"]
      ])
    ]);
    expect(proposal.reading.pages[0].noDay).toBe(true);
    expect(proposal.reading.placements).toHaveLength(0);
  });

  it("a short change-over row with nothing in it is not a time block", () => {
    const proposal = read([
      csv("Monday.csv", [
        ["Time", "Bunk 1", "Bunk 2"],
        ["9:00-9:45", "Swim", "Art"],
        ["9:45-9:50", "Change", ""],
        ["9:50-10:35", "Art", "Swim"]
      ])
    ]);
    expect(proposal.timetables[0].blocks).toHaveLength(2);
  });
});

describe("files that cover the same week", () => {
  it("asks which is right where they disagree, and uses the answer", () => {
    const files = [...samples("all-camp"), ...samples("Bunk")];
    const first = buildProposal({ files, existing: null, terms, answers: {} });
    expect(first.reading.disagreements).toHaveLength(1);
    const [d] = first.reading.disagreements;
    expect(d).toMatchObject({
      group: "Bunk 3",
      day: "Tuesday",
      block: "Period 2"
    });
    expect(d.versions.map((v) => v.text).sort()).toEqual(["Art", "Soccer"]);
    const answered = buildProposal({
      files,
      existing: null,
      terms,
      answers: { [d.id]: "Soccer" }
    });
    const cell = answered.reading.placements.filter(
      (p) =>
        p.group === "Bunk 3" && p.day === "Tuesday" && p.blockKey === "590-635"
    );
    expect(cell.map((p) => p.text)).toEqual(["Soccer"]);
  });

  it("files that agree raise nothing", () => {
    const files = [...samples("all-camp"), ...samples("by-activity")];
    expect(
      buildProposal({ files, existing: null, terms, answers: {} }).reading
        .disagreements
    ).toEqual([]);
  });
});

describe("times the review found misread (PR 15 review, finding 4)", () => {
  it("reads ranges of bare hours", () => {
    expect(timeRange("9-10")).toMatchObject({ start: at(9), end: at(10) });
    expect(timeRange("12-1")).toMatchObject({ start: at(12), end: at(13) });
    expect(timeRange("Lunch 12-1")).toMatchObject({
      start: at(12),
      end: at(13)
    });
    expect(timeRange("Period 1 - 2")).toBeNull();
    expect(timeRange("Bunk 3-4")).toBeNull();
  });

  it("a 5 or 6 o'clock block without AM or PM is asked about, never guessed (round 2)", () => {
    const rows = [
      ["Time", "Bunk 1", "Bunk 2"],
      ["7:00-8:00", "Early care", "Early care"],
      ["9:00-9:45", "Swim", "Art"],
      ["6:00-6:30", "Late pickup", "Late pickup"]
    ];
    const files = ["Monday", "Tuesday"].map((d) => csv(`${d}.csv`, rows));
    const first = buildProposal({ files, existing: null, terms, answers: {} });
    const card = questionCards(first, terms, {}).find((c) =>
      c.id.startsWith("ampm|")
    );
    expect(card.title).toBe(
      "Is Late pickup 6:00\u20136:30 in the morning or the evening?"
    );
    expect(card.stage).toBe("preview");
    expect(card.answer).toBeNull();
    expect(card.options.map((o) => o.label)).toEqual([
      "In the morning (6:00\u20136:30 AM)",
      "In the evening (6:00\u20136:30 PM)",
      "Leave it out for now"
    ]);
    const evening = buildProposal({
      files,
      existing: null,
      terms,
      answers: { [card.id]: "evening" }
    });
    expect(evening.timetables[0].blocks.map((b) => b.start)).toEqual([
      at(7),
      at(9),
      at(18)
    ]);
    const morning = buildProposal({
      files,
      existing: null,
      terms,
      answers: { [card.id]: "morning" }
    });
    expect(morning.timetables[0].blocks.map((b) => b.start)).toEqual([
      at(6),
      at(7),
      at(9)
    ]);
    const left = buildProposal({
      files,
      existing: null,
      terms,
      answers: { [card.id]: "leaveOut" }
    });
    expect(left.activities.map((x) => x.name)).not.toContain("Late pickup");
  });

  it("Periods 1-2 and Period 1-2 are not times", () => {
    expect(timeRange("Periods 1-2")).toBeNull();
    expect(timeRange("Period 1-2")).toBeNull();
  });
});
