/**
 * Areas of camp (ADR 0031 piece C; protocol GEN-4.6, CORE-6.21): a location may have an area. The
 * build prefers fewer back-to-back changes of area for a group as its last tie-break, after
 * every rule and preference it has, so a camp with no areas gets exactly the weeks it got
 * before. The Why list says a day a group changes area often, and never fixes it.
 */
import { generateWeek, measureWeek } from "c/shoreshEngine";
import { activity, at, block, camp, dateAt, group } from "./data/camp";
import { randomCamp, withHistory } from "./data/randomCamp";

const PLACES = [
  { id: "lake", fit: 10, area: "Lakefront" },
  { id: "dock", fit: 10, area: " lakefront " },
  { id: "field", fit: 10, area: "Upper fields" },
  { id: "hall", fit: 10, area: "" }
];

// The same places with no area set.
const NO_AREAS = PLACES.map((place) => ({ ...place, area: undefined }));

const GROUPS = Array.from({ length: 10 }, (_, i) => group(`g${i}`));

/**
 * Every group swims first each day; the second time block is the build's to fill (one day
 * unless told: across days, "had least" decides first).
 */
function swimThenOpen(places, cells = [], days = 1) {
  return camp({
    mode: "fillOpen",
    groups: GROUPS,
    blocks: [block(0), block(1)],
    days,
    locations: places,
    activities: [
      activity("Swim", { atOnce: null, location: "lake" }),
      activity("Canoe", { atOnce: null, location: "dock" }),
      activity("Soccer", { atOnce: null, location: "field" })
    ],
    cells: [
      ...GROUPS.flatMap((g) =>
        Array.from({ length: days }, (_, day) => ({
          day,
          group: g.id,
          block: "b0",
          act: "Swim"
        }))
      ),
      ...cells
    ]
  });
}

const placedAt = (result, d, b) => GROUPS.map((g) => at(result, d, g.id, b));

describe("Areas of camp", () => {
  // GEN-4.6: same area, capitals and spacing aside, beats a walk when nothing else decides.
  it("a group stays in its area when nothing else decides", () => {
    const result = generateWeek(swimThenOpen(PLACES));
    expect(result.ok).toBe(true);
    expect(placedAt(result, 0, 1)).toEqual(GROUPS.map(() => "Canoe"));
  });

  // GEN-4.6: without areas the same cells are decided by the stable key alone, so the test above
  // shows the areas deciding.
  it("without areas the stable key decides those cells", () => {
    const plain = generateWeek(swimThenOpen(NO_AREAS));
    expect(placedAt(plain, 0, 1)).toContain("Soccer");
    expect(placedAt(plain, 0, 1)).toContain("Canoe");
  });

  // GEN-4.6: a multi-block session goes on the day it walks least (4.3), as long as nothing
  // else decides; without areas, the stable key spreads the groups over both days.
  it("a multi-block session goes where it walks least", () => {
    const hikes = (places) =>
      camp({
        mode: "fillOpen",
        groups: GROUPS,
        blocks: [block(0), block(1), block(2)],
        days: 2,
        locations: places,
        activities: [
          activity("Swim", { atOnce: null, location: "lake", max: 0 }),
          activity("Soccer", { atOnce: null, location: "field", max: 0 }),
          activity("Hike", { atOnce: null, location: "dock", span: 2, min: 1 })
        ],
        cells: GROUPS.flatMap((g) => [
          { day: 0, group: g.id, block: "b0", act: "Swim" },
          { day: 1, group: g.id, block: "b0", act: "Soccer" }
        ])
      });
    expect(placedAt(generateWeek(hikes(PLACES)), 0, 1)).toEqual(
      GROUPS.map(() => "Hike")
    );
    const plain = generateWeek(hikes(NO_AREAS));
    expect(placedAt(plain, 1, 1)).toContain("Hike");
  });

  // GEN-4.6: last, after "the one the group has had least".
  it("a walk never costs an earlier preference", () => {
    const result = generateWeek(
      swimThenOpen(
        PLACES,
        GROUPS.map((g) => ({ day: 0, group: g.id, block: "b1", act: "Canoe" })),
        2
      )
    );
    expect(placedAt(result, 1, 1)).toEqual(GROUPS.map(() => "Soccer"));
  });

  // GEN-4.6: with no area set, or every place in one area, nothing is ever a walk.
  it("a camp builds exactly the same week with no areas or one area (60 random camps)", () => {
    const changed = [];
    for (let seed = 1; seed <= 60; seed++) {
      const spec = withHistory(randomCamp(seed), seed);
      const plain = JSON.stringify(generateWeek(camp(spec)));
      for (const area of ["", "Main camp"]) {
        const zoned = generateWeek(
          camp({
            ...spec,
            locations: spec.locations.map((l) => ({ ...l, area }))
          })
        );
        if (JSON.stringify(zoned) !== plain) {
          changed.push(`${seed}:${area}`);
        }
      }
    }
    expect(changed).toEqual([]);
  });

  // CORE-6.21
  it("the Why list says a day a group changes area twice or more, and passes over a place with none", () => {
    const result = generateWeek(
      camp({
        mode: "fillOpen",
        groups: [group("g1"), group("g2"), group("g3")],
        blocks: [block(0), block(1), block(2), block(3)],
        locations: PLACES,
        activities: [
          activity("Swim", { atOnce: null, location: "lake" }),
          activity("Canoe", { atOnce: null, location: "dock" }),
          activity("Soccer", { atOnce: null, location: "field" }),
          activity("Arts", { atOnce: null, location: "hall" }),
          activity("Song", { atOnce: null })
        ],
        cells: [
          // Lake, fields, lake, fields: three changes.
          { day: 0, group: "g1", block: "b0", act: "Swim" },
          { day: 0, group: "g1", block: "b1", act: "Soccer" },
          { day: 0, group: "g1", block: "b2", act: "Canoe" },
          { day: 0, group: "g1", block: "b3", act: "Soccer" },
          // Lake, no area, lake (another spelling), fields: one change, not said.
          { day: 0, group: "g2", block: "b0", act: "Swim" },
          { day: 0, group: "g2", block: "b1", act: "Arts" },
          { day: 0, group: "g2", block: "b2", act: "Canoe" },
          { day: 0, group: "g2", block: "b3", act: "Soccer" },
          // Fields, nothing set, lake, then fields again: two changes.
          { day: 0, group: "g3", block: "b0", act: "Soccer" },
          { day: 0, group: "g3", block: "b1", act: "Song" },
          { day: 0, group: "g3", block: "b2", act: "Swim" },
          { day: 0, group: "g3", block: "b3", act: "Soccer" }
        ]
      })
    );
    expect(result.walks).toEqual([
      {
        dateValue: dateAt(0),
        groupId: "g1",
        changes: 3,
        text: "Bunk g1 changes area 3 times on Monday"
      },
      {
        dateValue: dateAt(0),
        groupId: "g3",
        changes: 2,
        text: "Bunk g3 changes area 2 times on Monday"
      }
    ]);
    const look = measureWeek(result, []).look.filter((l) => l.kind === "walks");
    expect(look[0]).toMatchObject({
      key: `walks|${dateAt(0)}|g1|3`,
      same: `walks|${dateAt(0)}|g1`,
      size: 3,
      text: "Bunk g1 changes area 3 times on Monday",
      groupId: "g1",
      dateValue: dateAt(0)
    });
  });

  // CORE-6.21: a camp with no areas reads exactly as before.
  it("no areas, no walk lines", () => {
    const result = generateWeek(swimThenOpen(NO_AREAS));
    expect(result.walks).toBeUndefined();
  });
});
