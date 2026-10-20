import { problemLines, publishQuestion, publishedWord } from "c/shoreshPublish";
import { buildTerms } from "c/shoreshTerms";

// What to ask before publishing, from the server's preview and the week's checks.

const t = buildTerms([]);
const CLEAN = {
  cells: { filled: 10, total: 10 },
  flags: new Map(),
  overlapping: [],
  stillNeeded: [],
  spread: [],
  hasCoverageTargets: true,
  hasSpreadTargets: true
};
const FIRST = { revisions: "r1", published: null, changes: [], changeCount: 0 };
const AGAIN = {
  revisions: "r2",
  published: { id: "pub1", publishedAt: "2026-10-18T10:00:00.000Z" },
  changes: ["Bunk 1 · Monday · Period 2: Swim → Soccer"],
  changeCount: 1
};

describe("c/shoreshPublish", () => {
  it("names nothing for a finished week", () => {
    expect(problemLines(CLEAN)).toEqual([]);
    expect(problemLines(null)).toEqual([]);
  });

  it("names Filled while cells are Open, dots and each counter above 0, in the counters' words", () => {
    expect(
      problemLines({
        ...CLEAN,
        cells: { filled: 7, total: 10 },
        flags: new Map([
          ["k1", "Over its weekly limit"],
          ["k2", "Twice today"]
        ]),
        overlapping: [{}],
        stillNeeded: ["a", "b"],
        spread: ["c"]
      })
    ).toEqual([
      "Filled: 7 of 10",
      "2 activities need a look.",
      "Overlapping: 1",
      "Still needed: 2",
      "Spread across the week: 1"
    ]);
  });

  it("says one in the singular", () => {
    expect(
      problemLines({
        ...CLEAN,
        cells: { filled: 0, total: 1 },
        flags: new Map([["k1", "x"]])
      })
    ).toEqual(["Filled: 0 of 1", "1 activity needs a look."]);
  });

  it("leaves out a counter the camp has no targets for, as the screen does", () => {
    expect(
      problemLines({
        ...CLEAN,
        stillNeeded: ["a"],
        spread: ["b"],
        hasCoverageTargets: false,
        hasSpreadTargets: false
      })
    ).toEqual([]);
  });

  it("counts the counters' lines as they show them, accepted lines aside", () => {
    const shortOfTargets = { ...CLEAN, stillNeeded: ["a", "b"], spread: ["c"] };
    const allAccepted = { overlapping: 0, stillNeeded: 0, spread: 0 };
    expect(problemLines(shortOfTargets, allAccepted)).toEqual([]);
    expect(
      problemLines(shortOfTargets, { ...allAccepted, stillNeeded: 1 })
    ).toEqual(["Still needed: 1"]);
    expect(
      publishQuestion({
        preview: FIRST,
        checked: shortOfTargets,
        counts: allAccepted,
        weekName: "Week 1",
        t
      })
    ).toEqual({ kind: "now" });
  });

  it("publishes a finished week's first publish at once", () => {
    expect(
      publishQuestion({ preview: FIRST, checked: CLEAN, weekName: "Week 1", t })
    ).toEqual({ kind: "now" });
  });

  it("asks before a first publish with something still to do", () => {
    const question = publishQuestion({
      preview: FIRST,
      checked: { ...CLEAN, cells: { filled: 9, total: 10 } },
      weekName: "Week 1",
      t
    });
    expect(question).toEqual({
      kind: "ask",
      heading: "Publish Week 1?",
      lines: ["Filled: 9 of 10"],
      confirmLabel: "Publish"
    });
  });

  it("asks before publishing again, listing what changes, even for a finished week", () => {
    const question = publishQuestion({
      preview: AGAIN,
      checked: CLEAN,
      weekName: "Week 1",
      t
    });
    expect(question.heading).toBe("Publish Week 1 again?");
    expect(question.lines).toEqual([
      "This replaces the published schedule. 1 cell changes:",
      "Bunk 1 · Monday · Period 2: Swim → Soccer"
    ]);
  });

  it("says how many more changes there are than it lists, then what is still to do", () => {
    const question = publishQuestion({
      preview: { ...AGAIN, changeCount: 31, moreLines: 30 },
      checked: { ...CLEAN, overlapping: [{}, {}] },
      weekName: "Week 1",
      t: buildTerms([
        {
          term: "PublishedSchedule",
          singular: "Posted plan",
          plural: "Posted plans",
          isCustom: true
        }
      ])
    });
    expect(question.lines).toEqual([
      "This replaces the Posted plan. 31 cells change:",
      "Bunk 1 · Monday · Period 2: Swim → Soccer",
      "…and 30 more.",
      "Overlapping: 2"
    ]);
  });

  it("counts cells but says how many more lines there are, when lines cover several cells", () => {
    // One line covers Period 1 – Period 3 (3 cells); 4 more lines, 6 cells, aren't listed.
    const question = publishQuestion({
      preview: {
        ...AGAIN,
        changes: ["Bunk 1 · Monday · Period 1 – Period 3: Swim → Soccer"],
        changeCount: 9,
        moreLines: 4
      },
      checked: CLEAN,
      weekName: "Week 1",
      t
    });
    expect(question.lines).toEqual([
      "This replaces the published schedule. 9 cells change:",
      "Bunk 1 · Monday · Period 1 – Period 3: Swim → Soccer",
      "…and 4 more."
    ]);
  });

  it("says a rename as a name, never as a cell", () => {
    const renamed = (preview) =>
      publishQuestion({
        preview: { ...AGAIN, ...preview },
        checked: CLEAN,
        weekName: "Week 1",
        t
      }).lines[0];
    expect(
      renamed({
        changes: ["Renamed: Group A → Bunk Aleph"],
        changeCount: 1,
        renameCount: 1
      })
    ).toBe("This replaces the published schedule. 1 name changes:");
    expect(renamed({ changeCount: 3, renameCount: 2 })).toBe(
      "This replaces the published schedule. 1 cell and 2 names change:"
    );
    // A time block at new times (Update to match setup), in the camp's word for it.
    expect(renamed({ changeCount: 1, retimeCount: 1 })).toBe(
      "This replaces the published schedule. 1 time block changes:"
    );
    expect(renamed({ changeCount: 5, renameCount: 1, retimeCount: 2 })).toBe(
      "This replaces the published schedule. 2 cells, 1 name and 2 time blocks change:"
    );
  });

  it("says one more line when just one isn't listed", () => {
    const question = publishQuestion({
      preview: { ...AGAIN, changeCount: 2, moreLines: 1 },
      checked: CLEAN,
      weekName: "Week 1",
      t
    });
    expect(question.lines).toEqual([
      "This replaces the published schedule. 2 cells change:",
      "Bunk 1 · Monday · Period 2: Swim → Soccer",
      "…and 1 more."
    ]);
  });

  it("names dots in the camp's word for Activity", () => {
    const campT = buildTerms([
      {
        term: "Activity",
        singular: "Program",
        plural: "Programs",
        isCustom: true
      }
    ]);
    const dots = (n) => ({
      ...CLEAN,
      flags: new Map(Array.from({ length: n }, (_, i) => [`k${i}`, "x"]))
    });
    expect(
      publishQuestion({
        preview: FIRST,
        checked: dots(1),
        weekName: "Week 1",
        t: campT
      }).lines
    ).toEqual(["1 Program needs a look."]);
    expect(
      publishQuestion({
        preview: FIRST,
        checked: dots(2),
        weekName: "Week 1",
        t: campT
      }).lines
    ).toEqual(["2 Programs need a look."]);
  });

  it("has nothing to do when the published schedule already is the week", () => {
    expect(
      publishQuestion({
        preview: { ...AGAIN, changes: [], changeCount: 0 },
        checked: { ...CLEAN, cells: { filled: 1, total: 10 } },
        weekName: "Week 1",
        t
      })
    ).toEqual({ kind: "same" });
  });

  it("names the screen a week was published from, as its copy records it", () => {
    expect(publishedWord({ origin: "Manual" })).toBe(
      "Published from Manual Build "
    );
    expect(publishedWord({ origin: "Generated" })).toBe(
      "Published from Generated Schedule "
    );
    // Published before Origin was kept, or by an import: no screen to name.
    expect(publishedWord({ origin: null })).toBe("Published ");
    expect(publishedWord({ origin: "Imported" })).toBe("Published ");
    expect(publishedWord(null)).toBe("Published ");
  });
});
