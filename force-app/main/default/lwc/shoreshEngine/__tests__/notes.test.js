/**
 * The engine's notes kept with the saved week (notes.js, protocol 9.7): codes and Ids in, the same
 * words generateWeek gives out, in the camp's words now. Synthetic data only.
 */
import { buildTerms } from "c/shoreshTerms";
import { FIELD } from "c/shoreshSchema";
import {
  NOTES_MAX,
  notesOf,
  notesText,
  notesWithout,
  readNotes,
  whyOf
} from "c/shoreshEngine";

const terms = buildTerms([
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true },
  { term: "Week", singular: "Session", plural: "Sessions", isCustom: true }
]);
const INPUT = {
  groups: [
    { Id: "g1", Name: "Bunk 1" },
    { Id: "g2", Name: "Bunk 2" }
  ],
  activities: [
    { Id: "a1", Name: "Swim" },
    { Id: "a2", Name: "Arts" }
  ],
  locations: [{ Id: "l1", Name: "Pool" }]
};
// Above, Arts' groups at once and the Pool's groups that fit are blank (taken as 1); here both
// have been filled in since the build.
const FILLED = {
  ...INPUT,
  activities: INPUT.activities.map((a) => ({
    ...a,
    [FIELD.Activity.GroupsAtOnce]: 2
  })),
  locations: INPUT.locations.map((l) => ({
    ...l,
    [FIELD.Location.GroupsThatFit]: 3
  }))
};
const RESULT = {
  ok: true,
  openCells: [
    { date: "2026-06-29", groupId: "g1", blockId: "t2", why: "full" },
    {
      date: "2026-06-29",
      groupId: "g2",
      blockId: "t3",
      why: "minCost",
      shortGroupId: "g1",
      shortActivityId: "a1"
    }
  ],
  setupBlank: [
    { field: "atOnce", id: "a2" },
    { field: "fit", id: "l1" }
  ],
  floor: {
    importedName: "Last summer",
    imported: 12,
    built: 10,
    reason: "This Session has 10 cells filled; …"
  }
};

describe("the engine's notes kept with the week", () => {
  it("keeps codes and Ids, never sentences, and reads back the same", () => {
    const notes = notesOf(RESULT);
    expect(notes).toEqual({
      v: 1,
      open: [
        ["2026-06-29", "g1", "t2", "full"],
        ["2026-06-29", "g2", "t3", "minCost", "g1", "a1"]
      ],
      blank: [
        ["atOnce", "a2"],
        ["fit", "l1"]
      ],
      floor: { kind: "emptier", name: "Last summer", built: 10, imported: 12 },
      keep: null,
      mins: [],
      cut: 0
    });
    expect(readNotes(notesText(notes))).toEqual(notes);
  });

  it("says them in the camp's words and setup's names now", () => {
    const why = whyOf(notesOf(RESULT), INPUT, terms);
    expect([...why.open]).toEqual([
      ["2026-06-29|g1|t2", "Everything for Bunk 1 is taken then"],
      ["2026-06-29|g2|t3", "Filling it would leave Bunk 1 short of Swim"]
    ]);
    expect(why.notes).toEqual([
      "Arts: Groups at once is blank, so it counts as 1",
      "Pool: Groups that fit is blank, so it counts as 1",
      'This Session has 10 cells filled; the imported Session ("Last summer") has 12.'
    ]);
    // Renamed in setup since: the new name.
    const renamed = {
      ...INPUT,
      groups: [{ Id: "g1", Name: "Cabin A" }, INPUT.groups[1]]
    };
    expect(
      whyOf(notesOf(RESULT), renamed, terms).open.get("2026-06-29|g1|t2")
    ).toBe("Everything for Cabin A is taken then");
  });

  it("a blank setting filled in since is no longer listed; the other notes stay", () => {
    expect(whyOf(notesOf(RESULT), FILLED, terms).notes).toEqual([
      'This Session has 10 cells filled; the imported Session ("Last summer") has 12.'
    ]);
  });

  it("leaves out a row whose group, activity or place is gone from setup", () => {
    const why = whyOf(
      notesOf(RESULT),
      { groups: [INPUT.groups[1]], activities: [], locations: [] },
      terms
    );
    // Bunk 1's own cell goes; Bunk 2's says it plainly without the short group's name.
    expect([...why.open]).toEqual([
      [
        "2026-06-29|g2|t3",
        "Filling it would leave a Bunk short of a weekly minimum"
      ]
    ]);
    expect(why.notes).toHaveLength(1);
  });

  it("an imported week that no longer matches is kept as the frame note", () => {
    const notes = notesOf({
      ...RESULT,
      floor: { importedName: null, imported: null, built: 3, reason: "x" }
    });
    expect(notes.floor.kind).toBe("frame");
    expect(whyOf(notes, INPUT, terms).notes.pop()).toMatch(
      /no longer matches this Session's days/
    );
  });

  it("a very large week keeps what fits under the limit and says how many reasons were left out", () => {
    const openCells = Array.from({ length: 4000 }, (_, i) => ({
      date: "2026-06-29",
      groupId: `a0G00000000000${String(i).padStart(4, "0")}`,
      blockId: "a0B000000000001AAA",
      why: "searched"
    }));
    const notes = notesOf({ ok: true, openCells, setupBlank: [], floor: null });
    const text = notesText(notes);
    expect(text.length).toBeLessThanOrEqual(NOTES_MAX);
    expect(notes.cut).toBeGreaterThan(0);
    expect(notes.open.length + notes.cut).toBe(4000);
    expect(whyOf(notes, INPUT, terms).notes).toEqual([
      `${notes.cut} more Open cells' reasons weren't kept with this Session.`
    ]);
  });

  it("never reads notes of another shape: another version, damaged text, unknown codes", () => {
    expect(readNotes(null)).toBeNull();
    expect(readNotes("not json")).toBeNull();
    expect(readNotes('{"v":2,"open":[],"blank":[]}')).toBeNull();
    expect(
      readNotes(
        '{"v":1,"open":[["d","g","b","oops"],["d","g","b","full"],[1,2,3,4]],"blank":[["x","a"]],"floor":{"kind":"?"}}'
      )
    ).toEqual({
      v: 1,
      open: [["d", "g", "b", "full"]],
      blank: [],
      floor: null,
      keep: null,
      mins: [],
      cut: 0
    });
  });

  it("without the cells changed by hand; the same notes when none of them had a reason", () => {
    const notes = notesOf(RESULT);
    expect(notesWithout(notes, new Set(["2026-06-29|g1|t9"]))).toBe(notes);
    expect(notesWithout(notes, new Set(["2026-06-29|g1|t2"])).open).toEqual([
      ["2026-06-29", "g2", "t3", "minCost", "g1", "a1"]
    ]);
  });

  // Protocol 10.7 (Greg 2026-10-27): what a Rebuild that kept the week changed.
  it("says what a Rebuild that kept the week changed, and reads it back", () => {
    const at = (blockId) => ({ date: "2026-06-29", groupId: "g1", blockId });
    const keep = {
      emptied: [
        // Sports, deleted since: its name as it was.
        {
          ...at("t1"),
          activityId: "a9",
          name: "Sports",
          why: "gone",
          length: 2,
          refilled: true
        },
        {
          ...at("t4"),
          activityId: "a9",
          name: "Sports",
          why: "gone",
          length: 1,
          refilled: false
        },
        {
          ...at("t5"),
          activityId: "a2",
          name: "Arts",
          why: "weeklyMax",
          length: 1,
          refilled: true
        }
      ],
      moved: [
        {
          ...at("t6"),
          from: "a2",
          to: "a1",
          shortGroupId: "g1",
          shortActivityId: "a1",
          count: 2
        }
      ],
      changed: 6,
      filled: 1,
      fresh: false
    };
    const notes = notesOf({ ...RESULT, keep });
    expect(notes.keep).toEqual({
      emptied: [
        ["a9", "Sports", "gone", 3, 2, ""],
        ["a2", "Arts", "weeklyMax", 1, 1, ""]
      ],
      moved: [["2026-06-29", "g1", "t6", "g1", "a1", 2]],
      changed: 6,
      filled: 1,
      fresh: false
    });
    expect(readNotes(notesText(notes))).toEqual(notes);
    const input = {
      ...INPUT,
      days: [
        { dateValue: "2026-06-29", blocks: [{ id: "t6", name: "Period 6" }] }
      ]
    };
    expect(whyOf(notes, input, terms).notes.slice(-4)).toEqual([
      "Sports was removed, so its 3 cells were emptied and 2 refilled.",
      "Arts was over its weekly limit, so its cell was refilled.",
      "Bunk 1 · Monday · Period 6: moved so Bunk 1 still gets Swim twice.",
      "Filled 1 Open cell. Kept everything else as it was."
    ]);
    // Nothing changed: said once, plainly.
    const none = notesOf({
      ...RESULT,
      keep: { emptied: [], moved: [], changed: 0, filled: 0, fresh: false }
    });
    expect(whyOf(none, input, terms).notes.slice(-1)).toEqual([
      "Nothing in setup needed a change, so everything was kept as it was."
    ]);
    // A damaged keep note is not read.
    expect(
      readNotes('{"v":1,"open":[],"blank":[],"keep":{"emptied":"x"}}').keep
    ).toBeNull();
  });

  // Fix 4 and rule 10.9: the replacement is named; a week built fresh says so, never silent.
  it("names the activity that took a deleted one's cells, and says when the week was built fresh", () => {
    const keep = {
      emptied: [
        {
          date: "2026-06-29",
          groupId: "g1",
          blockId: "t1",
          activityId: "a9",
          name: "Drama",
          why: "gone",
          length: 1,
          refilled: true,
          with: "a1"
        },
        {
          date: "2026-06-29",
          groupId: "g1",
          blockId: "t2",
          activityId: "a9",
          name: "Drama",
          why: "gone",
          length: 1,
          refilled: true,
          with: "a1"
        }
      ],
      moved: [],
      changed: 2,
      filled: 0,
      fresh: false
    };
    const notes = notesOf({ ...RESULT, keep });
    expect(
      whyOf(readNotes(notesText(notes)), INPUT, terms).notes.slice(-2)
    ).toEqual([
      "Drama was removed; Swim took its 2 cells.",
      "Kept everything else as it was."
    ]);
    const fresh = notesOf({
      ...RESULT,
      keep: { emptied: [], moved: [], changed: 0, filled: 0, fresh: true }
    });
    expect(
      whyOf(readNotes(notesText(fresh)), INPUT, terms).notes.slice(-1)
    ).toEqual([
      "Couldn't keep your Session: it would have had fewer filled cells than the imported Session, so it was built fresh."
    ]);
  });
});
